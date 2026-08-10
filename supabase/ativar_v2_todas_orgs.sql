-- ============================================================================
-- Ativa o armazenamento v2 para TODAS as organizacoes.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================
--
-- PRE-REQUISITO ABSOLUTO — CONFERIR ANTES DE RODAR:
--
--   O front em producao PRECISA ser o commit 13f12ef ou mais novo. E ele que
--   ensina o app a ler `org_sync.v2_ativa` e a falar pela RPC.
--
--   Com a v2 ligada, a guarda `trg_guardar_app_storage` RECUSA qualquer escrita
--   direta em `app_storage`. Um aparelho rodando bundle antigo continua tentando
--   o upsert direto, leva `nr13_escrita_direta_bloqueada` em TODA gravacao e
--   empilha o trabalho em `nr13_fila_sync` sem avisar. Foi exatamente o que
--   aconteceu com `cmam.caldeiras` entre 05 e 10/08/2026: 38 equipamentos no
--   banco e a tela vazia.
--
--   Aba que ja estava aberta com o bundle antigo so pega o novo ao recarregar.
--   Nao ha perda: o codigo novo adota a fila presa (`migracaoV1.ts`) no primeiro
--   boot. Mas ate recarregar, aquele aparelho nao grava no banco.
--
-- POR QUE `set local request.jwt.claims`:
--   `definir_v2_org` exige role service_role. No SQL Editor a claim vem vazia e
--   a funcao levantaria excecao. A linha abaixo veste a role SO nesta transacao
--   (`local`), mantendo a guarda da funcao valendo para todo o resto.
-- ============================================================================

begin;

set local request.jwt.claims = '{"role":"service_role"}';

-- 1. Quem vai ser ligado (confira o numero antes de seguir).
select count(distinct org_id) as organizacoes_a_ligar
  from public.profiles
 where org_id is not null;

-- 2. Liga todas.
select public.definir_v2_org(o.org_id, true)
  from (select distinct org_id from public.profiles where org_id is not null) o;

commit;

-- 3. Conferencia: nenhuma linha deve voltar com v2_ativa = false.
select s.v2_ativa, count(*) as orgs
  from public.org_sync s
 group by s.v2_ativa
 order by s.v2_ativa;

-- 4. Organizacao que ficou de fora (perfil sem linha em org_sync).
select p.org_id, p.email
  from public.profiles p
  left join public.org_sync s on s.org_id = p.org_id
 where p.org_id is not null
   and s.org_id is null;

-- ============================================================================
-- ROLLBACK — ORDEM OBRIGATORIA (Task 14 do plano)
-- ============================================================================
--   1. Esvaziar a fila nos aparelhos ativos (/pendencias -> "Tentar todas").
--      Desligar com fila cheia PERDE as pendencias: a v1 usa outra fila e nao
--      as le.
--   2. So entao:
--        begin;
--        set local request.jwt.claims = '{"role":"service_role"}';
--        select public.definir_v2_org('<org_id>'::uuid, false);
--        commit;
--   3. Ao REATIVAR depois de um rollback, rodar antes:
--        select public.reconciliar_versoes_org('<org_id>'::uuid);
--      Sem isso a primeira edicao na v2 e recusada como `versao_obsoleta` para
--      sempre (a v1 recriou chaves com versao abaixo do piso).
-- ============================================================================
