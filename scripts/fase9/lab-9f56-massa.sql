-- ============================================================================
-- FASE 9 · 9F.5 + 9F.6 — MASSA DE LABORATÓRIO PARA O GATE DE NAVEGADOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9f56-massa.sql
--
-- SOMENTE SUPABASE LOCAL. §12 do CLAUDE.md e `scripts/massa-escala/seguranca.mjs`:
-- massa nunca toca `qqsesrntfvmdxqxrfvmw`. Este arquivo é `psql` direto no
-- container local e não deve ser apontado para lugar nenhum além dele.
--
-- USA A MESMA ORGANIZAÇÃO DE LABORATÓRIO DA 9F.1/9F.2/9F.3/9F.4
-- (`lab9f@local.test` / `lab123456`), de propósito: o laboratório é um só, e o
-- script NÃO apaga o usuário — só a massa. Derrubar `auth.users` invalidaria a
-- sessão aberta no navegador no meio do gate.
--
-- ---------------------------------------------------------------------------
-- O RECORTE DESTE GATE — duas telas, duas perguntas OPOSTAS
-- ---------------------------------------------------------------------------
--
--   · **9F.5 · o painel** (`/dashboard`, `/vencimentos`) é um AGREGADO: ele
--     PRECISA percorrer a organização para contar. A pergunta não é se o custo
--     cresce — é se cresce de forma aceitável, e se o painel é pedido UMA vez
--     por boot em vez de duas. Por isso a massa espalha os prazos nos três
--     baldes (vencido, a vencer em 30, em dia): um painel medido sobre massa
--     que cai toda no mesmo balde não mede o painel. **O prazo sai das datas
--     do RELATÓRIO**, não da coluna `proxima_inspecao` do catálogo — ver o
--     bloco de relatórios abaixo, onde este gate já errou uma vez.
--
--   · **9F.6 · o catálogo** (`/relatorios`) é uma LISTA PAGINADA: ela NÃO pode
--     crescer com o parque. 50 por página, e a contagem de relatórios da página
--     numa chamada só.
--
-- ---------------------------------------------------------------------------
-- SÓ METADADOS NA MASSA GRANDE
-- ---------------------------------------------------------------------------
--
-- Nenhuma ficha (`nr13_info_`) é criada em massa: o ponto do gate é provar que
-- a lista NÃO baixa `app_storage` de ninguém. As TAGs de paridade abaixo
-- existem na VERDADE e passam pela projeção real — é com elas que se prova o
-- risco bloqueante da 9F.6 (semear antes de ler) e a paridade OFF × ON.
--
-- Credenciais: lab9f@local.test / lab123456
-- ============================================================================
\set ON_ERROR_STOP on
\if :{?n}
\else
  \set n 50000
\endif

\set ORG '00000000-9f77-4000-8000-000000009999'

begin;
set local nr13.manutencao = '1';

-- A MASSA sai; o USUÁRIO fica.
delete from public.calibracoes_index    where org_id = :'ORG'::uuid;
delete from public.relatorios_index     where org_id = :'ORG'::uuid;
delete from public.equipamentos_index   where org_id = :'ORG'::uuid;
delete from public.app_storage          where org_id = :'ORG'::uuid;
-- O rebuild é RETOMÁVEL: com o cursor no fim ele vira no-op e o laboratório
-- ficaria sem reprojetar. Descoberto pelo `testes-9f3.sql` na 2ª execução.
delete from public.busca_rebuild_estado where org_id = :'ORG'::uuid;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select :'ORG'::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'lab9f@local.test',
       crypt('lab123456', gen_salt('bf')),
       now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
 where not exists (select 1 from auth.users where id = :'ORG'::uuid);

-- OS CAMPOS DE TOKEN PRECISAM SER STRING VAZIA, NÃO NULL — o GoTrue faz scan
-- deles para `string` em Go, e com NULL o login devolve 500 "Database error
-- querying schema". Armadilha registrada desde o gate da 9E.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token     = coalesce(reauthentication_token, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  is_sso_user = false, is_anonymous = false
where id = :'ORG'::uuid;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), :'ORG'::uuid,
       ('{"sub":"' || :'ORG' || '","email":"lab9f@local.test"}')::jsonb,
       'email', 'lab9f@local.test', now(), now(), now()
 where not exists (select 1 from auth.identities where user_id = :'ORG'::uuid);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano)
