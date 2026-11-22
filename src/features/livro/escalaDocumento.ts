/** Escala do "Ver livro completo" (`DocumentoAjustado`). */

/** Largura de uma folha A4 a 96 dpi — a mesma do `IframeBlocoLivro`. */
export const LARGURA_FOLHA_PX = 794;

/** Escala que faz `largura` caber em `disponivel` (px). Nunca passa de 1. */
export function escalaParaCaber(disponivel: number, largura = LARGURA_FOLHA_PX): number {
  if (!Number.isFinite(disponivel) || disponivel <= 0 || largura <= 0) return 1;
  return Math.max(0.25, Math.min(1, disponivel / largura));
}
