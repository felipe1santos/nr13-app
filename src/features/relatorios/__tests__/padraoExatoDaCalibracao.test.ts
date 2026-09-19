import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import {
  anexarRastreabilidades,
  padraoExatoDaCalibracao,
  rastreabilidadesDoRelatorioAberto,
  rastreabilidadesParaRelatorio,
} from '../rastreabilidadeService';

/**
 * Calibrações · rodada final (19/09/2026) — O PDF DO PADRÃO É O EXATO USADO.
 *
 * O relatório anexava "o manômetro padrão ativo" (um por tipo). Com dois padrões
 * do mesmo tipo, ou depois de uma renovação, isso anexava o certificado errado.
 * Agora: calibração → padraoId (versão) → aquele certificado → aquele PDF.
 * Os PDFs de teste têm nº de páginas diferentes: o resultado final prova QUAL
 * arquivo entrou.
 */
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

async function pdf(paginas: number): Promise<string> {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([595, 842]);
  return d.saveAsBase64();
}
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

async function padrao(id: string, nome: string, cert: string, paginas: number, extra: Record<string, unknown> = {}) {
  gravar(`nr13_rastreab_${id}`, {
    id,
    nome,
    certificadoPadrao: cert,
    validade: '2027-01-31',
    tipoInstrumento: 'manometro',
    pdfBase64: await pdf(paginas),
    injetarNoRelatorio: true,
    criadoEm: '01/09/2026',
    ...extra,
  });
}
const calibracao = (id: string, padraoId?: string, extra: Record<string, unknown> = {}) =>
  gravar(`nr13_calibracao_item_${id}`, {
    id,
    tipo: 'manometro',
    origem: 'interna',
    ...(padraoId ? { padraoId } : {}),
    ...extra,
  });
const folha = (id: string) => `CERTIFICADO-CAL-MANOMETRO.html?calibId=${id}`;

async function paginasAnexadas(documentos: string[]): Promise<number> {
  const base = await PDFDocument.create();
  base.addPage([595, 842]);
  const r = await anexarRastreabilidades(await base.save(), documentos);
  return (await PDFDocument.load(r.bytes)).getPageCount() - 1;
}

beforeEach(() => localStorage.clear());

describe('dois padrões do MESMO tipo', () => {
  it('a calibração usou o PADRÃO B → o relatório anexa CERT-B / PDF B, nunca o A', async () => {
    await padrao('pad-A', 'PADRÃO A', 'CERT-A', 1);
    await padrao('pad-B', 'PADRÃO B', 'CERT-B', 3);
    calibracao('cal-1', 'pad-B');
    const escolhidos = rastreabilidadesParaRelatorio([folha('cal-1')]);
    expect(escolhidos.map((r) => r.certificadoPadrao)).toEqual(['CERT-B']);
    localStorage.removeItem('nr13_relatorio_meta_atual');
    expect(await paginasAnexadas([folha('cal-1')])).toBe(3); // PDF B tem 3 páginas; A tem 1
  });

  it('duas calibrações com padrões diferentes → os DOIS certificados, cada um o seu', async () => {
    await padrao('pad-A', 'PADRÃO A', 'CERT-A', 1);
    await padrao('pad-B', 'PADRÃO B', 'CERT-B', 3);
    calibracao('cal-1', 'pad-A');
    calibracao('cal-2', 'pad-B');
    expect(rastreabilidadesParaRelatorio([folha('cal-1'), folha('cal-2')]).map((r) => r.id).sort()).toEqual(['pad-A', 'pad-B']);
    expect(await paginasAnexadas([folha('cal-1'), folha('cal-2')])).toBe(4);
  });
});

