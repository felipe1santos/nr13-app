-- ============================================================================
-- PAINEL DE CLIENTES — CLASSIFICAÇÃO MANUAL E MENSALIDADE POR CLIENTE
-- 21/09/2026
-- ============================================================================
--
-- O QUE MUDA, E POR QUÊ
--
--   1. `profiles.classificacao` — a TAG da conta, escolhida pelo dono:
--      `pagante` | `vitalicio` | `interna` | `suspenso`. Nula = o painel
--      DERIVA a tag dos campos que já existem (plano, ativo, validade), que é
--      exatamente o que ele fazia antes desta coluna existir. Nenhuma conta
--      muda de balde por causa desta migration.
--
--      Ela existe porque a derivação não consegue responder tudo: "vitalício"
--      e "pagante" têm os mesmos campos no banco (plano completo, sem
--      vencimento) e só o dono sabe qual dos dois é. Enquanto isso era
--      deduzido, o faturamento somava cortesia como receita.
--
--   2. `profiles.valor_mensal` — quanto AQUELE cliente paga. Até aqui o painel
--      multiplicava um valor único pelo número de pagantes; com mensalidades
--      diferentes, o MRR exibido não era o MRR real. Nulo = "não informado", e
--      o painel mostra o valor padrão como recuo em vez de inventar zero.
--
-- O QUE ELA NÃO FAZ
--
--   Não apaga conta, não muda plano, não mexe em `ativo`, em validade nem em
--   `app_storage`. Só acrescenta duas colunas nulas e fecha o buraco de
--   permissão que elas abririam.
--
-- SEGURANÇA
--
--   `trg_proteger_campos_sensiveis` congela, para quem NÃO é admin, os campos
--   que decidem acesso. As duas colunas novas entram nessa lista: sem isso um
--   usuário comum poderia gravar `classificacao = 'vitalicio'` ou zerar o
--   próprio `valor_mensal` com uma chamada à API — o painel do dono passaria a
--   ler número escrito pelo cliente.
--
-- Idempotente. Rodar duas vezes não muda nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · AS COLUNAS
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists classificacao text;
alter table public.profiles add column if not exists valor_mensal numeric(10,2);

-- Vocabulário fechado: tag escrita errada vira conta fora de todos os baldes
-- do painel — some da tela sem ninguém perceber.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_classificacao_valida'
  ) then
    alter table public.profiles
      add constraint profiles_classificacao_valida
      check (classificacao is null or classificacao in ('pagante','vitalicio','interna','suspenso'));
  end if;
end $$;

comment on column public.profiles.classificacao is
  'Tag do painel: pagante | vitalicio | interna | suspenso. NULA = derivada dos demais campos.';
comment on column public.profiles.valor_mensal is
  'Mensalidade em R$ daquele cliente. NULA = não informada (o painel usa o valor padrão).';

-- ---------------------------------------------------------------------------
-- 2 · SÓ O ADMIN ESCREVE ESSAS DUAS
-- ---------------------------------------------------------------------------
-- A função é reescrita inteira (é `create or replace`), acrescentando as duas
-- linhas ao MESMO conjunto de campos congelados que ela já protegia.
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
    -- 21/09/2026 · a tag e a mensalidade são do PAINEL DO DONO. Sem estas duas
    -- linhas, o próprio cliente poderia se declarar vitalício ou zerar o que
    -- paga, e o faturamento passaria a ler número escrito por quem é cobrado.
    new.classificacao    := old.classificacao;
    new.valor_mensal     := old.valor_mensal;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_campos_sensiveis on public.profiles;
create trigger trg_proteger_campos_sensiveis
  before update on public.profiles
  for each row execute function public.proteger_campos_sensiveis();

-- ---------------------------------------------------------------------------
-- 3 · VERIFICAÇÃO — por ESTRUTURA, nunca pela mensagem "Success" (§13)
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('classificacao','valor_mensal'))                as colunas_criadas,   -- 2
  (select count(*) from pg_constraint
    where conname = 'profiles_classificacao_valida')                      as check_criado,      -- 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'proteger_campos_sensiveis'
      and p.prosrc like '%new.valor_mensal%')                             as trigger_protege,   -- 1
  (select count(*) from public.profiles where classificacao is not null)  as ja_classificadas,  -- 0
  (select count(*) from public.profiles)                                  as perfis_intactos;
