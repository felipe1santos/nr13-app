import { pendenciasParaEmissao } from '../inspecoes/fotosDescritas';

/**
 * Fase 5.2 · a regra de EMISSÃO do Relatório de Imagens vale também quando ele
 * entra no relatório NR-13 completo (seção 8.4).
 *
 * O avulso não baixa nem imprime sem ao menos uma foto e todas descritas. Se o
 * relatório completo finalizasse com a mesma seção faltando descrição, a regra
 * do ensaio valeria num documento e não no outro — e o assinado é justamente o
 * relatório. Rascunho continua livre: isto só é cobrado ao FINALIZAR.
 *
 * Seção não escolhida = nada é cobrado (relatório sem imagens segue como era).
 */
export const FOLHA_RELATORIO_IMAGENS = 'RELATORIO-IMAGENS.html';

export function impedimentoRelatorioImagens(
  documentos: readonly string[] | null | undefined,
  dadosContainer: Record<string, unknown> | null | undefined,
): string | null {
  const escolhida = (documentos ?? []).some((d) => d.split('?')[0] === FOLHA_RELATORIO_IMAGENS);
  if (!escolhida) return null;
  const fotos = (dadosContainer?.imagens as { fotos?: unknown } | undefined)?.fotos;
  const pend = pendenciasParaEmissao(fotos);
  if (pend.length === 0) return null;
  return `Relatório de Imagens (8.4) incluído no relatório: ${pend.map((p) => p.mensagem).join(' ')} Complete no ensaio ou retire a seção antes de finalizar.`;
}
