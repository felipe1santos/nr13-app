import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  anexarRastreabilidades,
  rastreabilidadesParaRelatorio,
  tiposPadraoDoRelatorio,
} from '../rastreabilidadeService';
import type { Rastreabilidade } from '../rastreabilidadeService';
import { guardarPdf } from '../../../services/pdfStore';

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
      // Espelha o que o app grava: todo certificado nasce marcado para injeção
      // (a caixinha da tela Certificados só serve para DESmarcar).
      injetarNoRelatorio: true,
      criadoEm: '',
      ...r,
    }),
  );
}

function gravarCertificado(id: string, tipo: 'manometro' | 'psv'): void {
  localStorage.setItem(`nr13_calibracao_item_${id}`, JSON.stringify({ id, tipo }));
}

describe('tiposPadraoDoRelatorio', () => {
  beforeEach(() => localStorage.clear());

  it('deriva os tipos das folhas de certificado (?calibId=) e da folha de ultrassom', () => {
    gravarCertificado('cal-1', 'manometro');
    gravarCertificado('cal-2', 'manometro');
    gravarCertificado('cal-3', 'psv');
    const docs = [
      'CAPA.html',
      'ULTRASSOM.html',
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-2',
      'CERTIIFCADO-CAL-PSV.html?calibId=cal-3',
    ];
    expect(tiposPadraoDoRelatorio(docs).sort()).toEqual(['manometro', 'ultrassom', 'valvula']);
  });

  it('sem calibração e sem ultrassom, nenhum tipo é exigido', () => {
    expect(tiposPadraoDoRelatorio(['CAPA.html', 'CONCLUSAO.html'])).toEqual([]);
  });
});

describe('rastreabilidadesParaRelatorio', () => {
  beforeEach(() => localStorage.clear());

  it('seleciona UM certificado padrão por tipo presente no relatório', async () => {
    gravarCertificado('cal-1', 'manometro');
    gravarCertificado('cal-2', 'psv');
    gravarRegistro({ id: 'man', tipoInstrumento: 'manometro', pdfBase64: await pdfBase64ComPaginas(1) });
    gravarRegistro({ id: 'val', tipoInstrumento: 'valvula', pdfBase64: await pdfBase64ComPaginas(1) });
    gravarRegistro({ id: 'us', tipoInstrumento: 'ultrassom', pdfBase64: await pdfBase64ComPaginas(1) });

    const docs = [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
      'CERTIIFCADO-CAL-PSV.html?calibId=cal-2',
    ];
    const sel = rastreabilidadesParaRelatorio(docs);
    expect(sel.map((r) => r.tipoInstrumento).sort()).toEqual(['manometro', 'valvula']);
  });

  it('duplicatas do mesmo tipo: vence quem tem PDF; empate, o mais recente', async () => {
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'sem-pdf', tipoInstrumento: 'manometro', criadoEm: '01/07/2026' });
    gravarRegistro({ id: 'antigo', tipoInstrumento: 'manometro', criadoEm: '01/06/2026', pdfBase64: await pdfBase64ComPaginas(1) });
    gravarRegistro({ id: 'novo', tipoInstrumento: 'manometro', criadoEm: '10/07/2026', pdfBase64: await pdfBase64ComPaginas(1) });

    const sel = rastreabilidadesParaRelatorio(['CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1']);
    expect(sel).toHaveLength(1);
    expect(sel[0].id).toBe('novo');
  });
});

