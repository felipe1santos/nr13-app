/**
 * Fase 5 — teto de altura e orientação explícita.
 *
 * A suíte roda em `environment: 'node'`: não existe canvas, `Image` nem
 * `createImageBitmap`. Por isso a regra de negócio mora em `dimensionar`, que é
 * pura e testada direto, e o resto é exercitado com dublês que REGISTRAM o que
 * receberam — é o tamanho pedido ao canvas que prova a regra, não os pixels.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  dimensionar,
  comprimirParaBlob,
  gerarMiniatura,
  abrirImagem,
  PRINCIPAL_LARGURA,
  PRINCIPAL_ALTURA,
  MINIATURA_LARGURA,
  MINIATURA_ALTURA,
} from './imagem';

// ---------------------------------------------------------------------------
// Dublês
// ---------------------------------------------------------------------------
interface CanvasFalso {
  width: number;
  height: number;
  getContext(): { drawImage: (...a: unknown[]) => void } | null;
  toBlob(cb: (b: Blob | null) => void, tipo: string, q: number): void;
}

let canvasCriados: CanvasFalso[] = [];
let qualidadeUsada: number[] = [];
/** Dimensão que o dublê de imagem devolve — já ORIENTADA, como o navegador faz. */
let dimensaoDaFonte = { largura: 0, altura: 0 };
let bitmapDisponivel = true;
let arquivoValido = true;
let originais: Record<string, unknown> = {};

beforeEach(() => {
  canvasCriados = [];
  qualidadeUsada = [];
  bitmapDisponivel = true;
  arquivoValido = true;

  const g = globalThis as Record<string, unknown>;
  originais = {
    document: g.document,
    Image: g.Image,
    URL: g.URL,
    createImageBitmap: g.createImageBitmap,
  };

  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error('só canvas neste dublê');
      const c: CanvasFalso = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toBlob: (cb, _tipo, q) => {
          qualidadeUsada.push(q);
          cb(new Blob([new Uint8Array(c.width * c.height)], { type: 'image/jpeg' }));
        },
      };
      canvasCriados.push(c);
      return c;
    },
  };

  g.createImageBitmap = (_b: Blob, opcoes?: { imageOrientation?: string }) => {
    if (!bitmapDisponivel) throw new Error('sem createImageBitmap');
    if (!arquivoValido) return Promise.reject(new Error('não decodifica'));
    return Promise.resolve({
      width: dimensaoDaFonte.largura,
      height: dimensaoDaFonte.altura,
      close: () => {},
      orientacaoPedida: opcoes?.imageOrientation,
    });
  };

  class ImagemFalsa {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 0;
    height = 0;
    set src(_v: string) {
      queueMicrotask(() => {
        if (!arquivoValido) return this.onerror?.();
        this.width = dimensaoDaFonte.largura;
        this.height = dimensaoDaFonte.altura;
        this.onload?.();
      });
    }
  }
  g.Image = ImagemFalsa;
  g.URL = { createObjectURL: () => 'blob:falso', revokeObjectURL: () => {} };
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  for (const [k, v] of Object.entries(originais)) {
    if (v === undefined) delete g[k];
    else g[k] = v;
  }
});

