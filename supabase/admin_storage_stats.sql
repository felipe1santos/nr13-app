-- ============================================================================
-- admin_storage_stats.sql — peso do BUCKET por organização (Fase 2, 16/08/2026)
-- Rodar no SQL Editor do Supabase (idempotente: create or replace).
--
-- Responde a pergunta que o Painel Admin não sabia responder: quanto cada
-- organização ocupa em arquivos, e em quê. Sem isso, "o egress estourou" é uma
-- frase; com isso, é uma linha do ranking.
--
-- ─── O QUE ESTA FUNÇÃO LÊ, E O QUE ELA NUNCA LÊ ─────────────────────────────
--
-- Lê `storage.objects`, que guarda METADADOS: nome do arquivo, tamanho, datas.
-- Nenhuma coluna desta função devolve conteúdo de arquivo, nome de equipamento,
-- TAG ou qualquer dado de negócio — só contagem e bytes agregados por pasta.
-- A visão cruzada de organizações é privilégio de `admin` da plataforma, que já
-- existe; a guarda é a mesma de `admin_usage_stats()`.
--
-- ─── COMO O PATH SE TRADUZ EM ORGANIZAÇÃO E EM PASTA ────────────────────────
--
-- `fotos.montarPath()` grava sempre `<org>/<escopo>/<arquivo>`:
--
--   <org>/relatorios/<uuid>.pdf            PDF imutável do relatório (§7-quater)
--   <org>/assinaturas/<hash>.png           rubricas
--   <org>/certificados/<hash>.pdf          certificados de calibração
--   <org>/<TAG>/<uuid>.jpg                 fotos de campo e de equipamento
--
-- Logo: `split_part(name, '/', 1)` é a organização e `split_part(name, '/', 2)`
-- é a pasta. Tudo que não é uma das três pastas nomeadas é foto de equipamento
-- — inclusive pastas de TAG que não existem mais, e é assim que se enxerga
-- órfão de equipamento excluído.
--
-- ARMADILHA: `metadata->>'size'` pode vir nulo em objeto recém-criado ou vindo
-- de upload interrompido. `coalesce(...,0)` em toda soma — um nulo aqui zeraria
-- a soma inteira da organização e a leitura passaria despercebida.
-- ============================================================================

create or replace function public.admin_storage_stats()
returns table (
  escopo             uuid,
  arquivos           int,
  bytes              bigint,
  bytes_relatorios   bigint,
  bytes_assinaturas  bigint,
  bytes_certificados bigint,
  bytes_fotos        bigint,
  pdfs               int,
  pdf_bytes_medio    bigint,
  fotos              int,
  foto_bytes_medio   bigint
)
language plpgsql
security definer
-- `storage` no search_path: sem ele a função não enxerga `storage.objects` e
-- falha com "relation does not exist" só na hora da chamada.
set search_path = public, storage
as $$
begin
  -- Guarda: apenas admin da plataforma. Antes de qualquer leitura.
  if not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'admin') then
    raise exception 'acesso negado';
  end if;

  return query
  with obj as (
    select
      split_part(o.name, '/', 1)                          as org_txt,
      split_part(o.name, '/', 2)                          as pasta,
      coalesce((o.metadata ->> 'size')::bigint, 0)        as tam,
      lower(o.name)                                       as nome
    from storage.objects o
    where o.bucket_id = 'inspecao'
      and o.name like '%/%'
  ),
  -- Só o que tem uuid de organização no começo. Path fora do padrão (upload
  -- manual pelo painel, resíduo de teste) é ignorado aqui em vez de derrubar o
  -- cast — e continua visível no painel do Supabase, que é onde ele deve ser
  -- investigado.
  val as (
    select o.*, o.org_txt::uuid as org
    from obj o
    where o.org_txt ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select
    v.org                                                                          as escopo,
    count(*)::int                                                                  as arquivos,
    coalesce(sum(v.tam), 0)::bigint                                                as bytes,
    coalesce(sum(v.tam) filter (where v.pasta = 'relatorios'), 0)::bigint          as bytes_relatorios,
    coalesce(sum(v.tam) filter (where v.pasta = 'assinaturas'), 0)::bigint         as bytes_assinaturas,
    coalesce(sum(v.tam) filter (where v.pasta = 'certificados'), 0)::bigint        as bytes_certificados,
    coalesce(sum(v.tam) filter (where v.pasta not in ('relatorios','assinaturas','certificados')), 0)::bigint as bytes_fotos,
    count(*) filter (where v.nome like '%.pdf')::int                               as pdfs,
    coalesce(
      (sum(v.tam) filter (where v.nome like '%.pdf'))
      / nullif(count(*) filter (where v.nome like '%.pdf'), 0), 0)::bigint         as pdf_bytes_medio,
    count(*) filter (where v.nome ~ '\.(jpg|jpeg|png|webp)$')::int                 as fotos,
    coalesce(
      (sum(v.tam) filter (where v.nome ~ '\.(jpg|jpeg|png|webp)$'))
      / nullif(count(*) filter (where v.nome ~ '\.(jpg|jpeg|png|webp)$'), 0), 0)::bigint as foto_bytes_medio
  from val v
  group by v.org
  order by 3 desc;
end;
$$;

grant execute on function public.admin_storage_stats() to authenticated;
