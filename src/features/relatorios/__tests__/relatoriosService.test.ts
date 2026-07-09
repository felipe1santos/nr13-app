import { beforeEach, describe, expect, it } from 'vitest';
import { expandirMemorial } from '../relatoriosService';

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

function calcCom(linhas: string[]): string {
  return JSON.stringify({ memorialHTML: '<div class="katex-render">' + linhas.join('<br>') + '</div>' });
}

describe('expandirMemorial — merge do GV do autoclave', () => {
  beforeEach(() => localStorage.clear());

  it('sem chave gv: paginação inalterada (to = nº de linhas do principal)', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a', 'linha b']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=3');
  });

  it('com nr13_calc_gv_<TAG>: linhas do GV entram após as do principal', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a']));
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=4');
  });

  it('gv sem principal: só as linhas do gv', () => {
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=2');
  });
});
