-- ============================================================================
-- FASE 9 · 9F.6.1 — FLAG DE ROLLOUT `relatorios_v9`
-- ============================================================================
--
-- Aplicar DEPOIS de `relatorios_catalogo.sql` (a RPC que o catálogo novo chama).
--
-- OITAVA e última flag por tela. `/relatorios` era a única lista do sistema sem
-- par: as outras seis telas já tinham a sua, e esta continuava montando o
-- seletor de equipamentos com `listarEquipamentos()` — logo `lerTudo()` — e
-- lendo CINCO chaves por equipamento em `montarResumo`, incluindo
-- `nr13_fotos_`, a família mais pesada do sistema (92 KB numa TAG medida).
--
-- A flag mora na MESMA tabela das outras sete. Nenhum mecanismo novo: o app já
-- lê `org_sync` uma vez por boot, e as NOVE colunas saem na mesma consulta.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FLAG NÃO MUDA, e não pode mudar
-- ---------------------------------------------------------------------------
--
--   · o PDF e a geração do relatório — ela troca a FONTE DO CATÁLOGO, e depois
--     do clique é o código de sempre, lendo as chaves de sempre;
--   · o histórico de relatórios e o índice por TAG;
--   · os artefatos imutáveis do §7-quater. Relatório com `pdf_ref` continua
--     sendo servido como ARQUIVO, e `contar_relatorios_por_tag` sequer devolve
--     `pdf_ref`.
--
-- A única diferença depois de ligada: as chaves da TAG chegam por semeadura sob
-- demanda (`carregarEquipamento`) em vez de virem numa hidratação em massa.
--
-- DEFAULT FALSE. Organização sem a flag continua exatamente como hoje.
--
-- A flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho antigo, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists relatorios_v9 boolean not null default false;

comment on column public.org_sync.relatorios_v9 is
  'Fase 9 · 9F.6 · o CATALOGO de /relatorios vem da projecao (buscar_equipamentos + contar_relatorios_por_tag) em vez de listarEquipamentos()/lerTudo(). Nao toca PDF, geracao de relatorio nem historico: depois do clique e o codigo de sempre, com as chaves semeadas sob demanda.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta das outras sete.
-- ---------------------------------------------------------------------------
create or replace function public.definir_relatorios_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, relatorios_v9)
  values (p_org, coalesce(p_ativa, false))
  on conflict (org_id) do update set relatorios_v9 = excluded.relatorios_v9;
end;
$$;

revoke all on function public.definir_relatorios_v9(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Desligar para uma organização:
--   select public.definir_relatorios_v9('<ORG>'::uuid, false);
--
-- Remover a flag inteira (só quando a 9G tirar o caminho antigo):
--   drop function if exists public.definir_relatorios_v9(uuid, boolean);
--   alter table public.org_sync drop column if exists relatorios_v9;
--
-- Nada aqui guarda verdade: a coluna é um interruptor, e `app_storage` segue
-- sendo a fonte — do relatório inclusive.
