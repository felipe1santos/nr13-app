-- ============================================================================
-- FASE 9 · 9G.2 — TESTES FUNCIONAIS DO AGREGADO DE VENCIMENTOS
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9g2.sql
--
-- Aplicar antes:
--   supabase/vencimentos_agregado.sql        (a base: colunas + calibracoes_index)
--   supabase/vencimentos_agregado_topn.sql   (a 9G.2)
--
-- O QUE ESTE ARQUIVO PROVA
--
-- A 9G.2 mexe em COMO o agregado e montado, nao no QUE ele responde. Entao o
-- teste nao pode ser "roda sem erro": ele compara a saida da funcao com uma
-- expectativa calculada a parte, caso a caso.
--
--   · as quatro contagens (total_equip, com_prazo, vencidos, a_vencer_30);
--   · a REGRA do prazo: o relatorio MAIS RECENTE manda, a menor das duas
--     proximas inspecoes vence, e a Vida Remanescente e so reserva;
--   · a ORDEM dos itens — `jsonb_agg` sem `order by` nao promete ordem nenhuma,
--     e a 9G.2 move a agregacao para depois do corte. Ordem errada numa lista
--     de vencimentos e o item VENCIDO aparecendo no fim;
--   · os NOMES dos campos do item, um a um. A tela le esses nomes; renomear um
--     apaga uma coluna sem erro nenhum;
--   · truncado/restantes quando a organizacao passa do limite;
--   · fail closed: papel `cliente` e sessao sem organizacao.
--
-- Cada bloco imprime PASSA ou FALHA. A massa e criada e removida aqui.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG '00000000-9g22-4000-8000-00000000000a'
\set ORG_A '00000000-9022-4000-8000-00000000000a'
\set CLI   '00000000-9022-4000-8000-00000000000c'

begin;
set local nr13.manutencao = '1';

delete from public.calibracoes_index  where org_id = :'ORG_A'::uuid;
delete from public.relatorios_index   where org_id = :'ORG_A'::uuid;
delete from public.equipamentos_index where org_id = :'ORG_A'::uuid;
delete from public.profiles           where id in (:'ORG_A'::uuid, :'CLI'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'CLI'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9g2@local.test'),
               (:'CLI'::uuid,   'c9g2@local.test')) u(id, email);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9g2@local.test', :'ORG_A'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'CLI'::uuid,   'c9g2@local.test', :'ORG_A'::uuid, 'cliente', true, 'user', 'completo')
on conflict (id) do update set
  org_id = excluded.org_id, papel = excluded.papel, ativo = true, plano = 'completo';

-- SEIS equipamentos, cada um exercitando um ramo da regra:
--   VG-VENCIDO   -> relatorio com externa ONTEM               -> vencido
--   VG-PERTO     -> relatorio com externa em 10 dias          -> a vencer 30
--   VG-LONGE     -> relatorio com externa em 200 dias         -> com prazo, fora dos baldes
--   VG-MENOR     -> interna daqui a 5 anos, externa em 3 dias -> vale a MENOR (a vencer 30)
--   VG-VIDA      -> SEM relatorio, com Vida Remanescente      -> a vida entra como reserva
--   VG-SEMPRAZO  -> sem relatorio e sem vida                  -> sem prazo (conta em total_equip)
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, vida_base, vida_prox_anos, source_version, source_updated_at, projected_at)
values
  (:'ORG_A'::uuid, 'VG-VENCIDO',  'Vaso vencido',  'vaso', null, null, 1, now(), now()),
  (:'ORG_A'::uuid, 'VG-PERTO',    'Vaso perto',    'vaso', null, null, 1, now(), now()),
  (:'ORG_A'::uuid, 'VG-LONGE',    'Vaso longe',    'vaso', null, null, 1, now(), now()),
  (:'ORG_A'::uuid, 'VG-MENOR',    'Vaso menor',    'vaso', null, null, 1, now(), now()),
  -- vida_base + 12 meses = daqui a ~15 dias, se a base for 11 meses e meio atras
  (:'ORG_A'::uuid, 'VG-VIDA',     'Vaso vida',     'vaso', current_date - 350, 1, 1, now(), now()),
  (:'ORG_A'::uuid, 'VG-SEMPRAZO', 'Vaso sem prazo','vaso', null, null, 1, now(), now());

