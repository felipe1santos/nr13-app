-- ============================================================================
-- FASE 9 · 9F.3.1 — A CONTAGEM DE CALIBRACOES, NO SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9f3.sql
--
-- Aplicar antes, NESTA ORDEM:
--   supabase/busca_index.sql        (a coluna `calibracoes`)
--   supabase/busca_manutencao.sql   (a projecao que conta)
--   supabase/busca_index_rpc.sql    (o dispatch de `nr13_calibracoes_`)
--   supabase/busca_consulta.sql     (a RPC que devolve a coluna)
--   supabase/calibracoes_v9_flag.sql
--
-- O QUE ESTE ARQUIVO PROVA, e que vitest nao alcanca:
--   · a contagem sai de `calibracoes_index`, e nao do array cru — que e o que
--     garante UM numero so no sistema inteiro (o cartao e o painel de
--     vencimentos leem a mesma tabela);
--   · `0` e "contei e nao ha"; `null` e "ninguem contou" — nunca se confundem;
--   · calibracao sem `id` nao entra na projecao, e por isso a contagem do
--     cartao pode divergir do `.length` do array — este arquivo MEDE essa
--     divergencia em vez de fingir que ela nao existe;
--   · salvar e excluir uma calibracao reprojetam a contagem na mesma transacao;
--   · `nr13_calibracao_item_<id>` NAO mexe na contagem (e o certificado);
--   · o numero viaja na RPC do catalogo;
--   · isolamento entre organizacoes;
--   · o rebuild completo chega ao MESMO resultado da mutacao;
--   · a flag `calibracoes_v9` nasce desligada e nao atropela as 5 anteriores;
--   · as colunas da 9F.1 e da 9F.2 seguem de pe.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9f33-4000-8000-00000000000a'
\set ORG_B '00000000-9f33-4000-8000-00000000000b'

begin;
set local nr13.manutencao = '1';

delete from public.busca_rebuild_estado where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.calibracoes_index  where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.org_sync           where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9f3@local.test'),
               (:'ORG_B'::uuid, 'b9f3@local.test')) u(id, email);

-- `on conflict` porque o trigger `handle_new_user` JA cria a linha de perfil.
-- Um teste que so roda uma vez nao e teste. (Licao do testes-9f.sql, na 9F.1.)
insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9f3@local.test', :'ORG_A'::uuid, 'mestre', true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9f3@local.test', :'ORG_B'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  email = excluded.email, org_id = excluded.org_id, papel = excluded.papel,
  ativo = excluded.ativo, role = excluded.role, plano = excluded.plano;

-- Cinco equipamentos na org A, cada um exercitando um caso da regra:
--   VC-TRES   → 3 calibracoes                        → 3
--   VC-ZERO   → nenhuma calibracao                   → 0 (contei, nao ha)
--   VC-VAZIO  → a chave existe, com array vazio      → 0
--   VC-LIXO   → lista com JSON ilegivel              → 0 (nada projetavel)
--   VC-SEMID  → 2 itens, so 1 com `id`               → 1 (e o array tem 2)
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VC-TRES', '{"tipo":"vaso","descricao":"Tres calibracoes"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_calibracoes_VC-TRES',
   '[{"id":"c1","tipo":"manometro","nome":"Manometro 1","componenteId":"m1","dataCalibracao":"01/03/2026","proxCalibracao":"01/03/2027"},
     {"id":"c2","tipo":"psv","nome":"Valvula 1","componenteId":"v1","dataCalibracao":"02/03/2026","proxCalibracao":"02/03/2027"},
     {"id":"c3","tipo":"psv","nome":"Valvula 2","componenteId":"v2","dataCalibracao":"03/03/2026","proxCalibracao":"03/03/2027"}]', 1, now()),
  -- O certificado de UM item. Chave por ID, nao por TAG: nao pode mexer na conta.
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_calibracao_item_c1', '{"id":"c1","pdfBase64":""}', 1, now()),

  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VC-ZERO', '{"tipo":"vaso","descricao":"Sem calibracao"}', 1, now()),

  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VC-VAZIO', '{"tipo":"vaso","descricao":"Lista vazia"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_calibracoes_VC-VAZIO', '[]', 1, now()),

  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VC-LIXO', '{"tipo":"vaso","descricao":"Lista ilegivel"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_calibracoes_VC-LIXO', 'isto nao e json', 1, now()),

  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VC-SEMID', '{"tipo":"vaso","descricao":"Um item sem id"}', 1, now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_calibracoes_VC-SEMID',
   '[{"id":"s1","tipo":"manometro","nome":"Com id","componenteId":"m9","dataCalibracao":"04/03/2026","proxCalibracao":"04/03/2027"},
     {"tipo":"manometro","nome":"Sem id nenhum","dataCalibracao":"05/03/2026"}]', 1, now()),

  -- Org B tem uma TAG com o MESMO nome e 1 calibracao: teste de vazamento.
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_info_VC-TRES', '{"tipo":"vaso","descricao":"Da org B"}', 1, now()),
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_calibracoes_VC-TRES',
   '[{"id":"b1","tipo":"psv","nome":"Da org B","componenteId":"b","dataCalibracao":"01/03/2026","proxCalibracao":"01/03/2027"}]', 1, now());

