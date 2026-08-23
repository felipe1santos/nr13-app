-- ============================================================================
-- FASE 9 · 9A — PROJEÇÕES DE BUSCA (infraestrutura, SEM leitores)
-- ============================================================================
--
-- Desenho aprovado: docs/superpowers/specs/2026-08-22-fase9-escala-busca-design.md
-- Task-level:      docs/superpowers/plans/2026-08-22-fase9-task-level.md
--
-- O QUE ESTE ARQUIVO É
--
--   Duas projeções LEVES e DERIVADAS de `app_storage`, mais a tabela de
--   pendências de reconciliação. Nada as lê ainda: os leitores nascem na 9C, e
--   quem as mantém durante a escrita nasce na 9B.
--
-- O QUE ELE NÃO É
--
--   NÃO é uma segunda fonte de verdade. `app_storage` continua sendo a verdade
--   (invariante I1). Perder estas tabelas não perde informação empresarial —
--   `reconstruir_indice_busca` as refaz a partir da verdade.
--
-- IDENTIDADE FONTE ↔ PROJEÇÃO (invariante I4)
--
--   Toda linha responde "corresponde a qual versão da verdade?":
--     source_version     = app_storage.versao EFETIVAMENTE PERSISTIDA
--     source_updated_at  = app_storage.atualizado_em
--     projected_at       = quando esta linha foi escrita
--
--   `versao` já é o versionamento do sistema — o mesmo que a RPC usa para
--   detectar conflito e o mesmo do piso de tombstone. NÃO se cria contador novo.
--
--   PROIBIDO como autoridade de convergência: `mutado_em_cliente`. O próprio
--   `armazenamento_v2.sql` o marca como AUDITORIA APENAS — é relógio de
--   aparelho, sujeito a fuso, atraso e adulteração.
--
-- ÍNDICES DE BUSCA: nenhum aqui. Eles nascem na 9C, um por vez, cada um com
-- consulta real e `EXPLAIN (ANALYZE, BUFFERS)` antes e depois (invariante I9).
-- As PKs abaixo existem por integridade, não por otimização de busca.
--
-- Idempotente. Aplicado no laboratório antes de qualquer coisa.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · PROJEÇÃO DE EQUIPAMENTOS
-- ---------------------------------------------------------------------------
-- Origem: nr13_info_<TAG> (a chave que MANDA — define existência e versão),
-- enriquecida por nr13_cat_, nr13_emp_, nr13_vida_ e nr13_fotos_ da mesma TAG.
--
-- `source_version` vem SEMPRE do `nr13_info_`. As chaves de enriquecimento
-- entram como conteúdo, não como identidade: se só a categoria mudar, a
-- auditoria não acusa divergência do equipamento — e a 9B reprojeta a TAG
-- inteira a cada escrita de qualquer chave dela.
create table if not exists public.equipamentos_index (
  org_id            uuid        not null,
  tag               text        not null,

  -- Campos pesquisáveis, todos vindos de dado que JÁ EXISTE (nunca inventar).
  descricao         text,
  tipo              text,
  subtipo           text,
  categoria         text,       -- nr13_cat_<TAG>.catFinal
  fabricante        text,
  numero_serie      text,
  localizacao       text,
  ano               text,
  cliente           text,       -- nr13_emp_<TAG>: nomeFantasia || razaoSocial

  -- Fatos úteis para lista e Dashboard. FATOS, não regra de negócio:
  -- a consolidação com as datas do relatório é da 9F, por junção — replicar a
  -- regra de `vencimentos.ts` em PL/pgSQL duplicaria lógica que hoje é
  -- TypeScript, e o desenho (§4.1) rejeitou esse caminho de propósito.
  proxima_inspecao  date,       -- de nr13_vida_: dataAtual + proximaInspecaoAnos
  tem_foto          boolean     not null default false,

  -- Identidade fonte ↔ projeção
  source_version    integer     not null,
  source_updated_at timestamptz not null,
  projected_at      timestamptz not null default now(),

  primary key (org_id, tag)
);

comment on table public.equipamentos_index is
  'Fase 9 · projeção DERIVADA de app_storage para busca e listagem. NÃO é fonte da verdade; reconstruível por reconstruir_indice_busca().';

-- ---------------------------------------------------------------------------
-- 2 · PROJEÇÃO DE RELATÓRIOS
-- ---------------------------------------------------------------------------
-- Origem: nr13_historico_indice_<TAG> — um array de RelatorioIndiceItem.
-- Uma linha da verdade vira N linhas de projeção; por isso a remoção na 9B
-- apaga por (org_id, tag) antes de reinserir.
--
-- `pdf_ref` é REFERÊNCIA, não conteúdo: quem autoriza o download continua sendo
-- a política do bucket. Hash/path nunca é autorização (invariante I8).
create table if not exists public.relatorios_index (
  org_id                    uuid        not null,
  relatorio_id              text        not null,
  tag                       text        not null,

  codigo                    text,
  nome                      text,
  tipo                      text,
  status                    text,
  profissional              text,

  -- DATE, não string. Hoje a verdade guarda 'DD/MM/AAAA' (ou ISO), e é isso
  -- que impede busca por período indexável. A normalização acontece aqui.
  emissao                   date,
  validade                  date,
  proxima_inspecao_interna  date,
  proxima_inspecao_externa  date,

  -- Artefato do §7-quater. O PDF só é resolvido no clique (invariante I10).
  pdf_ref                   text,
  sha256                    text,
  paginas                   integer,

  source_version            integer     not null,
  source_updated_at         timestamptz not null,
  projected_at              timestamptz not null default now(),

  primary key (org_id, relatorio_id)
);

