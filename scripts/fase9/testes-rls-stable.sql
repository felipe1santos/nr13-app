-- ============================================================================
-- VALIDAÇÃO ISOLADA · funções auxiliares da RLS como STABLE
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v modo=volatile -f - < scripts/fase9/testes-rls-stable.sql
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v modo=stable   -f - < scripts/fase9/testes-rls-stable.sql
--
-- Rode as DUAS e compare as saídas. O resultado funcional precisa ser
-- IDÊNTICO; só o desempenho pode mudar.
--
-- NÃO tem relação com a Fase 9: não depende de `busca_v9`, das projeções nem
-- da 9C. É mudança isolada, com rollback próprio
-- (`supabase/rls_funcoes_estaveis_rollback.sql`).
--
-- A massa é criada e removida pelo próprio arquivo, em organizações próprias.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set A     '00000000-4515-4000-8000-00000000000a'
\set A2    '00000000-4515-4000-8000-00000000aa02'
\set B     '00000000-4515-4000-8000-00000000000b'
\set CLI   '00000000-4515-4000-8000-00000000000c'
\set ADM   '00000000-4515-4000-8000-00000000000d'
\set VENC  '00000000-4515-4000-8000-00000000000e'

-- ---------------------------------------------------------------------------
-- Volatilidade sob teste
-- ---------------------------------------------------------------------------
\if :{?modo}
\else
  \set modo 'stable'
\endif

-- Aplica o modo pedido às SEIS funções da cadeia. O `psql` não tem `if` sobre o
-- VALOR de uma variável, então o comando é montado em SQL e executado por
-- `\gset` — que evita duplicar o arquivo inteiro só para trocar uma palavra.
select case when :'modo' = 'volatile' then
  'alter function public.org_atual() volatile;
   alter function public.papel_atual() volatile;
   alter function public.is_admin() volatile;
   alter function public.acesso_vigente() volatile;
   alter function public.assinatura_status_org() volatile;
   alter function public.assinatura_permite_escrita() volatile;'
else
  'alter function public.org_atual() stable;
   alter function public.papel_atual() stable;
   alter function public.is_admin() stable;
   alter function public.acesso_vigente() stable;
   alter function public.assinatura_status_org() stable;
   alter function public.assinatura_permite_escrita() stable;'
end as cmd \gset
:cmd

-- ---------------------------------------------------------------------------
-- Massa
-- ---------------------------------------------------------------------------
begin;
set local nr13.manutencao = '1';

delete from public.app_storage where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.app_storage_excluidos where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.equipamentos_index where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.profiles where id in (:'A'::uuid, :'A2'::uuid, :'B'::uuid, :'CLI'::uuid, :'ADM'::uuid, :'VENC'::uuid);
delete from auth.users where id in (:'A'::uuid, :'A2'::uuid, :'B'::uuid, :'CLI'::uuid, :'ADM'::uuid, :'VENC'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'A'::uuid,    'rlsA@local.test'),
               (:'A2'::uuid,   'rlsA2@local.test'),
               (:'B'::uuid,    'rlsB@local.test'),
               (:'CLI'::uuid,  'rlsC@local.test'),
               (:'ADM'::uuid,  'rlsAdm@local.test'),
               (:'VENC'::uuid, 'rlsVenc@local.test')) u(id, email);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano,
                             acesso_expira_em, assinatura_status, assinatura_ate)
values
  -- mestre da org A
  (:'A'::uuid,    'rlsA@local.test',    :'A'::uuid, 'mestre',  true, 'user',  'completo', null, 'ativa', null),
  -- sub-login da MESMA org A: mesmo org_id, papel diferente
  (:'A2'::uuid,   'rlsA2@local.test',   :'A'::uuid, 'usuario', true, 'user',  'completo', null, 'ativa', null),
  -- mestre da org B
  (:'B'::uuid,    'rlsB@local.test',    :'B'::uuid, 'mestre',  true, 'user',  'completo', null, 'ativa', null),
  -- cliente do Portal, vinculado à org A
  (:'CLI'::uuid,  'rlsC@local.test',    :'A'::uuid, 'cliente', true, 'user',  'completo', null, 'ativa', null),
  -- superadmin
  (:'ADM'::uuid,  'rlsAdm@local.test',  :'ADM'::uuid,'mestre', true, 'admin', 'completo', null, 'ativa', null),
  -- conta com PRAZO VENCIDO e assinatura em somente_leitura
  (:'VENC'::uuid, 'rlsVenc@local.test', :'VENC'::uuid,'mestre',true, 'user',  'completo',
   now() - interval '10 days', 'somente_leitura', now() - interval '10 days')
