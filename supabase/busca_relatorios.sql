-- ============================================================================
-- FASE 9 · 9E — A CONSULTA DE `/relatorios`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_consulta.sql (usa `f9_normalizar`, `f9_tsquery`,
-- `org_atual`, `papel_atual`).
--
-- A tela que este arquivo serve tem HOJE **zero** campo de texto: quem procura
-- um relatório de dois anos atrás rola a lista. E o registro de cada relatório
-- pesa ~110 KB (§7-sexies) porque carrega os snapshots congelados — logo,
-- "filtrar no cliente" significaria baixar dezenas de MB para escrever uma
-- linha na tela.
--
-- > **O PDF NÃO É TOCADO AQUI.** Estas funções devolvem `pdf_ref` — uma
-- > REFERÊNCIA de texto. O arquivo continua no Storage e só é resolvido no
-- > clique (invariante I10). É por isso que buscar em 10.000 relatórios custa o
-- > mesmo que buscar em 10.
--
-- Segurança: `security definer` com organização e papel checados no corpo, pelo
-- mesmo motivo medido em `busca_consulta.sql` — sob RLS o LIKE e o `@@` não são
-- leakproof e os índices deixam de ser usados. A organização NUNCA vem do
-- cliente: sai de `org_atual()`.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0 · GUARDA: a projeção precisa estar CORRIGIDA antes
-- ---------------------------------------------------------------------------
-- `projetar_relatorios` lia `pdfRef ->> 'caminho'`, e o campo real da `RefFoto`
-- é `path` — devolvia NULL em silêncio para todo relatório finalizado. Servir a
-- busca por cima de uma projeção assim entregaria uma lista bonita e sem
-- nenhuma referência de PDF.
--
-- Esta é a mesma armadilha registrada no ponto de retomada: `auditar_projecao`
-- CONVERGE com a função velha no banco, porque compara a projeção com o que a
-- função ATUAL produz. Conferir o `prosrc` é o único jeito de saber.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'projetar_relatorios'
       and p.prosrc like '%''pdfRef'') ->> ''path''%'
  ) then
    raise exception using
      message = 'projetar_relatorios ainda le pdfRef->>''caminho''',
      hint    = 'Reaplique supabase/busca_manutencao.sql e reprojete antes deste arquivo.';
  end if;
end $$;

-- Mudar a lista de colunas devolvidas muda o tipo de retorno, e o Postgres
-- recusa `create or replace` nesse caso. Ver a mesma nota em busca_consulta.sql.
-- As assinaturas de 25/08 (sem `p_escopo`) também saem, senão o banco ficaria
-- com as duas sobrecargas e a chamada por parâmetro nomeado viraria ambígua.
drop function if exists public.buscar_relatorios(text, text, date, date, date, text, integer);
drop function if exists public.contar_relatorios(text, text, date, date, integer);
drop function if exists public.buscar_relatorios(text, text, date, date, text, date, text, integer);
drop function if exists public.contar_relatorios(text, text, date, date, text, integer);

-- ---------------------------------------------------------------------------
-- 1 · COLLATION "C" NO DESEMPATE DO KEYSET
-- ---------------------------------------------------------------------------
-- `relatorio_id` é a segunda chave da ordenação. Se o banco ordenar por
-- collation linguística e o cliente comparar em JavaScript (`fundirLocais`), as
-- duas ordens divergem e a paginação passa a PULAR itens na emenda entre
-- páginas — o item existe, e some da tela. É o mesmo cuidado que a 9C tomou com
-- `tag`, pela mesma razão.
do $$
begin
  if exists (
    select 1 from pg_attribute a
      join pg_collation c on c.oid = a.attcollation
     where a.attrelid = 'public.relatorios_index'::regclass
       and a.attname = 'relatorio_id' and c.collname <> 'C'
  ) then
    drop index if exists public.relatorios_index_busca_idx;
    alter table public.relatorios_index drop column if exists busca;
    alter table public.relatorios_index alter column relatorio_id type text collate "C";
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · COLUNAS DERIVADAS — geradas pelo BANCO
-- ---------------------------------------------------------------------------
-- Função pura das colunas já projetadas. Escrevê-las em `projetar_relatorios`
-- duplicaria a regra em dois lugares, e um dia as duas divergiriam.

