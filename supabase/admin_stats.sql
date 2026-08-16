-- ============================================================================
-- admin_stats.sql — métricas de uso por organização para o Painel Admin
-- Rodar no SQL Editor do Supabase (idempotente: create or replace).
--
-- Devolve, por escopo (org do usuário; contas antigas = o próprio user_id):
--   equipamentos por tipo, nº de inspeções (containers), nº de relatórios
--   salvos, PDFs gerados/impressões (contador nr13_uso_contadores),
--   sub-logins criados, e — desde a Fase 2 (16/08/2026) — peso do dado:
--   bytes por organização, bytes do legado, bytes ainda em base64 e a última
--   sincronização do usuário.
--
-- Segurança: SECURITY DEFINER + guarda interna — só perfis role='admin'
-- conseguem executar; qualquer outro chamador recebe exceção. Nenhuma coluna
-- devolve `valor` de chave, conteúdo de relatório ou nome de equipamento: só
-- contagens e tamanhos.
--
-- ─── FASE 2 · POR QUE A CONTAGEM DE RELATÓRIOS MUDOU ────────────────────────
--
-- Até 16/08/2026 esta função contava relatórios assim:
--
--   sum(jsonb_array_length(valor)) where chave = 'nr13_historico_relatorios'
--
-- Essa chave é LEGADO desde 14/08/2026 (§7-sexies do CLAUDE.md): o histórico
-- passou a ser um registro por relatório, em `nr13_rel_<id>_<TAG>`, e o array
-- antigo só ENCOLHE — ele nunca mais recebe entrada nova. Consequência medida:
-- organização migrada reportava número congelado no dia da migração, e conta
-- criada depois reportava ZERO. O painel mentia.
--
-- Somar as duas fontes também estaria errado. A migração é idempotente e NÃO
-- apaga o legado (ele é backup e fallback de quem ainda não rodou o código
-- novo), então durante a convivência o MESMO relatório existe nos dois lugares
-- — e a dobra cairia justamente nas contas mais ativas.
--
-- A saída é a UNIÃO DE IDS. O id é recuperável dos dois lados:
--
--   chave nova   `nr13_rel_<id>_<TAG>`  ->  split_part(chave, '_', 3)
--   array legado `[{ id: ... }]`        ->  jsonb_array_elements ->> 'id'
--
-- `split_part` na posição 3 funciona porque `idSeguro()` (historicoRelatorios.ts)
-- troca `_` por `-` no id antes de montar a chave — o id NUNCA tem `_`, e é
-- exatamente por isso que a fronteira id/TAG é estável. O mesmo `replace` é
-- aplicado ao id do legado, senão um id antigo com `_` deixaria de casar com a
-- sua própria versão migrada e seria contado duas vezes.
-- ============================================================================

-- O DROP É OBRIGATÓRIO e não é descuido: `create or replace` recusa mudar o
-- tipo de retorno de uma função existente —
--   ERROR 42P13: cannot change return type of existing function
-- e a Fase 2 acrescenta colunas ao `returns table`. Entre o `drop` e o `create`
-- existe uma janela de milissegundos em que a função não existe; quem chamar
-- nela recebe erro. É tolerável porque a chamadora é UMA tela de admin da
-- plataforma, e o conserto é reexecutar este arquivo inteiro.
drop function if exists public.admin_usage_stats();

