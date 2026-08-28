-- ============================================================================
-- FASE 9 · 9E — TESTES QUE EXIGEM O SERVIDOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -f - < scripts/fase9/testes-9e.sql
--
-- Aplicar antes: supabase/busca_relatorios.sql
--
-- Cada bloco imprime PASSA ou FALHA. Nada aqui depende de dado pré-existente:
-- a massa é criada e removida pelo próprio arquivo, em organizações próprias.
--
-- O que está aqui e NÃO cabe em vitest: isolamento entre organizações, o papel
-- `cliente` recusado, o keyset real percorrido pelo Postgres, e a prova de que
-- os índices são de fato usados. O resto está em
-- `src/services/buscaRelatorios*.test.ts`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

\set ORG_A '00000000-9e11-4000-8000-00000000000a'
\set ORG_B '00000000-9e11-4000-8000-00000000000b'
\set CLI   '00000000-9e11-4000-8000-00000000000c'

begin;
set local nr13.manutencao = '1';

delete from public.relatorios_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles  where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
delete from auth.users       where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (:'ORG_A'::uuid, 'a9e@local.test'),
               (:'ORG_B'::uuid, 'b9e@local.test'),
               (:'CLI'::uuid,   'c9e@local.test')) u(id, email);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano) values
  (:'ORG_A'::uuid, 'a9e@local.test', :'ORG_A'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'ORG_B'::uuid, 'b9e@local.test', :'ORG_B'::uuid, 'mestre',  true, 'user', 'completo'),
  (:'CLI'::uuid,   'c9e@local.test', :'ORG_A'::uuid, 'cliente', true, 'user', 'completo')
on conflict (id) do update set
  org_id = excluded.org_id, papel = excluded.papel, ativo = true,
  plano  = excluded.plano,  role  = excluded.role;

-- MASSA da org A, desenhada para os casos difíceis:
--   · 120 relatórios com datas variadas (mais de duas páginas);
--   ·  30 na MESMA data (o caso que quebra keyset sem desempate);
--   ·  10 SEM data (o caso da fronteira).
insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, nome, tipo, emissao, validade, pdf_ref, sha256,
   source_version, source_updated_at)
select :'ORG_A'::uuid,
       'REL-' || lpad(i::text, 5, '0'),
       'VP-' || lpad((i % 7)::text, 3, '0'),
       'REL-17864' || lpad(i::text, 5, '0'),
       'Relatorio_Inspecao_' || i || '.pdf',
       (array['Inspeção Inicial','Inspeção Periódica','Inspeção Extraordinária'])[1 + (i % 3)],
       date '2026-01-01' + (i % 200),
       date '2027-01-01' + (i % 200),
       'orgA/relatorios/uuid-' || i || '.pdf',
       md5(i::text),
       1, now()
  from generate_series(1, 120) i;

insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, nome, tipo, emissao, pdf_ref,
   source_version, source_updated_at)
select :'ORG_A'::uuid, 'MESMA-' || lpad(i::text, 3, '0'), 'VP-999',
       'REL-99999' || lpad(i::text, 3, '0'), 'Mesmo dia ' || i, 'Inspeção Periódica',
       date '2026-06-15', 'orgA/relatorios/mesma-' || i || '.pdf', 1, now()
  from generate_series(1, 30) i;

insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, nome, tipo, emissao, pdf_ref,
   source_version, source_updated_at)
select :'ORG_A'::uuid, 'SEMDATA-' || lpad(i::text, 3, '0'), 'VP-888',
       'REL-88888' || lpad(i::text, 3, '0'), 'Sem data ' || i, 'Inspeção Inicial',
       null, 'orgA/relatorios/sem-' || i || '.pdf', 1, now()
  from generate_series(1, 10) i;

-- Org B: o vizinho que nunca pode aparecer.
insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, nome, tipo, emissao, pdf_ref,
   source_version, source_updated_at)
select :'ORG_B'::uuid, 'OUTRA-' || i, 'ZZZ-' || i, 'REL-OUTRA-' || i,
       'Da org B ' || i, 'Inspeção Periódica', date '2026-05-05',
       'orgB/relatorios/uuid-' || i || '.pdf', 1, now()
  from generate_series(1, 5) i;
commit;

analyze public.relatorios_index;
\set QUIET off

