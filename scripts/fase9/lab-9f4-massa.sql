-- ============================================================================
-- FASE 9 · 9F.4 — MASSA DE LABORATÓRIO PARA O GATE DE `/livro-registro`
-- ============================================================================
--
--   docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
--     -v n=50000 -f - < scripts/fase9/lab-9f4-massa.sql
--
-- SOMENTE SUPABASE LOCAL. A trava permanente (§12 do CLAUDE.md e
-- `scripts/massa-escala/seguranca.mjs`) proíbe massa contra o projeto de
-- produção `qqsesrntfvmdxqxrfvmw`, e ela não tem variável de ambiente que a
-- destrave. Este arquivo é `psql` direto no container local, e não deve ser
-- apontado para lugar nenhum além dele.
--
-- Cria (ou recria) a organização de laboratório com um usuário que dá para
-- LOGAR no app local, e `:n` equipamentos na projeção.
--
-- > **Só metadados na massa grande.** Nenhum livro é criado em massa: o ponto do
-- > gate é provar que a LISTA não abre `nr13_livro_` de ninguém. As TAGs de
-- > paridade abaixo existem na verdade (`app_storage`) e passam pela projeção
-- > real.
--
-- O RECORTE DESTA TELA, e por que a massa é diferente da 9F.3: a lista do Livro
-- mostra só quem TEM livro. Então a massa precisa de duas populações:
--
--   · TAGs terminadas em 00 → 4 entradas   (entram na lista)
--   · TAGs terminadas em 50 → `null`       (não contadas — ENTRAM na lista, e é
--                                           a regra que impede a tela de sumir
--                                           com o parque de quem não reprojetou)
--   · todo o resto          → 0            (contei, não há livro — ficam FORA)
--
-- Com `:n` = 50.000 isso dá 500 linhas com livro + 500 não contadas = 1.000 na
-- lista, sobre 50.000 equipamentos. É exatamente o caso que o filtro no servidor
-- existe para resolver: filtrar no cliente traria 50.000 para desenhar 1.000.
--
-- E há uma TAG COMPLETA (`ZZ-LIV`) com livro, config e termo na VERDADE: é com
-- ela que se prova o risco bloqueante — abrir e ver o livro REAL, com entradas,
-- e não ausência de erro.
--
-- USA A MESMA ORGANIZAÇÃO DE LABORATÓRIO DA 9F.1/9F.2/9F.3 (`lab9f@local.test`),
-- de propósito: o laboratório é um só, e o script NÃO apaga o usuário — só a
-- massa. Derrubar `auth.users` invalidaria a sessão aberta no navegador no meio
-- do gate.
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
delete from public.relatorios_index    where org_id = :'ORG'::uuid;
delete from public.equipamentos_index  where org_id = :'ORG'::uuid;
delete from public.app_storage         where org_id = :'ORG'::uuid;
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

-- AS FLAGS, ligadas só nesta organização de laboratório.
--
-- `boot_v9` entra junto de propósito: o gate precisa medir a tela no MESMO
-- estado do rollout — boot leve ligado, e o livro tendo de se virar com a
-- semeadura sob demanda. Medir com o boot antigo esconderia o risco bloqueante.
insert into public.org_sync (org_id, v2_ativa, livro_v9, boot_v9)
values (:'ORG'::uuid, true, true, true)
on conflict (org_id) do update set
  v2_ativa = true, livro_v9 = true, boot_v9 = true;

-- As flags das etapas anteriores saem do caminho: uma tela por vez, e o gate
-- desta etapa mede /livro-registro.
update public.org_sync
   set inspecoes_v9 = false, prontuarios_v9 = false, calibracoes_v9 = false
 where org_id = :'ORG'::uuid;
commit;

\echo 'gerando a massa (so metadados)…'
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
       date '2027-01-01' + (i % 365),
       false, null,
       1.2 + (i % 10) * 0.1, 1.56 + (i % 10) * 0.1, 'Aprovado',
       0.5 + (i % 20), 'Ar comprimido', 'C', 12.5, false, 'SI',
       null, null, null,
       -- As TRÊS populações da regra. Escritas aqui para a massa grande (gerar
       -- 50.000 livros mediria o gerador, não a tela); as TAGs de paridade
       -- abaixo passam pela projeção de verdade.
       case when i % 100 = 0  then 4
            when i % 100 = 50 then null
            else 0 end,
       case when i % 100 = 0 then date '2026-01-01' + (i % 300) else null end,
       1, now()
  from generate_series(1, :n) i;

-- ---------------------------------------------------------------------------
-- AS TAGs DE PARIDADE — estas passam pela projeção DE VERDADE
-- ---------------------------------------------------------------------------
-- `ZZ-LIV` é a TAG com que se prova o risco bloqueante: abrir o livro pela
-- lista nova e ver as entradas REAIS, com o lacre conferido pelo mecanismo
-- atual. Ausência de erro não é prova; conteúdo é.
begin;
set local nr13.manutencao = '1';

insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, atualizado_em) values
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-LIV',
   '{"descricao":"Vaso do gate 9F.4","tipo":"vaso","fabricante":"Metalúrgica Alfa","numeroSerie":"NS-LIV-001"}',
   1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_cat_ZZ-LIV', '{"catFinal":"III","volInput":"2.5"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_emp_ZZ-LIV', '{"razaoSocial":"Frigorífico Sul","cidade":"Serra","clienteId":"c1"}', 1, 'lab', now()),
  -- O LIVRO, com quatro entradas fora de ordem cronológica de propósito.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_livro_ZZ-LIV',
   '[{"id":"L1","data":"12/01/2026","tipo":"Inspeção Inicial","descricao":"Abertura do livro"},{"id":"L2","data":"03/08/2026","tipo":"Inspeção Periódica","descricao":"Inspeção externa"},{"id":"L3","data":"20/03/2026","tipo":"Manutenção corretiva","descricao":"Troca da válvula de segurança"},{"id":"L4","data":"15/05/2026","tipo":"Ajuste/Calibração","descricao":"Calibração do manômetro"}]',
   1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_livro_config_ZZ-LIV', '{"numeroLivro":"LIV-001"}', 1, 'lab', now()),
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_termo_livro_ZZ-LIV', '{"abertoEm":"12/01/2026","responsavel":"Eng. Teste"}', 1, 'lab', now()),
  -- `ZZ-SEM` tem ficha e NENHUM livro: precisa ficar FORA da lista.
  (:'ORG'::uuid, :'ORG'::uuid, 'nr13_info_ZZ-SEM',
   '{"descricao":"Vaso sem livro","tipo":"vaso"}', 1, 'lab', now());

select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-LIV');
select public.projetar_equipamento(:'ORG'::uuid, 'ZZ-SEM');
commit;

\echo ''
\echo '=== A MASSA ==='
select count(*) as equipamentos from public.equipamentos_index where org_id = :'ORG'::uuid;

select count(*) filter (where livro_entradas > 0)   as com_livro,
       count(*) filter (where livro_entradas = 0)   as sem_livro,
       count(*) filter (where livro_entradas is null) as nao_contados,
       count(*) filter (where livro_entradas is null or livro_entradas > 0) as na_lista
  from public.equipamentos_index where org_id = :'ORG'::uuid;

\echo ''
\echo '=== AS TAGs DE PARIDADE (projecao de verdade) ==='
select tag, livro_entradas, livro_ultima
  from public.equipamentos_index
 where org_id = :'ORG'::uuid and tag like 'ZZ-%'
 order by tag;

\echo ''
\echo 'login: lab9f@local.test / lab123456'
