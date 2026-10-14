import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'chave-de-teste');
const mod = await import('./googlePlaces');

const fetchMock = vi.fn();

beforeEach(() => {
  mod.__reiniciarTravasBusca();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ places: [{ id: 'p1', displayName: { text: 'X' } }] })));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
});

describe('buscarEmpresas — travas de custo do Places', () => {
  it('Enter segurado (20 chamadas simultâneas da mesma busca) gera UMA requisição', async () => {
    const r = await Promise.all(Array.from({ length: 20 }, () => mod.buscarEmpresas('Empresa Vitória')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.every((x) => x[0].placeId === 'p1')).toBe(true);
  });

  it('repetir a mesma busca (variando espaço/caixa) sai do cache', async () => {
    await mod.buscarEmpresas('Empresa Vitória');
    vi.setSystemTime(Date.now() + 10_000);
    await mod.buscarEmpresas('  empresa   VITÓRIA ');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('texto curto não consulta', async () => {
    await expect(mod.buscarEmpresas('ab')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buscas diferentes em rajada respeitam o intervalo mínimo', async () => {
    await mod.buscarEmpresas('empresa um');
    await expect(mod.buscarEmpresas('empresa dois')).rejects.toThrow(/Aguarde/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('teto por sessão corta a requisição', async () => {
    for (let i = 0; i < mod.TETO_REQUISICOES_SESSAO; i++) {
      vi.setSystemTime(Date.now() + 2000);
      await mod.buscarEmpresas(`empresa ${i}`);
    }
    vi.setSystemTime(Date.now() + 2000);
    await expect(mod.buscarEmpresas('empresa extra')).rejects.toThrow(/Limite/);
    expect(fetchMock).toHaveBeenCalledTimes(mod.TETO_REQUISICOES_SESSAO);
  });

  it('erro de rede não fica no cache (a próxima tentativa consulta de novo)', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 500 }));
    await expect(mod.buscarEmpresas('empresa falha')).rejects.toThrow();
    vi.setSystemTime(Date.now() + 2000);
    await mod.buscarEmpresas('empresa falha');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
