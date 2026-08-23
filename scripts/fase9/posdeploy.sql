-- ============================================================================
-- PÓS-DEPLOY — rodar DEPOIS do SQL da Fase 9, com a flag ainda DESLIGADA
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/posdeploy.sql > posdeploy-DEPOIS.txt
--
-- SÓ LÊ. A pergunta que ele responde é: **os objetos entraram certos, e o
-- sistema continua se comportando como antes?**
--
-- Com a flag desligada — que é o estado logo após o deploy — NADA muda para o
-- usuário. A projeção existe, passa a ser mantida a cada escrita, e ninguém a
-- lê. É isso que este arquivo confirma.
-- ============================================================================
\pset pager off

\echo '════════════════ 1 · OS OBJETOS ENTRARAM ════════════════'
select 'equipamentos_index'  as objeto, to_regclass('public.equipamentos_index')  is not null as ok
union all select 'relatorios_index',     to_regclass('public.relatorios_index')     is not null
union all select 'busca_pendencias',     to_regclass('public.busca_pendencias')     is not null
union all select 'busca_rebuild_estado', to_regclass('public.busca_rebuild_estado') is not null
order by 1;

select proname as funcao_presente
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and proname in ('buscar_equipamentos','contar_equipamentos','f9_tsquery','f9_normalizar',
                   'f9_num','f9_data','f9_json','definir_busca_v9','projetar_chave',
                   'projetar_equipamento','projetar_relatorios','reconstruir_indice_busca',
                   'reiniciar_rebuild_busca','reparar_pendencias','reparar_divergencias',
                   'auditar_projecao')
 order by 1;

\echo ''
\echo '  Esperado: 4 tabelas e 16 funções.'

\echo ''
\echo '════════════════ 2 · A COLLATION DA `tag` — o passo que se erra ════════════════'
\echo '  Precisa ser "C" nas DUAS colunas. Se vier "default", o'
\echo '  busca_index_indices.sql nao rodou, ou rodou fora de ordem.'
select a.attname as coluna, coalesce(c.collname, '(padrao)') as collation,
       (c.collname = 'C') as ok
  from pg_attribute a
  left join pg_collation c on c.oid = a.attcollation
 where a.attrelid = 'public.equipamentos_index'::regclass
   and a.attname in ('tag','serie_norm')
 order by 1;

\echo ''
\echo '════════════════ 3 · COLUNAS DERIVADAS E ÍNDICES ════════════════'
select column_name, data_type, is_generated
  from information_schema.columns
 where table_schema='public' and table_name='equipamentos_index'
   and column_name in ('busca','serie_norm','foto_ref','pmta_mpa','pth_mpa','resultado',
                       'volume_m3','fluido','classe_fluido','vida_anos','tem_cliente','unidade')
 order by 1;

select indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as tamanho
  from pg_indexes where tablename in ('equipamentos_index','relatorios_index') order by 1;

\echo ''
\echo '  Esperado: 12 colunas (busca e serie_norm como ALWAYS geradas) e 6 indices'
\echo '  (equipamentos_index: pkey, busca_idx, serie_idx, filtro_idx; relatorios_index:'
\echo '   pkey, org_tag_idx).'

\echo ''
\echo '════════════════ 4 · A RPC PASSOU A MANTER A PROJEÇÃO ════════════════'
select exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='aplicar_mutacao_storage'
     and pg_get_functiondef(p.oid) like '%projetar_chave%'
) as rpc_mantem_projecao;

\echo ''
\echo '════════════════ 5 · SEGURANÇA ════════════════'
select tablename, policyname, cmd, roles::text
  from pg_policies
 where schemaname='public' and tablename in ('equipamentos_index','relatorios_index')
 order by tablename;

\echo ''
\echo '  Escrita nas projecoes: NINGUEM, por nenhum papel. Sem policy de'
\echo '  insert/update/delete, a RLS nega por padrao — e isso e o fail closed.'
select c.relname as tabela, c.relrowsecurity as rls_ligada
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
   and c.relname in ('equipamentos_index','relatorios_index','busca_pendencias','busca_rebuild_estado')
 order by 1;

\echo ''
\echo '  Quem pode EXECUTAR as RPCs de busca (anon NAO pode aparecer):'
select p.proname,
       coalesce(array_to_string(array(
         select a.grantee::text from information_schema.role_routine_grants a
          where a.specific_name = p.proname || '_' || p.oid and a.privilege_type='EXECUTE'
            and a.grantee <> 'postgres'), ', '), '(ninguem)') as quem_executa
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('buscar_equipamentos','contar_equipamentos')
 order by 1;

\echo ''
\echo '════════════════ 6 · A FLAG NASCEU DESLIGADA ════════════════'
select count(*) filter (where busca_v9) as organizacoes_com_busca_v9_LIGADA,
       count(*)                          as organizacoes_em_org_sync
  from public.org_sync;

\echo ''
\echo '  Esperado logo apos o deploy: ZERO ligadas.'

\echo ''
\echo '════════════════ 7 · NADA FOI PROJETADO AINDA ════════════════'
\echo '  O deploy do SQL NAO faz backfill. A projecao so passa a receber o que'
\echo '  for ESCRITO a partir de agora; o historico entra pelo backfill.'
select (select count(*) from public.equipamentos_index) as linhas_em_equipamentos_index,
       (select count(*) from public.relatorios_index)   as linhas_em_relatorios_index,
       (select count(*) from public.busca_pendencias)   as pendencias;

\echo ''
\echo '════════════════ 8 · A VERDADE NÃO FOI TOCADA ════════════════'
select count(*) as chaves_em_app_storage,
       pg_size_pretty(pg_total_relation_size('public.app_storage')) as tamanho
  from public.app_storage;

\echo ''
\echo '  Compare com o item 5 do preflight. Tem de ser IGUAL.'

\echo ''
\echo '════════════════ FIM DO PÓS-DEPLOY ════════════════'
