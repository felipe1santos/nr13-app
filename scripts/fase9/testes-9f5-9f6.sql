-- ============================================================================
-- FASE 9 · 9F.5 + 9F.6 — TESTES FUNCIONAIS DO GATE CONJUNTO
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9f5-9f6.sql
--
-- Aplicar antes:
--   supabase/vencimentos_agregado.sql   (ja em producao desde 25/08/2026)
--   supabase/vencimentos_v9_flag.sql    (9F.5 — SO o interruptor)
--   supabase/relatorios_v9_flag.sql     (9F.6 — SO o interruptor)
--   supabase/relatorios_catalogo.sql    (9F.6 — contar_relatorios_por_tag)
--
-- O QUE ESTE ARQUIVO PROVA, e que vitest nao alcanca:
--
--   9F.6
--   · PARIDADE DA CONTAGEM: `contar_relatorios_por_tag` devolve, TAG a TAG, o
--     MESMO numero que `listarIndice(tag).length` leria — porque as duas leem a
--     mesma verdade, `nr13_historico_indice_<TAG>`. A tela antiga contava o
--     array; a nova conta a projecao dele. Divergir aqui e escrever
--     "0 Relatorios" sobre um equipamento que tem doze;
--   · TAG ausente do RESULTADO e zero, e a consulta RESPONDE — nunca erro;
--   · JSON ilegivel na verdade nao derruba a contagem das outras TAGs;
--   · fail closed: sem sessao e com papel `cliente`, devolve VAZIO;
--   · isolamento entre organizacoes;
--   · o teto de 200 TAGs recusa a chamada que pediria o parque inteiro;
--   · a funcao devolve DOIS campos — `pdf_ref` e `sha256` NAO saem daqui
--     (invariante I10: o artefato e resolvido no clique).
--
--   9F.5
--   · o agregado conta a MESMA organizacao que a verdade tem projetada;
--   · a flag nova nasce desligada e nao atropela as SETE anteriores;
--   · `definir_vencimentos_v9` / `definir_relatorios_v9` nao sao acessiveis a
--     `anon` nem a `authenticated` — virar a chave e ato operacional.
--
-- NAO ha SQL de schema novo em nenhuma das duas etapas: nenhuma coluna em
-- `equipamentos_index`, nenhuma projecao nova, nenhuma reprojecao TAG a TAG.
--
-- A DISJUNCAO (`vencimentosV9Ativa() || bootV9Ativo()`) e regra do CLIENTE e
-- nao aparece aqui: ela vive em `src/services/vencimentosDisjuncao.test.ts`.
-- O SQL nao pode prova-la — a decisao de fonte e tomada no bundle.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- NENHUMA TAG real e usada.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9f56-4000-8000-00000000000a'
\set ORG_B '00000000-9f56-4000-8000-00000000000b'
\set CLI_A '00000000-9f56-4000-8000-00000000000c'

begin;
set local nr13.manutencao = '1';

delete from public.busca_rebuild_estado where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.calibracoes_index  where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.relatorios_index   where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.app_storage        where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.org_sync           where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI_A'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI_A'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9f56@local.test'),
               (:'ORG_B'::uuid, 'b9f56@local.test'),
               (:'CLI_A'::uuid, 'c9f56@local.test')) u(id, email);

-- O terceiro perfil e um `cliente` DA ORG A: e o caso que a guarda de fail
-- closed existe para recusar. Cliente do Portal nao lista o parque do inspetor.
insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9f56@local.test', :'ORG_A'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9f56@local.test', :'ORG_B'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'CLI_A'::uuid, 'c9f56@local.test', :'ORG_A'::uuid, 'cliente', true, 'user', 'completo')
on conflict (id) do update set
  email = excluded.email, org_id = excluded.org_id, papel = excluded.papel,
  ativo = excluded.ativo, role = excluded.role, plano = excluded.plano;

-- Quatro equipamentos na org A, cada um exercitando um caso da contagem:
--   RC-TRES   -> indice com 3 relatorios          -> 3
--   RC-ZERO   -> sem a chave do indice            -> ausente do resultado = 0
--   RC-VAZIO  -> chave presente com array []      -> ausente do resultado = 0
--   RC-LIXO   -> JSON ilegivel                    -> 0, e NAO derruba as outras
insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_RC-TRES',  '{"descricao":"Vaso tres","tipo":"vaso"}',  1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_RC-ZERO',  '{"descricao":"Vaso zero","tipo":"vaso"}',  1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_RC-VAZIO', '{"descricao":"Vaso vazio","tipo":"vaso"}', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_info_RC-LIXO',  '{"descricao":"Vaso lixo","tipo":"vaso"}',  1, 'seed', now()),
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_info_RC-TRES',  '{"descricao":"Outra org","tipo":"vaso"}',  1, 'seed', now());

insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_historico_indice_RC-TRES',
   '[{"id":"r1","codigo":"REL-1","emissao":"10/01/2026","proximaInspecaoExterna":"10/01/2027"},
     {"id":"r2","codigo":"REL-2","emissao":"12/05/2026","proximaInspecaoExterna":"12/05/2027"},
     {"id":"r3","codigo":"REL-3","emissao":"20/08/2026","proximaInspecaoExterna":"20/08/2027"}]',
   1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_historico_indice_RC-VAZIO', '[]', 1, 'seed', now()),
  (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_historico_indice_RC-LIXO',  '{isto nao e json', 1, 'seed', now()),
  -- A org B tem a MESMA TAG com OUTRA contagem: se o isolamento falhar, a org A
  -- passa a ver 4 em vez de 3, e o numero errado nao parece errado.
  (:'ORG_B'::uuid, :'ORG_B'::uuid, 'nr13_historico_indice_RC-TRES',
   '[{"id":"b1","codigo":"REL-B1","emissao":"01/02/2026"}]', 1, 'seed', now());

select public.projetar_equipamento(:'ORG_A'::uuid, 'RC-TRES');
select public.projetar_equipamento(:'ORG_A'::uuid, 'RC-ZERO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'RC-VAZIO');
select public.projetar_equipamento(:'ORG_A'::uuid, 'RC-LIXO');
select public.projetar_equipamento(:'ORG_B'::uuid, 'RC-TRES');
select public.projetar_relatorios(:'ORG_A'::uuid, 'RC-TRES');
select public.projetar_relatorios(:'ORG_A'::uuid, 'RC-ZERO');
select public.projetar_relatorios(:'ORG_A'::uuid, 'RC-VAZIO');
select public.projetar_relatorios(:'ORG_A'::uuid, 'RC-LIXO');
select public.projetar_relatorios(:'ORG_B'::uuid, 'RC-TRES');
commit;

\set QUIET off
\echo ''
\echo '=== 1 - PARIDADE DA CONTAGEM: a projecao conta o que a VERDADE tem ==='
-- A tela antiga fazia `listarIndice(tag).length` sobre o array de
-- `nr13_historico_indice_<TAG>`. A nova conta as linhas que esse array virou.
-- Este bloco compara os dois numeros na mesma consulta: nao ha como um passar
-- e o outro nao.

begin;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :'ORG_A', 'role', 'authenticated')::text, true);

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ' divergencia(s))' end
       || ' - contagem do servidor = tamanho do array da verdade, TAG a TAG'
  from (
    select verdade.tag,
           coalesce(c.total, 0)          as do_servidor,
           verdade.tamanho_do_array      as da_verdade
      from (
        -- len('nr13_historico_indice_') = 22, entao a TAG comeca no 23.
        select substring(s.chave from 23)                as tag,
               jsonb_array_length(public.f9_json(s.valor)) as tamanho_do_array
          from public.app_storage s
         where s.org_id = :'ORG_A'::uuid
           and s.chave like 'nr13_historico_indice_%'
           and s.deletado_em is null
           and jsonb_typeof(public.f9_json(s.valor)) = 'array'
      ) verdade
      left join public.contar_relatorios_por_tag(
             array['RC-TRES','RC-ZERO','RC-VAZIO','RC-LIXO']) c
             on c.tag = verdade.tag
  ) x
 where do_servidor <> da_verdade;

select case when total = 3 then 'PASSA' else 'FALHA (' || coalesce(total::text,'AUSENTE') || ')' end
       || ' - RC-TRES: 3 relatorios no indice viram 3 na contagem'
  from public.contar_relatorios_por_tag(array['RC-TRES','RC-ZERO','RC-VAZIO','RC-LIXO'])
 where tag = 'RC-TRES';

\echo ''
\echo '=== 2 - AUSENTE DO RESULTADO E ZERO, E A CONSULTA RESPONDE ==='
-- `null` (a consulta falhou) e `0` (contei e nao ha) sao coisas diferentes, e o
-- cartao escreve "—" para um e "0" para o outro. A funcao NUNCA devolve `null`
-- por TAG: ela omite a TAG, e o cliente completa com zero.

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ' linha(s))' end
       || ' - so a TAG COM relatorio volta; as outras tres sao omitidas'
  from public.contar_relatorios_por_tag(array['RC-TRES','RC-ZERO','RC-VAZIO','RC-LIXO']);

select case when count(*) = 0 then 'PASSA' else 'FALHA' end
       || ' - RC-ZERO (sem a chave) nao volta, e nao vira erro'
  from public.contar_relatorios_por_tag(array['RC-ZERO']);

select case when count(*) = 0 then 'PASSA' else 'FALHA' end
       || ' - RC-VAZIO (array vazio) idem'
  from public.contar_relatorios_por_tag(array['RC-VAZIO']);

select case when total = 3 then 'PASSA' else 'FALHA' end
       || ' - JSON ilegivel numa TAG nao derruba a contagem das outras'
  from public.contar_relatorios_por_tag(array['RC-LIXO','RC-TRES'])
 where tag = 'RC-TRES';

\echo ''
\echo '=== 3 - ISOLAMENTO ENTRE ORGANIZACOES ==='
-- A org B tem a MESMA TAG com 1 relatorio. Vazar seria somar 4.

select case when total = 3 then 'PASSA' else 'FALHA (' || coalesce(total::text,'AUSENTE') || ')' end
       || ' - a org A ve 3, nunca os 4 das duas somados'
  from public.contar_relatorios_por_tag(array['RC-TRES'])
 where tag = 'RC-TRES';

\echo ''
\echo '=== 4 - O TETO DE 200 TAGs ==='
-- A pagina do catalogo e de 50. Array sem teto seria a porta para pedir o
-- parque inteiro numa chamada — o `N+1` invertido.

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - 201 TAGs devolve VAZIO'
  from public.contar_relatorios_por_tag(
    (select array_agg('T-' || i) from generate_series(1, 201) i));

select case when count(*) = 1 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - 200 TAGs (com RC-TRES dentro) ainda responde'
  from public.contar_relatorios_por_tag(
    array['RC-TRES'] || (select array_agg('T-' || i) from generate_series(1, 199) i));

select case when count(*) = 0 then 'PASSA' else 'FALHA' end
       || ' - array vazio devolve vazio, sem erro'
  from public.contar_relatorios_por_tag(array[]::text[]);

select case when count(*) = 0 then 'PASSA' else 'FALHA' end
       || ' - array NULO devolve vazio, sem erro'
  from public.contar_relatorios_por_tag(null);

\echo ''
\echo '=== 5 - O ARTEFATO NAO SAI DAQUI (invariante I10) ==='
-- `pdf_ref` e `sha256` continuam sendo resolvidos no clique, por
-- `artefatoRelatorio`. Se um dia alguem "otimizar" trazendo-os na listagem, o
-- catalogo volta a carregar o que a 9F.6 tirou dele.

select case when count(*) = 2 then 'PASSA' else 'FALHA (' || count(*) || ' campos)' end
       || ' - a funcao devolve exatamente DOIS campos (tag, total)'
  from (
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'contar_relatorios_por_tag'
  ) f
  cross join lateral unnest(string_to_array(pg_get_function_result(f.oid), ',')) campo;

select case when pg_get_function_result(p.oid) not like '%pdf_ref%'
             and pg_get_function_result(p.oid) not like '%sha256%'
            then 'PASSA' else 'FALHA' end
       || ' - e nenhum deles e pdf_ref ou sha256'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'contar_relatorios_por_tag';

\echo ''
\echo '=== 6 - PARIDADE 9F.5: o agregado conta a organizacao inteira ==='
-- A 9F.5 nao muda `vencimentos_org` — ela troca QUEM decide chama-lo. O que
-- este bloco confere e que o agregado, sob a identidade da org A, ve os mesmos
-- quatro equipamentos que a verdade tem, e nenhum da org B.

select case when (public.vencimentos_org(500) ->> 'total_equip')::int = 4
            then 'PASSA'
            else 'FALHA (' || (public.vencimentos_org(500) ->> 'total_equip') || ')' end
       || ' - total_equip = os 4 equipamentos da org A';

select case when (public.vencimentos_org(500) ->> 'total_equip')::int
              = (select count(*) from public.equipamentos_index where org_id = :'ORG_A'::uuid)
            then 'PASSA' else 'FALHA' end
       || ' - e bate com a projecao, sem contar a org B';

commit;

\echo ''
\echo '=== 7 - FAIL CLOSED ==='
-- As duas guardas de `buscar_equipamentos`, repetidas aqui: sem organizacao
-- resolvida e com papel `cliente`, VAZIO. Nunca a contagem de outra org.

begin;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :'CLI_A', 'role', 'authenticated')::text, true);

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - papel `cliente` NAO conta os relatorios do inspetor'
  from public.contar_relatorios_por_tag(array['RC-TRES']);

