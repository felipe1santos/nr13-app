-- ============================================================================
-- NR-13 — Controle de Acesso multi-papel + Portal do Cliente + Sessão Única
-- Fase 0 do PLANO-CONTROLE-DE-ACESSO.md. IDEMPOTENTE: pode rodar mais de uma vez.
-- Rodar no SQL Editor do Supabase (projeto de produção) COM cuidado: leia antes.
--
-- Efeito imediato: NENHUMA mudança de comportamento para as contas atuais.
-- O backfill define org_id = id do próprio usuário (cada conta vira "mestre"
-- da sua própria organização), então a RLS por org equivale à RLS por user
-- até que sub-logins sejam criados.
-- ============================================================================

-- ── 1. Novas colunas em profiles ─────────────────────────────────────────────
alter table public.profiles add column if not exists org_id          uuid;
alter table public.profiles add column if not exists papel           text not null default 'mestre';
  -- 'mestre' | 'gerente' | 'funcionario' | 'cliente'  (≠ role admin da plataforma)
alter table public.profiles add column if not exists cliente_id      text;      -- só papel='cliente'
alter table public.profiles add column if not exists criado_por      uuid;      -- mestre que criou o sub-login
-- Sessão única (heartbeat):
alter table public.profiles add column if not exists sessao_token    text;
alter table public.profiles add column if not exists sessao_visto_em timestamptz;

-- Backfill: contas existentes viram mestre e org de si mesmas.
update public.profiles set org_id = id       where org_id is null;
update public.profiles set papel  = 'mestre' where papel is null or papel = '';

-- ── 2. app_storage: coluna org_id + backfill + índice ───────────────────────
alter table public.app_storage add column if not exists org_id uuid;

update public.app_storage s
   set org_id = p.org_id
  from public.profiles p
 where p.id = s.user_id
   and s.org_id is null;

create index if not exists app_storage_org_idx on public.app_storage (org_id, chave);

-- ── 3. Helpers (security definer: evitam recursão de RLS em profiles) ───────
create or replace function public.org_atual() returns uuid
  language sql security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.papel_atual() returns text
  language sql security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid();
$$;

-- ── 4. RLS de app_storage por ORG (substitui as policies por user) ──────────
-- Remove TODAS as policies atuais de app_storage (nomes variam por instalação).
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'app_storage'
  loop
    execute format('drop policy if exists %I on public.app_storage', pol.policyname);
  end loop;
end $$;

alter table public.app_storage enable row level security;

-- LEITURA: todo membro da org (inclusive papel cliente — o app filtra o que o
-- portal mostra; o endurecimento por Edge Function portal_cliente vem na Fase 4).
create policy app_storage_select_org on public.app_storage
  for select using (org_id = public.org_atual());

-- ESCRITA: qualquer papel exceto cliente. Granularidade fina (gerente vs
-- funcionário por prefixo de chave) é aplicada na aplicação (§8 do plano).
create policy app_storage_insert_org on public.app_storage
  for insert with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

create policy app_storage_update_org on public.app_storage
  for update using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  ) with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

create policy app_storage_delete_org on public.app_storage
  for delete using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

-- ── 5. Unicidade por org (upsert usa on conflict (org_id, chave)) ───────────
-- A constraint antiga (user_id, chave) permanece válida durante a transição;
-- a nova é a que o app passa a usar no onConflict.
create unique index if not exists app_storage_org_chave_uidx
  on public.app_storage (org_id, chave);

-- ── 5b. Toda conta NOVA nasce dona da própria organização ───────────────────
-- Sem isto, contas criadas APÓS a migração ficam com org_id nulo e a tela
-- "Acesso"/org_admin recusa (403). O trigger roda antes do insert do profile;
-- a Edge Function org_admin sobrescreve depois com a org correta nos sub-logins.
update public.profiles set org_id = id where org_id is null;

create or replace function public.definir_org_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    new.org_id := new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_definir_org_padrao on public.profiles;
create trigger trg_definir_org_padrao
  before insert on public.profiles
  for each row execute function public.definir_org_padrao();

-- ── 6. Trigger handle_new_user: preservar org/papel definidos pela Edge Fn ──
-- A função org_admin (service_role) cria o profile do sub-login ANTES/JUNTO do
-- signup com org_id/papel/cliente_id corretos. O trigger não pode sobrescrever.
-- Se o seu handle_new_user faz INSERT ... ON CONFLICT (id) DO UPDATE, troque o
-- DO UPDATE por DO NOTHING, ou garanta que ele não toca org_id/papel/cliente_id.
-- (Deixado como comentário porque o corpo exato do trigger varia por instalação.)
