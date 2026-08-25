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

-- Mudar a lista de colunas devolvidas muda o tipo de retorno, e o Postgres
-- recusa `create or replace` nesse caso. Ver a mesma nota em busca_consulta.sql.
drop function if exists public.buscar_relatorios(text, text, date, date, date, text, integer);
drop function if exists public.contar_relatorios(text, text, date, date, integer);

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

-- 9E-b2 · TAG. Já existe `relatorios_index_org_tag_idx` (criado na 9B para a
-- integridade do apaga-e-reinsere); ele serve igualmente à busca por
-- equipamento, então NÃO se cria um segundo aqui. Índice a mais é escrita mais
-- cara em toda emissão de relatório.

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
  source_version           integer
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
begin
  -- FAIL CLOSED: as duas guardas que substituem a policy.
  if v_org is null or v_papel = 'cliente' then
    return;
  end if;

  return query
  select r.relatorio_id, r.tag, r.codigo, r.nome, r.tipo, r.status, r.profissional,
         r.emissao, r.validade, r.execucao_inspecao,
         r.proxima_inspecao_interna, r.proxima_inspecao_externa,
         r.pdf_ref, r.sha256, r.paginas, r.source_version
    from public.relatorios_index r
   where r.org_id = v_org
     -- Keyset: as DUAS colunas descem juntas, então a comparação de tupla vale
     -- como está. Ordenar `emissao desc, relatorio_id asc` obrigaria a quebrar
     -- isto em dois OR e a perder o índice.
     and (p_cursor_data is null
          or (r.ordem_emissao, r.relatorio_id) < (p_cursor_data, coalesce(p_cursor_id, '')))
     and (v_tipo is null or r.tipo = v_tipo)
     -- Período sobre `emissao` (a coluna real), não sobre `ordem_emissao`:
     -- filtrar por data NÃO pode arrastar o relatório sem data para dentro de
     -- um intervalo que o usuário escolheu.
     and (p_de   is null or r.emissao >= p_de)
     and (p_ate  is null or r.emissao <= p_ate)
     and (
       v_termo is null
       or upper(r.codigo) like v_cod
       or upper(r.tag)    like v_cod
       or (v_tsq is not null and r.busca @@ v_tsq)
     )
   order by r.ordem_emissao desc, r.relatorio_id desc
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
  p_teto   integer default 1000
)
returns table (total integer, exato boolean)
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
  v_n     integer;
begin
  if v_org is null or v_papel = 'cliente' then
    return query select 0, true;
    return;
  end if;

  select count(*) into v_n from (
    select 1
      from public.relatorios_index r
     where r.org_id = v_org
       and (v_tipo is null or r.tipo = v_tipo)
       and (p_de   is null or r.emissao >= p_de)
       and (p_ate  is null or r.emissao <= p_ate)
       and (
         v_termo is null
         or upper(r.codigo) like v_cod
         or upper(r.tag)    like v_cod
         or (v_tsq is not null and r.busca @@ v_tsq)
       )
     limit v_teto + 1
  ) amostra;

  return query select least(v_n, v_teto), (v_n <= v_teto);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · PERMISSÕES
-- ---------------------------------------------------------------------------
-- REVOGAR DE `public` VEM PRIMEIRO: toda função nova nasce com EXECUTE
-- concedido a `public`, e `anon` HERDA de `public`. Revogar só de `anon` deixa
-- `has_function_privilege('anon', …) = true` — medido em 25/08/2026.
revoke all on function public.buscar_relatorios(text, text, date, date, date, text, integer) from public, anon;
revoke all on function public.contar_relatorios(text, text, date, date, integer)             from public, anon;
grant execute on function public.buscar_relatorios(text, text, date, date, date, text, integer) to authenticated;
grant execute on function public.contar_relatorios(text, text, date, date, integer)             to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Nada aqui guarda verdade: as colunas são geradas e os índices são derivados.
--
--   drop function if exists public.buscar_relatorios(text, text, date, date, date, text, integer);
--   drop function if exists public.contar_relatorios(text, text, date, date, integer);
--   drop index    if exists public.relatorios_index_busca_idx;
--   drop index    if exists public.relatorios_index_codigo_idx;
--   drop index    if exists public.relatorios_index_ordem_idx;
--   alter table public.relatorios_index drop column if exists busca;
--   alter table public.relatorios_index drop column if exists ordem_emissao;
