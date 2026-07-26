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
// real hoje): o select devolve normalmente (sem erro), só que sem as colunas de assinatura,
// e a RPC assinatura_org() não existe.
const PERFIL_BASE = {
  plano: 'completo',
  ativo: true,
  role: 'user',
  acesso_expira_em: null as string | null,
  papel: '',
  org_id: null as string | null,
  cliente_id: null,
  sessao_token: null,
  sessao_visto_em: null,
};

// vi.hoisted: o factory de vi.mock é içado acima dos imports, então os estados mutáveis do
// mock precisam existir antes — sem isto o factory acessaria variáveis em TDZ.
const estado = vi.hoisted(() => ({
  perfil: null as Record<string, unknown> | null,
  rpc: null as null | { data: unknown; error: unknown },
}));

// Mock mínimo do client supabase: a cadeia usada por carregarPerfil()
// (auth.getSession() + from('profiles').select(...).eq(...).maybeSingle() + rpc('assinatura_org')).
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'uid-teste' } } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: estado.perfil, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => {
      // RPC ausente (banco pré-migração) = erro do PostgREST, igual ao servidor real.
      if (!estado.rpc) throw new Error('function public.assinatura_org() does not exist');
      return estado.rpc;
    }),
  },
}));

import { carregarPerfil } from './auth';
import { gravarEstadoLocal, statusAssinaturaLocal, assinaturaAte } from './assinatura';

beforeEach(() => {
  localStorage.clear();
  estado.perfil = { ...PERFIL_BASE };
  estado.rpc = null;
});

describe('carregarPerfil (login) e o espelho da assinatura', () => {
  it('login sem a migração no servidor limpa o espelho remanescente de outra conta', async () => {
    // Conta A ficou somente_leitura e fechou a aba sem clicar "Sair" (nenhum caminho de
    // saída rodou — encerrarSessaoLocal() nunca foi chamado).
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });

    // Login da conta B no mesmo navegador, com a RPC assinatura_org() inexistente.
    const perfil = await carregarPerfil();

    // Se espelharAssinaturaDaOrg() não chamar limparEstadoLocal(), este teste falha: o
    // espelho de A (somente_leitura) continuaria valendo para B.
    expect(statusAssinaturaLocal()).toBe('ativa');
    expect(perfil.assinaturaStatus).toBe('');
  });

  it('espelha o status da ORG devolvido pela RPC (achado C3: sub-login segue o mestre)', async () => {
    // Sub-login: a linha DELE nunca é tocada pelo webhook (fica no default 'trial'), mas a
    // org está suspensa. A RPC assinatura_org() resolve pela linha do mestre — é o único
    // caminho, porque a RLS de profiles não deixa o sub-login ler a linha do mestre.
    estado.perfil = { ...PERFIL_BASE, org_id: 'uid-do-mestre', papel: 'funcionario' };
    estado.rpc = { data: { status: 'somente_leitura', ate: '2026-07-01T00:00:00.000Z' }, error: null };

    const perfil = await carregarPerfil();

    expect(perfil.assinaturaStatus).toBe('somente_leitura');
    expect(statusAssinaturaLocal()).toBe('somente_leitura');
    expect(assinaturaAte()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('o select das colunas de acesso não depende das colunas de assinatura (achado C6)', async () => {
    // Banco SEM a migração da assinatura: org_id/papel/cliente_id precisam continuar chegando,
    // senão o app abre vazio (escopo do storage), o portal perde papel='cliente' e a sessão
    // única para de funcionar. Antes, as colunas de assinatura estavam no MESMO select e o
    // PostgREST recusava a query inteira.
    estado.perfil = { ...PERFIL_BASE, org_id: 'org-1', papel: 'gerente', cliente_id: null };

    const perfil = await carregarPerfil();

    expect(perfil.orgId).toBe('org-1');
    expect(perfil.papel).toBe('gerente');
    expect(localStorage.getItem('nr13_org_id')).toBe('org-1');
  });
});
