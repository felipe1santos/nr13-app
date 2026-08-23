-- ============================================================================
-- FASE 9 · 9C — COLUNAS DERIVADAS E ÍNDICES DE BUSCA DE `/equipamentos`
-- ============================================================================
--
-- Aplicar DEPOIS de: busca_index.sql → busca_manutencao.sql → busca_index_rpc.sql
--
-- REGRA QUE ESTE ARQUIVO CUMPRE (invariante I9): índice sem benchmark não entra.
-- Cada bloco traz o número medido em 50.000 linhas sintéticas, antes e depois.
-- Medições completas em `docs/medicoes/2026-08-22-fase9c-indices.md`.
--
-- NENHUMA EXTENSÃO. `pg_trgm` não entra (não há necessidade provada de
-- substring no meio de palavra) e `unaccent` também não — a normalização de
-- acento sai de `translate()`, que é IMMUTABLE e serve a coluna gerada.
--
-- APLICAR ANTES DO BACKFILL. O `alter column tag ... collate "C"` reescreve a
-- tabela e reconstrói a PK. Com a tabela vazia isso é instantâneo; depois de
-- 50.000 linhas por org é uma janela de lock que ninguém quer.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · A COLLATION DA `tag` — e ela é a decisão central desta subfase
-- ---------------------------------------------------------------------------
-- O banco é `en_US.UTF-8`. Sob essa collation um índice btree comum NÃO serve
-- `LIKE 'prefixo%'` — foi o que a Fase 8 já tinha provado, e aqui se confirmou:
-- Seq Scan de 3.663 buffers no prefixo de TAG.
--
-- O candidato do plano era `text_pattern_ops`. Criei, MEDI e DESCARTEI: ele
-- serve o LIKE mas NÃO serve o `ORDER BY tag`, que continua na collation
-- padrão. Resultado medido: o prefixo curto `VP-%` custava 7.988 buffers,
-- porque o planner abandonava o índice para conseguir a ordem.
--
-- Declarar a COLUNA como `collate "C"` resolve as três coisas de uma vez, com a
-- PK que já existia e nenhum índice novo:
--
--   | consulta (exatamente como o PostgREST a gera) | antes  | depois |
--   | tag = $1                                      |     4  |    3   |
--   | tag like 'VP-024%'  order by tag limit 50     | 3.663  |   36   |
--   | tag like 'VP-%'     order by tag limit 50     | 7.988  |   30   |  (266×)
--   | tag > $cursor       order by tag limit 50     |    16  |   32   |
--
-- E o motivo mais forte NÃO é desempenho: o PostgREST não sabe escrever
-- `collate "C"` num `order` nem num filtro de cursor. Com a collation na
-- coluna, `.order('tag')` e `.gt('tag', cursor)` já saem certos, e o cliente
-- não precisa saber que isso existe.
--
-- Efeito colateral aceito e documentado: "C" ordena byte a byte, então
-- maiúscula vem antes de minúscula e acento vem depois do ASCII. Para TAG —
-- identificador alfanumérico maiúsculo — a ordem é a natural, e ela é
-- DETERMINÍSTICA por construção, que é o que a regra de cursor estável exige.
do $$
begin
  if exists (
    select 1 from pg_attribute a
      join pg_collation c on c.oid = a.attcollation
     where a.attrelid = 'public.equipamentos_index'::regclass
       and a.attname = 'tag' and c.collname <> 'C'
  ) then
    -- A coluna gerada `busca` depende de `tag`; ela é recriada no bloco 2.
    drop index if exists public.equipamentos_index_busca_idx;
    alter table public.equipamentos_index drop column if exists busca;
    alter table public.equipamentos_index alter column tag type text collate "C";
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · COLUNAS DERIVADAS
-- ---------------------------------------------------------------------------
-- Geradas pelo BANCO, não pela projeção: são função pura das colunas já
-- projetadas. Escrevê-las em `projetar_equipamento` duplicaria a regra em dois
-- lugares e deixaria as duas divergirem no dia em que uma mudasse.

