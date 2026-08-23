-- ============================================================================
-- FASE 9 · 9A — MANUTENÇÃO DAS PROJEÇÕES
-- ============================================================================
--
--   reconstruir_indice_busca(org, lote)  reconstrói da verdade, retomável
--   reparar_pendencias(org, lote)        consome busca_pendencias
--   auditar_projecao(org)                prova convergência — a GARANTIA
--
-- REGRA QUE NÃO SE QUEBRA: nenhuma destas funções escreve em `app_storage`.
-- Elas só LEEM a verdade. É isso que garante "sem efeito colateral empresarial".
--
-- Todas rodam com `security definer` e são REVOGADAS de `anon`/`authenticated`:
-- manutenção não é operação de usuário.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Utilitários de parsing — TOLERANTES POR OBRIGAÇÃO
-- ---------------------------------------------------------------------------
-- A verdade tem 8 anos de formatos acumulados. Uma data mal formada não pode
-- derrubar o rebuild de uma organização inteira: ela vira `null` e a linha
-- entra assim mesmo. Perder um filtro de período é recuperável; perder a
-- reconstrução não é.

create or replace function public.f9_data(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  -- DD/MM/AAAA — o formato que o sistema grava hoje
  if p ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(p, 'DD/MM/YYYY');
  end if;
  -- AAAA-MM-DD e ISO com hora
  if p ~ '^\d{4}-\d{2}-\d{2}' then
    return substring(p from 1 for 10)::date;
  end if;
  return null;
exception when others then
  return null;  -- data impossível (31/02) chega aqui
end;
$$;

/** JSON da verdade. `valor` é `text`; conteúdo inválido vira null, não exceção. */
create or replace function public.f9_json(p text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::jsonb;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projeção de UM equipamento, a partir da verdade
-- ---------------------------------------------------------------------------
-- Recebe a TAG e lê tudo que precisa. É esta função que a 9B vai chamar dentro
-- da RPC — deixá-la pronta aqui é o que torna a 9B uma mudança pequena no
-- caminho crítico de escrita, em vez de uma cirurgia.
-- ---------------------------------------------------------------------------
-- Número guardado como TEXTO vira numeric — ou NULL, sem derrubar a projeção.
-- ---------------------------------------------------------------------------
-- `nr13_calc_` guarda `pmta`/`pth` como STRING ("1.2345"), e o usuário pode ter
-- salvo "", "--" ou lixo. Um cast direto levantaria exceção, a projeção iria
-- para a fila de pendências e o equipamento sumiria da lista — por causa de um
-- campo decorativo. Aqui o valor ruim vira NULL e o resto da linha sobrevive.
create or replace function public.f9_num(p_texto text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $fn$
begin
  return nullif(btrim(coalesce(p_texto, '')), '')::numeric;
exception when others then
  return null;
end;
$fn$;

create or replace function public.projetar_equipamento(p_org uuid, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_info    jsonb;
  v_versao  integer;
  v_atual   timestamptz;
  v_cat     jsonb;
  v_emp     jsonb;
  v_vida    jsonb;
  v_fotos   jsonb;
  v_calc    jsonb;
  v_unid    text;
  v_base    date;
  v_anos    numeric;
begin
  -- `nr13_info_` é a chave que MANDA: define existência e versão.
  select public.f9_json(s.valor), s.versao, s.atualizado_em
    into v_info, v_versao, v_atual
    from public.app_storage s
   where s.org_id = p_org and s.chave = 'nr13_info_' || p_tag and s.deletado_em is null;

  -- Sem ficha VIVA, o equipamento não existe para a projeção — e some dela.
  if not found then
    delete from public.equipamentos_index where org_id = p_org and tag = p_tag;
    return;
  end if;

  -- Ficha viva, mas com JSON ILEGÍVEL. Projeta linha MÍNIMA em vez de omitir.
  --
  -- Descoberto pelo teste de falha em cascata da 9B: omitir criava uma
  -- divergência PERMANENTE E IRREPARÁVEL — a auditoria acusaria para sempre,
  -- porque nenhum reparo conseguiria produzir a linha. E o equipamento sumia
  -- da busca, que é justamente o defeito que este projeto existe para combater.
  --
  -- Com a linha mínima, o equipamento continua achável pela TAG (que vem da
  -- CHAVE, não do valor), a auditoria converge, e os campos pesquisáveis ficam
  -- nulos — que é a verdade sobre um conteúdo que ninguém consegue ler.
  if v_info is null then
    insert into public.equipamentos_index (org_id, tag, source_version, source_updated_at, projected_at)
    values (p_org, p_tag, v_versao, v_atual, now())
    on conflict (org_id, tag) do update set
      descricao = null, tipo = null, subtipo = null, categoria = null,
      fabricante = null, numero_serie = null, localizacao = null, ano = null,
      cliente = null, proxima_inspecao = null, tem_foto = false, foto_ref = null,
      pmta_mpa = null, pth_mpa = null, resultado = null, volume_m3 = null,
      fluido = null, classe_fluido = null, vida_anos = null, tem_cliente = false,
      unidade = null,
      source_version = excluded.source_version,
      source_updated_at = excluded.source_updated_at,
      projected_at = excluded.projected_at;
    return;
  end if;

  -- SELECTs SEPARADOS, e isso e o resultado de uma MEDICAO, nao descuido.
  --
  -- Tentei trocar por uma varredura unica com IN + array_agg FILTER, supondo
  -- que uma passada venceria varias buscas por indice. MEDIDO: 1.494 buffers
  -- contra 1.451 dos selects separados — a "otimizacao" ficou 3 % PIOR. O
  -- indice (org_id, chave) resolve cada chave em ~4 buffers; agregar sobre um
  -- IN custa mais do que isso.
  --
  -- (A primeira versao daquela tentativa ainda usava max(jsonb), que NAO EXISTE
  -- em Postgres. A projecao quebrou, e foram a pendencia e a auditoria que
  -- acusaram — a verdade nunca foi afetada. Ver o registro da 9B.)
  select public.f9_json(valor) into v_cat   from public.app_storage
   where org_id = p_org and chave = 'nr13_cat_'   || p_tag and deletado_em is null;
  select public.f9_json(valor) into v_emp   from public.app_storage
   where org_id = p_org and chave = 'nr13_emp_'   || p_tag and deletado_em is null;
  select public.f9_json(valor) into v_vida  from public.app_storage
   where org_id = p_org and chave = 'nr13_vida_'  || p_tag and deletado_em is null;
  select public.f9_json(valor) into v_fotos from public.app_storage
   where org_id = p_org and chave = 'nr13_fotos_' || p_tag and deletado_em is null;
  -- `nr13_calc_` e `nr13_pref_unidade_` entraram na 9C: sem eles o cartão da
  -- lista perderia PMTA, PTH, resultado e a unidade escolhida, e o piloto
  -- viraria regressão visível para o usuário.
  select public.f9_json(valor) into v_calc  from public.app_storage
   where org_id = p_org and chave = 'nr13_calc_'  || p_tag and deletado_em is null;
  select public.f9_json(valor) #>> '{}' into v_unid from public.app_storage
   where org_id = p_org and chave = 'nr13_pref_unidade_' || p_tag and deletado_em is null;

  -- proxima_inspecao: FATO derivado só da vida remanescente. A consolidação com
  -- as datas do relatório é da 9F, por junção com relatorios_index — replicar
  -- aqui a regra inteira de `vencimentos.ts` duplicaria lógica de negócio em
  -- PL/pgSQL, e o desenho (§4.1) rejeitou esse caminho.
  v_base := public.f9_data(coalesce(v_vida #>> '{entrada,dataAtual}', v_vida ->> 'calculadoEm'));
  begin
    v_anos := nullif(v_vida ->> 'proximaInspecaoAnos', '')::numeric;
  exception when others then
    v_anos := null;
  end;

  insert into public.equipamentos_index as e (
    org_id, tag, descricao, tipo, subtipo, categoria, fabricante, numero_serie,
    localizacao, ano, cliente, proxima_inspecao, tem_foto, foto_ref,
    pmta_mpa, pth_mpa, resultado, volume_m3, fluido, classe_fluido, vida_anos,
    tem_cliente, unidade,
    source_version, source_updated_at, projected_at
  ) values (
    p_org,
    p_tag,
    nullif(btrim(coalesce(v_info ->> 'descricao', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'tipo', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'subtipo', '')), ''),
    nullif(btrim(coalesce(v_cat  ->> 'catFinal', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'fabricante', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'numeroSerie', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'localizacao', '')), ''),
    nullif(btrim(coalesce(v_info ->> 'ano', '')), ''),
    nullif(btrim(coalesce(v_emp ->> 'nomeFantasia', v_emp ->> 'razaoSocial', '')), ''),
    case when v_base is not null and v_anos is not null
         then v_base + (v_anos * 365)::integer
         else null end,
    coalesce(jsonb_array_length(coalesce(v_fotos, '[]'::jsonb)) > 0, false),
    -- Capa: a marcada `isCapa`, senão a primeira. Só a REFERÊNCIA do bucket;
    -- foto legada em base64 não tem `ref` e vira null, como deve.
    (select f -> 'ref'
       from jsonb_array_elements(coalesce(v_fotos, '[]'::jsonb)) f
      where f -> 'ref' is not null
      order by (f ->> 'isCapa')::boolean desc nulls last
      limit 1),
    public.f9_num(v_calc ->> 'pmta'),
    public.f9_num(v_calc ->> 'pth'),
    nullif(btrim(coalesce(v_calc ->> 'resultado', '')), ''),
    public.f9_num(v_cat ->> 'volInput'),
    nullif(btrim(coalesce(v_cat ->> 'fluidoInput', '')), ''),
    nullif(btrim(coalesce(v_cat ->> 'classe', '')), ''),
    public.f9_num(v_vida ->> 'vidaAnos'),
    -- Sem `clienteId` o equipamento não aparece no Portal, e o cartão avisa em
    -- âmbar. O aviso precisa do FATO, não do id — que não tem por que viajar.
    nullif(btrim(coalesce(v_emp ->> 'clienteId', '')), '') is not null,
    nullif(btrim(coalesce(v_unid, '')), ''),
    v_versao,
    v_atual,
    now()
  )
  on conflict (org_id, tag) do update set
    descricao = excluded.descricao,       tipo = excluded.tipo,
    subtipo = excluded.subtipo,           categoria = excluded.categoria,
    fabricante = excluded.fabricante,     numero_serie = excluded.numero_serie,
    localizacao = excluded.localizacao,   ano = excluded.ano,
    cliente = excluded.cliente,           proxima_inspecao = excluded.proxima_inspecao,
    tem_foto = excluded.tem_foto,         foto_ref = excluded.foto_ref,
    pmta_mpa = excluded.pmta_mpa,         pth_mpa = excluded.pth_mpa,
    resultado = excluded.resultado,       volume_m3 = excluded.volume_m3,
    fluido = excluded.fluido,             classe_fluido = excluded.classe_fluido,
    vida_anos = excluded.vida_anos,       tem_cliente = excluded.tem_cliente,
    unidade = excluded.unidade,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    projected_at = excluded.projected_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projeção dos relatórios de UMA tag
-- ---------------------------------------------------------------------------
-- Uma linha da verdade (`nr13_historico_indice_<TAG>`) vira N linhas aqui.
-- Por isso apaga por (org, tag) antes de reinserir: relatório excluído some.
create or replace function public.projetar_relatorios(p_org uuid, p_tag text)
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
  select public.f9_json(s.valor), s.versao, s.atualizado_em
    into v_lista, v_versao, v_atual
    from public.app_storage s
   where s.org_id = p_org
     and s.chave = 'nr13_historico_indice_' || p_tag
     and s.deletado_em is null;

  delete from public.relatorios_index where org_id = p_org and tag = p_tag;

  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then
    return;
  end if;

  insert into public.relatorios_index (
    org_id, relatorio_id, tag, codigo, nome, tipo, status, profissional,
    emissao, validade, proxima_inspecao_interna, proxima_inspecao_externa,
    pdf_ref, sha256, paginas, source_version, source_updated_at, projected_at
  )
  select
    p_org,
    r ->> 'id',
    p_tag,
    nullif(btrim(coalesce(r ->> 'codigo', '')), ''),
    nullif(btrim(coalesce(r ->> 'nome', '')), ''),
    nullif(btrim(coalesce(r ->> 'tipo', '')), ''),
    nullif(btrim(coalesce(r ->> 'status', '')), ''),
    nullif(btrim(coalesce(r ->> 'phNome', '')), ''),
    public.f9_data(r ->> 'emissao'),
    public.f9_data(r ->> 'validade'),
    public.f9_data(r ->> 'proximaInspecaoInterna'),
    public.f9_data(r ->> 'proximaInspecaoExterna'),
    -- `pdfRef` pode ser objeto (RefFoto) ou string. Guardamos a forma textual;
    -- resolver o arquivo continua sendo trabalho do cliente, no clique.
    case when jsonb_typeof(r -> 'pdfRef') = 'object' then (r -> 'pdfRef') ->> 'caminho'
         else nullif(r ->> 'pdfRef', '') end,
    nullif(r ->> 'sha256', ''),
    case when (r ->> 'paginas') ~ '^\d+$' then (r ->> 'paginas')::integer else null end,
    v_versao,
    v_atual,
    now()
  from jsonb_array_elements(v_lista) r
  where coalesce(r ->> 'id', '') <> ''
  on conflict (org_id, relatorio_id) do update set
    tag = excluded.tag, codigo = excluded.codigo, nome = excluded.nome,
    tipo = excluded.tipo, status = excluded.status, profissional = excluded.profissional,
    emissao = excluded.emissao, validade = excluded.validade,
    proxima_inspecao_interna = excluded.proxima_inspecao_interna,
    proxima_inspecao_externa = excluded.proxima_inspecao_externa,
    pdf_ref = excluded.pdf_ref, sha256 = excluded.sha256, paginas = excluded.paginas,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    projected_at = excluded.projected_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- RECONSTRUÇÃO — idempotente, paginada, retomável, observável
-- ---------------------------------------------------------------------------
-- Chame repetidamente com a mesma org até `processadas = 0`. O cursor fica em
-- `busca_rebuild_estado`; parar é só deixar de chamar, e retomar é chamar de
-- novo. Cada lote é uma transação: não existe estado pela metade.
--
-- NÃO apaga o que não reconheceu (mesma regra do §2-ter): remoção só acontece
-- quando a chave de origem sumiu, e aí é `projetar_*` quem apaga.
create or replace function public.reconstruir_indice_busca(p_org uuid, p_lote integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etapa   text;
  v_cursor  text;
  v_tag     text;
  v_n       integer := 0;
  v_inicio  timestamptz := clock_timestamp();
  v_ultima  text;
begin
  if p_lote is null or p_lote < 1 then p_lote := 1000; end if;

  insert into public.busca_rebuild_estado (org_id) values (p_org)
    on conflict (org_id) do nothing;
  select etapa, ultima_chave into v_etapa, v_cursor
    from public.busca_rebuild_estado where org_id = p_org;

  if v_etapa = 'concluido' then
    -- NAO-OP EXPLICITO. Chamar o rebuild com o cursor no fim nao faz nada, e um
    -- 'processadas: 0' seco parece sucesso. Quem quer REPARAR usa
    -- reparar_divergencias(); quem quer refazer TUDO chama
    -- reiniciar_rebuild_busca() antes. Descoberto pelo teste de cascata da 9B.
    return jsonb_build_object('etapa','concluido','processadas',0,'ms',0,
      'aviso','cursor no fim: nada foi feito. Use reparar_divergencias() para reparar, ou reiniciar_rebuild_busca() para refazer do zero.');
  end if;

  if v_etapa = 'equipamentos' then
    for v_tag in
      select substring(s.chave from 11)          -- len('nr13_info_') = 10
        from public.app_storage s
       where s.org_id = p_org
         and s.chave like 'nr13_info_%'
         and s.deletado_em is null
         and s.chave > v_cursor
       order by s.chave
       limit p_lote
    loop
      perform public.projetar_equipamento(p_org, v_tag);
      v_ultima := 'nr13_info_' || v_tag;
      v_n := v_n + 1;
    end loop;

    if v_n = 0 then
      -- Fim dos equipamentos: passa para os relatórios, cursor zerado.
      update public.busca_rebuild_estado
         set etapa = 'relatorios', ultima_chave = '', atualizado_em = now()
       where org_id = p_org;
      return jsonb_build_object('etapa','equipamentos->relatorios','processadas',0,
                                'ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
    end if;

    update public.busca_rebuild_estado
       set ultima_chave = v_ultima, processadas = processadas + v_n, atualizado_em = now()
     where org_id = p_org;

    return jsonb_build_object('etapa','equipamentos','processadas',v_n,
                              'ultima_chave',v_ultima,
                              'ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
  end if;

  -- etapa = 'relatorios'
  for v_tag in
    select substring(s.chave from 23)            -- len('nr13_historico_indice_') = 22
      from public.app_storage s
     where s.org_id = p_org
       and s.chave like 'nr13_historico_indice_%'
       and s.deletado_em is null
       and s.chave > v_cursor
     order by s.chave
     limit p_lote
  loop
    perform public.projetar_relatorios(p_org, v_tag);
    v_ultima := 'nr13_historico_indice_' || v_tag;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    update public.busca_rebuild_estado
       set etapa = 'concluido', atualizado_em = now()
     where org_id = p_org;
    return jsonb_build_object('etapa','concluido','processadas',0,
                              'ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
  end if;

  update public.busca_rebuild_estado
     set ultima_chave = v_ultima, processadas = processadas + v_n, atualizado_em = now()
   where org_id = p_org;

  return jsonb_build_object('etapa','relatorios','processadas',v_n,
                            'ultima_chave',v_ultima,
                            'ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
end;
$$;

/** Zera o cursor para recomeçar do início. Não apaga projeção — o upsert cuida. */
create or replace function public.reiniciar_rebuild_busca(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.busca_rebuild_estado (org_id, etapa, ultima_chave, processadas)
  values (p_org, 'equipamentos', '', 0)
  on conflict (org_id) do update
    set etapa = 'equipamentos', ultima_chave = '', processadas = 0,
        iniciado_em = now(), atualizado_em = now();
$$;

-- ---------------------------------------------------------------------------
-- REPARO — consome as pendências
-- ---------------------------------------------------------------------------
create or replace function public.reparar_pendencias(p_org uuid, p_lote integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_tag    text;
  v_ok     integer := 0;
  v_falhou integer := 0;
begin
  for r in
    select chave from public.busca_pendencias
     where org_id = p_org order by criado_em limit coalesce(p_lote, 200)
  loop
    begin
      if r.chave like 'nr13_historico_indice_%' then
        v_tag := substring(r.chave from 23);
        perform public.projetar_relatorios(p_org, v_tag);
      else
        -- Qualquer chave de TAG reprojeta o equipamento inteiro: é mais barato
        -- do que mapear chave→campo, e converge do mesmo jeito.
        v_tag := regexp_replace(r.chave, '^nr13_[a-z_]+_', '');
        perform public.projetar_equipamento(p_org, v_tag);
      end if;
      delete from public.busca_pendencias where org_id = p_org and chave = r.chave;
      v_ok := v_ok + 1;
    exception when others then
      update public.busca_pendencias
         set tentativas = tentativas + 1, motivo = sqlerrm
       where org_id = p_org and chave = r.chave;
      v_falhou := v_falhou + 1;
    end;
  end loop;
  return jsonb_build_object('reparadas', v_ok, 'falharam', v_falhou);
end;
$$;

-- ---------------------------------------------------------------------------
-- AUDITORIA — a GARANTIA de convergência (invariante I3)
-- ---------------------------------------------------------------------------
-- NÃO lê `busca_pendencias`. Compara a projeção direto com a verdade, então
-- detecta divergência mesmo que o mecanismo de pendência nunca tenha
-- funcionado — inclusive escrita feita pela porta de manutenção.
--
-- Zero em tudo = prova de convergência. É o critério do portão P9.1.
create or replace function public.auditar_projecao(p_org uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with verdade as (
    select substring(chave from 11) as tag, versao
      from public.app_storage
     where org_id = p_org and chave like 'nr13_info_%' and deletado_em is null
  ),
  proj as (
    select tag, source_version from public.equipamentos_index where org_id = p_org
  ),
  -- RELATORIOS: compara a CONTAGEM esperada com a projetada, nao a presenca da
  -- TAG. Descoberto no teste de cascata da 9B: um indice legitimamente VAZIO
  -- ([] — equipamento sem relatorio ainda) nao produz linha nenhuma, e a
  -- comparacao por presenca o acusaria de divergente PARA SEMPRE.
  verdade_rel as (
    select substring(chave from 23) as tag,
           versao,
           case when jsonb_typeof(public.f9_json(valor)) = 'array'
                then jsonb_array_length(public.f9_json(valor)) else 0 end as esperados
      from public.app_storage
     where org_id = p_org and chave like 'nr13_historico_indice_%' and deletado_em is null
  ),
  proj_rel as (
    select tag, max(source_version) as source_version, count(*) as projetados
      from public.relatorios_index where org_id = p_org group by tag
  )
  select jsonb_build_object(
    'org', p_org,
    'equipamentos', jsonb_build_object(
      'na_verdade',   (select count(*) from verdade),
      'na_projecao',  (select count(*) from proj),
      'faltando',     (select count(*) from verdade v left join proj p using (tag) where p.tag is null),
      'sobrando',     (select count(*) from proj p left join verdade v using (tag) where v.tag is null),
      'defasadas',    (select count(*) from verdade v join proj p using (tag) where p.source_version <> v.versao)
    ),
    'relatorios', jsonb_build_object(
      'tags_na_verdade',  (select count(*) from verdade_rel),
      'tags_na_projecao', (select count(*) from proj_rel),
      'faltando',  (select count(*) from verdade_rel v left join proj_rel p using (tag) where v.esperados > 0 and coalesce(p.projetados,0) <> v.esperados),
      'sobrando',  (select count(*) from proj_rel p left join verdade_rel v using (tag) where v.tag is null),
      'defasadas', (select count(*) from verdade_rel v join proj_rel p using (tag) where p.source_version <> v.versao)
    ),
    'pendencias', (select count(*) from public.busca_pendencias where org_id = p_org),
    'convergiu', (
      (select count(*) from verdade v left join proj p using (tag) where p.tag is null) = 0
      and (select count(*) from proj p left join verdade v using (tag) where v.tag is null) = 0
      and (select count(*) from verdade v join proj p using (tag) where p.source_version <> v.versao) = 0
      and (select count(*) from verdade_rel v left join proj_rel p using (tag) where v.esperados > 0 and coalesce(p.projetados,0) <> v.esperados) = 0
      and (select count(*) from proj_rel p left join verdade_rel v using (tag) where v.tag is null) = 0
      and (select count(*) from verdade_rel v join proj_rel p using (tag) where p.source_version <> v.versao) = 0
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Permissões — manutenção não é operação de usuário
-- ---------------------------------------------------------------------------
revoke all on function public.projetar_equipamento(uuid, text)          from public, anon, authenticated;
revoke all on function public.projetar_relatorios(uuid, text)           from public, anon, authenticated;
revoke all on function public.reconstruir_indice_busca(uuid, integer)   from public, anon, authenticated;
revoke all on function public.reiniciar_rebuild_busca(uuid)             from public, anon, authenticated;
revoke all on function public.reparar_pendencias(uuid, integer)         from public, anon, authenticated;
revoke all on function public.auditar_projecao(uuid)                    from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RECONCILIAÇÃO DIRIGIDA — reparar exatamente o que a auditoria acusou
-- ---------------------------------------------------------------------------
-- NASCEU DE UM DEFEITO ENCONTRADO PELO TESTE DE FALHA EM CASCATA (9B).
--
-- Sem esta função, reparar uma divergência sem pendência exigia
-- `reiniciar_rebuild_busca` + varrer a organização inteira. E havia uma
-- armadilha pior: chamar `reconstruir_indice_busca` com o cursor já em
-- `concluido` devolve `{"processadas": 0}` e **não faz nada** — parece sucesso.
-- É a mesma classe de defeito (no-op silencioso) que a Fase 8 achou três vezes
-- na ferramenta de limpeza.
--
-- Esta função ataca só as TAGs divergentes, usando a MESMA comparação da
-- auditoria: faltando, sobrando e `source_version` defasada. Idempotente, e não
-- depende de `busca_pendencias` ter funcionado.
create or replace function public.reparar_divergencias(p_org uuid, p_lote integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag  text;
  v_eq   integer := 0;
  v_rel  integer := 0;
begin
  if p_lote is null or p_lote < 1 then p_lote := 500; end if;

  -- Equipamentos: faltando, sobrando ou defasado.
  for v_tag in
    with verdade as (
      select substring(chave from 11) as tag, versao
        from public.app_storage
       where org_id = p_org and chave like 'nr13_info_%' and deletado_em is null
    ), proj as (
      select tag, source_version from public.equipamentos_index where org_id = p_org
    )
    select coalesce(v.tag, p.tag)
      from verdade v full outer join proj p using (tag)
     where v.tag is null or p.tag is null or p.source_version <> v.versao
     limit p_lote
  loop
    perform public.projetar_equipamento(p_org, v_tag);
    v_eq := v_eq + 1;
  end loop;

  -- Relatórios: mesma lógica, por TAG.
  for v_tag in
    with verdade as (
      select substring(chave from 23) as tag, versao,
             case when jsonb_typeof(public.f9_json(valor)) = 'array'
                  then jsonb_array_length(public.f9_json(valor)) else 0 end as esperados
        from public.app_storage
       where org_id = p_org and chave like 'nr13_historico_indice_%' and deletado_em is null
    ), proj as (
      select tag, max(source_version) source_version, count(*) projetados
        from public.relatorios_index where org_id = p_org group by tag
    )
    select coalesce(v.tag, p.tag)
      from verdade v full outer join proj p using (tag)
     where p.tag is null and v.esperados > 0
        or v.tag is null
        or p.source_version <> v.versao
        or coalesce(p.projetados,0) <> v.esperados
     limit p_lote
  loop
    perform public.projetar_relatorios(p_org, v_tag);
    v_rel := v_rel + 1;
  end loop;

  return jsonb_build_object('equipamentos_reparados', v_eq, 'relatorios_reparados', v_rel);
end;
$$;

revoke all on function public.reparar_divergencias(uuid, integer) from public, anon, authenticated;
