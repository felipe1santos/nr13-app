-- ============================================================================
-- BADGE DE PRONTUÁRIO INCLUI O PDF ANEXADO — 19/09/2026
-- ============================================================================
--
-- ORDEM DE APLICAÇÃO (e ela importa):
--
--   1. supabase/busca_manutencao.sql  (a projeção passa a olhar as duas chaves)
--   2. ESTE ARQUIVO                   (retroalimenta as linhas já projetadas)
--
-- Nenhuma coluna nova, nenhuma RPC muda de assinatura: `busca_index.sql` e
-- `busca_consulta.sql` NÃO precisam ser rodados.
--
-- O QUE MUDOU, E POR QUÊ
--
--   `equipamentos_index.tem_prontuario` era a existência de UMA chave,
--   `nr13_prontuario_<TAG>` — os DADOS do documento que o sistema monta.
--
--   Desde 19/09/2026 um prontuário também pode entrar PRONTO, em PDF: o
--   arquivo que o cliente já tinha, anexado ao equipamento. Ele grava
--   `nr13_pront_emitido_<TAG>` (a lista de documentos daquele equipamento) e
--   NÃO grava `nr13_prontuario_<TAG>` — de propósito: não há OCR nem extração,
--   e inventar os dados do documento a partir do PDF seria fazer o anexo se
--   passar pelo prontuário gerado aqui (ver `src/features/prontuarios/
--   anexoProntuario.ts`).
--
--   Sem esta mudança o catálogo de equipamentos escrevia "Sem Prontuário"
--   sobre um equipamento cuja lista de `/prontuarios` mostra um documento —
--   duas telas do mesmo sistema afirmando coisas opostas sobre a mesma TAG.
--
-- POR QUE UM BACKFILL DIRIGIDO, E NÃO `reiniciar_rebuild_busca()`
--
--   A regra mudou, a VERDADE não. `auditar_projecao()` compara
--   `source_version`, então a linha antiga parece convergida e ninguém a
--   reprojeta; `reconstruir_indice_busca()` com o cursor em `concluido`
--   devolve `{"processadas": 0}`. O mesmo motivo de
--   `pressoes_adotadas_catalogo.sql`.
--
--   Reprojetar a organização inteira relê 10 chaves por TAG e já custou cota
--   de egresso cara (§12 do CLAUDE.md). Aqui o dado sai da EXISTÊNCIA de uma
--   chave, e o `update` toca uma coluna booleana.
--
--   `source_version` NÃO é mexida: ela é a versão da verdade que a linha
--   reflete, e este arquivo não muda o que a linha reflete — corrige o que a
--   regra antiga deixou de fora. Mexer nela faria a auditoria acusar
--   defasagem onde não há.
--
-- O QUE ELE NÃO FAZ
--
--   Não escreve `false` onde está `null`. `null` é "esta organização nunca foi
--   projetada", e é o que impede o badge de afirmar ausência sobre um parque
--   que ninguém verificou (9F.2.2). Transformá-lo em `false` aqui seria trocar
--   "não sei" por "não tem" em massa.
--
-- Idempotente. Rodar duas vezes escreve o mesmo valor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · BACKFILL — só as TAGs que têm documento de prontuário e badge negativo
-- ---------------------------------------------------------------------------
update public.equipamentos_index e
   set tem_prontuario = true
 where e.tem_prontuario is false
   and exists (
     select 1 from public.app_storage s
      where s.org_id = e.org_id
        and s.chave  = 'nr13_pront_emitido_' || e.tag
        and s.deletado_em is null
   );

-- ---------------------------------------------------------------------------
-- 2 · VERIFICAÇÃO — por ESTRUTURA, nunca pela mensagem "Success" (§13)
-- ---------------------------------------------------------------------------
-- `divergentes` PRECISA vir 0: nenhuma linha JÁ PROJETADA (`tem_prontuario`
-- não nulo) pode discordar da existência das duas chaves. As linhas nulas
-- ficam de fora da conta de propósito — ver "O QUE ELE NÃO FAZ".
select
  count(*)                                        as linhas,
  count(*) filter (where e.tem_prontuario)        as com_prontuario,
  count(*) filter (where e.tem_prontuario is null) as nao_projetadas,
  count(*) filter (
    where e.tem_prontuario is not null
      and e.tem_prontuario is distinct from exists (
        select 1 from public.app_storage s
         where s.org_id = e.org_id
           and s.chave in ('nr13_prontuario_' || e.tag, 'nr13_pront_emitido_' || e.tag)
           and s.deletado_em is null
      )
  )                                               as divergentes
from public.equipamentos_index e;
