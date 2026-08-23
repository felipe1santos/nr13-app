-- ============================================================================
-- FASE 9 · 9C — FLAG DE ROLLOUT `busca_v9`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_index_indices.sql.
--
-- A flag mora na MESMA tabela onde `v2_ativa` já mora. Nenhum mecanismo novo:
-- o app já lê `org_sync` uma vez por boot, em `flag.sincronizarFlagDoServidor()`.
--
-- DEFAULT FALSE, e isto é o oposto do `v2_ativa` DE PROPÓSITO:
--
--   `v2_ativa` nasce `true` porque a v1 tem um defeito conhecido (teto de 5 MB)
--   e errar para o lado da v1 custa a conta aparecer vazia. Aqui é o contrário:
--   org sem a flag continua exatamente como hoje, com a hidratação integral que
--   funciona. Errar para o lado do OFF é o lado barato.
--
-- E a flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho antigo, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists busca_v9 boolean not null default false;

comment on column public.org_sync.busca_v9 is
  'Fase 9 · liga a leitura pela projeção em /equipamentos. Rollout: uma org por vez. Desligar devolve o caminho antigo sem converter dado nenhum.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Só o superadmin do painel — a mesma porta de
-- `definir_v2_org`, e pelo mesmo motivo: virar a chave de uma org é decisão
-- operacional, não ação de usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_busca_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, busca_v9)
  values (p_org, p_ativa)
  on conflict (org_id) do update set busca_v9 = excluded.busca_v9;
end;
$$;

revoke all on function public.definir_busca_v9(uuid, boolean) from public, anon, authenticated;

-- A leitura da flag vem pela policy `org_sync_select` que já existe: a org só
-- enxerga a própria linha. Nenhum grant novo é necessário.
