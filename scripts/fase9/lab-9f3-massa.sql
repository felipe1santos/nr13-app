-- ============================================================================
-- FASE 9 · 9F.3 — MASSA DE LABORATÓRIO PARA O GATE DE NAVEGADOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9f3-massa.sql
--
-- Cria (ou recria) a organização de laboratório com um usuário que dá para
-- LOGAR no app local, e `:n` equipamentos na projeção.
--
-- > **Só metadados na massa grande.** Nenhuma lista de calibração é criada em
-- > massa: o ponto do gate é provar que a LISTA não abre `nr13_calibracoes_`.
-- > As TAGs de paridade abaixo existem na verdade (`app_storage`) e passam pela
-- > projeção real.
--
-- O rótulo cobre os três estados da regra:
--   · TAGs terminadas em 00 → 3 calibrações   (contei)
--   · TAGs terminadas em 50 → 0               (contei, e não há)
--   · todo o resto          → não contado      (null → o rótulo some)
--
-- E há uma TAG COMPLETA (`ZZ-CAL`) com calibrações, componentes, lotes e o
-- certificado por id: é com ela que se prova o risco bloqueante — abrir o
-- histórico e ver conteúdo REAL, não ausência de erro.
--
-- USA A MESMA ORGANIZAÇÃO DE LABORATÓRIO DA 9F.1/9F.2 (`lab9f@local.test`), de
-- propósito e por dois motivos:
--
--   1. o laboratório é um só; criar um segundo usuário faria cada etapa medir
--      num parque diferente, e a comparação entre elas deixaria de valer;
--   2. o script NÃO apaga o usuário — só a massa. Derrubar `auth.users`
--      invalidaria a sessão aberta no navegador no meio do gate.
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
delete from public.calibracoes_index   where org_id = :'ORG'::uuid;
delete from public.equipamentos_index  where org_id = :'ORG'::uuid;
delete from public.app_storage         where org_id = :'ORG'::uuid;
-- O rebuild é RETOMÁVEL: com o cursor no fim ele vira no-op e o laboratório
-- ficaria sem reprojetar. Descoberto pelo `testes-9f3.sql` falhando na segunda
-- execução.
delete from public.busca_rebuild_estado where org_id = :'ORG'::uuid;

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
-- estado do rollout — boot leve ligado, e o histórico tendo de se virar com a
-- semeadura sob demanda. Medir com o boot antigo esconderia justamente o risco
-- bloqueante desta etapa.
insert into public.org_sync (org_id, v2_ativa, calibracoes_v9, boot_v9)
values (:'ORG'::uuid, true, true, true)
on conflict (org_id) do update set
  v2_ativa = true, calibracoes_v9 = true, boot_v9 = true;

-- As flags das etapas anteriores saem do caminho: uma tela por vez, e o gate
-- desta etapa mede /calibracoes.
update public.org_sync set inspecoes_v9 = false, prontuarios_v9 = false
 where org_id = :'ORG'::uuid;
commit;

\echo 'gerando a massa (so metadados)…'
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
   localizacao, ano, cliente_nome, cliente_cidade, proxima_inspecao,
   tem_foto, foto_ref, pmta_mpa, pth_mpa, resultado, volume_m3, fluido,
   classe_fluido, vida_anos, tem_cliente, unidade, inspecoes, tem_prontuario,
   calibracoes, source_version, source_updated_at)
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
       null, null,
       -- O RÓTULO, nos três estados da regra. Escrito aqui para a massa grande
       -- (gerar 50.000 listas `nr13_calibracoes_` mediria o gerador, não a
       -- tela); as TAGs de paridade abaixo passam pela projeção de verdade.
       case when i % 100 = 0  then 3
            when i % 100 = 50 then 0
            else null end,
       1, now()
  from generate_series(1, :n) i;

analyze public.equipamentos_index;

-- ---------------------------------------------------------------------------
-- PARIDADE DO RÓTULO — TAGs que passam pela projeção REAL
-- ---------------------------------------------------------------------------
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-TRES', '{"tag":"ZZ-TRES","tipo":"vaso","descricao":"Paridade: tres calibracoes"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calibracoes_ZZ-TRES',
   '[{"id":"p1","tipo":"manometro","nome":"Manometro A","componenteId":"m1","dataCalibracao":"01/03/2026","proxCalibracao":"01/03/2027"},
     {"id":"p2","tipo":"psv","nome":"Valvula A","componenteId":"v1","dataCalibracao":"02/03/2026","proxCalibracao":"02/03/2027"},
     {"id":"p3","tipo":"psv","nome":"Valvula B","componenteId":"v2","dataCalibracao":"03/03/2026","proxCalibracao":"03/03/2027"}]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-NENHUMA', '{"tag":"ZZ-NENHUMA","tipo":"vaso","descricao":"Paridade: nenhuma calibracao"}', 1, now()),
  -- Só o CERTIFICADO de um id órfão: não pertence a TAG nenhuma e não pode
  -- criar equipamento fantasma nem contar para ninguém.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calibracao_item_orfao', '{"id":"orfao","pdfBase64":""}', 1, now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-TRES');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-NENHUMA');
commit;

