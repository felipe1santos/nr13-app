import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anexarRastreabilidades } from '../rastreabilidadeService';
import type { Rastreabilidade } from '../rastreabilidadeService';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão de
// src/services/vencimentos.test.ts).
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

async function pdfBase64ComPaginas(n: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([595, 842]);
  return doc.saveAsBase64();
}

function gravarRegistro(r: Partial<Rastreabilidade> & { id: string }): void {
  localStorage.setItem(
    `nr13_rastreab_${r.id}`,
    JSON.stringify({
      nome: r.id,
      certificadoPadrao: '',
      validade: '',
      pdfBase64: '',
      injetarNoRelatorio: false,
      criadoEm: '',
      ...r,
    }),
  );
}

describe('anexarRastreabilidades', () => {
  beforeEach(() => localStorage.clear());

  it('anexa ao final as páginas dos PDFs marcados com "injetar no relatório"', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    const baseBytes = await base.save();
    gravarRegistro({ id: 'a', injetarNoRelatorio: true, pdfBase64: await pdfBase64ComPaginas(2) });
    gravarRegistro({ id: 'b', injetarNoRelatorio: false, pdfBase64: await pdfBase64ComPaginas(3) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(baseBytes);

    expect(anexados).toBe(1);
    expect(falhas).toEqual([]);
    const final = await PDFDocument.load(bytes);
    expect(final.getPageCount()).toBe(3); // 1 do relatório + 2 do certificado marcado
  });

  it('marcado SEM pdfBase64 (perdido por cota do localStorage) entra em falhas — nunca some em silêncio', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarRegistro({ id: 'cert-sumido', nome: 'Manômetro MP-01', injetarNoRelatorio: true, pdfBase64: '' });

    const { anexados, falhas } = await anexarRastreabilidades(await base.save());

    expect(anexados).toBe(0);
    expect(falhas).toEqual(['Manômetro MP-01']);
  });

  it('sem nenhum marcado devolve os bytes originais intocados', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    const baseBytes = await base.save();
    gravarRegistro({ id: 'a', injetarNoRelatorio: false, pdfBase64: await pdfBase64ComPaginas(1) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(baseBytes);

    expect(anexados).toBe(0);
    expect(falhas).toEqual([]);
    expect(bytes).toEqual(new Uint8Array(baseBytes));
  });

  it('PDF ilegível entra em falhas e não derruba os demais', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarRegistro({ id: 'ruim', nome: 'Corrompido', injetarNoRelatorio: true, pdfBase64: 'data:application/pdf;base64,QUJD' });
    gravarRegistro({ id: 'bom', nome: 'Ok', injetarNoRelatorio: true, pdfBase64: await pdfBase64ComPaginas(1) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(await base.save());

    expect(anexados).toBe(1);
    expect(falhas).toEqual(['Corrompido']);
    const final = await PDFDocument.load(bytes);
    expect(final.getPageCount()).toBe(2);
  });
});
