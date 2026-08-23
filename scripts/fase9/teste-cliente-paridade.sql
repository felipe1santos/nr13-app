-- ============================================================================
-- FASE 9 · prova sintética da PARIDADE DO CLIENTE (23/08/2026)
-- ============================================================================
--
-- O caso que a produção NÃO exerce: `razaoSocial` DIFERENTE de `nomeFantasia`.
--
-- Nas duas organizações usadas na validação os dois campos coincidiam, e foi
-- por isso que a precedência invertida (`nomeFantasia || razaoSocial` na
-- projeção contra `razaoSocial || nomeFantasia` no cartão antigo) passou
-- despercebida na comparação visual: os dois lados imprimiam o mesmo texto.
--
-- Este script projeta massa sintética PELO PROJETOR REAL (`projetar_equipamento`
-- lendo `app_storage`) e confere o resultado. Nada de `insert` direto na
-- projeção: o que se quer provar é o caminho que a `aplicar_mutacao_storage`, o
-- rebuild e o reparo usam.
--
-- SEGURANÇA: roda inteiro dentro de `begin … rollback`. NADA é gravado — nem em
-- `app_storage`, nem na projeção, nem na fila. Pode rodar em produção.
--
-- Uso:  psql … -f scripts/fase9/teste-cliente-paridade.sql
--       (ou colar no SQL Editor; o `rollback` do fim desfaz tudo)
-- ============================================================================

begin;

-- Organização inventada só para este teste. UUID fixo, para o rollback não
-- deixar dúvida sobre o que foi tocado.
create temporary table t_org (org uuid) on commit drop;
insert into t_org values ('00000000-0000-4000-8000-0000000f9c11'::uuid);

-- ---------------------------------------------------------------------------
-- MASSA — três equipamentos, três formas de cadastro de cliente
-- ---------------------------------------------------------------------------
insert into public.app_storage (org_id, user_id, chave, valor, versao, atualizado_em)
select org, org, chave, valor::jsonb, 1, now() from t_org, (values
  -- 1 · razão social ≠ nome fantasia, COM cidade — o caso que produção não tem
  ('nr13_info_ZZ-PARIDADE-1', '{"descricao":"Vaso teste 1","tipo":"vaso"}'),
  ('nr13_emp_ZZ-PARIDADE-1',
   '{"razaoSocial":"Alfa Industria e Comercio Ltda","nomeFantasia":"Alfa Gases","cidade":"Serra","clienteId":"c1"}'),
  -- 2 · SÓ nome fantasia — a reserva precisa continuar valendo
  ('nr13_info_ZZ-PARIDADE-2', '{"descricao":"Vaso teste 2","tipo":"vaso"}'),
  ('nr13_emp_ZZ-PARIDADE-2', '{"nomeFantasia":"Beta Postos","cidade":"Vitoria","clienteId":"c2"}'),
  -- 3 · razão social SEM cidade — o cartão antigo imprime só o nome
  ('nr13_info_ZZ-PARIDADE-3', '{"descricao":"Vaso teste 3","tipo":"vaso"}'),
  ('nr13_emp_ZZ-PARIDADE-3', '{"razaoSocial":"Gama Energia S.A.","nomeFantasia":"Gama"}')
) as m(chave, valor);

-- ---------------------------------------------------------------------------
-- PROJEÇÃO — pelo projetor real
-- ---------------------------------------------------------------------------
select public.projetar_equipamento(org, 'ZZ-PARIDADE-1') from t_org;
select public.projetar_equipamento(org, 'ZZ-PARIDADE-2') from t_org;
select public.projetar_equipamento(org, 'ZZ-PARIDADE-3') from t_org;

-- ---------------------------------------------------------------------------
-- AS ASSERÇÕES
-- ---------------------------------------------------------------------------
-- `esperado` é o texto que o cartão ANTIGO produziria:
--   [razaoSocial || nomeFantasia, cidade].filter(Boolean).join(' · ')
select
  e.tag,
  coalesce(e.cliente_nome, '(nulo)')   as nome_projetado,
  coalesce(e.cliente_cidade, '(nulo)') as cidade_projetada,
  concat_ws(' · ', e.cliente_nome, e.cliente_cidade) as texto_do_cartao,
  esperado,
  case when concat_ws(' · ', e.cliente_nome, e.cliente_cidade) = esperado
       then 'PASSA' else 'FALHA' end as veredito
from public.equipamentos_index e
join (values
  ('ZZ-PARIDADE-1', 'Alfa Industria e Comercio Ltda · Serra'),
  ('ZZ-PARIDADE-2', 'Beta Postos · Vitoria'),
  ('ZZ-PARIDADE-3', 'Gama Energia S.A.')
) as x(tag, esperado) on x.tag = e.tag
where e.org_id = (select org from t_org)
order by e.tag;

-- A prova que mais importa, resumida numa linha só:
select case
         when (select count(*) from public.equipamentos_index
                where org_id = (select org from t_org)
                  and tag = 'ZZ-PARIDADE-1'
                  and cliente_nome = 'Alfa Industria e Comercio Ltda'
                  and cliente_cidade = 'Serra') = 1
         then 'PASSA — precedencia razaoSocial || nomeFantasia, e cidade projetada'
         else 'FALHA — a projecao divergiu do cartao antigo'
       end as veredito_geral;

-- E que a busca livre continua achando pelo NOME (a cidade fica fora do vetor,
-- de propósito — ver `busca_index_indices.sql`).
select case
         when (select count(*) from public.equipamentos_index
                where org_id = (select org from t_org)
                  and busca @@ public.f9_tsquery('alfa')) = 1
         then 'PASSA — nome do cliente segue pesquisavel'
         else 'FALHA — o vetor de busca perdeu o nome do cliente'
       end as veredito_busca,
       case
         when (select count(*) from public.equipamentos_index
                where org_id = (select org from t_org)
                  and busca @@ public.f9_tsquery('serra')) = 0
         then 'OK — cidade NAO entra na busca (decisao registrada)'
         else 'ATENCAO — cidade entrou no vetor; conferir a decisao'
       end as nota_cidade;

rollback;

-- Conferência de que nada sobrou (rode DEPOIS do rollback):
--   select count(*) from public.app_storage
--    where org_id = '00000000-0000-4000-8000-0000000f9c11';   -- 0
--   select count(*) from public.equipamentos_index
--    where org_id = '00000000-0000-4000-8000-0000000f9c11';   -- 0
