/**
 * ACABAMENTO VISUAL do relatório de caldeira (23/11/2026, pedido do dono).
 *
 * Só desenho — nenhum dado. Três peças, usadas no SUMÁRIO e nas FOLHAS
 * DIVISÓRIAS (4 · certificados, 5 · prontuário de fabricação, 6 · ART):
 *
 * - paleta ardósia que conversa com o cinza claro das faixas (`#d9d9d9`);
 * - marca d'água bem leve (o número da seção na divisória, "NR-13" no sumário),
 *   desenhada ANTES do conteúdo para ficar por baixo dele;
 * - quadradinhos discretos no canto inferior direito, acima do rodapé.
 *
 * As cores são claras de propósito: impresso em preto e branco o documento
 * continua limpo, e nada disto compete com a informação técnica.
 */
import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import { CAIXA, LIMITE_CORPO } from './documentoA4';

export const ARDOSIA = {
  /** Destaque: números e títulos do índice, faixa da divisória. */
  forte: '#4F5D6E',
  medio: '#8A97A8',
  claro: '#C9D1DB',
  suave: '#E3E8EE',
  /** Marca d'água: quase o branco do papel. */
  marca: '#F1F3F6',
  /** Pontilhado do índice. */
  pontilhado: '#C3C9D1',
} as const;

/** Quadradinhos no canto inferior direito da área útil, acima do rodapé. */
export function quadradinhos(pdf: jsPDF): void {
  const lado = 3.2;
  const passo = 4.4;
  const direita = CAIXA.x + CAIXA.largura;
  const base = LIMITE_CORPO - 4;
  // Uma "escada" de 3 × 2 que se esvazia para a esquerda e para cima.
  const celulas: { col: number; lin: number; cor: string }[] = [
    { col: 0, lin: 0, cor: ARDOSIA.forte },
    { col: 1, lin: 0, cor: ARDOSIA.medio },
    { col: 2, lin: 0, cor: ARDOSIA.claro },
    { col: 0, lin: 1, cor: ARDOSIA.claro },
    { col: 1, lin: 1, cor: ARDOSIA.suave },
    { col: 0, lin: 2, cor: ARDOSIA.suave },
  ];
  for (const c of celulas) {
    pdf.setFillColor(c.cor);
    pdf.rect(direita - lado - c.col * passo, base - lado - c.lin * passo, lado, lado, 'F');
  }
}

/** Texto grande e claríssimo, centralizado num ponto (com ou sem giro). */
export function marcaDagua(pdf: jsPDF, texto: string, cx: number, cy: number, tamanhoPt: number, angulo = 0): void {
  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(tamanhoPt);
  pdf.setTextColor(ARDOSIA.marca);
  const largura = pdf.getTextWidth(texto);
  const rad = (angulo * Math.PI) / 180;
  // jsPDF gira em torno do ponto de ancoragem (início da linha de base):
  // desloca a âncora para o centro do texto cair em (cx, cy).
  const alturaMm = tamanhoPt * 0.3528 * 0.7;
  const x = cx - (Math.cos(rad) * largura) / 2 - (Math.sin(rad) * alturaMm) / 2;
  const y = cy + (Math.sin(rad) * largura) / 2 + (Math.cos(rad) * alturaMm) / 2;
  pdf.text(texto, x, y, angulo ? { angle: angulo } : undefined);
}

/** Linha pontilhada (pontos redondos) de x1 a x2 na altura y. */
export function pontilhado(pdf: jsPDF, x1: number, x2: number, y: number): void {
  if (x2 - x1 < 3) return;
  pdf.setFillColor(ARDOSIA.pontilhado);
  const passo = 1.25;
  for (let x = x1 + 0.6; x <= x2 - 0.6; x += passo) pdf.circle(x, y, 0.17, 'F');
}
