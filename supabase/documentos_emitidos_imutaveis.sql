-- =============================================================================
-- DOCUMENTOS OFICIAIS SÃO IMUTÁVEIS NO SERVIDOR (19/09/2026)
-- =============================================================================
--
-- PRINCÍPIO: arquivo imutável sozinho não basta. Depois que um documento passa
-- a ser oficial, os METADADOS que o descrevem também congelam — senão o Portal
-- e o histórico mostrariam o PDF antigo com dados novos.
--
-- UMA regra central (`guardar_documento_emitido`), três tipos de documento:
--
--   A. CERTIFICADO INTERNO EMITIDO — `nr13_calibracao_item_<id>` com
--      status 'emitido' e `emissao.pdfRef`.
--   B. CALIBRAÇÃO DE TERCEIRO (laboratório externo) — `origem: 'terceiro'` e
--      status diferente de 'rascunho'. Hoje ela nasce oficial ao "Registrar"
--      (não há rascunho de terceiro); se um dia houver, o rascunho fica livre.
--   C. RELATÓRIO FINALIZADO — `nr13_rel_<id>_<TAG>` com status diferente de
--      'Rascunho' (ausente = finalizado, como em `relatorios/tipos.ts`).
--
-- E a REPRESENTAÇÃO de cada um nas listas que o Portal e as telas leem:
--
--   `nr13_calibracoes_<TAG>`       — entrada oficial (A ou B) fica, idêntica.
--   `nr13_historico_indice_<TAG>`  — entrada de relatório finalizado fica, com
--                                    os mesmos dados (só o rótulo `nome` muda).
--   `nr13_historico_relatorios`    — legado: entrada finalizada fica, idêntica.
--
-- Nas listas, SÓ a entrada oficial é conferida: rascunhos e itens novos da
-- mesma lista continuam livres.
--
-- O QUE CONTINUA PERMITIDO
--   - a própria oficialização (rascunho → emitido/finalizado);
--   - regravar o MESMO valor (re-sincronização idempotente);
--   - relatório: renomear (`nome` é rótulo da lista, não conteúdo) e, só no
--     relatório LEGADO sem `pdfRef`, o retrofit do §7-bis que ACRESCENTA
--     os snapshots que faltavam (`meta.assinantes/empresa/certCalibracoes/
--     rastreabIds`) — nunca troca um que já existe;
--   - manutenção AUTORIZADA (`nr13_manutencao_autorizada()`, abaixo).
--
-- BYPASS DE MANUTENÇÃO — não basta o GUC `nr13.manutencao = '1'`.
--   `nr13_manutencao_autorizada()` exige o GUC E um contexto que não seja
--   requisição de usuário: sessão direta (SQL Editor, pg_cron: session_user
--   não é `authenticator`) ou requisição com claims de `service_role` (as
--   rotinas `purgar_dados_*`, `coletar_tombstones`, `reconciliar_versoes_org`,
--   que já exigem service_role antes de gravar o GUC). Requisição com claims
--   `authenticated`/`anon` nunca passa, ainda que o GUC esteja ligado.
--
-- ARQUIVOS: as pastas `relatorios/`, `certificados/`, `certificados-calibracao/`
--   e `certificados-externos/` do bucket `inspecao` perdem UPDATE e DELETE por
--   usuário. O app só grava nelas no momento oficial e sempre em caminho novo
--   (uuid); ninguém as remove.
--
-- IDEMPOTENTE. Não reescreve nenhum registro de `app_storage`; a única escrita é
-- refazer a PROJEÇÃO derivada `calibracoes_index` das TAGs que têm rascunho.
-- Rollback: `documentos_emitidos_imutaveis_rollback.sql`.
-- =============================================================================

begin;

