import { describe, it, expect, beforeEach, vi } from 'vitest';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão do resto do repo,
// ver vencimentos.test.ts / assinaturaServico.test.ts).
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

// Perfil simulando o banco PRÉ-migração (assinatura_setup.sql ainda não rodou — estado
// real hoje): o select devolve normalmente (sem erro), só que sem assinatura_status/ate.
const PERFIL_SEM_ASSINATURA = {
  plano: 'completo',
  ativo: true,
  role: 'user',
  acesso_expira_em: null,
  papel: '',
  org_id: null,
  cliente_id: null,
  sessao_token: null,
  sessao_visto_em: null,
};

// Mock mínimo do client supabase: só a cadeia usada por carregarPerfil()
// (auth.getSession() + from('profiles').select(...).eq(...).maybeSingle()).
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'uid-teste' } } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: PERFIL_SEM_ASSINATURA, error: null })),
        })),
      })),
    })),
  },
}));

import { carregarPerfil } from './auth';
import { gravarEstadoLocal, statusAssinaturaLocal } from './assinatura';

beforeEach(() => localStorage.clear());

describe('carregarPerfil (login) e o espelho da assinatura', () => {
  it('login sem assinatura_status no perfil limpa o espelho remanescente de outra conta', async () => {
    // Conta A ficou somente_leitura e fechou a aba sem clicar "Sair" (nenhum caminho de
    // saída rodou — encerrarSessaoLocal() nunca foi chamado).
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });

    // Login da conta B no mesmo navegador: o select mockado devolve um perfil sem
    // assinatura_status (banco pré-migração). Isto exercita carregarPerfil() de verdade,
    // não apenas a função de limpeza isolada.
    await carregarPerfil();

    // Se o `else` de carregarPerfil() não chamar limparEstadoLocal(), este teste falha:
    // o espelho de A (somente_leitura) continuaria valendo para B.
    expect(statusAssinaturaLocal()).toBe('ativa');
  });
});
