-- ============================================================================
-- FASE 9 · 9F.4 — BENCHMARK DA CONSULTA DE `/livro-registro`
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/bench-9f4.sql
--
-- SOMENTE SUPABASE LOCAL (§12 do CLAUDE.md).
--
-- Roda DEPOIS de `lab-9f4-massa.sql` no degrau desejado. Mede a consulta que a
-- tela realmente faz — a primeira página, a busca por TAG e a contagem — e
-- imprime buffers e tempo de cada uma.
--
-- O QUE ESTE ARQUIVO RESPONDE:
--   · quantas linhas a tela recebe (é o DOM que ela vai desenhar);
--   · quantos bytes viajam na primeira página;
--   · o custo NÃO cresce com o parque, porque o filtro é do servidor e o
--     recorte é keyset.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set ORG '00000000-9f77-4000-8000-000000009999'

\echo ''
\echo '=== O PARQUE ==='
select count(*) as equipamentos,
       count(*) filter (where livro_entradas is null or livro_entradas > 0) as na_lista_do_livro
  from public.equipamentos_index where org_id = :'ORG'::uuid;

\echo ''
\echo '=== 1 - PRIMEIRA PAGINA (o que a tela pede ao abrir) ==='
explain (analyze, buffers, costs off, timing off, summary on)
select e.tag, e.descricao, e.tipo, e.categoria, e.livro_entradas, e.livro_ultima
  from public.equipamentos_index e
 where e.org_id = :'ORG'::uuid
   and (e.livro_entradas is null or e.livro_entradas > 0)
 order by e.tag
 limit 51;

\echo ''
\echo '=== 2 - BUSCA POR PREFIXO DE TAG ==='
explain (analyze, buffers, costs off, timing off, summary on)
select e.tag, e.descricao, e.tipo, e.categoria, e.livro_entradas, e.livro_ultima
  from public.equipamentos_index e
 where e.org_id = :'ORG'::uuid
   and (e.livro_entradas is null or e.livro_entradas > 0)
   and e.tag like 'ZZ%'
 order by e.tag
 limit 51;

\echo ''
\echo '=== 3 - SEGUNDA PAGINA (keyset, nao offset) ==='
explain (analyze, buffers, costs off, timing off, summary on)
select e.tag, e.descricao, e.tipo, e.categoria, e.livro_entradas, e.livro_ultima
  from public.equipamentos_index e
 where e.org_id = :'ORG'::uuid
   and (e.livro_entradas is null or e.livro_entradas > 0)
   and e.tag > 'VP-05000'
 order by e.tag
 limit 51;

\echo ''
\echo '=== 4 - CONTAGEM COM TETO ==='
explain (analyze, buffers, costs off, timing off, summary on)
select count(*) from (
  select 1 from public.equipamentos_index e
   where e.org_id = :'ORG'::uuid
     and (e.livro_entradas is null or e.livro_entradas > 0)
   limit 1001
) x;

\echo ''
\echo '=== 5 - BYTES DA PRIMEIRA PAGINA (o que viaja) ==='
select pg_size_pretty(sum(
         length(coalesce(tag,'')) + length(coalesce(descricao,'')) +
         length(coalesce(tipo,'')) + length(coalesce(categoria,'')) +
         8 + 8
       )::bigint) as bytes_pagina,
       count(*) as linhas
  from (
    select e.tag, e.descricao, e.tipo, e.categoria
      from public.equipamentos_index e
     where e.org_id = :'ORG'::uuid
       and (e.livro_entradas is null or e.livro_entradas > 0)
     order by e.tag
     limit 51
  ) p;

\echo ''
\echo '=== 6 - O CONTRASTE: o que o caminho ANTIGO baixaria ==='
-- `lerTudo()` traz a organizacao INTEIRA de `app_storage`. Aqui so ha as TAGs de
-- paridade, entao o numero e pequeno no laboratorio — o valor medido em
-- producao esta no registro da etapa (780 KB para uma linha).
select count(*) as chaves_em_app_storage,
       pg_size_pretty(coalesce(sum(length(coalesce(valor,''))),0)::bigint) as bytes_hidratacao_integral
  from public.app_storage where org_id = :'ORG'::uuid and deletado_em is null;
