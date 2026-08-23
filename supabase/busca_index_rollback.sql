-- ============================================================================
-- FASE 9 · 9A — ROLLBACK das projeções de busca
-- ============================================================================
--
-- SEGURO POR CONSTRUÇÃO NA 9A: nada lê estas tabelas e nada as mantém — os
-- leitores nascem na 9C e a manutenção pela RPC na 9B. Derrubá-las aqui não
-- afeta nenhum fluxo do sistema.
--
-- E NÃO HÁ PERDA DE INFORMAÇÃO EMPRESARIAL: são projeções DERIVADAS de
-- `app_storage` (invariante I1). Recriar é aplicar `busca_index.sql` +
-- `busca_manutencao.sql` e rodar `reconstruir_indice_busca` por organização.
--
-- ⚠️ DEPOIS DA 9B este arquivo deixa de ser suficiente sozinho: a RPC passará a
-- chamar `projetar_equipamento`/`projetar_relatorios`, e derrubá-las sem antes
-- reverter `aplicar_mutacao_storage` faria toda escrita cair no ramo de
-- pendência. A ordem correta a partir da 9B é: reverter a RPC primeiro
-- (`busca_index_rpc_rollback.sql`), este arquivo depois.
--
-- Ordem inversa da criação: funções → índice → tabelas.
-- ============================================================================

drop function if exists public.auditar_projecao(uuid);
drop function if exists public.reparar_pendencias(uuid, integer);
drop function if exists public.reiniciar_rebuild_busca(uuid);
drop function if exists public.reconstruir_indice_busca(uuid, integer);
drop function if exists public.projetar_relatorios(uuid, text);
drop function if exists public.projetar_equipamento(uuid, text);
drop function if exists public.f9_json(text);
drop function if exists public.f9_data(text);

drop index if exists public.relatorios_index_org_tag_idx;

drop table if exists public.busca_rebuild_estado;
drop table if exists public.busca_pendencias;
drop table if exists public.relatorios_index;
drop table if exists public.equipamentos_index;