-- ---------------------------------------------------------------------------
-- ZZ-CAL — A TAG COMPLETA, PARA A PROVA DO HISTÓRICO
-- ---------------------------------------------------------------------------
-- O risco bloqueante da 9F.3 é o histórico abrir VAZIO: sem `lerTudo()`, só
-- existe no cache o que a semeadura trouxe, e as quatro famílias desta tela
-- caem em vazio SEM ERRO NENHUM. Esta TAG tem as quatro, com conteúdo
-- reconhecível na tela — se alguma não for semeada, a seção correspondente sai
-- vazia e a prova falha à vista.
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-CAL',
   '{"tag":"ZZ-CAL","tipo":"vaso","subtipo":"","descricao":"VASO PULMAO LABORATORIO 9F3","fabricante":"METALURGICA ALFA LTDA","numeroSerie":"NS-CAL-9F3","ano":"2019","localizacao":"CASA DE MAQUINAS"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_emp_ZZ-CAL',
   '{"razaoSocial":"CLIENTE CALIBRACAO LTDA","nomeFantasia":"Cliente Calibracao","cnpj":"12.345.678/0001-90","cidade":"Vila Velha","estado":"ES","endereco":"Rua do Laboratorio, 900","clienteId":"cli-lab"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_cat_ZZ-CAL',
   '{"catFinal":"III","grupo":"3","classe":"C","fluidoInput":"Ar comprimido","volInput":"2.5"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calc_ZZ-CAL',
   '{"pmta":"1.05","pth":"1.365","resultado":"APROVADO","memorialHTML":"<p>Memorial do laboratorio 9F.3</p>"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_pref_unidade_ZZ-CAL', '"SI"', 1, now()),

  -- AS QUATRO FAMÍLIAS DA TELA.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calibracoes_ZZ-CAL',
   '[{"id":"cal-lab-1","tipo":"manometro","nome":"MANOMETRO LABORATORIO","serie":"SER-MAN-001","componenteId":"comp-man","loteId":"lote-1","dataCalibracao":"05/03/2026","proxCalibracao":"05/03/2027","faixa":"0-16 bar"},
     {"id":"cal-lab-2","tipo":"psv","nome":"VALVULA LABORATORIO","serie":"SER-PSV-002","componenteId":"comp-psv","loteId":"lote-1","dataCalibracao":"06/03/2026","proxCalibracao":"06/03/2027","pressaoAjuste":"10.5"}]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_componentes_cal_ZZ-CAL',
   '[{"id":"comp-man","nome":"MANOMETRO LABORATORIO","tipo":"manometro","serie":"SER-MAN-001"},
     {"id":"comp-psv","nome":"VALVULA LABORATORIO","tipo":"psv","serie":"SER-PSV-002"}]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_lotes_cal_ZZ-CAL',
   '[{"id":"lote-1","descricao":"LOTE DE LABORATORIO 9F3","criadoEm":"05/03/2026"}]', 1, now()),
  -- Os certificados, por ID. Só chegam ao cache pela SEGUNDA passada de
  -- `carregarEquipamento`, montada a partir dos ids da lista acima.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calibracao_item_cal-lab-1',
   '{"id":"cal-lab-1","tipo":"manometro","nome":"MANOMETRO LABORATORIO","serie":"SER-MAN-001","dataCalibracao":"05/03/2026","proxCalibracao":"05/03/2027"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_calibracao_item_cal-lab-2',
   '{"id":"cal-lab-2","tipo":"psv","nome":"VALVULA LABORATORIO","serie":"SER-PSV-002","dataCalibracao":"06/03/2026","proxCalibracao":"06/03/2027"}', 1, now()),

  -- Globais da organização: vêm no boot leve (`CHAVES_ESSENCIAIS`), não na
  -- semeadura da TAG.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_minha_empresa',
   '{"razaoSocial":"ENGENHARIA LABORATORIO LTDA","nomeFantasia":"Eng Lab","cnpj":"98.765.432/0001-10","cidade":"Vitoria","estado":"ES","telefone":"(27) 3000-0000","email":"contato@englab.test","endereco":"Av. do Teste, 100"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_lista_phs',
   '[{"id":"eng-lab","nome":"ENGENHEIRO DO LABORATORIO","funcao":"Engenheiro Responsavel","crea":"CREA-ES 12345","camposExtras":[],"folhasProntuario":[],"folhasRelatorio":[]}]', 1, now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-CAL');
commit;

select count(*)                                  as equipamentos_na_massa,
       count(*) filter (where calibracoes is null) as nao_contado_null,
       count(*) filter (where calibracoes = 0)     as zero_contado,
       count(*) filter (where calibracoes > 0)     as com_calibracoes,
       (select count(*) from public.calibracoes_index where org_id = :'ORG'::uuid) as linhas_projetadas,
       pg_size_pretty(pg_total_relation_size('public.equipamentos_index')) as tabela_e_indices
  from public.equipamentos_index
 where org_id = :'ORG'::uuid;

\echo ''
\echo 'login do laboratorio: lab9f@local.test / lab123456'
\echo 'flags calibracoes_v9 e boot_v9: LIGADAS apenas nesta organizacao'
\echo 'paridade: ZZ-TRES (3 calibracoes) · ZZ-NENHUMA (Nenhuma calibracao) · VP-xxx99 (rotulo some)'
\echo 'prova do historico: abrir ZZ-CAL e conferir 2 calibracoes, 2 componentes, 1 lote'
