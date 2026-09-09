import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { foto, imagemEncaixada } from './primitivas';
import { negritoDaCelula } from './documento';
import { matrizCategorizacao } from './folhas';
import { COR } from './documentoA4';
import type { Documento } from './documento';

/**
 * 08/09/2026 · A APRESENTAÇÃO do documento: proporção, peso e realce.
 *
 * Três defeitos apontados na mesma rodada, e os três são de leitura, não de
 * dado:
 *
 * 1. **imagem esticada** — logo e rubrica eram desenhadas com largura e altura
 *    FIXAS, então toda imagem cuja proporção não fosse a do quadro saía
 *    deformada; a foto de capa caía num 4:3 assumido quando ninguém passava a
 *    proporção, o que achata toda foto de celular tirada em pé;
 * 2. **veredito fino** — o `X` das marcações e o `APROVADO`/`REPROVADO` dos
 *    ensaios saíam no mesmo peso do texto corrido, e são justamente o que um
 *    auditor procura;
 * 3. **matriz toda amarela** — a linha inteira da classe e a coluna inteira do
 *    grupo eram pintadas, onze células de vinte, e a resposta sumia no meio.
 */

/** Um PNG 2×1 válido — proporção 2, bem diferente do 4/3 que era assumido. */
const PNG_2x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGM4IScnZ3MCAAdfAieyfXRcAAAAAElFTkSuQmCC';

function bancadaImagem() {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const desenhos: { x: number; y: number; w: number; h: number }[] = [];
  const original = pdf.addImage.bind(pdf);
  (pdf as unknown as { addImage: unknown }).addImage = (
    d: string, f: string, x: number, y: number, w: number, h: number, ...resto: unknown[]
  ) => {
    desenhos.push({ x, y, w, h });
    return (original as (...a: unknown[]) => unknown)(d, f, x, y, w, h, ...resto);
  };
  return { pdf, desenhos };
}

describe('imagem nunca é esticada', () => {
  it('a proporção REAL vem dos bytes, mesmo sem ninguém informá-la', () => {
    const { pdf, desenhos } = bancadaImagem();
    // Quadro QUADRADO e imagem 2:1: a antiga conta (4/3 assumido) desenharia
    // 60 × 45; a certa desenha 60 × 30.
    foto(pdf, PNG_2x1, { x: 10, y: 10, largura: 60, altura: 60 });
    const d = desenhos[0];
    expect(d.w / d.h).toBeCloseTo(2, 3);
  });

  it('a imagem cabe DENTRO do quadro e fica centrada — "contain", não "cover"', () => {
    const { pdf, desenhos } = bancadaImagem();
    foto(pdf, PNG_2x1, { x: 10, y: 20, largura: 60, altura: 60 });
    const d = desenhos[0];
    expect(d.w).toBeLessThanOrEqual(60 + 0.001);
    expect(d.h).toBeLessThanOrEqual(60 + 0.001);
    // Centrada na sobra vertical.
    expect(d.y - 20).toBeCloseTo((60 - d.h) / 2, 3);
    expect(d.x - 10).toBeCloseTo((60 - d.w) / 2, 3);
  });

  it('a altura é o limite quando a imagem é mais "alta" que o quadro', () => {
    const { pdf, desenhos } = bancadaImagem();
    // Quadro largo e baixo: a largura sobra, a altura é quem manda.
    foto(pdf, PNG_2x1, { x: 0, y: 0, largura: 100, altura: 10 });
    const d = desenhos[0];
    expect(d.h).toBeCloseTo(10, 3);
    expect(d.w).toBeCloseTo(20, 3);
  });

  it('a LOGO do cabeçalho encaixa à esquerda, sem deformar', () => {
    const { pdf, desenhos } = bancadaImagem();
    // O quadro da logo no cabeçalho é 50 × 14 (proporção 3,57). A imagem é 2:1.
    imagemEncaixada(pdf, PNG_2x1, { x: 20, y: 5, largura: 50, altura: 14 }, { alinhamento: 'left' });
    const d = desenhos[0];
    expect(d.w / d.h).toBeCloseTo(2, 3);
    expect(d.x).toBeCloseTo(20, 3); // encostada à esquerda: a faixa à direita é do nº do relatório
    expect(d.h).toBeLessThanOrEqual(14 + 0.001);
  });

  it('a RUBRICA centraliza sobre a linha de assinatura', () => {
    const { pdf, desenhos } = bancadaImagem();
    imagemEncaixada(pdf, PNG_2x1, { x: 0, y: 0, largura: 40, altura: 16 });
    const d = desenhos[0];
    expect(d.w / d.h).toBeCloseTo(2, 3);
    expect(d.x).toBeCloseTo((40 - d.w) / 2, 3);
  });

  it('imagem ILEGÍVEL não derruba a emissão do relatório inteiro', () => {
    const { pdf, desenhos } = bancadaImagem();
    // Arquivo truncado no upload: o jsPDF lança "wrong PNG signature" dentro do
    // `addImage`, e isso abortava a geração do documento inteiro — uma foto
    // corrompida custava o relatório. A moldura sai vazia e o resto continua.
    expect(() =>
      foto(pdf, 'data:image/png;base64,QUJD', { x: 0, y: 0, largura: 40, altura: 40 }, 2),
    ).not.toThrow();
    expect(() =>
      imagemEncaixada(pdf, 'data:image/png;base64,QUJD', { x: 0, y: 0, largura: 40, altura: 16 }),
    ).not.toThrow();
    // A proporção INFORMADA é o caminho de recurso quando os bytes não abrem.
    expect(desenhos[0].w / desenhos[0].h).toBeCloseTo(2, 3);
  });
});

