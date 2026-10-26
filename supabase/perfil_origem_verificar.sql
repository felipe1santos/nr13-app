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
-- Esperado: 1 linha, tgenabled = 'O' (origem/habilitado), tabela = auth.users,
-- e le_metadata = false. Desde 25/10/2026 o trigger NÃO lê metadata (ver o
-- cabeçalho de perfil_origem.sql): ler `raw_user_meta_data` é o furo do
-- achado #1 da auditoria — qualquer signUp escolhia papel e organização.
select
  t.tgname                                  as trigger_nome,
  t.tgenabled                               as habilitado,
  t.tgrelid::regclass::text                 as tabela,
  p.proname                                 as funcao,
  (p.prosrc like '%raw_user_meta_data%')    as le_metadata,
  case
    when t.tgenabled = 'O' and p.prosrc not like '%raw_user_meta_data%'
     and p.prosrc not like '%nr13_org_id%' then 'OK'
    when p.prosrc like '%raw_user_meta_data%'
    then 'PROBLEMA — versão de 16/08: signUp escolhe papel/org (rodar perfil_origem.sql)'
    else 'PROBLEMA'
  end                                       as veredito
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'on_auth_user_created';


-- ============================================================================
-- BLOCO 2 — A conta de teste nasceu com o papel certo?
-- ============================================================================
-- Esperado para AUTO-CADASTRO: papel='mestre', org_id = próprio id,
-- cliente_id null — com QUALQUER metadata (desde 25/10/2026 o signUp não manda
-- `nr13_*`, e se mandar o trigger ignora).
select
  pr.email,
  pr.papel,
  pr.role,
  pr.ativo,
  pr.cliente_id,
  (pr.org_id = pr.id)                          as org_e_a_propria,
  u.raw_user_meta_data ->> 'nr13_papel'        as metadata_papel,
  u.raw_user_meta_data ->> 'nr13_org_id'       as metadata_org,
  case
    when pr.papel = 'mestre'
     and pr.org_id = pr.id
     and pr.cliente_id is null
    then 'OK — auto-cadastro é mestre da própria organização'
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
-- Esperado: papel correto, org_id = org do MESTRE (nao a propria),
-- `criado_por` = o mestre e a origem registrada em app_metadata.
--
-- Desde 25/10/2026 o papel vem do UPSERT do org_admin (service_role), não do
-- INSERT: o trigger não lê metadata. `criado_por` é a prova de que passou
-- pela Edge — é o que separa sub-login legítimo de signUp forjado
-- (perfil_origem_levantamento.sql).
select
  filho.email,
  filho.papel,
  filho.cliente_id,
  (filho.org_id = mestre.id)                        as org_e_a_do_mestre,
  (filho.criado_por = mestre.id)                    as criado_pelo_mestre,
  u.raw_app_meta_data ->> 'nr13_papel'              as origem_papel,
  case
    when filho.criado_por = mestre.id
     and u.raw_app_meta_data ->> 'nr13_papel' = filho.papel
    then 'OK — criado pela org_admin, origem em app_metadata'
    when filho.criado_por = mestre.id
    then 'ATENCAO — criado pela org_admin antiga (origem em user_metadata)'
    else 'PROBLEMA — ver perfil_origem_levantamento.sql'
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
