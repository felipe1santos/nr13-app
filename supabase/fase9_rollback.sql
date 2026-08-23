-- ============================================================================
-- ROLLBACK COMPLETO DA FASE 9 (9A + 9B + 9C)
-- ============================================================================
--
-- Devolve o banco ao estado ANTERIOR à Fase 9, exatamente. Depois de rodar
-- este arquivo, o sistema volta a funcionar como funcionava antes: a
-- hidratação integral, a lista em memória, a busca no cliente.
--
-- ---------------------------------------------------------------------------
-- ANTES DE USAR: quase sempre NÃO É ISTO QUE VOCÊ QUER
-- ---------------------------------------------------------------------------
-- Para desligar a busca V9 de uma organização, o caminho é a FLAG:
--
--     select public.definir_busca_v9('<ORG>', false);
--
-- Isso é instantâneo, não apaga nada, e a tela antiga volta inteira. Este
-- arquivo só é necessário para remover a Fase 9 do banco por completo — por
-- exemplo, para simular um deploy do zero, ou num abandono de rumo.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTE ROLLBACK **NÃO** PERDE
-- ---------------------------------------------------------------------------
-- Nenhum dado empresarial. `app_storage` continua sendo a verdade e não é
-- tocada. As projeções são DERIVADAS: reconstruí-las é rodar
-- `reconstruir_indice_busca` de novo depois de reinstalar.
--
-- ---------------------------------------------------------------------------
-- A ORDEM IMPORTA, e é a INVERSA da instalação
-- ---------------------------------------------------------------------------
--   1. a RPC volta ao corpo original — para de manter a projeção
--   2. as funções que só a Fase 9 usa
--   3. as tabelas de projeção
--   4. a coluna da flag
--
-- Fazer o contrário — apagar as tabelas antes de a RPC parar de escrever nelas
-- — faria toda gravação de equipamento cair na pendência até a RPC ser
-- trocada. A projeção falharia sem derrubar a verdade (é o desenho da 9B), mas
-- seria barulho inútil.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · A RPC DE ESCRITA VOLTA AO CORPO ORIGINAL
-- ---------------------------------------------------------------------------
-- **Rode `busca_index_rpc_rollback.sql` ANTES deste arquivo.** Ele restaura
-- `aplicar_mutacao_storage` exatamente como estava — o corpo foi extraído por
-- `pg_get_functiondef` antes da alteração da 9B, não reconstruído de memória.
--
-- A verificação abaixo recusa continuar se isso não tiver sido feito, porque
-- apagar `projetar_chave` com a RPC ainda chamando-a transformaria toda
-- escrita numa pendência.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'aplicar_mutacao_storage'
       and pg_get_functiondef(p.oid) like '%projetar_chave%'
  ) then
    raise exception
      'PARE: aplicar_mutacao_storage ainda chama projetar_chave. Rode supabase/busca_index_rpc_rollback.sql primeiro.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · FUNÇÕES
-- ---------------------------------------------------------------------------
-- Consulta e contagem (9C)
drop function if exists public.buscar_equipamentos(text, text, text, text, integer);
drop function if exists public.contar_equipamentos(text, text, text, integer);
drop function if exists public.f9_tsquery(text);
drop function if exists public.f9_normalizar(text);

-- Flag (9C)
drop function if exists public.definir_busca_v9(uuid, boolean);

-- Projeção, manutenção e auditoria (9A/9B)
drop function if exists public.projetar_chave(uuid, text);
drop function if exists public.projetar_equipamento(uuid, text);
drop function if exists public.projetar_relatorios(uuid, text);
drop function if exists public.reconstruir_indice_busca(uuid, integer);
drop function if exists public.reiniciar_rebuild_busca(uuid);
drop function if exists public.reparar_pendencias(uuid, integer);
drop function if exists public.reparar_divergencias(uuid, integer);
drop function if exists public.auditar_projecao(uuid);
drop function if exists public.f9_num(text);
drop function if exists public.f9_data(text);
drop function if exists public.f9_json(text);

-- ---------------------------------------------------------------------------
-- 3 · TABELAS
-- ---------------------------------------------------------------------------
-- `cascade` leva junto as políticas e os índices delas. Nenhuma outra tabela
-- do sistema referencia estas — são projeções, ninguém aponta para elas.
drop table if exists public.equipamentos_index   cascade;
drop table if exists public.relatorios_index     cascade;
drop table if exists public.busca_pendencias     cascade;
drop table if exists public.busca_rebuild_estado cascade;

-- ---------------------------------------------------------------------------
-- 4 · A COLUNA DA FLAG
-- ---------------------------------------------------------------------------
-- Por último, e é o único ponto em que se apaga algo que um humano escolheu:
-- quais organizações estavam com a busca ligada. Se o plano é reinstalar,
-- ANOTE a lista antes:
--
--     select org_id from public.org_sync where busca_v9;
alter table public.org_sync drop column if exists busca_v9;

-- ---------------------------------------------------------------------------
-- 5 · CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'objetos da Fase 9 restantes (deve ser 0)' as conferencia, count(*) as n
  from (
    select 1 from pg_tables
     where schemaname = 'public'
       and tablename in ('equipamentos_index','relatorios_index','busca_pendencias','busca_rebuild_estado')
    union all
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('buscar_equipamentos','contar_equipamentos','f9_tsquery','f9_normalizar',
                         'definir_busca_v9','projetar_chave','projetar_equipamento','projetar_relatorios',
                         'reconstruir_indice_busca','reiniciar_rebuild_busca','reparar_pendencias',
                         'reparar_divergencias','auditar_projecao','f9_num','f9_data','f9_json')
    union all
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'org_sync' and column_name = 'busca_v9'
  ) x;

select 'a VERDADE continua intacta' as conferencia, count(*) as chaves from public.app_storage;
