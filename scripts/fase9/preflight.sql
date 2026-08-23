-- ============================================================================
-- PREFLIGHT — rodar ANTES de qualquer coisa, e guardar a saída
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/preflight.sql > preflight-ANTES.txt
--
-- Em produção, o mesmo conteúdo no SQL Editor do Supabase.
--
-- SÓ LÊ. Não altera nada. Serve para duas coisas:
--   1. recusar o deploy se o banco não estiver no estado esperado;
--   2. gravar a linha de base contra a qual o pós-deploy é comparado.
--
-- **Guarde a saída em arquivo.** Sem ela, "antes × depois" vira memória.
-- ============================================================================
\pset pager off
\timing off

\echo '════════════════ 1 · IDENTIDADE DO BANCO ════════════════'
select current_database() as banco,
       current_setting('server_version') as versao,
       (select datcollate from pg_database where datname = current_database()) as collation,
       now() as momento;

\echo ''
\echo '════════════════ 2 · PRÉ-REQUISITOS DA FASE 9 ════════════════'
-- A Fase 9 assume o armazenamento v2 já em produção. Sem estes, PARE.
select 'app_storage'                as objeto,
       to_regclass('public.app_storage') is not null as existe
union all
select 'app_storage_excluidos',      to_regclass('public.app_storage_excluidos') is not null
union all
select 'org_sync',                   to_regclass('public.org_sync') is not null
union all
select 'aplicar_mutacao_storage',    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                              where n.nspname='public' and p.proname='aplicar_mutacao_storage')
union all
select 'org_atual',                  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                              where n.nspname='public' and p.proname='org_atual')
union all
select 'papel_atual',                exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                              where n.nspname='public' and p.proname='papel_atual');

\echo ''
\echo '════════════════ 3 · A FASE 9 JÁ ESTÁ INSTALADA? ════════════════'
\echo '  (num deploy NOVO, tudo aqui deve ser false)'
select 'equipamentos_index'  as objeto, to_regclass('public.equipamentos_index')  is not null as existe
union all select 'relatorios_index',     to_regclass('public.relatorios_index')     is not null
union all select 'busca_pendencias',     to_regclass('public.busca_pendencias')     is not null
union all select 'busca_rebuild_estado', to_regclass('public.busca_rebuild_estado') is not null
union all select 'coluna org_sync.busca_v9',
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='org_sync' and column_name='busca_v9')
union all select 'RPC ja mantem a projecao',
  exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='aplicar_mutacao_storage'
             and pg_get_functiondef(p.oid) like '%projetar_chave%')
order by 1;

\echo ''
\echo '════════════════ 4 · VOLATILIDADE DAS FUNÇÕES DA RLS ════════════════'
\echo '  (independente da Fase 9 — ver rls_funcoes_estaveis.sql)'
select p.proname,
       case p.provolatile when 's' then 'STABLE' when 'v' then 'VOLATILE' when 'i' then 'IMMUTABLE' end as volatilidade,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('org_atual','papel_atual','is_admin','acesso_vigente',
                     'assinatura_status_org','assinatura_permite_escrita')
 order by 1;

\echo ''
\echo '════════════════ 5 · TAMANHO DO QUE VAI SER PROJETADO ════════════════'
\echo '  Serve para estimar o backfill e o espaço da projeção.'
select count(*) filter (where chave like 'nr13_info_%'              and deletado_em is null) as fichas_de_equipamento,
       count(*) filter (where chave like 'nr13_historico_indice_%'  and deletado_em is null) as indices_de_relatorio,
       count(distinct org_id)                                                                as organizacoes,
       count(*)                                                                              as chaves_totais,
       pg_size_pretty(pg_total_relation_size('public.app_storage'))                          as tamanho_app_storage
  from public.app_storage;

\echo ''
\echo '  Por organização — para escolher a de validação (20 a 200):'
select org_id,
       count(*) filter (where chave like 'nr13_info_%' and deletado_em is null) as equipamentos,
       count(*) filter (where chave like 'nr13_historico_indice_%' and deletado_em is null) as com_relatorio,
       count(*) as chaves
  from public.app_storage
 group by org_id
 order by equipamentos desc;

\echo ''
\echo '════════════════ 6 · ESTADO DA FLAG (se a coluna existir) ════════════════'
select case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='org_sync' and column_name='busca_v9')
            then 'a coluna existe — ver a listagem abaixo'
            else 'coluna ainda nao existe (deploy novo)' end as situacao;

\echo ''
\echo '════════════════ 7 · CUSTO DE UMA LEITURA REAL, HOJE ════════════════'
\echo '  Guarde este plano. É o "antes" do item 4 do roteiro de deploy.'
\echo '  Troque o org_id pelo da organizacao escolhida antes de rodar.'
\echo ''
\echo '  begin;'
\echo '  set local role authenticated;'
\echo '  set local request.jwt.claims = ''{"sub":"<UID_DO_MESTRE>","role":"authenticated"}'';'
\echo '  explain (analyze, buffers)'
\echo '  select chave from public.app_storage where org_id = ''<ORG>'' order by chave limit 1000;'
\echo '  rollback;'

\echo ''
\echo '════════════════ FIM DO PREFLIGHT ════════════════'
