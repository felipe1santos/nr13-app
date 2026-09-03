/**
 * `/equipamentos` — a lista do parque.
 *
 * ## Por que este arquivo é só um repasse (9G.3, 03/09/2026)
 *
 * Até a Fase 9 esta tela tinha DUAS implementações: a legada, que hidratava a
 * organização inteira (`listarEquipamentos()` → `lerTudo()`) e filtrava em
 * memória, e a nova, que lê da projeção com busca no servidor. A flag
 * `busca_v9` escolhia entre as duas.
 *
 * O rollout terminou com a flag ligada nas 30 organizações, o gate global
 * passou, e o caminho legado foi REMOVIDO. Não há mais o que escolher: a
 * projeção é a fonte, e `app_storage` continua sendo a verdade de onde ela
 * deriva.
 *
 * O componente mora em `features/equipamento/EquipamentosV9.tsx`, e sempre
 * morou lá — de propósito, para que a remoção do legado não pudesse derrubar a
 * tela nova junto.
 */
import EquipamentosV9 from '../features/equipamento/EquipamentosV9';

export default function Equipamentos() {
  return <EquipamentosV9 />;
}
