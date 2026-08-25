-- ============================================================================
-- FASE 9 · 9D.5 — O PAINEL DE VENCIMENTOS DEIXA DE VARRER A ORGANIZAÇÃO
-- ============================================================================
--
-- Desenho §15 (DECISÃO 7, híbrido). Trazido da 9F para a 9D porque a tela de
-- ENTRADA do sistema é o `/dashboard`, e ela lê `nr13_info_` do cache inteiro:
-- sob `boot_v9` ela mostraria zero equipamentos e o painel vazio — silencioso.
-- Um boot leve com a primeira tela mentindo não é boot leve, é bug.
--
-- ORDEM DE APLICAÇÃO
--   1. este arquivo            (colunas novas + `calibracoes_index`)
--   2. busca_manutencao.sql    (reaplicar: projeta os campos novos)
--   3. busca_index_rpc.sql     (reaplicar: `nr13_calibracoes_` no despachante)
--   4. por organização já convergida:
--        select public.reiniciar_rebuild_busca('<ORG>');
--        select public.reconstruir_indice_busca('<ORG>', 1000);  -- repetir
--      As colunas novas nascem NULAS nas linhas já projetadas; sem o rebuild o
--      painel abriria certo em equipamento novo e vazio nos antigos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONDE MORA A REGRA, E POR QUÊ
--
--   A regra do vencimento continua em `src/services/vencimentos.ts`:
--     · o prazo do equipamento é o do ÚLTIMO RELATÓRIO (menor entre Próx.
--       Interna e Próx. Externa); Vida Remanescente só entra como reserva;
--     · do acessório, a calibração MAIS RECENTE de cada componente.
--
--   Este SQL devolve FATOS CRUS e ORDENA/CONTA. Nada do que a tela exibe é
--   calculado aqui: a data que aparece na linha sai do TypeScript, sobre o fato
--   cru, exatamente como no caminho antigo. Foi assim que o portão P9.2 fechou
--   — duas implementações da mesma regra divergem em silêncio, e quem paga é o
--   engenheiro que assina o documento.
--
--   A ordenação e a contagem PRECISAM da data consolidada, então ela existe
--   aqui — e `vencimentosAgregado.consistencia.test.ts` prende as duas contas
--   caso a caso, incluindo 31/01 (o mês que "estoura").
--
-- ARITMÉTICA DE MESES, IGUAL À DO JAVASCRIPT
--
--   `vida_base + round(anos*12) meses` no JS é `setMonth()`, que TRANSBORDA:
--   31/01 + 1 mês vira 03/03. O `+ interval` do Postgres GRAMPEIA: vira 28/02.
--   Por isso a conta aqui é feita como o JS faz — primeiro dia do mês, soma dos
--   meses, e depois (dia-1) dias. Duas datas "quase iguais" seriam pior do que
--   duas datas diferentes: ninguém iria procurar.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · FATOS QUE FALTAVAM NAS PROJEÇÕES
-- ---------------------------------------------------------------------------
-- `proxima_inspecao` já existia, mas é DERIVADA (base + anos*365 dias). O
-- painel precisa dos fatos crus para o TypeScript refazer a conta dele.
alter table public.equipamentos_index add column if not exists vida_base      date;
alter table public.equipamentos_index add column if not exists vida_prox_anos numeric;

comment on column public.equipamentos_index.vida_base is
  'Fase 9 · nr13_vida_: entrada.dataAtual (ou calculadoEm). FATO cru — a regra do prazo é do vencimentos.ts.';
comment on column public.equipamentos_index.vida_prox_anos is
  'Fase 9 · nr13_vida_.proximaInspecaoAnos. NÃO confundir com vida_anos (vidaAnos, a vida remanescente).';

-- `execucao_inspecao` é a "última inspeção" que a linha do painel exibe;
-- `data_ref` é o desempate de "qual relatório é o mais recente" quando
-- `emissao` está vazia — a mesma precedência do `ts()` do TypeScript.
alter table public.relatorios_index add column if not exists execucao_inspecao date;
alter table public.relatorios_index add column if not exists data_ref          date;