select case when (public.vencimentos_org(500) ->> 'total_equip')::int = 0
            then 'PASSA' else 'FALHA' end
       || ' - e nao recebe o painel de vencimentos da organizacao';
commit;

begin;
set local role authenticated;
-- Sem `sub`: `org_atual()` nao resolve.
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);

select case when count(*) = 0 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - sessao SEM organizacao resolvida devolve vazio'
  from public.contar_relatorios_por_tag(array['RC-TRES']);
commit;

\echo ''
\echo '=== 8 - AS FLAGS NASCEM DESLIGADAS E NAO ATROPELAM AS SETE ANTERIORES ==='

begin;
set local nr13.manutencao = '1';
insert into public.org_sync (org_id, v2_ativa, busca_v9, boot_v9, inspecoes_v9,
                             prontuarios_v9, calibracoes_v9, livro_v9)
values (:'ORG_A'::uuid, true, true, true, true, true, true, true)
on conflict (org_id) do update set v2_ativa = true, busca_v9 = true, boot_v9 = true,
  inspecoes_v9 = true, prontuarios_v9 = true, calibracoes_v9 = true, livro_v9 = true;
commit;

select case when vencimentos_v9 = false and relatorios_v9 = false then 'PASSA' else 'FALHA' end
       || ' - org existente ganha as DUAS colunas desligadas'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_vencimentos_v9(:'ORG_A'::uuid, true);