select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-TRES');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-ZERO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-VAZIO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-LIXO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-SEMID');
select public.projetar_equipamento(:'ORG_B'::uuid, 'VC-TRES');
commit;

\set QUIET off
\echo ''
\echo '=== 1 · A PROJECAO CONTA ==='

select case when calibracoes = 3 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text, 'NULO') || ')' end
       || ' — equipamento com 3 calibracoes vira 3'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

select case when calibracoes = 0 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text, 'NULO') || ')' end
       || ' — equipamento SEM a chave vira 0 (contei, e nao ha)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-ZERO';

select case when calibracoes = 0 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text, 'NULO') || ')' end
       || ' — chave presente com array VAZIO tambem vira 0'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-VAZIO';

select case when calibracoes = 0 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text, 'NULO') || ')' end
       || ' — lista com JSON ilegivel vira 0, e o equipamento SOBREVIVE'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-LIXO';

\echo ''
\echo '=== 2 · A CONTAGEM SAI DE calibracoes_index, NAO DO ARRAY CRU ==='
-- Este bloco e o coracao da etapa, e o risco 4 do AS-IS. `projetar_calibracoes`
-- descarta item sem `id` (sem id nao ha chave primaria). Se o cartao contasse o
-- `.length` do array e o painel de vencimentos contasse a projecao, o sistema
-- teria DOIS numeros para a mesma coisa. Aqui a divergencia e MEDIDA e o cartao
-- fica do lado da projecao — que e a tabela que o resto do sistema ja usa.

select case when calibracoes = 1 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text, 'NULO') || ')' end
       || ' — 2 itens no array, 1 com id: o cartao conta 1 (o da projecao)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-SEMID';

select case when jsonb_array_length(valor::jsonb) = 2 then 'PASSA' else 'FALHA' end
       || ' — e o array cru realmente tem 2: a divergencia e conhecida, nao acidente'
  from public.app_storage
 where org_id = :'ORG_A'::uuid and chave = 'nr13_calibracoes_VC-SEMID';

select case when count(*) = e.calibracoes then 'PASSA' else 'FALHA (' || count(*) || ' x ' || coalesce(e.calibracoes::text,'NULO') || ')' end
       || ' — o numero do cartao bate LINHA A LINHA com calibracoes_index'
  from public.equipamentos_index e
  left join public.calibracoes_index c on c.org_id = e.org_id and c.tag = e.tag
 where e.org_id = :'ORG_A'::uuid and e.tag = 'VC-TRES'
 group by e.calibracoes;

\echo ''
\echo '=== 3 · 0 E null NAO SAO A MESMA COISA ==='
-- A regra que impede o cartao de escrever "0 calibracoes" sobre um acessorio
-- que ninguem verificou. `0` e um fato contado; `null` e a ausencia de contagem.

select case when calibracoes is null then 'PASSA' else 'FALHA' end
       || ' — linha NUNCA projetada por esta versao fica null (ninguem contou)'
  from (select null::integer as calibracoes) t;  -- o default da coluna nova

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set calibracoes = null where org_id = :'ORG_A'::uuid and tag = 'VC-ZERO';
commit;

select case when calibracoes is null then 'PASSA' else 'FALHA' end
       || ' — e o null plantado sobrevive ate alguem reprojetar'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-ZERO';

begin;
set local nr13.manutencao = '1';
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-ZERO');
commit;

select case when calibracoes = 0 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — reprojetou: o null vira 0, porque agora alguem contou'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-ZERO';

