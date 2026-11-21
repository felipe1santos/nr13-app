-- ============================================================================
-- Calibrações · "quantos ACESSÓRIOS o equipamento tem" (21/11/2026)
-- ============================================================================
--
-- NÃO APLICADO. Rodar no SQL Editor (ou `supabase db query --linked -f`) só
-- depois de conferir o SHA-256 do texto colado contra o do commit (CLAUDE.md
-- §13). Idempotente: pode rodar de novo.
--
-- ## O defeito (ZZ-TESTE-P2: a lista dizia 3, o painel dizia 5)
--
-- Os dois números vinham de FONTES e DEFINIÇÕES diferentes sob o mesmo rótulo
-- "Acessórios":
--
--   · o PAINEL do equipamento conta o CADASTRO — `nr13_componentes_cal_<TAG>`
--     sem os itens com `removidoEm` (`listarComponentes` → `visiveis`);
--   · a LISTA contava as linhas de calibração do agregado `vencimentos_org`:
--     um item por `componente_id` que tem calibração OFICIAL com
--     `prox_calibracao`. Acessório nunca calibrado, só com rascunho ou com
--     calibração sem "próxima" NÃO aparecia; componente EXCLUÍDO do cadastro
--     cuja calibração ficou na lista CONTINUAVA aparecendo; e o agregado ainda
--     corta em `p_limite` (500) itens da organização inteira.
--
-- Definição escolhida: ACESSÓRIO = componente CADASTRADO e não removido. É o
-- que o usuário vê como cartão no painel, é o que se calibra, e não depende de
-- alguém já ter calibrado. A lista passa a ler este número de
-- `acessorios_org()` abaixo; o agregado de vencimentos continua dando só o
-- prazo.
--
-- ## Segundo defeito, na mesma família: calibração EXCLUÍDA contava
--
-- `projetar_calibracoes` filtrava rascunho mas não o tombstone por item
-- (`removidoEm`, `services/colecoes.ts`, 22/09/2026). Calibração excluída
-- seguia em `calibracoes_index` — e portanto em `equipamentos_index.calibracoes`
-- (a coluna "Calibrações" da lista) e no painel de vencimentos. A função abaixo
-- é a de `documentos_emitidos_imutaveis.sql` com UMA condição a mais.
-- ============================================================================

-- ── 1 · Projeção de calibrações sem os itens removidos ──────────────────────
create or replace function public.projetar_calibracoes(p_org uuid, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista  jsonb;
  v_versao integer;
  v_atual  timestamptz;
begin
  if to_regclass('public.calibracoes_index') is null then
    return;  -- organização sem a migração da 9D: nada a fazer, e não é erro
  end if;

  select public.f9_json(s.valor), s.versao, s.atualizado_em
    into v_lista, v_versao, v_atual
    from public.app_storage s
   where s.org_id = p_org
     and s.chave = 'nr13_calibracoes_' || p_tag
     and s.deletado_em is null;

  delete from public.calibracoes_index where org_id = p_org and tag = p_tag;

  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then
    return;
  end if;

  insert into public.calibracoes_index (
    org_id, calibracao_id, tag, componente_id, nome, tipo, serie,
    data_calibracao, prox_calibracao, source_version, source_updated_at, projected_at
  )
  select
    p_org,
    c ->> 'id',
    p_tag,
    coalesce(
      nullif(btrim(coalesce(c ->> 'componenteId', '')), ''),
      'nome:' || coalesce(nullif(btrim(coalesce(c ->> 'nome', '')), ''), c ->> 'id')
    ),
    nullif(btrim(coalesce(c ->> 'nome', '')), ''),
    nullif(btrim(coalesce(c ->> 'tipo', '')), ''),
    nullif(btrim(coalesce(c ->> 'serie', '')), ''),
    public.f9_data(c ->> 'dataCalibracao'),
    public.f9_data(c ->> 'dataProxCalibracao'),
    v_versao,
    v_atual,
    now()
  from jsonb_array_elements(v_lista) c
  where coalesce(c ->> 'id', '') <> ''
    and coalesce(c ->> 'status', '') <> 'rascunho'
    -- 21/11/2026 · calibração EXCLUÍDA (tombstone por item) não conta.
    and coalesce(c ->> 'removidoEm', '') = ''
  on conflict (org_id, calibracao_id) do update set
    tag = excluded.tag, componente_id = excluded.componente_id,
    nome = excluded.nome, tipo = excluded.tipo, serie = excluded.serie,
    data_calibracao = excluded.data_calibracao,
    prox_calibracao = excluded.prox_calibracao,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    projected_at = excluded.projected_at;
end;
$$;

revoke all on function public.projetar_calibracoes(uuid, text) from public, anon, authenticated;

-- Reprojeta SÓ as TAGs cuja lista tem item removido. `projetar_equipamento`
-- chama `projetar_calibracoes` e relê a contagem — assim a coluna
-- `equipamentos_index.calibracoes` também se corrige.
do $$
declare r record;
begin
  if to_regclass('public.calibracoes_index') is null then return; end if;
  for r in
    select s.org_id, substring(s.chave from 18) as tag
      from public.app_storage s
     where s.chave like 'nr13\_calibracoes\_%'
       and s.deletado_em is null
       and s.valor like '%"removidoEm"%'
  loop
    perform public.projetar_equipamento(r.org_id, r.tag);
  end loop;
end $$;

-- ── 2 · Quantos acessórios cada TAG tem (o cadastro, sem os removidos) ──────
--
-- Devolve `{ "<TAG>": <n>, ... }` só com as TAGs que TÊM a chave. TAG ausente
-- = ninguém cadastrou acessório, e a tela escreve 0 só quando a resposta veio
-- (chamada que falhou = "—"). Só inteiros saem do servidor: o base64 legado
-- das fotos de componente (`foto`) é lido aqui e não trafega.
--
-- A organização NUNCA vem do cliente (`org_atual()`), e o cliente do Portal
-- não lista o parque do inspetor — as mesmas guardas de `vencimentos_org`.
create or replace function public.acessorios_org()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.org_atual();
  v_papel text := coalesce(public.papel_atual(), '');
  v_res   jsonb;
begin
  if v_org is null or v_papel = 'cliente' then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(x.tag, x.n), '{}'::jsonb)
    into v_res
    from (
      select substring(s.chave from 22) as tag,
             (select count(*)
                from jsonb_array_elements(
                       case when jsonb_typeof(public.f9_json(s.valor)) = 'array'
                            then public.f9_json(s.valor) else '[]'::jsonb end) c
               where coalesce(c ->> 'removidoEm', '') = '')::integer as n
        from public.app_storage s
       where s.org_id = v_org
         and s.chave like 'nr13\_componentes\_cal\_%'
         and s.deletado_em is null
    ) x;

  return v_res;
end;
$$;

revoke all on function public.acessorios_org() from public, anon;
grant execute on function public.acessorios_org() to authenticated;

-- ── Conferência (somente leitura) ───────────────────────────────────────────
-- select public.acessorios_org() -> 'ZZ-TESTE-P2';   -- logado na org de teste
-- select count(*) from public.calibracoes_index c
--   join public.app_storage s on s.org_id = c.org_id and s.chave = 'nr13_calibracoes_' || c.tag
--  where s.valor like '%"removidoEm"%';
