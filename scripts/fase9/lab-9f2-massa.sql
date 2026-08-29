-- ============================================================================
-- FASE 9 · 9F.2 — MASSA DE LABORATÓRIO PARA O GATE DE NAVEGADOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9f2-massa.sql
--
-- Cria (ou recria) a organização de laboratório da 9F.2 com um usuário que dá
-- para LOGAR no app local, e `:n` equipamentos na projeção.
--
-- > **Só metadados na massa grande.** Nenhum prontuário é criado em massa: o
-- > ponto do gate é provar que a LISTA não abre `nr13_prontuario_`. As TAGs de
-- > paridade abaixo existem na verdade (`app_storage`) e passam pela projeção
-- > real.
--
-- O badge cobre os três estados da regra:
--   · TAGs terminadas em 00 → tem prontuário   (true)
--   · TAGs terminadas em 50 → não tem          (false = olhei, não há)
--   · todo o resto          → não verificado   (null → badge some)
--
-- E há uma TAG COMPLETA (`ZZ-DOC`) com todas as chaves que as seis folhas leem:
-- é com ela que se prova o risco bloqueante — abrir o documento e ver conteúdo
-- REAL, não ausência de erro.
--
-- USA A MESMA ORGANIZAÇÃO DE LABORATÓRIO DA 9F.1 (`lab9f@local.test`), de
-- propósito e por dois motivos:
--
--   1. o laboratório é um só; criar um segundo usuário faria cada etapa medir
--      num parque diferente, e a comparação entre elas deixaria de valer;
--   2. o script NÃO apaga o usuário — só a massa. Derrubar `auth.users`
--      invalidaria a sessão aberta no navegador no meio do gate.
--
-- Credenciais (criadas pelo `lab-9f-massa.sql` da 9F.1, recriadas aqui se
-- faltarem): lab9f@local.test / lab123456
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
delete from public.equipamentos_index where org_id = :'ORG'::uuid;
delete from public.app_storage        where org_id = :'ORG'::uuid;

-- Usuário e perfil: criados só se ainda não existirem (idempotente).
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

-- AS FLAGS, ligadas só nesta organização de laboratório.
--
-- `boot_v9` entra junto de propósito: o gate precisa medir a tela no MESMO
-- estado do rollout — boot leve ligado, e o documento tendo de se virar com a
-- semeadura sob demanda. Medir com o boot antigo esconderia justamente o risco
-- bloqueante desta etapa.
insert into public.org_sync (org_id, v2_ativa, prontuarios_v9, boot_v9)
values (:'ORG'::uuid, true, true, true)
on conflict (org_id) do update set
  v2_ativa = true, prontuarios_v9 = true, boot_v9 = true;

-- A flag da 9F.1 sai do caminho: uma tela por vez, e o gate desta etapa mede
-- /prontuarios.
update public.org_sync set inspecoes_v9 = false where org_id = :'ORG'::uuid;
commit;

\echo 'gerando a massa (so metadados)…'
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
   localizacao, ano, cliente_nome, cliente_cidade, proxima_inspecao,
   tem_foto, foto_ref, pmta_mpa, pth_mpa, resultado, volume_m3, fluido,
   classe_fluido, vida_anos, tem_cliente, unidade, inspecoes, tem_prontuario,
   source_version, source_updated_at)
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
       date '2027-01-01' + (i % 365),
       false, null,
       1.2 + (i % 10) * 0.1, 1.56 + (i % 10) * 0.1, 'Aprovado',
       0.5 + (i % 20), 'Ar comprimido', 'C', 12.5, false, 'SI',
       null,
       -- O BADGE, nos três estados da regra. Escrito aqui para a massa grande
       -- (gerar 50.000 chaves `nr13_prontuario_` mediria o gerador, não a tela);
       -- as TAGs de paridade abaixo passam pela projeção de verdade.
       case when i % 100 = 0  then true
            when i % 100 = 50 then false
            else null end,
       1, now()
  from generate_series(1, :n) i;

