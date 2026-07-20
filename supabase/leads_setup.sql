-- ============================================================================
-- LEADS IMPORTADOS — cadastro manual e importação por planilha no painel Admin
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.
--
-- Leads captados fora do sistema (listas antigas, eventos, indicações) não têm
-- conta no Auth — vivem nesta tabela, visível SOMENTE ao superadmin (role admin).
-- O painel junta estes leads com os do trial 48h (profiles.origem_cadastro)
-- numa lista única para visualizar, filtrar, exportar e disparar e-mails.
-- ============================================================================

create table if not exists public.leads_importados (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  email text not null,
  telefone text not null default '',
  empresa text not null default '',
  -- De onde o lead veio (ex.: "Planilha antiga", "Feira 2025", "Indicação").
  origem text not null default 'Importado',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um lead por e-mail (case-insensitive) — importações repetidas não duplicam.
create unique index if not exists leads_importados_email_unico
  on public.leads_importados (lower(email));

alter table public.leads_importados enable row level security;

-- Só o superadmin enxerga/mexe (is_admin() de admin_setup.sql). A Edge Function
-- admin usa service_role e ignora RLS (personalização {nome}/{empresa} no disparo).
drop policy if exists leads_importados_admin_select on public.leads_importados;
drop policy if exists leads_importados_admin_insert on public.leads_importados;
drop policy if exists leads_importados_admin_update on public.leads_importados;
drop policy if exists leads_importados_admin_delete on public.leads_importados;

create policy leads_importados_admin_select on public.leads_importados
  for select using (public.is_admin());
create policy leads_importados_admin_insert on public.leads_importados
  for insert with check (public.is_admin());
create policy leads_importados_admin_update on public.leads_importados
  for update using (public.is_admin()) with check (public.is_admin());
create policy leads_importados_admin_delete on public.leads_importados
  for delete using (public.is_admin());