-- ---------------------------------------------------------------------------
-- 2 · PROJEÇÃO DOS ACESSÓRIOS (CALIBRAÇÕES)
-- ---------------------------------------------------------------------------
-- Origem: `nr13_calibracoes_<TAG>`. Uma linha da verdade vira N linhas aqui.
-- Mantida por `projetar_calibracoes`, chamada de dentro de
-- `projetar_equipamento` — uma máquina de estados só, a do rebuild que já
-- existe.
create table if not exists public.calibracoes_index (
  org_id            uuid        not null,
  calibracao_id     text        not null,
  tag               text        not null,

  -- Por qual componente esta calibração responde. É o agrupamento que decide
  -- "a mais recente de cada componente" — com o MESMO recuo do TypeScript
  -- (`componenteId`, e na falta dele `nome:<nome|id>`).
  componente_id     text        not null,
  nome              text,
  tipo              text,       -- 'psv' (válvula) | manômetro
  serie             text,

  data_calibracao   date,
  prox_calibracao   date,

  source_version    integer     not null,
  source_updated_at timestamptz not null,
  projected_at      timestamptz not null default now(),

  primary key (org_id, calibracao_id)
);

comment on table public.calibracoes_index is
  'Fase 9 · projeção DERIVADA de nr13_calibracoes_<TAG>. FATOS: a redução "a mais recente de cada componente" é do vencimentos.ts.';

-- Junção por equipamento é o único caminho de leitura: o agregado percorre a
-- organização por TAG, e `projetar_calibracoes` apaga por (org, tag).
create index if not exists calibracoes_index_org_tag_idx
  on public.calibracoes_index (org_id, tag);

-- O agregado ordena e conta por prazo. Sem este índice, uma organização grande
-- pagaria uma varredura da tabela inteira a cada abertura do Dashboard.
create index if not exists calibracoes_index_org_prox_idx
  on public.calibracoes_index (org_id, prox_calibracao);

alter table public.calibracoes_index enable row level security;

-- A leitura é SEMPRE pela RPC (`security definer`, organização de `org_atual()`).
-- Sem policy de select, a tabela é inacessível por PostgREST — fail closed, o
-- mesmo desenho das outras projeções.