-- A data que ORDENA a lista. Existe para o keyset não precisar lidar com NULL.
--
-- Relatório sem `emissao` é real: registro antigo, importado, ou salvo antes de
-- a data ser preenchida. Ele NÃO pode sumir da lista — sumir é o defeito que
-- este projeto inteiro combate. Com `nulls last` na ordenação, o keyset composto
-- precisaria de um caso especial para a fronteira entre "tem data" e "não tem";
-- com a data mínima, ele vira uma comparação de tupla e o item aparece no fim,
-- que é onde o usuário espera encontrá-lo.
alter table public.relatorios_index
  add column if not exists ordem_emissao date
  generated always as (coalesce(emissao, date '0001-01-01')) stored;

-- Vetor de busca livre: código, nome, TAG e profissional.
--
-- `simple` (sem stemming) pelo mesmo motivo da 9C: os termos aqui são códigos
-- (`REL-1786493933522`), nomes de arquivo e nomes próprios de profissional — o
-- stemming os deformaria sem ganho nenhum, e quem busca digita o começo, que o
-- `:*` do `to_tsquery` já resolve.
--
-- O CÓDIGO entra em DUAS formas, e isso é UX decidida antes do índice: inteiro
-- (`rel1786493933522`, como `f9_normalizar` o devolve) e só os dígitos
-- (`1786493933522`). O usuário tanto cola o código inteiro quanto digita apenas
-- o número que enxerga no papel.
alter table public.relatorios_index
  add column if not exists busca tsvector
  generated always as (
    to_tsvector('simple',
      public.f9_normalizar(
        coalesce(codigo, '') || ' ' ||
        coalesce(regexp_replace(coalesce(codigo, ''), '[^0-9]', '', 'g'), '') || ' ' ||
        coalesce(nome, '') || ' ' ||
        coalesce(tag, '') || ' ' ||
        coalesce(profissional, '')
      )
    )
  ) stored;

-- ---------------------------------------------------------------------------
-- 3 · ÍNDICES — 9E-b1 a 9E-b3
-- ---------------------------------------------------------------------------
-- `9E-b4` (tipo, status, profissional como filtro próprio) fica de FORA por
-- ora: o task-level exige benchmark antes, e `tipo` já entra como predicado
-- barato sobre um conjunto pequeno depois do keyset.

-- 9E-b3 · PERÍODO **e** a ordenação da lista, no mesmo índice.
--
-- É o índice que mais importa: sem filtro nenhum, a primeira página sai daqui
-- por leitura ordenada, sem sort. `relatorio_id` entra como segunda coluna
-- porque é o desempate do keyset (I5) — sem ele, dois relatórios emitidos no
-- mesmo dia embaralhariam entre páginas.
create index if not exists relatorios_index_ordem_idx
  on public.relatorios_index (org_id, ordem_emissao desc, relatorio_id desc);

-- 9E-b1 · CÓDIGO por prefixo. `text_pattern_ops` porque a comparação é LIKE
-- 'ABC%' e não igualdade; sem esse operator class o índice não serve ao LIKE.
create index if not exists relatorios_index_codigo_idx
  on public.relatorios_index (org_id, upper(codigo) text_pattern_ops)
  where codigo is not null;

-- 9E-b2 · TAG por prefixo.
--
-- ESTE ÍNDICE NASCEU DE UMA MEDIÇÃO QUE REPROVOU A DECISÃO ANTERIOR. A primeira
-- versão deste arquivo dizia: "reusa `relatorios_index_org_tag_idx`, que a 9B já
-- criou — índice a mais é escrita mais cara". O benchmark em 50.000 linhas
-- mostrou que o reuso NÃO acontece:
--
--     Index Scan using relatorios_index_ordem_idx
--       Filter: upper(tag) ~~ 'VP-0250%'
--       Rows Removed by Filter: 24498        ← 24.770 buffers
--
-- Duas razões, e as duas precisavam de conserto:
--   1. o predicado usava `upper(tag)`, e o índice da 9B é sobre `tag` cru;
--   2. mesmo sem o `upper`, um btree de collation linguística não serve a
--      LIKE 'ABC%' — é preciso `text_pattern_ops`.
--
-- A TAG é gravada em caixa alta (`normalizarTag`), então comparar em caixa alta
-- é o que casa — a mesma decisão, pelo mesmo motivo, de `buscar_equipamentos`.
create index if not exists relatorios_index_tag_prefixo_idx
  on public.relatorios_index (org_id, tag text_pattern_ops);