-- DOIS relatorios em VG-VENCIDO: o mais recente e o que manda. O antigo tem
-- prazo folgado — se a funcao pegasse "qualquer um", o vencido sumiria.
insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, tipo, emissao,
   proxima_inspecao_interna, proxima_inspecao_externa, execucao_inspecao, data_ref,
   source_version, source_updated_at, projected_at)
values
  (:'ORG_A'::uuid, 'R-VELHO', 'VG-VENCIDO', 'R-VELHO', 'periodica', current_date - 800,
   current_date + 900, current_date + 900, current_date - 800, current_date - 800, 1, now(), now()),
  (:'ORG_A'::uuid, 'R-NOVO',  'VG-VENCIDO', 'R-NOVO',  'periodica', current_date - 400,
   current_date + 900, current_date - 1,   current_date - 400, current_date - 400, 1, now(), now()),
  (:'ORG_A'::uuid, 'R-PERTO', 'VG-PERTO',   'R-PERTO', 'periodica', current_date - 100,
   current_date + 900, current_date + 10,  current_date - 100, current_date - 100, 1, now(), now()),
  (:'ORG_A'::uuid, 'R-LONGE', 'VG-LONGE',   'R-LONGE', 'periodica', current_date - 100,
   current_date + 900, current_date + 200, current_date - 100, current_date - 100, 1, now(), now()),
  (:'ORG_A'::uuid, 'R-MENOR', 'VG-MENOR',   'R-MENOR', 'periodica', current_date - 100,
   current_date + 1800, current_date + 3,  current_date - 100, current_date - 100, 1, now(), now());

-- Uma calibracao com prazo (entra na lista) e uma sem (nao entra — o TypeScript
-- so cria a linha quando ha prazo).
insert into public.calibracoes_index
  (org_id, calibracao_id, tag, componente_id, nome, tipo, serie,
   data_calibracao, prox_calibracao, source_version, source_updated_at, projected_at)
values
  (:'ORG_A'::uuid, 'C-1', 'VG-LONGE', 'COMP-1', 'Valvula de seguranca', 'valvula', 'S-123',
   current_date - 20, current_date + 5, 1, now(), now()),
  (:'ORG_A'::uuid, 'C-2', 'VG-LONGE', 'COMP-2', 'Manometro', 'manometro', 'S-999',
   current_date - 20, null, 1, now(), now());
commit;

\set QUIET off
\echo ''
\echo '=== 1 - AS QUATRO CONTAGENS ==='
-- Expectativa, contada a mao sobre a massa acima:
--   total_equip = 6
--   com_prazo   = 5 equipamentos com prazo (VENCIDO, PERTO, LONGE, MENOR, VIDA) + 1 calibracao = 6
--   vencidos    = 1  (VG-VENCIDO)
--   a_vencer_30 = 4  (VG-PERTO 10d, VG-MENOR 3d, VG-VIDA ~15d, calibracao 5d)

begin;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :'ORG_A', 'role','authenticated')::text, true);

select case when (public.vencimentos_org(500)->>'total_equip')::int = 6 then 'PASSA'
            else 'FALHA ('||(public.vencimentos_org(500)->>'total_equip')||')' end
       || ' - total_equip conta os 6 equipamentos, inclusive o sem prazo';

select case when (public.vencimentos_org(500)->>'com_prazo')::int = 6 then 'PASSA'
            else 'FALHA ('||(public.vencimentos_org(500)->>'com_prazo')||')' end
       || ' - com_prazo = 5 equipamentos + 1 calibracao (a sem prazo NAO entra)';

select case when (public.vencimentos_org(500)->>'vencidos')::int = 1 then 'PASSA'
            else 'FALHA ('||(public.vencimentos_org(500)->>'vencidos')||')' end
       || ' - vencidos = 1, e vem do relatorio MAIS RECENTE (o antigo era folgado)';

