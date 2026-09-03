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

const PERFIL = {
  plano: 'completo',
  ativo: true,
  role: 'user',
  acesso_expira_em: null as string | null,
  papel: 'mestre',
  org_id: 'org-1',
  cliente_id: null,
  sessao_token: null as string | null,
  sessao_visto_em: null as string | null,
};

const estado = vi.hoisted(() => ({
  perfil: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  saidas: [] as unknown[],
}));

vi.mock('./supabase', () => ({
  TABELA_STORAGE: 'app_storage',
  idUsuarioAtual: vi.fn(async () => 'uid-1'),
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id' as const, id: 'org-1' })),
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'uid-1' } } } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async (opcoes?: unknown) => {
        estado.saidas.push(opcoes);
        return { error: null };
      }),
    },
    from: vi.fn((tabela: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: tabela === 'org_sync' ? { v2_ativa: false } : estado.perfil,
            error: null,
          })),
        })),
      })),
      update: vi.fn((valores: Record<string, unknown>) => ({
        eq: vi.fn(async () => {
          estado.updates.push({ tabela, ...valores });
          return { error: null };
        }),
      })),
      insert: vi.fn(async () => ({ error: null })),
    })),
    rpc: vi.fn(async () => ({ data: { status: 'ativa', ate: null }, error: null })),
  },
}));

vi.mock('./storage', () => ({
  // 9G.3 · o login hidrata só o ESSENCIAL. `lerTudo` continua no mock porque
  // outros caminhos do módulo o usam; o que o login chama é o de baixo.
  lerTudo: vi.fn(async () => ({})),
  hidratarEssencial: vi.fn(async () => ({ chaves: 0, bytes: 0, familias: {} })),
  limparCacheDados: vi.fn(),
}));

import { encerrarSessaoDesteDispositivo, login } from './auth';

beforeEach(() => {
  localStorage.clear();
  estado.perfil = { ...PERFIL };
  estado.updates = [];
  estado.saidas = [];
});

const tokenGravado = () =>
  estado.updates.find((u) => u.tabela === 'profiles' && 'sessao_token' in u)?.sessao_token;

describe('sessão única no login', () => {
  it('não recusa o login por existir sessão viva em outro dispositivo', async () => {
    // Heartbeat batido agora: no comportamento antigo isto respondia
    // "Esta conta já está em uso em outro dispositivo" e trancava o dono fora
    // da própria conta — inclusive quando a "outra sessão" era uma aba que ele
    // mesmo tinha fechado sem clicar em "Sair".
    estado.perfil = {
      ...PERFIL,
      sessao_token: 'token-do-outro',
      sessao_visto_em: new Date().toISOString(),
    };

    const r = await login('cmam.caldeiras@gmail.com', 'senha');

    expect(r.sucesso).toBe(true);
    expect(r.erro).toBeUndefined();
  });

  it('assume a sessão com token novo, para o dispositivo anterior ser derrubado pelo heartbeat', async () => {
    estado.perfil = {
      ...PERFIL,
      sessao_token: 'token-do-outro',
      sessao_visto_em: new Date().toISOString(),
    };

    await login('cmam.caldeiras@gmail.com', 'senha');

    expect(tokenGravado()).toBeTruthy();
    expect(tokenGravado()).not.toBe('token-do-outro');
    expect(localStorage.getItem('nr13_sessao_token')).toBe(tokenGravado());
  });

  it('reentrada no MESMO aparelho preserva o token (uma aba não derruba a outra)', async () => {
    localStorage.setItem('nr13_sessao_token', 'token-deste-aparelho');
    estado.perfil = {
      ...PERFIL,
      sessao_token: 'token-deste-aparelho',
      sessao_visto_em: new Date().toISOString(),
    };

    await login('cmam.caldeiras@gmail.com', 'senha');

    expect(tokenGravado()).toBe('token-deste-aparelho');
    expect(localStorage.getItem('nr13_sessao_token')).toBe('token-deste-aparelho');
  });
});

describe('dispositivo derrubado pela tomada de sessão', () => {
  it('derruba a sessão do Supabase, não só as chaves locais', async () => {
    // Limpar só o localStorage deixava o token de acesso valendo: um F5 revalidava
    // no RotaProtegida e o aparelho voltava para dentro.
    localStorage.setItem('nr13_usuario_logado', 'cmam.caldeiras@gmail.com');
    localStorage.setItem('nr13_org_id', 'org-1');
    localStorage.setItem('nr13_sessao_token', 'token-antigo');

    await encerrarSessaoDesteDispositivo();

    expect(estado.saidas).toEqual([{ scope: 'local' }]);
    expect(localStorage.getItem('nr13_usuario_logado')).toBeNull();
    expect(localStorage.getItem('nr13_org_id')).toBeNull();
    expect(localStorage.getItem('nr13_sessao_token')).toBeNull();
  });

  it('NÃO libera o lock no servidor: ele agora é do aparelho que assumiu', async () => {
    localStorage.setItem('nr13_usuario_logado', 'cmam.caldeiras@gmail.com');
    localStorage.setItem('nr13_sessao_token', 'token-antigo');

    await encerrarSessaoDesteDispositivo();

    // Um update em profiles aqui apagaria o sessao_token de quem acabou de entrar.
    expect(estado.updates.filter((u) => u.tabela === 'profiles')).toEqual([]);
  });
});

describe('escopo do signOut nos gates de entrada', () => {
  it('login recusado por conta inativa sai só deste dispositivo', async () => {
    // Com o padrão global do supabase-js, esta recusa revogava os refresh tokens
    // da conta em TODOS os aparelhos — o celular em campo caía junto.
    estado.perfil = { ...PERFIL, ativo: false };

    const r = await login('cmam.caldeiras@gmail.com', 'senha');

    expect(r.sucesso).toBe(false);
    expect(estado.saidas).toEqual([{ scope: 'local' }]);
  });
});