-- Texto livre.
create index if not exists relatorios_index_busca_idx
  on public.relatorios_index using gin (busca);

-- ---------------------------------------------------------------------------
-- 4 · A CONSULTA
-- ---------------------------------------------------------------------------
create or replace function public.buscar_relatorios(
  p_termo         text default '',
  p_tipo          text default null,
  p_de            date default null,
  p_ate           date default null,
  -- 'ativos' (padrão) | 'historicos' | 'todos' — ver a seção 4-bis.
  p_escopo        text default 'ativos',
  p_cursor_data   date default null,
  p_cursor_id     text default null,
  p_limite        integer default 50
)
returns table (
  relatorio_id             text,
  tag                      text,
  codigo                   text,
  nome                     text,
  tipo                     text,
  status                   text,
  profissional             text,
  emissao                  date,
  validade                 date,
  execucao_inspecao        date,
  proxima_inspecao_interna date,
  proxima_inspecao_externa date,
  pdf_ref                  text,
  sha256                   text,
  paginas                  integer,
  source_version           integer,
  equipamento_ativo        boolean
)
language plpgsql
stable
security definer
set search_path = ''
-- Sem isto o plpgsql passa a plano GENÉRICO depois da 5ª execução, e o genérico
-- precisa servir todas as combinações de filtro opcional — o que o obriga a
-- abrir mão dos índices. Mesma medição da 9C.
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_org    uuid    := public.org_atual();
  v_papel  text    := coalesce(public.papel_atual(), '');
  v_termo  text    := nullif(btrim(coalesce(p_termo, '')), '');
  v_tsq    tsquery := public.f9_tsquery(p_termo);
  -- Prefixo de código: `\` escapa curinga vindo do usuário, senão quem digitar
  -- `%` lista tudo.
  v_cod    text    := upper(replace(replace(replace(
                        btrim(coalesce(p_termo, '')), '\', '\\'), '%', '\%'), '_', '\_')) || '%';
  v_tipo   text    := nullif(btrim(coalesce(p_tipo, '')), '');
  v_lim    integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_escopo text    := case when lower(coalesce(p_escopo, '')) in ('historicos', 'todos')
                           then lower(p_escopo) else 'ativos' end;
  -- Este aparelho... quer dizer, esta ORGANIZAÇÃO tem catálogo projetado?
  v_cat    boolean;
begin
  -- FAIL CLOSED: as duas guardas que substituem a policy.
  if v_org is null or v_papel = 'cliente' then
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 4-bis · ESCOPO: relatório de equipamento EXCLUÍDO não some, e não mente
  -- -------------------------------------------------------------------------
  -- Medido em produção em 25/08/2026, na organização de teste: 15 relatórios na
  -- projeção, 3 alcançáveis pela tela antiga. Os 12 restantes são de TAGs sem
  -- `nr13_info_` — o equipamento saiu do cadastro e o histórico ficou. Os
  -- registros estão vivos, um `nr13_rel_<id>_<TAG>` para cada, com o PDF
  -- arquivado intacto.
  --
  -- A tela antiga nunca os mostrou porque é TAG-first: escolhe-se o equipamento
  -- e o histórico dele aparece. Sem ficha, não há por onde chegar. A V9 lê a
  -- projeção direto, e enxerga o que sempre esteve lá.
  --
  -- Aqui NADA é apagado nem escondido: o escopo só decide o RECORTE, a coluna
  -- `equipamento_ativo` viaja em toda linha para a tela poder marcar, e
  -- `contar_relatorios` devolve quantos ficaram de fora.
  --
  -- > **A GUARDA QUE IMPEDE O VAZIO FALSO.** "Ativo" é decidido por
  -- > `equipamentos_index`, que é PROJEÇÃO. Numa organização cujo rebuild ainda
  -- > não rodou ela está VAZIA — e sem esta guarda todo relatório viraria órfão,
  -- > o escopo padrão devolveria lista vazia, e a tela afirmaria "não há
  -- > relatórios" para quem tem o parque inteiro. É exatamente a mentira que a
  -- > prova offline da 9D pegou no Dashboard. Sem catálogo projetado a resposta
  -- > honesta é "não sei": ninguém é marcado como excluído e o escopo não corta.
  v_cat := exists (select 1 from public.equipamentos_index e where e.org_id = v_org);

  -- ---------------------------------------------------------------------
  -- DOIS CAMINHOS, E A SEPARAÇÃO VEIO DE UMA MEDIÇÃO
  -- ---------------------------------------------------------------------
  -- Numa consulta só, com `OR` de três predicados de texto MAIS `order by …
  -- limit 51`, o planner escolhe percorrer o índice de ORDENAÇÃO e aplicar o
  -- texto como `Filter` — apostando que acha 51 linhas cedo. Quando o termo é
  -- seletivo (ou não casa nada), essa aposta perde feio: medido em 50.000
  -- linhas, "termo inexistente" custou **50.423 buffers**, a tabela inteira.
  --
  -- Separar resolve porque as duas situações querem planos opostos:
  --
  --   · SEM termo   → a ordem É o filtro. Percorrer `relatorios_index_ordem_idx`
  --                   e parar no limite é o plano ideal (303 buffers em 50.000).
  --   · COM termo   → primeiro RESTRINGIR pelos índices de texto, depois
  --                   ordenar o punhado que sobrou. A CTE `materialized` é o que
  --                   impede o planner de empurrar o filtro para dentro da
  --                   varredura ordenada e recair no caso ruim.
  if v_termo is null then
    return query
    select r.relatorio_id, r.tag, r.codigo, r.nome, r.tipo, r.status, r.profissional,
           r.emissao, r.validade, r.execucao_inspecao,
           r.proxima_inspecao_interna, r.proxima_inspecao_externa,
           r.pdf_ref, r.sha256, r.paginas, r.source_version,
           (not v_cat or exists (select 1 from public.equipamentos_index e
                                  where e.org_id = r.org_id and e.tag = r.tag))
      from public.relatorios_index r
     where r.org_id = v_org
       and (v_escopo = 'todos' or not v_cat
            or (v_escopo = 'ativos') = exists (select 1 from public.equipamentos_index e
                                                where e.org_id = r.org_id and e.tag = r.tag))
       -- Keyset: as DUAS colunas descem juntas, então a comparação de tupla
       -- vale como está. Ordenar `emissao desc, relatorio_id asc` obrigaria a
       -- quebrar isto em dois OR e a perder o índice.
       and (p_cursor_data is null
            or (r.ordem_emissao, r.relatorio_id) < (p_cursor_data, coalesce(p_cursor_id, '')))
       and (v_tipo is null or r.tipo = v_tipo)
       -- Período: o range vai sobre `ordem_emissao` para virar Index Cond no
       -- mesmo índice da ordenação, e `emissao is not null` garante que o
       -- relatório SEM data não seja arrastado para dentro de um intervalo que
       -- o usuário escolheu — a sentinela ordena, não é um fato.
       and (p_de  is null or (r.emissao is not null and r.ordem_emissao >= p_de))
       and (p_ate is null or (r.emissao is not null and r.ordem_emissao <= p_ate))
     order by r.ordem_emissao desc, r.relatorio_id desc
     limit v_lim;
    return;
  end if;

  return query
  with candidatos as materialized (
    select r.*
      from public.relatorios_index r
     where r.org_id = v_org
       and (
         r.tag like v_cod                        -- prefixo de TAG (caixa alta)
         or upper(r.codigo) like v_cod           -- prefixo de código
         or (v_tsq is not null and r.busca @@ v_tsq)   -- texto livre (GIN)
       )
       and (v_tipo is null or r.tipo = v_tipo)
       and (p_de  is null or (r.emissao is not null and r.ordem_emissao >= p_de))
       and (p_ate is null or (r.emissao is not null and r.ordem_emissao <= p_ate))
       and (p_cursor_data is null
            or (r.ordem_emissao, r.relatorio_id) < (p_cursor_data, coalesce(p_cursor_id, '')))
       -- O escopo entra DENTRO da CTE: filtrar depois obrigaria a materializar
       -- candidatos que já se sabe que não vão para a tela.
       and (v_escopo = 'todos' or not v_cat
            or (v_escopo = 'ativos') = exists (select 1 from public.equipamentos_index e
                                                where e.org_id = r.org_id and e.tag = r.tag))
  )
  select c.relatorio_id, c.tag, c.codigo, c.nome, c.tipo, c.status, c.profissional,
         c.emissao, c.validade, c.execucao_inspecao,
         c.proxima_inspecao_interna, c.proxima_inspecao_externa,
         c.pdf_ref, c.sha256, c.paginas, c.source_version,
         (not v_cat or exists (select 1 from public.equipamentos_index e
                                where e.org_id = c.org_id and e.tag = c.tag))
    from candidatos c
   order by c.ordem_emissao desc, c.relatorio_id desc
   limit v_lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · CONTAGEM — com teto, de propósito
-- ---------------------------------------------------------------------------
-- Contar exatamente obriga a percorrer TODOS os resultados. Numa organização com
-- 10.000 relatórios, "sem filtro" percorreria as 10.000 linhas só para escrever
-- um número no cabeçalho. Conta até um teto e diz a verdade: `exato = false`
-- significa "mais de N".
--
-- O predicado é O MESMO da busca, repetido aqui em vez de fatorado numa view —
-- pelo mesmo motivo da 9C: a view impediria o `force_custom_plan` de valer para
-- cada combinação de filtro.
create or replace function public.contar_relatorios(
  p_termo  text default '',
  p_tipo   text default null,
  p_de     date default null,
  p_ate    date default null,
  p_escopo text default 'ativos',
  p_teto   integer default 1000
)
-- `historicos` vem NA MESMA LINHA da contagem principal, e não numa segunda
-- chamada, porque o cabeçalho precisa dos dois números ao mesmo tempo para
-- escrever "3 relatórios · 12 de equipamentos excluídos". Em chamadas separadas
-- os dois números apareceriam incoerentes entre si por um instante.
returns table (total integer, exato boolean, historicos integer)
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_org   uuid    := public.org_atual();
  v_papel text    := coalesce(public.papel_atual(), '');
  v_termo text    := nullif(btrim(coalesce(p_termo, '')), '');
  v_tsq   tsquery := public.f9_tsquery(p_termo);
  v_cod   text    := upper(replace(replace(replace(
                       btrim(coalesce(p_termo, '')), '\', '\\'), '%', '\%'), '_', '\_')) || '%';
  v_tipo  text    := nullif(btrim(coalesce(p_tipo, '')), '');
  v_teto  integer := least(greatest(coalesce(p_teto, 1000), 1), 10000);
  v_escopo text   := case when lower(coalesce(p_escopo, '')) in ('historicos', 'todos')
                          then lower(p_escopo) else 'ativos' end;
  v_cat   boolean;
  v_n     integer;
  v_h     integer;
begin
  if v_org is null or v_papel = 'cliente' then
    return query select 0, true, 0;
    return;
  end if;

  -- Mesma guarda da busca: sem catálogo projetado ninguém é órfão. Ver 4-bis.
  v_cat := exists (select 1 from public.equipamentos_index e where e.org_id = v_org);

  -- O mesmo predicado da busca, com o mesmo cuidado: `tag` sem `upper` (ela é
  -- gravada em caixa alta) para o índice de prefixo valer, e o período sobre
  -- `ordem_emissao` com `emissao is not null` — o relatório sem data não entra
  -- num intervalo escolhido.
  select count(*) into v_n from (
    select 1
      from public.relatorios_index r
     where r.org_id = v_org
       and (v_tipo is null or r.tipo = v_tipo)
       and (p_de  is null or (r.emissao is not null and r.ordem_emissao >= p_de))
       and (p_ate is null or (r.emissao is not null and r.ordem_emissao <= p_ate))
       and (
         v_termo is null
         or r.tag like v_cod
         or upper(r.codigo) like v_cod
         or (v_tsq is not null and r.busca @@ v_tsq)
       )
       and (v_escopo = 'todos' or not v_cat
            or (v_escopo = 'ativos') = exists (select 1 from public.equipamentos_index e
                                                where e.org_id = r.org_id and e.tag = r.tag))
     limit v_teto + 1
  ) amostra;

  -- Quantos ficaram DE FORA por serem de equipamento excluído — com os mesmos
  -- filtros de texto, tipo e período, senão o aviso do cabeçalho falaria de um
  -- conjunto diferente do que a lista está mostrando.
  --
  -- TETO PRÓPRIO, E BEM MENOR — MEDIDO. O órfão é RARO por definição, e contar
  -- coisa rara até 1.000 obriga a percorrer a tabela quase inteira: com 5 %% de
  -- órfãos em 50.000 relatórios, o teto de 1.000 nunca era atingido e a
  -- contagem varria as 50.000 linhas — **5.144 buffers contra os 214 constantes
  -- que a 9E.2 tinha medido**, e crescendo com o acervo. O aviso do cabeçalho
  -- não precisa de 1.000: ele diz "12 relatórios de equipamento excluído", e
  -- acima de 200 dizer "mais de 200" informa exatamente o mesmo.
  --
  -- DEVOLVE 201 QUANDO PASSA DE 200, e não 200: é o sinal que permite à tela
  -- escrever "mais de 200". Cortar em 200 faria o aviso afirmar um número exato
  -- que ninguém contou — 200 anunciados onde há 4.000. O front espelha o teto em
  -- `TETO_HISTORICOS` (`src/services/buscaRelatorios.ts`).
  if v_cat then
    select count(*) into v_h from (
      select 1
        from public.relatorios_index r
       where r.org_id = v_org
         and (v_tipo is null or r.tipo = v_tipo)
         and (p_de  is null or (r.emissao is not null and r.ordem_emissao >= p_de))
         and (p_ate is null or (r.emissao is not null and r.ordem_emissao <= p_ate))
         and (
           v_termo is null
           or r.tag like v_cod
           or upper(r.codigo) like v_cod
           or (v_tsq is not null and r.busca @@ v_tsq)
         )
         and not exists (select 1 from public.equipamentos_index e
                          where e.org_id = r.org_id and e.tag = r.tag)
       limit least(v_teto, 200) + 1
    ) orfaos;
  else
    v_h := 0;
  end if;

  return query select least(v_n, v_teto), (v_n <= v_teto), least(v_h, least(v_teto, 200) + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · PERMISSÕES
-- ---------------------------------------------------------------------------
-- REVOGAR DE `public` VEM PRIMEIRO: toda função nova nasce com EXECUTE
-- concedido a `public`, e `anon` HERDA de `public`. Revogar só de `anon` deixa
-- `has_function_privilege('anon', …) = true` — medido em 25/08/2026.
revoke all on function public.buscar_relatorios(text, text, date, date, text, date, text, integer) from public, anon;
revoke all on function public.contar_relatorios(text, text, date, date, text, integer)             from public, anon;
grant execute on function public.buscar_relatorios(text, text, date, date, text, date, text, integer) to authenticated;
grant execute on function public.contar_relatorios(text, text, date, date, text, integer)             to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Nada aqui guarda verdade: as colunas são geradas e os índices são derivados.
--
--   drop function if exists public.buscar_relatorios(text, text, date, date, text, date, text, integer);
--   drop function if exists public.contar_relatorios(text, text, date, date, text, integer);
--   drop index    if exists public.relatorios_index_busca_idx;
--   drop index    if exists public.relatorios_index_codigo_idx;
--   drop index    if exists public.relatorios_index_ordem_idx;
--   alter table public.relatorios_index drop column if exists busca;
--   alter table public.relatorios_index drop column if exists ordem_emissao;
