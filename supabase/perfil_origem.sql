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
-- ── A CORREÇÃO ──────────────────────────────────────────────────────────────
--
-- Quem cria o usuário declara o papel em `user_metadata`, e o trigger o grava
-- já no INSERT. A janela deixa de existir em vez de ser remendada depois.
--
--   src/services/perfilOrigem.ts      → metadataPerfil() (os dois signUp)
--   supabase/functions/org_admin/     → user_metadata no createUser
--
-- ── COMPATIBILIDADE NAS DUAS DIREÇÕES ───────────────────────────────────────
--
--   trigger novo + chamador antigo (sem metadata) → 'mestre' + org própria,
--                                                   EXATAMENTE como hoje;
--   trigger antigo + chamador novo (com metadata) → metadata ignorada,
--                                                   EXATAMENTE como hoje.
--
-- Nenhum lado depende do outro. Ordem de deploy livre.
--
-- ── POR QUE O CAST DE uuid É GUARDADO POR REGEX ─────────────────────────────
--
-- Este trigger roda `after insert on auth.users`. Se ele LANÇAR, o insert do
-- usuário é revertido e o CADASTRO INTEIRO QUEBRA. A versão anterior não tinha
-- como falhar; esta acrescenta uma conversão para uuid, que é um modo de falha
-- novo. Metadata é entrada externa e pode conter qualquer coisa.
--
-- Postgres não tem `try_cast`, então o formato é conferido por regex ANTES da
-- conversão. Valor malformado vira NULL (e `trg_definir_org_padrao` preenche a
-- org própria) em vez de derrubar o signup. Errar para o lado de "conta nasce
-- na própria org" é barato e visível; errar para o lado de "ninguém consegue se
-- cadastrar" não é.
--
-- ── POR QUE PAPEL DESCONHECIDO VIRA 'sem_papel', E NÃO 'mestre' ─────────────
--
-- 'sem_papel' não está na lista branca das policies (D-04), então a conta nasce
-- sem acesso — fail closed, sem precisar de policy nova. Cair em 'mestre' seria
-- reintroduzir exatamente o defeito que este arquivo conserta.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eh_admin boolean := lower(new.email) = 'perone.fs@gmail.com';
  v_meta   jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_papel  text;
  v_org_txt text;
  v_org    uuid;
  v_cli    text;
begin
  -- Papel declarado por quem criou o usuário. Ausente ou vazio = auto-cadastro,
  -- que é dono da própria organização: 'mestre' é o valor correto.
  v_papel := coalesce(nullif(v_meta ->> 'nr13_papel', ''), 'mestre');

  -- Lista branca, sensível a caixa — espelha as policies (D-04). 'MESTRE' não
  -- é papel válido e não pode virar acesso por descuido de quem chamou.
  if v_papel not in ('mestre', 'gerente', 'funcionario', 'cliente') then
    v_papel := 'sem_papel';
  end if;

  -- uuid só depois de o formato ser conferido: ver a nota sobre o cast guardado.
  v_org_txt := nullif(v_meta ->> 'nr13_org_id', '');
  if v_org_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_org := v_org_txt::uuid;
  else
    v_org := null;   -- trg_definir_org_padrao preenche com o próprio id
  end if;

  -- `cliente_id` é TEXT em profiles (acesso_setup.sql:16) — sem conversão.
  -- Só faz sentido para papel='cliente'; nos demais fica nulo.
  v_cli := case when v_papel = 'cliente' then nullif(v_meta ->> 'nr13_cliente_id', '') end;

  insert into public.profiles (id, email, ativo, role, papel, org_id, cliente_id)
  values (
    new.id,
    lower(new.email),
    eh_admin,
    case when eh_admin then 'admin' else 'user' end,
    v_papel,
    v_org,
    v_cli
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

-- Conferência do corpo aplicado:
select prosrc from pg_proc where proname = 'handle_new_user';
