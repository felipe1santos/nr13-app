/**
 * Fase 9 · 9F.1.1 + 9F.1.3 — a tela nova de `/inspecoes` NÃO baixa a
 * organização inteira, e o equipamento chega quando é escolhido.
 *
 * ## O que está sendo consertado
 *
 * `Inspecoes.tsx` começa com `listarEquipamentos()`, e essa função começa com
 * `await lerTudo()` — **hidratação completa**. Sob `boot_v9`, o boot traz 7
 * chaves globais (20 KB medidos na 9D) e a primeira visita a `/inspecoes`
 * desfaz isso baixando o parque inteiro. O mesmo vale para `/prontuarios`,
 * `/calibracoes` e a `/relatorios` legada: é um defeito só, repetido quatro
 * vezes.
 *
 * ## O elo que faltava
 *
 * `carregarEquipamento(tag)` é a semeadura sob demanda que o desenho (§4) chama
 * de estratégia oficial de compatibilidade. Ela existe, tem teste próprio — e
 * **nenhuma tela a chamava**: só o teste a exercitava. Hoje isso fica mascarado
 * porque `lerTudo()` traz tudo. Tirar o `lerTudo()` sem ligar a semeadura faria
 * a lista de containers abrir VAZIA — trocar "lento" por "sumiu", que é o pior
 * negócio possível neste sistema.
 *
 * É a mesma forma de defeito de `sincronizarFlagDoServidor` (9D) e da v2 ligada
 * sem chamador (§2-ter do CLAUDE.md): peça pronta, ninguém chamando.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  ordem: [] as string[],
  dados: {} as Record<string, unknown>,
  falhaSemeadura: null as Error | null,
}));

vi.mock('../../services/storage', () => ({
  ler: <T,>(chave: string): T | null => {
    estado.ordem.push(`ler:${chave}`);
    return (estado.dados[chave] as T) ?? null;
  },
  salvar: async () => {},
  lerTudo: async () => {
    // Se este caminho for tocado, a tela nova desfez o boot leve.
    estado.ordem.push('lerTudo');
    return {};
  },
}));

vi.mock('../equipamento/equipamentoService', () => ({
  carregarEquipamento: async (tag: string) => {
    estado.ordem.push(`semear:${tag}`);
    if (estado.falhaSemeadura) throw estado.falhaSemeadura;
  },
}));

import { abrirEquipamentoParaInspecao } from './catalogoInspecoes';

beforeEach(() => {
  estado.ordem = [];
  estado.dados = {};
  estado.falhaSemeadura = null;
});

describe('abrir um equipamento na tela de inspeções', () => {
  it('SEMEIA a TAG antes de ler os containers', async () => {
    estado.dados['nr13_docs_VP-01'] = [{ id: 'c1', nome: 'Rodada 1', criadoEm: '01/08/2026', ensaios: [], dados: {} }];

    const containers = await abrirEquipamentoParaInspecao('VP-01');

    expect(containers).toHaveLength(1);
    // A ordem é o teste: ler antes de semear devolveria vazio no aparelho que
    // ainda não tem a TAG no cache.
    expect(estado.ordem).toEqual(['semear:VP-01', 'ler:nr13_docs_VP-01']);
  });

  it('NÃO chama lerTudo — o boot leve continua leve', async () => {
    await abrirEquipamentoParaInspecao('VP-01');
    expect(estado.ordem).not.toContain('lerTudo');
  });

  it('semeia SÓ a TAG escolhida', async () => {
    estado.dados['nr13_docs_VP-01'] = [{ id: 'c1' }];
    estado.dados['nr13_docs_VP-02'] = [{ id: 'c2' }, { id: 'c3' }];

    const containers = await abrirEquipamentoParaInspecao('VP-02');

    expect(containers).toHaveLength(2);
    expect(estado.ordem.filter((o) => o.startsWith('semear:'))).toEqual(['semear:VP-02']);
  });

  it('equipamento sem container nenhum devolve lista vazia, sem quebrar', async () => {
    await expect(abrirEquipamentoParaInspecao('VP-09')).resolves.toEqual([]);
  });

  it('falha de rede na semeadura NÃO derruba a abertura', async () => {
    // Offline, o que já está no aparelho continua valendo. Derrubar a navegação
    // por causa da rede transformaria tela degradada em tela quebrada — e é
    // exatamente o que `carregarEquipamento` promete no próprio comentário.
    estado.falhaSemeadura = new Error('sem rede');
    estado.dados['nr13_docs_VP-01'] = [{ id: 'c1' }];

    const containers = await abrirEquipamentoParaInspecao('VP-01');

    expect(containers).toHaveLength(1);
  });
});
