-- ============================================================================
-- FASE 9 · 9E — BENCHMARK DE `/relatorios` EM ESCALA
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/bench-9e.sql
--
-- Aplicar antes: supabase/busca_relatorios.sql
--
-- MEDE em 1.000 · 5.000 · 10.000 · 20.000 · 50.000 relatórios, e responde a UMA
-- pergunta: **o custo cresce com o acervo?**
--
-- > **NENHUM PDF É CRIADO.** A massa é só METADADO — `pdf_ref` é uma string.
-- > Gerar 50.000 PDFs para medir uma busca que não os toca seria medir a coisa
-- > errada e queimar disco por nada.
--
-- ## Duas medições, e as duas são necessárias
--
-- 1. **Pela FUNÇÃO** (`buscar_relatorios`) — é o que o app realmente chama.
--    Dá tempo, buffers e bytes do caminho de verdade.
-- 2. **INLINE** (a mesma consulta escrita à mão) — porque `EXPLAIN` sobre uma
--    função plpgsql mostra apenas o `Function Scan`: o plano de DENTRO dela não
--    aparece, e sem ele não dá para afirmar qual índice o planner escolheu. Sem
--    esta segunda forma, o gate 9E.2 não pode ser dado como cumprido.
--
-- A métrica que manda é **buffers** — páginas lidas. Ela não depende da máquina
-- nem da carga do momento, e é ela que explode quando um índice é abandonado.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\set ORG '00000000-9e00-4000-8000-0000000000bb'
\set JWT '{"sub":"00000000-9e00-4000-8000-0000000000bb","role":"authenticated"}'

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
-- Gerador de massa — só metadados, incremental.
-- ---------------------------------------------------------------------------
create or replace function public.bench9e_massa(p_ate integer)
returns integer language plpgsql as $$
declare
  v_de  integer;
  v_org uuid := '00000000-9e00-4000-8000-0000000000bb';
begin
  select coalesce(count(*), 0) + 1 into v_de
    from public.relatorios_index where org_id = v_org;
  if v_de > p_ate then return 0; end if;

  insert into public.relatorios_index
    (org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
     emissao, validade, pdf_ref, sha256, paginas, source_version, source_updated_at)
  select v_org,
         'REL-' || lpad(i::text, 7, '0'),
         'VP-' || lpad((i % 500)::text, 4, '0'),
         'REL-17864' || lpad(i::text, 7, '0'),
         'Relatorio_Inspecao_Periodica_VP-' || (i % 500) || '.pdf',
         (array['Inspeção Inicial','Inspeção Periódica','Inspeção Extraordinária'])[1 + (i % 3)],
         'emitido',
         (array['Ana Souza','Carlos Lima','Marina Alves'])[1 + (i % 3)],
         -- 5 % SEM data, para o caso da fronteira estar na massa medida.
         case when i % 20 = 0 then null else date '2020-01-01' + (i % 2400) end,
         date '2027-01-01' + (i % 365),
         'bench/relatorios/uuid-' || i || '.pdf',   -- REFERÊNCIA. Nenhum arquivo.
         md5(i::text),
         13, 1, now()
    from generate_series(v_de, p_ate) i;
  return p_ate - v_de + 1;
end $$;

-- ---------------------------------------------------------------------------
-- Medição PELA FUNÇÃO: tempo, buffers e BYTES retornados.
-- ---------------------------------------------------------------------------
create or replace function public.bench9e_medir(p_rotulo text, p_sql text)
returns table (rotulo text, buffers bigint, ms numeric) language plpgsql as $$
declare
  v jsonb;
begin
  execute 'explain (analyze, buffers, format json) ' || p_sql into v;
  return query select p_rotulo,
    ( coalesce((v->0->'Plan'->>'Shared Hit Blocks')::bigint, 0)
    + coalesce((v->0->'Plan'->>'Shared Read Blocks')::bigint, 0) ),
    round((v->0->>'Execution Time')::numeric, 2);
end $$;

