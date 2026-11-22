/**
 * Anotações do visualizador (22/11/2026) — TEXTO e DESENHO À MÃO LIVRE.
 *
 * ## O que são, e o que NÃO são
 *
 * São o equivalente às ferramentas do leitor de PDF do Chrome, que o
 * visualizador próprio (Fase 12B) substituiu: uma camada por cima das páginas
 * desenhadas, que **não altera o documento**. Elas saem só na CÓPIA que o
 * usuário baixa ou imprime a partir da tela (`aplicarAnotacoes`), desenhadas
 * por pdf-lib sobre os bytes já carregados.
 *
 * Nada aqui grava: nem `pdfRef`, nem o arquivo arquivado, nem SHA, nem chave
 * do storage. O relatório finalizado continua sendo o arquivo da emissão
 * (§7-quater) e o rascunho continua sendo a receita de sempre. Fechar a tela
 * descarta as anotações — como no Chrome.
 *
 * ## Coordenadas NORMALIZADAS da página
 *
 * Todo ponto é guardado como fração da página tal como ela aparece na tela:
 * `x` de 0 (borda esquerda) a 1 (borda direita), `y` de 0 (topo) a 1 (pé).
 * Espessura do traço e tamanho da letra também são frações — da LARGURA da
 * página. É o que faz a anotação sobreviver a zoom, a redimensionar a janela e
 * a girar o celular: muda a escala com que a página é desenhada, a fração não.
 */

export type Ferramenta = 'texto' | 'desenhar';

export interface Ponto {
  x: number;
  y: number;
}

export interface TracoAnotacao {
  id: string;
  tipo: 'traco';
  /** 1-based, como o `data-pagina` do visualizador. */
  pagina: number;
  cor: string;
  /** Fração da largura da página. */
  espessura: number;
  pontos: Ponto[];
}

export interface TextoAnotacao {
  id: string;
  tipo: 'texto';
  pagina: number;
  /** Canto superior esquerdo da caixa, normalizado. */
  x: number;
  y: number;
  texto: string;
  cor: string;
  /** Tamanho da letra, fração da largura da página. */
  tamanho: number;
}

export type Anotacao = TracoAnotacao | TextoAnotacao;

/** As cores oferecidas. O vermelho é o padrão do sistema; o azul, o destaque. */
export const CORES_ANOTACAO = [
  { valor: '#111827', nome: 'Preto' },
  { valor: '#DC2626', nome: 'Vermelho' },
  { valor: '#0C4F9B', nome: 'Azul' },
  { valor: '#0F766E', nome: 'Verde' },
] as const;

/**
 * Duas espessuras. Numa A4 (595 pt de largura) dão ~1,5 pt e ~4 pt: caneta
 * fina para sublinhar, marcador para circular.
 */
export const ESPESSURAS_ANOTACAO = [
  { valor: 0.0025, nome: 'Fina' },
  { valor: 0.0068, nome: 'Grossa' },
] as const;

/** ~12 pt numa A4. */
export const TAMANHO_TEXTO_PADRAO = 0.02;

/** Altura de linha da caixa de texto (em múltiplos do tamanho da letra) — tela e PDF usam a mesma. */
export const ALTURA_LINHA = 1.25;

const limitar = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Pixel dentro da página desenhada → fração da página. Fora da folha vai para a borda. */
export function normalizar(px: number, py: number, largura: number, altura: number): Ponto {
  if (!largura || !altura) return { x: 0, y: 0 };
  return { x: limitar(px / largura), y: limitar(py / altura) };
}

/** O inverso, para desenhar na escala atual. */
export function paraPixels(p: Ponto, largura: number, altura: number): Ponto {
  return { x: p.x * largura, y: p.y * altura };
}

/**
 * Fração da página VISTA → ponto no espaço do PDF (origem no canto inferior
 * esquerdo, como o pdf-lib espera).
 *
 * `caixa` é a caixa visível da página SEM rotação (a mesma que o pdf.js usa
 * para o viewport), e `rotacao` o `/Rotate` da página. Os relatórios do sistema
 * saem com rotação 0, mas um certificado anexado vem do laboratório e pode
 * estar girado — sem esta conta, a anotação feita em cima dele cairia noutro
 * canto da folha impressa.
 */
export function paraPdf(
  p: Ponto,
  caixa: { x: number; y: number; largura: number; altura: number },
  rotacao: number,
): Ponto {
  const r = (((Math.round(rotacao / 90) * 90) % 360) + 360) % 360;
  const { x: x0, y: y0, largura: W, altura: H } = caixa;
  switch (r) {
    case 90:
      return { x: x0 + p.y * W, y: y0 + p.x * H };
    case 180:
      return { x: x0 + (1 - p.x) * W, y: y0 + p.y * H };
    case 270:
      return { x: x0 + (1 - p.y) * W, y: y0 + (1 - p.x) * H };
    default:
      return { x: x0 + p.x * W, y: y0 + (1 - p.y) * H };
  }
}

/** Largura da página como ela APARECE (girada 90/270 troca os lados). */
export function larguraVisivel(caixa: { largura: number; altura: number }, rotacao: number): number {
  const r = (((Math.round(rotacao / 90) * 90) % 360) + 360) % 360;
  return r === 90 || r === 270 ? caixa.altura : caixa.largura;
}

/** `#RRGGBB` → componentes 0..1. Cor inválida vira preto, nunca exceção. */
export function corRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * Tira pontos quase repetidos de um traço. O `pointermove` de uma caneta
 * dispara centenas de vezes por segundo; guardar todos só pesaria no PDF.
 */
export function simplificarTraco(pontos: Ponto[], distanciaMin = 0.0015): Ponto[] {
  if (pontos.length <= 2) return pontos.slice();
  const saida: Ponto[] = [pontos[0]];
  for (let i = 1; i < pontos.length - 1; i += 1) {
    const u = saida[saida.length - 1];
    const p = pontos[i];
    if (Math.hypot(p.x - u.x, p.y - u.y) >= distanciaMin) saida.push(p);
  }
  saida.push(pontos[pontos.length - 1]);
  return saida;
}

/** Anotação que não desenharia nada: traço sem ponto, texto só com espaços. */
export function ehVazia(a: Anotacao): boolean {
  return a.tipo === 'traco' ? a.pontos.length === 0 : a.texto.trim() === '';
}

let seq = 0;
export function novoId(): string {
  seq += 1;
  return `anot-${Date.now().toString(36)}-${seq}`;
}

/**
 * O nome do arquivo da cópia anotada. Diferente do original de propósito: na
 * pasta de downloads, a cópia com marcas não pode se passar pelo documento
 * emitido.
 */
export function nomeDaCopiaAnotada(nome: string): string {
  const m = /^(.*?)(\.pdf)$/i.exec(nome.trim());
  return m ? `${m[1]} (anotado)${m[2]}` : `${nome.trim()} (anotado)`;
}
