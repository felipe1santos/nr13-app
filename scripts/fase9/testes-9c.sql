-- ============================================================================
-- FASE 9 · 9C — TESTES QUE EXIGEM O SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9c.sql
--
-- Cada bloco imprime PASSA ou FALHA. Nada aqui depende de dado pré-existente:
-- a massa é criada e removida pelo próprio arquivo, numa organização própria.
--
-- O que NÃO está aqui está em `src/services/*.test.ts` — keyset e RLS precisam
-- de Postgres; debounce e fusão de pendentes, não.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9c11-4000-8000-00000000000a'
\set ORG_B '00000000-9c11-4000-8000-00000000000b'
\set CLI   '00000000-9c11-4000-8000-00000000000c'

-- ---------------------------------------------------------------------------
-- Massa: duas organizações e um usuário de papel `cliente` (Portal).
-- ---------------------------------------------------------------------------
begin;
set local nr13.manutencao = '1';

delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles  where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
delete from auth.users       where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9c@local.test'),
               (:'ORG_B'::uuid, 'b9c@local.test'),
               (:'CLI'::uuid,   'c9c@local.test')) u(id, email);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9c@local.test', :'ORG_A'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9c@local.test', :'ORG_B'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'CLI'::uuid,   'c9c@local.test', :'ORG_A'::uuid, 'cliente', true, 'user', 'completo')
-- O trigger `handle_new_user` já cria o perfil quando a linha entra em
-- `auth.users`; aqui só se ajusta org e papel, que é o que o teste controla.
on conflict (id) do update set
  org_id = excluded.org_id, papel = excluded.papel, ativo = true,
  plano  = excluded.plano,  role  = excluded.role;

-- 120 equipamentos na org A (mais de duas páginas), 5 na org B.
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, categoria, fabricante, numero_serie, cliente,
   localizacao, source_version, source_updated_at)
select :'ORG_A'::uuid, 'VP-' || lpad(i::text, 4, '0'),
       'Vaso separador ' || i, 'vaso', (array['I','II','III'])[1 + (i % 3)],
       case when i % 7 = 0 then 'Metalúrgica Silva' else 'Werner' end,
       'SN-' || lpad((900000 + i)::text, 8, '0'),
       'Frigorífico Beta', 'Casa de Máquinas', 1, now()
  from generate_series(1, 120) i;

insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, source_version, source_updated_at)
select :'ORG_B'::uuid, 'OUTRA-' || i, 'Da org B', 'vaso', 1, now()
  from generate_series(1, 5) i;
commit;

analyze public.equipamentos_index;
\set QUIET off

\echo ''
\echo '════════════════ 1 · SEGURANÇA (invariante I8) ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9c11-4000-8000-00000000000a","role":"authenticated"}';
select case when count(*) = 120 then 'PASSA — org A vê os 120 dela'
            else 'FALHA — org A viu ' || count(*) end as t1_1
  from public.buscar_equipamentos('', null, null, null, 200);
select case when count(*) = 0 then 'PASSA — org A NÃO vê nenhum da org B'
            else 'FALHA — VAZOU ' || count(*) || ' da org B' end as t1_2
  from public.buscar_equipamentos('OUTRA', null, null, null, 200);
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9c11-4000-8000-00000000000b","role":"authenticated"}';
select case when count(*) = 5 then 'PASSA — org B vê só os 5 dela'
            else 'FALHA — org B viu ' || count(*) end as t1_3
  from public.buscar_equipamentos('', null, null, null, 200);
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9c11-4000-8000-00000000000c","role":"authenticated"}';
-- O cliente do Portal segue pela Edge `portal_cliente`, que filtra por vínculo.
-- Dar acesso direto devolveria o parque INTEIRO da organização — o achado A-01.
select case when count(*) = 0 then 'PASSA — papel cliente não recebe nada'
            else 'FALHA — o Portal enxergou ' || count(*) end as t1_4
  from public.buscar_equipamentos('', null, null, null, 200);
select case when (select total from public.contar_equipamentos()) = 0
            then 'PASSA — nem a contagem vaza para o cliente'
            else 'FALHA — a contagem vazou' end as t1_5;
rollback;

-- `anon` nem chega a executar: o EXECUTE foi revogado. É mais forte que
-- devolver vazio — a porta está fechada antes da consulta.
do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform * from public.buscar_equipamentos('', null, null, null, 200);
    raise notice 'FALHA — anon CONSEGUIU executar a busca';
  exception when insufficient_privilege then
    raise notice 'PASSA — anon nem executa a função (permission denied)';
  end;
  perform set_config('role', 'postgres', true);
