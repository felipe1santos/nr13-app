/**
 * E2E DO PAPEL · dois equipamentos, duas unidades (16/09/2026).
 *
 * Este arquivo gera DOIS relatórios de verdade — o gerador inteiro, duas
 * passagens, fonte embutida — e lê o TEXTO extraído dos bytes com pdf.js. Não
 * olha modelo, não olha canvas: olha o que está impresso.
 *
 * O que ele prova, e por que cada coisa precisa de prova própria:
 *
 * 1. **A unidade do equipamento chega ao papel.** O relatório nunca consultou
 *    `nr13_pref_unidade_<TAG>`: imprimia MPa · psi · kgf/cm² · bar lado a lado.
 * 2. **Uma não vaza para a outra.** Os dois documentos saem do mesmo processo,
 *    do mesmo módulo e de um `localStorage` compartilhado. Estado de módulo mal
 *    guardado faria o segundo herdar a unidade do primeiro — e essa é a classe
 *    de defeito que um teste de um equipamento só nunca pega.
 * 3. **A CATEGORIA NÃO SE MOVE.** kPa·m³ no enquadramento e MPa·m³ no grupo de
 *    risco, nos DOIS documentos, seja qual for a unidade. São as unidades que
 *    definem o resultado da categoria, não formatação.
 * 4. **Nada de `NaN`, `undefined` ou `[object Object]`** no papel.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    blobParaDataUrl: async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC',
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
import type { CategoriaSalva, InfoEquipamento } from '../../equipamento/tipos';
import type { SistemaUnidade } from '../../../calc/unidades';

/** Os dois equipamentos ZZ do gate, com unidades DIFERENTES. */
const SI = { tag: 'ZZ-UNIDADE-SI', unidade: 'SI' as SistemaUnidade, rotulo: 'MPa' };
const ALT = { tag: 'ZZ-UNIDADE-ALT', unidade: 'TECNICO' as SistemaUnidade, rotulo: 'kgf/cm²' };

/**
 * A MESMA pressão física nos dois. É o que permite comparar: se os números
 * saíssem diferentes por serem dados diferentes, o teste não provaria nada
 * sobre unidade.
 */
const PMTA_MPA = 2.2;
const PTH_MPA = 2.86;
const PMO_MPA = 1.75;

/** 2,2 MPa em cada unidade, com as casas que o documento usa. */
const ESPERADO = {
  SI: { pmta: '2.200', pth: '2.860', pmo: '1.750' },
  TECNICO: { pmta: '22.43', pth: '29.16', pmo: '17.85' },
};

const DOCUMENTOS = [
  'CAPA.html',
  'PLACA.html',
  'CLASSIFICACAO-RISCO.html',
  'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html',
  'INSPECOES.html',
  'CONCLUSAO.html',
];

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function montar(eq: { tag: string; unidade: SistemaUnidade }) {
  const info: InfoEquipamento = {
    tag: eq.tag,
    tipo: 'vaso',
    subtipo: 'vertical',
    descricao: `DESCRICAO-${eq.tag}`,
    fabricante: 'FABRICANTE-UNID',
    ano: '2024',
    numeroSerie: `SERIE-${eq.tag}`,
    codigoProjeto: 'PROJ-UNID-ASME',
    // As pressões ADOTADAS, canônicas em MPa — as MESMAS nos dois equipamentos.
    pmtaAdotadaMpa: String(PMTA_MPA),
    pthAdotadaMpa: String(PTH_MPA),
    pmoAdotadaMpa: String(PMO_MPA),
  };
  const categoria: CategoriaSalva = {
    classe: 'A',
    grupo: 4,
    // 2,2 MPa × 1,25 m³. Os DOIS produtos são gravados pela categorização e
    // saem crus no papel — é o que este teste exige que não mude.
    PV_cat: '2.7500',
    PV_enq: '2750.0000',
    isEnquadrado: true,
    catFinal: 'III',
    volInput: 1.25,
    presInput: 2.2,
    unidInput: 'SI',
    fluidoInput: 'A - Fluido inflamável, combustível (T ≥ 200 °C)',
  };

  gravar(`nr13_info_${eq.tag}`, info);
  gravar(`nr13_cat_${eq.tag}`, categoria);
  gravar(`nr13_emp_${eq.tag}`, { razaoSocial: 'CLIENTE-UNID LTDA', cidade: 'CIDADE-UNID' });
  gravar(`nr13_calc_${eq.tag}`, { pmta: '2.33', pth: '3.02', memorialHTML: '', componentes: [] });
  gravar(`nr13_vaso_${eq.tag}`, { tag: eq.tag, P: 1.9, D: 1000, componentes: [] });
  // A CHAVE DESTA RODADA.
  gravar(`nr13_pref_unidade_${eq.tag}`, eq.unidade);
}

