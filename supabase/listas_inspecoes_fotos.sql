-- ============================================================================
-- Listas: ordem por Nº DE INSPEÇÕES e FOTO por TAG (21/11/2026)
--
-- 1 · buscar_equipamentos_por_inspecoes — /inspecoes abre com o equipamento
--     mais inspecionado no topo. Função À PARTE (mesmo motivo de
--     `buscar_equipamentos_recentes`, ver equipamentos_ordem_criacao.sql):
--     mudar a assinatura da antiga exigiria `drop function`, e overload com
--     default quebra o PostgREST (PGRST203). Mesmas guardas, mesmo predicado,
--     mesmas colunas. `inspecoes` NULL (não contado) vale -1 e vai para o fim
--     — nunca vira "0 inspeções" inventado.
--
-- 2 · fotos_equipamentos(p_tags) — a foto (e o tipo) das TAGs de UMA página
--     de lista que não vem da projeção de equipamentos (Relatórios,
--     Prontuários). Uma ida por página, no máximo 200 TAGs, só da própria
--     organização (`org_atual()`), papel cliente recusado.
--
-- Só CRIA objetos; nada é apagado. Requer equipamentos_ordem_criacao.sql
-- (coluna `criado_em`, devolvida aqui no mesmo formato da `_recentes`).
-- Rollback: os dois `drop function` comentados no fim.
-- ============================================================================

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'equipamentos_index'
                    and column_name = 'criado_em') then
    raise exception 'Aplique equipamentos_ordem_criacao.sql antes deste arquivo.';
  end if;
end
$guarda$;

create index if not exists equipamentos_index_inspecoes_idx
  on public.equipamentos_index (org_id, (coalesce(inspecoes, -1)) desc, tag);

create or replace function public.buscar_equipamentos_por_inspecoes(
  p_termo        text default '',
  p_tipo         text default null,
  p_categoria    text default null,
  p_cursor_qtd   integer default null,
  p_cursor_tag   text default null,
  p_limite       integer default 50
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
  inspecoes        integer,
  tem_prontuario   boolean,
  calibracoes      integer,
  livro_entradas   integer,
  livro_ultima     date,
  pmta_adotada_mpa numeric,
  pth_adotada_mpa  numeric,
  criado_em        timestamptz
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
  v_serie text    := nullif(upper(regexp_replace(coalesce(p_termo, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_tipo  text    := nullif(btrim(coalesce(p_tipo, '')), '');
  v_cat   text    := nullif(btrim(coalesce(p_categoria, '')), '');
  v_lim   integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  -- Cursor pela METADE não é cursor: sem os dois, é a primeira página.
  v_cur   boolean := p_cursor_qtd is not null and p_cursor_tag is not null;
begin
  -- FAIL CLOSED — as mesmas duas guardas de `buscar_equipamentos`.
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
         e.inspecoes, e.tem_prontuario, e.calibracoes,
         e.livro_entradas, e.livro_ultima,
         e.pmta_adotada_mpa, e.pth_adotada_mpa,
         e.criado_em
    from public.equipamentos_index e
   where e.org_id = v_org
     -- (qtd desc, tag asc): depois do cursor = qtd MENOR, ou a mesma qtd com
     -- TAG maior. NULL (não contado) vale -1 e vai para o fim.
     and (not v_cur
          or coalesce(e.inspecoes, -1) < p_cursor_qtd
          or (coalesce(e.inspecoes, -1) = p_cursor_qtd and e.tag > p_cursor_tag::text collate "C"))
     and (v_tipo   is null or e.tipo = v_tipo)
     and (v_cat    is null or e.categoria = v_cat)
     and (
       v_termo is null
       or e.tag like v_tag
       or (v_serie is not null and e.serie_norm like v_serie || '%')
       or (v_tsq   is not null and e.busca @@ v_tsq)
     )
   order by coalesce(e.inspecoes, -1) desc, e.tag asc
   limit v_lim;
end;
$$;

revoke execute on function public.buscar_equipamentos_por_inspecoes(text, text, text, integer, text, integer)
  from public, anon;
grant execute on function public.buscar_equipamentos_por_inspecoes(text, text, text, integer, text, integer)
  to authenticated, service_role;

create or replace function public.fotos_equipamentos(p_tags text[])
returns table (tag text, tipo text, foto_ref jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.org_atual();
  v_papel text := coalesce(public.papel_atual(), '');
begin
  if v_org is null or v_papel = 'cliente' or p_tags is null then
    return;
  end if;
  return query
  select e.tag, e.tipo, case when e.tem_foto then e.foto_ref end
    from public.equipamentos_index e
   where e.org_id = v_org
     and e.tag = any (p_tags[1:200]);
end;
$$;

revoke execute on function public.fotos_equipamentos(text[]) from public, anon;
grant execute on function public.fotos_equipamentos(text[]) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ROLLBACK (o front volta sozinho para a ordem por TAG e para o ícone):
-- drop function if exists public.buscar_equipamentos_por_inspecoes(text, text, text, integer, text, integer);
-- drop function if exists public.fotos_equipamentos(text[]);
