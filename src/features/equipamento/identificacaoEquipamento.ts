import type { FotoEquipamento } from './tipos';

/**
 * Regras da FOTO DE IDENTIFICAÇÃO do equipamento (Fase 5, decisão do dono em
 * 20/08/2026), separadas do componente para poderem ser testadas — a suíte roda
 * em `environment: 'node'` e só enxerga `*.test.ts`.
 *
 * A ficha mostra UMA foto. As fotos técnicas da inspeção não são afetadas: elas
 * vivem em outra família de chave (`nr13_docs_`) e continuam podendo ser
 * várias.
 */

/**
 * Qual foto identifica o equipamento.
 *
 * É o MESMO critério que `equipamentoService`, `Equipamento.tsx`,
 * `portalService`, `PortalAtivo.tsx` e a folha `CAPA.html` já usavam desde
 * antes desta fase. Repetir o critério aqui é de propósito: se ele mudasse só
 * neste ponto, a ficha mostraria uma foto e o relatório imprimiria outra.
 */
export function identificacaoDe(fotos: FotoEquipamento[]): FotoEquipamento | null {
  return fotos.find((f) => f.isCapa) ?? fotos[0] ?? null;
}

/**
 * Troca a identificação SEM APAGAR NADA.
 *
 * As fotos anteriores perdem a marca mas continuam na lista, e o arquivo delas
 * continua no bucket. O motivo é concreto: relatório LEGADO (sem `pdfRef`) é
 * remontado a partir de `CAPA.html`, que lê `nr13_fotos_` vivo — apagar o
 * arquivo da foto trocada deixaria a capa daquele relatório sem imagem. Uma
 * referência custa ~150 bytes; a capa de um documento emitido não volta.
 */
export function comNovaIdentificacao(
  fotos: FotoEquipamento[],
  nova: FotoEquipamento,
): FotoEquipamento[] {
  return [...fotos.map((f) => ({ ...f, isCapa: false })), { ...nova, isCapa: true }];
}

/**
 * Tira a foto de identificação da ficha.
 *
 * Também não apaga arquivo. Em equipamento antigo, com fotos anteriores, a
 * última delas volta a identificar o ativo — o histórico não é destruído para
 * acomodar a interface.
 */
export function semIdentificacao(fotos: FotoEquipamento[]): FotoEquipamento[] {
  const alvo = identificacaoDe(fotos);
  if (!alvo) return fotos;
  const restantes = fotos.filter((f) => f.id !== alvo.id);
  return restantes.map((f, i) => ({ ...f, isCapa: i === restantes.length - 1 }));
}
