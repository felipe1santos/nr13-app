-- ============================================================================
-- FASE 9 · 9F.1.2 — A CONTAGEM DE INSPECOES, NO SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9f.sql
--
-- Aplicar antes, NESTA ORDEM:
--   supabase/busca_index.sql       (a coluna `inspecoes`)
--   supabase/busca_manutencao.sql  (a projecao que conta)
--   supabase/busca_index_rpc.sql   (o dispatch de `nr13_docs_`)
--   supabase/busca_consulta.sql    (a RPC que devolve a coluna)
--
-- O QUE ESTE ARQUIVO PROVA, e que vitest nao alcanca:
--   · a projecao CONTA o array de `nr13_docs_` — sem a tela abrir nada;
--   · ausencia de chave e `null`, NUNCA zero (a regra da 9F.1);
--   · valor ilegivel ou que nao seja array tambem e `null`;
--   · criar e remover container reprojeta a contagem;
--   · a contagem viaja na RPC do catalogo;
--   · isolamento entre organizacoes: a contagem de A nunca vaza para B.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9f11-4000-8000-00000000000a'
\set ORG_B '00000000-9f11-4000-8000-00000000000b'

begin;
set local nr13.manutencao = '1';

delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9f@local.test'),
               (:'ORG_B'::uuid, 'b9f@local.test')) u(id, email);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9f@local.test', :'ORG_A'::uuid, 'mestre', true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9f@local.test', :'ORG_B'::uuid, 'mestre', true, 'user', 'completo');

