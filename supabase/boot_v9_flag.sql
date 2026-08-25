-- ============================================================================
-- FASE 9 · 9D — FLAG DE ROLLOUT `boot_v9`
-- ============================================================================
--
-- Aplicar a qualquer momento: a coluna não muda comportamento nenhum sozinha.
-- Enquanto ela for `false` — o default — o boot continua esperando a
-- organização inteira, exatamente como hoje.
--
-- POR QUE UMA FLAG SEPARADA DA `busca_v9`:
--
--   `busca_v9` troca a FONTE da lista de equipamentos e não toca no `Map`.
--   `boot_v9` troca QUANDO o `Map` é preenchido, e alcança toda tela que hoje
--   lê do cache completo. É a etapa de maior risco da fase, e precisa poder
--   voltar sozinha — desligar o boot leve sem desligar a busca.
--
-- O app já lê `org_sync` uma vez por boot (`flag.sincronizarFlagDoServidor`), e
-- as três flags saem na MESMA consulta: nenhum round-trip novo.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists boot_v9 boolean not null default false;

comment on column public.org_sync.boot_v9 is
  'Fase 9 · o boot baixa só o essencial (essencial.ts) em vez da organização inteira. Rollout: uma org por vez. Desligar devolve a hidratação integral sem converter dado nenhum.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta de `definir_v2_org` e
-- `definir_busca_v9`: virar a chave de uma org é decisão operacional, não ação
-- de usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_boot_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, boot_v9)
  values (p_org, p_ativa)
  on conflict (org_id) do update set boot_v9 = excluded.boot_v9;
end;
$$;

revoke all on function public.definir_boot_v9(uuid, boolean) from public, anon, authenticated;

-- A leitura da flag vem pela policy `org_sync_select` que já existe: a org só
-- enxerga a própria linha. Nenhum grant novo é necessário.

-- ---------------------------------------------------------------------------
-- ROLLBACK
--   select public.definir_boot_v9('<ORG>', false);   -- uma organização
--   update public.org_sync set boot_v9 = false;      -- todas
-- Instantâneo, e nada se perde: o boot leve não converte dado nenhum.
-- ---------------------------------------------------------------------------
