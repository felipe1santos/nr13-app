import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O gate de sessão não pode confundir "o servidor não respondeu" com "esta conta
 * foi revogada".
 *
 * Sem esta distinção, o dia em que o Supabase aplicasse a restrição de cota (402
 * em toda requisição) TODOS os usuários seriam deslogados e não conseguiriam
 * voltar — desnecessariamente, porque com o armazenamento v2 os dados estão no
 * IndexedDB do aparelho e o trabalho de campo continuaria, subindo quando o
 * serviço voltasse.
 *
 * Os dois lados são testados de propósito: afrouxar o lado da autorização
 * transformaria o conserto numa brecha de acesso.
 */
let respostaPerfil: { data: unknown; error: unknown; status: number } = {
  data: { plano: 'completo', ativo: true, role: 'user', acesso_expira_em: null, papel: 'mestre', org_id: 'org-1' },
  error: null,
  status: 200,
};
let sessao: unknown = { session: { user: { id: 'u1' } } };
const signOut = vi.fn(async () => ({ error: null }));

vi.mock('./supabase', () => {
  const consulta = () => {
    const alvo = {
      select: () => alvo,
      eq: () => alvo,
      update: () => alvo,
      maybeSingle: async () => respostaPerfil,
    };
    return alvo;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: sessao }),
        signOut: (...a: unknown[]) => signOut(...(a as [])),
      },
      from: consulta,
      rpc: async () => ({ data: null, error: { message: 'sem rpc' } }),
    },
    escopoStorageAtual: async () => ({ coluna: 'org_id', id: 'org-1' }),
  };
});

vi.mock('./storage', () => ({ lerTudo: async () => ({}), limparCacheDados: () => {} }));
vi.mock('./flag', () => ({
  sincronizarFlagDoServidor: async () => {},
  zerarFlagEmMemoria: () => {},
  CHAVE_FLAG_V2: 'nr13_armazenamento_v2',
}));
vi.mock('./assinatura', () => ({ gravarEstadoLocal: () => {}, limparEstadoLocal: () => {} }));

import { verificarAcesso } from './auth';

function perfilComFalha(status: number, code?: string) {
  respostaPerfil = { data: null, error: { message: 'falhou', code }, status };
}

beforeEach(() => {
  localStorage.clear();
  signOut.mockClear();
  sessao = { session: { user: { id: 'u1' } } };
  localStorage.setItem('nr13_org_id', 'org-1');
  respostaPerfil = {
    data: { plano: 'completo', ativo: true, role: 'user', acesso_expira_em: null, papel: 'mestre', org_id: 'org-1' },
    error: null,
    status: 200,
  };
});

describe('servidor indisponível NÃO desloga', () => {
  it('402 (cota estourada) mantém a sessão', async () => {
    perfilComFalha(402);
    const r = await verificarAcesso();
    expect(r).toEqual({ ativo: true, servidorIndisponivel: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('503 mantém a sessão', async () => {
    perfilComFalha(503);
    const r = await verificarAcesso();
    expect(r.ativo).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('não apaga o escopo do armazenamento — sem org_id o app não acha os dados', async () => {
    perfilComFalha(402);
    await verificarAcesso();
    expect(localStorage.getItem('nr13_org_id')).toBe('org-1');
  });
});

describe('revogação de verdade continua deslogando', () => {
  it('403 desloga', async () => {
    perfilComFalha(403);
    const r = await verificarAcesso();
    expect(r.ativo).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });

  it('JWT inválido desloga', async () => {
    perfilComFalha(400, 'PGRST301');
    const r = await verificarAcesso();
    expect(r.ativo).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });

  it('perfil lido e inativo desloga — o servidor respondeu sobre esta conta', async () => {
    respostaPerfil = {
      data: { plano: 'completo', ativo: false, role: 'user', acesso_expira_em: null },
      error: null,
      status: 200,
    };
    const r = await verificarAcesso();
    expect(r.ativo).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });
});

describe('sem sessão', () => {
  it('continua mandando para o login', async () => {
    sessao = { session: null };
    const r = await verificarAcesso();
    expect(r.ativo).toBe(false);
  });
});
