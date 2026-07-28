import { afterEach, describe, expect, it } from 'vitest';
import { documentosBloqueados } from './trial';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão do resto do repo,
// ver vencimentos.test.ts / eventos.test.ts).
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

afterEach(() => {
  localStorage.clear();
});

// documentosBloqueados() é o helper único usado pelos 6 botões com cadeado e pelo bloqueio de
// Ctrl+P — cobre os três estados reais: trial (bloqueado), assinatura ativa (liberado) e
// assinatura suspensa/somente_leitura (bloqueado). O efeito de DOM (classe no <html>, listener
// de teclado em bloqueioImpressao.ts) não é testado aqui: o projeto roda vitest com
// `environment: 'node'` (vite.config.ts), sem jsdom, e não há dependência nova a acrescentar
// só para cobrir isso — ver relatório em .superpowers/sdd/2026-07-26-assinatura-kiwify/.
describe('documentosBloqueados', () => {
  it('bloqueia durante o trial (nr13_plano = trial), mesmo sem assinatura_status gravado', () => {
    localStorage.setItem('nr13_plano', 'trial');
    expect(documentosBloqueados()).toBe(true);
  });

  it('libera para conta paga com assinatura ativa (fora do trial)', () => {
    localStorage.setItem('nr13_plano', 'completo');
    localStorage.setItem('nr13_assinatura_status', 'ativa');
    expect(documentosBloqueados()).toBe(false);
  });

  it('bloqueia quando a assinatura está somente_leitura, mesmo fora do trial', () => {
    localStorage.setItem('nr13_plano', 'completo');
    localStorage.setItem('nr13_assinatura_status', 'somente_leitura');
    expect(documentosBloqueados()).toBe(true);
  });

  it('sem nenhuma chave gravada (conta antiga/legado) não bloqueia', () => {
    expect(documentosBloqueados()).toBe(false);
  });
});
