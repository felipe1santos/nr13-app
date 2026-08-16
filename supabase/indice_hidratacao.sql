-- =============================================================================
-- FASE 1 — Índice da hidratação incremental  (achado A-03)
-- =============================================================================
-- Aplicado em produção: 16/08/2026.
--
-- POR QUE ESTE ÍNDICE EXISTE
--
-- Todo boot do app roda esta consulta (storageV2.lerTudo):
--
--   select chave, valor, versao, atualizado_em, dispositivo, deletado_em
--     from app_storage
--    where org_id = $1 and atualizado_em > $2
--    order by atualizado_em asc, chave asc
--    limit 1000 offset $3;
--
-- Nenhum dos índices existentes cobre `(org_id, atualizado_em)`:
--
--   app_storage_pkey
--   app_storage_org_idx          (org_id, chave)
--   app_storage_org_chave_uidx   (org_id, chave) unique
--   app_storage_deletado_idx     (org_id, deletado_em)
--   app_storage_user_idx         (user_id, ...)
--
-- Medido em 16/08/2026 na maior organização real (353 linhas), cenário "nada
-- mudou desde o último boot" — que é o caso MAIS COMUM:
--
--   Limit (rows=0)
--     Sort  (Sort Key: atualizado_em, chave  ·  quicksort 25kB)
--       Bitmap Heap Scan on app_storage
--         Rows Removed by Filter: 353      <-- varre a organização INTEIRA
--         Buffers: shared hit=61              para devolver ZERO linha
--
-- A hidratação incremental (11/08/2026) resolveu o tráfego — passou a pedir só
-- o que mudou. O banco, porém, continua lendo tudo para descobrir que nada
-- mudou. Com 731 linhas isso custa 1 ms; o custo cresce com o tamanho da
-- organização e é pago em TODA abertura do app, de TODO aparelho.
--
-- A ORDEM DAS COLUNAS É O PONTO
--
--   org_id        igualdade      -> primeiro
--   atualizado_em faixa + ordem  -> segundo
--   chave         desempate      -> terceiro
--
-- Assim um único índice serve o `where`, o `order by` e o `limit`, e o nó
-- `Sort` desaparece. Trocar a ordem quebraria isso: com `atualizado_em`
-- primeiro, o filtro por organização deixaria de ser prefixo.
--
-- O QUE ESTE ARQUIVO NÃO FAZ
--
-- Não muda a consulta, a ordenação, o tamanho de página nem a marca d'água —
-- o índice existe para servir a consulta COMO ELA É (invariantes I-08/I-09/I-10).
-- Não derruba nenhum índice: `app_storage_org_idx` pode estar redundante frente
-- ao unique de mesmas colunas, mas remoção de índice é mudança separada, e
-- índice redundante custa espaço, não correção.
--
-- COMO RODAR
--
-- `concurrently` não pode rodar dentro de bloco de transação. No SQL Editor do
-- Supabase, execute a linha do `create index` SOZINHA. Se a criação for
-- interrompida, o índice fica INVALID: o planner o ignora (o app continua
-- funcionando), e o conserto é derrubar e recriar — ver
-- `indice_hidratacao_rollback.sql`.
-- =============================================================================

create index concurrently if not exists app_storage_org_atualizado_idx
  on public.app_storage (org_id, atualizado_em, chave);

-- =============================================================================
-- VERIFICAÇÃO (rodar depois; é só leitura)
-- =============================================================================

-- 1. O índice existe e está VÁLIDO. `indisvalid = false` significa criação
--    interrompida: derrube e recrie, não deixe assim.
select indexrelid::regclass as indice, indisvalid, indisready
  from pg_index
 where indexrelid = 'public.app_storage_org_atualizado_idx'::regclass;

-- 2. Tamanho pago pelo índice novo.
select pg_size_pretty(pg_relation_size('public.app_storage_org_atualizado_idx')) as tamanho;

-- 3. O plano da consulta de hidratação. O aceite é `Index Scan` (ou `Index Only
--    Scan`) SEM nó `Sort`, e `Rows Removed by Filter` caindo de "todas as
--    linhas da organização" para ~0.
--
--    ATENÇÃO À ESCALA: com poucas centenas de linhas o planner pode continuar
--    escolhendo Seq Scan/Bitmap — a tabela cabe em memória e o índice não paga.
--    Isso NÃO é falha do índice. Para verificar que ele é utilizável, force:
--
--      set enable_seqscan = off; set enable_bitmapscan = off;
--      explain (analyze, buffers, costs off) <consulta>;
--      reset enable_seqscan; reset enable_bitmapscan;
--
--    O ganho real aparece quando a organização cresce; a medição em massa
--    sintética é da Fase 8.
explain (analyze, buffers, costs off)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
  from public.app_storage
 where org_id = '00000000-0000-0000-0000-000000000000'  -- trocar pela org medida
   and atualizado_em > '2026-01-01T00:00:00+00'
 order by atualizado_em asc, chave asc
 limit 1000;

-- 4. Depois de alguns boots reais, o índice tem que estar sendo USADO.
--    `idx_scan` parado em zero com o app rodando significa que o planner nunca
--    o escolheu — investigar antes de dar a fase por concluída.
select indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
  from pg_stat_user_indexes
 where relname = 'app_storage'
 order by indexrelname;