/** O texto de todas as páginas do PDF, concatenado. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    partes.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return partes.join('\n');
}

async function papelDe(eq: { tag: string; unidade: SistemaUnidade }): Promise<string> {
  gravar('nr13_relatorio_meta_atual', {
    codigo: `REL-UNID-${eq.unidade}`,
    emissao: '16/09/2026',
    validade: '16/09/2027',
    execucaoInspecao: '16/09/2026',
    tipoInspecao: 'Inspeção Periódica',
    documentos: DOCUMENTOS,
  });
  const r = await gerarRelatorioVetorial(eq.tag, { documentos: DOCUMENTOS, certificados: false });
  return textoDoPdf(r.bytes);
}

let papelSi = '';
let papelAlt = '';

beforeAll(async () => {
  zerarCacheFontes();
  // A fonte vem do disco, como em `emissaoVetorial.test.ts`: o PDF carrega o
  // TTF real, senão o texto não seria texto e não haveria o que extrair.
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });
  // Em node não há `Image`; a proporção da foto não é o que este gate mede.
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

  localStorage.clear();
  montar(SI);
  montar(ALT);
  // Gerados NA MESMA sessão, um depois do outro — é assim que o vazamento de
  // estado entre equipamentos apareceria.
  papelSi = await papelDe(SI);
  papelAlt = await papelDe(ALT);
}, 120_000);

beforeEach(() => {
  expect(papelSi.length, 'o PDF em SI saiu vazio').toBeGreaterThan(200);
  expect(papelAlt.length, 'o PDF em kgf/cm² saiu vazio').toBeGreaterThan(200);
});

describe('cada documento sai na unidade do SEU equipamento', () => {
  it('o relatório do equipamento SI traz os valores em MPa', () => {
    expect(papelSi).toContain(ESPERADO.SI.pmta);
    expect(papelSi).toContain(ESPERADO.SI.pth);
    expect(papelSi).toContain(ESPERADO.SI.pmo);
    expect(papelSi).toContain('MPa');
  });

  it('o relatório do equipamento Técnico traz os MESMOS valores em kgf/cm²', () => {
    expect(papelAlt).toContain(ESPERADO.TECNICO.pmta);
    expect(papelAlt).toContain(ESPERADO.TECNICO.pth);
    expect(papelAlt).toContain(ESPERADO.TECNICO.pmo);
    expect(papelAlt).toContain('kgf/cm²');
  });

  it('a pressão é a MESMA fisicamente — só a unidade muda', () => {
    // 2.200 MPa e 22.43 kgf/cm² são o mesmo número. Se o teste passasse por os
    // dados serem diferentes, ele não diria nada sobre unidade.
    expect(Number(ESPERADO.TECNICO.pmta)).toBeCloseTo(PMTA_MPA * 10.19716, 2);
  });
});

describe('uma unidade não vaza para o outro equipamento', () => {
  it('o documento em MPa não traz nenhum valor em kgf/cm²', () => {
    expect(papelSi).not.toContain(ESPERADO.TECNICO.pmta);
    expect(papelSi).not.toContain(ESPERADO.TECNICO.pth);
    expect(papelSi).not.toContain(ESPERADO.TECNICO.pmo);
  });

  it('o documento em kgf/cm² não traz nenhum valor em MPa', () => {
    expect(papelAlt).not.toContain(ESPERADO.SI.pmta);
    expect(papelAlt).not.toContain(ESPERADO.SI.pth);
    expect(papelAlt).not.toContain(ESPERADO.SI.pmo);
  });

  it('as colunas das outras unidades saíram do documento', () => {
    // psi e bar eram colunas fixas das tabelas de pressão. Nenhum dos dois
    // documentos deve trazê-las.
    for (const papel of [papelSi, papelAlt]) {
      expect(papel).not.toMatch(/\bpsi\b/);
    }
    // `bar` some do documento em MPa; no de kgf/cm² ele nunca apareceria mesmo.
    expect(papelSi).not.toMatch(/\bbar\b/);
  });
});

describe('a CATEGORIA NR-13 fica nas unidades da norma, nos dois', () => {
  for (const [nome, papel] of [
    ['SI (MPa)', () => papelSi],
    ['Técnico (kgf/cm²)', () => papelAlt],
  ] as const) {
    it(`${nome}: enquadramento em kPa·m³ e grupo em MPa·m³`, () => {
      const p = papel();
      expect(p, 'a relação do enquadramento').toContain('P (kPa) × V (m³)');
      expect(p, 'a relação do grupo de risco').toContain('P (MPa) × V (m³)');
      // E os PRODUTOS, crus como a categorização os gravou — impressos por
      // `numeroBr`, com ponto de milhar e vírgula decimal.
      expect(p, 'o produto do enquadramento (kPa·m³)').toContain('2.750');
      expect(p, 'o produto do grupo de risco (MPa·m³)').toContain('2,75');
    });
  }

  it('a categoria final é a mesma nos dois documentos', () => {
    for (const p of [papelSi, papelAlt]) {
      expect(p).toContain('III');
    }
  });
});

describe('nada de lixo no papel', () => {
  for (const [nome, papel] of [
    ['SI', () => papelSi],
    ['Técnico', () => papelAlt],
  ] as const) {
    it(`${nome}: sem NaN, undefined ou [object Object]`, () => {
      const p = papel();
      expect(p).not.toContain('NaN');
      expect(p).not.toContain('undefined');
      expect(p).not.toContain('[object Object]');
    });
  }
});
