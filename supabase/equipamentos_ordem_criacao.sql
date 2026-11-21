-- ============================================================================
-- /equipamentos ORDENADA POR DATA DE CRIAÇÃO (mais novos no topo) — 21/11/2026
-- ============================================================================
--
-- Pedido do dono: a lista de `/equipamentos` abre com o equipamento mais NOVO
-- no topo. As outras telas que consomem o catálogo (Inspeções, Livro,
-- Calibrações, Prontuários, Relatórios) continuam em ordem de TAG.
--
-- APLICAR DEPOIS de: busca_index.sql → busca_manutencao.sql → busca_consulta.sql
-- (este arquivo não substitui nenhum deles e NÃO derruba função nenhuma).
-- Idempotente: pode rodar de novo sem efeito colateral.
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO EXISTIA: uma data de criação gravada
-- ---------------------------------------------------------------------------
-- `nr13_info_<TAG>` não tem `criadoEm`, e `app_storage` só tem `atualizado_em`
-- (a ÚLTIMA escrita da chave). A data de criação é DERIVADA, nesta precedência
-- (função `f9_criado_em`, logo abaixo):
--
--   1 · `nr13_info_<TAG>.criadoEm` (ISO), se um dia o front passar a gravá-lo
--       na criação — é a única fonte que acerta também o equipamento criado
--       OFFLINE (o carimbo do servidor é a hora da sincronização);
--   2 · `atualizado_em` de `nr13_pref_unidade_<TAG>` quando ≥ 16/09/2026. Desde
--       essa data a chave é gravada SÓ pelos três fluxos que criam equipamento,
--       imediatamente antes do `nr13_info_` (CLAUDE.md §4), e nunca reescrita —
--       então o carimbo dela É a criação. Antes de 16/09 o seletor do cartão
--       podia regravá-la a qualquer momento, e ela deixa de valer como prova;
--   3 · LEGADO: o MENOR `atualizado_em` entre as chaves vivas daquela TAG
--       (lista fixa, por igualdade exata de chave — nunca `like`, que casaria a
--       TAG `B_A` dentro de `nr13_info_A`). Isso é "a escrita sobrevivente mais
--       antiga" — é um LIMITE SUPERIOR da criação (nunca antes dela), e é o
--       melhor que o banco sabe. Um equipamento legado com uma única chave
--       editada ontem aparece como "criado ontem" na primeira projeção.
--   4 · `source_updated_at` da própria linha, e por fim `now()`: só para a linha
--       que não tem chave nenhuma em `app_storage` (scripts de teste que
--       inserem direto na projeção). Garante o NOT NULL.
--
-- O VALOR CONGELA. O trigger só calcula quando a linha chega sem data — na
-- inserção. Toda reprojeção (o `on conflict do update` de
-- `projetar_equipamento`, que não cita esta coluna) herda o valor antigo. Sem
-- isso, o legado da regra 3 subiria para o topo a cada edição da ficha. A
-- linha só nasce de novo quando a ficha MORRE (`projetar_equipamento` apaga a
-- linha) — e aí recriar a TAG é, de fato, uma criação nova.
--
-- POR QUE TRIGGER, E NÃO MAIS UMA COLUNA NOS 3 LUGARES DO UPSERT
--
--   O upsert de `projetar_equipamento` (busca_manutencao.sql, ~400 linhas) teria
--   de ser recriado inteiro aqui — duas cópias da função, e a próxima mudança
--   em busca_manutencao.sql apagaria a data em silêncio. Com o trigger:
--     · `busca_manutencao.sql` não muda e pode ser reaplicado sem perder nada;
--     · o "rebuild retomável vira no-op" não afeta esta coluna: o backfill
--       abaixo a preenche explicitamente, linha a linha.
--
-- ---------------------------------------------------------------------------
-- A CONSULTA: FUNÇÃO NOVA, NÃO PARÂMETRO NOVO
-- ---------------------------------------------------------------------------
-- Acrescentar `p_ordem` a `buscar_equipamentos` mudaria a assinatura e exigiria
-- `drop function` — o passo que já deixou a tela sem catálogo em produção.
-- Um OVERLOAD com `p_ordem default` também não serve: o PostgREST resolve por
-- argumentos NOMEADOS, e uma chamada com os 5 nomes antigos casaria as duas
-- versões e falharia com PGRST203 ("could not choose the best candidate") —
-- quebrando Inspeções, Livro e Calibrações de uma vez.
--
-- Por isso `buscar_equipamentos_recentes` é uma função À PARTE: a antiga fica
-- intocada (mesma assinatura, mesma ordem por TAG), e o front que pede a
-- ordem nova cai na antiga se esta ainda não existir (PGRST202). A contagem
-- (`contar_equipamentos`) não depende da ordem e não muda.
--
-- Rollback: `drop function public.buscar_equipamentos_recentes(...)` → o front
-- volta sozinho para ordem por TAG. A coluna e o trigger podem ficar (inertes)
-- ou sair com o bloco de rollback no fim deste arquivo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0 · GUARDA: a projeção precisa existir
-- ---------------------------------------------------------------------------
do $guarda$
begin
  if to_regclass('public.equipamentos_index') is null then
    raise exception using
      message = 'public.equipamentos_index nao existe',
      hint    = 'Aplique supabase/busca_index.sql antes deste arquivo.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'equipamentos_index'
       and column_name = 'pth_adotada_mpa'
  ) then
    raise exception using
      message = 'equipamentos_index.pth_adotada_mpa nao existe',
      hint    = 'Aplique busca_index.sql / busca_consulta.sql (pressoes adotadas) antes deste arquivo.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- 1 · a coluna
