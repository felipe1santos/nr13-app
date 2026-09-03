-- ============================================================================
-- FASE 9 · 9G.2 — O AGREGADO PARA DE MONTAR JSON DA ORGANIZAÇÃO INTEIRA
-- ============================================================================
--
-- Aplicar DEPOIS de `vencimentos_agregado.sql` (25/08/2026). Este arquivo faz
-- `create or replace` da MESMA função, com a MESMA assinatura e o MESMO
-- retorno: `vencimentos_org(integer) returns jsonb`.
--
-- **Não há flag e não há rollout por organização.** Uma flag aqui teria de
-- carregar duas cópias da mesma regra de vencimento no servidor, e é isso que a
-- 9D.5 escreveu em letras grandes para não fazer: duas implementações da mesma
-- regra divergem em silêncio, e quem paga é o engenheiro que assina. O rollback
-- é reaplicar `vencimentos_agregado.sql`, que é o arquivo anterior inteiro.
--
-- ---------------------------------------------------------------------------
-- O QUE MUDA — e o que NÃO muda
-- ---------------------------------------------------------------------------
--
-- **A regra não muda.** Nem uma linha da consolidação do prazo: o `least()` das
-- duas próximas inspeções do relatório mais recente, a Vida Remanescente como
-- reserva, o `distinct on` com os mesmos desempates (relatório por
-- `relatorio_id` crescente, calibração por `calibracao_id` decrescente). Os
-- FATOS devolvidos em `itens` são os mesmos campos, com os mesmos nomes.
--
-- **Muda ONDE o JSON é construído.** Antes, a CTE `itens` fazia um
-- `jsonb_build_object` por linha da organização INTEIRA — equipamentos mais
-- calibrações — e só depois `pagina` ordenava e cortava em 500. Ou seja: o
-- servidor montava 50.000 objetos JSON para jogar 49.500 fora.
--
-- Medido no laboratório (`bench-9f5-9f6.sql`, Supabase local):
--
--   | degrau | antes                                  |
--   |--------|----------------------------------------|
--   | 1k     | 26,9 ms · 7.429 buffers                |
--   | 10k    | 46,7 ms · 8.223 buffers + 350 temp     |
--   | 50k    | 220,1 ms · 14.031 buffers + 1.756 temp |
--
-- Os blocos `temp` são o derrame para disco: ~14 MB em 50k. Não é a ordenação
-- que derrama — é a ordenação carregando um `jsonb` por linha.
--
-- Agora as CTEs devolvem COLUNAS CRUAS; a contagem roda sobre elas (que é o que
-- contagem precisa) e o `jsonb_build_object` acontece uma vez por linha da
-- PÁGINA, depois do corte. O `order by ... limit` vira um top-N sobre linhas
-- estreitas.
--
-- ---------------------------------------------------------------------------
-- O QUE CONTINUA CRESCENDO COM A ORGANIZAÇÃO, e por que é aceitável
-- ---------------------------------------------------------------------------
--
-- Este é um AGREGADO: `total_equip`, `vencidos` e `a_vencer_30` são perguntas
-- sobre a organização inteira, e responder exige percorrê-la. O que se pode
-- tirar é o trabalho por linha — e é o que esta etapa tira. Um painel que não
-- percorresse a organização precisaria de contadores mantidos por trigger, com
-- o custo de manter certos contadores derivados de uma REGRA que muda (a data
-- consolidada depende do relatório mais recente). Não vale, e não foi feito.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guarda: sem o arquivo anterior aplicado, `f9_mais_meses` não existe e a
-- função abaixo compilaria para quebrar só na primeira chamada — no painel do
-- cliente, não aqui.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.f9_mais_meses(date, integer)') is null then
    raise exception 'f9_mais_meses nao existe: aplique vencimentos_agregado.sql antes deste arquivo';
  end if;
  if to_regclass('public.calibracoes_index') is null then
    raise exception 'calibracoes_index nao existe: aplique vencimentos_agregado.sql antes deste arquivo';
  end if;
