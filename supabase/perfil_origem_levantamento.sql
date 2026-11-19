-- ============================================================================
-- perfil_origem_levantamento.sql — quem entrou em organização alheia pelo
-- signUp forjado (achado #1 da auditoria de 25/10/2026). SOMENTE LEITURA.
-- ============================================================================
--
-- Não altera nada. Só `select`. Rodar ANTES e DEPOIS de aplicar
-- `perfil_origem.sql` em produção; depois, o bloco 1 não pode ganhar linha nova.
--
-- O FURO: a versão de 16/08 de `handle_new_user` lia `nr13_papel`/`nr13_org_id`
-- de `raw_user_meta_data` — o `options.data` do signUp público. Uma conta podia
-- nascer gerente/funcionário/cliente da org de outra pessoa.
--
-- COMO SEPARAR O LEGÍTIMO DO FORJADO: sub-login legítimo é criado pela Edge
-- `org_admin`, cujo upsert grava `criado_por = <id do mestre da org>`. O signUp
-- público não passa por ali. Então o suspeito é o perfil que está em org ALHEIA
-- (`org_id <> id`) sem `criado_por` de alguém daquela mesma org.
--
-- FALSO POSITIVO possível: sub-login criado ANTES de o `org_admin` gravar
-- `criado_por`, ou ajustado à mão no SQL Editor/Admin. Por isso o bloco 1 traz
-- a metadata e as datas — a decisão é de quem conhece as contas.
-- ============================================================================


-- ============================================================================
-- BLOCO 1 — Perfis em organização alheia SEM criação pela org_admin
-- ============================================================================
-- Esperado: 0 linhas. Cada linha é uma conta a investigar.
select
  pr.id,
  pr.email,
  pr.papel,
  pr.org_id,
  mestre.email                                   as email_do_mestre_da_org,
  pr.criado_por,
  pr.ativo,
  u.created_at                                   as criado_em,
  u.last_sign_in_at                              as ultimo_login,
  u.raw_user_meta_data ->> 'nr13_papel'          as metadata_papel,
  u.raw_user_meta_data ->> 'nr13_org_id'         as metadata_org,
  u.raw_user_meta_data ->> 'origem'              as metadata_origem,
  case
    when (u.raw_user_meta_data ->> 'nr13_org_id') = pr.org_id::text
     and pr.criado_por is null
    then 'SUSPEITO — org veio da metadata do signUp, sem criação pela org_admin'
    when pr.criado_por is null
    then 'INVESTIGAR — em org alheia sem criado_por'
    else 'INVESTIGAR — criado_por de fora da org'
  end                                            as veredito
from public.profiles pr
join auth.users u           on u.id = pr.id
left join public.profiles mestre on mestre.id = pr.org_id
left join public.profiles criador on criador.id = pr.criado_por
where pr.org_id is not null
  and pr.org_id <> pr.id
  and (pr.criado_por is null or criador.org_id is distinct from pr.org_id)
order by u.created_at desc;


-- ============================================================================
-- BLOCO 2 — O que esses perfis gravaram na organização alheia
-- ============================================================================
-- `app_storage.user_id` é quem CRIOU a linha. Linha aqui = dado gravado por
-- conta suspeita dentro de org que não é a dela. Esperado: 0 linhas.
-- (Leitura não deixa rastro em `app_storage`; para isso, ver bloco 3.)
with suspeitos as (
  select pr.id, pr.org_id
    from public.profiles pr
    left join public.profiles criador on criador.id = pr.criado_por
   where pr.org_id is not null
     and pr.org_id <> pr.id
     and (pr.criado_por is null or criador.org_id is distinct from pr.org_id)
)
select
  s.id                                  as perfil_suspeito,
  s.org_id,
  count(*)                              as linhas_gravadas,
  count(*) filter (where a.deletado_em is not null) as linhas_marcadas_excluidas,
  min(a.atualizado_em)                  as primeira,
  max(a.atualizado_em)                  as ultima
from suspeitos s
join public.app_storage a on a.user_id = s.id and a.org_id = s.org_id
group by s.id, s.org_id
order by linhas_gravadas desc;


-- ============================================================================
-- BLOCO 3 — Logins desses perfis (indício de leitura)
-- ============================================================================
-- `login_events` registra entrada no app. Login de conta suspeita = ela teve
-- sessão com acesso de leitura à org alheia pela RLS.
with suspeitos as (
  select pr.id
    from public.profiles pr
    left join public.profiles criador on criador.id = pr.criado_por
   where pr.org_id is not null
     and pr.org_id <> pr.id
     and (pr.criado_por is null or criador.org_id is distinct from pr.org_id)
)
select le.user_id, le.email, le.tipo, count(*) as eventos, min(le.criado_em) as primeiro, max(le.criado_em) as ultimo
  from public.login_events le
  join suspeitos s on s.id = le.user_id
 group by le.user_id, le.email, le.tipo
 order by ultimo desc;


-- ============================================================================
-- BLOCO 4 — Contas de auto-cadastro que DECLARARAM papel diferente de mestre
-- ============================================================================
-- Mesmo sem org alheia, `nr13_papel` diferente de 'mestre' na metadata de uma
-- conta sem `criado_por` é tentativa (bem ou mal sucedida). Esperado: 0 linhas.
select
  pr.id, pr.email, pr.papel, (pr.org_id = pr.id) as org_propria,
  u.raw_user_meta_data ->> 'nr13_papel'  as metadata_papel,
  u.raw_user_meta_data ->> 'nr13_org_id' as metadata_org,
  u.created_at
from public.profiles pr
join auth.users u on u.id = pr.id
where pr.criado_por is null
  and coalesce(u.raw_user_meta_data ->> 'nr13_papel', 'mestre') <> 'mestre'
order by u.created_at desc;
