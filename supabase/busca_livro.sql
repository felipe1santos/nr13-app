-- ============================================================================
-- FASE 9 · 9F.4.3 — A CONSULTA DE `/livro-registro`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_consulta.sql (que traz `f9_normalizar` e `f9_tsquery`)
-- e de busca_index.sql (as colunas `livro_entradas` / `livro_ultima`).
--
-- POR QUE UMA RPC PRÓPRIA, E NÃO UM PARÂMETRO EM `buscar_equipamentos`
--
--   A tela do Livro lista SÓ quem tem livro. Filtrar isso no cliente, sobre uma
--   página de 50 equipamentos, seria devolver 50 linhas para desenhar 2: com o
--   parque medido em produção (39 equipamentos, 1 livro) já rola mal, e num
--   parque de 50.000 o usuário rolaria mil páginas para ver onze linhas. O
--   filtro precisa acontecer ONDE estão os dados.
--
--   E não vira parâmetro novo em `buscar_equipamentos` porque aquela função é
--   servida a QUATRO telas já em produção (`/equipamentos`, `/inspecoes`,
--   `/prontuarios`, `/calibracoes`). Mudar a assinatura dela obrigaria a
--   derrubar e recriar a versão que essas telas usam — risco desproporcional
--   para uma tela que ainda nem foi rolada. Função nova tem rollback próprio:
--   `drop function`, e nada mais no sistema sente.
--
-- O `null` DE `livro_entradas` ENTRA NA LISTA, e é a decisão mais importante
-- deste arquivo. Numa organização cuja projeção ainda não foi refeita TODAS as
-- linhas vêm `null`; um `where livro_entradas > 0` esvaziaria a tela inteira e
-- ela escreveria "Nenhum livro de registro gerado ainda" — sobre o documento que
-- a fiscalização pede. Mostrar a mais é recuperável; esconder um livro que
-- existe, não.
--
-- SEGURANÇA: `security definer`, com organização e papel checados no corpo —
-- mesmo padrão e mesmas guardas de `buscar_equipamentos` (ver a justificativa
-- medida no comentário daquela função).
--
-- Idempotente.
-- ============================================================================

do $guarda$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'equipamentos_index'
       and column_name = 'livro_entradas'
  ) then
    raise exception using
      message = 'equipamentos_index.livro_entradas nao existe',
      hint    = 'Aplique supabase/busca_index.sql (9F.4.1) antes deste arquivo.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- O ÍNDICE PARCIAL — e ele nasceu de uma MEDIÇÃO, não de precaução
-- ---------------------------------------------------------------------------
-- A primeira versão desta consulta rodava sobre `equipamentos_index_pkey`
-- (org_id, tag). O predicado "tem livro" não é indexável ali, então o Index Scan
-- percorria a organização INTEIRA em ordem de TAG descartando linha por linha
-- até juntar 51 que passassem.
--
-- MEDIDO no laboratório em 02/09/2026, com 1.002 equipamentos e 21 na lista:
-- **125.623 buffers e 79,7 ms** para devolver 21 linhas. O custo é proporcional
-- ao PARQUE, não ao resultado — exatamente o que esta etapa existe para acabar:
-- seria trocar `lerTudo()` no cliente por uma varredura no servidor.
--
-- Com o índice parcial, o Postgres percorre só as linhas que interessam, já na
-- ordem do keyset. O predicado é IDÊNTICO ao da consulta, palavra por palavra —
-- se um dia divergirem, o planner deixa de casar e o custo volta em silêncio.
create index if not exists equipamentos_index_livro_idx
  on public.equipamentos_index (org_id, tag)
  where livro_entradas is null or livro_entradas > 0;

drop function if exists public.buscar_livros(text, text, integer);
drop function if exists public.contar_livros(text);

create or replace function public.buscar_livros(
  p_termo   text default '',
  p_cursor  text default null,
  p_limite  integer default 50
)
returns table (
  tag            text,
  descricao      text,
  tipo           text,
  categoria      text,
  livro_entradas integer,
  livro_ultima   date
)
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
  v_lim   integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  -- FAIL CLOSED, iguais às de `buscar_equipamentos`.
  if v_org is null or v_papel = 'cliente' then
    return;
  end if;

  return query
  select e.tag, e.descricao, e.tipo, e.categoria, e.livro_entradas, e.livro_ultima
    from public.equipamentos_index e
   where e.org_id = v_org
     -- O CORAÇÃO DESTA FUNÇÃO: tem livro, OU ninguém contou ainda.
     and (e.livro_entradas is null or e.livro_entradas > 0)
     and (p_cursor is null or e.tag > p_cursor)
     and (
       v_termo is null
       or e.tag like v_tag
       or (v_tsq is not null and e.busca @@ v_tsq)
     )
   order by e.tag
   limit v_lim;
end;
$$;

-- Contagem com teto, pelo mesmo motivo de `contar_equipamentos`: contar exato
-- obriga a percorrer tudo, e o número do cabeçalho não vale uma varredura.
create or replace function public.contar_livros(p_termo text default '')
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
  v_teto  integer := 1000;
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
       and (e.livro_entradas is null or e.livro_entradas > 0)
       and (
         v_termo is null
         or e.tag like v_tag
         or (v_tsq is not null and e.busca @@ v_tsq)
       )
     limit v_teto + 1
  ) x;

  return query select least(v_n, v_teto::bigint), v_n <= v_teto;
end;
$$;

grant execute on function public.buscar_livros(text, text, integer) to authenticated;
grant execute on function public.contar_livros(text)                to authenticated;

-- `anon` não recebe nada: sem sessão não há `org_atual()`, e a consulta
-- devolveria vazio de qualquer forma — mas negar o EXECUTE é o fail closed.
revoke execute on function public.buscar_livros(text, text, integer) from anon, public;
revoke execute on function public.contar_livros(text)                from anon, public;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function if exists public.buscar_livros(text, text, integer);
--   drop function if exists public.contar_livros(text);
-- Nada mais no sistema chama estas duas: `/livro-registro` com a flag desligada
-- não passa por aqui, e as outras quatro telas usam `buscar_equipamentos`.
