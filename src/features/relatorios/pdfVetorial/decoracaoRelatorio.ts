/**
 * ACABAMENTO VISUAL dos relatórios (23/11/2026, pedido do dono) — nasceu na
 * caldeira e vale para vaso e autoclave também.
 *
 * Só desenho — nenhum dado. Usado no SUMÁRIO (índice pontilhado) e nas FOLHAS
 * DIVISÓRIAS / capas de seção (caldeira: 4, 5, 6; vaso e autoclave: 13 ·
 * anexos):
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
import { CAIXA, COR, LIMITE_CORPO } from './documentoA4';

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

export interface ItemIndice {
  numero: string;
  titulo: string;
  /** Número da página; `null` = a seção não está no documento ("—"). */
  pagina: number | null;
}

/**
 * O ÍNDICE: número e título à esquerda (subitem recuado, número em ardósia),
 * pontilhado cinza claro até a página em negrito à direita. Item "principal" =
 * número sem ponto (1, 2…). Devolve o y depois da última linha.
 */
export function desenharIndice(
  pdf: jsPDF,
  itens: ItemIndice[],
  yInicial: number,
  passo: number,
  escala = 1,
  /** Item principal em MAIÚSCULAS (caldeira). O vaso mantém o título como a referência escreve. */
  maiusculas = true,
): number {
  const x0 = CAIXA.x;
  const x1 = CAIXA.x + CAIXA.largura;
  let y = yInicial;
  for (const it of itens) {
    const principal = !it.numero.includes('.');
    const base = y + passo * 0.62;
    const nivel = it.numero.split('.').length - 1;
    const recuo = Math.min(nivel, 2) * 9;
    const tamanho = (principal ? 11 : 10) * escala;

    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(tamanho);
    pdf.setTextColor(principal ? ARDOSIA.forte : ARDOSIA.medio);
    pdf.text(it.numero, x0 + recuo, base);

    const xTitulo = x0 + recuo + (principal ? 9 : 11) * escala + (nivel > 1 ? 2 : 0);
    pdf.setFont(FAMILIA, principal ? 'bold' : 'normal');
    pdf.setTextColor(COR.texto);
    const titulo = principal && maiusculas ? it.titulo.toUpperCase() : it.titulo;
    pdf.text(titulo, xTitulo, base);
    const fimTitulo = xTitulo + pdf.getTextWidth(titulo);

    const pagina = it.pagina !== null ? String(it.pagina) : '—';
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(tamanho);
    pdf.setTextColor(it.pagina !== null ? COR.texto : ARDOSIA.medio);
    pdf.text(pagina, x1, base, { align: 'right' });
    pontilhado(pdf, fimTitulo + 2, x1 - pdf.getTextWidth(pagina) - 2, base - 0.5);
    y += passo;
  }
  return y;
}

/** O título "SUMÁRIO" com o filete e a faixa curta de destaque. Devolve o y seguinte. */
export function tituloSumario(pdf: jsPDF, y0: number, texto = 'SUMÁRIO'): number {
  const x0 = CAIXA.x;
  const x1 = CAIXA.x + CAIXA.largura;
  let y = y0 + 4;
  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(ARDOSIA.forte);
  pdf.text(texto, x0, y + 6, { charSpace: 0.6 });
  y += 10;
  pdf.setDrawColor(ARDOSIA.suave);
  pdf.setLineWidth(0.35);
  pdf.line(x0, y, x1, y);
  pdf.setFillColor(ARDOSIA.forte);
  pdf.rect(x0, y - 0.6, 26, 1.2, 'F');
  return y + 5;
}

/**
 * CAPA DE SEÇÃO: o número grande como marca d'água, o título no meio da folha
 * com a faixa ardósia, as linhas de explicação e os quadradinhos. Quem chama
 * já abriu a folha. Devolve o y depois do texto.
 */
export function capaDeSecao(pdf: jsPDF, yTopo: number, numero: string, titulo: string, linhas: string[]): number {
  const x0 = CAIXA.x;
  const x1 = CAIXA.x + CAIXA.largura;
  const meio = (yTopo + LIMITE_CORPO) / 2;
  marcaDagua(pdf, numero, (x0 + x1) / 2, meio - 6, numero.length > 1 ? 260 : 330);
  let y = meio - 4;
  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(ARDOSIA.forte);
  for (const l of pdf.splitTextToSize(`${numero}. ${titulo.toUpperCase()}`, CAIXA.largura - 30) as string[]) {
    pdf.text(l, (x0 + x1) / 2, y, { align: 'center' });
    y += 8.5;
  }
  pdf.setFillColor(ARDOSIA.forte);
  pdf.rect((x0 + x1) / 2 - 14, y - 4, 28, 1.2, 'F');
  y += 5;
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(COR.nota);
  for (const linha of linhas) {
    for (const l of pdf.splitTextToSize(linha, CAIXA.largura - 40) as string[]) {
      pdf.text(l, (x0 + x1) / 2, y, { align: 'center' });
      y += 5;
    }
    y += 1;
  }
  quadradinhos(pdf);
  return y;
}
