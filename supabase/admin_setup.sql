-- ============================================================================
-- NR-13 — Setup do painel Admin + liberação de acesso
-- Rodar UMA vez no Supabase: Dashboard → SQL Editor → cola tudo → Run.
-- Idempotente: pode rodar de novo sem quebrar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela profiles (cria se não existir) + colunas novas
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);

alter table public.profiles add column if not exists email           text;
alter table public.profiles add column if not exists plano           text;
alter table public.profiles add column if not exists ativo           boolean not null default false;
alter table public.profiles add column if not exists role            text    not null default 'user';
alter table public.profiles add column if not exists acesso_expira_em timestamptz;
alter table public.profiles add column if not exists criado_em       timestamptz not null default now();
alter table public.profiles add column if not exists aprovado_em     timestamptz;
alter table public.profiles add column if not exists aprovado_por    text;

-- Novos cadastros nascem BLOQUEADOS (acesso só após liberação do admin).
alter table public.profiles alter column ativo set default false;

-- ----------------------------------------------------------------------------
-- 2. Tabela de eventos de login/logout (métricas de uso)
-- ----------------------------------------------------------------------------
create table if not exists public.login_events (
  id        bigint generated always as identity primary key,
  user_id   uuid references auth.users (id) on delete cascade,
  email     text,
  tipo      text not null,             -- 'login' | 'logout'
  sessao_id text,                      -- pareia login/logout p/ calcular duração
  criado_em timestamptz not null default now()
);

create index if not exists login_events_user_idx  on public.login_events (user_id);
create index if not exists login_events_data_idx  on public.login_events (criado_em);

-- ----------------------------------------------------------------------------
-- 3. Helper is_admin() — usado nas policies (SECURITY DEFINER evita recursão RLS)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Trigger: ao criar usuário no Auth, cria o profile automaticamente
--    Admin (perone.fs@gmail.com) já nasce ativo + role admin.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eh_admin boolean := lower(new.email) = 'perone.fs@gmail.com';
begin
  insert into public.profiles (id, email, ativo, role)
  values (new.id, lower(new.email), eh_admin, case when eh_admin then 'admin' else 'user' end)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.login_events enable row level security;

-- profiles: dono lê/atualiza o próprio; admin lê/atualiza todos.
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_insert_self  on public.profiles;

create policy profiles_select_own   on public.profiles for select using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select using (public.is_admin());
create policy profiles_update_own   on public.profiles for update using (id = auth.uid());
create policy profiles_update_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
-- fallback caso o trigger não rode (insert do próprio perfil)
create policy profiles_insert_self  on public.profiles for insert with check (id = auth.uid());

-- login_events: dono insere/lê os próprios; admin lê todos.
drop policy if exists events_insert_own  on public.login_events;
drop policy if exists events_select_own  on public.login_events;
drop policy if exists events_select_admin on public.login_events;

create policy events_insert_own   on public.login_events for insert with check (user_id = auth.uid());
create policy events_select_own   on public.login_events for select using (user_id = auth.uid());
create policy events_select_admin on public.login_events for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. Garante que SEU usuário (se já existia antes do trigger) seja admin+ativo
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, ativo, role)
select u.id, lower(u.email), true, 'admin'
from auth.users u
where lower(u.email) = 'perone.fs@gmail.com'
on conflict (id) do update
  set ativo = true, role = 'admin', email = excluded.email;
