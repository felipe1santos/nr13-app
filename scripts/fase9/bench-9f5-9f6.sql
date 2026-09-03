-- ============================================================================
-- FASE 9 · GATE CONJUNTO 9F.5 + 9F.6 — massa e medição, SOMENTE LOCAL
-- ============================================================================
--
-- **NÃO RODAR EM PRODUÇÃO.** §12 do `CLAUDE.md`: massa de escala, benchmark e
-- gate de 1k/10k/50k rodam somente em Supabase local (`npx supabase start`). O
-- projeto `qqsesrntfvmdxqxrfvmw` nunca recebe massa.
--
-- Uso:
--   psql -v n=1000  -f bench-9f5-9f6.sql
--   psql -v n=10000 -f bench-9f5-9f6.sql
--   psql -v n=50000 -f bench-9f5-9f6.sql
--
-- O que é medido, e por quê:
--
--   · `vencimentos_org(500)` — o AGREGADO que a 9F.5 desacopla do `boot_v9`. É
--     agregado, não lista: ele PRECISA percorrer a organização para contar, e a
--     pergunta do gate é se esse custo cresce de forma aceitável;
--   · `contar_relatorios_por_tag(50 TAGs)` — a contagem do catálogo da 9F.6.
--     A pergunta aqui é o contrário: ela NÃO pode crescer com o parque, porque
--     olha só as 50 TAGs da página.
--
-- A massa entra direto nas PROJEÇÕES. Elas são derivadas e descartáveis; gerar
-- 50.000 equipamentos pela verdade mediria o gerador, não a consulta — mesma
-- decisão declarada no cabeçalho do `lab-9f4-massa.sql`.
-- ============================================================================

\set ORG '00000000-9f55-4000-8000-000000009999'
\set ON_ERROR_STOP on

-- ── Organização de laboratório ──────────────────────────────────────────────
insert into public.org_sync (org_id, v2_ativa, vencimentos_v9, relatorios_v9)
values (:'ORG', true, true, true)
on conflict (org_id) do update
  set vencimentos_v9 = true, relatorios_v9 = true;

-- ── Massa: equipamentos ─────────────────────────────────────────────────────
delete from public.relatorios_index where org_id = :'ORG';
delete from public.equipamentos_index where org_id = :'ORG';

insert into public.equipamentos_index (
  org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
  localizacao, ano, cliente_nome, cliente_cidade, proxima_inspecao,
  tem_foto, pmta_mpa, volume_m3, tem_cliente, unidade,
  source_version, source_updated_at, projected_at
)
select
  :'ORG',
  'VP-' || lpad(i::text, 6, '0'),
  'Vaso de laboratorio ' || i,
  'vaso', null,
  case when i % 3 = 0 then 'III' when i % 3 = 1 then 'IV' else 'V' end,
  'Metalurgica ' || (i % 40),
  'S' || i,
  'Area ' || (i % 12),
  '2019',
  'Frigorifico ' || (i % 25),
  'Cidade ' || (i % 18),
  -- Um em cada quatro tem prazo, e um em cada vinte está vencido: o agregado
  -- precisa de linhas que caiam nos três baldes (vencido, a vencer, sem prazo).
  case when i % 4 = 0 then current_date + ((i % 400) - 40) else null end,
  false,
  (1 + (i % 20))::numeric / 10,
  (1 + (i % 9))::numeric,
  true,
  'SI',
  1, now(), now()
from generate_series(1, :n) i;

-- ── Massa: relatórios — 3 por equipamento nos 10 % primeiros ────────────────
-- O catálogo da 9F.6 conta relatórios por TAG. Concentrar em 10 % das TAGs é o
-- caso real: quase toda organização tem muitos equipamentos e poucos com
-- histórico.
insert into public.relatorios_index (
  org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
  emissao, validade, source_version, source_updated_at, projected_at
)
select
  :'ORG',
  'REL-' || i || '-' || k,
  'VP-' || lpad(i::text, 6, '0'),
  'REL-' || i || '-' || k,
  'Relatorio ' || k,
  'periodica', 'ok', 'Eng Lab',
  current_date - (k * 90),
  current_date + (365 - k * 90),
  1, now(), now()
from generate_series(1, greatest(:n / 10, 1)) i,
     generate_series(1, 3) k;

analyze public.equipamentos_index;
analyze public.relatorios_index;

select
  :n                                                                 as degrau,
  (select count(*) from public.equipamentos_index where org_id = :'ORG') as equipamentos,
  (select count(*) from public.relatorios_index  where org_id = :'ORG') as relatorios;

-- ── Identidade da organização, para as RPCs `security definer` ──────────────
-- `org_atual()` lê `auth.uid()`; sem um perfil apontando para a org, as duas
-- funções devolvem vazio pelo fail-closed — e o bench mediria o nada.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values (:'ORG', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'lab9f56@local.test', crypt('lab', gen_salt('bf')),
        now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, org_id, papel)
values (:'ORG', 'lab9f56@local.test', :'ORG', 'mestre')
on conflict (id) do update set org_id = excluded.org_id, papel = excluded.papel;

-- TRANSAÇÃO OBRIGATÓRIA: `set local` e `set_config(..., true)` só valem dentro
-- de uma. Fora dela a identidade não chega às RPCs, elas caem no fail-closed e o
-- bench mede o NADA — devolvendo zero linhas e um plano de 50 buffers que parece
-- ótimo e não significa coisa nenhuma.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :'ORG', 'role', 'authenticated')::text, true);

-- ── MEDIÇÃO 1 · o agregado da 9F.5 ──────────────────────────────────────────
\echo '--- vencimentos_org(500) ---'
explain (analyze, buffers, timing off, summary on, format text)
select public.vencimentos_org(500);

-- ── MEDIÇÃO 2 · a contagem por TAG da 9F.6 (uma PÁGINA de 50) ───────────────
\echo '--- contar_relatorios_por_tag(50 TAGs) ---'
explain (analyze, buffers, timing off, summary on, format text)
select * from public.contar_relatorios_por_tag(
  (select array_agg('VP-' || lpad(i::text, 6, '0'))
     from generate_series(1, 50) i)
);

\echo '--- resultado da contagem (amostra) ---'
select count(*) as tags_com_relatorio,
       sum(total) as relatorios_somados
  from public.contar_relatorios_por_tag(
    (select array_agg('VP-' || lpad(i::text, 6, '0')) from generate_series(1, 50) i)
  );

commit;
