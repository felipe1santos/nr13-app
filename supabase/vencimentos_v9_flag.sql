-- ============================================================================
-- FASE 9 · 9F.5.1 — FLAG DE ROLLOUT `vencimentos_v9`
-- ============================================================================
--
-- Aplicar a qualquer momento: esta etapa NÃO tem SQL de schema nem projeção
-- nova. O agregado que ela habilita — `vencimentos_org(p_limite)` — está em
-- produção desde 25/08/2026 (`vencimentos_agregado.sql`), e as três projeções
-- que ele usa (`equipamentos_index`, `relatorios_index`, `calibracoes_index`)
-- também. Este arquivo cria SÓ o interruptor.
--
-- A flag mora na MESMA tabela de `v2_ativa`, `busca_v9`, `boot_v9`,
-- `inspecoes_v9`, `prontuarios_v9`, `calibracoes_v9` e `livro_v9`. Nenhum
-- mecanismo novo: o app já lê `org_sync` uma vez por boot, em
-- `flag.sincronizarFlagDoServidor()`, e as OITO colunas saem na mesma consulta.
--
-- ---------------------------------------------------------------------------
-- POR QUE ESTA FLAG EXISTE — ela conserta um ACOPLAMENTO, não habilita código
-- ---------------------------------------------------------------------------
--
-- Até aqui `carregarPainel()` escolhia a fonte do painel por `bootV9Ativo()` —
-- a flag do BOOT. Consequências, as duas medidas:
--
--   · desligar o boot leve para consertar um problema de boot mudava TAMBÉM o
--     painel de `/dashboard` e `/vencimentos`;
--   · ligar o agregado para uma organização obrigava a ligar o boot leve dela
--     junto, que é a etapa de maior risco da fase.
--
-- Sete telas, seis flags próprias, e esta pendurada na alheia.
--
-- ---------------------------------------------------------------------------
-- A REGRA DA DISJUNÇÃO — o que NÃO se pode inverter
-- ---------------------------------------------------------------------------
--
-- No cliente, `carregarPainel` faz `vencimentosV9Ativa() || bootV9Ativo()`.
-- A flag nova SOMA, nunca substitui:
--
--   · sob `boot_v9`, o cache local NÃO tem a organização — é esse o ponto do
--     boot leve. Um painel que caísse no caminho local ali contaria ZERO
--     equipamentos e escreveria "tudo em dia" sobre uma conta que nunca foi
--     lida. Trocar um painel certo por um painel vazio não é rollback;
--   · por isso `definir_vencimentos_v9(org, false)` numa organização COM
--     `boot_v9` ligada **não** devolve ela ao caminho local. Para isso, desliga-se
--     o boot leve — que é uma decisão diferente, com o rollback próprio dele.
--
-- Travado por teste em `src/services/vencimentosDisjuncao.test.ts`.
--
-- DEFAULT FALSE. Organização sem a flag continua exatamente como hoje.
--
-- A flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho local do painel, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists vencimentos_v9 boolean not null default false;

comment on column public.org_sync.vencimentos_v9 is
  'Fase 9 · 9F.5 · o painel de /dashboard e /vencimentos vem do agregado vencimentos_org em vez de varrer o cache local. SOMA a boot_v9, nunca substitui: sob boot leve o cache nao tem a organizacao, e o caminho local ali contaria zero. Nao cria projecao nem SQL de schema — o agregado ja existia desde 25/08/2026.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta de `definir_livro_v9`,
-- `definir_calibracoes_v9`, `definir_prontuarios_v9`, `definir_inspecoes_v9`,
-- `definir_busca_v9` e `definir_boot_v9`, e pelo mesmo motivo: virar a chave de
-- uma organização é decisão operacional, não ação de usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_vencimentos_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, vencimentos_v9)
  values (p_org, coalesce(p_ativa, false))
  on conflict (org_id) do update set vencimentos_v9 = excluded.vencimentos_v9;
end;
$$;

revoke all on function public.definir_vencimentos_v9(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Desligar para uma organização:
--   select public.definir_vencimentos_v9('<ORG>'::uuid, false);
--
-- LEIA A REGRA DA DISJUNÇÃO ACIMA antes de esperar que isso devolva a
-- organização ao painel local: se `boot_v9` estiver ligada para ela, o painel
-- CONTINUA vindo do servidor, e é o comportamento correto.
--
-- Remover a flag inteira (só quando a 9G tirar o caminho local do painel):
--   drop function if exists public.definir_vencimentos_v9(uuid, boolean);
--   alter table public.org_sync drop column if exists vencimentos_v9;
--
-- Nada aqui guarda verdade: a coluna é um interruptor, e as projeções que o
-- agregado lê são derivadas de `app_storage`, que segue sendo a fonte.
