import { describe, it, expect, beforeEach, vi } from 'vitest';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão do resto do repo,
// ver vencimentos.test.ts / assinaturaServico.test.ts / auth.test.ts).
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

// storage.ts importa o client supabase no topo do módulo; mock mínimo só para o import não
// falhar/logar erro no teste (bloqueadoParaEscrita() não chama supabase, é 100% localStorage).
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
  escopoStorageAtual: vi.fn(),
  idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { bloqueadoParaEscrita } from './storage';

beforeEach(() => localStorage.clear());

describe('bloqueadoParaEscrita (gate de escrita: Portal do Cliente + assinatura suspensa)', () => {
  it('papel cliente (Portal do Cliente) -> bloqueado', () => {
    localStorage.setItem('nr13_papel', 'cliente');
    expect(bloqueadoParaEscrita()).toBe(true);
  });

  it('assinatura somente_leitura -> bloqueado', () => {
    localStorage.setItem('nr13_assinatura_status', 'somente_leitura');
    expect(bloqueadoParaEscrita()).toBe(true);
  });

  it('assinatura ativa com "ate" futuro -> liberado', () => {
    localStorage.setItem('nr13_assinatura_status', 'ativa');
    localStorage.setItem('nr13_assinatura_ate', new Date(Date.now() + 86_400_000).toISOString());
    expect(bloqueadoParaEscrita()).toBe(false);
  });

  it('assinatura ativa com "ate" PASSADO -> bloqueado (rebaixamento por data)', () => {
    localStorage.setItem('nr13_assinatura_status', 'ativa');
    localStorage.setItem('nr13_assinatura_ate', new Date(Date.now() - 1000).toISOString());
    expect(bloqueadoParaEscrita()).toBe(true);
  });

  it('assinatura ativa sem "ate" (nulo/ausente) -> liberado (sem vencimento nunca rebaixa)', () => {
    localStorage.setItem('nr13_assinatura_status', 'ativa');
    // nr13_assinatura_ate propositalmente ausente.
    expect(bloqueadoParaEscrita()).toBe(false);
  });

  it('assinatura ativa com "ate" corrompido/não-parseável -> bloqueado (fail-closed, paridade com statusEfetivo)', () => {
    localStorage.setItem('nr13_assinatura_status', 'ativa');
    localStorage.setItem('nr13_assinatura_ate', 'lixo-nao-parseavel');
    expect(bloqueadoParaEscrita()).toBe(true);
  });

  it('nada gravado (banco sem migração / conta nova) -> liberado (default seguro)', () => {
    expect(bloqueadoParaEscrita()).toBe(false);
  });
});