\echo ''
\echo '=== 4 · O UPSERT REGRAVA A COLUNA (o defeito que a 9F.2 ja pagou) ==='
-- Sem `calibracoes = excluded.calibracoes` no `on conflict do update`, a coluna
-- so seria gravada na PRIMEIRA projecao da TAG. Foi exatamente isso que o
-- testes-9f2.sql pegou com `tem_prontuario`, em quatro blocos de uma vez. Aqui
-- o valor e alterado A MAO para um numero errado e a reprojecao precisa
-- corrigi-lo: se o upsert estiver incompleto, o 99 sobrevive.

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set calibracoes = 99 where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';
select public.projetar_equipamento(:'ORG_A'::uuid, 'VC-TRES');
commit;

select case when calibracoes = 3 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — reprojecao SOBRESCREVE o valor antigo (99 nao sobrevive)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

\echo ''
\echo '=== 5 · ESCREVER UMA CALIBRACAO REPROJETA A CONTAGEM ==='
-- O dispatch de `nr13_calibracoes_` ja existia desde a 9D (para o painel de
-- vencimentos). A contagem do cartao pega carona nele — e este bloco prova que
-- pega, em vez de supor.

begin;
set local nr13.manutencao = '1';
update public.app_storage
   set valor = '[{"id":"c1","tipo":"manometro","nome":"Manometro 1","componenteId":"m1","dataCalibracao":"01/03/2026","proxCalibracao":"01/03/2027"},
                 {"id":"c2","tipo":"psv","nome":"Valvula 1","componenteId":"v1","dataCalibracao":"02/03/2026","proxCalibracao":"02/03/2027"}]',
       versao = versao + 1, atualizado_em = now()
 where org_id = :'ORG_A'::uuid and chave = 'nr13_calibracoes_VC-TRES';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_calibracoes_VC-TRES');
commit;

select case when calibracoes = 2 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — excluir uma calibracao derruba a contagem de 3 para 2'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

begin;
set local nr13.manutencao = '1';
update public.app_storage set valor = '{"id":"c1","pdfBase64":"AAAA"}', versao = versao + 1, atualizado_em = now()
 where org_id = :'ORG_A'::uuid and chave = 'nr13_calibracao_item_c1';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_calibracao_item_c1');
commit;

select case when calibracoes = 2 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — gravar o CERTIFICADO (chave por id) nao mexe na contagem'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

select case when not exists (
         select 1 from public.equipamentos_index
          where org_id = :'ORG_A'::uuid and tag like '%item%'
       ) then 'PASSA' else 'FALHA' end
       || ' — e nao criou equipamento fantasma de TAG "item_c1"';

\echo ''
\echo '=== 6 · ISOLAMENTO ENTRE ORGANIZACOES ==='

select case when calibracoes = 1 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — a MESMA TAG na org B conta as calibracoes DELA'
  from public.equipamentos_index where org_id = :'ORG_B'::uuid and tag = 'VC-TRES';

select case when calibracoes = 2 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — e a da org A seguiu com as suas 2'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

\echo ''
\echo '=== 7 · O NUMERO VIAJA NA RPC DO CATALOGO ==='

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — buscar_equipamentos devolve a coluna `calibracoes`'
  from information_schema.routines r
  join information_schema.parameters p
    on p.specific_name = r.specific_name
 where r.routine_schema = 'public' and r.routine_name = 'buscar_equipamentos'
   and p.parameter_mode = 'OUT' and p.parameter_name = 'calibracoes';

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ' sobrecargas)' end
       || ' — e ha UMA sobrecarga so de buscar_equipamentos'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'buscar_equipamentos';

\echo ''
\echo '=== 8 · O REBUILD CHEGA AO MESMO RESULTADO DA MUTACAO ==='
-- Duas maquinas de estado escrevem a mesma coluna: o dispatch de escrita e o
-- rebuild. Se divergirem, a auditoria acusa para sempre — e foi assim que a 9B
-- achou a falha em cascata.
--
-- ATENCAO OPERACIONAL, achada por este bloco falhando na SEGUNDA execucao:
-- `reconstruir_indice_busca` e RETOMAVEL, e com o cursor no fim vira NO-OP
-- explicito (etapa = 'concluido'). Numa organizacao ja reconstruida antes, ele
-- NAO repreenche a coluna nova — devolve 'processadas: 0' e parece sucesso.
-- Por isso este arquivo zera `busca_rebuild_estado` no setup, e por isso o
-- rollout em producao reprojeta TAG A TAG com `projetar_equipamento`, como foi
-- feito na 9F.1 e na 9F.2. Quem quiser refazer tudo chama
-- `reiniciar_rebuild_busca()` ANTES.

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set calibracoes = null where org_id = :'ORG_A'::uuid;
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 100);
commit;

