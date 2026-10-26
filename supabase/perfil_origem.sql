-- ============================================================================
-- perfil_origem.sql — o perfil nasce com o PAPEL CERTO (Fase 0, subetapa 0.b)
-- ============================================================================
--
-- IDEMPOTENTE: `create or replace`. Pode rodar mais de uma vez.
-- ADITIVO: não altera dado existente, não apaga nada, não mexe em policy.
--
-- ── O DEFEITO (auditado em 16/08/2026, D-24 do plano de evolução) ───────────
--
-- A versão anterior desta função inseria o profile SEM a coluna `papel`:
--
--     insert into public.profiles (id, email, ativo, role)
--
-- Como `papel` é `not null default 'mestre'` (acesso_setup.sql:14), TODA conta
-- criada no Auth nascia mestre. Para o auto-cadastro isso está certo — a conta
-- é mesmo dona da própria organização. Para um sub-login ou um acesso de
-- cliente, não:
--
--     org_admin.criar_subusuario / criar_acesso_cliente
--       1. admin.auth.admin.createUser()
--            └─> este trigger  →  papel = 'mestre', org_id = próprio id
--       2. admin.from('profiles').upsert({ papel, org_id, cliente_id })
--            └─> corrige
--                          └─ janela ─┘
--
-- Se o passo 2 falhasse (rede, PostgREST, coluna ausente), o usuário ficava no
-- Auth com senha válida e `email_confirm: true`, e perfil `papel='mestre'`
-- PERMANENTE. O bloco `adotavel` do org_admin (index.ts:145) existe justamente
-- para recolher esse órfão numa retentativa — ou seja, a janela era conhecida e
-- compensada, nunca eliminada.
--
-- GRAVIDADE, para calibrar: o órfão nascia com `org_id = próprio id` (via
-- trg_definir_org_padrao), não com a organização do inspetor. Ele não lê dado
-- de ninguém. O defeito é de PRINCÍPIO — origem fail-open — e de estado
-- inconsistente, não de vazamento. Mas entregar RLS fail-closed (D-04) sobre
-- uma origem fail-open seria aparência de segurança, e por isso esta correção
-- vem ANTES das policies.
--
-- ── A VERSÃO DE 16/08 ABRIU UM FURO PIOR (25/10/2026) ───────────────────────
--
-- Para fechar a janela, a versão de 16/08 passou a ler `nr13_papel`,
-- `nr13_org_id` e `nr13_cliente_id` de `raw_user_meta_data`. Esse campo é o
-- `options.data` do `supabase.auth.signUp` — PÚBLICO: quem se cadastra escreve
-- o que quiser nele. Com `{ nr13_papel: 'gerente', nr13_org_id: '<uuid de outra
-- org>' }` uma conta nova nascia gerente da organização de outro cliente e
-- lia/gravava o `app_storage` dela. Nada depois barrava: `definir_org_padrao`
-- só preenche org NULA, `acesso_vigente()` aceita `acesso_expira_em` nulo e a
-- escrita usa a assinatura do mestre da org-alvo. Trocamos um estado
-- inconsistente sem vazamento por um vazamento. (Achado #1 da auditoria de
-- 25/10/2026; reproduzido no laboratório por
-- `scripts/lab/cadastroPapel.lab.test.mjs`.)
--
-- ── A REGRA AGORA: O TRIGGER NÃO LÊ METADATA NENHUMA ────────────────────────
--
-- Todo usuário novo nasce `mestre` da PRÓPRIA organização. Papel e org de
-- sub-login são atribuídos pelo service_role — o upsert que a Edge `org_admin`
-- já faz logo depois do createUser, com o erro lido.
--
-- Por que não ler `raw_app_meta_data`, que só o service_role grava: porque ele
-- NÃO está na linha no momento deste trigger. Medido no laboratório em
-- 25/10/2026 (GoTrue v2.197): o `auth.admin.createUser` insere o usuário só
-- com `provider`/`providers` e grava o `app_metadata` num UPDATE depois. Ler
-- dali daria uma garantia que não existe. E um trigger `after update` não
-- serve: o GoTrue regrava `raw_app_meta_data` em outros momentos (vínculo de
-- provedor), e isso reaplicaria um papel antigo sobre um perfil que o mestre
-- já alterou.
--
-- A janela do D-24 volta, com a gravidade que ela sempre teve: um sub-login
-- cujo upsert falhe fica mestre de uma organização VAZIA e própria, sem acesso
-- a dado de ninguém, e a adoção do `org_admin` o recolhe na retentativa (pela
-- origem registrada em `app_metadata`, que nesse momento já foi gravada).
--
--   auto-cadastro (signUp, com ou sem metadata) → mestre, org própria
--   org_admin / admin (createUser + upsert)      → o papel/org do upsert
--
-- ── COMPATIBILIDADE ─────────────────────────────────────────────────────────
--
-- Edge antiga (manda `user_metadata`) + este SQL → o upsert dela corrige logo
-- depois, exatamente como antes de 16/08. Ordem de deploy livre.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eh_admin boolean := lower(new.email) = 'perone.fs@gmail.com';
begin
  -- Sem metadata: ver "A REGRA AGORA" no cabeçalho. `org_id` nulo é preenchido
  -- com o próprio id por `trg_definir_org_padrao` (before insert em profiles).
  insert into public.profiles (id, email, ativo, role, papel, org_id, cliente_id)
  values (
    new.id,
    lower(new.email),
    eh_admin,
    case when eh_admin then 'admin' else 'user' end,
    'mestre',
    null,
    null
  )
  -- PRESERVADO BYTE A BYTE da versão anterior, e é importante que continue
  -- assim: o org_admin pode ter criado a linha do profile ANTES do trigger
  -- rodar. Trocar por `do update set papel = excluded.papel` faria este trigger
  -- sobrescrever o papel que a Edge acabou de gravar — o defeito inverso, e
  -- pior, porque rebaixaria um perfil já correto.
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

-- O trigger em si NÃO é recriado: ele já existe e aponta para esta função.
-- Recriá-lo sem necessidade abriria uma janela em que nenhum profile é criado.
-- Conferência de que ele continua no lugar:
select tgname, tgenabled
  from pg_trigger
 where tgname = 'on_auth_user_created';

-- Conferência do corpo aplicado (as duas colunas precisam ser false):
select prosrc like '%raw_user_meta_data%' as le_user_metadata,
       prosrc like '%nr13_org_id%'        as le_org_da_metadata
  from pg_proc where proname = 'handle_new_user';