-- ---------------------------------------------------------------------------
alter table public.equipamentos_index add column if not exists criado_em timestamptz;

comment on column public.equipamentos_index.criado_em is
  'Data de criação DERIVADA do equipamento (ver f9_criado_em). Congela na inserção da linha; '
  'ordena /equipamentos (buscar_equipamentos_recentes).';

-- ---------------------------------------------------------------------------
-- 2 · a derivação
-- ---------------------------------------------------------------------------
-- `security invoker` (o padrão) e SEM execute para o app: ela lê `app_storage`
-- de qualquer org que receber. Só o trigger (rodando como o dono da projeção)
-- e o backfill (DBA) a chamam.
create or replace function public.f9_criado_em(p_org uuid, p_tag text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_txt   text;
  v_info  timestamptz;
  v_unid  timestamptz;
  v_min   timestamptz;
begin
  -- 1 · `criadoEm` gravado na ficha (ISO 8601). Texto ilegível vira null em vez
  --     de derrubar a projeção; data no futuro (relógio do aparelho errado) é
  --     recusada.
  select public.f9_json(s.valor) ->> 'criadoEm' into v_txt
    from public.app_storage s
   where s.org_id = p_org and s.chave = 'nr13_info_' || p_tag and s.deletado_em is null;
  if v_txt ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      v_info := v_txt::timestamptz;
    exception when others then
      v_info := null;
    end;
    if v_info is not null and v_info <= now() + interval '1 day' then
      return v_info;
    end if;
  end if;

  -- 2 · `nr13_pref_unidade_` gravada desde 16/09/2026 = a criação.
  select s.atualizado_em into v_unid
    from public.app_storage s
   where s.org_id = p_org and s.chave = 'nr13_pref_unidade_' || p_tag and s.deletado_em is null;
  if v_unid is not null and v_unid >= timestamptz '2026-09-16 00:00:00-03' then
    return v_unid;
  end if;

  -- 3 · legado: a escrita viva mais antiga entre as chaves da TAG. Lista fixa e
  --     igualdade exata — usa o índice (org_id, chave), ~4 buffers por chave.
  select min(s.atualizado_em) into v_min
    from public.app_storage s
   where s.org_id = p_org
     and s.deletado_em is null
     and s.chave = any (array[
       'nr13_info_'            || p_tag,
       'nr13_pref_unidade_'    || p_tag,
       'nr13_cat_'             || p_tag,
       'nr13_emp_'             || p_tag,
       'nr13_vida_'            || p_tag,
       'nr13_fotos_'           || p_tag,
       'nr13_calc_'            || p_tag,
       'nr13_vaso_'            || p_tag,
       'nr13_vaso_cald_'       || p_tag,
       'nr13_docs_'            || p_tag,
       'nr13_med_esp_'         || p_tag,
       'nr13_livro_'           || p_tag,
       'nr13_calibracoes_'     || p_tag,
       'nr13_prontuario_'      || p_tag,
       'nr13_historico_indice_'|| p_tag
     ]);
  return v_min;  -- null só quando a TAG não tem chave viva nenhuma
end;
$$;

revoke all on function public.f9_criado_em(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · o trigger que preenche (e congela)
-- ---------------------------------------------------------------------------
create or replace function public.f9_equip_criado_em_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Na reprojeção (`on conflict do update` sem esta coluna) NEW herda o valor
  -- de OLD e nada é recalculado: a data CONGELA. Só a linha que chega sem data
  -- — a inserção, ou um backfill que a zerou de propósito — é calculada.
  if new.criado_em is null then
    new.criado_em := coalesce(
      public.f9_criado_em(new.org_id, new.tag),
      new.source_updated_at,
      now()
    );
  end if;
  -- Milissegundos: é a precisão do `Date` do JavaScript. Com microssegundos, o
  -- cursor que o front devolve poderia sair arredondado e a emenda entre
  -- páginas repetiria ou pularia uma linha.
  new.criado_em := date_trunc('milliseconds', new.criado_em);
  return new;
end;
$$;

revoke all on function public.f9_equip_criado_em_trg() from public, anon, authenticated;

drop trigger if exists trg_equip_criado_em on public.equipamentos_index;
create trigger trg_equip_criado_em
  before insert or update on public.equipamentos_index
  for each row execute function public.f9_equip_criado_em_trg();

-- ---------------------------------------------------------------------------
-- 4 · backfill — EXPLÍCITO, linha a linha
-- ---------------------------------------------------------------------------
-- `reconstruir_indice_busca` não serve para isto (o rebuild retomável vira
-- no-op em org já reconstruída). O UPDATE abaixo passa pelo trigger, que
-- recebe o valor já calculado e só trunca para milissegundos.
update public.equipamentos_index e
   set criado_em = coalesce(public.f9_criado_em(e.org_id, e.tag), e.source_updated_at, now())
 where e.criado_em is null;

-- Daqui em diante toda linha tem data (o trigger garante na inserção). O NOT
-- NULL é o que deixa o keyset da consulta ser uma comparação de linha simples.
alter table public.equipamentos_index alter column criado_em set not null;

-- Keyset `(criado_em, tag) < (cursor)` em ordem DECRESCENTE: varredura para
-- trás neste índice, por organização.
create index if not exists equipamentos_index_criado_idx
  on public.equipamentos_index (org_id, criado_em, tag);

-- ---------------------------------------------------------------------------
-- 5 · a consulta ordenada por criação
-- ---------------------------------------------------------------------------
-- MESMO predicado, MESMAS guardas e MESMAS colunas de `buscar_equipamentos`
-- (busca_consulta.sql) — mais `criado_em` no fim. Mudou só a ORDEM e o CURSOR:
--
--   order by criado_em desc, tag desc
--   cursor = (criado_em, tag) da última linha da página anterior
--
-- A TAG é única por organização, então (criado_em, tag) é um desempate total e
-- a paginação nunca repete nem pula. Primeira página: os dois cursores nulos.
--
-- QUEM ACRESCENTAR COLUNA A `buscar_equipamentos` PRECISA ACRESCENTAR AQUI
-- TAMBÉM — a tela de /equipamentos lê desta.
create or replace function public.buscar_equipamentos_recentes(
  p_termo        text default '',
  p_tipo         text default null,
  p_categoria    text default null,
  p_cursor_criado timestamptz default null,
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
  v_cur   boolean := p_cursor_criado is not null and p_cursor_tag is not null;
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
     and (not v_cur or (e.criado_em, e.tag) < (p_cursor_criado, p_cursor_tag::text collate "C"))
     and (v_tipo   is null or e.tipo = v_tipo)
     and (v_cat    is null or e.categoria = v_cat)
     and (
       v_termo is null
       or e.tag like v_tag
       or (v_serie is not null and e.serie_norm like v_serie || '%')
       or (v_tsq   is not null and e.busca @@ v_tsq)
     )
   order by e.criado_em desc, e.tag desc
   limit v_lim;
end;
$$;

grant execute on function public.buscar_equipamentos_recentes(text, text, text, timestamptz, text, integer)
  to authenticated;
revoke execute on function public.buscar_equipamentos_recentes(text, text, text, timestamptz, text, integer)
  from anon, public;

-- O PostgREST só enxerga função nova depois de recarregar o cache de schema.
notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (não roda; copiar se precisar)
-- ============================================================================
-- drop function if exists public.buscar_equipamentos_recentes(text, text, text, timestamptz, text, integer);
-- drop trigger  if exists trg_equip_criado_em on public.equipamentos_index;
-- drop function if exists public.f9_equip_criado_em_trg();
-- drop function if exists public.f9_criado_em(uuid, text);
-- drop index    if exists public.equipamentos_index_criado_idx;
-- alter table public.equipamentos_index drop column if exists criado_em;
-- notify pgrst, 'reload schema';
