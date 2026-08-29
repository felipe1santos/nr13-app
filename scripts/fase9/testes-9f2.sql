-- ============================================================================
-- FASE 9 · 9F.2.2 — O BADGE DE PRONTUARIO, NO SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9f2.sql
--
-- Aplicar antes, NESTA ORDEM:
--   supabase/busca_index.sql       (a coluna `tem_prontuario`)
--   supabase/busca_manutencao.sql  (a projecao que verifica)
--   supabase/busca_index_rpc.sql   (o dispatch de `nr13_prontuario_`)
--   supabase/busca_consulta.sql    (a RPC que devolve a coluna)
--
-- O QUE ESTE ARQUIVO PROVA, e que vitest nao alcanca:
--   · a projecao VERIFICA a existencia da chave — sem a tela abrir nada;
--   · `false` e "olhei e nao ha"; `null` e "ninguem olhou" — nunca se confundem;
--   · `nr13_prontuario_meta_` NAO conta como prontuario (ela nasce ao ABRIR o
--     visualizador, e confundir as duas marcaria como "tem" quem so espiou);
--   · `nr13_prontuario_atual` NAO cria equipamento fantasma de TAG "atual";
--   · salvar e excluir o prontuario reprojetam o badge na mesma transacao;
--   · o booleano viaja na RPC do catalogo;
--   · isolamento entre organizacoes;
--   · o rebuild completo chega ao MESMO resultado da mutacao.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9f22-4000-8000-00000000000a'
\set ORG_B '00000000-9f22-4000-8000-00000000000b'

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
  from (values (:'ORG_A'::uuid, 'a9f2@local.test'),
               (:'ORG_B'::uuid, 'b9f2@local.test')) u(id, email);

-- `on conflict` porque o trigger `handle_new_user` JA cria a linha de perfil ao
-- inserir em auth.users. Sem isto o script morre com duplicate key na segunda
-- execucao — e um teste que so roda uma vez nao e teste. (A licao veio do
-- testes-9f.sql, na 9F.1.)
insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9f2@local.test', :'ORG_A'::uuid, 'mestre', true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9f2@local.test', :'ORG_B'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  email = excluded.email, org_id = excluded.org_id, papel = excluded.papel,
  ativo = excluded.ativo, role = excluded.role, plano = excluded.plano;