-- Nº de série normalizado — UX DECIDIDA ANTES DO ÍNDICE, como o task-level exige:
--
--   BUSCA POR PREFIXO, sobre a forma sem separador.
--
-- O usuário lê a placa e digita do começo. O separador varia entre fabricantes
-- (SN-123, SN/123, Nº 123) e entre quem cadastrou; ignorá-lo evita o "não acha
-- porque digitei com hífen e o cadastro tem barra". Substring NO MEIO fica de
-- fora de propósito: exigiria `pg_trgm`, e não há evidência de que alguém
-- procure série pelo miolo.
alter table public.equipamentos_index
  add column if not exists serie_norm text collate "C"
  generated always as (
    nullif(upper(regexp_replace(coalesce(numero_serie, ''), '[^A-Za-z0-9]', '', 'g')), '')
  ) stored;

-- Vetor de busca livre. `simple` (sem stemming) + acento removido por translate.
--
-- Por que `simple` e não `portuguese`: os termos aqui são nomes próprios de
-- fabricante, cliente e localização — o stemming os deformaria (Werner → wern)
-- sem ganho nenhum, e quem busca digita o começo da palavra, que o `:*` do
-- to_tsquery já resolve.
--
-- O nº de série entra em DUAS formas, sem separador (SN00123456) e só dígitos
-- (00123456), porque o usuário tanto digita a série inteira quanto só o número.
--
-- `cliente_cidade` fica de FORA deste vetor, de propósito (23/08/2026):
--   · a busca do caminho LEGADO não pesquisa nem cliente nem cidade (filtra só
--     TAG + descrição + tipo), então cidade pesquisável não é paridade — é
--     funcionalidade nova, e a correção de hoje é de paridade;
--   · trocar a EXPRESSÃO de uma coluna gerada obriga a derrubá-la e recriá-la,
--     o que reescreve a tabela e reconstrói o GIN (12 MB por 50.000 linhas na
--     medição da 9C). Renomear `cliente` → `cliente_nome` NÃO custa nada disso:
--     o Postgres reescreve a referência dentro da expressão sozinho.
--   · o catálogo local (`catalogoLocal.ts`) espelha ESTA lista campo a campo.
--     Incluir cidade só aqui faria a busca offline achar menos que a online.
-- Se um dia cidade pesquisável for pedida, ela entra nos DOIS lados junto, com
-- medição do rewrite — não de carona numa correção visual.
alter table public.equipamentos_index
  add column if not exists busca tsvector
  generated always as (
    to_tsvector('simple', translate(lower(
      coalesce(tag, '')          || ' ' || coalesce(descricao, '')  || ' ' ||
      coalesce(fabricante, '')   || ' ' || coalesce(cliente_nome, '') || ' ' ||
      coalesce(localizacao, '')  || ' ' || coalesce(tipo, '')       || ' ' ||
      coalesce(subtipo, '')      || ' ' || coalesce(ano, '')        || ' ' ||
      coalesce(categoria, '')    || ' ' ||
      regexp_replace(coalesce(numero_serie, ''), '[^A-Za-z0-9]', '', 'g') || ' ' ||
      regexp_replace(coalesce(numero_serie, ''), '[^0-9]', '', 'g')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'))
  ) stored;

-- ---------------------------------------------------------------------------
-- 3 · ÍNDICE DA BUSCA LIVRE  (b3)
-- ---------------------------------------------------------------------------
-- Comparado com ILIKE sem índice, na MESMA massa de 50.000:
--
--   | caso                        | ILIKE            | GIN                   |
--   | termo sem resultado         | 17.007 · 132 ms  | 1.522 ·  2 ms         |
--   | frigorifico (sem acento)    | 17.007 · ACHA 0  |   338 · acha os 6.211 |
--   | termo raro   (0,6 %)        |    444 ·   3 ms  | 2.405 ·  5 ms         |
--   | termo comum  (12 %)         |    544 ·   3 ms  |   338 ·  0,4 ms       |
--
-- O GIN entra pelo que o ILIKE ERRA, não só pelo que ele demora: sem
-- normalização de acento, quem digita "frigorifico" recebe ZERO de 6.211
-- equipamentos existentes. Em português do Brasil isso é o caso comum
-- (Metalúrgica, Válvula, Pressão), não a exceção.
--
-- É o maior índice desta tabela (12 MB / 50.000). Aceito: é a única estrutura
-- que impede um Seq Scan de 17.007 buffers a cada termo digitado.
create index if not exists equipamentos_index_busca_idx
  on public.equipamentos_index using gin (busca);

-- ---------------------------------------------------------------------------
-- 4 · ÍNDICE DO Nº DE SÉRIE
-- ---------------------------------------------------------------------------
--   série completa (o caso real: achar UM equipamento) · 11.334 → 6 buffers
--   prefixo curto, 555 casando                         ·  1.113 buffers
create index if not exists equipamentos_index_serie_idx
  on public.equipamentos_index (org_id, serie_norm);

-- ---------------------------------------------------------------------------
-- 5 · ÍNDICE DOS FILTROS  (b4)
-- ---------------------------------------------------------------------------
-- ENTROU PELO CASO RARO, e só por ele:
--
--   tipo + categoria casando 6 % da base ·   488 →    98 buffers  (5×)
--   tipo + categoria casando 8 de 50.000 · 9.222 →    12 buffers  (768×)
--
-- O caso comum sozinho NÃO justificaria 3 MB — 0,2 ms de ganho. Quem justifica
-- é o filtro que casa MENOS de uma página: aí o `limit 50` sobre o índice de
-- tag nunca completa e o planner varre a tabela inteira. É exatamente o cenário
-- que a Fase 9 existe para consertar numa org grande.
create index if not exists equipamentos_index_filtro_idx
  on public.equipamentos_index (org_id, tipo, categoria, tag);

-- ---------------------------------------------------------------------------
-- 6 · O QUE NÃO ENTROU, e por quê
-- ---------------------------------------------------------------------------
--   (org_id, tag text_pattern_ops) — criado, MEDIDO e descartado: não serve a
--       ordenação, e a collation na coluna faz o mesmo com a PK que já existe.
--   (org_id, tag collate "C") — idem: virou redundante quando a coluna passou a
--       ser "C", porque a PK herdou a collation.
--   pg_trgm  — só com necessidade provada de substring no meio de palavra.
--   unaccent — desnecessário: `translate()` resolve e é IMMUTABLE.
--   (org_id, cliente_nome) — o GIN já cobre o nome do cliente na busca livre.
drop index if exists public.equipamentos_index_tag_prefixo_idx;
drop index if exists public.equipamentos_index_tag_c_idx;

analyze public.equipamentos_index;

-- ---------------------------------------------------------------------------
-- 7 · CUSTO DE ESCRITA — medido, e reportado por inteiro
-- ---------------------------------------------------------------------------
-- Uma mutação de `nr13_info_` em `aplicar_mutacao_storage`, mediana de 5:
--
--   sem projeção nenhuma (antes da 9B) ......... 1.129 buffers
--   com a projeção da 9B ....................... 1.434 buffers   (+27 %)
--   + serie_norm + índice de série ............. 1.503 buffers
--   + índice de filtros ........................ 1.480 buffers
--   + busca(tsvector) + GIN .................... 1.536 buffers
--   ────────────────────────────────────────────────────────────
--   TOTAL vs. antes da projeção ................ +36,0 %
--
-- O GIN responde por ~54 dos ~102 buffers que a 9C acrescentou. É o item mais
-- caro na escrita E o único que corrige um ERRO de busca (acento), não só uma
-- lentidão.
