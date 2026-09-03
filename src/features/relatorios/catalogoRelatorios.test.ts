/**
 * Fase 9 · 9F.6 — o que a tela nova de `/relatorios` precisa do armazenamento.
 *
 * `/relatorios` era a ÚLTIMA tela de lista sem flag: `Relatorios.tsx` chamava
 * `listarEquipamentos()`, que começa com `await lerTudo()`, e depois
 * `montarResumo(tag)` — que lê CINCO chaves por equipamento, incluindo
 * `nr13_fotos_`, a família mais pesada do sistema. A lista fazia parse das fotos
 * de todos os equipamentos para desenhar cartões.
 *
 * Duas coisas que estes testes travam, e as duas já custaram caro nesta fase:
 *
 *   · **a ordem** — semear a TAG ANTES de ler o histórico. Invertida, a tela
 *     abre o histórico VAZIO de um equipamento que tem relatórios, sem erro
 *     nenhum. É o mesmo risco da 9F.2, onde a inversão imprimia seis folhas
 *     com "-";
 *   · **não saber ≠ zero** — falha ao contar devolve `null`, e o cartão escreve
 *     "—". Escrever "0 Relatórios" sobre um equipamento que tem doze é a mesma
 *     mentira que o painel de vencimentos aprendeu a não contar em 25/08.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ordem = vi.hoisted(() => ({ eventos: [] as string[] }));
const rpc = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
  chamadas: [] as unknown[],
}));

vi.mock('../equipamento/equipamentoService', () => ({
  carregarEquipamento: vi.fn(async (tag: string) => {
    ordem.eventos.push('semear:' + tag);
  }),
}));

vi.mock('./historicoRelatorios', () => ({
  listarIndice: vi.fn((tag: string) => {
    ordem.eventos.push('ler:' + tag);
    return [];
  }),
}));

vi.mock('../../services/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (nome: string, args: unknown) => {
      rpc.chamadas.push({ nome, args });
      return { data: rpc.data, error: rpc.error };
    }),
  },
}));

import {
  abrirEquipamentoParaRelatorio,
  contagensPorTag,
  deveHidratarListaLegada,
} from './catalogoRelatorios';

beforeEach(() => {
  ordem.eventos.length = 0;
  rpc.chamadas.length = 0;
  rpc.data = null;
  rpc.error = null;
});

describe('deveHidratarListaLegada', () => {
  it('com a flag LIGADA ninguém hidrata — a lista vem da projeção', () => {
    expect(deveHidratarListaLegada(true)).toBe(false);
  });

  it('com a flag DESLIGADA a tela legada continua exatamente como hoje', () => {
    expect(deveHidratarListaLegada(false)).toBe(true);
  });
});

describe('abrirEquipamentoParaRelatorio', () => {
  it('SEMEIA a TAG antes de LER o histórico — a ordem, dentro da função', async () => {
    // A ordem mora AQUI e não no componente de propósito: regra que vive no JSX
    // não tem teste nesta suíte (ambiente node, sem render).
    await abrirEquipamentoParaRelatorio('VP-01');
    expect(ordem.eventos).toEqual(['semear:VP-01', 'ler:VP-01']);
  });

  it('devolve o histórico já lido depois da semeadura', async () => {
    const historico = await abrirEquipamentoParaRelatorio('VP-01');
    expect(Array.isArray(historico)).toBe(true);
  });

  it('não lança quando a semeadura falha — segue com o que há no aparelho', async () => {
    const { carregarEquipamento } = await import('../equipamento/equipamentoService');
    vi.mocked(carregarEquipamento).mockRejectedValueOnce(new Error('sem rede'));
    await expect(abrirEquipamentoParaRelatorio('VP-02')).resolves.toEqual([]);
  });
});

describe('contagensPorTag', () => {
  it('lista vazia não chama o servidor', async () => {
    const mapa = await contagensPorTag([]);
    expect(rpc.chamadas).toHaveLength(0);
    expect(mapa?.size).toBe(0);
  });

  it('devolve a contagem por TAG, numa chamada só para a página inteira', async () => {
    rpc.data = [
      { tag: 'VP-01', total: 3 },
      { tag: 'VP-02', total: 1 },
    ];
    const mapa = await contagensPorTag(['VP-01', 'VP-02', 'VP-03']);
    expect(rpc.chamadas).toHaveLength(1);
    expect(mapa?.get('VP-01')).toBe(3);
    expect(mapa?.get('VP-02')).toBe(1);
  });

  it('TAG sem relatório simplesmente não volta — e isso é ZERO, não desconhecido', async () => {
    rpc.data = [{ tag: 'VP-01', total: 2 }];
    const mapa = await contagensPorTag(['VP-01', 'VP-03']);
    expect(mapa?.get('VP-03')).toBeUndefined();
    expect(mapa).not.toBeNull(); // o mapa existe: a consulta respondeu
  });

  it('FALHA devolve null — não saber não é zero', async () => {
    rpc.error = { message: 'sem rede' };
    const mapa = await contagensPorTag(['VP-01']);
    expect(mapa).toBeNull();
  });
});