on conflict (id) do update set
  org_id = excluded.org_id, papel = excluded.papel, ativo = true,
  role = excluded.role, plano = excluded.plano,
  acesso_expira_em = excluded.acesso_expira_em,
  assinatura_status = excluded.assinatura_status,
  assinatura_ate = excluded.assinatura_ate;

insert into public.app_storage (org_id, user_id, chave, valor, versao, atualizado_em)
values (:'A'::uuid,    :'A'::uuid,    'nr13_info_RLS-A1', '{"tag":"RLS-A1"}', 1, now()),
       (:'A'::uuid,    :'A'::uuid,    'nr13_info_RLS-A2', '{"tag":"RLS-A2"}', 1, now()),
       (:'B'::uuid,    :'B'::uuid,    'nr13_info_RLS-B1', '{"tag":"RLS-B1"}', 1, now()),
       (:'VENC'::uuid, :'VENC'::uuid, 'nr13_info_RLS-V1', '{"tag":"RLS-V1"}', 1, now());

insert into public.equipamentos_index (org_id, tag, descricao, tipo, source_version, source_updated_at)
values (:'A'::uuid, 'RLS-A1', 'da org A', 'vaso', 1, now()),
       (:'A'::uuid, 'RLS-A2', 'da org A', 'vaso', 1, now()),
       (:'B'::uuid, 'RLS-B1', 'da org B', 'vaso', 1, now());
commit;
\set QUIET off

\echo ''
\echo '################ MODO:' :modo '################'
select p.proname,
       case p.provolatile when 's' then 'STABLE' when 'v' then 'VOLATILE' end as volatilidade
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('org_atual','papel_atual','is_admin','acesso_vigente',
                     'assinatura_status_org','assinatura_permite_escrita')
 order by 1;

-- ---------------------------------------------------------------------------
-- A BATERIA. Cada linha é (quem, o quê) → resultado.
-- ---------------------------------------------------------------------------
create or replace function public.tmp_rls_bateria()
returns table (ator text, prova text, resultado text)
language plpgsql
as $$
declare
  v_sub  uuid;
  v_nome text;
  v_n    bigint;
  v_txt  text;
  -- Marca "a operação passou" ANTES do `raise` que desfaz o bloco. Variável de
  -- PL/pgSQL não é transacional: sobrevive ao rollback do savepoint, e é assim
  -- que se distingue "recusado pela RLS" de "desfeito por mim de propósito".
  v_ok   boolean;
  atores text[][] := array[
    ['00000000-4515-4000-8000-00000000000a', 'mestre org A'],
    ['00000000-4515-4000-8000-00000000aa02', 'sub-login org A'],
    ['00000000-4515-4000-8000-00000000000b', 'mestre org B'],
    ['00000000-4515-4000-8000-00000000000c', 'cliente Portal'],
    ['00000000-4515-4000-8000-00000000000d', 'superadmin'],
    ['00000000-4515-4000-8000-00000000000e', 'conta VENCIDA'],
    ['00000000-0000-0000-0000-0000000000ff', 'sub INEXISTENTE']
  ];
  i int;
