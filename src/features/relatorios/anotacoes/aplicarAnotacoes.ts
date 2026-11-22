import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  ALTURA_LINHA,
  corRgb,
  ehVazia,
  larguraVisivel,
  paraPdf,
  type Anotacao,
  type TextoAnotacao,
  type TracoAnotacao,
} from './modelo';

/**
 * Desenha as anotações sobre uma CÓPIA dos bytes e devolve a cópia.
 *
 * É a única coisa que as anotações fazem com o documento, e o que ela devolve
 * é um PDF NOVO, que só existe na memória: quem chamou entrega esses bytes ao
 * "Baixar PDF" ou ao "Imprimir" e os descarta. Os bytes de entrada não são
 * tocados — `PDFDocument.load` lê uma cópia —, e nada aqui conhece `pdfRef`,
 * SHA ou storage. O arquivo arquivado na emissão continua exatamente o mesmo.
 *
 * Sem anotação que desenhe alguma coisa, devolve os MESMOS bytes: o arquivo
 * baixado de um relatório finalizado sem anotação continua byte a byte o da
 * emissão, com o SHA que ficou registrado.
 */
export async function aplicarAnotacoes(bytes: Uint8Array, anotacoes: readonly Anotacao[]): Promise<Uint8Array> {
  const uteis = anotacoes.filter((a) => !ehVazia(a));
  if (uteis.length === 0) return bytes;

  const doc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true, updateMetadata: false });
  const paginas = doc.getPages();
  let fonte: PDFFont | null = null;

  for (const a of uteis) {
    const pagina = paginas[a.pagina - 1];
    // Prévia regerada com menos páginas: a anotação daquela folha não tem onde cair.
    if (!pagina) continue;
    if (a.tipo === 'traco') desenharTraco(pagina, a);
    else {
      fonte ??= await doc.embedFont(StandardFonts.Helvetica);
      desenharTexto(pagina, a, fonte);
    }
  }
  return doc.save();
}

function geometria(pagina: PDFPage) {
  const c = pagina.getCropBox();
  const caixa = { x: c.x, y: c.y, largura: c.width, altura: c.height };
  const rotacao = pagina.getRotation().angle;
  const wv = larguraVisivel(caixa, rotacao);
  // A altura visível é o outro lado da caixa: girada 90/270, a largura vista é a altura.
  const hv = caixa.largura + caixa.altura - wv;
  return { caixa, rotacao, wv, hv };
}

function desenharTraco(pagina: PDFPage, t: TracoAnotacao) {
  const { caixa, rotacao, wv } = geometria(pagina);
  const { r, g, b } = corRgb(t.cor);
  const cor = rgb(r, g, b);
  const espessura = Math.max(0.3, t.espessura * wv);
  const pts = t.pontos.map((p) => paraPdf(p, caixa, rotacao));
  if (pts.length === 1) {
    pagina.drawCircle({ x: pts[0].x, y: pts[0].y, size: espessura / 2, color: cor });
    return;
  }
  for (let i = 1; i < pts.length; i += 1) {
    pagina.drawLine({
      start: pts[i - 1],
      end: pts[i],
      thickness: espessura,
      color: cor,
      lineCap: LineCapStyle.Round,
    });
  }
}

/**
 * A Helvetica padrão do PDF só codifica WinAnsi. Acentos do português passam;
 * um emoji ou um "≥" derrubariam o `drawText` inteiro — e com ele o download.
 * O caractere que não cabe vira "?", à vista, em vez de sumir calado.
 */
export function textoCodificavel(texto: string, fonte: Pick<PDFFont, 'widthOfTextAtSize'>): string {
  let saida = '';
  for (const ch of texto) {
    try {
      fonte.widthOfTextAtSize(ch, 10);
      saida += ch;
    } catch {
      saida += '?';
    }
  }
  return saida;
}

/** Da linha do topo da caixa até a linha de base, em múltiplos do tamanho — o mesmo da tela (Arial/Helvetica, `line-height` 1.25). */
const BASE_LINHA = 0.95;

function desenharTexto(pagina: PDFPage, t: TextoAnotacao, fonte: PDFFont) {
  const { caixa, rotacao, wv, hv } = geometria(pagina);
  const { r, g, b } = corRgb(t.cor);
  const tam = Math.max(4, t.tamanho * wv);
  const linhas = t.texto.replace(/\r/g, '').split('\n');
  linhas.forEach((linha, i) => {
    if (!linha) return;
    const dy = (tam * (BASE_LINHA + i * ALTURA_LINHA)) / hv;
    const base = paraPdf({ x: t.x, y: t.y + dy }, caixa, rotacao);
    pagina.drawText(textoCodificavel(linha, fonte), {
      x: base.x,
      y: base.y,
      size: tam,
      font: fonte,
      color: rgb(r, g, b),
      // A página girada é desenhada girada na tela; o texto precisa do mesmo
      // giro para sair de pé no papel.
      rotate: degrees(((rotacao % 360) + 360) % 360),
    });
  });
}
