-- ============================================================================
-- perfil_origem_verificar.sql — validação da Fase 0-A. SOMENTE LEITURA.
-- ============================================================================
--
-- Não altera nada. Só `select`. Pode rodar quantas vezes quiser, em produção,
-- sem risco.
--
-- COMO USAR: troque o e-mail na linha do `\set` abaixo pelo e-mail da conta de
-- teste que você acabou de criar, e rode o arquivo inteiro. O SQL Editor do
-- Supabase mostra o resultado do ÚLTIMO comando, então cada bloco está
-- numerado e devolve uma linha de veredito — role o resultado ou rode um bloco
-- por vez se quiser ver todos.
--
-- Se preferir rodar bloco a bloco, cada um é independente.
-- ============================================================================

-- ── Substitua pelo e-mail da conta de teste ─────────────────────────────────
-- (o SQL Editor do Supabase não suporta \set; troque o valor nas 3 ocorrências
--  de 'COLOQUE_O_EMAIL_AQUI' abaixo)


-- ============================================================================
-- BLOCO 1 — O trigger continua ativo e apontando para a função certa?
-- ============================================================================
-- Esperado: 1 linha, tgenabled = 'O' (origem/habilitado), tabela = auth.users
select
  t.tgname                          as trigger_nome,
  t.tgenabled                       as habilitado,
  t.tgrelid::regclass::text         as tabela,
  p.proname                         as funcao,
  (p.prosrc like '%nr13_papel%')    as le_metadata,
  (p.prosrc like '%sem_papel%')     as tem_fail_closed,
  case
    when t.tgenabled = 'O' and p.prosrc like '%nr13_papel%' then 'OK'
    else 'PROBLEMA'
  end                               as veredito
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'on_auth_user_created';


-- ============================================================================
-- BLOCO 2 — A conta de teste nasceu com o papel certo?
-- ============================================================================
-- Esperado para AUTO-CADASTRO: papel='mestre', org_id = próprio id,
-- cliente_id null, e a metadata com nr13_papel='mestre'.
select
  pr.email,
  pr.papel,
  pr.role,
  pr.ativo,
  pr.cliente_id,
  (pr.org_id = pr.id)                          as org_e_a_propria,
  u.raw_user_meta_data ->> 'nr13_papel'        as metadata_papel,
  u.raw_user_meta_data ->> 'nr13_org_id'       as metadata_org,
  u.raw_user_meta_data ->> 'nr13_cliente_id'   as metadata_cliente,
  case
    when pr.papel = 'mestre'
     and pr.org_id = pr.id
     and pr.cliente_id is null
     and u.raw_user_meta_data ->> 'nr13_papel' = 'mestre'
    then 'OK — auto-cadastro correto e EXPLICITO'
    when pr.papel = 'mestre' and u.raw_user_meta_data ->> 'nr13_papel' is null
    then 'ATENCAO — virou mestre pelo DEFAULT, nao pela metadata (bundle antigo?)'
    else 'PROBLEMA'
  end                                          as veredito
from public.profiles pr
join auth.users u on u.id = pr.id
where pr.email = 'COLOQUE_O_EMAIL_AQUI';


-- ============================================================================
-- BLOCO 3 — Sub-login e acesso de cliente criados a partir da conta de teste
-- ============================================================================
-- Rode DEPOIS de criar um sub-login (funcionario ou gerente) e um acesso de
-- cliente pela tela Acessos, logado na conta de teste.
--
-- Esperado: papel correto, org_id = org do MESTRE (nao a propria), e a
-- metadata carregando papel/org desde a criacao.
--
-- O criterio central da Fase 0-A e a coluna `nasceu_correto`: ela prova que o
-- papel veio da metadata no INSERT, e nao do upsert posterior do org_admin.
select
  filho.email,
  filho.papel,
  filho.cliente_id,
  (filho.org_id = mestre.id)                        as org_e_a_do_mestre,
  u.raw_user_meta_data ->> 'nr13_papel'             as metadata_papel,
  (u.raw_user_meta_data ->> 'nr13_org_id')::uuid = mestre.id as metadata_org_bate,
  case
    when u.raw_user_meta_data ->> 'nr13_papel' = filho.papel
     and (u.raw_user_meta_data ->> 'nr13_org_id')::uuid = filho.org_id
    then 'OK — nasceu com o papel certo (metadata)'
    when u.raw_user_meta_data ->> 'nr13_papel' is null
    then 'ATENCAO — sem metadata: Edge antiga, papel veio do upsert'
    else 'PROBLEMA'
  end                                               as nasceu_correto
from public.profiles filho
join auth.users u on u.id = filho.id
join public.profiles mestre on mestre.email = 'COLOQUE_O_EMAIL_AQUI'
where filho.org_id = mestre.id
  and filho.id <> mestre.id
order by filho.papel;


-- ============================================================================
-- BLOCO 4 — Regressao global: nada quebrou na base inteira?
-- ============================================================================
-- Esperado:
--   - sem_papel = 0  (ninguem nasceu sem papel valido)
--   - sem_org   = 0  (ninguem ficou sem organizacao)
--   - papeis validos apenas: mestre / gerente / funcionario / cliente
select
  papel,
  count(*)                                             as perfis,
  count(*) filter (where org_id is null)               as sem_org,
  count(*) filter (where papel = 'cliente'
                     and cliente_id is null)           as cliente_sem_vinculo,
  case
    when papel not in ('mestre','gerente','funcionario','cliente') then 'INVESTIGAR'
    when count(*) filter (where org_id is null) > 0 then 'PROBLEMA — perfil sem org'
    else 'OK'
  end                                                  as veredito
from public.profiles
group by papel
order by perfis desc;


-- ============================================================================
-- BLOCO 5 — Perfis criados HOJE (janela do deploy)
-- ============================================================================
-- Mostra tudo que nasceu desde o deploy, para conferir que so existe o que
-- voce criou de proposito no teste. Se aparecer conta que voce nao criou,
-- investigue antes de seguir.
select
  pr.email,
  pr.papel,
  (pr.org_id = pr.id)                        as org_propria,
  u.created_at,
  u.raw_user_meta_data ->> 'nr13_papel'      as metadata_papel
from public.profiles pr
join auth.users u on u.id = pr.id
where u.created_at >= current_date
order by u.created_at desc;
