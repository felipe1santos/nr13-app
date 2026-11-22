import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';

const baixarArtefato = vi.fn();
const publicarArtefato = vi.fn();
vi.mock('../artefatoRelatorio', () => ({
  baixarArtefato: (...a: unknown[]) => baixarArtefato(...a),
  publicarArtefato: (...a: unknown[]) => publicarArtefato(...a),
}));

import {
  corRgb,
  ehVazia,
  larguraVisivel,
  nomeDaCopiaAnotada,
  normalizar,
  paraPdf,
  paraPixels,
  simplificarTraco,
  type Anotacao,
} from './modelo';
import { aplicarAnotacoes, textoCodificavel } from './aplicarAnotacoes';
import { copiaAnotadaDoArtefato } from './copiaAnotada';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function pdfDeTeste(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  doc.addPage([595.28, 841.89]).setRotation(degrees(90));
  doc.addPage([841.89, 595.28]);
  return doc.save();
}

const ANOTACOES: Anotacao[] = [
  { id: 'a', tipo: 'traco', pagina: 1, cor: '#DC2626', espessura: 0.0025, pontos: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 0.9, y: 0.2 }] },
  { id: 'b', tipo: 'traco', pagina: 2, cor: '#0C4F9B', espessura: 0.0068, pontos: [{ x: 0.3, y: 0.3 }] },
  { id: 'c', tipo: 'texto', pagina: 1, x: 0.2, y: 0.6, texto: 'Inspeção ç ã — ok\nlinha 2 ≥ 😀', cor: '#111827', tamanho: 0.02 },
  { id: 'd', tipo: 'texto', pagina: 2, x: 0.5, y: 0.5, texto: 'girada', cor: '#0F766E', tamanho: 0.02 },
  // Página que não existe (prévia regerada mais curta): ignorada, não quebra.
  { id: 'e', tipo: 'traco', pagina: 9, cor: '#111827', espessura: 0.0025, pontos: [{ x: 0.5, y: 0.5 }] },
];