begin
  for i in 1 .. array_length(atores, 1) loop
    v_sub  := atores[i][1]::uuid;
    v_nome := atores[i][2];

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sub::text, 'role', 'authenticated')::text, true);

    -- 1 · as próprias funções auxiliares
    begin
      select coalesce(public.org_atual()::text, '(nulo)') into v_txt;
    exception when others then v_txt := 'ERRO'; end;
    ator := v_nome; prova := '1 org_atual()'; resultado := v_txt; return next;

    begin
      select coalesce(public.papel_atual(), '(nulo)') into v_txt;
    exception when others then v_txt := 'ERRO'; end;
    ator := v_nome; prova := '2 papel_atual()'; resultado := v_txt; return next;

    begin
      select public.is_admin()::text into v_txt;
    exception when others then v_txt := 'ERRO'; end;
    ator := v_nome; prova := '3 is_admin()'; resultado := v_txt; return next;

    begin
      select public.acesso_vigente()::text into v_txt;
    exception when others then v_txt := 'ERRO'; end;
    ator := v_nome; prova := '4 acesso_vigente()'; resultado := v_txt; return next;

    begin
      select public.assinatura_permite_escrita()::text into v_txt;
    exception when others then v_txt := 'ERRO'; end;
    ator := v_nome; prova := '5 assinatura_permite_escrita()'; resultado := v_txt; return next;

    -- 2 · SELECT em app_storage: quantas linhas ENXERGA, e de quem
    begin
      select count(*) into v_n from public.app_storage where chave like 'nr13_info_RLS-%';
      select coalesce(string_agg(distinct right(chave, 6), ','), '(nada)') into v_txt
        from public.app_storage where chave like 'nr13_info_RLS-%';
    exception when others then v_n := -1; v_txt := 'ERRO'; end;
    ator := v_nome; prova := '6 SELECT app_storage'; resultado := v_n || ' -> ' || v_txt; return next;

    -- 3 · SELECT na projeção da 9A
    begin
      select count(*) into v_n from public.equipamentos_index where tag like 'RLS-%';
      select coalesce(string_agg(distinct tag, ','), '(nada)') into v_txt
        from public.equipamentos_index where tag like 'RLS-%';
    exception when others then v_n := -1; v_txt := 'ERRO'; end;
    ator := v_nome; prova := '7 SELECT equipamentos_index'; resultado := v_n || ' -> ' || v_txt; return next;

    -- 4 · ESCRITA DIRETA (a guarda tem de recusar quando for o caso)
    v_ok := false;
    begin
      insert into public.app_storage (org_id, user_id, chave, valor, versao, atualizado_em)
      values (public.org_atual(), v_sub, 'nr13_info_RLS-DIRETO', '{}', 1, now());
      v_ok := true;
      raise exception 'desfaz';
    exception when others then
      v_txt := case when v_ok then 'PASSOU' else 'recusado' end;
    end;
    ator := v_nome; prova := '8 INSERT direto'; resultado := v_txt; return next;

    v_ok := false;
    begin
      update public.app_storage set valor = '{"x":1}' where chave = 'nr13_info_RLS-A1';
      get diagnostics v_n = row_count;
      v_ok := true;
      raise exception 'desfaz';
    exception when others then
      v_txt := case when v_ok then 'afetou ' || v_n else 'recusado' end;
    end;
    ator := v_nome; prova := '9 UPDATE direto'; resultado := v_txt; return next;

    v_ok := false;
    begin
      delete from public.app_storage where chave = 'nr13_info_RLS-A2';
      get diagnostics v_n = row_count;
      v_ok := true;
      raise exception 'desfaz';
    exception when others then
      v_txt := case when v_ok then 'afetou ' || v_n else 'recusado' end;
    end;
    ator := v_nome; prova := '10 DELETE direto'; resultado := v_txt; return next;

    -- 5 · a RPC (o caminho oficial de escrita)
    v_ok := false;
    begin
      select (public.aplicar_mutacao_storage(
                'nr13_info_RLS-RPC', gen_random_uuid(), 'set',
                '{"tag":"RLS-RPC","tipo":"vaso"}', 0, 'teste', now()) ->> 'status')
        into v_txt;
      v_ok := true;
      raise exception 'desfaz';
    exception when others then
      if not v_ok then v_txt := 'recusado: ' || left(sqlerrm, 40); end if;
    end;
    ator := v_nome; prova := '11 RPC aplicar_mutacao'; resultado := coalesce(v_txt, '(nulo)'); return next;

    -- 6 · a consulta da 9C
    begin
      select count(*) into v_n from public.buscar_equipamentos('', null, null, null, 200);
    exception when others then v_n := -1; end;
    ator := v_nome; prova := '12 RPC buscar_equipamentos'; resultado := v_n::text; return next;

    perform set_config('role', 'postgres', true);
  end loop;

  -- 7 · anon, sem sessão nenhuma
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into v_n from public.app_storage where chave like 'nr13_info_RLS-%';
    v_txt := v_n::text;
  exception when others then v_txt := 'recusado'; end;
  ator := 'anon'; prova := '6 SELECT app_storage'; resultado := v_txt; return next;

  begin
    select count(*) into v_n from public.equipamentos_index where tag like 'RLS-%';
    v_txt := v_n::text;
  exception when others then v_txt := 'recusado'; end;
  ator := 'anon'; prova := '7 SELECT equipamentos_index'; resultado := v_txt; return next;

  begin
    select count(*) into v_n from public.buscar_equipamentos('', null, null, null, 200);
    v_txt := v_n::text;
  exception when others then v_txt := 'recusado'; end;
  ator := 'anon'; prova := '12 RPC buscar_equipamentos'; resultado := v_txt; return next;

  perform set_config('role', 'postgres', true);
  return;
