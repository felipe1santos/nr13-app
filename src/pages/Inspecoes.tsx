/**
 * `/inspecoes` — o catálogo de equipamentos e os containers de inspeção.
 *
 * ## Por que este arquivo é só um repasse (9G.3, 03/09/2026)
 *
 * Até a Fase 9 esta tela tinha DUAS implementações: a legada, cuja lista vinha
 * inteira de `listarEquipamentos()` (logo, `lerTudo()`) e não tinha busca, e a
 * nova, com o catálogo do servidor, busca e a contagem de inspeções lida da
 * projeção. A flag `inspecoes_v9` escolhia entre as duas.
 *
 * O rollout terminou com a flag ligada nas 30 organizações, o gate global
 * passou, e o caminho legado foi REMOVIDO.
 *
 * `InspecoesV9` cobre os dois modos da tela antiga — a lista de equipamentos e
 * a de containers de uma TAG, inclusive a entrada por `?tag=` na URL —, e o
 * cartão do container segue em `features/inspecoes/ContainerCard.tsx`, que
 * sempre foi compartilhado.
 */
import InspecoesV9 from '../features/inspecoes/InspecoesV9';

export default function Inspecoes() {
  return <InspecoesV9 />;
}