-- ---------------------------------------------------------------------------
-- 3 · A CONTA DE MESES DO JAVASCRIPT, EM SQL
-- ---------------------------------------------------------------------------
-- `new Date(base).setMonth(base.getMonth() + n)`, incluindo o transbordo.
create or replace function public.f9_mais_meses(p_base date, p_meses integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_base is null or p_meses is null then null
    else (date_trunc('month', p_base::timestamp)
          + make_interval(months => p_meses)
          + make_interval(days => extract(day from p_base)::int - 1))::date
  end;
$$;

comment on function public.f9_mais_meses(date, integer) is
  'Soma meses como o setMonth() do JavaScript, TRANSBORDANDO (31/01 + 1 mês = 03/03). O + interval do Postgres grampearia em 28/02.';

-- ---------------------------------------------------------------------------
-- 4 · O AGREGADO
-- ---------------------------------------------------------------------------
-- Devolve, numa chamada:
--   · os CONTADORES da organização inteira (KPIs do Dashboard);
--   · os N itens mais urgentes, em FATOS CRUS, para a tela montar as linhas.
--
-- O limite existe porque `/vencimentos` renderiza uma linha por item e a
-- virtualização é da 9F: devolver 51.000 itens trocaria um problema de rede por
-- um problema de DOM. `truncado`/`restantes` deixam isso EXPLÍCITO na tela —
-- lista cortada em silêncio é o mesmo defeito que a Fase 9 combate.
drop function if exists public.vencimentos_org(integer);

create or replace function public.vencimentos_org(p_limite integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_org   uuid    := public.org_atual();
  v_papel text    := coalesce(public.papel_atual(), '');
  v_lim   integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
  v_hoje  date    := current_date;
  v_res   jsonb;
begin
  -- FAIL CLOSED, as mesmas duas guardas de `buscar_equipamentos`. O cliente do
  -- Portal não tem painel de vencimentos da organização do inspetor.
  if v_org is null or v_papel = 'cliente' then
    return jsonb_build_object('total_equip', 0, 'vencidos', 0, 'a_vencer_30', 0,
                              'com_prazo', 0, 'truncado', false, 'restantes', 0,
                              'itens', '[]'::jsonb, 'em', now());
  end if;

  with
  -- O relatório MAIS RECENTE de cada TAG. Precedência de data igual à do
  -- `ts()` do TypeScript (emissão, e na falta dela a data do relatório); o
  -- desempate por `relatorio_id` crescente reproduz o `sort` estável do JS,
  -- que preserva a ordem de inserção do índice entre iguais.
  recente as (
    select distinct on (r.tag)
           r.tag, r.emissao, r.data_ref, r.execucao_inspecao,
           r.proxima_inspecao_interna, r.proxima_inspecao_externa
      from public.relatorios_index r
     where r.org_id = v_org
     order by r.tag, coalesce(r.emissao, r.data_ref) desc nulls last, r.relatorio_id
  ),
  equip as (
    select
      e.tag,
      e.descricao,
      e.tipo,
      e.vida_base,
      e.vida_prox_anos,
      rec.emissao            as rel_emissao,
      rec.execucao_inspecao  as rel_execucao,
      rec.proxima_inspecao_interna as rel_prox_int,
      rec.proxima_inspecao_externa as rel_prox_ext,
      -- A data consolidada — SÓ para ordenar e contar. O prazo do relatório
      -- VENCE o da vida, e o relatório mais recente sem data nenhuma não faz o
      -- sistema procurar num relatório anterior: é a regra do TypeScript.
      coalesce(
        least(rec.proxima_inspecao_interna, rec.proxima_inspecao_externa),
        case when e.vida_base is not null and e.vida_prox_anos is not null
             then public.f9_mais_meses(e.vida_base, round(e.vida_prox_anos * 12)::integer)
             else null end
      ) as venc
      from public.equipamentos_index e
      left join recente rec on rec.tag = e.tag
     where e.org_id = v_org
  ),
  -- Acessórios: a calibração mais recente de CADA componente. `dataProxCalibracao`
  -- é o critério do TypeScript (`dNova >= dAtual`), e o `>=` dele faz o ÚLTIMO
  -- empate vencer — por isso o desempate aqui é por `calibracao_id` decrescente.
  calib as (
    select distinct on (c.org_id, c.tag, c.componente_id)
           c.tag, c.nome, c.tipo, c.serie, c.data_calibracao, c.prox_calibracao
      from public.calibracoes_index c
     where c.org_id = v_org
     order by c.org_id, c.tag, c.componente_id,
              c.prox_calibracao desc nulls last, c.calibracao_id desc
  ),
  itens as (
    select 'inspecao'::text as origem, tag, null::text as pertence_a,
           descricao as nome, tipo, venc,
           jsonb_build_object(
             'tag', tag, 'origem', 'inspecao', 'descricao', descricao, 'tipo', tipo,
             'vidaBase', vida_base, 'vidaProxAnos', vida_prox_anos,
             'relEmissao', rel_emissao, 'relExecucao', rel_execucao,
             'relProxInterna', rel_prox_int, 'relProxExterna', rel_prox_ext
           ) as item
      from equip
    union all
    select 'calibracao', tag, tag, nome, tipo, prox_calibracao,
           jsonb_build_object(
             'tag', tag, 'origem', 'calibracao', 'pertenceA', tag,
             'nome', nome, 'tipo', tipo, 'serie', serie,
             'dataCalibracao', data_calibracao, 'proxCalibracao', prox_calibracao
           )
      from calib
     where prox_calibracao is not null   -- o TypeScript só cria a linha com prazo
  ),
  contas as (
    select
      (select count(*) from public.equipamentos_index e where e.org_id = v_org) as total_equip,
      count(*) filter (where venc is not null)                                   as com_prazo,
      count(*) filter (where venc is not null and venc <  v_hoje)                as vencidos,
      count(*) filter (where venc is not null and venc >= v_hoje
                             and venc <= v_hoje + 30)                            as a_vencer_30,
      count(*)                                                                   as total_itens
      from itens
  ),
  pagina as (
    select item from itens
     order by venc nulls last, tag
     limit v_lim
  )
  select jsonb_build_object(
           'total_equip', c.total_equip,
           'com_prazo',   c.com_prazo,
           'vencidos',    c.vencidos,
           'a_vencer_30', c.a_vencer_30,
           'truncado',    c.total_itens > v_lim,
           'restantes',   greatest(c.total_itens - v_lim, 0),
           'itens',       coalesce((select jsonb_agg(item) from pagina), '[]'::jsonb),
           'em',          now()
         )
    into v_res
    from contas c;

  return v_res;
end;
$$;

grant execute on function public.f9_mais_meses(date, integer) to authenticated;
grant execute on function public.vencimentos_org(integer)     to authenticated;
revoke execute on function public.vencimentos_org(integer)    from anon;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--   drop function if exists public.vencimentos_org(integer);
--   drop function if exists public.f9_mais_meses(date, integer);
--   drop table    if exists public.calibracoes_index;
--   alter table public.equipamentos_index drop column if exists vida_base;
--   alter table public.equipamentos_index drop column if exists vida_prox_anos;
--   alter table public.relatorios_index   drop column if exists execucao_inspecao;
--   alter table public.relatorios_index   drop column if exists data_ref;
-- Tudo aqui é DERIVADO: nenhum dado empresarial se perde.
-- (Reaplique busca_manutencao.sql da versão anterior se derrubar as colunas.)
-- ---------------------------------------------------------------------------
