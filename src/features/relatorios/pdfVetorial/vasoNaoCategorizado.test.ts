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
    blobParaDataUrl: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC',
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

/**
 * VASO NÃO CATEGORIZADO NO RELATÓRIO (23/11/2026). P·V ≤ 8 e fluido que não é
 * classe A: a categoria sai "NÃO CATEGORIZADO" (capa e folha 4) e o motivo,
 * escrito, na folha de categorização — nunca "N/A (Não Enquadra)".
 */
const TAG = 'ZZ-VASO-NC';
const DOCUMENTOS = ['CAPA.html', 'CLASSIFICACAO-RISCO.html'];
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
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

beforeAll(async () => {
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
  localStorage.clear();
  const info: InfoEquipamento = { tag: TAG, tipo: 'vaso', subtipo: 'vertical', descricao: 'VASO PEQUENO', pmtaAdotadaMpa: '0.5' } as InfoEquipamento;
  const cat: CategoriaSalva = {
    classe: 'C', grupo: 5, PV_cat: '0.0050', PV_enq: '5.0000', isEnquadrado: false, catFinal: 'N/A (Não Enquadra)',
    volInput: 0.01, presInput: 0.5, unidInput: 'SI', fluidoInput: 'C - Ar comprimido',
  };
  gravar(`nr13_info_${TAG}`, info);
  gravar(`nr13_cat_${TAG}`, cat);
  gravar(`nr13_calc_${TAG}`, { pmta: '0.5', pth: '0.65', memorialHTML: '', componentes: [] });
  gravar('nr13_relatorio_meta_atual', { codigo: 'REL-NC', emissao: '23/11/2026', tipoInspecao: 'Inspeção Periódica', documentos: DOCUMENTOS });
  const r = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
  paginas = await textoDoPdf(r.bytes);
}, 180_000);

describe('vaso não categorizado vai para o relatório', () => {
  it('folha 4 traz NÃO CATEGORIZADO e o motivo escrito', () => {
    const f = paginas.find((p) => p.includes('CATEGORIZAÇÃO DE RISCO'))!;
    expect(f).toContain('NÃO CATEGORIZADO');
    expect(f).toContain('Equipamento não categorizado pela NR-13, pois o produto P×V (5,00 kPa·m³) não é superior a 8');
    expect(f).not.toContain('N/A (Não Enquadra)');
  });
  it('a capa também diz NÃO CATEGORIZADO', () => {
    expect(paginas[0]).toContain('NÃO CATEGORIZADO');
  });
});
