-- ============================================================================
-- CATEGORIA DE CALDEIRA NO CATÁLOGO = A/B (NR-13 13.4.1.1) — 23/11/2026
-- ============================================================================
--
-- ORDEM DE APLICAÇÃO (e ela importa):
--
--   1. supabase/busca_manutencao.sql  (a projeção passa a calcular A/B para caldeira)
--   2. ESTE ARQUIVO                   (corrige as linhas de caldeira já projetadas)
--
-- Nenhuma coluna nova, nenhuma RPC muda de assinatura.
--
-- O QUE MUDOU, E POR QUÊ
--
--   `equipamentos_index.categoria` copiava `nr13_cat_<TAG>.catFinal` para todo
--   equipamento. Para caldeira esse valor é o método de VASO (classe de fluido
--   × P·V → I a V), que a NR-13 não usa para caldeira. Caldeira é A ou B pela
--   PRESSÃO DE OPERAÇÃO (13.4.1.1): >= 1.960 kPa (1,96 MPa) → A; > 60 kPa e
--   < 1.960 kPa → B. Aqui a pressão é a PMO adotada da ficha
--   (`nr13_info_<TAG>.pmoAdotadaMpa`, MPa). Mesma regra de
--   `src/features/caldeira/categoriaCaldeira.ts`.
--
-- POR QUE UM BACKFILL DIRIGIDO (mesmo motivo de `prontuario_anexado_badge.sql`)
--
--   A regra mudou, a VERDADE não: `auditar_projecao()` compara `source_version`
--   e não reprojeta. Aqui só as linhas de caldeira, lendo UMA chave por TAG
--   (`nr13_info_`). `source_version` NÃO é mexida.
--
-- Idempotente. Nada é escrito em `app_storage`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · BACKFILL — só caldeiras cuja categoria projetada difere da regra
-- ---------------------------------------------------------------------------
with regra as (
  select e.org_id, e.tag,
         case
           when public.f9_num(replace(public.f9_json(s.valor) ->> 'pmoAdotadaMpa', ',', '.')) >= 1.96 then 'A'
           when public.f9_num(replace(public.f9_json(s.valor) ->> 'pmoAdotadaMpa', ',', '.')) > 0.06 then 'B'
           else null
         end as categoria
    from public.equipamentos_index e
    left join public.app_storage s
      on s.org_id = e.org_id
     and s.chave  = 'nr13_info_' || e.tag
     and s.deletado_em is null
   where e.tipo = 'caldeira'
)
update public.equipamentos_index e
   set categoria = r.categoria
  from regra r
 where e.org_id = r.org_id
   and e.tag    = r.tag
   and e.categoria is distinct from r.categoria;

-- ---------------------------------------------------------------------------
-- 2 · VERIFICAÇÃO — por ESTRUTURA, nunca pela mensagem "Success" (§13)
-- ---------------------------------------------------------------------------
-- `fora_da_regra` PRECISA vir 0: nenhuma caldeira com categoria fora de A/B.
select
  count(*)                                                        as caldeiras,
  count(*) filter (where categoria = 'A')                          as cat_a,
  count(*) filter (where categoria = 'B')                          as cat_b,
  count(*) filter (where categoria is null)                        as sem_pmo,
  count(*) filter (where categoria is not null and categoria not in ('A', 'B')) as fora_da_regra
from public.equipamentos_index
where tipo = 'caldeira';
