-- ============================================================================
-- FASE 9 · 9E — BENCHMARK DE `/relatorios` EM ESCALA
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/bench-9e.sql
--
-- Aplicar antes: supabase/busca_relatorios.sql
--
-- MEDE a busca em 1.000 · 5.000 · 10.000 · 20.000 · 50.000 relatórios, e
-- responde a UMA pergunta: **o custo cresce com o acervo?**
--
-- > **NENHUM PDF É CRIADO AQUI.** A massa é só METADADO — `pdf_ref` é uma
-- > string. Gerar 50.000 PDFs para medir uma busca que não os toca seria medir
-- > a coisa errada e queimar disco por nada.
--
-- O que se mede, por consulta: **buffers** (a métrica que não depende da
-- máquina) e tempo. Buffers é o número que interessa: ele conta páginas lidas, e
-- é ele que explode quando um índice deixa de ser usado.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\set ORG '00000000-9e00-4000-8000-0000000000bb'

\echo ''
\echo '=== preparando a organização de benchmark ==='
\set QUIET on
begin;
set local nr13.manutencao = '1';
delete from public.relatorios_index where org_id = :'ORG'::uuid;
delete from public.profiles where id = :'ORG'::uuid;
delete from auth.users  where id = :'ORG'::uuid;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values (:'ORG'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'bench9e@local.test', 'x', now(), now(), now(),
        '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano)
values (:'ORG'::uuid, 'bench9e@local.test', :'ORG'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set org_id = excluded.org_id, papel = 'mestre', ativo = true;
commit;
\set QUIET off

-- ---------------------------------------------------------------------------
-- Gerador de massa: só metadados.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.massa_9e(p_ate integer)
returns void language plpgsql as $$
declare
  v_de integer;
begin
  select coalesce(max(substring(relatorio_id from 5)::int), 0) + 1
    into v_de
    from public.relatorios_index
   where org_id = '00000000-9e00-4000-8000-0000000000bb'::uuid
     and relatorio_id like 'REL-%';

  if v_de > p_ate then return; end if;

  insert into public.relatorios_index
    (org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
     emissao, validade, pdf_ref, sha256, paginas, source_version, source_updated_at)
  select '00000000-9e00-4000-8000-0000000000bb'::uuid,
         'REL-' || lpad(i::text, 7, '0'),
         'VP-' || lpad((i % 500)::text, 4, '0'),
         'REL-17864' || lpad(i::text, 7, '0'),
         'Relatorio_Inspecao_Periodica_VP-' || (i % 500) || '.pdf',
         (array['Inspeção Inicial','Inspeção Periódica','Inspeção Extraordinária'])[1 + (i % 3)],
         'emitido',
         (array['Ana Souza','Carlos Lima','Marina Alves'])[1 + (i % 3)],
         -- 5 % sem data, para o caso da fronteira também estar na massa.
         case when i % 20 = 0 then null else date '2020-01-01' + (i % 2400) end,
         date '2027-01-01' + (i % 365),
         -- REFERÊNCIA. Nenhum arquivo é criado.
         'bench/relatorios/uuid-' || i || '.pdf',
         md5(i::text),
         13, 1, now()
    from generate_series(v_de, p_ate) i;
end $$;

-- ---------------------------------------------------------------------------
-- Uma rodada de medição.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.medir_9e(p_rotulo text, p_sql text)
returns table (rotulo text, buffers bigint, ms numeric) language plpgsql as $$
declare
  v_plano jsonb;
begin
  execute 'explain (analyze, buffers, format json) ' || p_sql into v_plano;
  return query select
    p_rotulo,
    ( (v_plano->0->'Plan'->>'Shared Hit Blocks')::bigint
    + (v_plano->0->'Plan'->>'Shared Read Blocks')::bigint ),
    round((v_plano->0->>'Execution Time')::numeric, 2);
end $$;

-- ---------------------------------------------------------------------------
-- O laço: cresce a massa e repete as MESMAS consultas.
-- ---------------------------------------------------------------------------
\echo ''
\echo '┌──────────┬─────────────────────────────┬──────────┬──────────┐'
\echo '│  massa   │ consulta                    │  buffers │    ms    │'
\echo '├──────────┼─────────────────────────────┼──────────┼──────────┤'

do $$
declare
  v_tamanhos int[] := array[1000, 5000, 10000, 20000, 50000];
  v_n        int;
  r          record;
  v_consultas text[][] := array[
    ['1a pagina (sem filtro)',  'select * from public.buscar_relatorios('''', null, null, null, null, null, 51)'],
    ['pagina 100 (keyset)',     'select * from public.buscar_relatorios('''', null, null, null, date ''2023-06-15'', ''REL-0005000'', 51)'],
    ['busca por TAG',           'select * from public.buscar_relatorios(''VP-0250'', null, null, null, null, null, 51)'],
    ['codigo so digitos',       'select * from public.buscar_relatorios(''1786400012345'', null, null, null, null, null, 51)'],
    ['periodo de 1 mes',        'select * from public.buscar_relatorios('''', null, date ''2025-03-01'', date ''2025-03-31'', null, null, 51)'],
    ['contagem (teto 1000)',    'select * from public.contar_relatorios('''', null, null, null, 1000)']
  ];
  i int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-9e00-4000-8000-0000000000bb","role":"authenticated"}', true);

  foreach v_n in array v_tamanhos loop
    perform set_config('role', 'postgres', true);
    perform pg_temp.massa_9e(v_n);
    execute 'analyze public.relatorios_index';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      '{"sub":"00000000-9e00-4000-8000-0000000000bb","role":"authenticated"}', true);

    for i in 1 .. array_length(v_consultas, 1) loop
      for r in select * from pg_temp.medir_9e(v_consultas[i][1], v_consultas[i][2]) loop
        raise notice '│ % │ % │ % │ % │',
          lpad(v_n::text, 8), rpad(r.rotulo, 27), lpad(r.buffers::text, 8), lpad(r.ms::text, 8);
      end loop;
    end loop;
    raise notice '├──────────┼─────────────────────────────┼──────────┼──────────┤';
  end loop;
end $$;

\echo '└──────────┴─────────────────────────────┴──────────┴──────────┘'
\echo ''
\echo 'LEITURA: buffers é a métrica que não depende da máquina. Se ele ficar'
\echo 'aproximadamente CONSTANTE de 1.000 para 50.000, a busca não degrada com o'
\echo 'acervo — que é a promessa da 9E. Se crescer proporcional à massa, algum'
\echo 'indice deixou de ser escolhido pelo planner.'

\echo ''
\echo '=== tamanho ocupado (metadados; nenhum PDF foi criado) ==='
select pg_size_pretty(pg_total_relation_size('public.relatorios_index')) as tabela_e_indices,
       count(*) as linhas
  from public.relatorios_index
 where org_id = :'ORG'::uuid;

\echo ''
\echo '=== limpeza ==='
\set QUIET on
begin;
set local nr13.manutencao = '1';
delete from public.relatorios_index where org_id = :'ORG'::uuid;
delete from public.profiles where id = :'ORG'::uuid;
delete from auth.users  where id = :'ORG'::uuid;
commit;
\set QUIET off
\echo 'massa de benchmark removida'