describe('marcas de veredito saem em NEGRITO', () => {
  const cel = (texto: string) => ({ texto, valor: true });

  it.each(['X', 'APROVADO', 'REPROVADO', 'APROVADO COM RESSALVAS', 'APTO', 'INAPTO'])(
    '%s é negrito',
    (t) => expect(negritoDaCelula(cel(t))).toBe(true),
  );

  it('texto comum continua no peso normal', () => {
    expect(negritoDaCelula(cel('Ar comprimido'))).toBe(false);
    expect(negritoDaCelula(cel(''))).toBe(false);
    expect(negritoDaCelula(cel('—'))).toBe(false);
    // "Aprovado" no meio de uma frase NÃO acende: a regra é a célula inteira.
    expect(negritoDaCelula(cel('Item aprovado com ressalva do inspetor'))).toBe(false);
  });

  it('rótulo e realce de espessura continuam negrito — a regra só somou casos', () => {
    expect(negritoDaCelula({ texto: 'FABRICANTE', rotulo: true })).toBe(true);
    expect(negritoDaCelula({ texto: '6,12', destaque: 'menor' })).toBe(true);
  });
});

describe('matriz da NR-13: acende o caminho, não a tabela', () => {
  /** Registra cada retângulo com a cor de preenchimento que estava valendo. */
  function bancadaMatriz(classe: string | null, grupo: string | null) {
    const rects: { fill: string; draw: string; x: number; y: number; w: number; h: number }[] = [];
    const linhas: { draw: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    let fill = '#ffffff';
    let draw = '#000000';
    const pdf = {
      setFillColor(c: string) { fill = c; },
      setDrawColor(c: string) { draw = c; },
      setLineWidth() {}, setFont() {}, setFontSize() {}, setTextColor() {}, text() {},
      splitTextToSize: (t: string) => [t],
      rect(x: number, y: number, w: number, h: number) { rects.push({ fill, draw, x, y, w, h }); },
      line(x1: number, y1: number, x2: number, y2: number) { linhas.push({ draw, x1, y1, x2, y2 }); },
    };
    const doc = { pdf, y: 40, garantirEspaco: () => false } as unknown as Documento;
    matrizCategorizacao(doc, classe, grupo);
    return { rects, linhas };
  }

  it('SÓ UMA célula recebe o âmbar forte: o cruzamento', () => {
    const { rects } = bancadaMatriz('Classe B', '3');
    expect(rects.filter((r) => r.fill === COR.fundoRealce)).toHaveLength(1);
  });

  it('a linha da classe e a coluna do grupo NÃO são mais pintadas inteiras', () => {
    const { rects } = bancadaMatriz('Classe B', '3');
    // O tom suave marca as DUAS entradas — a célula da classe e o cabeçalho do
    // grupo. Antes eram, além delas, as cinco categorias da linha e as quatro
    // da coluna: onze células acesas numa matriz de vinte.
    const suaves = rects.filter((r) => r.fill === COR.fundoRealceSuave);
    expect(suaves).toHaveLength(2);
  });

  it('as DUAS entradas se destacam pela borda âmbar: classe e grupo', () => {
    const { rects } = bancadaMatriz('Classe B', '3');
    const comBorda = rects.filter((r) => r.draw === COR.bordaRealce);
    // célula da classe + cabeçalho do grupo + o cruzamento
    expect(comBorda).toHaveLength(3);
  });

  it('o CORREDOR âmbar liga as entradas ao resultado', () => {
    const { linhas } = bancadaMatriz('Classe B', '3');
    const corredor = linhas.filter((l) => l.draw === COR.bordaRealce);
    // duas horizontais (topo e base da linha da classe) + duas verticais
    expect(corredor).toHaveLength(4);
    expect(corredor.filter((l) => l.y1 === l.y2)).toHaveLength(2);
    expect(corredor.filter((l) => l.x1 === l.x2)).toHaveLength(2);
  });

  it('classe A é a primeira linha: não há trecho vertical a percorrer', () => {
    const { linhas } = bancadaMatriz('Classe A', '2');
    const corredor = linhas.filter((l) => l.draw === COR.bordaRealce);
    expect(corredor).toHaveLength(2);
    expect(corredor.every((l) => l.y1 === l.y2)).toBe(true);
  });

  it('meia consulta NÃO desenha caminho nenhum', () => {
    // Sem classe (ou sem grupo) não existe cruzamento: uma seta apontando para
    // lugar nenhum afirmaria um resultado que o sistema não calculou.
    for (const [c, g] of [[null, '3'], ['Classe B', null], [null, null]] as const) {
      const { linhas, rects } = bancadaMatriz(c, g);
      expect(linhas.filter((l) => l.draw === COR.bordaRealce)).toHaveLength(0);
      expect(rects.filter((r) => r.fill === COR.fundoRealce)).toHaveLength(0);
    }
  });
});
