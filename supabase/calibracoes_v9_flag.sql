-- ============================================================================
-- FASE 9 · 9F.3.5 — FLAG DE ROLLOUT `calibracoes_v9`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_consulta.sql (a RPC que devolve `calibracoes`).
--
-- A flag mora na MESMA tabela de `v2_ativa`, `busca_v9`, `boot_v9`,
-- `inspecoes_v9` e `prontuarios_v9`. Nenhum mecanismo novo: o app já lê
-- `org_sync` uma vez por boot, em `flag.sincronizarFlagDoServidor()`, e as SEIS
-- colunas saem na mesma consulta — nenhum round-trip a mais.
--
-- UMA FLAG POR TELA, e é o que torna o rollback barato: desligar esta devolve
-- `/calibracoes` ao caminho antigo sem tocar em `prontuarios_v9`,
-- `inspecoes_v9`, `busca_v9` (que serve `/equipamentos` e `/relatorios`) nem
-- `boot_v9`.
--
-- DEFAULT FALSE. Com a flag ligada a tela deixa de hidratar a organização, e o
-- HISTÓRICO de calibrações do equipamento passa a depender da semeadura sob
-- demanda (`carregarEquipamento`) — que já cobre as quatro famílias de chave
-- desta tela desde a v2, mas cuja ORDEM (semear → ler) é responsabilidade de
-- quem chama. Organização sem a flag continua exatamente como hoje. Errar para
-- o lado do OFF é o lado barato.
--
-- A flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho antigo, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists calibracoes_v9 boolean not null default false;

comment on column public.org_sync.calibracoes_v9 is
  'Fase 9 · 9F.3 · liga a tela /calibracoes pela projeção (catálogo do servidor + contagem de calibrações na linha, vinda de calibracoes_index) e a semeadura sob demanda da TAG. Rollout: uma org por vez. Desligar devolve o caminho antigo sem converter dado nenhum.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta de `definir_prontuarios_v9`,
-- `definir_inspecoes_v9`, `definir_busca_v9` e `definir_boot_v9`, e pelo mesmo
-- motivo: virar a chave de uma organização é decisão operacional, não ação de
-- usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_calibracoes_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, calibracoes_v9)
  values (p_org, coalesce(p_ativa, false))
  on conflict (org_id) do update set calibracoes_v9 = excluded.calibracoes_v9;
end;
$$;

revoke all on function public.definir_calibracoes_v9(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Desligar para uma organização:
--   select public.definir_calibracoes_v9('<ORG>'::uuid, false);
--
-- Remover a flag inteira (só quando a 9G tirar o caminho antigo):
--   drop function if exists public.definir_calibracoes_v9(uuid, boolean);
--   alter table public.org_sync drop column if exists calibracoes_v9;
--
-- Nada aqui guarda verdade: a coluna é um interruptor, e `app_storage` segue
-- sendo a fonte.
