-- ============================================================================
-- NR-13 — Cadastro automático de trial (48h). IDEMPOTENTE: pode rodar mais
-- de uma vez. Rodar no SQL Editor do Supabase APÓS admin_setup.sql e
-- acesso_setup.sql.
--
-- Efeito para contas existentes: NENHUM. A única mudança de comportamento é
-- que contas com acesso_expira_em NO PASSADO deixam de conseguir ESCREVER no
-- app_storage (leitura continua) — que é exatamente o gate de expiração que o
-- app já anuncia no login.
-- ============================================================================

-- ── 1. Config global (flag "permitir cadastro automático") ──────────────────
create table if not exists public.config_global (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);

insert into public.config_global (chave, valor)
  values ('cadastro_automatico', '{"ativo": false}')
  on conflict (chave) do nothing;

alter table public.config_global enable row level security;

-- Leitura liberada para usuário logado, MENOS o segredo do webhook da Kiwify
-- (assinatura_setup.sql): com `using (true)`, qualquer conta — inclusive um
-- trial — lia kiwify_webhook_segredo e podia chamar o webhook se dando 30 dias
-- de graça ou derrubando um pagante. A chave nem existe antes daquele arquivo;
-- a condição é inofensiva enquanto isso.
drop policy if exists config_global_select on public.config_global;
create policy config_global_select on public.config_global
  for select to authenticated using (chave <> 'kiwify_webhook_segredo');

drop policy if exists config_global_admin_write on public.config_global;
create policy config_global_admin_write on public.config_global
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 2. Colunas de trial + dados do lead em profiles ─────────────────────────
alter table public.profiles add column if not exists trial_inicio    timestamptz;
alter table public.profiles add column if not exists trial_fim       timestamptz;
alter table public.profiles add column if not exists origem_cadastro text;  -- null = normal, 'trial'
alter table public.profiles add column if not exists nome            text;
alter table public.profiles add column if not exists telefone        text;
alter table public.profiles add column if not exists empresa_nome    text;

-- ── 3. Usuário comum NÃO altera os próprios campos sensíveis ────────────────
-- A policy profiles_update_own (admin_setup.sql) permite update do próprio
-- perfil inteiro — sem este trigger, um trial poderia estender o próprio
-- prazo via API. Reverte silenciosamente qualquer mudança nesses campos
-- quando o executor é um usuário autenticado que não é admin da plataforma.
-- service_role (edge functions) e SQL Editor (postgres) passam direto.
create or replace function public.proteger_campos_sensiveis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    new.ativo            := old.ativo;
    new.acesso_expira_em := old.acesso_expira_em;
    new.plano            := old.plano;
    new.role             := old.role;
    new.papel            := old.papel;
    new.org_id           := old.org_id;
    new.cliente_id       := old.cliente_id;
    new.trial_inicio     := old.trial_inicio;
    new.trial_fim        := old.trial_fim;
    new.origem_cadastro  := old.origem_cadastro;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_campos_sensiveis on public.profiles;
create trigger trg_proteger_campos_sensiveis
  before update on public.profiles
  for each row execute function public.proteger_campos_sensiveis();

-- ── 4. Expirou = não escreve mais (enforcement no servidor) ─────────────────
-- O relógio do navegador não manda: quem decide se a conta está vigente é o
-- Postgres. Conta sem validade (acesso_expira_em null) segue normal.
create or replace function public.acesso_vigente() returns boolean
  language sql security definer set search_path = public as $$
  select coalesce(
    (select acesso_expira_em is null or acesso_expira_em > now()
       from public.profiles where id = auth.uid()),
    false
  );
$$;

drop policy if exists app_storage_insert_org on public.app_storage;
create policy app_storage_insert_org on public.app_storage
  for insert with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
  );

drop policy if exists app_storage_update_org on public.app_storage;
create policy app_storage_update_org on public.app_storage
  for update using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
  ) with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
  );

drop policy if exists app_storage_delete_org on public.app_storage;
create policy app_storage_delete_org on public.app_storage
  for delete using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
  );
