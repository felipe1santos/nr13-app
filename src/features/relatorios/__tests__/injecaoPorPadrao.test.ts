import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { anexarRastreabilidades, rastreabilidadesParaRelatorio } from '../rastreabilidadeService';
import { guardarPdf } from '../../../services/pdfStore';
import type { TipoInstrumento } from '../rastreabilidadeService';

/**
 * Item por item: para CADA um dos três padrões com rota de injeção, prova que
 * — marcado — o PDF entra no fim do relatório, e que — desmarcado na caixinha
 * "Injetar no final do relatório" — ele deixa de entrar. A verificação é feita
 * no PDF resultante (contagem de páginas), não no meio do caminho.
 */

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

async function pdfComPaginas(n: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([595, 842]);
  return doc.saveAsBase64();
}

/** Um padrão por tipo, com o documento do relatório que o puxa. */
const CASOS: { tipo: TipoInstrumento; rotulo: string; documento: string; calib?: 'manometro' | 'psv' }[] = [
  { tipo: 'ultrassom', rotulo: 'Bloco padrão de espessura', documento: 'ULTRASSOM.html' },
  { tipo: 'manometro', rotulo: 'Manômetro padrão', documento: 'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1', calib: 'manometro' },
  { tipo: 'valvula', rotulo: 'Válvula PSV padrão', documento: 'CERTIIFCADO-CAL-PSV.html?calibId=cal-1', calib: 'psv' },
];

const PAGINAS_DO_CERTIFICADO = 2;
const PAGINAS_DO_RELATORIO = 3;

async function montarCenario(
  tipo: TipoInstrumento,
  marcado: boolean,
  calib?: 'manometro' | 'psv',
): Promise<Uint8Array> {
  localStorage.clear();
  if (calib) localStorage.setItem('nr13_calibracao_item_cal-1', JSON.stringify({ id: 'cal-1', tipo: calib }));
  // Registro como fica no cache real: enxuto, com o PDF no pdfStore.
  localStorage.setItem(
    `nr13_rastreab_${tipo}`,
    JSON.stringify({
      id: tipo,
      nome: `Padrão de ${tipo}`,
      certificadoPadrao: 'CERT-1',
      validade: '2027-01-01',
      pdfBase64: '',
      temPdf: true,
      injetarNoRelatorio: marcado,
      criadoEm: '20/07/2026',
      tipoInstrumento: tipo,
    }),
  );
  await guardarPdf(`nr13_rastreab_${tipo}`, await pdfComPaginas(PAGINAS_DO_CERTIFICADO));

  const relatorio = await PDFDocument.create();
  for (let i = 0; i < PAGINAS_DO_RELATORIO; i++) relatorio.addPage([595, 842]);
  return relatorio.save();
}

beforeEach(() => localStorage.clear());

describe.each(CASOS)('$rotulo ($tipo)', ({ tipo, documento, calib }) => {
  it('MARCADO: o PDF do padrão entra no fim do relatório', async () => {
    const base = await montarCenario(tipo, true, calib);

    // 1) o padrão é selecionado para este relatório
    const selecionados = rastreabilidadesParaRelatorio([documento]);
    expect(selecionados.map((r) => r.tipoInstrumento)).toEqual([tipo]);

    // 2) e o arquivo realmente vai parar no PDF final
    const { bytes, anexados, falhas } = await anexarRastreabilidades(base, [documento]);
    expect(falhas).toEqual([]);
    expect(anexados).toBe(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(
      PAGINAS_DO_RELATORIO + PAGINAS_DO_CERTIFICADO,
    );
  });

  it('DESMARCADO: o relatório sai sem o certificado e sem reclamar', async () => {
    const base = await montarCenario(tipo, false, calib);

    expect(rastreabilidadesParaRelatorio([documento])).toEqual([]);

    const { bytes, anexados, falhas } = await anexarRastreabilidades(base, [documento]);
    expect(anexados).toBe(0);
    // Desmarcar é escolha do usuário, não perda de arquivo: NÃO pode virar aviso de falha.
    expect(falhas).toEqual([]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(PAGINAS_DO_RELATORIO);
  });
});

describe('vários padrões no mesmo relatório', () => {
  it('injeta só os marcados quando o relatório puxa os três tipos', async () => {
    localStorage.clear();
    localStorage.setItem('nr13_calibracao_item_cal-m', JSON.stringify({ id: 'cal-m', tipo: 'manometro' }));
    localStorage.setItem('nr13_calibracao_item_cal-v', JSON.stringify({ id: 'cal-v', tipo: 'psv' }));

    for (const [tipo, marcado] of [['ultrassom', true], ['manometro', false], ['valvula', true]] as const) {
      localStorage.setItem(
        `nr13_rastreab_${tipo}`,
        JSON.stringify({
          id: tipo, nome: `Padrão ${tipo}`, certificadoPadrao: '', validade: '', pdfBase64: '',
          temPdf: true, injetarNoRelatorio: marcado, criadoEm: '20/07/2026', tipoInstrumento: tipo,
        }),
      );
      await guardarPdf(`nr13_rastreab_${tipo}`, await pdfComPaginas(PAGINAS_DO_CERTIFICADO));
    }

    const docs = [
      'ULTRASSOM.html',
      'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-m',
      'CERTIIFCADO-CAL-PSV.html?calibId=cal-v',
    ];
    const relatorio = await PDFDocument.create();
    relatorio.addPage([595, 842]);

    const { bytes, anexados, falhas } = await anexarRastreabilidades(await relatorio.save(), docs);

    expect(anexados).toBe(2); // ultrassom + valvula; o manômetro está desmarcado
    expect(falhas).toEqual([]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1 + 2 * PAGINAS_DO_CERTIFICADO);
  });
});
