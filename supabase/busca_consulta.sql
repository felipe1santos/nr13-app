-- ============================================================================
-- FASE 9 · 9C — A CONSULTA DE `/equipamentos`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_index_indices.sql.
--
-- POR QUE UMA RPC, E NÃO O POSTGREST DIRETO
--
--   1. A consulta é um OR sobre TRÊS índices (prefixo de TAG, prefixo de série,
--      GIN de texto) mais o keyset. Montar isso no `or=(...)` do PostgREST
--      significa concatenar TEXTO DO USUÁRIO dentro de uma sintaxe que usa
--      vírgula e parêntese como separadores — e TAG neste sistema aceita
--      barra, hífen e espaço (`COMPRESSOR V8-15/200L`). É quebra garantida.
--   2. A ORGANIZAÇÃO NUNCA VEM DO CLIENTE: sai de `org_atual()` aqui dentro.
--      O cliente não tem como pedir outra, nem por engano nem de propósito.
--   3. É a mesma consulta que foi medida no benchmark, palavra por palavra.
--
-- SEGURANÇA: `security definer`, com organização e papel checados no corpo.
-- Nasceu `security invoker` e MUDOU depois de medir — a justificativa completa,
-- com os números, está no comentário da própria função.
--
-- Idempotente.
-- ============================================================================

-- Trocar a lista de colunas devolvidas MUDA o tipo de retorno, e o Postgres
-- recusa `create or replace` nesse caso. Sem estes drops, aplicar este arquivo
-- numa base que já tem a versão anterior falha com "cannot change return type
-- of existing function" — e o deploy pararia no meio.
-- ---------------------------------------------------------------------------
-- 0 · GUARDA: a coluna da 9F.1.2 precisa existir ANTES
-- ---------------------------------------------------------------------------
-- Esta consulta devolve `inspecoes`. Sem a coluna em `equipamentos_index`, o
-- `create` abaixo falharia no meio do deploy — com a RPC velha JÁ derrubada
-- pelos `drop`, e a tela sem catálogo nenhum até alguém perceber. Falhar ANTES
-- de derrubar é a diferença entre um deploy interrompido e uma tela morta.
--
-- Mesma ideia da guarda que a 9E pôs em `busca_relatorios.sql`, e pelo mesmo
-- motivo: a ordem de aplicação dos arquivos não pode depender de memória.
do $guarda$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'equipamentos_index'
       and column_name = 'inspecoes'
  ) then
    raise exception using
      message = 'equipamentos_index.inspecoes nao existe',
      hint    = 'Aplique supabase/busca_index.sql (9F.1.2) antes deste arquivo.';
  end if;
end $guarda$;

drop function if exists public.buscar_equipamentos(text, text, text, text, integer);
drop function if exists public.contar_equipamentos(text, text, text, integer);