-- ---------------------------------------------------------------------------
-- O laço
-- ---------------------------------------------------------------------------
\echo ''
\echo '┌──────────┬───────────────────────────────┬──────────┬───────────┐'
\echo '│  massa   │ consulta                      │  buffers │    ms     │'
\echo '├──────────┼───────────────────────────────┼──────────┼───────────┤'

do $$
declare
  v_tamanhos int[] := array[1000, 5000, 10000, 20000, 50000];
  v_n   int;
  r     record;
  i     int;
  v_consultas text[][] := array[
    ['1a pagina (sem filtro)',   'select * from public.buscar_relatorios('''', null, null, null, null, null, 51)'],
    ['pagina profunda (keyset)', 'select * from public.buscar_relatorios('''', null, null, null, date ''2023-06-15'', ''REL-0005000'', 51)'],
    ['busca por TAG',            'select * from public.buscar_relatorios(''VP-0250'', null, null, null, null, null, 51)'],
    ['codigo so digitos',        'select * from public.buscar_relatorios(''1786400012345'', null, null, null, null, null, 51)'],
    ['periodo de 1 mes',         'select * from public.buscar_relatorios('''', null, date ''2025-03-01'', date ''2025-03-31'', null, null, 51)'],
    ['termo inexistente',        'select * from public.buscar_relatorios(''zzzzznadaexiste'', null, null, null, null, null, 51)'],
    ['contagem (teto 1000)',     'select * from public.contar_relatorios('''', null, null, null, 1000)']
  ];
begin
  foreach v_n in array v_tamanhos loop
    perform public.bench9e_massa(v_n);
    execute 'analyze public.relatorios_index';

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      '{"sub":"00000000-9e00-4000-8000-0000000000bb","role":"authenticated"}', true);

    for i in 1 .. array_length(v_consultas, 1) loop
      for r in select * from public.bench9e_medir(v_consultas[i][1], v_consultas[i][2]) loop
        raise notice '│ % │ % │ % │ % │',
          lpad(v_n::text, 8), rpad(r.rotulo, 29), lpad(r.buffers::text, 8), lpad(r.ms::text, 9);
      end loop;
    end loop;

    perform set_config('role', 'postgres', true);
    raise notice '├──────────┼───────────────────────────────┼──────────┼───────────┤';
  end loop;
end $$;

\echo '└──────────┴───────────────────────────────┴──────────┴───────────┘'
\echo ''
\echo 'LEITURA: se `buffers` ficar aproximadamente CONSTANTE de 1.000 para 50.000,'
\echo 'a busca nao degrada com o acervo — a promessa da 9E. Se crescer proporcional'
\echo 'a massa, algum indice deixou de ser escolhido pelo planner.'

-- ---------------------------------------------------------------------------
-- BYTES retornados — o que de fato trafega para o frontend.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== bytes de UMA pagina (50 linhas) — o que o frontend recebe ==='
begin;
set local role authenticated;
set local request.jwt.claims = :'JWT';
select count(*) as linhas,
       pg_size_pretty(sum(pg_column_size(t))::bigint) as bytes_da_pagina,
       pg_size_pretty((sum(pg_column_size(t)) / greatest(count(*),1))::bigint) as por_linha
  from public.buscar_relatorios('', null, null, null, null, null, 50) t;
\echo '(compare com ~110 KB por relatorio do registro completo: e a diferenca entre'
\echo ' listar metadados e baixar o acervo)'
rollback;

-- ---------------------------------------------------------------------------
-- O PLANO — qual índice o planner escolheu, de verdade.
-- ---------------------------------------------------------------------------
-- `EXPLAIN` sobre a função mostra só o `Function Scan`. Estas consultas repetem
-- o predicado INLINE para o plano interno aparecer.
\echo ''
\echo '════════ PLANO · 1a pagina (deve usar relatorios_index_ordem_idx) ════════'
explain (analyze, buffers)
select r.relatorio_id, r.tag, r.emissao
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