end;
$$;

\echo ''
\echo '──────────────── RESULTADO FUNCIONAL ────────────────'
select ator, prova, resultado from public.tmp_rls_bateria() order by ator, prova;

-- ---------------------------------------------------------------------------
-- TROCA DE SESSÃO ENTRE STATEMENTS, na MESMA conexão.
-- ---------------------------------------------------------------------------
-- É o risco que STABLE poderia introduzir se o Postgres guardasse o resultado
-- além da instrução. Ele não guarda: STABLE vale DENTRO de uma instrução.
\echo ''
\echo '──────────────── TROCA DE SESSÃO NA MESMA CONEXÃO ────────────────'
do $$
declare v_a uuid; v_b uuid; v_c uuid;
begin
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', '{"sub":"00000000-4515-4000-8000-00000000000a","role":"authenticated"}', true);
  select public.org_atual() into v_a;

  perform set_config('request.jwt.claims', '{"sub":"00000000-4515-4000-8000-00000000000b","role":"authenticated"}', true);
  select public.org_atual() into v_b;

  perform set_config('request.jwt.claims', '{"sub":"00000000-4515-4000-8000-00000000000a","role":"authenticated"}', true);
  select public.org_atual() into v_c;

  perform set_config('role', 'postgres', true);

  if v_a <> v_b and v_a = v_c then
    raise notice 'PASSA — trocar de sessão entre statements muda o resultado (A=% B=% A=%)',
      right(v_a::text,4), right(v_b::text,4), right(v_c::text,4);
  else
    raise notice 'FALHA — o resultado NAO acompanhou a troca de sessao (% / % / %)', v_a, v_b, v_c;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- CUSTO — o motivo de tudo isto
-- ---------------------------------------------------------------------------
\echo ''
\echo '──────────────── CUSTO DE LEITURA ────────────────'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"6721e0d7-4229-4b7d-b495-05677f574d45","role":"authenticated"}';
explain (analyze, buffers, costs off, timing off)
select chave from public.app_storage
 where org_id = '6721e0d7-4229-4b7d-b495-05677f574d45' order by chave limit 1000;
rollback;

drop function if exists public.tmp_rls_bateria();

-- ---------------------------------------------------------------------------
-- Limpeza
-- ---------------------------------------------------------------------------
\set QUIET on
begin;
set local nr13.manutencao = '1';
delete from public.app_storage where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.app_storage_excluidos where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.equipamentos_index where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid);
delete from public.org_sync where org_id in (:'A'::uuid, :'B'::uuid, :'VENC'::uuid, :'ADM'::uuid);
delete from public.profiles where id in (:'A'::uuid, :'A2'::uuid, :'B'::uuid, :'CLI'::uuid, :'ADM'::uuid, :'VENC'::uuid);
delete from auth.users where id in (:'A'::uuid, :'A2'::uuid, :'B'::uuid, :'CLI'::uuid, :'ADM'::uuid, :'VENC'::uuid);
commit;
\set QUIET off
\echo '(massa de teste removida)'
