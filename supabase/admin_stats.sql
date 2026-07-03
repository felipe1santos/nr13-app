-- ============================================================================
-- admin_stats.sql — métricas de uso por usuário para o Painel Admin
-- Rodar no SQL Editor do Supabase (idempotente: create or replace).
--
-- Devolve, por escopo (org do usuário; contas antigas = o próprio user_id):
--   equipamentos por tipo, nº de inspeções (containers), nº de relatórios
--   salvos, PDFs gerados/impressões (contador nr13_uso_contadores) e
--   quantidade de sub-logins criados (tela Acessos).
--
-- Segurança: SECURITY DEFINER + guarda interna — só perfis role='admin'
-- conseguem executar; qualquer outro chamador recebe exceção.
-- ============================================================================

create or replace function public.admin_usage_stats()
returns table (
  escopo        uuid,
  equip_vaso    int,
  equip_caldeira int,
  equip_autoclave int,
  inspecoes     int,
  relatorios    int,
  pdf_gerados   int,
  impressoes    int,
  subusuarios   int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guarda: apenas admin da plataforma.
  if not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'admin') then
    raise exception 'acesso negado';
  end if;

  return query
  with base as (
    select coalesce(s.org_id, s.user_id) as esc, s.chave, s.valor
    from app_storage s
  ),
  ag as (
    select
      b.esc,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'vaso')::int      as equip_vaso,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'caldeira')::int  as equip_caldeira,
      count(*) filter (where b.chave like 'nr13\_info\_%' and (b.valor::jsonb ->> 'tipo') = 'autoclave')::int as equip_autoclave,
      coalesce(sum(case when b.chave like 'nr13\_docs\_%' and jsonb_typeof(b.valor::jsonb) = 'array'
                        then jsonb_array_length(b.valor::jsonb) end), 0)::int as inspecoes,
      coalesce(sum(case when b.chave = 'nr13_historico_relatorios' and jsonb_typeof(b.valor::jsonb) = 'array'
                        then jsonb_array_length(b.valor::jsonb) end), 0)::int as relatorios,
      coalesce(max(case when b.chave = 'nr13_uso_contadores'
                        then nullif(b.valor::jsonb ->> 'pdf', '')::int end), 0)::int as pdf_gerados,
      coalesce(max(case when b.chave = 'nr13_uso_contadores'
                        then nullif(b.valor::jsonb ->> 'impressoes', '')::int end), 0)::int as impressoes
    from base b
    group by b.esc
  ),
  subs as (
    -- Sub-logins criados na org (exclui o próprio mestre, cujo id = org_id).
    select p.org_id as esc, count(*) filter (where p.id <> p.org_id)::int as subusuarios
    from profiles p
    where p.org_id is not null
    group by p.org_id
  )
  select
    coalesce(ag.esc, subs.esc)          as escopo,
    coalesce(ag.equip_vaso, 0),
    coalesce(ag.equip_caldeira, 0),
    coalesce(ag.equip_autoclave, 0),
    coalesce(ag.inspecoes, 0),
    coalesce(ag.relatorios, 0),
    coalesce(ag.pdf_gerados, 0),
    coalesce(ag.impressoes, 0),
    coalesce(subs.subusuarios, 0)
  from ag
  full join subs on subs.esc = ag.esc;
end;
$$;

grant execute on function public.admin_usage_stats() to authenticated;
