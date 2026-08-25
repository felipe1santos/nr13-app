-- ============================================================================
-- FASE 9 · 9E — MASSA DE LABORATÓRIO PARA O TESTE DE NAVEGADOR
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9e-massa.sql
--
-- Cria (ou recria) uma organização de laboratório com um usuário que dá para
-- LOGAR no app local, e `:n` relatórios na projeção.
--
-- > **Só metadados.** `pdf_ref` é uma string; nenhum PDF é criado. O ponto do
-- > teste é justamente provar que a tela não os toca.
--
-- Credenciais: lab9e@local.test / lab123456
-- ============================================================================
\set ON_ERROR_STOP on
\if :{?n}
\else
  \set n 50000
\endif

\set ORG '00000000-9e77-4000-8000-00000000la99'

begin;
set local nr13.manutencao = '1';

delete from public.relatorios_index where org_id = '00000000-9e77-4000-8000-000000009999'::uuid;
delete from public.org_sync  where org_id = '00000000-9e77-4000-8000-000000009999'::uuid;
delete from public.profiles  where id = '00000000-9e77-4000-8000-000000009999'::uuid;
delete from auth.users       where id = '00000000-9e77-4000-8000-000000009999'::uuid;

-- Usuário com senha real: o teste precisa passar pelo login do app, porque é o
-- login que grava `nr13_org_id` e sincroniza a flag da sessão.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-9e77-4000-8000-000000009999'::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'lab9e@local.test',
  crypt('lab123456', gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
);

-- OS CAMPOS DE TOKEN PRECISAM SER STRING VAZIA, NÃO NULL.
--
-- O GoTrue lê `auth.users` em Go e faz scan das colunas de token para `string`.
-- Com NULL, o scan falha e o login devolve **500 "Database error querying
-- schema"** — uma mensagem que não diz nada sobre a causa e já custou tempo
-- aqui. Inserir a linha à mão pula os defaults que o serviço normalmente aplica.
update auth.users set
  confirmation_token         = '', recovery_token          = '',
  email_change_token_new     = '', email_change            = '',
  email_change_token_current = '', reauthentication_token  = '',
  phone_change               = '', phone_change_token      = '',
  is_sso_user = false, is_anonymous = false
where id = '00000000-9e77-4000-8000-000000009999'::uuid;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-9e77-4000-8000-000000009999'::uuid,
  ('{"sub":"00000000-9e77-4000-8000-000000009999","email":"lab9e@local.test"}')::jsonb,
  'email', 'lab9e@local.test', now(), now(), now()
);

insert into public.profiles (id, email, org_id, papel, ativo, role, plano)
values ('00000000-9e77-4000-8000-000000009999'::uuid, 'lab9e@local.test',
        '00000000-9e77-4000-8000-000000009999'::uuid, 'mestre', true, 'user', 'completo')
on conflict (id) do update set
  org_id = excluded.org_id, papel = 'mestre', ativo = true, plano = 'completo';

-- A FLAG DA TELA, ligada só nesta organização de laboratório.
insert into public.org_sync (org_id, busca_v9)
values ('00000000-9e77-4000-8000-000000009999'::uuid, true)
on conflict (org_id) do update set busca_v9 = true;
commit;

\echo 'gerando a massa (só metadados)…'
insert into public.relatorios_index
  (org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
   emissao, validade, execucao_inspecao,
   proxima_inspecao_interna, proxima_inspecao_externa,
   pdf_ref, sha256, paginas, source_version, source_updated_at)
select '00000000-9e77-4000-8000-000000009999'::uuid,
       'REL-' || lpad(i::text, 7, '0'),
       'VP-' || lpad((i % 500)::text, 4, '0'),
       'REL-17864' || lpad(i::text, 7, '0'),
       'Relatorio_Inspecao_Periodica_VP-' || (i % 500) || '.pdf',
       (array['Inspeção Inicial','Inspeção Periódica','Inspeção Extraordinária'])[1 + (i % 3)],
       'Aprovado',
       (array['Ana Souza','Carlos Lima','Marina Alves'])[1 + (i % 3)],
       -- 5 % SEM data: o caso da fronteira precisa estar na tela também, e é
       -- onde se confere que o usuário lê "Sem data" e nunca `01/01/0001`.
       case when i % 20 = 0 then null else date '2020-01-01' + (i % 2000) end,
       date '2027-01-01' + (i % 365),
       case when i % 20 = 0 then null else date '2020-01-01' + (i % 2000) end,
       date '2027-06-01' + (i % 200),
       date '2028-01-01' + (i % 200),
       'lab/relatorios/uuid-' || i || '.pdf',   -- REFERÊNCIA. Nenhum arquivo.
       md5(i::text), 13, 1, now()
  from generate_series(1, :n) i;

analyze public.relatorios_index;

select count(*) as relatorios_na_massa,
       count(*) filter (where emissao is null) as sem_data,
       pg_size_pretty(pg_total_relation_size('public.relatorios_index')) as tabela_e_indices
  from public.relatorios_index
 where org_id = '00000000-9e77-4000-8000-000000009999'::uuid;

\echo ''
\echo 'login do laboratorio: lab9e@local.test / lab123456'
\echo 'flag busca_v9: LIGADA apenas nesta organizacao'
