/**
 * As cópias no localStorage (que os templates em iframe leem) seguem o servidor
 * (19/09/2026): a carga do Portal remove o que a resposta anterior pôs e esta não
 * trouxe — e, para o navegador que ainda não tem a lista, as chaves `_<TAG>` das
 * TAGs do cliente que não vieram. O resto do localStorage não é tocado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const semear = vi.fn(async () => 0);
vi.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('../../services/storage', () => ({ ler: vi.fn(() => null), semearCachePortal: (...a: unknown[]) => semear(...(a as [])) }));

import { buscarChaveSobDemanda, carregarDadosPortal } from './portalService';

const resposta = (chaves: Record<string, string>, versoes: Record<string, number> = {}) => ({
  data: { tags: ['ZZ'], chaves, versoes },
  error: null,
});

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  semear.mockClear();
});

describe('cópias do Portal no localStorage', () => {
  it('a carga seguinte remove a cópia que saiu e mantém o que não é do Portal', async () => {
    localStorage.setItem('nr13_papel', 'cliente');
    invoke.mockResolvedValueOnce(resposta({ nr13_calibracoes_ZZ: '[1]', nr13_laudo_ZZ: '{}' }));
    await carregarDadosPortal();
    invoke.mockResolvedValueOnce(resposta({ nr13_calibracoes_ZZ: '[1,2]' }));
    await carregarDadosPortal();
    expect(localStorage.getItem('nr13_calibracoes_ZZ')).toBe('[1,2]');
    expect(localStorage.getItem('nr13_laudo_ZZ')).toBeNull();
    expect(localStorage.getItem('nr13_papel')).toBe('cliente');
  });

  it('navegador sem a lista (carga antiga): limpa pelas TAGs do cliente', async () => {
    localStorage.setItem('nr13_calibracoes_ZZ', '[{"status":"rascunho"}]'); // resto de antes do filtro
    localStorage.setItem('nr13_vida_ZZ', '{}');
    localStorage.setItem('nr13_info_OUTRA', '{}');
    invoke.mockResolvedValueOnce(resposta({ nr13_calibracoes_ZZ: '[]' }));
    await carregarDadosPortal();
    expect(localStorage.getItem('nr13_calibracoes_ZZ')).toBe('[]');
    expect(localStorage.getItem('nr13_vida_ZZ')).toBeNull();
    expect(localStorage.getItem('nr13_info_OUTRA')).toBe('{}'); // não é TAG deste cliente
  });

  it('passa ao cache a versão real e o retrato completo; sob demanda não é retrato', async () => {
    invoke.mockResolvedValueOnce(resposta({ nr13_info_ZZ: '{}' }, { nr13_info_ZZ: 7 }));
    await carregarDadosPortal();
    expect(semear).toHaveBeenLastCalledWith({ nr13_info_ZZ: '{}' }, { versoes: { nr13_info_ZZ: 7 }, retratoCompleto: true });
    invoke.mockResolvedValueOnce(resposta({ nr13_rel_R_ZZ: '{}' }, { nr13_rel_R_ZZ: 3 }));
    await buscarChaveSobDemanda('nr13_rel_R_ZZ');
    expect(semear).toHaveBeenLastCalledWith({ nr13_rel_R_ZZ: '{}' }, { versoes: { nr13_rel_R_ZZ: 3 } });
    // a cópia sob demanda entra na lista e sai na próxima carga completa
    invoke.mockResolvedValueOnce(resposta({ nr13_info_ZZ: '{}' }));
    await carregarDadosPortal();
    expect(localStorage.getItem('nr13_rel_R_ZZ')).toBeNull();
  });
});
