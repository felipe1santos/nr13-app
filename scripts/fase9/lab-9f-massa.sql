-- ============================================================================
-- FASE 9 · 9F.1 — MASSA DE LABORATÓRIO PARA O GATE DE NAVEGADOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9f-massa.sql
--
-- Cria (ou recria) uma organização de laboratório com um usuário que dá para
-- LOGAR no app local, e `:n` equipamentos na projeção.
--
-- > **Só metadados.** Nenhum container de inspeção é criado em massa: o ponto do
-- > gate é provar que a LISTA não toca `nr13_docs_`. As poucas TAGs que têm
-- > container existem para conferir a PARIDADE do badge — e são criadas na
-- > verdade (`app_storage`), passando pela projeção real.
--
-- A contagem do badge cobre os três casos da regra:
--   · TAGs terminadas em 00 → 3 containers  (número)
--   · TAGs terminadas em 50 → array vazio   (zero medido)
--   · todo o resto          → sem a chave   (null = não sei → badge some)
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

delete from public.equipamentos_index where org_id = :'ORG'::uuid;
delete from public.app_storage        where org_id = :'ORG'::uuid;
delete from public.org_sync           where org_id = :'ORG'::uuid;
delete from public.profiles           where id = :'ORG'::uuid;
delete from auth.users                where id = :'ORG'::uuid;

-- Usuário com senha real: o teste precisa passar pelo login do app, porque é o
-- login que grava `nr13_org_id` e sincroniza as flags da sessão.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  :'ORG'::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'lab9f@local.test',
  crypt('lab123456', gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
);

-- OS CAMPOS DE TOKEN PRECISAM SER STRING VAZIA, NÃO NULL — o GoTrue faz scan
-- deles para `string` em Go, e com NULL o login devolve 500 "Database error
-- querying schema". A armadilha está registrada no gate da 9E.
update auth.users set
  confirmation_token         = '', recovery_token          = '',
  email_change_token_new     = '', email_change            = '',
  email_change_token_current = '', reauthentication_token  = '',
  phone_change               = '', phone_change_token      = '',
  is_sso_user = false, is_anonymous = false
where id = :'ORG'::uuid;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), :'ORG'::uuid,
  ('{"sub":"' || :'ORG' || '","email":"lab9f@local.test"}')::jsonb,
  'email', 'lab9f@local.test', now(), now(), now()
);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano)
values (:'ORG'::uuid, 'lab9f@local.test', :'ORG'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  org_id = excluded.org_id, papel = 'mestre', ativo = true, plano = 'completo';

-- AS FLAGS, ligadas só nesta organização de laboratório.
--
-- `boot_v9` entra junto de propósito: o gate precisa medir a tela no MESMO
-- estado do rollout — boot leve ligado, e a lista tendo de se virar sem o cache
-- completo. Medir com o boot antigo esconderia justamente o que a 9F.1 conserta.
insert into public.org_sync (org_id, v2_ativa, inspecoes_v9, boot_v9)
values (:'ORG'::uuid, true, true, true)
on conflict (org_id) do update set
  v2_ativa = true, inspecoes_v9 = true, boot_v9 = true;
commit;

\echo 'gerando a massa (so metadados)…'
insert into public.equipamentos_index
  (org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
   localizacao, ano, cliente_nome, cliente_cidade, proxima_inspecao,
   tem_foto, foto_ref, pmta_mpa, pth_mpa, resultado, volume_m3, fluido,
   classe_fluido, vida_anos, tem_cliente, unidade, inspecoes,
   source_version, source_updated_at)
select :'ORG'::uuid,
       'VP-' || lpad(i::text, 5, '0'),
       'Vaso de teste ' || i,
       (array['vaso','caldeira','autoclave'])[1 + (i % 3)],
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
       -- A CONTAGEM, nos três casos da regra. Ela é ESCRITA aqui para a massa
       -- grande (gerar 50.000 chaves `nr13_docs_` em `app_storage` mediria o
       -- gerador, não a tela); as TAGs de paridade abaixo passam pela projeção
       -- de verdade e provam que o número bate com o container real.
       case when i % 100 = 0 then 3
            when i % 100 = 50 then 0
            else null end,
       1, now()
  from generate_series(1, :n) i;

analyze public.equipamentos_index;

-- ---------------------------------------------------------------------------
-- PARIDADE DO BADGE — três TAGs que passam pela projeção REAL
-- ---------------------------------------------------------------------------
-- Aqui o container existe em `app_storage` e a contagem é calculada por
-- `projetar_equipamento`, como em produção. É o que liga o número da tela ao
-- dado, em vez de a um valor plantado.
begin;
set local nr13.manutencao = '1';
insert into public.app_storage (user_id, org_id, chave, valor, versao, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-TRES', '{"tipo":"vaso","descricao":"Paridade: tres containers"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_docs_ZZ-TRES', '[{"id":"c1","nome":"Rodada 1","criadoEm":"01/08/2026","ensaios":["checklist"],"dados":{}},{"id":"c2","nome":"Rodada 2","criadoEm":"05/08/2026","ensaios":["ultrassom"],"dados":{}},{"id":"c3","nome":"Rodada 3","criadoEm":"09/08/2026","ensaios":["visual_externo"],"dados":{}}]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-ZERO', '{"tipo":"vaso","descricao":"Paridade: zero medido"}', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_docs_ZZ-ZERO', '[]', 1, now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-NULO', '{"tipo":"vaso","descricao":"Paridade: nao contado"}', 1, now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-TRES');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-ZERO');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-NULO');
commit;

select count(*)                                   as equipamentos_na_massa,
       count(*) filter (where inspecoes is null)   as sem_contagem_null,
       count(*) filter (where inspecoes = 0)       as zero_medido,
       count(*) filter (where inspecoes > 0)       as com_inspecoes,
       pg_size_pretty(pg_total_relation_size('public.equipamentos_index')) as tabela_e_indices
  from public.equipamentos_index
 where org_id = :'ORG'::uuid;

\echo ''
\echo 'login do laboratorio: lab9f@local.test / lab123456'
\echo 'flags inspecoes_v9 e boot_v9: LIGADAS apenas nesta organizacao de laboratorio'
\echo 'paridade do badge: ZZ-TRES (3) · ZZ-ZERO (0) · ZZ-NULO (badge some)'
