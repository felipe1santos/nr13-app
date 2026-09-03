-- ============================================================================
-- FASE 9 · 9F.4.1 — O LIVRO DE REGISTRO COMO CATALOGO, NO SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9f4.sql
--
-- Aplicar antes, NESTA ORDEM:
--   supabase/busca_index.sql        (as colunas `livro_entradas`/`livro_ultima`)
--   supabase/busca_manutencao.sql   (a projecao que conta)
--   supabase/busca_index_rpc.sql    (o dispatch de `nr13_livro_`)
--   supabase/busca_consulta.sql     (a RPC que devolve as colunas)
--   supabase/livro_v9_flag.sql
--
-- O QUE ESTE ARQUIVO PROVA, e que vitest nao alcanca:
--   · a contagem sai da VERDADE (`nr13_livro_<TAG>`), nunca de tabela propria —
--     o Livro nao ganha projecao autoritativa, so um contador de catalogo;
--   · `0` e "contei e nao ha"; `null` e "ninguem contou" — nunca se confundem;
--   · `nr13_livro_config_<TAG>` NAO cria equipamento fantasma "config_<TAG>";
--   · `nr13_termo_livro_<TAG>` nao mexe na contagem (e o termo, nao a entrada);
--   · a data da ULTIMA entrada e o `max`, e nao o ultimo elemento do array —
--     ocorrencia manual e retificacao entram fora de ordem cronologica;
--   · data ilegivel nao derruba a projecao do equipamento;
--   · salvar uma entrada reprojeta a contagem na mesma transacao;
--   · o numero viaja na RPC do catalogo;
--   · isolamento entre organizacoes;
--   · o rebuild completo chega ao MESMO resultado da mutacao;
--   · a flag `livro_v9` nasce desligada e nao atropela as 6 anteriores;
--   · as colunas da 9F.1, 9F.2 e 9F.3 seguem de pe;
--   · O LIVRO NAO E TOCADO: o conteudo das entradas em `app_storage` fica byte
--     a byte igual antes e depois de projetar.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- NENHUMA TAG real e usada. `EQUIPE TESTE` em particular NAO aparece: o livro
-- dela e protegido por imutabilidade e nao pode ser apagado nem recriado.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9f44-4000-8000-00000000000a'
\set ORG_B '00000000-9f44-4000-8000-00000000000b'

begin;
set local nr13.manutencao = '1';

delete from public.busca_rebuild_estado where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.calibracoes_index  where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.relatorios_index   where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
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
  from (values (:'ORG_A'::uuid, 'a9f4@local.test'),
               (:'ORG_B'::uuid, 'b9f4@local.test')) u(id, email);

-- `on conflict` porque o trigger `handle_new_user` JA cria a linha de perfil.
insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9f4@local.test', :'ORG_A'::uuid, 'mestre', true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9f4@local.test', :'ORG_B'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  email = excluded.email, org_id = excluded.org_id, papel = excluded.papel,
  ativo = excluded.ativo, role = excluded.role, plano = excluded.plano;

