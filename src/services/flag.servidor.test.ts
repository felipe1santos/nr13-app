import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const estado = vi.hoisted(() => ({
  resposta: { data: null as { v2_ativa?: boolean } | null, error: null as unknown },
  escopo: { coluna: 'org_id', id: 'org-1' } as { coluna: string; id: string } | null,
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => estado.resposta),
        })),
      })),
    })),
  },
  escopoStorageAtual: vi.fn(async () => estado.escopo),
}));

import {
  armazenamentoV2Ativo,
  definirArmazenamentoV2,
  sincronizarFlagDoServidor,
  zerarFlagEmMemoria,
} from './flag';

beforeEach(() => {
  localStorage.clear();
  zerarFlagEmMemoria();
  estado.escopo = { coluna: 'org_id', id: 'org-1' };
  estado.resposta = { data: null, error: null };
});

describe('sincronizarFlagDoServidor', () => {
  it('liga a v2 quando o servidor diz que a organização já migrou', async () => {
    // Estado real da conta cmam.caldeiras em 10/08/2026: org_sync.v2_ativa = true
    // no banco e o bundle despachando para a v1 — toda escrita direta recusada.
    estado.resposta = { data: { v2_ativa: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(armazenamentoV2Ativo()).toBe(true);
  });

  it('mantém a v1 para organização que ainda não migrou', async () => {
    estado.resposta = { data: { v2_ativa: false }, error: null };
    await sincronizarFlagDoServidor();
    expect(armazenamentoV2Ativo()).toBe(false);
  });

  it('organização sem linha em org_sync fica na v1', async () => {
    estado.resposta = { data: null, error: null };
    await sincronizarFlagDoServidor();
    expect(armazenamentoV2Ativo()).toBe(false);
  });

  it('erro de rede NÃO rebaixa quem já estava na v2', async () => {
    // Rebaixar aqui seria fatal: a v2 não guarda dado no localStorage, então a
    // v1 assumiria e a tela mostraria a conta vazia.
    definirArmazenamentoV2(true);
    estado.resposta = { data: null, error: new Error('Failed to fetch') };

    await sincronizarFlagDoServidor();

    expect(armazenamentoV2Ativo()).toBe(true);
  });

  it('sem sessão/escopo não muda a decisão vigente', async () => {
    definirArmazenamentoV2(true);
    estado.escopo = null;
    await sincronizarFlagDoServidor();
    expect(armazenamentoV2Ativo()).toBe(true);
  });
});
