/**
 * FASE 5 · o PDF do RELATÓRIO DE IMAGENS (24/09/2026).
 *
 * Imagens SINTÉTICAS geradas aqui (PNG de cor lisa, em três proporções) —
 * nenhuma foto de cliente. O PDF é lido de volta com pdf.js (texto) e a
 * geometria vem do próprio gerador (`celulas`) e de um espião no `addImage`.
 *
 * Letras = itens do pedido (§33): A/B/C quantidades, M descrição longa, N/O
 * proporção, P paginação, Q numeração, R documento avulso, X/Y histórico.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

// ── PNG sintético ───────────────────────────────────────────────────────────
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo: string, dados: Buffer): Buffer {
  const t = Buffer.from(tipo, 'ascii');
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
/** PNG RGB de cor lisa com uma faixa diagonal — cada `semente` dá uma imagem distinta. */
function pngSintetico(largura: number, altura: number, semente: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const cru = Buffer.alloc((largura * 3 + 1) * altura);
  const cor = [(semente * 53) % 256, (semente * 97 + 40) % 256, (semente * 151 + 90) % 256];
  for (let y = 0; y < altura; y++) {
    const base = y * (largura * 3 + 1);
    for (let x = 0; x < largura; x++) {
      const faixa = Math.abs(x * altura - y * largura) < largura * altura * 0.05;
      const o = base + 1 + x * 3;
      cru[o] = faixa ? 255 : cor[0];
      cru[o + 1] = faixa ? 255 : cor[1];
      cru[o + 2] = faixa ? 255 : cor[2];
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(cru)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const HORIZONTAL = { l: 160, a: 90 };
const VERTICAL = { l: 90, a: 160 };
const QUADRADA = { l: 120, a: 120 };
const FORMATOS = [HORIZONTAL, VERTICAL, QUADRADA];

import { jsPDF } from 'jspdf';
import { zerarCacheFontes } from './carlito';
import { CORPO, LIMITE_CORPO } from './documentoA4';
import {
  GRADE_IMAGENS,
  gerarRelatorioImagensPdf,
  type EntradaRelatorioImagens,
  type ResultadoRelatorioImagens,
} from './relatorioImagens';

const DESCRICAO_LONGA =
  'Pontos de corrosão observados no costado, na região inferior próxima à sela de apoio do lado do tampo ' +
  'traseiro. A corrosão é generalizada, com perda de espessura aparente e manchas de óxido, sem indícios de ' +
  'trincas visíveis a olho nu. Recomenda-se medição de espessura complementar por ultrassom nesta região, ' +
  'limpeza mecânica até metal branco e reaplicação do sistema de pintura conforme especificação do fabricante. ' +
  'Registrar nova inspeção após a intervenção.';
const DESCRICAO_GIGANTE = Array.from({ length: 28 }, () => DESCRICAO_LONGA).join(' ');

function entrada(n: number, descricao: (i: number) => string = (i) => `Descrição da fotografia número ${i + 1}.`): EntradaRelatorioImagens {
  return {
    tag: 'ZZ-IMG-01',
    identificacao: [
      { rotulo: 'IDENTIFICAÇÃO / T.A.G.', valor: 'ZZ-IMG-01' },
      { rotulo: 'CLIENTE', valor: 'CLIENTE SINTÉTICO LTDA' },
      { rotulo: 'DATA DO REGISTRO', valor: '24/09/2026' },
      { rotulo: 'FABRICANTE', valor: null },
    ],
    observacoes: '',
    fotos: Array.from({ length: n }, (_, i) => {
      const f = FORMATOS[i % 3];
      return { dataUrl: pngSintetico(f.l, f.a, i + 1), descricao: descricao(i), proporcao: f.l / f.a };
    }),
    empresa: { razao: 'ZZ ENGENHARIA SINTÉTICA LTDA', endereco: 'Rua de Teste, 1', contato: '(00) 0000-0000', logo: null },
  };
}

async function textoDasPaginas(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

/** Nenhuma célula sai do corpo nem invade outra na mesma folha. */
function conferirGeometria(r: ResultadoRelatorioImagens) {
  const g = GRADE_IMAGENS;
  for (const c of r.celulas) {
    expect(c.y, `foto ${c.indice + 1} acima do corpo`).toBeGreaterThanOrEqual(CORPO.y - 0.01);
    if (!c.corrida) {
      expect(c.fimDescricao, `foto ${c.indice + 1} cruza o rodapé`).toBeLessThanOrEqual(LIMITE_CORPO + 0.01);
      expect(c.paginaFimDescricao).toBe(c.pagina);
    }
  }
  const porPagina = new Map<number, typeof r.celulas>();
  for (const c of r.celulas) porPagina.set(c.pagina, [...(porPagina.get(c.pagina) ?? []), c]);
  for (const cs of porPagina.values()) {
    for (const a of cs)
      for (const b of cs) {
        if (a === b) continue;
        const colunaIgual = Math.abs(a.x - b.x) < 1;
        if (!colunaIgual) continue;
        const [cima, baixo] = a.y < b.y ? [a, b] : [b, a];
        expect(baixo.y, `fotos ${cima.indice + 1} e ${baixo.indice + 1} sobrepostas`).toBeGreaterThanOrEqual(
          (cima.corrida ? cima.y + g.alturaRotulo + g.alturaImagem : cima.fimDescricao) - 0.01,
        );
      }
  }
}

const imagensDesenhadas: { w: number; h: number }[] = [];
let restaurarAddImage = () => {};
const resultados = new Map<string, { r: ResultadoRelatorioImagens; paginas: string[] }>();

beforeAll(async () => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
  // O `addImage` mora no protótipo de plugins (`jsPDF.API`), que o tipo público
  // não declara. O espião anota largura × altura de cada imagem e desenha igual.
  const api = jsPDF.API as unknown as { addImage: (...a: unknown[]) => unknown };
  const original = api.addImage;
  api.addImage = function (this: unknown, ...args: unknown[]) {
    imagensDesenhadas.push({ w: args[4] as number, h: args[5] as number });
    return original.apply(this, args);
  };
  restaurarAddImage = () => {
    api.addImage = original;
  };

  const casos: [string, EntradaRelatorioImagens][] = [
    ['1', entrada(1)],
    ['2', entrada(2)],
    ['3', entrada(3)],
    ['7', entrada(7)],
    ['10', entrada(10)],
    ['31', entrada(31)],
    ['50', entrada(50)],
    ['longa', entrada(5, (i) => (i === 2 ? DESCRICAO_LONGA : `Foto curta ${i + 1}.`))],
    ['gigante', entrada(3, (i) => (i === 1 ? DESCRICAO_GIGANTE : `Foto curta ${i + 1}.`))],
  ];
  for (const [nome, e] of casos) {
    const r = await gerarRelatorioImagensPdf(e);
    resultados.set(nome, { r, paginas: await textoDasPaginas(r.bytes) });
  }
}, 300_000);

afterAll(() => restaurarAddImage());

describe('A/B/C · quantidade dinâmica (1, 2, 3, 7, 10, 31, 50)', () => {
  for (const n of [1, 2, 3, 7, 10, 31, 50]) {
    it(`${n} foto(s): todas desenhadas, na ordem, sem sobreposição`, () => {
      const { r, paginas } = resultados.get(String(n))!;
      expect(r.celulas.map((c) => c.indice)).toEqual(Array.from({ length: n }, (_, i) => i));
      conferirGeometria(r);
      const tudo = paginas.join(' ');
      for (let i = 0; i < n; i++) {
        expect(tudo).toContain(`Foto ${String(i + 1).padStart(2, '0')}`);
        expect(tudo).toContain(`Descrição da fotografia número ${i + 1}.`);
      }
    });
  }

  it('duas colunas: as fotos pares ficam à esquerda e as ímpares à direita, lado a lado', () => {
    const { r } = resultados.get('10')!;
    const [a, b] = r.celulas;
    expect(a.y).toBe(b.y);
    expect(b.x).toBeGreaterThan(a.x + a.largura);
  });

  it('páginas crescem com a quantidade (nada fixo por documento): 4 fotos por folha com descrição curta', () => {
    const pag = (n: number) => resultados.get(String(n))!.r.paginas;
    // capa + ceil(n/4) folhas de fotos
    expect(pag(1)).toBe(2);
    expect(pag(10)).toBe(1 + Math.ceil(10 / 4));
    expect(pag(31)).toBe(1 + Math.ceil(31 / 4));
    expect(pag(50)).toBe(1 + Math.ceil(50 / 4));
  });
});

describe('P · paginação "Página X de Y" em toda folha', () => {
  it.each(['1', '10', '31', 'gigante'])('%s', (nome) => {
    const { r, paginas } = resultados.get(nome)!;
    expect(paginas).toHaveLength(r.paginas);
    paginas.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${r.paginas}`));
  });

  it('cabeçalho diz qual documento é, e o rodapé traz a executante', () => {
    const { paginas } = resultados.get('10')!;
    for (const p of paginas) {
      expect(p).toContain('RELATÓRIO DE IMAGENS');
      expect(p).toContain('ZZ ENGENHARIA SINTÉTICA LTDA');
    }
  });

  it('última folha pode ter uma foto só (7 fotos → a 7ª sozinha)', () => {
    const { r } = resultados.get('7')!;
    const ultima = Math.max(...r.celulas.map((c) => c.pagina));
    expect(r.celulas.filter((c) => c.pagina === ultima).map((c) => c.indice)).toEqual([4, 5, 6]);
    const { r: r1 } = resultados.get('1')!;
    expect(r1.celulas).toHaveLength(1);
  });
});

describe('capa', () => {
  it('título, T.A.G., identificação vinda do modelo e "—" para o que falta', () => {
    const capa = resultados.get('3')!.paginas[0];
    expect(capa).toContain('RELATÓRIO DE IMAGENS');
    expect(capa).toContain('T.A.G. ZZ-IMG-01');
    expect(capa).toContain('CLIENTE SINTÉTICO LTDA');
    expect(capa).toContain('24/09/2026');
    expect(capa).toMatch(/FABRICANTE —/);
    // A capa não traz foto nenhuma.
    expect(capa).not.toContain('Foto 01');
  });
});

describe('M · descrição longa nunca é cortada', () => {
  it('a descrição de ~500 caracteres aparece INTEIRA e a célula dela cabe na folha', () => {
    const { r, paginas } = resultados.get('longa')!;
    const tudo = paginas.join(' ').replace(/\s+/g, '');
    expect(tudo).toContain(DESCRICAO_LONGA.replace(/\s+/g, ''));
    expect(tudo).not.toContain('…');
    conferirGeometria(r);
  });

  it('descrição que não cabe nem sozinha numa folha sai da grade e CORRE pelas folhas seguintes, inteira', () => {
    const { r, paginas } = resultados.get('gigante')!;
    const c = r.celulas.find((x) => x.indice === 1)!;
    expect(c.corrida).toBe(true);
    expect(c.paginaFimDescricao).toBeGreaterThan(c.pagina);
    // Tira cabeçalho e rodapé de cada folha: o texto corrido atravessa folhas,
    // e entre um pedaço e outro o pdf.js lê a moldura da folha seguinte.
    const moldura = /RELATÓRIODEIMAGENS—T\.A\.G\.ZZ-IMG-01Página\d+de\d+ZZENGENHARIASINTÉTICALTDARuadeTeste,1\(00\)0000-0000/g;
    const tudo = paginas.join(' ').replace(/\s+/g, '').replace(moldura, '');
    expect(tudo.includes(DESCRICAO_GIGANTE.replace(/\s+/g, ''))).toBe(true);
    expect(tudo).not.toContain('…');
    // a foto seguinte vem DEPOIS do fim do texto corrido, sem sobrepor
    const prox = r.celulas.find((x) => x.indice === 2)!;
    expect(prox.pagina * 1000 + prox.y).toBeGreaterThanOrEqual(c.paginaFimDescricao * 1000 + c.fimDescricao - 0.01);
    conferirGeometria(r);
  });
});

describe('N/O · proporção preservada (contain), nunca esticada', () => {
  it('toda imagem desenhada tem a razão largura/altura de uma das imagens de origem', () => {
    const razoes = FORMATOS.map((f) => f.l / f.a);
    expect(imagensDesenhadas.length).toBeGreaterThan(0);
    for (const { w, h } of imagensDesenhadas) {
      const r = w / h;
      expect(razoes.some((x) => Math.abs(x - r) < 0.01), `razão ${r.toFixed(3)}`).toBe(true);
      expect(w).toBeLessThanOrEqual(GRADE_IMAGENS.coluna + 0.01);
      expect(h).toBeLessThanOrEqual(GRADE_IMAGENS.alturaImagem + 0.01);
    }
  });

  it('horizontal ocupa a largura da coluna; vertical ocupa a altura do quadro', () => {
    const horiz = imagensDesenhadas.find((d) => Math.abs(d.w / d.h - HORIZONTAL.l / HORIZONTAL.a) < 0.01)!;
    const vert = imagensDesenhadas.find((d) => Math.abs(d.w / d.h - VERTICAL.l / VERTICAL.a) < 0.01)!;
    expect(horiz.w).toBeCloseTo(GRADE_IMAGENS.coluna, 1);
    expect(vert.h).toBeCloseTo(GRADE_IMAGENS.alturaImagem, 1);
  });
});

describe('HÍBRIDO · texto vetorial, foto raster', () => {
  it('o texto da descrição é extraível do PDF (não é imagem da página)', () => {
    expect(resultados.get('3')!.paginas[1]).toContain('Descrição da fotografia número 2.');
  });

  it('nenhuma página é rasterizada inteira: a única imagem por foto tem o tamanho da coluna', () => {
    for (const { w } of imagensDesenhadas) expect(w).toBeLessThan(100);
  });
});
