-- ═══════════════════════════════════════════════════════════════════════════
-- F8.1 — verificação do índice `app_storage_org_atualizado_idx`
-- SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE/CREATE/ALTER/DROP.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE ESTE ARQUIVO EXISTE
-- A Fase 1 (`docs/medicoes/2026-08-16-fase1-explain.md`) deixou duas coisas
-- endereçadas à Fase 8:
--   1. o custo de ESCRITA do índice (≤ +10 %), não medível sem massa;
--   2. o uso real — logo após a criação o índice tinha 3 `idx_scan`, e os três
--      eram do próprio EXPLAIN daquela medição.
--
-- CUIDADO AO INTERPRETAR: `idx_scan` baixo, sozinho, NÃO condena o índice. Pode
-- ser estatística reiniciada, pouco tráfego desde o reset, tabela pequena
-- demais para o planner preferir índice, ou consulta diferente da real. Por
-- isso o BLOCO 1 coleta o contexto ANTES de qualquer conclusão.
--
-- DE ONDE VÊM OS VALORES — nada aqui é chutado:
--   · organização de teste: 99f642d3-6efd-446d-9e76-d234ad8d211c
--     Provado por `localStorage.nr13_org_id` e pelo `sub` do JWT na sessão de
--     `teste@gmail.com`, e por `2026-08-16-baseline-inicial.md`, que a lista
--     como "99f642d3 (teste)".
--   · organização representativa: NÃO está fixada — é resolvida pela própria
--     consulta como "a que tem mais linhas", o mesmo critério que a Fase 1 usou
--     ao escolher "a maior real".
--   · marca de sincronização: é o MAIOR `atualizado_em` da organização. Provado
--     em `src/services/storageV2.ts:409` — `avancarMarca(escopo.id, maiorVisto)`,
--     com `maiorVisto` sendo o maior `atualizado_em` aplicado. O filtro do app é
--     `gt` (estritamente maior), a ordem é `(atualizado_em, chave)` e o limite é
--     1000 (`range(0, 999)`). Os EXPLAINs abaixo reproduzem isso literalmente.
--
-- LIMITAÇÃO DECLARADA, NÃO CONTORNADA: o SQL Editor roda como `postgres`, SEM
-- RLS. O app roda como `authenticated`, e a policy acrescenta um filtro ao
-- plano. Os planos daqui são um PISO, não o que o app paga. A comparação fiel
-- exige o laboratório local — é para lá que vai o benchmark com/sem índice.
--
-- ───────────────────────────────────────────────────────────────────────────
-- COMO RODAR: o SQL Editor mostra apenas o resultado da ÚLTIMA consulta de um
-- lote. Por isso são QUATRO blocos. Rode um de cada vez e copie a saída de
-- cada um. O bloco 1 devolve UMA única célula JSON — copie-a inteira.
-- ───────────────────────────────────────────────────────────────────────────


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — CONTEXTO (uma única linha, uma única coluna JSON)              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
select jsonb_pretty(jsonb_build_object(
  'coletado_em', now(),

  -- Sem isto, `idx_scan` é um número sem denominador.
  'estatisticas', (
    select jsonb_build_object(
      'zeradas_em',        stats_reset,
      'janela_de_coleta',  (now() - stats_reset)::text,
      'uptime_servidor',   (now() - pg_postmaster_start_time())::text
    )
    from pg_stat_database where datname = current_database()
  ),

  -- O que interessa é a COMPARAÇÃO entre os índices. Se os outros subiram e
  -- este não, a conclusão é diferente de "ninguém usou nada desde o reset".
  'indices', (
    select jsonb_agg(jsonb_build_object(
      'indice',       indexrelname,
      'idx_scan',     idx_scan,
      'idx_tup_read', idx_tup_read,
      'idx_tup_fetch',idx_tup_fetch,
      'tamanho',      pg_size_pretty(pg_relation_size(indexrelid))
    ) order by idx_scan desc)
    from pg_stat_user_indexes where relname = 'app_storage'
  ),

  -- Com poucas linhas o planner prefere Seq Scan por decisão CORRETA dele.
  'tabela', (
    select jsonb_build_object(
      'linhas',        count(*),
      'linhas_vivas',  count(*) filter (where deletado_em is null),
      'organizacoes',  count(distinct org_id),
      'total',         pg_size_pretty(pg_total_relation_size('public.app_storage')),
      'heap',          pg_size_pretty(pg_relation_size('public.app_storage')),
      'indices',       pg_size_pretty(pg_indexes_size('public.app_storage'))
    ) from public.app_storage
  ),

  -- O custo de manter mais um B-tree aparece aqui, indiretamente.
  -- `n_tup_hot_upd` importa: HOT update NÃO toca o índice.
  'escrita', (
    select jsonb_build_object(
      'inseridas',       n_tup_ins,
      'atualizadas',     n_tup_upd,
      'atualizadas_hot', n_tup_hot_upd,
      'removidas',       n_tup_del,
      'vivas',           n_live_tup,
      'mortas',          n_dead_tup,
      'ultimo_autovacuum',  last_autovacuum,
      'ultimo_autoanalyze', last_autoanalyze
    ) from pg_stat_user_tables where relname = 'app_storage'
  ),

  -- As 10 maiores organizações, e a marca de sync de cada uma.
  'organizacoes', (
    select jsonb_agg(x order by x->>'linhas' desc) from (
      select jsonb_build_object(
        'org_id',            org_id,
        'linhas',            count(*),
        'vivas',             count(*) filter (where deletado_em is null),
        'conteudo',          pg_size_pretty(sum(length(valor))::bigint),
        'marca_sync',        max(atualizado_em),   -- é ISTO que o app guarda
        'primeira_escrita',  min(atualizado_em)
      ) as x
      from public.app_storage group by org_id
      order by count(*) desc limit 10
    ) t
  ),

  -- Os alvos exatos dos blocos 2 a 4, para a saída ser auto-explicativa.
  'alvos_do_explain', jsonb_build_object(
    'representativa_org', (select org_id from public.app_storage group by org_id order by count(*) desc limit 1),
    'representativa_marca', (select max(atualizado_em) from public.app_storage
                             where org_id = (select org_id from public.app_storage group by org_id order by count(*) desc limit 1)),
    'teste_org',   '99f642d3-6efd-446d-9e76-d234ad8d211c',
    'teste_linhas',(select count(*) from public.app_storage where org_id = '99f642d3-6efd-446d-9e76-d234ad8d211c'),
    'teste_marca', (select max(atualizado_em) from public.app_storage where org_id = '99f642d3-6efd-446d-9e76-d234ad8d211c')
  )
)) as contexto_f8_1;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — cenário "NADA MUDOU", organização REPRESENTATIVA (a maior)     ║
-- ║ É o que roda em TODO boot de todo aparelho. Espera-se devolver 0 linhas. ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- A org e a marca são resolvidas pela própria consulta (InitPlan), porque o
-- uuid da maior organização não é conhecido fora do banco. Consequência a
-- declarar: sem o literal, o planner estima seletividade pela média em vez do
-- valor exato. Se o plano vier diferente do esperado, é no laboratório local —
-- com literal — que a dúvida se resolve.
explain (analyze, buffers, verbose)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from public.app_storage
where org_id = (select org_id from public.app_storage group by org_id order by count(*) desc limit 1)
  and atualizado_em > (select max(atualizado_em) from public.app_storage
                       where org_id = (select org_id from public.app_storage group by org_id order by count(*) desc limit 1))
order by atualizado_em asc, chave asc
limit 1000;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — cenário "NADA MUDOU", organização de TESTE (uuid literal)      ║
-- ║ Aqui não há InitPlan: o planner conhece o valor exato.                   ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
explain (analyze, buffers, verbose)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from public.app_storage
where org_id = '99f642d3-6efd-446d-9e76-d234ad8d211c'::uuid
  and atualizado_em > (select max(atualizado_em) from public.app_storage
                       where org_id = '99f642d3-6efd-446d-9e76-d234ad8d211c'::uuid)
order by atualizado_em asc, chave asc
limit 1000;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — cenário "PRIMEIRO BOOT" (sem marca), organização de TESTE      ║
-- ║ É o cenário que PIOROU com o índice na Fase 1 (65 → 236 buffers) e que   ║
-- ║ acontece uma vez por aparelho.                                           ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
explain (analyze, buffers, verbose)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from public.app_storage
where org_id = '99f642d3-6efd-446d-9e76-d234ad8d211c'::uuid
order by atualizado_em asc, chave asc
limit 1000;
