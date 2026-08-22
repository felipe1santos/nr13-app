-- F8.1 — verificação do índice da Fase 1. SOMENTE LEITURA.
--
-- Nada aqui cria, altera ou remove objeto. Pode rodar em produção com
-- segurança: são sete SELECTs.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- A Fase 1 (`docs/medicoes/2026-08-16-fase1-explain.md`) deixou duas coisas em
-- aberto, ambas endereçadas à Fase 8:
--   1. o custo de ESCRITA do índice `app_storage_org_atualizado_idx` (≤ +10 %),
--      que não era medível sem massa;
--   2. o uso real: logo após a criação o índice tinha 3 `idx_scan`, e os três
--      eram do próprio EXPLAIN daquela medição.
--
-- CUIDADO AO INTERPRETAR — foi o dono quem exigiu isto, e com razão:
-- `idx_scan` baixo NÃO significa, sozinho, que o índice é inútil. Pode ser
-- estatística reiniciada, pouco tráfego desde o reset, consulta pequena demais
-- para justificar o índice, ou o planner escolhendo outro caminho. Por isso as
-- consultas 1 a 4 coletam o CONTEXTO antes de qualquer conclusão.
--
-- E há uma limitação estrutural, que precisa ser declarada e não contornada: o
-- SQL Editor roda como `postgres`, SEM RLS. O app roda como `authenticated`,
-- e a policy acrescenta um filtro ao plano. Os planos daqui são um PISO, não o
-- que o app paga. A comparação fiel exige o laboratório local.

-- ── 1. Quando as estatísticas foram zeradas ─────────────────────────────────
-- Sem isto, `idx_scan` é um número sem denominador.
select
  stats_reset                                   as estatisticas_zeradas_em,
  now() - stats_reset                           as janela_de_coleta,
  now() - pg_postmaster_start_time()            as uptime_do_servidor
from pg_stat_database
where datname = current_database();

-- ── 2. Uso de TODOS os índices de app_storage ───────────────────────────────
-- O que interessa é a COMPARAÇÃO: se os outros índices subiram e este não,
-- a conclusão é diferente de "ninguém usou nada desde o reset".
select
  indexrelname                                  as indice,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid))  as tamanho
from pg_stat_user_indexes
where relname = 'app_storage'
order by idx_scan desc;

-- ── 3. Volume atual da tabela ───────────────────────────────────────────────
-- Com poucas linhas, o planner prefere Seq Scan e o índice fica ocioso por
-- decisão CORRETA dele — não por defeito do índice.
select
  (select count(*) from public.app_storage)                        as linhas,
  (select count(*) from public.app_storage where deletado_em is null) as linhas_vivas,
  (select count(distinct org_id) from public.app_storage)          as organizacoes,
  pg_size_pretty(pg_total_relation_size('public.app_storage'))     as total,
  pg_size_pretty(pg_relation_size('public.app_storage'))           as heap,
  pg_size_pretty(pg_indexes_size('public.app_storage'))            as indices;

-- ── 4. Linhas por organização ───────────────────────────────────────────────
-- A maior org define se o índice tem trabalho a fazer.
select org_id, count(*) as linhas, pg_size_pretty(sum(length(valor))::bigint) as conteudo
from public.app_storage
group by org_id
order by linhas desc
limit 10;

-- ── 5. Escrita e manutenção da tabela ───────────────────────────────────────
-- O custo de manter mais um B-tree aparece aqui, indiretamente.
select
  n_tup_ins as inseridas, n_tup_upd as atualizadas, n_tup_del as removidas,
  n_tup_hot_upd as atualizadas_hot,          -- HOT update NÃO toca o índice
  n_live_tup as vivas, n_dead_tup as mortas,
  last_autovacuum, last_autoanalyze
from pg_stat_user_tables
where relname = 'app_storage';

-- ── 6. Plano do cenário 2 — "nada mudou", o que roda em TODO boot ───────────
-- Substitua <ORG> pelo uuid da organização e <MARCA> por um timestamptz recente.
-- Exemplo de marca: now() - interval '1 minute'.
explain (analyze, buffers, verbose)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from public.app_storage
where org_id = '<ORG>'::uuid
  and atualizado_em > '<MARCA>'::timestamptz
order by atualizado_em asc, chave asc
limit 1000;

-- ── 7. Plano do cenário 1 — primeiro boot, sem marca ────────────────────────
-- É o cenário que PIOROU com o índice (65 → 236 buffers na Fase 1) e que
-- acontece uma vez por aparelho.
explain (analyze, buffers, verbose)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from public.app_storage
where org_id = '<ORG>'::uuid
order by atualizado_em asc, chave asc
limit 1000;