end $$;

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
  -- ── 9G.2 · FATOS CRUS, SEM JSON ──────────────────────────────────────────
  -- Esta CTE é a antiga `itens` sem o `jsonb_build_object`. As colunas dos dois
  -- ramos precisam CASAR em número e tipo para o `union all`, e é por isso que
  -- o ramo de inspeção declara `null::text` onde o de calibração tem `serie`, e
  -- vice-versa. O objeto é montado no fim, uma vez por linha da PÁGINA.
  --
  -- `NOT MATERIALIZED` NÃO É ENFEITE — foi medido. `fatos` tem DOIS
  -- consumidores (`contas` e `pagina`), e uma CTE assim o Postgres materializa:
  -- as 55.000 linhas viram um resultado intermediário que não cabe em
  -- `work_mem` e derrama para disco. Medido em 50k, com buffers quentes:
  --
  --   | versão                          | tempo   | temp (blocos) |
  --   |---------------------------------|---------|---------------|
  --   | antes (jsonb da org inteira)    | 181,6ms | 1.756 (~14MB) |
  --   | top-N, CTE materializada        | 116,8ms |   418 (~3MB)  |
  --   | top-N + `not materialized`      |  87,5ms | **0**         |
  --
  -- Sem a materialização, a subárvore é avaliada duas vezes — mais buffers
  -- lidos da memória compartilhada, nenhum byte no disco. Ler a mesma página
  -- duas vezes da RAM é mais barato que escrevê-la uma vez no disco.
  fatos as not materialized (
    select
      'inspecao'::text          as origem,
      tag,
      descricao                 as nome,
      tipo,
      venc,
      vida_base,
      vida_prox_anos,
      rel_emissao,
      rel_execucao,
      rel_prox_int,
      rel_prox_ext,
      null::text                as serie,
      null::date                as data_calibracao
      from equip
    union all
    select
      'calibracao',
      tag,
      nome,
      tipo,
      prox_calibracao,
      null::date,
      null::numeric,
      null::date,
      null::date,
      null::date,
      null::date,
      serie,
      data_calibracao
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
      from fatos
  ),
  -- Top-N sobre linhas estreitas. A ordenação é a MESMA de antes
  -- (`venc nulls last, tag`) — o que mudou é o peso do que está sendo ordenado.
  pagina as (
    select * from fatos
     order by venc nulls last, tag
     limit v_lim
  ),
  -- ── O JSON, agora só para quem sobreviveu ao corte ───────────────────────
  -- Os nomes de campo e a forma do objeto são IDÊNTICOS aos de antes: é o que a
  -- tela lê, e `vencimentosAgregado.consistencia.test.ts` prende contra o
  -- TypeScript. Mudar um nome aqui apagaria uma coluna da tela sem erro nenhum.
  pagina_json as (
    select
      case when origem = 'inspecao' then
        jsonb_build_object(
          'tag', tag, 'origem', 'inspecao', 'descricao', nome, 'tipo', tipo,
          'vidaBase', vida_base, 'vidaProxAnos', vida_prox_anos,
          'relEmissao', rel_emissao, 'relExecucao', rel_execucao,
          'relProxInterna', rel_prox_int, 'relProxExterna', rel_prox_ext
        )
      else
        jsonb_build_object(
          'tag', tag, 'origem', 'calibracao', 'pertenceA', tag,
          'nome', nome, 'tipo', tipo, 'serie', serie,
          'dataCalibracao', data_calibracao, 'proxCalibracao', venc
        )
      end as item,
      venc, tag
      from pagina
  )
  select jsonb_build_object(
           'total_equip', c.total_equip,
           'com_prazo',   c.com_prazo,
           'vencidos',    c.vencidos,
           'a_vencer_30', c.a_vencer_30,
           'truncado',    c.total_itens > v_lim,
           'restantes',   greatest(c.total_itens - v_lim, 0),
           -- A ORDEM DA PÁGINA PRECISA SOBREVIVER À AGREGAÇÃO. `jsonb_agg` sem
           -- `order by` não promete ordem nenhuma, e o `limit` da CTE não a
           -- carrega para cá. Sem esta cláusula a tela receberia os 500 certos
           -- embaralhados — e "embaralhado" numa lista de vencimentos é o item
           -- vencido aparecendo no fim.
           'itens',       coalesce(
                            (select jsonb_agg(item order by venc nulls last, tag)
                               from pagina_json),
                            '[]'::jsonb),
           'em',          now()
         )
    into v_res
    from contas c;

  return v_res;
end;
$$;

comment on function public.vencimentos_org(integer) is
  'Fase 9 · 9D.5 + 9G.2 · painel de vencimentos da organizacao. Devolve FATOS CRUS ordenados e contados; a data exibida sai do TypeScript. 9G.2: o jsonb passou a ser construido SO para as linhas da pagina, depois do corte — antes ele era montado para a organizacao inteira e 99% era descartado.';

-- As mesmas ACLs do arquivo anterior. `create or replace` PRESERVA os grants,
-- mas repeti-los é barato e torna este arquivo aplicavel sozinho num banco onde
-- alguem tenha mexido nas permissoes.
revoke all on function public.vencimentos_org(integer) from public, anon;
grant execute on function public.vencimentos_org(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Reaplicar `supabase/vencimentos_agregado.sql` inteiro: ele contém a versão
-- anterior desta mesma função, com a mesma assinatura.
--
-- Nada aqui guarda verdade: a função é só leitura sobre projeções derivadas de
-- `app_storage`, que segue sendo a fonte.
