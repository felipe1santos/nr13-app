/**
 * E2E DO PAPEL · exames visuais e observações do checklist (18/09/2026).
 *
 * Gera o relatório de três equipamentos (SI, Técnico, Petrobras) e lê o TEXTO
 * dos bytes do PDF. Prova que:
 *
 * 1. as folhas 7.2 e 7.3 trazem a pergunta "FOI ENCONTRADA ALGUMA NÃO
 *    CONFORMIDADE?" sobre as colunas SIM / NÃO / N.A.;
 * 2. a resposta geral sai DERIVADA das linhas ("SIM — itens 3, 11");
 * 3. a observação de cada não conformidade chega ao papel;
 * 4. as "Observações — checklist" das partes 1 e 2 chegam do formulário;
 * 5. nada disso depende da unidade do equipamento.
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
import type { SistemaUnidade } from '../../../calc/unidades';

const UNIDADES: SistemaUnidade[] = ['SI', 'TECNICO', 'PETROBRAS'];

const DOCUMENTOS = [
  'CAPA.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  'checklist1.html',
  'checklist2.html',
  'checklist3.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
];

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

const todos = (v: string) => Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), v]));

const CONTAINER = {
  checklist: {
    respostas: {},
    observacoes: {},
    instrumentos: {},
    observacoesParte1: 'OBS-PARTE1-E2E manômetro com vidro trincado',
    observacoesParte2: 'OBS-PARTE2-E2E TH acompanhado pelo cliente',
  },
  // Externo: itens 3 e 11 com não conformidade, o resto conforme.
  visual_externo: {
    semanticaNc: 1,
    itens: { ...todos('nao'), '3': 'sim', '11': 'sim' },
    itemObs: { '3': 'NC-SOLDA-E2E', '11': 'NC-INDICADOR-E2E' },
    resultado: 'reprovado',
  },
  // Interno: tudo conforme.
  visual_interno: { semanticaNc: 1, itens: todos('nao'), itemObs: {}, resultado: 'aprovado' },
};

async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return paginas;
}

const papel = new Map<SistemaUnidade, string[]>();

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
  for (const unidade of UNIDADES) {
    const tag = `ZZ-NC-${unidade}`;
    gravar(`nr13_info_${tag}`, { tag, tipo: 'vaso', pmtaAdotadaMpa: '2.2' });
    gravar(`nr13_pref_unidade_${tag}`, unidade);
    gravar('nr13_relatorio_meta_atual', {
      codigo: `REL-${tag}`,
      emissao: '18/09/2026',
      tipoInspecao: 'Periódica',
      documentos: DOCUMENTOS,
    });
    gravar('nr13_inspecao_atual', CONTAINER);
    gravar('nr13_injecao_atual', CONTAINER);
    const r = await gerarRelatorioVetorial(tag, { documentos: DOCUMENTOS, certificados: false });
    papel.set(unidade, await paginasDoPdf(r.bytes));
  }
}, 240_000);

const folha = (paginas: string[], titulo: string) => {
  const p = paginas.find((t) => t.includes(titulo));
  if (!p) throw new Error(`folha "${titulo}" não encontrada`);
  return p;
};

describe('exames visuais — a pergunta e a resposta derivada no papel', () => {
  for (const u of UNIDADES) {
    it(`${u}: 7.2 traz a pergunta sobre SIM / NÃO / N.A.`, () => {
      const f = folha(papel.get(u)!, '7.2 EXAME EXTERNO');
      expect(f).toMatch(/FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE\?.*SIM NÃO N\.A\./);
    });

    it(`${u}: 7.2 deriva "SIM — itens 3, 11" e imprime as descrições`, () => {
      const f = folha(papel.get(u)!, '7.2 EXAME EXTERNO');
      expect(f).toContain('NÃO CONFORMIDADE ENCONTRADA? (resultado dos itens) SIM — itens 3, 11');
      expect(f).toContain('NC-SOLDA-E2E');
      expect(f).toContain('NC-INDICADOR-E2E');
    });

    it(`${u}: 7.3 sem não conformidade deriva "NÃO"`, () => {
      const f = folha(papel.get(u)!, '7.3 EXAME INTERNO');
      expect(f).toContain('FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?');
      expect(f).toContain('NÃO CONFORMIDADE ENCONTRADA? (resultado dos itens) NÃO');
    });

    it(`${u}: as observações do checklist (partes 1 e 2) chegam do formulário`, () => {
      const p1 = folha(papel.get(u)!, '7.1.1 CHECKLIST');
      const p2 = folha(papel.get(u)!, '7.1.2 CHECKLIST');
      expect(p1).toContain('Observações — checklist (parte 1)');
      expect(p1).toContain('OBS-PARTE1-E2E manômetro com vidro trincado');
      expect(p2).toContain('Observações — checklist (parte 2)');
      expect(p2).toContain('OBS-PARTE2-E2E TH acompanhado pelo cliente');
    });
  }

  it('o conteúdo dessas folhas não depende da unidade do equipamento', () => {
    const limpa = (u: SistemaUnidade, t: string) =>
      folha(papel.get(u)!, t)
        .replace(/^.*?Página \d+ de \d+/, '')
        .replace(/ZZ-NC-\w+/g, 'TAG');
    for (const t of ['7.2 EXAME EXTERNO', '7.3 EXAME INTERNO']) {
      expect(limpa('TECNICO', t)).toBe(limpa('SI', t));
      expect(limpa('PETROBRAS', t)).toBe(limpa('SI', t));
    }
  });
});