describe('renovação C1 → C2 (histórico não muda)', () => {
  it('calibração 1 = C1/PDF C1; calibração 2 = C2/PDF C2', async () => {
    // P1 v1 com C1; renovado: v1 fica substituída, v2 com C2 (o que a tela Certificados faz)
    await padrao('p1-v1', 'P1', 'C1', 2, { substituidoEm: '10/09/2026' });
    await padrao('p1-v2', 'P1', 'C2', 5);
    calibracao('cal-antiga', 'p1-v1');
    calibracao('cal-nova', 'p1-v2');
    expect(rastreabilidadesParaRelatorio([folha('cal-antiga')]).map((r) => r.certificadoPadrao)).toEqual(['C1']);
    expect(rastreabilidadesParaRelatorio([folha('cal-nova')]).map((r) => r.certificadoPadrao)).toEqual(['C2']);
    expect(await paginasAnexadas([folha('cal-antiga')])).toBe(2);
    expect(await paginasAnexadas([folha('cal-nova')])).toBe(5);
  });

  it('relatório já gerado: os ids congelados na meta continuam resolvendo a versão da época', async () => {
    await padrao('p1-v1', 'P1', 'C1', 2, { substituidoEm: '10/09/2026' });
    await padrao('p1-v2', 'P1', 'C2', 5);
    gravar('nr13_relatorio_meta_atual', { rastreabIds: ['p1-v1'] });
    expect(rastreabilidadesDoRelatorioAberto([]).map((r) => r.certificadoPadrao)).toEqual(['C1']);
  });
});

describe('recuperação e casos de borda', () => {
  it('registro do padrão não encontrado → o pdfRef congelado na calibração, com os dados do snapshot', () => {
    const ref = { bucket: 'inspecao', path: 'org/certificados/c1.pdf', mimeType: 'application/pdf', tamanho: 9 };
    const r = padraoExatoDaCalibracao(
      { padraoId: 'sumiu', padraoPdfRef: ref, padraoInst: 'P1', padraoCert: 'C1', padraoVal: '31/01/2027' },
      new Map(),
    );
    expect(r).toMatchObject({ id: 'sumiu', certificadoPadrao: 'C1', pdfRef: ref });
  });

  it('o id congelado que sumiu é resolvido pelo snapshot da calibração na meta', () => {
    const ref = { bucket: 'inspecao', path: 'org/certificados/c1.pdf', mimeType: 'application/pdf', tamanho: 9 };
    gravar('nr13_relatorio_meta_atual', {
      rastreabIds: ['sumiu'],
      certCalibracoes: { 'cal-1': { padraoId: 'sumiu', padraoPdfRef: ref, padraoCert: 'C1' } },
    });
    expect(rastreabilidadesDoRelatorioAberto([]).map((r) => r.pdfRef?.path)).toEqual(['org/certificados/c1.pdf']);
  });

  it('calibração NOVA com padrão informado à mão → nenhum PDF (nunca "algum do tipo")', async () => {
    await padrao('pad-A', 'PADRÃO A', 'CERT-A', 1);
    calibracao('cal-1', undefined, { padraoInst: 'Digitado', padraoCert: 'X' });
    expect(rastreabilidadesParaRelatorio([folha('cal-1')])).toEqual([]);
  });

  it('calibração LEGADA (sem origem e sem padraoId) mantém o recuo antigo, por tipo', async () => {
    await padrao('pad-A', 'PADRÃO A', 'CERT-A', 1);
    gravar('nr13_calibracao_item_cal-leg', { id: 'cal-leg', tipo: 'manometro' });
    expect(rastreabilidadesParaRelatorio([folha('cal-leg')]).map((r) => r.id)).toEqual(['pad-A']);
  });

  it('o código não volta a resolver calibração nova só pelo tipo', () => {
    const src = readFileSync('src/features/relatorios/rastreabilidadeService.ts', 'utf8');
    expect(src).toContain('return !cal.padraoId && !cal.origem;');
    expect(src).toContain('if (ehLegadoSemPadrao(cal) && cal.tipo) tipos.add(tipoPadraoDoCertificado(cal.tipo));');
    const cal = readFileSync('src/features/calibracoes/padraoCalibracao.ts', 'utf8');
    expect(cal).toContain('padraoPdfRef: r.pdfRef');
  });
});
