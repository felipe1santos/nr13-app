/**
 * Fase 9 · 9F.5.3 — o agregado pedido DUAS vezes por boot.
 *
 * Medido em produção em 03/09/2026, e já anotado no registro da 9D em 25/08:
 * abrir a aplicação dispara `rpc/vencimentos_org` **duas vezes**. Não é mistério
 * — são dois consumidores legítimos do MESMO painel:
 *
 *   · `Layout.tsx` precisa de `vencidos` e `total` para o sino e o contador do
 *     menu lateral;
 *   · a página (`/dashboard` ou `/vencimentos`) precisa do painel inteiro.
 *
 * Cada chamada é um agregado sobre a projeção INTEIRA da organização. Numa org
 * de 4 equipamentos é desperdício barato; em 50.000 é o dobro do trabalho mais
 * caro da tela de entrada.
 *
 * ## Por que TTL curto e não cache

 * Um cache com invalidação por evento seria mais preciso e muito mais fácil de
 * errar: quem esquece de invalidar mostra prazo vencido como se estivesse em
 * dia. Aqui a janela é curta e existe uma saída explícita — `forcar` — que os
 * dois gatilhos de recarga (dado alterado, volta de foco) usam. Recarregar
 * porque algo mudou NUNCA pega cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const chamadas = vi.hoisted(() => ({ n: 0 }));
const resposta = vi.hoisted(() => ({ data: null as unknown, error: null as unknown }));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(async () => {
      chamadas.n += 1;
      return { data: resposta.data, error: resposta.error };
    }),
  },
}));

const flag = vi.hoisted(() => ({ bootV9: false, vencimentosV9: true }));
vi.mock('./flag', () => ({
  bootV9Ativo: () => flag.bootV9,
  vencimentosV9Ativa: () => flag.vencimentosV9,
}));

vi.mock('./storage', () => ({ listarChavesComPrefixo: () => [] }));

import { carregarPainel, JANELA_PAINEL_MS, invalidarPainel } from './vencimentosServidor';

const HOJE = new Date(2026, 8, 3);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 3, 10, 0, 0));
  chamadas.n = 0;
  flag.bootV9 = false;
  flag.vencimentosV9 = true;
  resposta.data = { total_equip: 9, com_prazo: 9, vencidos: 1, a_vencer_30: 2, itens: [] };
  resposta.error = null;
  invalidarPainel();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('carregarPainel · o agregado não sai duas vezes por boot', () => {
  it('dois consumidores no mesmo instante compartilham UMA agregação', async () => {
    const [a, b] = await Promise.all([carregarPainel(HOJE), carregarPainel(HOJE)]);
    expect(chamadas.n).toBe(1);
    expect(a.kpis.total).toBe(9);
    expect(b.kpis.total).toBe(9);
  });

  it('segunda chamada logo depois da primeira ainda reaproveita', async () => {
    await carregarPainel(HOJE);
    vi.setSystemTime(new Date(2026, 8, 3, 10, 0, 1));
    await carregarPainel(HOJE);
    expect(chamadas.n).toBe(1);
  });

  it('passada a janela, agrega de novo', async () => {
    await carregarPainel(HOJE);
    vi.setSystemTime(new Date(Date.now() + JANELA_PAINEL_MS + 1));
    await carregarPainel(HOJE);
    expect(chamadas.n).toBe(2);
  });

  it('`forcar` NUNCA pega cache — é o caminho de "algo mudou"', async () => {
    await carregarPainel(HOJE);
    await carregarPainel(HOJE, { forcar: true });
    expect(chamadas.n).toBe(2);
  });

  it('o caminho LOCAL não é cacheado — ele já lê do cache do aparelho', async () => {
    flag.vencimentosV9 = false;
    flag.bootV9 = false;
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('local');
    expect(chamadas.n).toBe(0);
  });

  it('painel com ERRO não fica preso na janela — a próxima tenta de novo', async () => {
    // Guardar um erro por 3 s transformaria uma falha momentânea de rede em três
    // segundos de "não sei" para todo mundo que pedir o painel.
    resposta.error = { message: 'sem rede' };
    const ruim = await carregarPainel(HOJE);
    expect(ruim.erro).toBe(true);

    resposta.error = null;
    const bom = await carregarPainel(HOJE);
    expect(bom.erro).toBeUndefined();
    expect(chamadas.n).toBe(2);
  });
});