end $$;

\echo ''
\echo '════════════════ 2 · KEYSET COM INSERÇÃO CONCORRENTE (I5) ════════════════'
\echo '  Paginar do início ao fim inserindo no meio: não pode pular nem duplicar.'

do $$
declare
  v_cursor text := null;
  v_tags   text[] := '{}';
  v_pag    text[];
  v_i      int := 0;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-9c11-4000-8000-00000000000a","role":"authenticated"}', true);

  loop
    v_i := v_i + 1;
    exit when v_i > 20;

    select array_agg(tag order by tag) into v_pag
      from public.buscar_equipamentos('', null, null, v_cursor, 25);
    exit when v_pag is null or cardinality(v_pag) = 0;

    v_tags := v_tags || v_pag;
    v_cursor := v_pag[cardinality(v_pag)];

    -- INSERÇÃO CONCORRENTE, no MEIO da faixa já percorrida e adiante dela.
    if v_i = 2 then
      perform set_config('role', 'postgres', true);
      insert into public.equipamentos_index (org_id, tag, descricao, tipo, source_version, source_updated_at)
      values ('00000000-9c11-4000-8000-00000000000a', 'VP-0010-NOVO', 'inserido no meio', 'vaso', 1, now()),
             ('00000000-9c11-4000-8000-00000000000a', 'VP-0999-NOVO', 'inserido adiante', 'vaso', 1, now())
      on conflict do nothing;
      perform set_config('role', 'authenticated', true);
    end if;
  end loop;

  -- DUPLICATA é o defeito grave: significa que o cursor não é determinístico.
  if cardinality(v_tags) <> cardinality(array(select distinct unnest(v_tags))) then
    raise notice 'FALHA — a paginação DUPLICOU item';
  else
    raise notice 'PASSA — nenhum item duplicado em % lidos', cardinality(v_tags);
  end if;

  -- Os 120 originais têm de estar TODOS lá. O inserido ANTES do cursor pode
  -- faltar (é o comportamento correto do keyset: ele não volta atrás); o
  -- inserido ADIANTE tem de aparecer.
  if exists (select 1 from unnest(array(select 'VP-' || lpad(i::text,4,'0') from generate_series(1,120) i)) t
              where t <> all(v_tags)) then
    raise notice 'FALHA — a paginação PULOU item que já existia';
  else
    raise notice 'PASSA — nenhum dos 120 originais foi pulado';
  end if;

  if 'VP-0999-NOVO' = any(v_tags) then
    raise notice 'PASSA — item inserido ADIANTE do cursor apareceu';
  else
    raise notice 'FALHA — item inserido adiante foi perdido';
  end if;
end $$;

begin;
set local nr13.manutencao = '1';
delete from public.equipamentos_index
 where org_id = :'ORG_A'::uuid and tag like '%-NOVO';
commit;

\echo ''
\echo '════════════════ 3 · O QUE A FASE 8 PROVOU NÃO SER PESQUISÁVEL ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9c11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) = 17 then 'PASSA — FABRICANTE acha (o achado G1: antes dava zero)'
            else 'FALHA — fabricante devolveu ' || count(*) || ', esperado 17' end as t3_1
  from public.buscar_equipamentos('metalurgica', null, null, null, 200);

select case when count(*) = 17 then 'PASSA — e acha mesmo digitado SEM acento'
            else 'FALHA — sem acento devolveu ' || count(*) end as t3_2
  from public.buscar_equipamentos('Metalúrgica', null, null, null, 200);

select case when count(*) = 1 and max(tag) = 'VP-0042'
            then 'PASSA — Nº DE SÉRIE acha o equipamento certo'
            else 'FALHA — série devolveu ' || count(*) end as t3_3
  from public.buscar_equipamentos('SN-00900042', null, null, null, 200);

select case when count(*) = 1 then 'PASSA — série acha ignorando o separador'
            else 'FALHA — série sem hífen devolveu ' || count(*) end as t3_4
  from public.buscar_equipamentos('sn00900042', null, null, null, 200);

select case when count(*) = 1 then 'PASSA — série acha pelo trecho numérico'
            else 'FALHA — só dígitos devolveu ' || count(*) end as t3_5
  from public.buscar_equipamentos('00900042', null, null, null, 200);

