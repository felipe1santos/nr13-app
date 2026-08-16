-- ============================================================================
-- portal_policies_rollback.sql — desfaz portal_policies.sql
-- ============================================================================
--
-- Restaura as policies de leitura EXATAMENTE como estavam antes da Fase 0-B,
-- com o texto lido de `acesso_setup.sql:68` e `fotos_storage.sql:46`.
--
-- Segundos, sem downtime, sem perda de dado.
--
-- ⚠ ATENÇÃO: rodar isto REABRE o A-01 — o cliente volta a conseguir ler o
--   `app_storage` e o bucket da organização inteira. É um rollback de
--   emergência para restaurar o Portal, não um estado em que ficar. Depois de
--   corrigir a causa, reaplique `portal_policies.sql`.
--
-- ── ROLLBACK PARCIAL É O CASO MAIS PROVÁVEL ─────────────────────────────────
--
-- As duas policies são independentes. Rode só o bloco que corresponde ao
-- sintoma, em vez dos dois:
--
--   Portal não carrega NADA (lista de ativos vazia)   → bloco 1 (app_storage)
--   Portal carrega mas foto/PDF não abrem             → bloco 2 (bucket)
--   Tela do Admin quebrada                            → bloco 1, e migrar a
--                                                       tela para RPC antes de
--                                                       tentar de novo
--   Sistema interno afetado                           → os dois, e há erro na
--                                                       lista branca
--
-- ── O FRONTEND E AS EDGES PODEM FICAR ───────────────────────────────────────
--
-- Não é preciso reverter o bundle nem as Edge Functions. Eles funcionam com as
-- policies antigas — foi exatamente isso que o passo 3 da ordem de deploy
-- comprovou antes de o SQL ser aplicado. O cliente continua sendo servido pela
-- Edge; a policy antiga apenas volta a permitir também o caminho direto.
-- ============================================================================

-- ── Bloco 1: app_storage ────────────────────────────────────────────────────
drop policy if exists app_storage_select_org on public.app_storage;
create policy app_storage_select_org on public.app_storage
  for select using (org_id = public.org_atual());

-- ── Bloco 2: bucket `inspecao` ──────────────────────────────────────────────
drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
  );

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Esperado após o rollback completo: `tem_filtro_de_papel` = false nas duas.
select
  tablename,
  policyname,
  (qual like '%papel_atual%') as tem_filtro_de_papel
from pg_policies
where (schemaname = 'public' and tablename = 'app_storage' and policyname = 'app_storage_select_org')
   or (schemaname = 'storage' and tablename = 'objects' and policyname = 'inspecao_leitura')
order by tablename;
