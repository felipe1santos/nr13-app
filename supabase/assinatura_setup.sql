-- ============================================================================
-- NR-13 — Assinatura recorrente (Kiwify). IDEMPOTENTE.
-- Rodar no SQL Editor DEPOIS de admin_setup.sql, acesso_setup.sql e trial_setup.sql.
--
-- Efeito nas contas existentes: nenhum, DESDE QUE o backfill da seção 2 rode
-- junto (ele é que impede toda conta paga cair no default 'trial').
--
-- Não redefine proteger_campos_sensiveis() (trial_setup.sql) — este arquivo tem
-- seu PRÓPRIO trigger (seção 3), independente, só para os 4 campos de
-- assinatura. Os dois trigger convivem e reexecutar qualquer um dos arquivos,
-- em qualquer ordem, não abre brecha no outro.
-- ============================================================================

-- ── 1. Colunas em profiles ──────────────────────────────────────────────────
alter table public.profiles add column if not exists assinatura_status       text not null default 'trial';
alter table public.profiles add column if not exists assinatura_ate          timestamptz;
alter table public.profiles add column if not exists kiwify_subscription_id  text;
alter table public.profiles add column if not exists kiwify_email            text;

-- ── 2. Backfill (OBRIGATÓRIO) ───────────────────────────────────────────────
-- Sem isto, quem já paga entra em 'trial' e é rebaixado a somente leitura.
-- assinatura_ate NULL = sem vencimento: a função da seção 4 nunca rebaixa.
update public.profiles
   set assinatura_status = case
         when acesso_expira_em is not null and acesso_expira_em <= now() then 'somente_leitura'
         when plano = 'trial'  then 'trial'
         else 'ativa'                       -- completo, demonstracao e legado
       end,
       assinatura_ate = case
         when plano = 'trial' then coalesce(trial_fim, acesso_expira_em)
         else acesso_expira_em              -- null = vitalícia, preservado
       end
 where assinatura_status = 'trial'          -- só quem ainda está no default
   and assinatura_ate is null;

-- ── 3. Campos de assinatura: usuário não muda o próprio status ──────────────
-- Função e trigger PRÓPRIOS (não mexe em proteger_campos_sensiveis(), que é
-- de trial_setup.sql) — assim reexecutar trial_setup.sql depois não apaga a
-- proteção destes 4 campos, e vice-versa. Mesma mecânica da função irmã.
--
-- Ordem dos dois triggers BEFORE UPDATE (trg_proteger_campos_sensiveis e
-- trg_proteger_campos_assinatura): o Postgres dispara triggers BEFORE UPDATE
-- da mesma tabela em ordem alfabética do NOME do trigger, e cada um recebe o
-- NEW já modificado pelo anterior. Isso é seguro aqui porque os dois triggers
-- mexem em conjuntos de colunas DISJUNTOS (um só reverte os campos "antigos",
-- este só reverte os 4 campos de assinatura) — não importa qual roda primeiro,
-- o resultado final é o mesmo: ambos os grupos de campos voltam ao valor OLD
-- para usuário autenticado não-admin.
create or replace function public.proteger_campos_assinatura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    new.assinatura_status      := old.assinatura_status;
    new.assinatura_ate         := old.assinatura_ate;
    new.kiwify_subscription_id := old.kiwify_subscription_id;
    new.kiwify_email           := old.kiwify_email;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_campos_assinatura on public.profiles;
create trigger trg_proteger_campos_assinatura
  before update on public.profiles
  for each row execute function public.proteger_campos_assinatura();

-- ── 4. Status efetivo da ORG (mestre manda; a data rebaixa) ─────────────────
-- Espelha src/features/assinatura/maquinaEstados.ts::statusEfetivo.
create or replace function public.assinatura_status_org() returns text
  language sql security definer set search_path = public as $$
  select coalesce(
    (select case
              when p.assinatura_status = 'somente_leitura' then 'somente_leitura'
              when p.assinatura_ate is null then p.assinatura_status
              when p.assinatura_ate > now() then p.assinatura_status
              else 'somente_leitura'
            end
       from public.profiles p
      where p.id = public.org_atual()),
    'somente_leitura'
  );
$$;

-- Espelho para o FRONT (status + validade da ORG numa chamada só). O app NÃO pode ler
-- assinatura_status da própria linha: profiles_select_own (admin_setup.sql) só libera a
-- linha do próprio usuário, e o webhook grava na linha do MESTRE — um sub-login lendo a
-- própria linha veria o default 'trial' e ignoraria a suspensão da org (achado C3 da revisão
-- final). SECURITY DEFINER pela MESMA fonte que a RLS de escrita usa, para espelho e servidor
-- nunca divergirem. Chamado por src/services/auth.ts::espelharAssinaturaDaOrg (supabase.rpc).
create or replace function public.assinatura_org() returns jsonb
  language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'status', public.assinatura_status_org(),
    'ate',    (select p.assinatura_ate from public.profiles p where p.id = public.org_atual())
  );
