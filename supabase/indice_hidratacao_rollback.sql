-- =============================================================================
-- ROLLBACK da Fase 1 — remove o índice da hidratação incremental
-- =============================================================================
-- Segundos, sem downtime, sem perda de dado: índice é estrutura, não conteúdo.
-- O sistema volta exatamente ao comportamento anterior (Bitmap/Seq Scan + Sort).
--
-- Também é este o conserto de uma criação INTERROMPIDA (índice `INVALID`):
-- derrube com este script e rode `indice_hidratacao.sql` de novo. Índice
-- inválido é ignorado pelo planner, então o app segue funcionando enquanto
-- isso — não há urgência, mas não deixe assim: ele ocupa espaço e não serve
-- consulta nenhuma.
--
-- `concurrently` aqui pelo mesmo motivo da criação: não travar escrita. Rode a
-- linha SOZINHA no SQL Editor (não aceita bloco de transação).
-- =============================================================================

drop index concurrently if exists public.app_storage_org_atualizado_idx;

-- Verificação: não deve devolver linha nenhuma.
select indexname
  from pg_indexes
 where tablename = 'app_storage'
   and indexname = 'app_storage_org_atualizado_idx';