-- Seis equipamentos na org A, cada um exercitando um caso da regra:
--   VL-TRES    -> 3 entradas, fora de ordem cronologica -> 3, ultima 2026-07-10
--   VL-ZERO    -> sem a chave do livro                  -> 0 (contei, nao ha)
--   VL-VAZIO   -> chave presente com array []           -> 0, ultima nula
--   VL-LIXO    -> JSON ilegivel                         -> 0, e SOBREVIVE
--   VL-DATA    -> 2 entradas, uma com data impossivel   -> 2, ultima = a legivel
--   VL-CONFIG  -> SO config e termo                     -> 0, e sem fantasma
insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-TRES',   '{"descricao":"Vaso tres","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-ZERO',   '{"descricao":"Vaso zero","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-VAZIO',  '{"descricao":"Vaso vazio","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-LIXO',   '{"descricao":"Vaso lixo","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-DATA',   '{"descricao":"Vaso data","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_VL-CONFIG', '{"descricao":"Vaso config","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_info_VL-TRES',   '{"descricao":"Outra org","tipo":"vaso"}', 1, 'seed', now());

-- A ordem do array NAO e cronologica de proposito: 10/07 esta no MEIO. Se a
-- projecao pegasse "o ultimo elemento", diria 05/03 — que e o defeito que a
-- ocorrencia manual e a retificacao produzem na vida real.
insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_livro_VL-TRES',
   '[{"id":"e1","data":"02/01/2026","tipo":"Inspecao"},{"id":"e2","data":"10/07/2026","tipo":"Inspecao"},{"id":"e3","data":"05/03/2026","tipo":"Manutencao"}]',
   1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_livro_VL-VAZIO', '[]', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_livro_VL-LIXO',  '{isto nao e json', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_livro_VL-DATA',
   '[{"id":"d1","data":"31/02/2026"},{"id":"d2","data":"14/05/2026"}]', 1, 'seed', now()),
  -- VL-CONFIG so tem config e termo. Se qualquer um dos dois virasse contagem
  -- ou fantasma, este equipamento acusaria.
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_livro_config_VL-CONFIG', '{"numeroLivro":"001"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_termo_livro_VL-CONFIG',  '{"abertoEm":"01/01/2026"}', 1, 'seed', now()),
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_livro_VL-TRES', '[{"id":"x1","data":"01/01/2026"}]', 1, 'seed', now());

select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-TRES');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-ZERO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-VAZIO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-LIXO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-DATA');
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-CONFIG');
select public.projetar_equipamento(:'ORG_B'::uuid, 'VL-TRES');
commit;

\set QUIET off
\echo ''
\echo '=== 1 - A PROJECAO CONTA AS ENTRADAS ==='

select case when livro_entradas = 3 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - livro com 3 entradas vira 3'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-TRES';

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - equipamento SEM a chave do livro vira 0 (contei, e nao ha)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-ZERO';

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - chave presente com array VAZIO tambem vira 0'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-VAZIO';

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - livro com JSON ilegivel vira 0, e o equipamento SOBREVIVE'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-LIXO';

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - e a linha do JSON ilegivel existe mesmo (nao sumiu da busca)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-LIXO';

\echo ''
\echo '=== 2 - A DATA E O max, NAO O ULTIMO ELEMENTO ==='
-- Ocorrencia manual e retificacao entram no fim do array com data ANTERIOR. Ler
-- "o ultimo elemento" mostraria uma data ja passada como "ultimo registro".

select case when livro_ultima = date '2026-07-10' then 'PASSA' else 'FALHA (' || coalesce(livro_ultima::text,'NULO') || ')' end
       || ' - a ultima data e a MAIOR (10/07), nao a do ultimo item (05/03)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-TRES';

select case when livro_ultima is null then 'PASSA' else 'FALHA (' || livro_ultima::text || ')' end
       || ' - livro sem entrada nao inventa data'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-VAZIO';

select case when livro_entradas = 2 and livro_ultima = date '2026-05-14' then 'PASSA'
            else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ' / ' || coalesce(livro_ultima::text,'NULO') || ')' end
       || ' - data impossivel (31/02) e ignorada, e a entrada AINDA conta'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-DATA';

\echo ''
\echo '=== 3 - 0 E null NAO SAO A MESMA COISA ==='
-- A regra que impede a lista de escrever "nenhum livro gerado" sobre um parque
-- que ninguem projetou. `0` e um fato contado; `null` e a ausencia de contagem.

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set livro_entradas = null, livro_ultima = null
 where org_id = :'ORG_A'::uuid and tag = 'VL-ZERO';
commit;

select case when livro_entradas is null then 'PASSA' else 'FALHA' end
       || ' - o null plantado sobrevive ate alguem reprojetar'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-ZERO';

begin;
set local nr13.manutencao = '1';
select public.projetar_equipamento(:'ORG_A'::uuid, 'VL-ZERO');
commit;

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - e a reprojecao troca o null por 0 (o ON CONFLICT grava a coluna)'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-ZERO';

\echo ''
\echo '=== 4 - config E termo NAO SAO ENTRADA, E NAO CRIAM FANTASMA ==='

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - equipamento com SO config e termo conta 0 entradas'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-CONFIG';

-- `nr13_livro_config_X` casa o like de `nr13_livro_`, e sem a exclusao no
-- dispatch a TAG extraida sairia "config_X".
--
-- MEDIDO EM 02/09/2026, E O RESULTADO CONTRARIOU A EXPECTATIVA: removendo a
-- exclusao do dispatch, o fantasma NAO nasce. Quem o impede e a guarda de
-- `projetar_equipamento` — sem `nr13_info_<TAG>` viva ela apaga a linha e
-- retorna, entao "config_X" nunca vira equipamento pesquisavel.
--
-- A exclusao FICA, e por duas razoes que continuam valendo: (1) evita a
-- reprojecao inutil a cada gravacao de cabecalho de folha, e (2) e defesa em
-- profundidade — no dia em que alguem afrouxar aquela guarda, e ela que segura.
-- Mas o teste abaixo afirma o que e VERDADE, e nao o que seria conveniente: o
-- que ele prova e a guarda de `nr13_info_`, exercitada de proposito.
begin;
set local nr13.manutencao = '1';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_livro_config_VL-CONFIG');
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_termo_livro_VL-CONFIG');
-- E a prova direta da guarda: projetar uma TAG que NAO tem ficha viva.
select public.projetar_equipamento(:'ORG_A'::uuid, 'config_VL-CONFIG');
commit;

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ' fantasma(s))' end
       || ' - TAG sem nr13_info_ NAO vira linha, nem chamada direto na projecao'
  from public.equipamentos_index
 where org_id = :'ORG_A'::uuid and (tag like 'config\_%' or tag like 'livro\_%');

select case when count(*) = 6 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - a org A continua com exatamente 6 equipamentos'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid;

select case when livro_entradas = 0 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - e o VL-CONFIG real seguiu com a contagem dele, intacta'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-CONFIG';

\echo ''
\echo '=== 5 - O DISPATCH: SALVAR UMA ENTRADA REPROJETA NA MESMA TRANSACAO ==='

begin;
set local nr13.manutencao = '1';
update public.app_storage
   set valor = '[{"id":"e1","data":"02/01/2026"},{"id":"e2","data":"10/07/2026"},{"id":"e3","data":"05/03/2026"},{"id":"e4","data":"20/09/2026"}]',
       versao = 2
 where org_id = :'ORG_A'::uuid and chave = 'nr13_livro_VL-TRES';
select public.projetar_chave(:'ORG_A'::uuid, 'nr13_livro_VL-TRES');
commit;

select case when livro_entradas = 4 and livro_ultima = date '2026-09-20' then 'PASSA'
            else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ' / ' || coalesce(livro_ultima::text,'NULO') || ')' end
       || ' - entrada nova sobe a contagem E a data pelo dispatch'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-TRES';

\echo ''
\echo '=== 6 - O LIVRO NAO E TOCADO ==='
-- A projecao LE a verdade e nunca escreve nela. Se um dia alguem "melhorar" a
-- projecao normalizando o livro na origem, este bloco fica vermelho.

select case when valor = '[{"id":"e1","data":"02/01/2026"},{"id":"e2","data":"10/07/2026"},{"id":"e3","data":"05/03/2026"},{"id":"e4","data":"20/09/2026"}]'
            then 'PASSA' else 'FALHA' end
       || ' - o conteudo do livro em app_storage e byte a byte o mesmo'
  from public.app_storage where org_id = :'ORG_A'::uuid and chave = 'nr13_livro_VL-TRES';

select case when versao = 2 then 'PASSA' else 'FALHA (' || versao || ')' end
       || ' - e a versao da verdade nao foi mexida pela projecao'
  from public.app_storage where org_id = :'ORG_A'::uuid and chave = 'nr13_livro_VL-TRES';

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - a projecao nao criou tabela propria de livro'
  from information_schema.tables
 where table_schema = 'public' and table_name like '%livro%index%';

\echo ''
\echo '=== 7 - ISOLAMENTO ENTRE ORGANIZACOES ==='

select case when livro_entradas = 1 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - a MESMA TAG na org B tem a contagem DELA'
  from public.equipamentos_index where org_id = :'ORG_B'::uuid and tag = 'VL-TRES';

select case when livro_entradas = 4 then 'PASSA' else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ')' end
       || ' - e a da org A seguiu intacta'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-TRES';

\echo ''
\echo '=== 8 - O REBUILD CHEGA AO MESMO RESULTADO DA MUTACAO ==='

begin;
set local nr13.manutencao = '1';
update public.equipamentos_index set livro_entradas = 999, livro_ultima = date '1999-01-01'
 where org_id = :'ORG_A'::uuid;
select public.reiniciar_rebuild_busca(:'ORG_A'::uuid);
commit;

select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);
select public.reconstruir_indice_busca(:'ORG_A'::uuid, 1000);

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ' linha(s) com 999)' end
       || ' - o rebuild reescreveu TODAS as contagens plantadas'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and livro_entradas = 999;

select case when livro_entradas = 4 and livro_ultima = date '2026-09-20' then 'PASSA'
            else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ' / ' || coalesce(livro_ultima::text,'NULO') || ')' end
       || ' - e chegou ao MESMO numero da mutacao'
  from public.equipamentos_index where org_id = :'ORG_A'::uuid and tag = 'VL-TRES';

select case when (public.auditar_projecao(:'ORG_A'::uuid) ->> 'convergiu') = 'true' then 'PASSA' else 'FALHA' end
       || ' - a auditoria converge depois do rebuild';

\echo ''
\echo '=== 9 - O NUMERO VIAJA NA RPC DO CATALOGO ==='

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ORG_A')::text, true);

select case when livro_entradas = 4 and livro_ultima = date '2026-09-20' then 'PASSA'
            else 'FALHA (' || coalesce(livro_entradas::text,'NULO') || ' / ' || coalesce(livro_ultima::text,'NULO') || ')' end
       || ' - buscar_equipamentos devolve as duas colunas'
  from public.buscar_equipamentos('VL-TRES', null, null, null, 50);

select case when count(*) = 6 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - e a RPC so ve a organizacao do token'
  from public.buscar_equipamentos('', null, null, null, 200);
commit;

\echo ''
\echo '=== 10 - A FLAG NASCE DESLIGADA E NAO ATROPELA AS SEIS ANTERIORES ==='

begin;
set local nr13.manutencao = '1';
insert into public.org_sync (org_id, v2_ativa, busca_v9, boot_v9, inspecoes_v9, prontuarios_v9, calibracoes_v9)
values (:'ORG_A'::uuid, true, true, true, true, true, true)
on conflict (org_id) do update set v2_ativa = true, busca_v9 = true, boot_v9 = true,
  inspecoes_v9 = true, prontuarios_v9 = true, calibracoes_v9 = true;
commit;

select case when livro_v9 = false then 'PASSA' else 'FALHA' end
       || ' - org existente ganha a coluna DESLIGADA'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_livro_v9(:'ORG_A'::uuid, true);

select case when livro_v9 and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9 and prontuarios_v9 and calibracoes_v9
            then 'PASSA' else 'FALHA' end
       || ' - ligar a 7a flag preserva as 6 anteriores'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_livro_v9(:'ORG_A'::uuid, false);

select case when livro_v9 = false and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9 and prontuarios_v9 and calibracoes_v9
            then 'PASSA' else 'FALHA' end
       || ' - e o ROLLBACK desliga so ela'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select case when has_function_privilege('anon', p.oid, 'execute') = false
             and has_function_privilege('authenticated', p.oid, 'execute') = false
            then 'PASSA' else 'FALHA' end
       || ' - definir_livro_v9 nao e acessivel a anon nem a authenticated'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'definir_livro_v9';

\echo ''
\echo '=== 11 - AS ETAPAS ANTERIORES SEGUEM DE PE ==='

select case when count(*) = 4 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - as 4 colunas das etapas 9F.1/9F.2/9F.3/9F.4 coexistem'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipamentos_index'
   and column_name in ('inspecoes','tem_prontuario','calibracoes','livro_entradas');

select case when is_nullable = 'YES' and column_default is null then 'PASSA' else 'FALHA' end
       || ' - livro_entradas e NULLABLE e SEM default (o null tem significado)'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipamentos_index' and column_name = 'livro_entradas';

select case when is_nullable = 'YES' and column_default is null then 'PASSA' else 'FALHA' end
       || ' - livro_ultima idem'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipamentos_index' and column_name = 'livro_ultima';

\echo ''
\echo '=== LIMPEZA ==='
begin;
set local nr13.manutencao = '1';
delete from public.busca_rebuild_estado where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.calibracoes_index  where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.relatorios_index   where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.org_sync           where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
commit;
\echo 'massa removida'