\echo ''
\echo '════════ PLANO · keyset (pagina profunda) ════════'
explain (analyze, buffers)
select r.relatorio_id, r.tag, r.emissao
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
   and (r.ordem_emissao, r.relatorio_id) < (date '2023-06-15', 'REL-0005000')
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

\echo ''
\echo '════════ PLANO · busca por TAG (espelha a funcao: CTE materializada) ════════'
-- Espelha `buscar_relatorios` COM termo. A CTE `materialized` é o que impede o
-- planner de empurrar o texto para dentro da varredura ordenada — sem ela, ele
-- percorre `relatorios_index_ordem_idx` filtrando linha a linha (medido:
-- 24.754 buffers em 50.000).
explain (analyze, buffers)
with candidatos as materialized (
  select r.relatorio_id, r.ordem_emissao
    from public.relatorios_index r
   where r.org_id = :'ORG'::uuid
     and (r.tag like 'VP-0250%' or upper(r.codigo) like 'VP-0250%')
)
select c.relatorio_id from candidatos c
 order by c.ordem_emissao desc, c.relatorio_id desc
 limit 51;

\echo ''
\echo '════════ PLANO · o caminho ANTIGO, para comparacao (upper(tag), sem CTE) ════════'
explain (analyze, buffers)
select r.relatorio_id
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
   and (upper(r.codigo) like 'VP-0250%' or upper(r.tag) like 'VP-0250%')
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

\echo ''
\echo '════════ PLANO · texto livre (GIN) ════════'
explain (analyze, buffers)
select r.relatorio_id
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
   and r.busca @@ public.f9_tsquery('1786400012345')
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

\echo ''
\echo '════════ PLANO · periodo ════════'
explain (analyze, buffers)
select r.relatorio_id
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
   and r.emissao between date '2025-03-01' and date '2025-03-31'
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

-- ---------------------------------------------------------------------------
-- ANTES × DEPOIS dos índices da 9E
-- ---------------------------------------------------------------------------
-- Mede a MESMA consulta com os índices desligados, para o ganho ser um número e
-- não uma afirmação. `enable_indexscan = off` é local à transação.
\echo ''
\echo '════════ ANTES x DEPOIS · 1a pagina, com e sem os indices da 9E ════════'
begin;
set local enable_indexscan = off;
set local enable_bitmapscan = off;
set local enable_indexonlyscan = off;
\echo '--- SEM indice (varredura sequencial) ---'
explain (analyze, buffers)
select r.relatorio_id
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;
rollback;

\echo '--- COM os indices da 9E ---'
explain (analyze, buffers)
select r.relatorio_id
  from public.relatorios_index r
 where r.org_id = :'ORG'::uuid
 order by r.ordem_emissao desc, r.relatorio_id desc
 limit 51;

-- ---------------------------------------------------------------------------
-- Custo dos índices
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== custo em disco dos indices da 9E (metadados; nenhum PDF criado) ==='
select indexrelname as indice,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamanho,
       idx_scan as usos
  from pg_stat_user_indexes
 where relname = 'relatorios_index'
 order by pg_relation_size(indexrelid) desc;

select pg_size_pretty(pg_table_size('public.relatorios_index'))       as tabela,
       pg_size_pretty(pg_indexes_size('public.relatorios_index'))     as indices,
       pg_size_pretty(pg_total_relation_size('public.relatorios_index')) as total,
       (select count(*) from public.relatorios_index where org_id = :'ORG'::uuid) as linhas;

\echo ''
\echo '=== limpeza ==='
\set QUIET on
begin;
set local nr13.manutencao = '1';
delete from public.relatorios_index where org_id = :'ORG'::uuid;
delete from public.profiles where id = :'ORG'::uuid;
delete from auth.users  where id = :'ORG'::uuid;
commit;
drop function if exists public.bench9e_massa(integer);
drop function if exists public.bench9e_medir(text, text);
\set QUIET off
\echo 'massa de benchmark removida'
