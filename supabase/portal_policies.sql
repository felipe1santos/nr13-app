-- ============================================================================
-- portal_policies.sql — leitura FAIL CLOSED (Fase 0-B, achado A-01)
-- ============================================================================
--
-- IDEMPOTENTE: `drop policy if exists` antes de cada `create policy`.
-- Não altera dado. Não cria coluna. Não toca em escrita.
--
-- ⚠ NÃO APLIQUE ANTES DO BUNDLE E DA EDGE ESTAREM EM PRODUÇÃO. Ver a seção
--   "ORDEM DE DEPLOY" no fim deste arquivo. Aplicar fora de ordem derruba o
--   Portal do Cliente até o deploy do frontend acontecer.
--
-- ── O DEFEITO (A-01) ────────────────────────────────────────────────────────
--
-- A policy de SELECT de `app_storage` era apenas:
--
--     using (org_id = public.org_atual())
--
-- Sem filtro de papel. E `org_atual()` devolve `profiles.org_id`, que para uma
-- conta `papel='cliente'` é a organização do INSPETOR. Resultado: qualquer
-- cliente autenticado lia o `app_storage` inteiro da organização — fichas,
-- relatórios e dados comerciais de OUTROS clientes — bastando
-- `supabase.from('app_storage').select('*')` no console.
--
-- A Edge `portal_cliente` existe para filtrar por cliente com service_role, e o
-- comentário dela já reconhecia o risco. Mas ela é um caminho OPCIONAL: o token
-- do cliente é um token normal do Supabase.
--
-- O bucket tinha o mesmo desenho: `inspecao_leitura` comparava só a primeira
-- pasta com a organização, então o cliente assinava a URL de qualquer foto,
-- qualquer PDF e qualquer prontuário da organização.
--
-- ── LISTA BRANCA, NÃO LISTA NEGRA (D-04) ────────────────────────────────────
--
-- `in ('mestre','gerente','funcionario')`, e não `<> 'cliente'`. Três motivos:
--
--   1. O modo de falha da lista negra é CONCEDER acesso indevido em silêncio —
--      a classe exata do A-01. O da lista branca é NEGAR acesso legítimo:
--      ruidoso, imediato, corrigível numa linha. Regra de segurança falha
--      negando.
--   2. É o padrão que o projeto inteiro já usa: todas as policies de escrita de
--      `app_storage` (acesso_setup, assinatura_setup, trial_setup), as do bucket
--      (fotos_storage, armazenamento_v2) e a própria RPC `aplicar_mutacao_storage`
--      já comparam com esta mesma lista.
--   3. Papel FUTURO nasce SEM acesso. Quem criar um papel novo precisa
--      autorizá-lo explicitamente — e vai descobrir isso na hora, não meses
--      depois por um vazamento.
--
-- ── COMO O PORTAL PASSA A FUNCIONAR ─────────────────────────────────────────
--
--   dados   → Edge `portal_cliente`  (filtra por ativo vinculado ao cliente)
--             → `semearCachePortal` deposita no cache que as telas leem
--   arquivo → Edge `portal_arquivo`  (autoriza por VÍNCULO, não por pasta — D-05)
--             → URL assinada de TTL curto
--
-- As duas usam service_role e reencontram o papel no banco, nunca no que o
-- cliente afirma.
--
-- ── O QUE NÃO MUDA ──────────────────────────────────────────────────────────
--
-- Escrita: intocada. `cliente` já não escrevia, e os três papéis internos
-- seguem exatamente como estavam.
-- Isolamento ENTRE organizações: intocado, e já estava correto.
-- Admin da plataforma: usa `admin_usage_stats()` (security definer), não lê
-- `app_storage` direto. CONFERIR isso antes de aplicar — ver o checklist.
-- ============================================================================

-- ── CHECKLIST ANTES DE APLICAR ──────────────────────────────────────────────
--   [ ] Edge `portal_arquivo` deployada
--   [ ] Bundle novo em produção (frontend com semearCachePortal e o roteamento)
--   [ ] Portal conferido FUNCIONANDO com as policies ANTIGAS  ← garante o rollback
--   [ ] Nenhuma tela do Admin faz select direto em app_storage
-- ============================================================================

-- ── 1. app_storage: leitura só para papéis internos ─────────────────────────
drop policy if exists app_storage_select_org on public.app_storage;
create policy app_storage_select_org on public.app_storage
  for select using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

-- ── 2. bucket `inspecao`: leitura só para papéis internos ───────────────────
-- A pasta continua sendo comparada com a organização (isolamento entre orgs,
-- que já existia e continua). O papel é a camada nova.
drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Esperado: as duas policies com `papel_atual` no texto.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  (qual like '%papel_atual%') as tem_filtro_de_papel
from pg_policies
where (schemaname = 'public' and tablename = 'app_storage' and policyname = 'app_storage_select_org')
   or (schemaname = 'storage' and tablename = 'objects' and policyname = 'inspecao_leitura')
order by tablename;

-- ============================================================================
-- ORDEM DE DEPLOY — e ela não é negociável
-- ============================================================================
--
--   1. Edge `portal_arquivo`   (nova; ninguém chama ainda — inerte)
--   2. Bundle novo             (Portal passa a usar a Edge; policies AINDA antigas)
--   3. CONFERIR o Portal funcionando com as policies antigas
--   4. SÓ ENTÃO aplicar este arquivo
--   5. Reconferir o Portal
--
-- O passo 3 é o que torna o rollback do 4 suficiente: se o Portal já funcionava
-- pela Edge com as policies antigas, voltar as policies devolve exatamente o
-- estado que foi testado.
--
-- Aplicar antes do bundle derruba o Portal no intervalo entre as duas coisas —
-- e esse intervalo depende de alguém fazer o redeploy, ou seja, pode ser longo.
--
-- ROLLBACK: `supabase/portal_policies_rollback.sql`, segundos, sem perda de dado.
-- ============================================================================