select case when (public.vencimentos_org(500)->>'a_vencer_30')::int = 4 then 'PASSA'
            else 'FALHA ('||(public.vencimentos_org(500)->>'a_vencer_30')||')' end
       || ' - a_vencer_30 = 4 (perto, menor, vida e a calibracao)';

\echo ''
\echo '=== 2 - A REGRA DO PRAZO ==='

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - VG-MENOR entrou pela MENOR das duas proximas (externa em 3d, nao a interna em 5 anos)'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'tag' = 'VG-MENOR' and i->>'relProxExterna' = (current_date + 3)::text;

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - VG-VIDA aparece pela Vida Remanescente, sem relatorio nenhum'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'tag' = 'VG-VIDA' and i->>'relProxExterna' is null and i->>'vidaProxAnos' is not null;

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - VG-SEMPRAZO aparece na lista (sem prazo NAO e sem linha)'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'tag' = 'VG-SEMPRAZO';

select case when count(*) = 1 then 'PASSA' else 'FALHA' end
       || ' - a calibracao COM prazo entra, com origem propria'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'origem' = 'calibracao' and i->>'nome' = 'Valvula de seguranca';

select case when count(*) = 0 then 'PASSA' else 'FALHA' end
       || ' - a calibracao SEM prazo nao entra'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'nome' = 'Manometro';

\echo ''
\echo '=== 3 - A ORDEM DOS ITENS (o que a 9G.2 arrisca) ==='
-- `jsonb_agg` sem `order by` nao promete ordem. A 9G.2 move a agregacao para
-- DEPOIS do corte, entao a clausula de ordenacao precisa estar nos dois lugares.

select case when (public.vencimentos_org(500)->'itens'->0->>'tag') = 'VG-VENCIDO'
            then 'PASSA' else 'FALHA ('||(public.vencimentos_org(500)->'itens'->0->>'tag')||')' end
       || ' - o VENCIDO e o primeiro item da lista';

-- A reconstrucao do prazo aqui precisa ter os TRES ramos da regra. A primeira
-- versao deste teste esqueceu a Vida Remanescente e acusou desordem numa lista
-- que estava certa — VG-VIDA caia no `9999` e "aparecia fora de lugar". Fica
-- registrado: teste que reimplementa a regra pela metade acusa o codigo certo.
select case when bool_and(ordenado) then 'PASSA' else 'FALHA' end
       || ' - a lista inteira esta em ordem crescente de vencimento (nulos por ultimo)'
  from (
    select coalesce(
             lag(prazo) over (order by ord) <= prazo,
             true
           ) as ordenado
      from (
        select ordinalidade as ord,
               coalesce(
                 -- 1) o relatorio mais recente, pela MENOR das duas proximas
                 least(nullif(i->>'relProxInterna','')::date, nullif(i->>'relProxExterna','')::date),
                 -- 2) a calibracao
                 nullif(i->>'proxCalibracao','')::date,
                 -- 3) a Vida Remanescente, como reserva
                 case when i->>'vidaBase' is not null and i->>'vidaProxAnos' is not null
                      then public.f9_mais_meses((i->>'vidaBase')::date,
                                                round((i->>'vidaProxAnos')::numeric * 12)::integer)
                      else null end,
                 date '9999-12-31'   -- "sem prazo" vai para o fim, como na funcao
               ) as prazo
          from jsonb_array_elements(public.vencimentos_org(500)->'itens')
               with ordinality as t(i, ordinalidade)
      ) x
  ) y;

\echo ''
\echo '=== 4 - OS NOMES DOS CAMPOS (a tela le por nome) ==='

select case when count(*) = 10 then 'PASSA' else 'FALHA ('||count(*)||' campos)' end
       || ' - o item de inspecao tem os 10 campos de sempre'
  from (
    select jsonb_object_keys(i) as k
      from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
     where i->>'origem' = 'inspecao' and i->>'tag' = 'VG-VENCIDO'
  ) t;