create or replace function public.admin_usage_stats()
returns table (
  escopo          uuid,
  equip_vaso      int,
  equip_caldeira  int,
  equip_autoclave int,
  inspecoes       int,
  relatorios      int,
  pdf_gerados     int,
  impressoes      int,
  subusuarios     int,
  -- Colunas da Fase 2. Entram no FIM de propósito: entre aplicar este SQL e
  -- redeployar o front existe uma janela em que o Admin antigo lê o resultado
  -- novo. Ele lê por nome, então acrescentar é inofensivo — reordenar não.
  relatorios_legado int,
  bytes_total       bigint,
  bytes_legado      bigint,
  chaves_total      int,
  chaves_base64     int,
  bytes_base64      bigint,
  ultima_sync       timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guarda: apenas admin da plataforma. Antes de qualquer leitura.
  if not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'admin') then
    raise exception 'acesso negado';
  end if;

  return query
  with base as (
    select coalesce(s.org_id, s.user_id) as esc, s.chave, s.valor
    from app_storage s
    where s.deletado_em is null
  ),
  -- Ids que existem como REGISTRO PRÓPRIO (modelo novo).
  ids_novos as (
    select b.esc, split_part(b.chave, '_', 3) as id
    from base b
    where b.chave like 'nr13\_rel\_%'
  ),
  -- Ids que existem dentro do ARRAY legado. `jsonb_typeof` defensivo: valor
  -- não-array (corrompido, ou de uma versão antiga) não pode derrubar a função
  -- inteira e deixar o painel sem número nenhum.
  ids_legado as (
    select b.esc, replace(coalesce(e ->> 'id', ''), '_', '-') as id
    from base b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.valor::jsonb) = 'array' then b.valor::jsonb else '[]'::jsonb end
    ) as e
    where b.chave = 'nr13_historico_relatorios'
  ),
  rel as (
    select
      u.esc,
      count(distinct u.id)::int                                as relatorios,
      count(distinct u.id) filter (where u.so_legado)::int      as relatorios_legado
    from (
      select n.esc, n.id, false as so_legado from ids_novos n where n.id <> ''
      union all
      select l.esc, l.id, not exists (
        select 1 from ids_novos n2 where n2.esc = l.esc and n2.id = l.id
      ) from ids_legado l where l.id <> ''
    ) u
    group by u.esc
  ),
  ag as (
    select
      b.esc,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'vaso')::int      as equip_vaso,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'caldeira')::int  as equip_caldeira,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'autoclave')::int as equip_autoclave,
      coalesce(sum(case when b.chave like 'nr13\_docs\_%' and jsonb_typeof(b.valor::jsonb) = 'array'
                        then jsonb_array_length(b.valor::jsonb) end), 0)::int as inspecoes,
      coalesce(max(case when b.chave = 'nr13_uso_contadores'
                        then nullif(b.valor::jsonb ->> 'pdf', '')::int end), 0)::int as pdf_gerados,
      coalesce(max(case when b.chave = 'nr13_uso_contadores'
                        then nullif(b.valor::jsonb ->> 'impressoes', '')::int end), 0)::int as impressoes,
      -- `octet_length` e NÃO `pg_column_size`: o segundo mede o datum já
      -- comprimido pelo TOAST, que serve para prever DISCO. O que estoura a
      -- cota do Supabase (e o que este painel precisa mostrar) é o byte que sai
      -- pela REDE, e esse é o descomprimido.
      coalesce(sum(octet_length(coalesce(b.valor, ''))), 0)::bigint as bytes_total,
      coalesce(sum(octet_length(coalesce(b.valor, ''))) filter (where b.chave = 'nr13_historico_relatorios'), 0)::bigint as bytes_legado,
      count(*)::int as chaves_total,
      -- PISO, não total (ver task level D2-03): casa `data:...;base64,` e
      -- `pdfBase64`, que são as duas formas reais de blob no app_storage. Não
      -- interpreta o JSON campo a campo — seria mais preciso e muito mais
      -- frágil, porque cada família de chave tem um formato.
      count(*) filter (where b.valor like '%base64,%')::int as chaves_base64,
      coalesce(sum(octet_length(coalesce(b.valor, ''))) filter (where b.valor like '%base64,%'), 0)::bigint as bytes_base64
    from base b
    group by b.esc
  ),
  subs as (
    -- Sub-logins criados na org (exclui o próprio mestre, cujo id = org_id).
    select p.org_id as esc, count(*) filter (where p.id <> p.org_id)::int as subusuarios
    from profiles p
    where p.org_id is not null
    group by p.org_id
  ),
  -- Última sincronização do MESTRE (id = org_id). É por PERFIL, não por
  -- aparelho: quem usa celular e desktop grava aqui o mais recente dos dois, e
  -- um aparelho parado com trabalho dentro não aparece. A tela precisa rotular
  -- assim — ver D-25.
  sync as (
    select p.id as esc, p.ultima_sync
    from profiles p
    where p.org_id = p.id
  )
  select
    e.esc                                as escopo,
    coalesce(ag.equip_vaso, 0),
    coalesce(ag.equip_caldeira, 0),
    coalesce(ag.equip_autoclave, 0),
    coalesce(ag.inspecoes, 0),
    coalesce(rel.relatorios, 0),
    coalesce(ag.pdf_gerados, 0),
    coalesce(ag.impressoes, 0),
    coalesce(subs.subusuarios, 0),
    coalesce(rel.relatorios_legado, 0),
    coalesce(ag.bytes_total, 0),
    coalesce(ag.bytes_legado, 0),
    coalesce(ag.chaves_total, 0),
    coalesce(ag.chaves_base64, 0),
    coalesce(ag.bytes_base64, 0),
    sync.ultima_sync
  -- Lista de escopos por UNIÃO das fontes: uma organização pode existir só em
  -- `profiles` (conta nova, nada gravado ainda) ou só em `app_storage` (conta
  -- antiga sem perfil correspondente). O `full join` de duas fontes que a
  -- versão anterior usava deixava de fora quem só aparecia numa terceira.
  from (
    select esc from ag
    union select esc from subs
    union select esc from rel
  ) e
  left join ag   on ag.esc   = e.esc
  left join subs on subs.esc = e.esc
  left join rel  on rel.esc  = e.esc
  left join sync on sync.esc = e.esc;
end;
$$;

grant execute on function public.admin_usage_stats() to authenticated;