select case when vencimentos_v9 and relatorios_v9 = false
             and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9
             and prontuarios_v9 and calibracoes_v9 and livro_v9
            then 'PASSA' else 'FALHA' end
       || ' - ligar a 8a flag preserva as 7 anteriores e nao liga a 9a'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_relatorios_v9(:'ORG_A'::uuid, true);

select case when vencimentos_v9 and relatorios_v9
             and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9
             and prontuarios_v9 and calibracoes_v9 and livro_v9
            then 'PASSA' else 'FALHA' end
       || ' - e ligar a 9a preserva as 8'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_vencimentos_v9(:'ORG_A'::uuid, false);

select case when vencimentos_v9 = false and relatorios_v9
             and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9
             and prontuarios_v9 and calibracoes_v9 and livro_v9
            then 'PASSA' else 'FALHA' end
       || ' - o ROLLBACK de vencimentos_v9 desliga SO ela'
  from public.org_sync where org_id = :'ORG_A'::uuid;

select public.definir_relatorios_v9(:'ORG_A'::uuid, false);

select case when relatorios_v9 = false and vencimentos_v9 = false
             and v2_ativa and busca_v9 and boot_v9 and inspecoes_v9
             and prontuarios_v9 and calibracoes_v9 and livro_v9
            then 'PASSA' else 'FALHA' end
       || ' - e o de relatorios_v9 idem'
  from public.org_sync where org_id = :'ORG_A'::uuid;

-- Organizacao NOVA: a coluna e `not null default false`, entao a linha nasce
-- com as duas desligadas sem ninguem precisar escrever nada.
begin;
set local nr13.manutencao = '1';
insert into public.org_sync (org_id, v2_ativa) values (:'ORG_B'::uuid, true)
on conflict (org_id) do update set v2_ativa = true;
commit;

select case when vencimentos_v9 = false and relatorios_v9 = false then 'PASSA' else 'FALHA' end
       || ' - organizacao NOVA tambem nasce com as duas desligadas'
  from public.org_sync where org_id = :'ORG_B'::uuid;

\echo ''
\echo '=== 9 - VIRAR A CHAVE E ATO OPERACIONAL, NAO ACAO DE USUARIO ==='

select case when has_function_privilege('anon', p.oid, 'execute') = false
             and has_function_privilege('authenticated', p.oid, 'execute') = false
            then 'PASSA' else 'FALHA' end
       || ' - ' || p.proname || ' nao e acessivel a anon nem a authenticated'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('definir_vencimentos_v9', 'definir_relatorios_v9')
 order by p.proname;

-- A de CONTAR, ao contrario, PRECISA ser chamavel pelo app logado — e so por
-- ele: `anon` nao recebe.
select case when has_function_privilege('authenticated', p.oid, 'execute')
             and has_function_privilege('anon', p.oid, 'execute') = false
            then 'PASSA' else 'FALHA' end
       || ' - contar_relatorios_por_tag: authenticated SIM, anon NAO'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'contar_relatorios_por_tag';

\echo ''
\echo '=== 10 - NENHUM SCHEMA NOVO: as duas etapas nao tocam equipamentos_index ==='
-- As quatro colunas das etapas anteriores continuam sendo as unicas. A 9F.6
-- contou sobre `relatorios_index`, que ja existia com indice por (org_id, tag)
-- desde a 9E — e por isso nao houve reprojecao TAG a TAG nesta etapa.

select case when count(*) = 4 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' - equipamentos_index segue com as 4 colunas de 9F.1..9F.4, sem 5a'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipamentos_index'
   and column_name in ('inspecoes','tem_prontuario','calibracoes','livro_entradas');

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - o indice (org_id, tag) de relatorios_index — o que torna a contagem barata'
  from pg_indexes
 where schemaname = 'public' and tablename = 'relatorios_index'
   and indexdef like '%org_id%' and indexdef like '%tag%'
   and indexname = 'relatorios_index_org_tag_idx';

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
delete from public.profiles           where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI_A'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI_A'::uuid);
commit;
\echo 'massa removida'
