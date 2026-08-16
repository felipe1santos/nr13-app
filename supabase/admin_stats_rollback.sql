-- ============================================================================
-- ROLLBACK da Fase 2 — volta as métricas do Painel Admin ao estado de 16/08/2026
-- ============================================================================
-- Imediato e sem tocar em dado: são funções de LEITURA, trocadas por
-- `create or replace`. O Admin lê as colunas por nome, com fallback '—', então
-- ele tolera as colunas novas sumirem — volta a mostrar traço nas células da
-- Fase 2 até o front ser redeployado.
--
-- ATENÇÃO ao efeito colateral do rollback: a contagem de relatórios volta a
-- vir de `nr13_historico_relatorios`, ou seja, volta a MENTIR (congelada para
-- organização migrada, zero para conta nova). Reverter aqui é aceitar isso de
-- novo — só faz sentido se a versão nova estiver dando número errado, e nesse
-- caso o número certo é o da contagem manual, não o do legado.
-- ============================================================================

drop function if exists public.admin_storage_stats();

-- Mesmo motivo do arquivo de ida: o rollback ENCOLHE o `returns table`, e
-- `create or replace` recusa mudar o tipo de retorno (ERROR 42P13).
drop function if exists public.admin_usage_stats();

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
