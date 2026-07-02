import { beforeEach, describe, expect, it, vi } from 'vitest';

// O storage grava no Supabase além do localStorage — em teste, só o cache local importa.
vi.mock('../../../services/supabase', () => ({
  supabase: {},
  TABELA_STORAGE: 'app_storage',
  idUsuarioAtual: async () => null,
}));

// Ambiente node não tem localStorage: stub mínimo compatível com o uso do storage.ts.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;
vi.stubGlobal('localStorage', localStorageStub);

const { calcularResumoMista, carregarTiposCaldeira } = await import('../caldeiraMemorialService');

describe('caldeira mista', () => {
  beforeEach(() => store.clear());

  it('compõe componentes flamo + aqua e PMTA final é o menor', () => {
    const r = calcularResumoMista('TAGX', carregarTiposCaldeira('TAGX'));
    // defaults de PADROES (5 abas flamo) + PADROES_AQUATUBULAR (4 abas aqua da mista)
    expect(r.porAba.length).toBe(9);
    const pmtas = r.porAba.map((c) => parseFloat(c.resultado.pmta)).filter(Number.isFinite);
    expect(r.pmtaFinal).toBe(Math.min(...pmtas));
  });

  it('aba desativada fica fora do resumo', () => {
    store.set('nr13_caldeira_mista_ativas_TAGY', JSON.stringify({ 'aqua:coletor': false }));
    const r = calcularResumoMista('TAGY', carregarTiposCaldeira('TAGY'));
    expect(r.porAba.length).toBe(8);
    expect(r.porAba.some((c) => c.chave === 'aqua:coletor')).toBe(false);
  });
});
