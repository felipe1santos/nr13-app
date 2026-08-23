-- ============================================================================
-- FASE 9 · 9B — A PROJEÇÃO PASSA A SER MANTIDA PELA RPC
-- ============================================================================
--
-- Desenho §6: docs/superpowers/specs/2026-08-22-fase9-escala-busca-design.md
-- Rollback:   supabase/busca_index_rpc_rollback.sql
--
-- ORDEM DE APLICAÇÃO: armazenamento_v2.sql → busca_index.sql →
-- busca_manutencao.sql → ESTE ARQUIVO.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A ÚNICA MUDANÇA NA RPC
--
--   Um bloco ADITIVO, inserido DEPOIS de a verdade estar persistida e ANTES do
--   `v_res := aplicado`. Nenhuma linha da semântica empresarial foi reescrita:
--   idempotência por mutation_id, reivindicação sob concorrência, piso de
--   versão, conflito, tombstone, checagem de papel/assinatura e formato do
--   retorno estão **idênticos** à versão anterior.
--
--   O corpo veio de `pg_get_functiondef` do banco, não de reescrita à mão —
--   é a garantia de que nada mais mudou.
--
-- POR QUE A PROJEÇÃO LÊ EM VEZ DE RECEBER PARÂMETRO
--
--   `projetar_equipamento` relê `app_storage` dentro da MESMA transação. Então
--   ela projeta, por construção, a VERSÃO EFETIVAMENTE PERSISTIDA — não há como
--   projetar algo que não virou verdade. Uma mutação recusada (conflito, versão
--   obsoleta, sem permissão) retorna antes e nunca chega aqui.
--
--   É mais forte do que passar `v_nova` por parâmetro: parâmetro pode divergir
--   do que foi gravado; releitura não pode.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Despachante: qual projeção esta chave afeta?
-- ---------------------------------------------------------------------------
-- FALHA FECHADA SOBRE SI MESMA (exigência do dono): chave de família
-- desconhecida, legada ou futura simplesmente NÃO projeta. A verdade segue a
-- semântica empresarial existente, sem interferência da camada derivada.
--
-- E se as tabelas de projeção ainda não existirem — organização não migrada —
-- a função retorna em silêncio. É o fallback que permite fazer deploy sem
-- depender de backfill completo (invariante I11).
create or replace function public.projetar_chave(p_org uuid, p_chave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  -- Organização sem projeção: nada a fazer, e isso NÃO é erro.
  if to_regclass('public.equipamentos_index') is null then
    return;
  end if;

  if p_chave like 'nr13_historico_indice_%' then
    v_tag := substring(p_chave from 23);
    if v_tag <> '' then perform public.projetar_relatorios(p_org, v_tag); end if;
    return;
  end if;

  -- Famílias que compõem a linha do equipamento. Qualquer uma delas reprojeta
  -- a TAG inteira: é mais barato do que mapear chave→campo, e converge igual.
  --
  -- `nr13_info_` é a que MANDA — ela define existência. Quando é excluída,
  -- `projetar_equipamento` apaga a linha da projeção, e o equipamento deixa de
  -- ser pesquisável. É assim que não sobra "fantasma pesquisável".
  if p_chave like 'nr13_info_%'  then v_tag := substring(p_chave from 11);
  elsif p_chave like 'nr13_cat_%'   then v_tag := substring(p_chave from 10);
  elsif p_chave like 'nr13_emp_%'   then v_tag := substring(p_chave from 10);
  elsif p_chave like 'nr13_vida_%'  then v_tag := substring(p_chave from 11);
  elsif p_chave like 'nr13_fotos_%' then v_tag := substring(p_chave from 12);
  else
    return;  -- família não projetável: comportamento empresarial normal
  end if;

  if v_tag <> '' then
    perform public.projetar_equipamento(p_org, v_tag);
  end if;
end;
$$;

revoke all on function public.projetar_chave(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A RPC, com o bloco de projeção
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_mutacao_storage(p_chave text, p_mutation_id uuid, p_op text, p_valor text, p_versao_esperada integer, p_dispositivo text, p_mutado_em timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org         uuid;
  v_user        uuid := auth.uid();
  v_res         jsonb;
  v_piso        integer;
  v_atual       public.app_storage%rowtype;
  v_nova        integer;
  v_reivindicou boolean := false;
  v_tentativa   integer;
  v_existia     boolean := false;
begin
  -- Sessao anonima nao grava nada.
  if v_user is null then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  if p_op not in ('set','del') or p_chave is null or p_chave = '' then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  v_org := public.org_atual();
  if v_org is null then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- Redundante com org_atual() (que ja le o profile de auth.uid()), mantido
  -- como assercao explicita de que o usuario pertence a organizacao afetada.
  if not exists (
    select 1 from public.profiles p where p.id = v_user and p.org_id = v_org
  ) then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- IDEMPOTENCIA, caminho rapido: mutacao ja concluida devolve o resultado.
  select m.resultado into v_res
    from public.app_storage_mutacoes m
   where m.org_id = v_org and m.mutation_id = p_mutation_id;
  if found and v_res->>'status' is distinct from 'processando' then
    return v_res || jsonb_build_object('status','repetido');
  end if;

  -- security definer IGNORA RLS: papel, prazo e assinatura sao re-checados aqui.
  if public.papel_atual() not in ('mestre','gerente','funcionario')
     or not public.acesso_vigente()
     or not public.assinatura_permite_escrita() then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- IDEMPOTENCIA SOB CONCORRENCIA: reivindica a mutacao ANTES de aplicar.
  -- Duas chamadas simultaneas com o mesmo mutation_id: uma insere a linha de
  -- reivindicacao e aplica; a outra bloqueia no lock da PK (FOR SHARE) ate a
  -- primeira confirmar e devolve o resultado registrado, sem reaplicar e sem
  -- erro de chave duplicada. Se a primeira desfizer, a linha some e a segunda
  -- reivindica na segunda volta do laco.
  for v_tentativa in 1..2 loop
    insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
    values (v_org, p_mutation_id, jsonb_build_object('status','processando'))
    on conflict (org_id, mutation_id) do nothing;

    if found then
      v_reivindicou := true;
      exit;
    end if;

    v_res := null;
    select m.resultado into v_res
      from public.app_storage_mutacoes m
     where m.org_id = v_org and m.mutation_id = p_mutation_id
     for share;                       -- bloqueia ate a outra transacao decidir

    if v_res is not null and v_res->>'status' is distinct from 'processando' then
      return v_res || jsonb_build_object('status','repetido');
    end if;
  end loop;

  if not v_reivindicou then
    -- Outra transacao ficou com a reivindicacao e nao concluiu: o cliente
    -- reenvia o MESMO mutation_id e cai no caminho rapido acima.
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- NAO existe checagem por p_mutado_em em lugar nenhum desta funcao.
  v_nova := p_versao_esperada + 1;

  -- PISO DE VERSAO: chave ja excluida nao volta com versao antiga. Monotonico
  -- e permanente (app_storage_excluidos nunca e podada).
  select e.versao_final into v_piso
    from public.app_storage_excluidos e
   where e.org_id = v_org and e.chave = p_chave;

  if v_piso is not null and v_nova <= v_piso then
    v_res := jsonb_build_object('status','recusado','motivo','versao_obsoleta','versao', v_piso);
    update public.app_storage_mutacoes m set resultado = v_res
     where m.org_id = v_org and m.mutation_id = p_mutation_id;
    return v_res;
  end if;

  select * into v_atual
    from public.app_storage s
   where s.org_id = v_org and s.chave = p_chave
   for update;

  v_existia := found;

  if v_existia then
    -- CONFLITO: alguem gravou entre a leitura do cliente e este envio.
    -- Devolve a linha vigente para o cliente preservar AS DUAS versoes.
    if v_atual.versao <> p_versao_esperada then
      v_res := jsonb_build_object(
        'status','conflito',
        'versao', v_atual.versao,
        'valor', v_atual.valor,
        'atualizado_em', v_atual.atualizado_em,
        'dispositivo', v_atual.dispositivo,
        'deletado_em', v_atual.deletado_em);
      update public.app_storage_mutacoes m set resultado = v_res
       where m.org_id = v_org and m.mutation_id = p_mutation_id;
      return v_res;
    end if;

    -- Tombstone ainda nao coletado: decidido por VERSAO, nao por data. O caso
    -- de escrita antiga ja foi barrado pelo piso acima; se chegou aqui com a
    -- versao casando, e recriacao legitima e segue adiante.
    if v_atual.deletado_em is not null and v_piso is not null and v_nova <= v_piso then
      v_res := jsonb_build_object('status','recusado','motivo','tombstone_mais_novo',
                                  'versao', v_atual.versao);
      update public.app_storage_mutacoes m set resultado = v_res
       where m.org_id = v_org and m.mutation_id = p_mutation_id;
      return v_res;
    end if;
  else
    -- Cliente esperava uma linha que nao existe mais.
    if p_versao_esperada <> 0 then
      v_res := jsonb_build_object('status','conflito','versao', 0, 'valor', null);
      update public.app_storage_mutacoes m set resultado = v_res
       where m.org_id = v_org and m.mutation_id = p_mutation_id;
      return v_res;
    end if;
  end if;

  -- APLICACAO. Criacao e atualizacao sao comandos DIFERENTES de proposito:
  -- "insert ... on conflict do update" na criacao faria a segunda criacao
  -- simultanea SOBRESCREVER a primeira em silencio, que e exatamente o que a
  -- versao esperada existe para impedir. FOR UPDATE nao tranca linha que ainda
  -- nao existe, entao a corrida e resolvida pela unique constraint e a
  -- perdedora vira CONFLITO.
  --
  -- A marca nr13.via_rpc e ligada AQUI e desligada logo apos a escrita, nao no
  -- inicio da funcao. set_config(..., true) vale para a TRANSACAO inteira, nao
  -- para a chamada: marcada cedo, ela continuaria ligada depois do return e
  -- qualquer escrita direta na mesma transacao passaria pela guarda como se
  -- fosse da RPC. O gate de 05/08/2026 pegou exatamente isso (cenarios 11-13).
  begin
    perform set_config('nr13.via_rpc', '1', true);

    if p_op = 'set' then
      if v_existia then
        update public.app_storage s
           set valor             = p_valor,
               versao            = v_nova,
               dispositivo       = p_dispositivo,
               deletado_em       = null,
               atualizado_em     = now(),
               mutado_em_cliente = p_mutado_em
         where s.org_id = v_org and s.chave = p_chave;
      else
        insert into public.app_storage
          (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em, mutado_em_cliente)
        values
          (v_org, v_user, p_chave, p_valor, v_nova, p_dispositivo, null, now(), p_mutado_em);
      end if;
    else
      if v_existia then
        update public.app_storage s
           set valor             = null,
               versao            = v_nova,
               dispositivo       = p_dispositivo,
               deletado_em       = now(),
               atualizado_em     = now(),
               mutado_em_cliente = p_mutado_em
         where s.org_id = v_org and s.chave = p_chave;
      else
        insert into public.app_storage
          (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em, mutado_em_cliente)
        values
          (v_org, v_user, p_chave, null, v_nova, p_dispositivo, now(), now(), p_mutado_em);
      end if;

      -- A PROVA da exclusao nasce agora, nao na coleta fisica.
      insert into public.app_storage_excluidos (org_id, chave, versao_final)
      values (v_org, p_chave, v_nova)
      on conflict (org_id, chave) do update
        set versao_final = greatest(public.app_storage_excluidos.versao_final, excluded.versao_final),
            excluido_em  = now();
    end if;

    perform set_config('nr13.via_rpc', '0', true);

  exception when unique_violation then
    perform set_config('nr13.via_rpc', '0', true);

    -- Corrida de criacao: outra transacao inseriu a mesma chave entre a nossa
    -- verificacao e o insert. A vencedora fica; esta vira conflito, com a linha
    -- dela devolvida para o cliente preservar as duas versoes.
    select * into v_atual
      from public.app_storage s
     where s.org_id = v_org and s.chave = p_chave;

    v_res := jsonb_build_object(
      'status','conflito',
      'versao', coalesce(v_atual.versao, 0),
      'valor', v_atual.valor,
      'atualizado_em', v_atual.atualizado_em,
      'dispositivo', v_atual.dispositivo,
      'deletado_em', v_atual.deletado_em);
    update public.app_storage_mutacoes m set resultado = v_res
     where m.org_id = v_org and m.mutation_id = p_mutation_id;
    return v_res;
  end;


  -- ======================================================================
  -- FASE 9 · MANUTENCAO DA PROJECAO DE BUSCA — ADITIVA, NUNCA BLOQUEANTE
  -- ======================================================================
  --
  -- Chegou aqui = a VERDADE JA ESTA PERSISTIDA. Nada abaixo pode desfaze-la.
  --
  -- NIVEL 2 · projecao, em subtransacao propria (BEGIN..EXCEPTION = savepoint).
  --   Se falhar, o rollback vai so ate o savepoint DESTE bloco. A escrita em
  --   app_storage, feita acima, permanece.
  --
  -- NIVEL 3 · pendencia, com savepoint PROPRIO dentro do handler do nivel 2.
  --   E este aninhamento que fecha a brecha: sem ele, uma falha ao gravar a
  --   pendencia escaparia do handler acima e abortaria a transacao inteira,
  --   derrubando a verdade. O handler interno e null — e null nao levanta.
  --
  -- A GARANTIA de convergencia NAO e a pendencia: e auditar_projecao(), que
  -- compara source_version direto nas duas tabelas e funciona mesmo que este
  -- registro nunca tenha acontecido.
  begin
    perform public.projetar_chave(v_org, p_chave);
  exception when others then
    begin
      insert into public.busca_pendencias (org_id, chave, motivo, criado_em)
      values (v_org, p_chave, left(coalesce(sqlerrm, '?'), 500), now())
      on conflict (org_id, chave) do update
        set tentativas = public.busca_pendencias.tentativas + 1,
            motivo     = excluded.motivo;
    exception when others then
      null;  -- fim da linha. A auditoria detecta sem depender desta linha.
    end;
  end;
  v_res := jsonb_build_object('status','aplicado','versao', v_nova);
  update public.app_storage_mutacoes m set resultado = v_res
   where m.org_id = v_org and m.mutation_id = p_mutation_id;
  return v_res;
end $function$

;

revoke all on function
  public.aplicar_mutacao_storage(text, uuid, text, text, integer, text, timestamptz)
  from public;
grant execute on function
  public.aplicar_mutacao_storage(text, uuid, text, text, integer, text, timestamptz)
  to authenticated;
