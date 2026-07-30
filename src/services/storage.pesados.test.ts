import { describe, it, expect, beforeEach, vi } from 'vitest';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão do resto do repo).
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

// Sem sessão: `salvar` grava o cache local e sai antes de tocar a rede. É exatamente
// o recorte que interessa aqui — o que sobra no localStorage.
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
  escopoStorageAtual: vi.fn(async () => null),
  idUsuarioAtual: vi.fn(async () => null),
  TABELA_STORAGE: 'app_storage',
}));

import { aliviarCacheLocal, ler, salvar } from './storage';
import { lerPdf } from './pdfStore';

const PDF = 'data:application/pdf;base64,' + 'A'.repeat(300_000); // ~300 KB
const chave = 'nr13_rastreab_abc';

const registro = () => ({
  id: 'abc',
  nome: 'Manômetro padrão MP-01',
  certificadoPadrao: 'CERT-1',
  validade: '2027-01-01',
  pdfBase64: PDF,
  injetarNoRelatorio: true,
  criadoEm: '20/07/2026',
  tipoInstrumento: 'manometro',
});

beforeEach(() => localStorage.clear());

describe('separação do campo pesado (cota do localStorage)', () => {
  it('salvar() não deixa o PDF no localStorage, mas marca que ele existe', async () => {
    await salvar(chave, registro());

    const bruto = localStorage.getItem(chave)!;
    expect(bruto).not.toContain('AAAA'); // o base64 não ficou no cache
    expect(bruto.length).toBeLessThan(1000); // registro enxuto, não 300 KB

    const lido = ler<Record<string, unknown>>(chave)!;
    expect(lido.pdfBase64).toBe('');
    expect(lido.temPdf).toBe(true);
    expect(lido.pdfBytes).toBe(PDF.length);
    // Metadados que os templates em iframe leem seguem intactos.
    expect(lido.nome).toBe('Manômetro padrão MP-01');
    expect(lido.validade).toBe('2027-01-01');
    expect(lido.tipoInstrumento).toBe('manometro');
  });

  it('o PDF fica recuperável pelo pdfStore', async () => {
    await salvar(chave, registro());
    expect(await lerPdf(chave)).toBe(PDF);
  });

  it('chave fora dos prefixos pesados é gravada inteira', async () => {
    await salvar('nr13_info_VASO-01', { tag: 'VASO-01', foto: 'x'.repeat(5000) });
    expect(localStorage.getItem('nr13_info_VASO-01')!).toContain('xxxxx');
  });

  it('valor não-JSON não quebra a divisão', async () => {
    localStorage.setItem('nr13_rastreab_lixo', 'não é json');
    expect(() => aliviarCacheLocal()).not.toThrow();
    expect(localStorage.getItem('nr13_rastreab_lixo')).toBe('não é json');
  });
});

describe('aliviarCacheLocal (migração dos registros já gordos)', () => {
  it('enxuga registro antigo gravado direto no localStorage e preserva o PDF', async () => {
    // Estado pré-migração: registro completo, PDF incluso, ocupando a cota.
    localStorage.setItem('nr13_rastreab_velho', JSON.stringify({ ...registro(), id: 'velho' }));
    expect(localStorage.getItem('nr13_rastreab_velho')!.length).toBeGreaterThan(300_000);

    aliviarCacheLocal();

    expect(localStorage.getItem('nr13_rastreab_velho')!.length).toBeLessThan(1000);
    expect(ler<Record<string, unknown>>('nr13_rastreab_velho')!.temPdf).toBe(true);
    expect(await lerPdf('nr13_rastreab_velho')).toBe(PDF);
  });

  it('é idempotente: rodar de novo não apaga o marcador nem o PDF', async () => {
    localStorage.setItem('nr13_rastreab_velho', JSON.stringify({ ...registro(), id: 'velho' }));
    aliviarCacheLocal();
    const depoisDaPrimeira = localStorage.getItem('nr13_rastreab_velho');
    aliviarCacheLocal();
    expect(localStorage.getItem('nr13_rastreab_velho')).toBe(depoisDaPrimeira);
    expect(await lerPdf('nr13_rastreab_velho')).toBe(PDF);
  });
});