$$;

create or replace function public.assinatura_permite_escrita() returns boolean
  language sql security definer set search_path = public as $$
  select public.assinatura_status_org() in ('trial','ativa','graca','cancelada_no_prazo');
$$;

-- ── 5. RLS de escrita: assinatura E validade legada (defesa em profundidade) ─
-- ATENÇÃO (achado C5 da revisão final): NÃO remover o acesso_vigente() daqui.
-- A versão anterior deste arquivo SUBSTITUÍA acesso_vigente() por
-- assinatura_permite_escrita(), e isso DESLIGAVA o enforcement de prazo dos
-- trials NOVOS: a Edge Function `trial` grava plano/acesso_expira_em/trial_fim
-- e (até o fix) não gravava assinatura_status/assinatura_ate — todo trial
-- criado depois da migração nascia 'trial' + NULL, e assinatura_ate NULL
-- significa SEM VENCIMENTO, ou seja, escrita liberada para sempre.
-- As duas condições convivem: acesso_vigente() olha a validade da PRÓPRIA linha
-- (mecânica antiga, cobre trial/prazo manual) e assinatura_permite_escrita()
-- olha o status da ORG (mecânica nova, cobre inadimplência/cancelamento).
-- O fix do lado da função `trial` também foi feito (ela agora grava
-- assinatura_status='trial' + assinatura_ate=fim) — as duas defesas juntas.
drop policy if exists app_storage_insert_org on public.app_storage;
create policy app_storage_insert_org on public.app_storage
  for insert with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

drop policy if exists app_storage_update_org on public.app_storage;
create policy app_storage_update_org on public.app_storage
  for update using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  ) with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

drop policy if exists app_storage_delete_org on public.app_storage;
create policy app_storage_delete_org on public.app_storage
  for delete using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

-- ── 6. Log de eventos da Kiwify (auditoria + fila de órfãos) ────────────────
create table if not exists public.kiwify_eventos (
  id              uuid primary key default gen_random_uuid(),
  recebido_em     timestamptz not null default now(),
  evento          text not null,
  payload         jsonb not null,
  email           text,
  subscription_id text,
  profile_id      uuid references public.profiles(id),
  processado      boolean not null default false,
  erro            text
);

create index if not exists kiwify_eventos_email_idx on public.kiwify_eventos (email);
create index if not exists kiwify_eventos_orfaos_idx on public.kiwify_eventos (processado, recebido_em desc);

-- Coluna de dedupe (fix round 2 da revisão, 26/07/2026 — substitui o índice do round 1, que
-- travava renovações legítimas: ver comentário abaixo). Calculada pela Edge Function como
-- "<evento>:<subscription_id ou email>:<balde de 60s>" — NUNCA use um índice único direto em
-- (evento, subscription_id): subscription_id é o MESMO em toda renovação da assinatura, então
-- a 2ª cobrança do mês seguinte colidiria com a 1ª e ficaria presa como "duplicado" pra sempre.
alter table public.kiwify_eventos add column if not exists dedupe_chave text;

-- Índice único parcial: defesa em profundidade contra o TOCTOU entre a checagem de duplicata em
-- memória e a gravação do evento na Edge Function (duas entregas simultâneas do MESMO webhook —
-- a Kiwify reenvia sem esperar resposta — podem ler "não existe ainda" ao mesmo tempo). O
-- "balde" de 60s embutido em dedupe_chave é o que limita a proteção a essa janela CURTA, não à
-- vida inteira da assinatura. Se o INSERT do evento colidir aqui, a Edge Function trata como
-- duplicata (200, sem reprocessar) — ver kiwify_webhook/index.ts.
drop index if exists public.kiwify_eventos_dedup_idx;
create unique index if not exists kiwify_eventos_dedup_idx
  on public.kiwify_eventos (dedupe_chave)
  where dedupe_chave is not null;

alter table public.kiwify_eventos enable row level security;

-- Só admin da plataforma lê pelo app; a Edge Function usa service_role (ignora RLS).
drop policy if exists kiwify_eventos_admin on public.kiwify_eventos;
create policy kiwify_eventos_admin on public.kiwify_eventos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 7. Config: link do checkout e segredo do webhook ────────────────────────
insert into public.config_global (chave, valor) values
  ('assinatura_checkout_url', '{"url": "https://pay.kiwify.com.br/O9KdzEI"}'),
  ('kiwify_webhook_segredo',  '{"segredo": "TROQUE-ESTE-VALOR"}')
  on conflict (chave) do nothing;