function fonte(largura: number, altura: number) {
  dimensaoDaFonte = { largura, altura };
  return new Blob([new Uint8Array(8)], { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
describe('dimensionar — fator mais restritivo', () => {
  it('4:3 paisagem: a largura manda e a altura de 1600 NÃO morde', () => {
    expect(dimensionar(4032, 3024, PRINCIPAL_LARGURA, PRINCIPAL_ALTURA)).toEqual({
      largura: 1200,
      altura: 900,
    });
  });

  it('3:4 retrato: sai exatamente no teto, byte a byte igual ao de antes', () => {
    // 3024×4032 escalado por 1200/3024 dá 1600 de altura — o teto encosta e não corta.
    expect(dimensionar(3024, 4032, PRINCIPAL_LARGURA, PRINCIPAL_ALTURA)).toEqual({
      largura: 1200,
      altura: 1600,
    });
  });

  it('9:16 retrato alto: É AQUI que o teto age', () => {
    // Sem teto seria 1200×2133 (o que o sistema guardava até 20/08/2026).
    expect(dimensionar(2268, 4032, PRINCIPAL_LARGURA)).toEqual({ largura: 1200, altura: 2133 });
    expect(dimensionar(2268, 4032, PRINCIPAL_LARGURA, PRINCIPAL_ALTURA)).toEqual({
      largura: 900,
      altura: 1600,
    });
  });

  it('nunca amplia imagem pequena', () => {
    expect(dimensionar(300, 200, PRINCIPAL_LARGURA, PRINCIPAL_ALTURA)).toEqual({
      largura: 300,
      altura: 200,
    });
  });

  it('nunca devolve dimensão zero', () => {
    expect(dimensionar(4000, 1, 10)).toEqual({ largura: 10, altura: 1 });
  });
});

describe('abrirImagem — orientação', () => {
  it('pede a orientação do arquivo explicitamente', async () => {
    const chamadas: unknown[] = [];
    (globalThis as Record<string, unknown>).createImageBitmap = (_b: Blob, o?: unknown) => {
      chamadas.push(o);
      return Promise.resolve({ width: 200, height: 400, close: () => {} });
    };
    const r = await abrirImagem(fonte(200, 400));
    expect(chamadas[0]).toEqual({ imageOrientation: 'from-image' });
    expect([r.largura, r.altura]).toEqual([200, 400]);
  });

  it('usa a dimensão JÁ ORIENTADA — retrato girado por EXIF não escala pelo lado errado', async () => {
    // Fonte gravada 400×200 com Orientation=6: o navegador entrega 200×400.
    await comprimirParaBlob(fonte(200, 400), 100);
    expect(canvasCriados[0].width).toBe(100);
    expect(canvasCriados[0].height).toBe(200);
  });

  it('sem createImageBitmap, cai no <img> e continua funcionando', async () => {
    bitmapDisponivel = false;
    await comprimirParaBlob(fonte(4032, 3024), PRINCIPAL_LARGURA, 0.7, PRINCIPAL_ALTURA);
    expect(canvasCriados[0].width).toBe(1200);
    expect(canvasCriados[0].height).toBe(900);
  });

  it('arquivo que não é imagem: erro claro, antes de qualquer gravação', async () => {
    bitmapDisponivel = false;
    arquivoValido = false;
    await expect(comprimirParaBlob(fonte(10, 10))).rejects.toThrow(/não é uma imagem válida/i);
    expect(canvasCriados).toHaveLength(0);
  });
});

describe('comprimirParaBlob e gerarMiniatura', () => {
  it('a principal continua 1200 px / q0,7', async () => {
    await comprimirParaBlob(fonte(4032, 3024), PRINCIPAL_LARGURA, 0.7, PRINCIPAL_ALTURA);
    expect(canvasCriados[0].width).toBe(1200);
    expect(qualidadeUsada[0]).toBe(0.7);
  });

  it('sem alturaMax, o comportamento é o de antes da Fase 5', async () => {
    await comprimirParaBlob(fonte(2268, 4032));
    expect(canvasCriados[0].height).toBe(2133);
  });

  it('a miniatura sai em 400 px / q0,6', async () => {
    await gerarMiniatura(fonte(4032, 3024));
    expect(canvasCriados[0].width).toBe(MINIATURA_LARGURA);
    expect(canvasCriados[0].height).toBe(300);
    expect(qualidadeUsada[0]).toBe(0.6);
  });

  it('a miniatura de um retrato alto respeita o teto proporcional', async () => {
    await gerarMiniatura(fonte(2268, 4032));
    expect(canvasCriados[0].height).toBe(MINIATURA_ALTURA);
    expect(canvasCriados[0].width).toBe(300);
  });

  it('canvas indisponível vira erro, não blob vazio', async () => {
    (globalThis as Record<string, unknown>).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => null, toBlob: () => {} }),
    };
    await expect(comprimirParaBlob(fonte(100, 100))).rejects.toThrow(/canvas indisponível/i);
  });
});

describe('a miniatura é MENOR que a principal — a razão do exercício', () => {
  it('a área da miniatura é uma fração da principal, para a mesma fonte', async () => {
    await comprimirParaBlob(fonte(4032, 3024), PRINCIPAL_LARGURA, 0.7, PRINCIPAL_ALTURA);
    const principal = canvasCriados[0].width * canvasCriados[0].height;
    canvasCriados = [];
    await gerarMiniatura(fonte(4032, 3024));
    const thumb = canvasCriados[0].width * canvasCriados[0].height;
    expect(thumb / principal).toBeLessThan(0.12); // 400² contra 1200² ≈ 1/9
  });
});

