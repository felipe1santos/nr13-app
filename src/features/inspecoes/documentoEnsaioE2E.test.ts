/**
 * O DOCUMENTO DA INSPEÇÃO, PELO PONTO DE ENTRADA DA TELA (21/09/2026 · 2ª rodada).
 *
 * `documentoVetorial.test.ts` prova, lendo o código, que a tela chama o gerador
 * do relatório. Isso é uma prova de FIAÇÃO — ela não diz o que sai do outro
 * lado. Aqui o teste chama `gerarDocumentoDoEnsaio`, a MESMA função que
 * `PreviewDocumento` chama quando o técnico aperta "Ver documento", grava um
 * container de verdade com `criarContainer`/`salvarDadosEnsaio` e lê o PDF
 * resultante de volta com pdf.js.
 *
 * É o que responde, com bytes: a folha do croqui existe também no fluxo
 * avulso, com a malha que o técnico configurou, e sem repetir os valores.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarDocumentoDoEnsaio } from './documentoVetorial';
import { zerarCacheFontes } from '../relatorios/pdfVetorial/carlito';
import { angulosDaRegiao } from '../relatorios/medicoesEspessura';

const TAG = 'ZZ-E2E-CROQUI';
const CONTAINER = 'contE2E_croqui';
/** Seis ângulos nos tampos e no casco, cinco níveis — a malha que o usuário pediu para ver. */
const ANGULOS = 6;
const NIVEIS = 5;

const paginas: string[] = [];
let paginaDoCroqui = '';
let paginaDaTabela = '';
let resultado: { paginas: number; ms: number };

beforeAll(async () => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });

  const ang = angulosDaRegiao(ANGULOS);
  const medidas: Record<string, Record<string, string>> = {};
  const linha = (id: string, base: number) => {
    medidas[id] = {};
    ang.forEach((a, j) => void (medidas[id][a] = (base + j * 0.03).toFixed(2).replace('.', ',')));
  };
  linha('ts', 9.4);
  for (let i = 1; i <= NIVEIS; i++) linha(`c${i}`, 8.9 + i * 0.01);
  linha('ti', 9.3);
  // Um ponto SEM leitura: a distinção medido × não medido tem de sobreviver ao
  // enxugamento da folha.
  delete medidas.c2[ang[1]];

  const container = {
    id: CONTAINER,
    nome: 'Inspeção E2E do croqui',
    criadoEm: '21/09/2026',
    ensaios: ['ultrassom'],
    dados: {
      ultrassom: {
        equipamento: 'VASO E2E CROQUI',
        serie: 'SER-E2E-1',
        dataUltrassom: '2026-09-21',
        aparelho: 'DM5E / E2E-1',
        pontos: [
          { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
          ...Array.from({ length: NIVEIS }, (_, i) => ({
            id: `c${i + 1}`,
            rotulo: `Casco ${i + 1}`,
            regiao: 'casco',
          })),
          { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
        ],
        colunas: { ts: ANGULOS, casco: ANGULOS, ti: ANGULOS },
        medidas,
      },
    },
  };

  localStorage.clear();
  localStorage.setItem(
    `nr13_info_${TAG}`,
    JSON.stringify({ tag: TAG, tipo: 'vaso', descricao: 'VASO E2E CROQUI', numeroSerie: 'SER-E2E-1' }),
  );
  localStorage.setItem(`nr13_pref_unidade_${TAG}`, JSON.stringify('SI'));
  localStorage.setItem(
    'nr13_minha_empresa',
    JSON.stringify({ razaoSocial: 'ZZ ENGENHARIA E2E LTDA', cidade: 'Vitória', estado: 'ES' }),
  );
  // O container, na chave que `carregarContainer` lê.
  localStorage.setItem(`nr13_docs_${TAG}`, JSON.stringify([container]));

  // ── O PONTO DE ENTRADA DA TELA ──────────────────────────────────────────
  const r = await gerarDocumentoDoEnsaio(TAG, CONTAINER, 'ultrassom');
  resultado = { paginas: r.paginas, ms: r.ms };

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: r.bytes, useSystemFonts: true, verbosity: 0 }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      t.items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  paginaDaTabela = paginas.find((p) => p.includes('MEDIÇÃO DE ESPESSURA POR ULTRASSOM')) ?? '';
  paginaDoCroqui = paginas.find((p) => p.includes('MAPA DOS PONTOS DE MEDIÇÃO')) ?? '';
}, 300_000);

describe('“Ver documento” do ensaio entrega as DUAS folhas', () => {
  it('duas páginas: a tabela e o croqui', () => {
    expect(resultado.paginas).toBe(2);
    expect(paginas).toHaveLength(2);
    expect(paginaDaTabela).not.toBe('');
    expect(paginaDoCroqui).not.toBe('');
    expect(paginas.indexOf(paginaDoCroqui)).toBe(paginas.indexOf(paginaDaTabela) + 1);
  });

  it('o PDF é vetorial — o texto é extraível, não é captura de tela', () => {
    // Uma rasterização devolveria zero itens de texto no pdf.js.
    expect(paginaDoCroqui.length).toBeGreaterThan(120);
    expect(paginaDaTabela).toContain('VASO E2E CROQUI');
  });
});

describe('o croqui do fluxo avulso segue a malha do CONTAINER', () => {
  it('os seis ângulos configurados aparecem', () => {
    for (const a of ['0°', '60°', '120°', '180°', '240°', '300°']) {
      expect(paginaDoCroqui).toContain(a);
    }
    expect(paginaDoCroqui).not.toContain('90°');
  });

  it('os cinco níveis de casco viram C1..C5', () => {
    for (let i = 1; i <= NIVEIS; i++) expect(paginaDoCroqui).toContain(`C${i}`);
    expect(paginaDoCroqui).not.toContain('C6');
  });

  it('o ponto sem leitura continua distinguível — a tabela o marca com travessão', () => {
    // Na folha 7.4 a célula vazia sai como travessão, nunca como 0,00.
    expect(paginaDaTabela).toContain('—');
    expect(paginaDaTabela).not.toContain('0,00');
  });
});

describe('a folha avulsa é a folha do relatório, não uma cópia', () => {
  it('traz o mesmo layout: três vistas, identificação e legenda', () => {
    for (const t of [
      '7.4.1 MAPA DOS PONTOS DE MEDIÇÃO DE ESPESSURA',
      'IDENTIFICAÇÃO',
      'TAMPO SUPERIOR (TS)',
      'TAMPO INFERIOR (TI)',
      'COSTADO — VISTA PLANIFICADA',
      'TS = tampo superior',
    ]) {
      expect(paginaDoCroqui).toContain(t);
    }
  });

  it('e o mesmo rodapé da empresa das demais folhas', () => {
    expect(paginaDoCroqui).toContain('ZZ ENGENHARIA E2E LTDA');
    expect(paginaDaTabela).toContain('ZZ ENGENHARIA E2E LTDA');
  });

  it('não repete nenhum valor de medição da folha anterior', () => {
    const compacto = (s: string) => s.replace(/\s+/g, '');
    expect(paginaDoCroqui).not.toContain('PONTOS E LEITURAS');
    expect(compacto(paginaDoCroqui)).not.toContain('9,4');
    expect(compacto(paginaDaTabela)).toContain('9,4');
  });
});