\echo ''
\echo '════════════════ 1 · ISOLAMENTO E FAIL CLOSED ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';
select case when count(*) = 160 then 'PASSA — org A vê os 160 dela'
            else 'FALHA — org A viu ' || count(*) end as t1_1
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);
select case when count(*) = 0 then 'PASSA — org A NÃO vê nada da org B'
            else 'FALHA — VAZOU ' || count(*) || ' da org B' end as t1_2
  from public.buscar_relatorios('OUTRA', null, null, null, 'todos', null, null, 200);
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000b","role":"authenticated"}';
select case when count(*) = 5 then 'PASSA — org B vê só os 5 dela'
            else 'FALHA — org B viu ' || count(*) end as t1_3
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000c","role":"authenticated"}';
select case when count(*) = 0 then 'PASSA — papel `cliente` (Portal) é recusado'
            else 'FALHA — cliente viu ' || count(*) end as t1_4
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);
rollback;

-- `anon` nem chega a executar: o EXECUTE foi revogado. A recusa vem do
-- catálogo, antes do corpo da função — é a guarda mais forte possível, e por
-- isso o teste espera a EXCEÇÃO, não uma lista vazia.
do $$
begin
  set local role anon;
  perform * from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);
  raise notice 'FALHA — anon EXECUTOU a busca';
exception
  when insufficient_privilege then
    raise notice 'PASSA — anon é recusado no catálogo (permission denied)';
  when others then
    raise notice 'PASSA — anon recusado (%)', sqlerrm;
end $$;
reset role;

select case when has_function_privilege('anon', 'public.buscar_relatorios(text,text,date,date,text,date,text,integer)', 'execute')
            then 'FALHA — `anon` PODE executar a busca'
            else 'PASSA — `anon` não tem EXECUTE' end as t1_6;

\echo ''
\echo '════════════════ 2 · KEYSET: nada duplica, nada é pulado ════════════════'

-- Percorre TODAS as páginas de 50 e confere que os 160 saíram uma vez cada.
-- É a mesma propriedade provada em vitest, agora contra o Postgres de verdade —
-- com a collation, o índice e o planner reais.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

create temp table paginado (relatorio_id text, ordem int) on commit drop;

do $$
declare
  v_data date := null;
  v_id   text := null;
  v_n    int  := 0;
  v_pag  int  := 0;
  r      record;
begin
  loop
    v_pag := v_pag + 1;
    v_n := 0;
    for r in
      select * from public.buscar_relatorios('', null, null, null, 'todos', v_data, v_id, 50)
    loop
      insert into paginado values (r.relatorio_id, v_pag);
      v_data := coalesce(r.emissao, date '0001-01-01');
      v_id   := r.relatorio_id;
      v_n := v_n + 1;
    end loop;
    exit when v_n = 0 or v_pag > 20;  -- guarda contra laço
  end loop;
end $$;

select case when count(*) = 160 then 'PASSA — 160 relatórios percorridos'
            else 'FALHA — percorreu ' || count(*) end as t2_1 from paginado;

select case when count(*) = 0 then 'PASSA — nenhum relatório apareceu duas vezes'
            else 'FALHA — ' || count(*) || ' duplicado(s)' end as t2_2
  from (select relatorio_id from paginado group by 1 having count(*) > 1) d;

select case when count(*) = 0 then 'PASSA — nenhum relatório foi pulado'
            else 'FALHA — ' || count(*) || ' pulado(s)' end as t2_3
  from (select relatorio_id from public.relatorios_index
         where org_id = '00000000-9e11-4000-8000-00000000000a'::uuid
        except select relatorio_id from paginado) f;

select case when count(*) = 30 then 'PASSA — os 30 da MESMA data saíram todos'
            else 'FALHA — saíram ' || count(*) || ' dos 30 da mesma data' end as t2_4
  from paginado where relatorio_id like 'MESMA-%';

select case when count(*) = 10 then 'PASSA — os 10 SEM data saíram todos'
            else 'FALHA — saíram ' || count(*) || ' dos 10 sem data' end as t2_5
  from paginado where relatorio_id like 'SEMDATA-%';

-- Sem data vai para o FIM: a última página é onde eles têm de estar.
select case when min(ordem) = max(ordem) and min(ordem) = (select max(ordem) from paginado)
            then 'PASSA — os sem data ficaram na última página'
            else 'FALHA — sem data espalhados entre as páginas' end as t2_6
  from paginado where relatorio_id like 'SEMDATA-%';