select case when count(*) = 9 then 'PASSA' else 'FALHA ('||count(*)||')' end
       || ' - e os campos com os nomes EXATOS que o TypeScript le'
  from (
    select jsonb_object_keys(i) as k
      from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
     where i->>'origem' = 'inspecao' and i->>'tag' = 'VG-VENCIDO'
  ) t
 where k in ('tag','origem','descricao','tipo','vidaBase','vidaProxAnos',
             'relEmissao','relExecucao','relProxInterna');

select case when count(*) = 8 then 'PASSA' else 'FALHA ('||count(*)||' campos)' end
       || ' - o item de calibracao tem os 8 campos de sempre'
  from (
    select jsonb_object_keys(i) as k
      from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
     where i->>'origem' = 'calibracao'
  ) t;

select case when i->>'serie' = 'S-123' and i->>'pertenceA' = 'VG-LONGE'
             and (i->>'proxCalibracao')::date = current_date + 5
            then 'PASSA' else 'FALHA' end
       || ' - e os valores da calibracao chegam inteiros (serie, pertenceA, proxCalibracao)'
  from jsonb_array_elements(public.vencimentos_org(500)->'itens') i
 where i->>'origem' = 'calibracao';

\echo ''
\echo '=== 5 - TRUNCADO E RESTANTES ==='

select case when (public.vencimentos_org(500)->>'truncado') = 'false'
             and (public.vencimentos_org(500)->>'restantes') = '0'
            then 'PASSA' else 'FALHA' end
       || ' - com 7 itens e limite 500, nada e truncado';

select case when (public.vencimentos_org(2)->>'truncado') = 'true'
             and (public.vencimentos_org(2)->>'restantes')::int = 5
             and jsonb_array_length(public.vencimentos_org(2)->'itens') = 2
            then 'PASSA' else 'FALHA' end
       || ' - com limite 2: truncado, restantes=5, e a lista traz 2';

select case when (public.vencimentos_org(2)->'itens'->0->>'tag') = 'VG-VENCIDO'
            then 'PASSA' else 'FALHA' end
       || ' - e os 2 que sobram sao os MAIS URGENTES, nao dois quaisquer';

-- As contagens NAO podem ser afetadas pelo limite: elas falam da organizacao.
select case when (public.vencimentos_org(2)->>'vencidos')::int = 1
             and (public.vencimentos_org(2)->>'total_equip')::int = 6
            then 'PASSA' else 'FALHA' end
       || ' - o limite corta a LISTA, nunca as contagens';
commit;

\echo ''
\echo '=== 6 - FAIL CLOSED ==='

begin;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :'CLI', 'role','authenticated')::text, true);
select case when (public.vencimentos_org(500)->>'total_equip')::int = 0
             and jsonb_array_length(public.vencimentos_org(500)->'itens') = 0
            then 'PASSA' else 'FALHA' end
       || ' - papel `cliente` recebe painel vazio, nao o do inspetor';
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role','authenticated')::text, true);
select case when (public.vencimentos_org(500)->>'total_equip')::int = 0
            then 'PASSA' else 'FALHA' end
       || ' - sessao sem organizacao resolvida recebe painel vazio';
commit;

\echo ''
\echo '=== 7 - A FUNCAO CONTINUA FECHADA PARA anon ==='
select case when has_function_privilege('authenticated', p.oid, 'execute')
             and has_function_privilege('anon', p.oid, 'execute') = false
            then 'PASSA' else 'FALHA' end
       || ' - vencimentos_org: authenticated SIM, anon NAO'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'vencimentos_org';

\echo ''
\echo '=== LIMPEZA ==='
begin;
set local nr13.manutencao = '1';
delete from public.calibracoes_index  where org_id = :'ORG_A'::uuid;
delete from public.relatorios_index   where org_id = :'ORG_A'::uuid;
delete from public.equipamentos_index where org_id = :'ORG_A'::uuid;
delete from public.profiles           where id in (:'ORG_A'::uuid, :'CLI'::uuid);
delete from auth.users                where id in (:'ORG_A'::uuid, :'CLI'::uuid);
commit;
\echo 'massa removida'
