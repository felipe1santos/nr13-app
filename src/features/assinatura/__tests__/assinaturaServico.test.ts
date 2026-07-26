import { describe, it, expect, beforeEach } from 'vitest';
import {
  statusAssinaturaLocal,
  podeEscreverAssinatura,
  textoBloqueio,
  gravarEstadoLocal,
} from '../../../services/assinatura';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão de vencimentos.test.ts).
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

beforeEach(() => localStorage.clear());

describe('espelho local da assinatura', () => {
  it('sem nada gravado assume ativa (nao trava usuario por falta de dado)', () => {
    expect(statusAssinaturaLocal()).toBe('ativa');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('respeita o status gravado', () => {
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('graca');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('rebaixa quando a data ja passou', () => {
    gravarEstadoLocal({ status: 'ativa', ate: new Date(Date.now() - 1000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('somente_leitura');
    expect(podeEscreverAssinatura()).toBe(false);
  });

  it('texto do bloqueio muda por estado', () => {
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });
    expect(textoBloqueio()).toContain('suspensa');
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(textoBloqueio()).toContain('cartão');
  });
});