-- ---------------------------------------------------------------------------
-- Normalização do termo — a MESMA regra que a coluna gerada `busca` usa.
-- ---------------------------------------------------------------------------
-- Se as duas divergirem, o usuário digita uma palavra que existe e não acha
-- nada. Por isso a tabela de acentos é idêntica à do `busca_index_indices.sql`,
-- e há teste que compara as duas.
create or replace function public.f9_normalizar(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p_texto, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- ---------------------------------------------------------------------------
-- Termo do usuário → tsquery seguro.
-- ---------------------------------------------------------------------------
-- SANITIZAÇÃO POR CONSTRUÇÃO, não por escape: só sobrevivem [a-z0-9]. Nenhum
-- operador de tsquery (`&`, `|`, `!`, `:`, parêntese) atravessa, então não há
-- como o texto do usuário virar sintaxe. Um termo que só tenha pontuação vira
-- NULL, e a consulta trata isso como "sem busca livre".
--
-- Todos os tokens recebem `:*`: quem digita "brem" está procurando "Bremer",
-- e a tela busca enquanto se digita.
create or replace function public.f9_tsquery(p_termo text)
returns tsquery
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tokens text[];
begin
  select array_agg(t) into v_tokens
    from unnest(regexp_split_to_array(public.f9_normalizar(p_termo), '[^a-z0-9]+')) t
   where t <> '';
  if v_tokens is null or cardinality(v_tokens) = 0 then
    return null;
  end if;
  return to_tsquery('simple', array_to_string(
    array(select x || ':*' from unnest(v_tokens) x), ' & '));
exception when others then
  -- Não pode derrubar a busca por causa de um termo esquisito. Sem tsquery, a
  -- consulta ainda tenta prefixo de TAG e de série.
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- A CONSULTA
-- ---------------------------------------------------------------------------
-- KEYSET, não OFFSET (invariante I5). Ordena por `tag`, que é `collate "C"` na
-- coluna — determinística byte a byte — e é ÚNICA por organização, então ela
-- mesma é o desempate. Cursor = a última `tag` da página anterior.
--
-- Medido em 50.000 linhas, o pior caso desta consulta (termo sem resultado
-- nenhum) custa 61 buffers e 0,13 ms. O mesmo termo por ILIKE sem índice
-- custava 17.007 buffers e 132 ms.
-- ---------------------------------------------------------------------------
-- DUAS DECISÕES DE IMPLEMENTAÇÃO, AS DUAS TOMADAS POR MEDIÇÃO
-- ---------------------------------------------------------------------------
--
-- 1 · PL/pgSQL COM VARIÁVEIS, NÃO UM CTE DE PARÂMETROS
--
--   A primeira versão calculava os parâmetros num CTE (`with p as (select
--   org_atual() ...)`) e cruzava `from equipamentos_index e, p`. Fica elegante e
--   é catastrófico: `p.org` não é constante para o planner, `e.org_id = p.org`
--   deixa de ser condição de índice e vira junção sobre a tabela inteira.
--
--     MEDIDO, 50.000 linhas:  204.429 buffers · 600–1.400 ms
--     com variáveis:                              (ver item 2)
--
-- 2 · `security definer`, E ISSO MUDOU DEPOIS DE MEDIR
--
--   Esta função nasceu `security invoker` de propósito, para a RLS da tabela
--   valer por cima. MEDIDO, ficou inviável — e a causa não é opinião:
--
--     `textlike` (o LIKE) e `ts_match_vq` (o `@@` do tsvector) NÃO SÃO
--     LEAKPROOF. Sob RLS o Postgres não avalia qual não-leakproof antes da
--     cláusula de segurança, então NENHUM dos dois vira condição de índice.
--     O prefixo de TAG e o GIN de texto simplesmente não são usados.
--
--     | consulta            | invoker + RLS | definer |
--     | prefixo de TAG      |   11.977      |   928   |
--     | texto livre         |      989      |   934   |
--     | termo sem resultado |    4.032      |   861   |
--
--   Tentei antes a saída que preservava a RLS: derivar do prefixo uma faixa
--   `>= / <`, que É leakproof. Não resolveu (11.764 buffers) — basta o `@@` no
--   mesmo OR para a expressão inteira herdar o não-leakproof.
--
--   O QUE SUBSTITUI A RLS AQUI, e por que é equivalente:
--
--     · a organização NUNCA vem do cliente: sai de `org_atual()`, que lê o
--       perfil pelo `auth.uid()` do token. Não há parâmetro de org para o
--       cliente informar, nem por engano nem de propósito;
--     · o papel `cliente` (Portal) é recusado explicitamente, igual à policy;
--     · sem organização ou sem papel, retorna VAZIO — fail closed;
--     · é o MESMO padrão de `aplicar_mutacao_storage`, que já é `security
--       definer` e é o caminho de escrita de tudo neste sistema.
--
--   `buscaRls.test.ts` prova org A × org B, `anon`, papel `cliente` e ausência
--   de perfil POR ESTA FUNÇÃO. Se alguém remover uma das guardas, quebra.
create or replace function public.buscar_equipamentos(
  p_termo      text default '',
  p_tipo       text default null,
  p_categoria  text default null,
  p_cursor     text default null,
  p_limite     integer default 50
)
returns table (
  tag              text,
  descricao        text,
  tipo             text,
  subtipo          text,
  categoria        text,
  fabricante       text,
  numero_serie     text,
  localizacao      text,
  ano              text,
  cliente_nome     text,
  cliente_cidade   text,
  proxima_inspecao date,
  tem_foto         boolean,
  foto_ref         jsonb,
  pmta_mpa         numeric,
  pth_mpa          numeric,
  resultado        text,
  volume_m3        numeric,
  fluido           text,
  classe_fluido    text,
  vida_anos        numeric,
  tem_cliente      boolean,
  unidade          text,
  source_version   integer,
  -- 9F.1.2 · quantos containers de inspeção a TAG tem. `null` = não contado
  -- (organização cuja projeção ainda não foi refeita) — e a tela precisa dessa
  -- diferença para omitir o badge em vez de escrever "0 Inspeções".
  inspecoes        integer
)
language plpgsql
stable
security definer
set search_path = ''
-- Sem isto o plpgsql passa a usar plano GENÉRICO depois da 5ª execução, e o
-- plano genérico precisa servir todas as combinações de filtro opcional — o que
-- o obriga a abrir mão dos índices. Medido: com plano genérico a mesma consulta
-- voltava a custar dezenas de milhares de buffers.
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_org   uuid    := public.org_atual();
  v_papel text    := coalesce(public.papel_atual(), '');
  v_termo text    := nullif(btrim(coalesce(p_termo, '')), '');
  v_tsq   tsquery := public.f9_tsquery(p_termo);
  -- Prefixo de TAG: a TAG é gravada em caixa alta (`normalizarTag`), então
  -- comparar em caixa alta é o que casa. O `\` escapa curinga vindo do usuário.
  v_tag   text    := upper(replace(replace(replace(
                       btrim(coalesce(p_termo, '')), '\', '\\'), '%', '\%'), '_', '\_')) || '%';
  -- Série: exatamente a normalização da coluna gerada `serie_norm`.
  v_serie text    := nullif(upper(regexp_replace(coalesce(p_termo, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_tipo  text    := nullif(btrim(coalesce(p_tipo, '')), '');
  v_cat   text    := nullif(btrim(coalesce(p_categoria, '')), '');
  v_lim   integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  -- FAIL CLOSED. As duas guardas que substituem a policy.
  if v_org is null or v_papel = 'cliente' then
    return;
  end if;

  return query
  select e.tag, e.descricao, e.tipo, e.subtipo, e.categoria, e.fabricante,
         e.numero_serie, e.localizacao, e.ano, e.cliente_nome, e.cliente_cidade,
         e.proxima_inspecao,
         e.tem_foto, e.foto_ref,
         e.pmta_mpa, e.pth_mpa, e.resultado, e.volume_m3, e.fluido,
         e.classe_fluido, e.vida_anos, e.tem_cliente, e.unidade, e.source_version,
         e.inspecoes
    from public.equipamentos_index e
   where e.org_id = v_org
     and (p_cursor is null or e.tag > p_cursor)
     and (v_tipo   is null or e.tipo = v_tipo)
     and (v_cat    is null or e.categoria = v_cat)
     and (
       v_termo is null
       or e.tag like v_tag
       or (v_serie is not null and e.serie_norm like v_serie || '%')
       or (v_tsq   is not null and e.busca @@ v_tsq)
     )
   order by e.tag
   limit v_lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- CONTAGEM — com teto, de propósito
-- ---------------------------------------------------------------------------
-- Contar exatamente quantos resultados existem obriga a percorrer TODOS eles.
-- Numa org de 50.000, "sem filtro nenhum" percorreria as 50.000 linhas só para
-- escrever um número no cabeçalho — exatamente o desperdício que a Fase 9
-- existe para eliminar.
--
-- Então conta até um teto e diz a verdade: `exato = false` significa "mais de
-- N". A tela escreve "mais de 1.000 resultados", que é informação honesta e
-- custa o mesmo que uma página.
--
-- O predicado é O MESMO de `buscar_equipamentos`, repetido aqui em vez de
-- reusar a função: chamá-la traria o teto de 200 por página junto, e a contagem
-- pararia em 200 mentindo. `buscaConsulta.test.ts` compara os dois conjuntos
-- para que a repetição não vire divergência.
--
-- Mesmas guardas de `buscar_equipamentos`, e pelo mesmo motivo (ver lá).
create or replace function public.contar_equipamentos(
  p_termo      text default '',
  p_tipo       text default null,
  p_categoria  text default null,
  p_teto       integer default 1000
)
returns table (total bigint, exato boolean)
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
  v_tag   text    := upper(replace(replace(replace(
                       btrim(coalesce(p_termo, '')), '\', '\\'), '%', '\%'), '_', '\_')) || '%';
  v_serie text    := nullif(upper(regexp_replace(coalesce(p_termo, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_tipo  text    := nullif(btrim(coalesce(p_tipo, '')), '');
  v_cat   text    := nullif(btrim(coalesce(p_categoria, '')), '');
  v_teto  integer := least(greatest(coalesce(p_teto, 1000), 1), 10000);
  v_n     bigint;
begin
  if v_org is null or v_papel = 'cliente' then
    return query select 0::bigint, true;
    return;
  end if;

  select count(*) into v_n from (
    select 1
      from public.equipamentos_index e
     where e.org_id = v_org
       and (v_tipo is null or e.tipo = v_tipo)
       and (v_cat  is null or e.categoria = v_cat)
       and (
         v_termo is null
         or e.tag like v_tag
         or (v_serie is not null and e.serie_norm like v_serie || '%')
         or (v_tsq   is not null and e.busca @@ v_tsq)
       )
     limit v_teto + 1
  ) x;

  return query select least(v_n, v_teto::bigint), v_n <= v_teto;
end;
$$;

grant execute on function public.f9_normalizar(text)                     to authenticated;
grant execute on function public.f9_tsquery(text)                        to authenticated;
grant execute on function public.buscar_equipamentos(text, text, text, text, integer)
  to authenticated;
grant execute on function public.contar_equipamentos(text, text, text, integer)
  to authenticated;

-- `anon` não recebe nada: sem sessão não há `org_atual()`, e a consulta
-- devolveria vazio de qualquer forma — mas negar o EXECUTE é o fail closed.
revoke execute on function public.buscar_equipamentos(text, text, text, text, integer)
  from anon, public;
revoke execute on function public.contar_equipamentos(text, text, text, integer)
  from anon, public;
