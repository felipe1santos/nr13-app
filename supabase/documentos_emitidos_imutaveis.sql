-- =============================================================================
-- DOCUMENTOS EMITIDOS SÃO IMUTÁVEIS NO SERVIDOR (19/09/2026)
-- =============================================================================
--
-- O QUE PROTEGE
--
--   1. O CERTIFICADO DE CALIBRAÇÃO EMITIDO (`nr13_calibracao_item_<id>` com
--      status = 'emitido'). Até aqui a recusa de editar/excluir morava só no
--      aplicativo (`calibracaoService.salvarCalibracao`): uma chamada à RPC
--      `aplicar_mutacao_storage` pelo console reescrevia o registro — responsável,
--      datas, resultados, pdfRef, SHA — ou o marcava como excluído.
--
--   2. A CÓPIA dele na lista do equipamento (`nr13_calibracoes_<TAG>`), que é o
--      que o Portal do Cliente lê. A lista pode ganhar e perder RASCUNHOS e
--      receber calibrações novas; uma entrada EMITIDA precisa continuar lá,
--      idêntica.
--
--   3. OS ARQUIVOS finais no bucket `inspecao`: as pastas `relatorios/`,
--      `certificados/` (padrões), `certificados-calibracao/` e
--      `certificados-externos/` deixam de aceitar UPDATE e DELETE por usuário.
--      O app sempre grava esses arquivos em caminho NOVO (uuid) e nunca os
--      remove; só as fotos são removidas, e essas continuam liberadas.
--
-- COMO (o mesmo desenho de `livro_imutavel.sql`)
--
--   Trigger BEFORE UPDATE / BEFORE DELETE em `public.app_storage`. Pega todos os
--   caminhos de escrita: a RPC (que faz UPDATE, e cuja exclusão é UPDATE com
--   `deletado_em`), PostgREST direto e SQL. A mensagem começa com
--   `nr13_documento_emitido`, que o cliente classifica como RECUSA DEFINITIVA
--   (`errosSync.ts`) — a fila para de retentar em vez de ficar em "1 falha".
--
--   Permitido:
--     - rascunho → emitido (a própria emissão);
--     - regravar o emitido com o MESMO conteúdo (re-sincronização idempotente);
--     - manutenção explícita: `set local nr13.manutencao = '1'`;
--     - DELETE físico da organização inteira pelo `service_role` (exclusão de
--       conta no Admin, purga de trial, coleta de tombstones).
--   Recusado: qualquer outra mudança no valor, voltar para rascunho, marcar como
--   excluído, apagar a linha, tirar a entrada emitida da lista.
--
-- IDEMPOTENTE. Não reescreve nenhum registro de `app_storage` (a trava só vale para
-- as próximas escritas); a única escrita é refazer a PROJEÇÃO derivada
-- `calibracoes_index` das TAGs que têm rascunho. Rollback: `documentos_emitidos_imutaveis_rollback.sql`.
-- =============================================================================

begin;

