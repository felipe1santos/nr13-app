-- ============================================================================
-- FASE 9 · 9B — ROLLBACK da manutenção da projeção na RPC
-- ============================================================================
--
-- Restaura `aplicar_mutacao_storage` para a versão ANTERIOR à 9B — a que grava
-- a verdade e NÃO toca em projeção nenhuma.
--
-- É o rollback mais importante da fase: a 9B é a primeira subfase que mexe no
-- caminho crítico de escrita. Aplicar este arquivo devolve o comportamento
-- anterior sem tocar em dado nenhum.
--
-- As projeções continuam EXISTINDO depois deste rollback — só param de ser
-- mantidas, e passam a divergir. É por isso que `auditar_projecao()` vai
-- acusar. Para desfazer a 9A também, aplicar `busca_index_rollback.sql`
-- DEPOIS deste arquivo: a ordem importa, RPC primeiro, tabelas depois.
--
-- Extraído por `pg_get_functiondef` do banco ANTES da alteração — é a definição
-- exata que estava rodando, não uma reconstrução de memória.
-- ============================================================================

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