-- ── Bypass de manutenção: GUC + contexto que não é usuário ──────────────────
create or replace function public.nr13_manutencao_autorizada()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_papel text;
begin
  if coalesce(current_setting('nr13.manutencao', true), '') <> '1' then
    return false;
  end if;
  begin
    v_papel := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    return false;  -- claims ilegíveis: não se concede nada
  end;
  -- Requisição de usuário pelas APIs: nunca é manutenção.
  if coalesce(v_papel, '') in ('authenticated', 'anon') then
    return false;
  end if;
  -- Pela API (PostgREST/Edge a sessão é `authenticator`), só o service_role.
  if session_user::text = 'authenticator' and coalesce(v_papel, '') <> 'service_role' then
    return false;
  end if;
  return true;
end $$;

-- ── O que é oficial, por tipo ────────────────────────────────────────────────
create or replace function public.nr13_calibracao_emitida(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(v->>'status', '') = 'emitido'
     and coalesce(v->'emissao'->'pdfRef'->>'path', '') <> '';
$$;

create or replace function public.nr13_calibracao_oficial(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'object'
     and (
       public.nr13_calibracao_emitida(v)
       or (coalesce(v->>'origem', '') = 'terceiro' and coalesce(v->>'status', '') <> 'rascunho')
     );
$$;

create or replace function public.nr13_relatorio_finalizado(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'object'
     and coalesce(v->>'id', '') <> ''
     and coalesce(v->>'status', '') <> 'Rascunho';
$$;

-- Valor "vazio" em JSON: ausente, null ou "". O índice de relatórios é
-- remontado por versões diferentes do app, que escrevem o campo vazio ora como
-- "" ora omitindo a chave — isso não é alteração do documento.
create or replace function public.nr13_json_vazio(x jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select x is null or x = 'null'::jsonb or x = '""'::jsonb;
$$;

-- Dois objetos descrevem o mesmo documento: toda chave (fora `p_ignorar`) tem
-- o mesmo valor, contando vazio = vazio.
create or replace function public.nr13_mesmo_documento(a jsonb, b jsonb, p_ignorar text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object'
     and not exists (
       select 1
         from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) ks
        where not (ks.k = any (p_ignorar))
          and not (
            (public.nr13_json_vazio(a -> ks.k) and public.nr13_json_vazio(b -> ks.k))
            or (a -> ks.k) = (b -> ks.k)
          )
     );
$$;

-- Relatório finalizado: o que uma regravação pode mudar.
create or replace function public.nr13_relatorio_regravacao_permitida(antigo jsonb, novo jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_meta_antiga jsonb := antigo -> 'meta';
  v_meta_nova   jsonb := novo -> 'meta';
  k text;
begin
  if jsonb_typeof(novo) <> 'object' then
    return false;
  end if;
  -- Retrofit do §7-bis: só em relatório LEGADO (sem arquivo), só para
  -- snapshot que ainda não existia.
  if coalesce(antigo->'pdfRef'->>'path', '') = ''
     and jsonb_typeof(v_meta_antiga) = 'object' and jsonb_typeof(v_meta_nova) = 'object' then
    foreach k in array array['assinantes', 'empresa', 'certCalibracoes', 'rastreabIds'] loop
      if public.nr13_json_vazio(v_meta_antiga -> k) then
        v_meta_antiga := v_meta_antiga - k;
        v_meta_nova   := v_meta_nova - k;
      end if;
    end loop;
  end if;
  return (novo - 'nome' - 'meta') = (antigo - 'nome' - 'meta')
     and v_meta_nova is not distinct from v_meta_antiga;
end $$;

-- ── A guarda ─────────────────────────────────────────────────────────────────
create or replace function public.guardar_documento_emitido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_antigo  jsonb;
  v_novo    jsonb;
  v_ent     jsonb;
  v_vivo    boolean;
begin
  v_familia := case
    when old.chave like 'nr13\_calibracao\_item\_%'   then 'cal_item'
    when old.chave like 'nr13\_calibracoes\_%'        then 'cal_lista'
    when old.chave like 'nr13\_rel\_%'                then 'rel'
    when old.chave like 'nr13\_historico\_indice\_%'  then 'rel_indice'
    when old.chave = 'nr13_historico_relatorios'      then 'rel_legado'
  end;
  if v_familia is null or public.nr13_manutencao_autorizada() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  begin
    v_antigo := old.valor::jsonb;
  exception when others then
    return case when tg_op = 'DELETE' then old else new end;
  end;
  if v_antigo is null or v_antigo = 'null'::jsonb then
    return case when tg_op = 'DELETE' then old else new end;  -- tombstone: nada a proteger
  end if;

  -- Continua viva depois da escrita? (DELETE físico e tombstone da RPC não.)
  v_vivo := tg_op = 'UPDATE' and new.deletado_em is null;
  if v_vivo then
    begin
      v_novo := new.valor::jsonb;
    exception when others then
      v_novo := null;
    end;
  end if;

  -- ── A e B: o registro da calibração ─────────────────────────────────────────
  if v_familia = 'cal_item' then
    if not public.nr13_calibracao_oficial(v_antigo) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    if v_vivo and v_novo = v_antigo then
      return new;
    end if;
    raise exception
      'nr13_documento_emitido: o certificado de calibração % é oficial (emitido ou de laboratório externo) e não pode ser alterado nem excluído. Para corrigir, registre uma revisão.', old.chave
      using errcode = 'P0001';
  end if;

  -- ── C: o registro do relatório ──────────────────────────────────────────────
  if v_familia = 'rel' then
    if not public.nr13_relatorio_finalizado(v_antigo) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    if v_vivo and v_novo is not null and public.nr13_relatorio_regravacao_permitida(v_antigo, v_novo) then
      return new;
    end if;
    raise exception
      'nr13_documento_emitido: o relatório % já foi finalizado e não pode ser alterado nem excluído. Para corrigir, duplique-o.', old.chave
      using errcode = 'P0001';
  end if;

  -- ── As listas: só a entrada oficial é conferida ─────────────────────────────
  if jsonb_typeof(v_antigo) <> 'array' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  for v_ent in
    select e from jsonb_array_elements(v_antigo) e
     where case v_familia
             when 'cal_lista' then public.nr13_calibracao_oficial(e)
             else public.nr13_relatorio_finalizado(e)
           end
  loop
    if not v_vivo or v_novo is null or jsonb_typeof(v_novo) <> 'array' then
      raise exception
        'nr13_documento_emitido: a lista % contém documento oficial (%) e não pode ser excluída.', old.chave, v_ent->>'id'
        using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_novo) n
       where n->>'id' = v_ent->>'id'
         and case v_familia
               when 'rel_indice' then public.nr13_mesmo_documento(v_ent, n, array['nome'])
               else n = v_ent
             end
    ) then
      raise exception
        'nr13_documento_emitido: a lista % perderia ou alteraria o documento oficial %.', old.chave, v_ent->>'id'
        using errcode = 'P0001';
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke all on function public.guardar_documento_emitido() from public, anon, authenticated;

drop trigger if exists trg_guardar_documento_emitido on public.app_storage;
create trigger trg_guardar_documento_emitido
  before update or delete on public.app_storage
  for each row execute function public.guardar_documento_emitido();

-- ── Rotinas de manutenção: só service_role ───────────────────────────────────
-- Elas já recusam quem não é service_role antes de ligar o GUC; o EXECUTE para
-- `anon` (herdado do default privilege do Supabase, que os `revoke ... from
-- public, authenticated` originais não tiraram) é superfície sem uso.
do $$
declare f text;
begin
  foreach f in array array[
    'public.coletar_tombstones(uuid, integer)',
    'public.reconciliar_versoes_org(uuid)',
    'public.purgar_dados_trial(integer)',
    'public.purgar_dados_por_email(text[])'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

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

-- ── Conferência (somente leitura) ────────────────────────────────────────────
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.app_storage'::regclass and tgname = 'trg_guardar_documento_emitido';
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname in ('inspecao_atualizacao', 'inspecao_remocao');