comment on table public.relatorios_index is
  'Fase 9 · projeção DERIVADA do índice leve de relatórios. Guarda pdf_ref como referência; o arquivo continua no Storage e só é resolvido no clique.';

-- Junção por equipamento é o caminho mais usado (histórico de uma TAG) e a
-- 9B apaga por (org_id, tag) antes de reinserir. Não é índice de BUSCA — é de
-- integridade operacional, por isso nasce aqui e não na 9C.
create index if not exists relatorios_index_org_tag_idx
  on public.relatorios_index (org_id, tag);

-- ---------------------------------------------------------------------------
-- 3 · PENDÊNCIAS DE RECONCILIAÇÃO
-- ---------------------------------------------------------------------------
-- BEST-EFFORT, e isso é decisão de arquitetura, não descuido (desenho §6.1).
--
-- Se a projeção falhar durante uma escrita, a 9B tenta registrar aqui para o
-- reparo ser rápido. Se ESTE registro também falhar, nada acontece com a
-- verdade — e a divergência continua detectável por `auditar_projecao`, que
-- compara `source_version` direto nas duas tabelas e NÃO lê esta aqui
-- (invariante I3).
create table if not exists public.busca_pendencias (
  org_id      uuid        not null,
  chave       text        not null,
  motivo      text,
  tentativas  integer     not null default 1,
  criado_em   timestamptz not null default now(),
  primary key (org_id, chave)
);

comment on table public.busca_pendencias is
  'Fase 9 · pendências de reconciliação da projeção. BEST-EFFORT: a garantia de convergência é auditar_projecao(), que não depende desta tabela.';

-- ---------------------------------------------------------------------------
-- 4 · ESTADO DO REBUILD
-- ---------------------------------------------------------------------------
-- Cursor por organização, para o rebuild ser RETOMÁVEL. Sem isto, uma
-- reconstrução interrompida recomeçaria do zero — inaceitável em 50.000
-- equipamentos.
create table if not exists public.busca_rebuild_estado (
  org_id        uuid        primary key,
  etapa         text        not null default 'equipamentos',  -- 'equipamentos' | 'relatorios' | 'concluido'
  ultima_chave  text        not null default '',
  processadas   bigint      not null default 0,
  iniciado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5 · RLS — espelha o que acesso_setup.sql faz para app_storage
-- ---------------------------------------------------------------------------
-- Invariante I8: org A nunca vê org B · Portal sem acesso direto · fail closed.
--
-- LEITURA: só a própria organização, e só para papel que não seja 'cliente'.
--   O cliente do Portal NÃO acessa estas tabelas — ele continua pela Edge
--   `portal_cliente`, que filtra por vínculo. Dar leitura direta a ele
--   devolveria o parque inteiro da organização, que é exatamente o achado
--   A-01 da Fase 0-B.
--
-- ESCRITA: NINGUÉM, por nenhum papel, via PostgREST. Só a RPC (`security
--   definer`) e as funções de manutenção. Sem política de insert/update/delete,
--   a RLS nega por padrão — é o fail closed.
alter table public.equipamentos_index  enable row level security;
alter table public.relatorios_index    enable row level security;
alter table public.busca_pendencias    enable row level security;
alter table public.busca_rebuild_estado enable row level security;

drop policy if exists equipamentos_index_select_org on public.equipamentos_index;
create policy equipamentos_index_select_org on public.equipamentos_index
  for select using (
    org_id = public.org_atual()
    and coalesce(public.papel_atual(), '') <> 'cliente'
  );

drop policy if exists relatorios_index_select_org on public.relatorios_index;
create policy relatorios_index_select_org on public.relatorios_index
  for select using (
    org_id = public.org_atual()
    and coalesce(public.papel_atual(), '') <> 'cliente'
  );

-- Pendências e estado do rebuild são MANUTENÇÃO. Nenhum papel do app lê.
-- Sem política nenhuma, a RLS nega tudo para quem não for superusuário.

-- Grants: leitura para os papéis do PostgREST (a RLS é quem filtra a linha);
-- escrita para ninguém.
grant select on public.equipamentos_index to anon, authenticated, service_role;
grant select on public.relatorios_index   to anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.equipamentos_index   from anon, authenticated;
revoke insert, update, delete, truncate on public.relatorios_index     from anon, authenticated;
revoke all on public.busca_pendencias     from anon, authenticated;
revoke all on public.busca_rebuild_estado from anon, authenticated;
