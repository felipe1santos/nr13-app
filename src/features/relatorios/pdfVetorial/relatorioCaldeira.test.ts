/**
 * RELATÓRIO DE CALDEIRA FLAMOTUBULAR — ponta a ponta com a CAL-25/5340
 * (22/10/2026).
 *
 * Os dados são os do relatório de referência (TP.P/RI/C/ME/EA.0193.22). O
 * documento é gerado DE VERDADE (fonte embutida, anexos copiados pelo pdf-lib)
 * e lido de volta com pdf.js: a ordem das seções é a do sumário da referência
 * e cada número que o engenheiro conferiria está no papel.
 *
 * `NR13_DUMP_PDF=<prefixo>` grava o PDF para a comparação visual.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

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

// O cofre devolve um PDF de 2 páginas para qualquer referência: é a ART e o
// prontuário de fabricação desta massa.
let ANEXO_PDF: Uint8Array;
vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async () => new Blob([ANEXO_PDF as unknown as BlobPart], { type: "application/pdf" }),
  };
});
vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import { DOCUMENTOS_CALDEIRA } from '../../equipamento/perfilEquipamento';
import { CATALOGO_CALDEIRA } from '../../caldeira/itensVisuaisCaldeira';

const TAG = 'CAL-25-5340';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

function linhas(valores: number[][], pontos = ['A', 'B', 'C', 'D']): Record<string, string> {
  const out: Record<string, string> = {};
  pontos.forEach((p, i) => valores[i].forEach((v, j) => (out[`${p}|${j + 1}`] = String(v).replace('.', ','))));
  return out;
}
const lista = (v: number[]) => Object.fromEntries(v.map((x, i) => [String(i + 1), String(x).replace('.', ',')]));

export function montarCal25(): void {
  localStorage.clear();
  gravar(`nr13_info_${TAG}`, {
    tag: TAG, tipo: 'caldeira', subtipo: 'flamotubular', fabricante: 'COCHRAN Ltd.', numeroSerie: '25/5340',
    ano: '2011', codigoProjeto: 'ASME Seção I', edicao: '2010', adenda: '---', localizacao: 'Contêiner',
    pmoAdotadaMpa: '0.99', pmtaAdotadaMpa: '1.10', pthAdotadaMpa: '1.65',
  });
  gravar(`nr13_pref_unidade_${TAG}`, 'PETROBRAS');
  gravar(`nr13_emp_${TAG}`, { razaoSocial: 'Schlumberger Serviços de Petróleo Ltda', endereco: 'Rua Internacional, 500', bairro: 'Novo Cavaleiro', cidade: 'Macaé', estado: 'RJ' });
  gravar(`nr13_calc_${TAG}`, { pmta: '1.10', pth: '1.65', memorialHTML: '' });
  gravar(`nr13_vaso_cald_${TAG}`, {
    tag: TAG, P: 1.1, temp: 184,
    costado: { mat: 'SA-516 Gr.65', S: 108, E: 0.9, D: 1510, C: 0.75, y: 0.4, espEncontrada: 10.24 },
    tubo: { mat: 'SA-106 B', S: 118, D: 50.8, espEncontrada: 3.9 },
    espelho: { mat: 'SA-516 Gr.65', S: 108, passo: 148, cEstais: 2.2, espEncontrada: 18.62 },
  });
  gravar(`nr13_ficha_caldeira_${TAG}`, {
    modelo: '6.2MMBtu',
    corpo: { material: 'SA-516 Gr. 65', tipoConstrucao: 'Soldada', descricao: 'Cilindro horizontal', comprimento: '2975', espessuraNominal: '10,24', eficienciaJunta: '0,90' },
    espelhos: { tipo: 'Estaiado', material: 'SA-516 Gr. 65', diametro: '1490', espessuraDianteiro: '18,62', espessuraTraseiro: '18,95' },
    fornalha: { tipo: 'Soldada', diametro: '850', material: 'SA-516 Gr. 65', espessura: '18,07' },
    tubos: { quantidade: '60', construcao: 'Mandrilhado/Soldado', diametro: '2"', material: 'SA-106 Gr. B' },
    passes: '3', vazao: '2720', tipoVapor: 'Saturado', fonteEnergia: 'Diesel', tiragem: 'Indução natural', alimentacaoAgua: 'Automático',
    controles: { agua: 'Automático', ar: 'Automático', combustivel: 'Automático', ignicao: 'Automático' },
    indicadorPressao: { identificacao: 'PI-CAL-25/5340', fabricante: 'Stewarts', tipo: 'Analógico', escala: '0 - 20 bar', diametro: '4"', localizacao: 'Corpo', divisao: '0,5 bar' },
    alivio1: { identificacao: 'PSV-CAL-25/5340', material: 'Aço', dimensao: '1.1/4" x 2"', tipo: 'Convencional', pressaoAbertura: '10,8 bar' },
    chamine: { quantidade: '01', altura: '765' },
  });
  gravar(`nr13_fotos_${TAG}`, [{ id: 1, src: PIXEL, isCapa: true }]);
  gravar('nr13_minha_empresa', { razao: 'EXECUTANTE ZZ', cidade: 'Macaé' });
  gravar(`nr13_pront_fab_${TAG}`, { nome: 'fabricante.pdf', pdfRef: { bucket: 'inspecao', path: 'org/fab.pdf', mimeType: 'application/pdf', tamanho: 10 }, enviadoEm: '2026-10-22' });
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-1790000000000', emissao: '29/03/2022', execucaoInspecao: '29/03/2022', tipoInspecao: 'Inspeção Periódica',
    proximaInspecaoInterna: '29/03/2023', proximaInspecaoExterna: '29/03/2023', art: '2020220135071', containerOrigemId: 'c1',
    artAnexo: { ref: { bucket: 'inspecao', path: 'org/art.pdf', mimeType: 'application/pdf', tamanho: 10 }, nome: 'art.pdf', sha256: 'x', anexadoEm: '2026-10-22' },
    documentos: DOCUMENTOS_CALDEIRA,
  });
  gravar(`nr13_laudo_${TAG}`, { apto: true, relatorioCodigo: 'REL-1790000000000', atualizadoEm: '2026-10-22' });
  const exame = (n: number) => ({ catalogo: CATALOGO_CALDEIRA, semanticaNc: 1, itens: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 'nao'])), resultado: 'aprovado', fotos: [{ id: 'f', ordem: 0, base64: PIXEL, descricao: 'FOTO' }] });
  const dados = {
    visual_externo: exame(16),
    visual_interno: exame(11),
    ultrassom: {
      resultado: 'aprovado',
      caldeira: {
        corpo: linhas([[10.26, 10.28, 10.27, 10.3], [10.24, 10.32, 10.28, 10.34], [10.25, 10.24, 10.3, 10.24], [10.25, 10.27, 10.3, 10.32]]),
        fornalha: linhas([[18.07, 18.14, 18.13, 18.19], [18.12, 18.13, 18.13, 18.19], [18.15, 18.8, 18.42, 18.22], [18.55, 18.1, 18.13, 18.27]]),
        chamine: lista([6.12, 6.2, 6.22, 6.13]),
        reversao: lista([19.02, 19.04, 19.13, 19.02]),
        espelhoDianteiro: lista([19.2, 19.11, 19.15, 19.14, 19.09, 18.62, 18.65, 18.95, 18.93, 18.75]),
        espelhoTraseiro: lista([19.4, 19.32, 19.21, 19.54, 19.65, 19.32, 19.42, 18.99, 18.95, 19.42]),
      },
    },
    th: { dataTeste: '2022-03-29', pressaoTeste: '16,5', unidade: 'PETROBRAS', fluido: 'Água', resultado: 'aprovado', curva: [{ tempo: '0', pressao: '0' }, { tempo: '15', pressao: '16,5' }], fotos: [] },
    acumulacao: {
      dataEnsaio: '2022-06-08', contratante: 'Schlumberger', identificacao: TAG, tipoEquipamento: 'Caldeira Flamotubular',
      instrumento: 'Manômetro', instrumentoFabricante: 'Stewarts', instrumentoTipo: 'Analógico', instrumentoIdentificacao: 'PI-CAL-25/5340',
      instrumentoEscala: '0 a 20 bar', instrumentoValidade: '2023-03-29', tempoEstabilizacaoMin: '5', horaInicio: '09:47', horaTermino: '10:10',
      pressaoMaxima: '10,80', pressaoUnidade: 'bar', valvulasSuficientes: 'sim', ncEncontrada: 'nao', laudo: 'Equipamento aprovado no ensaio de acumulação.',
      resultado: 'aprovado', procedimento: 'POP-TP-003', normas: 'NBR 12177 / NR-13', fotos: [],
    },
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
}

async function textos(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

let paginas: string[] = [];
let total = 0;

beforeAll(async () => {
  const anexo = await PDFDocument.create();
  anexo.addPage([595, 842]);
  anexo.addPage([595, 842]);
  ANEXO_PDF = await anexo.save();
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
  class ImagemFalsa {
    naturalWidth = 4;
    naturalHeight = 3;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImagemFalsa);
  montarCal25();
  const r = await gerarRelatorioVetorial(TAG, { documentos: [...DOCUMENTOS_CALDEIRA], certificados: true, modo: 'final' });
  if (process.env.NR13_DUMP_PDF) writeFileSync(`${process.env.NR13_DUMP_PDF}.pdf`, r.bytes);
  paginas = await textos(r.bytes);
  total = r.paginas;
}, 300_000);

const pagina = (trecho: string) => paginas.findIndex((p) => p.includes(trecho));

describe('relatório de caldeira CAL-25/5340', () => {
  it('as seções saem na ORDEM do sumário da referência', () => {
    const ordem = [
      'SUMÁRIO',
      '1.1 PRONTUÁRIO',
      '1.2 INSTRUMENTOS DE SEGURANÇA E ACESSÓRIOS',
      '1.3 RELATÓRIO DE INSPEÇÃO',
      '1.4 EXAME VISUAL EXTERNO',
      '1.5 EXAME VISUAL INTERNO',
      '1.6 CÁLCULO DE PRESSÃO INTERNA — CORPO',
      '2.1 MEDIÇÃO DE ESPESSURA',
      '2.2 ENSAIO DE ACUMULAÇÃO',
      '3. TESTE DE SOBREPRESSÃO',
      '4. CERTIFICADOS DE CALIBRAÇÃO',
      '5. PRONTUÁRIO DE FABRICAÇÃO',
      '6. ART',
    ].map(pagina);
    expect(ordem.every((p) => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('prontuário: construção, operação, pressões nas 4 unidades e controles', () => {
    const p = paginas.slice(pagina('1.1 PRONTUÁRIO'), pagina('1.2 INSTRUMENTOS')).join(' ');
    for (const v of ['6.2MMBtu', 'COCHRAN Ltd.', 'ASME Seção I', 'Estaiado', '1490', '18,95', '850', '60', 'SA-106 Gr. B', '2720', 'Saturado', 'Diesel', '0,99', '1,10', '1,65', '11,00', '16,50', '9,90', 'AUTOMÁTICO']) {
      expect(p, v).toContain(v);
    }
  });

  it('relatório de inspeção: categoria B, ensaios com nº rastreável e laudo, pressostato na lista', () => {
    const p = paginas[pagina('1.3 RELATÓRIO DE INSPEÇÃO')] + ' ' + paginas[pagina('1.3 RELATÓRIO DE INSPEÇÃO') + 1];
    expect(p).toContain('REL-1790000000000/RI');
    expect(p).toMatch(/CATEGORIA\s+B/);
    expect(p).toContain('REL-1790000000000/ME');
    expect(p).toContain('REL-1790000000000/EA');
    expect(p).toContain('REL-1790000000000/TS');
    expect(p).toContain('Pressostato');
    expect(p).toContain('ENSAIO DE ACUMULAÇÃO');
    expect(p).not.toContain('13.4.4.11');
  });

  it('cálculos: corpo 12,28 bar / t mín 9,26 mm; espelhos 37,61 e 38,95 bar; t mín 10,07', () => {
    const corpo = paginas[pagina('1.6 CÁLCULO DE PRESSÃO INTERNA — CORPO')];
    expect(corpo).toContain('12,28');
    expect(corpo).toContain('9,26');
    expect(corpo).toContain('APROVADO');
    const d = paginas[pagina('ESPELHO DIANTEIRO')];
    expect(d).toContain('37,61');
    expect(d).toContain('10,07');
    const t = paginas[pagina('ESPELHO TRASEIRO')];
    expect(t).toContain('38,95');
  });

  it('medição: mínimas e máximas por região da referência', () => {
    const p = paginas.slice(pagina('2.1 MEDIÇÃO'), pagina('2.2 ENSAIO')).join(' ');
    for (const v of ['10,24', '10,34', '18,07', '18,80', '18,62', '19,20', '18,95', '19,65', '19,02', '19,13', '6,12', '6,22']) expect(p, v).toContain(v);
  });

  it('acumulação com o rastreável próprio, e os anexos entram depois das divisórias', () => {
    expect(paginas[pagina('2.2 ENSAIO DE ACUMULAÇÃO')]).toContain('REL-1790000000000/EA');
    // ART (2 páginas) e fabricação (2 páginas) inseridas logo após as divisórias.
    expect(pagina('6. ART')).toBe(pagina('5. PRONTUÁRIO DE FABRICAÇÃO') + 3);
    expect(total).toBe(paginas.length);
  });

  it('a numeração do corpo continua certa depois dos anexos (Página X de Y)', () => {
    const ult = paginas.length;
    const corpoDepois = paginas.findIndex((p, i) => i > pagina('6. ART') && /Página \d+ de \d+/.test(p));
    if (corpoDepois >= 0) expect(paginas[corpoDepois]).toContain(`Página ${corpoDepois + 1} de ${ult}`);
    expect(paginas[pagina('6. ART')]).toContain(`Página ${pagina('6. ART') + 1} de ${ult}`);
  });
});