analyze public.equipamentos_index;

-- ---------------------------------------------------------------------------
-- PARIDADE DO BADGE — TAGs que passam pela projeção REAL
-- ---------------------------------------------------------------------------
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-PRONT', '{"tag":"ZZ-PRONT","tipo":"vaso","descricao":"Paridade: tem prontuario"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_prontuario_ZZ-PRONT', '{"tag":"ZZ-PRONT","descricao":"Vaso de paridade"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-SEM', '{"tag":"ZZ-SEM","tipo":"vaso","descricao":"Paridade: sem prontuario"}', 1, now()),
  -- Só a META: quem apenas ABRIU o visualizador não passa a ter prontuário.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-META', '{"tag":"ZZ-META","tipo":"vaso","descricao":"Paridade: so espiou"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_prontuario_meta_ZZ-META', '{"numero":"REL-9","emitidoEm":"01/08/2026"}', 1, now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-PRONT');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-SEM');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-META');
commit;

-- ---------------------------------------------------------------------------
-- ZZ-DOC — A TAG COMPLETA, PARA A PROVA DAS SEIS FOLHAS
-- ---------------------------------------------------------------------------
-- O risco bloqueante da 9F.2 é o documento abrir VAZIO: sem `lerTudo()`, o
-- palco só materializa o que a semeadura trouxe. Esta TAG tem TODAS as chaves
-- que as folhas leem, com conteúdo reconhecível na tela — se alguma não for
-- semeada, o campo correspondente sai "-" e a prova falha à vista.
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-DOC',
   '{"tag":"ZZ-DOC","tipo":"vaso","subtipo":"","descricao":"VASO PULMAO LABORATORIO","fabricante":"METALURGICA ALFA LTDA","numeroSerie":"NS-DOC-9F2","ano":"2019","localizacao":"CASA DE MAQUINAS"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_emp_ZZ-DOC',
   '{"razaoSocial":"CLIENTE PARIDADE LTDA","nomeFantasia":"Cliente Paridade","cnpj":"12.345.678/0001-90","cidade":"Vila Velha","estado":"ES","endereco":"Rua do Laboratorio, 900","clienteId":"cli-lab"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_cat_ZZ-DOC',
   '{"catFinal":"III","grupo":"3","classe":"C","fluidoInput":"Ar comprimido","volInput":"2.5"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calc_ZZ-DOC',
   '{"pmta":"1.05","pth":"1.365","resultado":"APROVADO","memorialHTML":"<p>Memorial do laboratorio 9F.2</p>","componentes":[{"nome":"Casco","pmtaMpa":1.05,"tReqMm":4.2,"tNom":6.35,"material":"ASTM A516 Gr 60"}]}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_vaso_ZZ-DOC',
   '{"P":"1.05","componentes":[{"id":"casco","dados":{"mat":"ASTM A516 Gr 60","ca":"1.5","temp":"60","t_comercial":"6.35","D":"800"}},{"id":"tampo1","dados":{"mat":"ASTM A516 Gr 60","tipo":"torisferico"}},{"id":"tampo2","dados":{"mat":"ASTM A516 Gr 60","tipo":"torisferico"}}]}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_pref_unidade_ZZ-DOC', '"SI"', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_prontuario_ZZ-DOC',
   '{"tag":"ZZ-DOC","descricao":"VASO PULMAO LABORATORIO","modelo":"VP-900","nroSerie":"NS-DOC-9F2","dataFabricacao":"10/03/2019","codigoProjeto":"ASME VIII Div. 1","anoEdicao":"2019","categoria":"III","grupoPotencialRisco":"3","classeFluid":"C","pressaoMaxOp":"9,5","pressaoProjeto":"10,5","pressaoTH":"13,65","caracteristicasFuncionais":"Armazenamento de ar comprimido","empresaRazaoSocial":"CLIENTE PARIDADE LTDA","empresaCnpj":"12.345.678/0001-90","empresaCidade":"Vila Velha","empresaEstado":"ES","empresaEndereco":"Rua do Laboratorio, 900"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_med_esp_ZZ-DOC',
   '{"tempSup":"32","estadoSup":"Boa","cabecote":"5 MHz","velSonica":"5920","instrumento":"Ultrassom DM5E"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_med_grid_ZZ-DOC',
   '[{"ponto":"P1","esp":"6,30"},{"ponto":"P2","esp":"6,25"},{"ponto":"P3","esp":"6,31"}]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_croqui2d_ZZ-DOC',
   '{"longitudinal":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 160\"><rect x=\"40\" y=\"40\" width=\"320\" height=\"80\" fill=\"none\" stroke=\"#111\" stroke-width=\"2\"/><text x=\"150\" y=\"90\" font-size=\"14\">CROQUI 9F2</text></svg>","transversal":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><circle cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"#111\" stroke-width=\"2\"/></svg>","detalheTampo":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 120\"><path d=\"M20 100 Q100 10 180 100\" fill=\"none\" stroke=\"#111\" stroke-width=\"2\"/></svg>"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_folha_dados_ZZ-DOC',
   '{"comprimentoTotalMm":3000,"circunferenciaMm":2513,"bocais":[{"id":"N1","dn":"2\"","funcao":"Entrada"},{"id":"N2","dn":"2\"","funcao":"Saida"}],"pesos":{"vazioKg":820,"operacaoKg":1180},"dimensoes":[{"componente":"Casco","valor":"Ø800 x 3000 mm"}]}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_assinantes_pront_ZZ-DOC', '{"engenheiroId":"eng-lab","tecnicoId":"tec-lab"}', 1, now()),
  -- Globais da organização: vêm no boot leve (`CHAVES_ESSENCIAIS`), não na
  -- semeadura da TAG. Estão aqui para o cabeçalho e a assinatura saírem
  -- preenchidos, como em produção.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_minha_empresa',
   '{"razaoSocial":"ENGENHARIA LABORATORIO LTDA","nomeFantasia":"Eng Lab","cnpj":"98.765.432/0001-10","cidade":"Vitoria","estado":"ES","telefone":"(27) 3000-0000","email":"contato@englab.test","endereco":"Av. do Teste, 100"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_lista_phs',
   '[{"id":"eng-lab","nome":"ENGENHEIRO DO LABORATORIO","funcao":"Engenheiro Responsavel","crea":"CREA-ES 12345","camposExtras":[],"folhasProntuario":["PRONT-ULTRASSOM.html","PRONT-CROQUI2D.html","PRONT-FOLHA-DADOS.html","PRONT-PRONTUARIO.html","PRONT-CONTINUACAO.html","PRONT-MEMORIAL.html"],"folhasRelatorio":[]},{"id":"tec-lab","nome":"TECNICO DO LABORATORIO","funcao":"Inspetor","crea":"REG-999","camposExtras":[],"folhasProntuario":["PRONT-ULTRASSOM.html"],"folhasRelatorio":[]}]', 1, now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-DOC');
commit;

select count(*)                                      as equipamentos_na_massa,
       count(*) filter (where tem_prontuario is null)  as nao_verificado_null,
       count(*) filter (where tem_prontuario is false) as sem_prontuario_false,
       count(*) filter (where tem_prontuario is true)  as com_prontuario_true,
       pg_size_pretty(pg_total_relation_size('public.equipamentos_index')) as tabela_e_indices
  from public.equipamentos_index
 where org_id = :'ORG'::uuid;

\echo ''
\echo 'login do laboratorio: lab9f@local.test / lab123456'
\echo 'flags prontuarios_v9 e boot_v9: LIGADAS apenas nesta organizacao'
\echo 'paridade do badge: ZZ-PRONT (OK) · ZZ-SEM (Sem Prontuario) · ZZ-META (Sem Prontuario) · VP-xxx99 (badge some)'
\echo 'prova das 6 folhas: abrir ZZ-DOC e conferir conteudo real'