values (:'ORG'::uuid, 'lab9f@local.test', :'ORG'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  org_id = excluded.org_id, papel = 'mestre', ativo = true, plano = 'completo';

-- AS FLAGS DESTE GATE.
--
-- `boot_v9` FICA DESLIGADA aqui, e é uma escolha do gate, não descuido: com ela
-- ligada o painel viria do servidor pela disjunção mesmo com `vencimentos_v9`
-- desligada, e a medição de paridade OFF × ON da 9F.5 não teria um lado OFF.
-- Com o boot antigo, `vencimentos_v9` é a ÚNICA coisa que muda a fonte do
-- painel — que é exatamente o acoplamento que esta etapa desfaz.
insert into public.org_sync (org_id, v2_ativa, vencimentos_v9, relatorios_v9)
values (:'ORG'::uuid, true, true, true)
on conflict (org_id) do update set
  v2_ativa = true, vencimentos_v9 = true, relatorios_v9 = true;

-- As flags das etapas anteriores saem do caminho: uma tela por vez.
update public.org_sync
   set inspecoes_v9 = false, prontuarios_v9 = false, calibracoes_v9 = false,
       livro_v9 = false, boot_v9 = false
 where org_id = :'ORG'::uuid;
commit;

\echo 'gerando a massa (so metadados)…'
-- `proxima_inspecao` aqui é a coluna do CATÁLOGO — a que a lista de
-- `/equipamentos` exibe. **O painel de vencimentos NÃO a lê** (ver o comentário
-- do bloco de relatórios abaixo); ela está preenchida para a lista não sair
-- vazia, e não para alimentar os baldes do painel.
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
   localizacao, ano, cliente_nome, cliente_cidade, proxima_inspecao,
   tem_foto, foto_ref, pmta_mpa, pth_mpa, resultado, volume_m3, fluido,
   classe_fluido, vida_anos, tem_cliente, unidade, inspecoes, tem_prontuario,
   calibracoes, livro_entradas, livro_ultima, source_version, source_updated_at)
select :'ORG'::uuid,
       'VP-' || lpad(i::text, 5, '0'),
       'Vaso de teste ' || i,
       'vaso',
       null,
       (array['I','II','III','IV','V'])[1 + (i % 5)],
       (array['Metalúrgica Alfa','Beta Equipamentos','Gama Industrial'])[1 + (i % 3)],
       'NS-' || lpad(i::text, 6, '0'),
       (array['Galpão A','Galpão B','Área externa'])[1 + (i % 3)],
       (2000 + (i % 25))::text,
       (array['Posto Ipiranga','Frigorífico Sul','Lavanderia Central'])[1 + (i % 3)],
       (array['Vila Velha','Serra','Vitória'])[1 + (i % 3)],
       case when i % 4 = 0 then current_date + ((i % 400) - 40) else null end,
       false, null,
       1.2 + (i % 10) * 0.1, 1.56 + (i % 10) * 0.1, 'Aprovado',
       0.5 + (i % 20), 'Ar comprimido', 'C', 12.5, false, 'SI',
       null, null, null, null, null,
       1, now()
  from generate_series(1, :n) i;

-- Relatórios em 10 % das TAGs, 3 cada. É o caso real: quase toda organização
-- tem muitos equipamentos e poucos com histórico — e é o número que o cartão do
-- catálogo da 9F.6 exibe.
--
-- **O PRAZO SAI DAQUI, NÃO DE `equipamentos_index.proxima_inspecao`.** Medido
-- neste gate: uma primeira versão da massa espalhou os três baldes na coluna do
-- catálogo e o painel exibiu "0 vencidos" sobre uma massa que tinha 29 —
-- porque `vencimentos_org` monta o prazo do RELATÓRIO MAIS RECENTE (a menor
-- entre as duas próximas inspeções) e, na falta dele, da Vida Remanescente.
-- A coluna do catálogo é para a LISTA de equipamentos; o painel não a lê.
--
-- Por isso a data que decide é a do relatório de `k = 1` — o mais recente, por
-- `emissao desc` — e ela é espalhada por `i` para cair nos três baldes.
insert into public.relatorios_index (
  org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
  emissao, validade, proxima_inspecao_interna, proxima_inspecao_externa,
  execucao_inspecao, data_ref, source_version, source_updated_at, projected_at)
select :'ORG'::uuid,
       'REL-' || i || '-' || k,
       'VP-' || lpad(i::text, 5, '0'),
       'REL-' || i || '-' || k,
       'Relatório ' || k, 'periodica', 'ok', 'Eng. Lab',
       current_date - (k * 90), current_date + (365 - k * 90),
       -- A interna é sempre folgada: quem manda no prazo é a EXTERNA, e é ela
       -- que o `least()` do agregado escolhe.
       current_date + (1800 - k * 90),
       current_date + ((i % 400) - 60) - ((k - 1) * 365),
       current_date - (k * 90), current_date - (k * 90),
       1, now(), now()
  from generate_series(1, greatest(:n / 10, 1)) i,
       generate_series(1, 3) k;