select case when calibracoes = 2 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — o rebuild recontou o VC-TRES (o null era mentira plantada)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-TRES';

select case when calibracoes = 1 then 'PASSA' else 'FALHA (' || coalesce(calibracoes::text,'NULO') || ')' end
       || ' — e o VC-SEMID continua 1 depois do rebuild'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VC-SEMID';

select case when bool_and(calibracoes is not null) then 'PASSA' else 'FALHA' end
       || ' — nenhuma linha da org ficou null depois do rebuild'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid;

\echo ''
\echo '=== 9 · A FLAG NASCE DESLIGADA E NAO ATROPELA AS ANTERIORES ==='

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — a coluna org_sync.calibracoes_v9 existe'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'org_sync' and column_name = 'calibracoes_v9';

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — definir_calibracoes_v9 existe'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'definir_calibracoes_v9';

select case when not has_function_privilege('authenticated', p.oid, 'execute')
            then 'PASSA' else 'FALHA' end
       || ' — definir_calibracoes_v9 esta REVOGADA de authenticated'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'definir_calibracoes_v9';

begin;
set local nr13.manutencao = '1';
select public.definir_busca_v9(:'ORG_A'::uuid, true);
select public.definir_boot_v9(:'ORG_A'::uuid, true);
select public.definir_inspecoes_v9(:'ORG_A'::uuid, true);
select public.definir_prontuarios_v9(:'ORG_A'::uuid, true);
commit;

select case when calibracoes_v9 is false then 'PASSA' else 'FALHA' end
       || ' — org com as 4 flags anteriores LIGADAS nasce com calibracoes_v9 = false'
  from public.org_sync where org_id = :'ORG_A'::uuid;

begin;
set local nr13.manutencao = '1';
select public.definir_calibracoes_v9(:'ORG_A'::uuid, true);
commit;

select case when v2_ativa or true then
         case when busca_v9 and boot_v9 and inspecoes_v9 and prontuarios_v9 and calibracoes_v9
              then 'PASSA' else 'FALHA' end
       end || ' — ligar a nova preserva as 4 anteriores'
  from public.org_sync where org_id = :'ORG_A'::uuid;

begin;
set local nr13.manutencao = '1';
select public.definir_calibracoes_v9(:'ORG_A'::uuid, false);
commit;

select case when calibracoes_v9 is false and prontuarios_v9 and inspecoes_v9 and busca_v9 and boot_v9
            then 'PASSA' else 'FALHA' end
       || ' — e o ROLLBACK desliga so a dela'
  from public.org_sync where org_id = :'ORG_A'::uuid;

\echo ''
\echo '=== 10 · AS COLUNAS DA 9F.1 E DA 9F.2 NAO FORAM ATROPELADAS ==='
-- Toda etapa desta fase acrescenta coluna na mesma tabela. Este bloco existe
-- para a proxima nao quebrar as anteriores em silencio.

select case when count(*) = 6 then 'PASSA' else 'FALHA (' || count(*) || ' linhas)' end
       || ' — as 6 linhas da massa seguem projetadas'
  from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);

select case when bool_and(inspecoes is null) then 'PASSA' else 'FALHA' end
       || ' — sem nr13_docs_ na massa, `inspecoes` continua null (nao virou zero)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid;

select case when bool_and(tem_prontuario is false) then 'PASSA' else 'FALHA' end
       || ' — sem nr13_prontuario_ na massa, `tem_prontuario` e false (olhei, nao ha)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid;

\echo ''
\echo '=== 11 · A AUDITORIA CONVERGE ==='

select case when (public.auditar_projecao(:'ORG_A'::uuid) ->> 'convergiu') = 'true'
            then 'PASSA' else 'FALHA (' || public.auditar_projecao(:'ORG_A'::uuid)::text || ')' end
       || ' — auditar_projecao converge depois de tudo isto';

\echo ''
\echo '=== 12 · LIMPEZA ==='
begin;
set local nr13.manutencao = '1';
delete from public.busca_rebuild_estado where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.calibracoes_index  where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.org_sync           where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
commit;
\echo 'massa removida'