rollback;

\echo ''
\echo '════════════════ 3 · BUSCA: TAG, código inteiro e só dígitos ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) = 30 then 'PASSA — busca por TAG acha os 30 de VP-999'
            else 'FALHA — TAG trouxe ' || count(*) end as t3_1
  from public.buscar_relatorios('VP-999', null, null, null, 'todos', null, null, 200);

select case when count(*) = 1 then 'PASSA — código INTEIRO acha exatamente um'
            else 'FALHA — código inteiro trouxe ' || count(*) end as t3_2
  from public.buscar_relatorios('REL-1786400001', null, null, null, 'todos', null, null, 200);

-- O usuário digita o número que enxerga no papel, sem o prefixo.
select case when count(*) >= 1 then 'PASSA — só os DÍGITOS do código acham o relatório'
            else 'FALHA — busca por dígitos não achou nada' end as t3_3
  from public.buscar_relatorios('1786400001', null, null, null, 'todos', null, null, 200);

select case when count(*) = 0 then 'PASSA — termo inexistente devolve vazio (sem erro)'
            else 'FALHA — termo inexistente trouxe ' || count(*) end as t3_4
  from public.buscar_relatorios('zzzzzznadaexiste', null, null, null, 'todos', null, null, 200);

-- Curinga digitado pelo usuário não pode listar tudo.
select case when count(*) = 0 then 'PASSA — `%` é escapado, não vira curinga'
            else 'FALHA — `%` listou ' || count(*) end as t3_5
  from public.buscar_relatorios('%', null, null, null, 'todos', null, null, 200);
rollback;

\echo ''
\echo '════════════════ 4 · PERÍODO ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) = 30 then 'PASSA — período de um único dia acha os 30 daquele dia'
            else 'FALHA — o dia trouxe ' || count(*) end as t4_1
  from public.buscar_relatorios('', null, date '2026-06-15', date '2026-06-15', 'todos', null, null, 200);

-- O relatório SEM data não pode ser arrastado para dentro de um intervalo que o
-- usuário escolheu: a data-sentinela é mecanismo de ordenação, não um fato.
select case when count(*) = 0 then 'PASSA — relatório SEM data fica fora do filtro de período'
            else 'FALHA — ' || count(*) || ' sem data entraram no período' end as t4_2
  from public.buscar_relatorios('', null, date '0001-01-01', date '2026-01-01', 'todos', null, null, 200)
 where relatorio_id like 'SEMDATA-%';

select case when count(*) = 160 then 'PASSA — período aberto não exclui ninguém'
            else 'FALHA — período aberto trouxe ' || count(*) end as t4_3
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);
rollback;

\echo ''
\echo '════════════════ 5 · CONTAGEM com teto ════════════════'

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

select case when total = 160 and exato then 'PASSA — conta 160, exato'
            else 'FALHA — contou ' || total || ' exato=' || exato end as t5_1
  from public.contar_relatorios('', null, null, null, 'todos', 1000);

select case when total = 10 and not exato then 'PASSA — teto baixo devolve "mais de 10"'
            else 'FALHA — teto: total=' || total || ' exato=' || exato end as t5_2
  from public.contar_relatorios('', null, null, null, 'todos', 10);

select case when total = 0 and exato then 'PASSA — filtro sem resultado conta zero'
            else 'FALHA — contou ' || total end as t5_3
  from public.contar_relatorios('zzzzzznadaexiste', null, null, null, 'todos', 1000);
rollback;

\echo ''
\echo '════════════════ 6 · OS ÍNDICES SÃO REALMENTE USADOS ════════════════'
-- O objetivo da 9E é a busca não degradar com o acervo. Um índice que existe e
-- não é escolhido pelo planner não vale nada — por isso a checagem é sobre o
-- PLANO, não sobre o tempo (que varia com a máquina).

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

