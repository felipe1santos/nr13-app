-- ============================================================================
-- Armazenamento v2 passa a ser o PADRAO de toda organizacao nova.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================
--
-- O PROBLEMA QUE ISTO CONSERTA (encontrado em 11/08/2026):
--
--   `org_sync.v2_ativa` nasceu `not null default false` e a ativacao de
--   10/08/2026 (`ativar_v2_todas_orgs.sql`) foi um TIRO UNICO sobre as 27
--   organizacoes que existiam naquele dia:
--
--     select public.definir_v2_org(o.org_id, true)
--       from (select distinct org_id from public.profiles ...) o;
--
--   Nada disso alcanca quem chega depois. Toda conta criada a partir de
--   11/08 — todo trial, todo cliente novo convertido — nasce SEM linha em
--   org_sync, e org sem linha era v1: `localStorage` como banco, teto de 5 MB
--   para a origem inteira, e o sumico de equipamentos de volta assim que a
--   conta crescesse. Exatamente o defeito que a v2 existe para eliminar.
--
-- DIRECAO DO ERRO (por que ligar e o lado seguro):
--
--   `aplicar_mutacao_storage` NUNCA consulta `v2_ativa` — ela cobra papel,
--   prazo e assinatura, mais nada. Logo, uma organizacao em v2 no bundle e
--   "v1" no servidor grava normalmente pela RPC. O erro inverso e que e caro:
--   bundle na v1 contra servidor em v2 faz a guarda recusar TODA escrita
--   direta em silencio (`nr13_escrita_direta_bloqueada`), foi o estado da
--   conta cmam.caldeiras entre 05 e 10/08/2026 — 38 equipamentos no banco e a
--   tela vazia.
--
-- O FRONT JA NAO DEPENDE DESTE ARQUIVO: `sincronizarFlagDoServidor`
-- (src/services/flag.ts) passou a tratar "consulta respondeu e nao veio linha"
-- como organizacao nova = v2. Este SQL fecha o outro lado: com a linha
-- gravada, a guarda `trg_guardar_app_storage` volta a proteger a organizacao
-- nova contra um aparelho rodando bundle antigo.
-- ============================================================================

begin;

-- ── 1. Toda linha nova de org_sync nasce em v2 ──────────────────────────────
-- Vale inclusive para o insert de `coletar_tombstones` (secao 6 do
-- armazenamento_v2.sql), que grava org_sync sem citar a coluna.
alter table public.org_sync alter column v2_ativa set default true;

-- ── 2. Backfill: organizacao com perfil e sem linha em org_sync ─────────────
-- Cobre quem foi criado entre 10/08 e a aplicacao deste arquivo.
insert into public.org_sync (org_id, v2_ativa)
select distinct p.org_id, true
  from public.profiles p
 where p.org_id is not null
on conflict (org_id) do nothing;

-- ── 3. Organizacao nova ganha a linha sozinha ───────────────────────────────
-- POR QUE UM TRIGGER EM `profiles` E NAO UMA MUDANCA EM `handle_new_user`:
-- o corpo do handle_new_user varia por instalacao e nao vive neste repo (ver
-- o comentario no fim do acesso_setup.sql). Um trigger proprio e aditivo:
-- nao disputa a autoria do profile com ninguem.
--
-- AFTER, e NUNCA deixa excecao vazar: um erro aqui abortaria a transacao do
-- signup e o usuario nao conseguiria criar conta. Perder a linha e recuperavel
-- (o front assume v2 mesmo assim, e o backfill acima e idempotente); perder o
-- cadastro nao e.
create or replace function public.garantir_org_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.org_id is null then
    return new;
  end if;

  begin
    insert into public.org_sync (org_id, v2_ativa)
    values (new.org_id, true)
    on conflict (org_id) do nothing;
  exception when others then
    -- Cadastro de usuario nunca falha por causa desta linha.
    null;
  end;

  return new;
end $$;

drop trigger if exists trg_garantir_org_sync on public.profiles;
create trigger trg_garantir_org_sync
  after insert or update of org_id on public.profiles
  for each row execute function public.garantir_org_sync();

commit;

-- ── 4. Conferencia ─────────────────────────────────────────────────────────
-- 4a. Nenhuma linha deve voltar aqui (org com perfil e sem org_sync).
select p.org_id, p.email
  from public.profiles p
  left join public.org_sync s on s.org_id = p.org_id
 where p.org_id is not null
   and s.org_id is null;

-- 4b. Distribuicao atual. `false` so deve aparecer se voce desligou de
--     proposito alguma organizacao (rollback).
select s.v2_ativa, count(*) as orgs
  from public.org_sync s
 group by s.v2_ativa
 order by s.v2_ativa;

-- 4c. O default ficou gravado?  Esperado: true
select column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'org_sync'
   and column_name = 'v2_ativa';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   Desligar UMA organizacao continua sendo `definir_v2_org(<org>, false)`,
--   na ordem obrigatoria do ativar_v2_todas_orgs.sql (esvaziar a fila dos
--   aparelhos ANTES). A linha com `false` vence este default: o front so
--   assume v2 quando NAO existe linha.
--
--   Voltar o padrao antigo (nao recomendado):
--     drop trigger if exists trg_garantir_org_sync on public.profiles;
--     alter table public.org_sync alter column v2_ativa set default false;
-- ============================================================================