describe('anexarRastreabilidades', () => {
  beforeEach(() => localStorage.clear());

  it('anexa ao final os PDFs padrão dos tipos presentes nos documentos', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    const baseBytes = await base.save();
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'man', tipoInstrumento: 'manometro', pdfBase64: await pdfBase64ComPaginas(2) });
    gravarRegistro({ id: 'val', tipoInstrumento: 'valvula', pdfBase64: await pdfBase64ComPaginas(3) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(baseBytes, [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
    ]);

    expect(anexados).toBe(1);
    expect(falhas).toEqual([]);
    const final = await PDFDocument.load(bytes);
    expect(final.getPageCount()).toBe(3); // 1 do relatório + 2 do padrão de manômetro
  });

  // Regressão da separação do campo pesado (PDF no IndexedDB — ver services/storage.ts):
  // no cache local o registro fica com pdfBase64 vazio e temPdf=true. Se o anexo passasse
  // a olhar só o campo do registro, TODO relatório sairia sem os certificados.
  it('anexa o PDF de registro ENXUTO (pdfBase64 vazio + temPdf, arquivo no pdfStore)', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({
      id: 'man-enxuto',
      nome: 'Manômetro MP-01',
      tipoInstrumento: 'manometro',
      pdfBase64: '',
      temPdf: true,
    });
    await guardarPdf('nr13_rastreab_man-enxuto', await pdfBase64ComPaginas(2));

    const { bytes, anexados, falhas } = await anexarRastreabilidades(await base.save(), [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
    ]);

    expect(falhas).toEqual([]);
    expect(anexados).toBe(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  it('registro enxuto cujo PDF sumiu do pdfStore entra em falhas', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'sem-arquivo', nome: 'Manômetro sumido', tipoInstrumento: 'manometro', pdfBase64: '', temPdf: true });

    const { anexados, falhas } = await anexarRastreabilidades(await base.save(), [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
    ]);

    expect(anexados).toBe(0);
    expect(falhas).toEqual(['Manômetro sumido']);
  });

  // Caixinha "Injetar no final do relatório" (tela Certificados).
  it('padrão com a caixinha DESMARCADA não é injetado', async () => {
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'man', tipoInstrumento: 'manometro', temPdf: true, injetarNoRelatorio: false });

    expect(rastreabilidadesParaRelatorio(['CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1'])).toEqual([]);
  });

  it('registro SEM o campo injetarNoRelatorio continua sendo injetado (default marcado)', async () => {
    gravarCertificado('cal-1', 'manometro');
    localStorage.setItem(
      'nr13_rastreab_antigo',
      // registro legado: nem sabe que a caixinha existe
      JSON.stringify({ id: 'antigo', nome: 'Legado', certificadoPadrao: '', validade: '', pdfBase64: '', temPdf: true, criadoEm: '', tipoInstrumento: 'manometro' }),
    );

    const sel = rastreabilidadesParaRelatorio(['CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1']);
    expect(sel.map((r) => r.nome)).toEqual(['Legado']);
  });

  it('desmarcado não rouba a vaga do tipo: o marcado ainda entra', async () => {
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'off', nome: 'Desmarcado', tipoInstrumento: 'manometro', temPdf: true, criadoEm: '30/07/2026', injetarNoRelatorio: false });
    gravarRegistro({ id: 'on', nome: 'Marcado', tipoInstrumento: 'manometro', temPdf: true, criadoEm: '01/06/2026', injetarNoRelatorio: true });

    const sel = rastreabilidadesParaRelatorio(['CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1']);
    expect(sel.map((r) => r.nome)).toEqual(['Marcado']);
  });

  it('desempate entre versões do mesmo tipo respeita o marcador temPdf', async () => {
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'vazio', nome: 'Sem arquivo', tipoInstrumento: 'manometro', criadoEm: '10/07/2026' });
    gravarRegistro({ id: 'enxuto', nome: 'Com arquivo', tipoInstrumento: 'manometro', criadoEm: '01/06/2026', temPdf: true });

    const sel = rastreabilidadesParaRelatorio(['CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1']);
    expect(sel.map((r) => r.nome)).toEqual(['Com arquivo']); // vence quem TEM PDF, mesmo mais antigo
  });

  it('tipo exigido SEM pdfBase64 (perdido por cota do localStorage) entra em falhas — nunca some em silêncio', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarCertificado('cal-1', 'manometro');
    gravarRegistro({ id: 'cert-sumido', nome: 'Manômetro MP-01', tipoInstrumento: 'manometro', pdfBase64: '' });

    const { anexados, falhas } = await anexarRastreabilidades(await base.save(), [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
    ]);

    expect(anexados).toBe(0);
    expect(falhas).toEqual(['Manômetro MP-01']);
  });

  it('sem tipo presente nos documentos devolve os bytes originais intocados', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    const baseBytes = await base.save();
    gravarRegistro({ id: 'man', tipoInstrumento: 'manometro', pdfBase64: await pdfBase64ComPaginas(1) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(baseBytes, ['CAPA.html']);

    expect(anexados).toBe(0);
    expect(falhas).toEqual([]);
    expect(bytes).toEqual(new Uint8Array(baseBytes));
  });

  it('PDF ilegível entra em falhas e não derruba os demais', async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    gravarCertificado('cal-1', 'manometro');
    gravarCertificado('cal-2', 'psv');
    gravarRegistro({ id: 'ruim', nome: 'Corrompido', tipoInstrumento: 'manometro', pdfBase64: 'data:application/pdf;base64,QUJD' });
    gravarRegistro({ id: 'bom', nome: 'Ok', tipoInstrumento: 'valvula', pdfBase64: await pdfBase64ComPaginas(1) });

    const { bytes, anexados, falhas } = await anexarRastreabilidades(await base.save(), [
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1',
      'CERTIIFCADO-CAL-PSV.html?calibId=cal-2',
    ]);

    expect(anexados).toBe(1);
    expect(falhas).toEqual(['Corrompido']);
    const final = await PDFDocument.load(bytes);
    expect(final.getPageCount()).toBe(2);
  });
});