-- Quatro equipamentos na org A, cada um exercitando um caso da regra:
--   VP-CONTA  → 3 containers
--   VP-ZERO   → array vazio   (contei, e nao ha nenhum → 0)
--   VP-SEM    → sem a chave   (nao contei → null)
--   VP-LIXO   → JSON ilegivel (nao da para contar → null)
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-CONTA', '{"tipo":"vaso","descricao":"Com tres"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_docs_VP-CONTA', '[{"id":"c1"},{"id":"c2"},{"id":"c3"}]', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-ZERO',  '{"tipo":"vaso","descricao":"Sem nenhum"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_docs_VP-ZERO',  '[]', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-SEM',   '{"tipo":"vaso","descricao":"Sem a chave"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-LIXO',  '{"tipo":"vaso","descricao":"Docs ilegivel"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_docs_VP-LIXO',  'isto nao e json', 1, now()),
  -- Org B tem uma TAG com o MESMO nome e outra contagem: e o teste de vazamento.
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_info_VP-CONTA', '{"tipo":"vaso","descricao":"Da org B"}', 1, now()),
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_docs_VP-CONTA', '[{"id":"b1"}]', 1, now());

select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-CONTA');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-ZERO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-SEM');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-LIXO');
select public.projetar_equipamento(:'ORG_B'::uuid, 'VP-CONTA');
commit;

\set QUIET off
\echo ''
\echo '=== 1 · A PROJECAO CONTA ==='

select case when inspecoes = 3 then 'PASSA' else 'FALHA (' || coalesce(inspecoes::text, 'NULO') || ')' end
       || ' — 3 containers viram inspecoes = 3'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-CONTA';

\echo ''
\echo '=== 2 · ZERO E null NAO SAO A MESMA COISA ==='
-- A regra inteira da 9F.1 esta neste bloco. `0` e um fato medido; `null` e a
-- ausencia de medida. Trocar um pelo outro faz a tela afirmar "nenhuma
-- inspecao" sobre equipamento que pode ter dez.

select case when inspecoes = 0 then 'PASSA' else 'FALHA (' || coalesce(inspecoes::text, 'NULO') || ')' end
       || ' — array VAZIO e zero medido, e continua zero'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-ZERO';

select case when inspecoes is null then 'PASSA' else 'FALHA (' || inspecoes || ')' end
       || ' — SEM a chave nr13_docs_ e null, NUNCA zero'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-SEM';

select case when inspecoes is null then 'PASSA' else 'FALHA (' || inspecoes || ')' end
       || ' — JSON ilegivel e null, e nao derruba a projecao da linha'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-LIXO';

select case when descricao = 'Docs ilegivel' then 'PASSA' else 'FALHA' end
       || ' — a linha do VP-LIXO existe inteira; so a contagem ficou desconhecida'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-LIXO';

\echo ''
\echo '=== 3 · ISOLAMENTO ENTRE ORGANIZACOES ==='
-- TAG de mesmo nome nas duas organizacoes, contagens diferentes.

select case when count(*) = 1 and min(inspecoes) = 1 then 'PASSA'
            else 'FALHA (' || count(*) || ' linhas, ' || coalesce(min(inspecoes)::text, 'NULO') || ')' end
       || ' — a org B ve a contagem DELA (1), nao a da org A (3)'
  from public.equipamentos_index where org_id = :'ORG_B'::uuid and tag = 'VP-CONTA';

select case when inspecoes = 3 then 'PASSA' else 'FALHA' end
       || ' — e a org A continua com a dela'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-CONTA';

\echo ''
\echo '=== 4 · MUTACAO REPROJETA A CONTAGEM ==='
-- `projetar_chave` mapeia nr13_docs_ -> TAG -> projetar_equipamento. Sem esta
-- linha no dispatch, o badge ficaria eternamente com o numero do dia do rebuild.

begin;
set local nr13.manutencao = '1';
update public.app_storage
   set valor = '[{"id":"c1"},{"id":"c2"},{"id":"c3"},{"id":"c4"}]', versao = 2, atualizado_em = now()
 where org_id = :'ORG_A'::uuid and chave = 'nr13_docs_VP-CONTA';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_docs_VP-CONTA');
commit;

select case when inspecoes = 4 then 'PASSA' else 'FALHA (' || coalesce(inspecoes::text, 'NULO') || ')' end
       || ' — container ADICIONADO reprojeta: 3 -> 4'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-CONTA';

begin;
set local nr13.manutencao = '1';
update public.app_storage set deletado_em = now()
 where org_id = :'ORG_A'::uuid and chave = 'nr13_docs_VP-CONTA';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_docs_VP-CONTA');
commit;

select case when inspecoes is null then 'PASSA' else 'FALHA (' || inspecoes || ')' end
       || ' — chave EXCLUIDA volta a null (nao sei), nao a zero'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-CONTA';

\echo ''
\echo '=== 5 · A CONTAGEM VIAJA NA RPC DO CATALOGO ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9f11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) filter (where tag = 'VP-ZERO' and inspecoes = 0) = 1 then 'PASSA' else 'FALHA' end
       || ' — a RPC devolve o zero medido'
  from public.buscar_equipamentos('', null, null, null, 200);

select case when count(*) filter (where tag = 'VP-SEM' and inspecoes is null) = 1 then 'PASSA' else 'FALHA' end
       || ' — a RPC devolve null para quem nao foi contado'
  from public.buscar_equipamentos('', null, null, null, 200);
rollback;

\echo ''
\echo '=== 6 · REBUILD COMPLETO TAMBEM CONTA ==='
-- O rebuild passa pela MESMA funcao; se um dia divergirem, o badge ficaria
-- certo no caminho da mutacao e errado depois de um rebuild.

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set inspecoes = 999 where org_id = :'ORG_A'::uuid;
select public.reiniciar_rebuild_busca(:'ORG_A'::uuid);
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);
commit;

select case when inspecoes = 0 then 'PASSA' else 'FALHA (' || coalesce(inspecoes::text, 'NULO') || ')' end
       || ' — o rebuild recontou o VP-ZERO (999 era mentira plantada)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-ZERO';

\echo ''
\echo '=== 7 · LIMPEZA ==='
begin;
set local nr13.manutencao = '1';
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
commit;
\echo 'massa removida'