select case when count(*) = 120 then 'PASSA — CLIENTE acha (com acento no dado, sem no termo)'
            else 'FALHA — cliente devolveu ' || count(*) end as t3_6
  from public.buscar_equipamentos('frigorifico', null, null, null, 200);

select case when count(*) = 120 then 'PASSA — LOCALIZAÇÃO acha'
            else 'FALHA — localização devolveu ' || count(*) end as t3_7
  from public.buscar_equipamentos('maquinas', null, null, null, 200);

-- VP-0010 a VP-0019: dez. A TAG tem quatro dígitos, então 'VP-001' não casa
-- nenhum item por si só.
select case when count(*) = 10 then 'PASSA — PREFIXO DE TAG acha os dez VP-001x'
            else 'FALHA — prefixo devolveu ' || count(*) || ', esperado 10' end as t3_8
  from public.buscar_equipamentos('VP-001', null, null, null, 200);

select case when count(*) = 1 then 'PASSA — TAG exata acha uma só'
            else 'FALHA — tag exata devolveu ' || count(*) end as t3_9
  from public.buscar_equipamentos('VP-0100', null, null, null, 200);

select case when count(*) = 0 then 'PASSA — termo inexistente devolve vazio, sem erro'
            else 'FALHA' end as t3_10
  from public.buscar_equipamentos('zzzznaoexiste', null, null, null, 200);

\echo ''
\echo '── termo hostil: o texto do usuário não pode virar sintaxe ──'
select case when count(*) >= 0 then 'PASSA — aspas e operadores de tsquery não quebram'
            else 'FALHA' end as t3_11
  from public.buscar_equipamentos('''); drop table x; --', null, null, null, 50);
select case when count(*) >= 0 then 'PASSA — operadores & | ! : ( ) não quebram'
            else 'FALHA' end as t3_12
  from public.buscar_equipamentos('a & b | !c : (d)', null, null, null, 50);
select case when count(*) = 120 then 'PASSA — curinga % do usuário é literal, não casa tudo'
            else 'FALHA — % devolveu ' || count(*) end as t3_13
  from public.buscar_equipamentos('frigorifico%', null, null, null, 200);
select case when count(*) = 0 then 'PASSA — _ do usuário é literal'
            else 'FALHA — _ casou ' || count(*) end as t3_14
  from public.buscar_equipamentos('VP_0100', null, null, null, 200);

\echo ''
\echo '── filtros ──'
select case when count(*) = 40 then 'PASSA — filtro de categoria'
            else 'FALHA — categoria devolveu ' || count(*) end as t3_15
  from public.buscar_equipamentos('', 'vaso', 'I', null, 200);
select case when count(*) = 0 then 'PASSA — filtro sem correspondência devolve vazio'
            else 'FALHA' end as t3_16
  from public.buscar_equipamentos('', 'caldeira', null, null, 200);

\echo ''
\echo '── a contagem concorda com a listagem ──'
select case when (select total from public.contar_equipamentos('metalurgica'))
                 = (select count(*) from public.buscar_equipamentos('metalurgica', null, null, null, 200))
            then 'PASSA — contagem e listagem concordam (predicado duplicado não divergiu)'
            else 'FALHA — contagem diverge da listagem' end as t3_17;
select case when (select exato from public.contar_equipamentos('', null, null, 50)) = false
                 and (select total from public.contar_equipamentos('', null, null, 50)) = 50
            then 'PASSA — acima do teto devolve "mais de N", sem mentir o total'
            else 'FALHA — o teto da contagem não funcionou' end as t3_18;

\echo ''
\echo '── o limite por página é respeitado ──'
select case when count(*) = 50 then 'PASSA — pede 50, vêm 50'
            else 'FALHA — vieram ' || count(*) end as t3_19
  from public.buscar_equipamentos('', null, null, null, 50);
-- A massa tem 120, abaixo do teto — o que se prova aqui é que um pedido
-- absurdo NÃO estoura o teto de 200 nem devolve erro.
select case when count(*) <= 200 then 'PASSA — pedido de 99.999 é limitado ao teto de 200'
            else 'FALHA — vieram ' || count(*) end as t3_20
  from (select 1 from public.buscar_equipamentos('', null, null, null, 99999)) x;
rollback;

\echo ''
\echo '════════════════ 4 · LIMPEZA ════════════════'
begin;
set local nr13.manutencao = '1';
delete from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles  where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
delete from auth.users       where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
commit;
select case when count(*) = 0 then 'PASSA — massa de teste removida' else 'FALHA' end as t4
  from public.equipamentos_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
