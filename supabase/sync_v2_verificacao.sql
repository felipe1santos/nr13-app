-- ============================================================================
-- VERIFICACAO READ-ONLY DE sync_v2_por_org.sql
-- ============================================================================
-- Nao altera nada. Rode no SQL Editor e me diga o que a coluna `resumo`
-- devolveu — com isso eu retomo do §5 sem depender do navegador.
--
-- A ultima linha (NOTIFY) e a unica que "faz" algo, e o que ela faz e mandar o
-- PostgREST reler o schema. E ela que destrava a verificacao automatica: com o
-- cache atualizado, eu confiro colunas, tabela e permissoes por HTTP, de fora
-- do navegador, e sigo sozinho.
-- ============================================================================

select
      'colunas='   || (select count(*) from information_schema.columns
                        where table_schema='public' and table_name='org_sync'
                          and column_name in ('sync_tombstone','sync_merge_automatico'))
  || ' notnull='   || (select count(*) from information_schema.columns
                        where table_schema='public' and table_name='org_sync'
                          and column_name in ('sync_tombstone','sync_merge_automatico')
                          and is_nullable='NO')
  || ' defaults='  || coalesce((select string_agg(column_default, ',' order by column_name)
                        from information_schema.columns
                        where table_schema='public' and table_name='org_sync'
                          and column_name in ('sync_tombstone','sync_merge_automatico')), '-')
  || ' check='     || (select count(*) from pg_constraint
                        where conname='org_sync_merge_exige_tombstone')
  || ' tabela='    || (select count(*) from information_schema.tables
                        where table_schema='public' and table_name='org_dispositivos')
  || ' funcoes='   || (select count(*) from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname='public'
                          and p.proname in ('definir_sync_v2','sync_v2_prontidao',
                                            'registrar_dispositivo_sync',
                                            'guardar_exclusao_sem_marca',
                                            'ids_da_lista','eh_chave_colecao'))
  || ' trigger='   || (select count(*) from pg_trigger
                        where tgname='trg_guardar_exclusao_sem_marca' and not tgisinternal)
  as resumo;

-- ESPERADO, se a migration aplicou:
--   colunas=2 notnull=2 defaults=false,false check=1 tabela=1 funcoes=6 trigger=1

-- ── Nenhuma organizacao pode ter sido ativada ───────────────────────────────
select count(*) filter (where sync_tombstone)        as com_tombstone,
       count(*) filter (where sync_merge_automatico) as com_merge,
       count(*)                                      as total_orgs
  from public.org_sync;
-- ESPERADO: com_tombstone=0, com_merge=0

-- ── Permissoes: quem NAO pode executar o que liga a flag ────────────────────
select p.proname,
       coalesce(has_function_privilege('anon',          p.oid, 'EXECUTE'), false) as anon,
       coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) as authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public'
   and p.proname in ('definir_sync_v2','sync_v2_prontidao','registrar_dispositivo_sync')
 order by 1;
-- ESPERADO: definir_sync_v2 e sync_v2_prontidao -> false/false
--           registrar_dispositivo_sync          -> false/true

-- ── Destrava a verificacao automatica pelo PostgREST ────────────────────────
notify pgrst, 'reload schema';
