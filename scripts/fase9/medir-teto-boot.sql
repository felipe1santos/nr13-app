-- ============================================================================
-- FASE 9 · 9D.1 — O TETO REAL DO BOOT LEVE, MEDIDO
-- ============================================================================
--
-- Responde a pergunta que decide a lista de `src/services/essencial.ts`:
--   "quantos bytes o boot passa a baixar, e quantos ele deixa de baixar?"
--
-- SOMENTE LEITURA. Não altera nada.
--
-- A lista de famílias abaixo é a MESMA de `essencial.ts`. Se uma mudar sem a
-- outra, este número deixa de valer — confira as duas juntas.
-- ============================================================================

with vivo as (
  select org_id, chave, coalesce(length(valor), 0) as bytes
    from public.app_storage
   where deletado_em is null
),
classificado as (
  select
    org_id, chave, bytes,
    case
      when chave like 'nr13_rastreab_%'   then 'nr13_rastreab_'
      when chave like 'nr13_permissoes_%' then 'nr13_permissoes_'
      when chave in (
        'nr13_minha_empresa', 'nr13_lista_phs', 'nr13_clientes',
        'nr13_termos_aceite', 'nr13_demo_seed', 'nr13_uso_contadores',
        'nr13_agenda_notas'
      ) then chave
      else null
    end as familia
  from vivo
)
select
  org_id,
  count(*) filter (where chave like 'nr13_info_%')              as equipamentos,
  count(*)                                                       as chaves_total,
  round(sum(bytes) / 1024.0)                                     as kb_hoje_no_boot,
  count(*) filter (where familia is not null)                    as chaves_essenciais,
  round(sum(bytes) filter (where familia is not null) / 1024.0)  as kb_boot_leve,
  round(100.0 * coalesce(sum(bytes) filter (where familia is not null), 0)
              / nullif(sum(bytes), 0), 1)                        as pct_do_que_era,
  round(coalesce(sum(bytes) filter (where familia = 'nr13_rastreab_'), 0) / 1024.0)
                                                                 as kb_rastreab
from classificado
group by org_id
order by kb_hoje_no_boot desc;

-- ---------------------------------------------------------------------------
-- E o detalhe por família, somando a base inteira — para decidir com número se
-- alguma delas não deveria estar no essencial.
-- ---------------------------------------------------------------------------
with vivo as (
  select chave, coalesce(length(valor), 0) as bytes
    from public.app_storage
   where deletado_em is null
)
select
  case
    when chave like 'nr13_rastreab_%'   then 'nr13_rastreab_'
    when chave like 'nr13_permissoes_%' then 'nr13_permissoes_'
    else chave
  end                                     as familia,
  count(*)                                as chaves,
  round(sum(bytes) / 1024.0)              as kb_total,
  round(max(bytes) / 1024.0)              as kb_maior,
  round(avg(bytes) / 1024.0, 1)           as kb_media
from vivo
where chave like 'nr13_rastreab_%'
   or chave like 'nr13_permissoes_%'
   or chave in (
     'nr13_minha_empresa', 'nr13_lista_phs', 'nr13_clientes',
     'nr13_termos_aceite', 'nr13_demo_seed', 'nr13_uso_contadores',
     'nr13_agenda_notas'
   )
group by 1
order by kb_total desc;