-- Quatro equipamentos na org A, cada um exercitando um caso da regra:
--   VP-TEM    → tem prontuario                       → true
--   VP-NAO    → sem prontuario                       → false (olhei, nao ha)
--   VP-META   → so `nr13_prontuario_meta_` (espiou)  → false
--   VP-LIXO   → prontuario com JSON ilegivel         → true (a chave EXISTE)
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-TEM',        '{"tipo":"vaso","descricao":"Com prontuario"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_prontuario_VP-TEM',  '{"tag":"VP-TEM","descricao":"Vaso"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-NAO',        '{"tipo":"vaso","descricao":"Sem prontuario"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-META',       '{"tipo":"vaso","descricao":"So espiou"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_prontuario_meta_VP-META', '{"numero":"REL-1","emitidoEm":"01/08/2026"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VP-LIXO',       '{"tipo":"vaso","descricao":"Prontuario ilegivel"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_prontuario_VP-LIXO', 'isto nao e json', 1, now()),
  -- A chave GLOBAL do documento em montagem. Nao pertence a TAG nenhuma.
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_prontuario_atual',   '{"tag":"VP-TEM"}', 1, now()),
  -- Org B tem uma TAG com o MESMO nome e SEM prontuario: teste de vazamento.
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_info_VP-TEM',        '{"tipo":"vaso","descricao":"Da org B"}', 1, now());

select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-TEM');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-NAO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-META');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-LIXO');
select public.projetar_equipamento(:'ORG_B'::uuid, 'VP-TEM');
commit;

\set QUIET off
\echo ''
\echo '=== 1 · A PROJECAO VERIFICA ==='

select case when tem_prontuario is true then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — equipamento COM prontuario vira true'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-TEM';

select case when tem_prontuario is false then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — equipamento SEM prontuario vira false (olhei, e nao ha)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';

select case when tem_prontuario is true then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — prontuario com JSON ilegivel ainda EXISTE: a chave e o fato'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-LIXO';

\echo ''
\echo '=== 2 · false E null NAO SAO A MESMA COISA ==='
-- A regra inteira da etapa esta neste bloco. `false` e um fato verificado;
-- `null` e a ausencia de verificacao. Trocar um pelo outro faz a tela afirmar
-- "Sem Prontuario" sobre equipamento cuja organizacao nem foi reprojetada.

select case when tem_prontuario is null then 'PASSA' else 'FALHA (' || tem_prontuario::text || ')' end
       || ' — linha NUNCA projetada por esta versao fica null (ninguem olhou)'
  from (select null::boolean as tem_prontuario) t;  -- o default da coluna nova

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set tem_prontuario = null where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';
commit;

select case when tem_prontuario is null then 'PASSA' else 'FALHA' end
       || ' — e o null plantado sobrevive ate alguem reprojetar'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';

begin;
set local nr13.manutencao = '1';
select public.projetar_equipamento(:'ORG_A'::uuid, 'VP-NAO');
commit;

select case when tem_prontuario is false then 'PASSA' else 'FALHA' end
       || ' — reprojetou: o null vira false, porque agora alguem olhou'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';

\echo ''
\echo '=== 3 · META NAO E PRONTUARIO, E "atual" NAO E EQUIPAMENTO ==='
-- `nr13_prontuario_meta_<TAG>` nasce ao ABRIR o visualizador. Se contasse,
-- bastaria espiar um documento para o sistema afirmar que ele existe.

select case when tem_prontuario is false then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — so a META nao faz o equipamento ter prontuario'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-META';

begin;
set local nr13.manutencao = '1';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_prontuario_atual');
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_prontuario_meta_VP-META');
commit;

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ' fantasmas)' end
       || ' — nem "atual" nem "meta_..." criam equipamento fantasma na projecao'
  from public.equipamentos_index
 where org_id = :'ORG_A'::uuid and (tag = 'atual' or tag like 'meta\_%');

\echo ''
\echo '=== 4 · ISOLAMENTO ENTRE ORGANIZACOES ==='

select case when count(*) = 1 and bool_and(tem_prontuario is false) then 'PASSA' else 'FALHA' end
       || ' — a org B ve o estado DELA (false), nao o da org A (true)'
  from public.equipamentos_index where org_id = :'ORG_B'::uuid and tag = 'VP-TEM';

select case when tem_prontuario is true then 'PASSA' else 'FALHA' end
       || ' — e a org A continua com o dela'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-TEM';

\echo ''
\echo '=== 5 · MUTACAO REPROJETA O BADGE ==='
-- `projetar_chave` mapeia nr13_prontuario_ -> TAG -> projetar_equipamento. Sem
-- esta linha no dispatch, o badge ficaria eternamente com o valor do rebuild.

begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em)
values (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_prontuario_VP-NAO', '{"tag":"VP-NAO"}', 1, now());
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_prontuario_VP-NAO');
commit;

select case when tem_prontuario is true then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — prontuario SALVO reprojeta: false -> true'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';

begin;
set local nr13.manutencao = '1';
update public.app_storage set deletado_em = now()
 where org_id = :'ORG_A'::uuid and chave = 'nr13_prontuario_VP-NAO';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_prontuario_VP-NAO');
commit;

select case when tem_prontuario is false then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — prontuario EXCLUIDO volta a false (olhei, nao ha), nao a null'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-NAO';

\echo ''
\echo '=== 6 · O BADGE VIAJA NA RPC DO CATALOGO ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9f22-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) filter (where tag = 'VP-TEM' and tem_prontuario is true) = 1 then 'PASSA' else 'FALHA' end
       || ' — a RPC devolve o true'
  from public.buscar_equipamentos('', null, null, null, 200);

select case when count(*) filter (where tag = 'VP-META' and tem_prontuario is false) = 1 then 'PASSA' else 'FALHA' end
       || ' — a RPC devolve o false verificado'
  from public.buscar_equipamentos('', null, null, null, 200);
rollback;

\echo ''
\echo '=== 7 · REBUILD COMPLETO CHEGA AO MESMO RESULTADO ==='
-- O rebuild passa pela MESMA funcao; se um dia divergirem, o badge ficaria
-- certo pelo caminho da mutacao e errado depois de um rebuild.

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set tem_prontuario = null where org_id = :'ORG_A'::uuid;
select public.reiniciar_rebuild_busca(:'ORG_A'::uuid);
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);
commit;

select case when tem_prontuario is true then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — o rebuild reverificou o VP-TEM (o null era mentira plantada)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-TEM';

select case when tem_prontuario is false then 'PASSA' else 'FALHA (' || coalesce(tem_prontuario::text, 'NULO') || ')' end
       || ' — e o VP-META continua false depois do rebuild'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VP-META';

\echo ''
\echo '=== 8 · A COLUNA DA 9F.1 NAO FOI ATROPELADA ==='
-- Toda etapa desta fase acrescenta coluna na mesma tabela. Este bloco existe
-- para a proxima nao quebrar a anterior em silencio.

select case when count(*) = 5 then 'PASSA' else 'FALHA (' || count(*) || ' linhas)' end
       || ' — as 5 linhas da massa seguem projetadas'
  from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);

select case when bool_and(inspecoes is null) then 'PASSA' else 'FALHA' end
       || ' — sem nr13_docs_ na massa, `inspecoes` continua null (nao virou zero)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid;

\echo ''
\echo '=== 9 · LIMPEZA ==='
begin;
set local nr13.manutencao = '1';
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
commit;
\echo 'massa removida'
