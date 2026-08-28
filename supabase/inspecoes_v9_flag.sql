-- ============================================================================
-- FASE 9 · 9F.1.4 — FLAG DE ROLLOUT `inspecoes_v9`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_consulta.sql (a RPC que devolve `inspecoes`).
--
-- A flag mora na MESMA tabela de `v2_ativa`, `busca_v9` e `boot_v9`. Nenhum
-- mecanismo novo: o app já lê `org_sync` uma vez por boot, em
-- `flag.sincronizarFlagDoServidor()`, e as quatro colunas saem na mesma
-- consulta — nenhum round-trip a mais.
--
-- UMA FLAG POR TELA, e é o que torna o rollback barato: desligar esta devolve
-- `/inspecoes` ao caminho antigo sem tocar em `busca_v9` (que serve
-- `/equipamentos` e `/relatorios`) nem em `boot_v9`.
--
-- DEFAULT FALSE, pelo mesmo motivo das outras duas: organização sem a flag
-- continua exatamente como hoje, e o caminho de hoje funciona sem backfill
-- nenhum. Errar para o lado do OFF é o lado barato.
--
-- A flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho antigo, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists inspecoes_v9 boolean not null default false;

comment on column public.org_sync.inspecoes_v9 is
  'Fase 9 · 9F.1 · liga a tela /inspecoes pela projeção (catálogo do servidor + contagem de inspeções na linha). Rollout: uma org por vez. Desligar devolve o caminho antigo sem converter dado nenhum.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta de `definir_busca_v9` e
-- `definir_boot_v9`, e pelo mesmo motivo: virar a chave de uma organização é
-- decisão operacional, não ação de usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_inspecoes_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, inspecoes_v9)
  values (p_org, coalesce(p_ativa, false))
  on conflict (org_id) do update set inspecoes_v9 = excluded.inspecoes_v9;
end;
$$;

revoke all on function public.definir_inspecoes_v9(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Desligar para uma organização:
--   select public.definir_inspecoes_v9('<ORG>'::uuid, false);
--
-- Remover a flag inteira (só quando a 9G tirar o caminho antigo):
--   drop function if exists public.definir_inspecoes_v9(uuid, boolean);
--   alter table public.org_sync drop column if exists inspecoes_v9;
--
-- Nada aqui guarda verdade: a coluna é um interruptor, e `app_storage` segue
-- sendo a fonte.