describe('coordenadas normalizadas da página', () => {
  it('pixel → fração → pixel em qualquer escala (zoom não move a anotação)', () => {
    const p = normalizar(150, 300, 600, 848);
    expect(p.x).toBeCloseTo(0.25);
    expect(p.y).toBeCloseTo(300 / 848);
    // Mesma fração, página desenhada com o dobro do tamanho.
    const em2x = paraPixels(p, 1200, 1696);
    expect(em2x.x).toBeCloseTo(300);
    expect(em2x.y).toBeCloseTo(600);
  });

  it('fora da folha vai para a borda; tamanho zero não divide por zero', () => {
    expect(normalizar(-20, 900, 600, 848)).toEqual({ x: 0, y: 1 });
    expect(normalizar(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('topo-esquerdo da tela vira o espaço do PDF (origem embaixo) nas 4 rotações', () => {
    const c = { x: 0, y: 0, largura: 100, altura: 200 };
    expect(paraPdf({ x: 0, y: 0 }, c, 0)).toEqual({ x: 0, y: 200 });
    expect(paraPdf({ x: 1, y: 1 }, c, 0)).toEqual({ x: 100, y: 0 });
    expect(paraPdf({ x: 0, y: 0 }, c, 90)).toEqual({ x: 0, y: 0 });
    expect(paraPdf({ x: 1, y: 0 }, c, 90)).toEqual({ x: 0, y: 200 });
    expect(paraPdf({ x: 0, y: 0 }, c, 180)).toEqual({ x: 100, y: 0 });
    expect(paraPdf({ x: 0, y: 0 }, c, 270)).toEqual({ x: 100, y: 200 });
    expect(paraPdf({ x: 0, y: 0 }, c, -90)).toEqual(paraPdf({ x: 0, y: 0 }, c, 270));
    // Caixa deslocada (cropBox fora da origem).
    expect(paraPdf({ x: 0, y: 1 }, { ...c, x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
  });

  it('largura VISTA troca de lado só a 90/270', () => {
    expect(larguraVisivel({ largura: 100, altura: 200 }, 0)).toBe(100);
    expect(larguraVisivel({ largura: 100, altura: 200 }, 90)).toBe(200);
    expect(larguraVisivel({ largura: 100, altura: 200 }, 270)).toBe(200);
  });

  it('auxiliares: cor, simplificação, vazia, nome da cópia', () => {
    expect(corRgb('#DC2626')).toEqual({ r: 220 / 255, g: 38 / 255, b: 38 / 255 });
    expect(corRgb('nada')).toEqual({ r: 0, g: 0, b: 0 });
    const pts = [{ x: 0, y: 0 }, { x: 0.0001, y: 0 }, { x: 0.0002, y: 0 }, { x: 0.5, y: 0.5 }];
    expect(simplificarTraco(pts)).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }]);
    expect(ehVazia({ id: 'x', tipo: 'texto', pagina: 1, x: 0, y: 0, texto: '  ', cor: '#000000', tamanho: 0.02 })).toBe(true);
    expect(nomeDaCopiaAnotada('REL-1.pdf')).toBe('REL-1 (anotado).pdf');
    expect(nomeDaCopiaAnotada('Relatório X')).toBe('Relatório X (anotado)');
  });
});

describe('aplicarAnotacoes (pdf-lib, só na cópia)', () => {
  it('gera um PDF válido, com o MESMO número e tamanho de páginas', async () => {
    const original = await pdfDeTeste();
    const copia = await aplicarAnotacoes(original, ANOTACOES);
    expect(new TextDecoder().decode(copia.slice(0, 5))).toBe('%PDF-');
    const lido = await PDFDocument.load(copia);
    const ref = await PDFDocument.load(original);
    expect(lido.getPageCount()).toBe(3);
    lido.getPages().forEach((p, i) => {
      expect(p.getSize()).toEqual(ref.getPage(i).getSize());
      expect(p.getRotation().angle).toBe(ref.getPage(i).getRotation().angle);
    });
    expect(sha(copia)).not.toBe(sha(original));
  });

  it('não toca nos bytes de entrada (o arquivo da emissão segue com o mesmo SHA)', async () => {
    const original = await pdfDeTeste();
    const antes = sha(original);
    await aplicarAnotacoes(original, ANOTACOES);
    expect(sha(original)).toBe(antes);
  });

  it('sem anotação que desenhe algo, devolve os MESMOS bytes', async () => {
    const original = await pdfDeTeste();
    expect(await aplicarAnotacoes(original, [])).toBe(original);
    const vazias: Anotacao[] = [{ id: 'v', tipo: 'texto', pagina: 1, x: 0, y: 0, texto: ' ', cor: '#000000', tamanho: 0.02 }];
    expect(await aplicarAnotacoes(original, vazias)).toBe(original);
  });

  it('caractere fora do WinAnsi vira "?" em vez de derrubar o download', () => {
    const fonte = {
      widthOfTextAtSize: (t: string) => {
        if (t === '≥') throw new Error('WinAnsi cannot encode');
        return 1;
      },
    };
    expect(textoCodificavel('a≥b', fonte)).toBe('a?b');
  });
});

describe('a cópia anotada de um documento ARQUIVADO não grava nada', () => {
  beforeEach(() => {
    baixarArtefato.mockReset();
    publicarArtefato.mockReset();
  });

  it('só LÊ o arquivo (baixarArtefato) e nunca publica', async () => {
    const original = await pdfDeTeste();
    baixarArtefato.mockResolvedValue(new Blob([original.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
    const artefato = { pdfRef: { path: 'org/relatorios/x.pdf' } } as never;
    const copia = await copiaAnotadaDoArtefato(artefato, ANOTACOES);
    expect(copia).not.toBeNull();
    expect((await PDFDocument.load(copia!)).getPageCount()).toBe(3);
    expect(baixarArtefato).toHaveBeenCalledTimes(1);
    expect(publicarArtefato).not.toHaveBeenCalled();
  });

  it('arquivo indisponível = null, sem exceção', async () => {
    baixarArtefato.mockResolvedValue(null);
    expect(await copiaAnotadaDoArtefato({ pdfRef: { path: 'x' } } as never, ANOTACOES)).toBeNull();
  });

  it('nenhum arquivo das anotações alcança storage, publicação, ponte ou fila', () => {
    const dir = join(process.cwd(), 'src/features/relatorios/anotacoes');
    const fontes = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(fontes.length).toBeGreaterThanOrEqual(5);
    const PROIBIDO = /services\/storage|services\/fotos|publicarArtefato|sbSalvar|localStorage|sessionStorage|indexedDB|gravar[A-Z]|salvarArquivo|pdfRef\s*[:=]|sha256\s*[:=]/;
    const achados = fontes.filter((f) => PROIBIDO.test(readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(achados).toEqual([]);
  });

  it('em Relatórios, o ramo com anotações baixa/imprime bytes e retorna — sem publicar nem salvar', () => {
    const rel = readFileSync(join(process.cwd(), 'src/pages/Relatorios.tsx'), 'utf8');
    const ramos = rel.split('if (anotacoes.lista.length > 0) {').slice(1).map((r) => r.slice(0, r.indexOf('return;')));
    expect(ramos).toHaveLength(2);
    for (const r of ramos) {
      expect(r).toContain('copiaAnotadaDoArtefato(');
      expect(r).not.toMatch(/publicarArtefato|salvarHistorico|gravar|setRelatorioArquivado|pdfRef/);
    }
  });
});