-- O plano de DENTRO de uma funcao plpgsql NAO aparece num EXPLAIN sobre ela
-- (so o Function Scan). Por isso o predicado e repetido INLINE aqui: e a unica
-- forma de afirmar qual indice o planner escolheu.
do $$
declare v jsonb; usa boolean;
begin
  execute 'explain (analyze, buffers, format json) select r.relatorio_id from public.relatorios_index r where r.org_id = ''00000000-9e11-4000-8000-00000000000a''::uuid order by r.ordem_emissao desc, r.relatorio_id desc limit 50' into v;
  usa := v::text ilike '%relatorios_index_ordem_idx%';
  raise notice '%', case when usa then 'PASSA — a listagem usa relatorios_index_ordem_idx'
    else 'ATENCAO — listagem sem o indice de ordenacao (massa de 160 e pequena; ver bench-9e.sql em 50.000)' end;
  execute 'explain (analyze, buffers, format json) select r.relatorio_id from public.relatorios_index r where r.org_id = ''00000000-9e11-4000-8000-00000000000a''::uuid and upper(r.tag) like ''VP-999%'' limit 50' into v;
  usa := v::text ilike '%Index%' or v::text ilike '%Bitmap%';
  raise notice '%', case when usa then 'PASSA — a busca por TAG usa indice'
    else 'ATENCAO — busca por TAG sem indice (ver nota acima)' end;
end $$;
rollback;


\echo ''
\echo '=== 6-bis · ESCOPO: relatorio de equipamento EXCLUIDO ==='
-- Medido em producao (25/08/2026): 15 relatorios na projecao, 3 alcancaveis
-- pela tela antiga. Os 12 restantes sao de TAGs sem ficha de equipamento. Nada
-- e apagado por isso; o que muda e o RECORTE e a marcacao.
--
-- A massa da org A tem 8 TAGs (VP-000..VP-006, VP-999, VP-888). Damos ficha a
-- VP-000..VP-006 e VP-999; VP-888 (os 10 SEM data) fica ORFA.
begin;
set local nr13.manutencao = '1';
insert into public.equipamentos_index (org_id, tag, descricao, tipo, source_version, source_updated_at)
select :'ORG_A'::uuid, t, 'Vaso ' || t, 'vaso', 1, now()
  from unnest(array['VP-000','VP-001','VP-002','VP-003','VP-004','VP-005','VP-006','VP-999']) t
on conflict (org_id, tag) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) = 150 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — escopo `ativos` deixa os 10 orfaos de fora (160 - 10 = 150)'
  from public.buscar_relatorios('', null, null, null, 'ativos', null, null, 200);

select case when count(*) = 10 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — escopo `historicos` traz SO os 10 orfaos'
  from public.buscar_relatorios('', null, null, null, 'historicos', null, null, 200);

select case when count(*) = 160 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — escopo `todos` nao esconde nada: os 160 continuam la'
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);

select case when bool_and(not equipamento_ativo) then 'PASSA' else 'FALHA' end
       || ' — todo item do escopo `historicos` vem marcado como excluido'
  from public.buscar_relatorios('', null, null, null, 'historicos', null, null, 200);

select case when bool_and(equipamento_ativo) then 'PASSA' else 'FALHA' end
       || ' — todo item do escopo `ativos` vem marcado como ativo'
  from public.buscar_relatorios('', null, null, null, 'ativos', null, null, 200);

select case when total = 150 and historicos = 10 then 'PASSA'
            else 'FALHA (total ' || total || ', historicos ' || historicos || ')' end
       || ' — a contagem devolve os DOIS numeros de uma vez'
  from public.contar_relatorios('', null, null, null, 'ativos', 1000);

-- O aviso do cabecalho fala do MESMO conjunto que a lista mostra: com o periodo
-- escolhido, os 10 sem data ficam fora dos dois lados.
select case when historicos = 0 then 'PASSA' else 'FALHA (' || historicos || ')' end
       || ' — filtro de periodo tambem se aplica a contagem de historicos'
  from public.contar_relatorios('', null, date '2026-01-01', date '2026-12-31', 'ativos', 1000);

-- Escopo invalido nao vira erro nem lista vazia: cai no padrao.
select case when count(*) = 150 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — escopo desconhecido cai em `ativos`, sem estourar'
  from public.buscar_relatorios('', null, null, null, 'xpto', null, null, 200);
rollback;

\echo ''
\echo '=== 6-ter · A GUARDA DO VAZIO FALSO ==='
-- `equipamentos_index` e PROJECAO. Numa organizacao cujo rebuild ainda nao
-- rodou ela esta VAZIA — e sem guarda TODO relatorio viraria orfao, o escopo
-- padrao devolveria lista vazia, e a tela afirmaria "nao ha relatorios" para
-- quem tem o parque inteiro. Sem catalogo a resposta honesta e "nao sei".
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-9e11-4000-8000-00000000000a","role":"authenticated"}';