create or replace function public.nr13_calibracao_emitida(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(v->>'status', '') = 'emitido'
     and coalesce(v->'emissao'->'pdfRef'->>'path', '') <> '';
$$;

create or replace function public.guardar_documento_emitido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antigo jsonb;
  v_novo   jsonb;
  v_ent    jsonb;
begin
  if old.chave not like 'nr13\_calibracao\_item\_%' and old.chave not like 'nr13\_calibracoes\_%' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if current_setting('nr13.manutencao', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- Remoção física da organização inteira (Admin, purga) roda como service_role.
    if coalesce(current_setting('request.jwt.claims', true), '')::text <> ''
       and (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' then
      return old;
    end if;
  end if;

  begin
    v_antigo := old.valor::jsonb;
  exception when others then
    return case when tg_op = 'DELETE' then old else new end;
  end;
  if v_antigo is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- ── o registro da calibração ────────────────────────────────────────────────
  if old.chave like 'nr13\_calibracao\_item\_%' then
    if not public.nr13_calibracao_emitida(v_antigo) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    if tg_op = 'UPDATE' and new.deletado_em is null then
      begin
        v_novo := new.valor::jsonb;
      exception when others then
        v_novo := null;
      end;
      if v_novo is not null and v_novo = v_antigo then
        return new;
      end if;
    end if;
    raise exception
      'nr13_documento_emitido: o certificado de calibração % já foi emitido e não pode ser alterado nem excluído. Para corrigir, emita uma revisão.', old.chave
      using errcode = 'P0001';
  end if;

  -- ── a lista do equipamento ──────────────────────────────────────────────────
  if jsonb_typeof(v_antigo) <> 'array' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_antigo) e where public.nr13_calibracao_emitida(e)) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.deletado_em is null then
    begin
      v_novo := new.valor::jsonb;
    exception when others then
      v_novo := null;
    end;
    if v_novo is not null and jsonb_typeof(v_novo) = 'array' then
      -- Toda entrada emitida do valor antigo precisa estar no novo, idêntica.
      for v_ent in select e from jsonb_array_elements(v_antigo) e where public.nr13_calibracao_emitida(e) loop
        if not exists (select 1 from jsonb_array_elements(v_novo) n where n = v_ent) then
          raise exception
            'nr13_documento_emitido: a lista % perderia ou alteraria o certificado emitido %.', old.chave, v_ent->>'id'
            using errcode = 'P0001';
        end if;
      end loop;
      return new;
    end if;
  end if;
  raise exception
    'nr13_documento_emitido: a lista % contém certificado emitido e não pode ser excluída.', old.chave
    using errcode = 'P0001';
end $$;

drop trigger if exists trg_guardar_documento_emitido on public.app_storage;
create trigger trg_guardar_documento_emitido
  before update or delete on public.app_storage
  for each row execute function public.guardar_documento_emitido();

-- ── Vencimentos: rascunho não é calibração realizada ─────────────────────────
-- A projeção que alimenta o painel de vencimentos (`calibracoes_index`) deixa
-- de receber rascunhos. Mesma função de `busca_manutencao.sql`, com o filtro.
create or replace function public.projetar_calibracoes(p_org uuid, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista  jsonb;
  v_versao integer;
  v_atual  timestamptz;
begin
  if to_regclass('public.calibracoes_index') is null then
    return;  -- organização sem a migração da 9D: nada a fazer, e não é erro
  end if;

  select public.f9_json(s.valor), s.versao, s.atualizado_em
    into v_lista, v_versao, v_atual
    from public.app_storage s
   where s.org_id = p_org
     and s.chave = 'nr13_calibracoes_' || p_tag
     and s.deletado_em is null;

  delete from public.calibracoes_index where org_id = p_org and tag = p_tag;

  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then
    return;
  end if;

  insert into public.calibracoes_index (
    org_id, calibracao_id, tag, componente_id, nome, tipo, serie,
    data_calibracao, prox_calibracao, source_version, source_updated_at, projected_at
  )
  select
    p_org,
    c ->> 'id',
    p_tag,
    -- Chave do componente com o MESMO recuo do TypeScript: `componenteId`, e
    -- na falta dele `nome:<nome|id>`. É por ela que a tela agrupa.
    coalesce(
      nullif(btrim(coalesce(c ->> 'componenteId', '')), ''),
      'nome:' || coalesce(nullif(btrim(coalesce(c ->> 'nome', '')), ''), c ->> 'id')
    ),
    nullif(btrim(coalesce(c ->> 'nome', '')), ''),
    nullif(btrim(coalesce(c ->> 'tipo', '')), ''),
    nullif(btrim(coalesce(c ->> 'serie', '')), ''),
    public.f9_data(c ->> 'dataCalibracao'),
    public.f9_data(c ->> 'dataProxCalibracao'),
    v_versao,
    v_atual,
    now()
  from jsonb_array_elements(v_lista) c
  where coalesce(c ->> 'id', '') <> ''
    -- 19/09/2026 · RASCUNHO não é calibração realizada: não gera prazo no
    -- painel. Vale o emitido, o de laboratório externo e o legado (sem status).
    and coalesce(c ->> 'status', '') <> 'rascunho'
  on conflict (org_id, calibracao_id) do update set
    tag = excluded.tag, componente_id = excluded.componente_id,
    nome = excluded.nome, tipo = excluded.tipo, serie = excluded.serie,
    data_calibracao = excluded.data_calibracao,
    prox_calibracao = excluded.prox_calibracao,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    projected_at = excluded.projected_at;
end;
$$;

revoke all on function public.projetar_calibracoes(uuid, text) from public, anon, authenticated;

-- Reprojeta SÓ as TAGs cuja lista tem rascunho hoje (antes deste bundle não
-- existia status; em produção o laço não encontra nada).
do $$
declare r record;
begin
  if to_regclass('public.calibracoes_index') is null then return; end if;
  for r in
    select s.org_id, substring(s.chave from 18) as tag
      from public.app_storage s
     where s.chave like 'nr13\_calibracoes\_%'
       and s.deletado_em is null
       and s.valor like '%"status":"rascunho"%'
  loop
    perform public.projetar_calibracoes(r.org_id, r.tag);
  end loop;
end $$;

-- ── Storage: arquivos finais não se sobrescrevem nem se apagam ─────────────────
drop policy if exists inspecao_atualizacao on storage.objects;
create policy inspecao_atualizacao on storage.objects for update
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and coalesce((storage.foldername(name))[2], '') not in
        ('relatorios', 'certificados', 'certificados-calibracao', 'certificados-externos')
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

drop policy if exists inspecao_remocao on storage.objects;
create policy inspecao_remocao on storage.objects for delete
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and coalesce((storage.foldername(name))[2], '') not in
        ('relatorios', 'certificados', 'certificados-calibracao', 'certificados-externos')
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

commit;

select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.app_storage'::regclass and tgname = 'trg_guardar_documento_emitido';
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'inspecao%'
 order by policyname;