-- ---------------------------------------------------------------------------
-- AS TAGs DE PARIDADE — estas passam pela projeção DE VERDADE
-- ---------------------------------------------------------------------------
-- `ZZ-REL` é a TAG com que se prova o risco bloqueante da 9F.6: escolher pelo
-- catálogo novo e ver o HISTÓRICO REAL, com os três relatórios. Semear depois
-- de ler abriria essa tela VAZIA, sem erro nenhum.
--
-- `ZZ-VAZIO` tem ficha e NENHUM relatório: o cartão precisa dizer "0", não "—",
-- e a tela precisa abrir sem histórico sem parecer quebrada.
begin;
set local nr13.manutencao = '1';

insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-REL',
   '{"descricao":"Vaso do gate 9F.6","tipo":"vaso","fabricante":"Metalúrgica Alfa","numeroSerie":"NS-REL-001"}',
   1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_cat_ZZ-REL', '{"catFinal":"III","volInput":"2.5"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_emp_ZZ-REL',
   '{"razaoSocial":"Frigorífico Sul","cidade":"Serra","clienteId":"c1"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calc_ZZ-REL', '{"pmta":0.98,"pth":1.27}', 1, 'lab', now()),
  -- O HISTÓRICO, três relatórios. É o que `listarIndice(tag)` lê na tela e o
  -- que `projetar_relatorios` transforma em três linhas da projeção: a paridade
  -- da contagem do cartão sai da comparação entre os dois.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_historico_indice_ZZ-REL',
   '[{"id":"R1","codigo":"REL-2026-001","nome":"Inspeção Inicial","tipo":"Inspeção Inicial","emissao":"10/01/2026","validade":"10/01/2027","execucaoInspecao":"08/01/2026","proximaInspecaoExterna":"08/01/2027","proximaInspecaoInterna":"08/01/2031"},{"id":"R2","codigo":"REL-2026-002","nome":"Inspeção Periódica","tipo":"Inspeção Periódica","emissao":"12/05/2026","validade":"12/05/2027","execucaoInspecao":"10/05/2026","proximaInspecaoExterna":"10/05/2027","proximaInspecaoInterna":"10/05/2031"},{"id":"R3","codigo":"REL-2026-003","nome":"Inspeção Extraordinária","tipo":"Inspeção Extraordinária","emissao":"20/08/2026","validade":"20/08/2027","execucaoInspecao":"18/08/2026","proximaInspecaoExterna":"18/09/2026","proximaInspecaoInterna":"18/08/2031"}]',
   1, 'lab', now()),
  -- `ZZ-VAZIO`: ficha, nenhum relatório.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-VAZIO',
   '{"descricao":"Vaso sem relatório","tipo":"vaso","fabricante":"Beta Equipamentos"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_cat_ZZ-VAZIO', '{"catFinal":"V","volInput":"0.8"}', 1, 'lab', now()),
  -- `ZZ-VIDA` não tem relatório nenhum e tem Vida Remanescente: é o caminho de
  -- fallback do prazo, e o painel precisa contá-lo pela vida (§ regra oficial).
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-VIDA',
   '{"descricao":"Vaso só com vida","tipo":"vaso"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_vida_ZZ-VIDA',
   '{"dataBase":"01/02/2026","proximaInspecaoAnos":1}', 1, 'lab', now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-REL');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-VAZIO');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-VIDA');
select public.projetar_relatorios(:'ORG'::uuid, 'ZZ-REL');
commit;

analyze public.equipamentos_index;
analyze public.relatorios_index;

\echo ''
\echo '=== A MASSA ==='
select count(*) as equipamentos from public.equipamentos_index where org_id = :'ORG'::uuid;
select count(*) as relatorios   from public.relatorios_index   where org_id = :'ORG'::uuid;

\echo ''
\echo '=== OS TRES BALDES DO PAINEL (9F.5) ==='
-- Contados como o agregado conta: pelo relatorio MAIS RECENTE de cada TAG, na
-- menor das duas proximas inspecoes. Este bloco e a EXPECTATIVA contra a qual
-- os KPIs da tela sao conferidos no gate de navegador.
with recente as (
  select distinct on (r.tag) r.tag,
         least(r.proxima_inspecao_interna, r.proxima_inspecao_externa) as venc
    from public.relatorios_index r
   where r.org_id = :'ORG'::uuid
   order by r.tag, coalesce(r.emissao, r.data_ref) desc nulls last, r.relatorio_id
)
select count(*) filter (where venc < current_date)                        as vencidos,
       count(*) filter (where venc between current_date and current_date + 30) as a_vencer_30,
       count(*)                                                           as com_prazo_por_relatorio
  from recente;

\echo ''
\echo '=== AS TAGs DE PARIDADE (projecao de verdade) ==='
select e.tag,
       (select count(*) from public.relatorios_index r
         where r.org_id = e.org_id and r.tag = e.tag) as relatorios_na_projecao
  from public.equipamentos_index e
 where e.org_id = :'ORG'::uuid and e.tag like 'ZZ-%'
 order by e.tag;