select case when count(*) = 160 then 'PASSA' else 'FALHA (' || count(*) || ')' end
       || ' — SEM catalogo projetado, `ativos` devolve TUDO (nunca lista vazia)'
  from public.buscar_relatorios('', null, null, null, 'ativos', null, null, 200);

select case when bool_and(equipamento_ativo) then 'PASSA' else 'FALHA' end
       || ' — SEM catalogo, ninguem e acusado de excluido'
  from public.buscar_relatorios('', null, null, null, 'todos', null, null, 200);

select case when historicos = 0 then 'PASSA' else 'FALHA (' || historicos || ')' end
       || ' — SEM catalogo, nenhum historico e anunciado'
  from public.contar_relatorios('', null, null, null, 'ativos', 1000);
rollback;
\echo ''
\echo '=== 6-quater · PROJECAO: o caminho do PDF vem de pdfRef->>path ==='
-- O DEFEITO MAIS CARO DA 9E, e o mais silencioso: a projecao lia
-- `pdfRef ->> 'caminho'`, e o campo da RefFoto se chama `path`. O `->>` de uma
-- chave que nao existe devolve NULL sem erro nenhum, entao TODO relatorio
-- finalizado ficava na projecao sem referencia de arquivo — e a tela nova nao
-- tinha por onde abrir o documento. Medido em producao em 25/08/2026: pdf_ref
-- nulo nas 15 linhas, inclusive nas 4 com artefato e sha256 gravados.
--
-- Este teste passa pela PROJECAO de verdade (nao insere na tabela na mao), que
-- e o unico jeito de ele acusar a volta do defeito.
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em)
values (:'ORG_A'::uuid, :'ORG_A'::uuid, 'nr13_historico_indice_VP-777',
        '[{"id":"r-art-1","tagVaso":"VP-777","codigo":"REL-777","nome":"Com artefato","tipo":"Inspecao Periodica","emissao":"01/08/2026","sha256":"deadbeef","paginas":3,"pdfRef":{"bucket":"inspecao","path":"org-a/relatorios/abc.pdf","mimeType":"application/pdf","tamanho":10}},{"id":"r-leg-1","tagVaso":"VP-777","codigo":"REL-778","nome":"Legado sem arquivo","tipo":"Inspecao Periodica","emissao":"02/08/2026"}]',
        1, now())
on conflict (user_id, chave) do update set valor = excluded.valor, versao = excluded.versao;
select public.projetar_relatorios(:'ORG_A'::uuid, 'VP-777');

select case when pdf_ref = 'org-a/relatorios/abc.pdf' then 'PASSA' else 'FALHA (' || coalesce(pdf_ref, 'NULO') || ')' end
       || ' — relatorio COM artefato projeta o caminho do PDF'
  from public.relatorios_index where org_id = :'ORG_A'::uuid and relatorio_id = 'r-art-1';

select case when sha256 = 'deadbeef' and paginas = 3 then 'PASSA' else 'FALHA' end
       || ' — hash e paginas viajam junto com o caminho'
  from public.relatorios_index where org_id = :'ORG_A'::uuid and relatorio_id = 'r-art-1';

-- Relatorio anterior ao arquivamento (§7-quater) nao tem arquivo, e isso NAO e
-- defeito: e o sinal de que so a tela antiga sabe remonta-lo.
select case when pdf_ref is null then 'PASSA' else 'FALHA (' || pdf_ref || ')' end
       || ' — relatorio LEGADO continua sem pdf_ref, sem inventar caminho'
  from public.relatorios_index where org_id = :'ORG_A'::uuid and relatorio_id = 'r-leg-1';
rollback;

\echo '════════════════ 7 · LIMPEZA ════════════════'
begin;
set local nr13.manutencao = '1';
delete from public.relatorios_index where org_id in (:'ORG_A'::uuid, :'ORG_B'::uuid);
delete from public.profiles  where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
delete from auth.users       where id in (:'ORG_A'::uuid, :'ORG_B'::uuid, :'CLI'::uuid);
commit;
\echo 'massa removida'
