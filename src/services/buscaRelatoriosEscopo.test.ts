/**
 * Fase 9 · 9E — RELATÓRIO DE EQUIPAMENTO EXCLUÍDO NÃO SOME, E NÃO SE DISFARÇA.
 *
 * O rollout de 25/08 mostrou 15 relatórios onde a tela legada mostrava 3. Os 12
 * extras são reais: `nr13_historico_indice_<TAG>` e `nr13_rel_<id>_<TAG>` vivos,
 * um registro para cada, com o PDF arquivado intacto. O que eles NÃO têm é
 * ficha de equipamento — `nr13_info_<TAG>` não existe mais.
 *
 * A tela legada nunca os mostrou porque ela é TAG-first: primeiro escolhe-se um
 * equipamento e só então o histórico dele aparece. Sem ficha, não há por onde
 * chegar. A V9 lê a projeção direto, e por isso enxerga o que estava lá o tempo
 * todo.
 *
 * A POLÍTICA, e as três metades importam:
 *   · **nada é apagado** — nenhum caminho aqui exclui relatório ou PDF;
 *   · **nada se disfarça** — o item vem marcado `equipamentoAtivo: false`, e a
 *     tela diz "Equipamento excluído" em letras;
 *   · **nada some sem aviso** — o escopo padrão é `ativos` (paridade com a tela
 *     antiga), e a contagem devolve `historicos` para o cabeçalho poder dizer
 *     quantos ficaram de fora e oferecer o clique que os mostra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  resposta: [] as unknown[],
  erro: null as unknown,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      const p = Promise.resolve({ data: estado.resposta, error: estado.erro });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import { contarRelatorios, listarPaginaRelatorios, rotuloHistoricos, TETO_HISTORICOS } from './buscaRelatorios';

function linha(id: string, extra: Record<string, unknown> = {}) {
  return {
    relatorio_id: id,
    tag: 'VASO A23',
    codigo: id,
    nome: null,
    tipo: null,
    status: null,
    profissional: null,
    emissao: '2026-08-12',
    validade: null,
    execucao_inspecao: null,
    proxima_inspecao_interna: null,
    proxima_inspecao_externa: null,
    pdf_ref: null,
    sha256: null,
    paginas: null,
    source_version: 1,
    equipamento_ativo: true,
    ...extra,
  };
}

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = [];
  estado.erro = null;
});

describe('escopo do equipamento', () => {
  it('pede `ativos` quando ninguém escolheu — a tela antiga é a referência', async () => {
    await listarPaginaRelatorios();
    expect(estado.chamadas[0].args.p_escopo).toBe('ativos');
  });

  it('repassa o escopo escolhido', async () => {
    await listarPaginaRelatorios({ escopo: 'historicos' });
    expect(estado.chamadas[0].args.p_escopo).toBe('historicos');

    await listarPaginaRelatorios({ escopo: 'todos' });
    expect(estado.chamadas[1].args.p_escopo).toBe('todos');
  });

  it('a contagem usa o MESMO escopo da listagem', async () => {
    estado.resposta = [{ total: 3, exato: true, historicos: 12 }];
    await contarRelatorios({ escopo: 'todos' });
    expect(estado.chamadas[0].args.p_escopo).toBe('todos');
  });
});

describe('o item diz a que estado pertence', () => {
  it('marca `equipamentoAtivo` a partir da coluna do servidor', async () => {
    estado.resposta = [linha('REL-1'), linha('REL-2', { equipamento_ativo: false })];
    const p = await listarPaginaRelatorios({ escopo: 'todos' });
    expect(p.itens.map((i) => i.equipamentoAtivo)).toEqual([true, false]);
  });

  /**
   * O default é `true`, não `false`, e a escolha é deliberada: um servidor
   * antigo (RPC sem a coluna) devolveria `undefined` para todas as linhas, e
   * `false` por default carimbaria "Equipamento excluído" na organização
   * inteira — uma acusação falsa em cima de relatório assinado.
   */
  it('coluna ausente vale ATIVO, nunca excluído', async () => {
    const { equipamento_ativo: _fora, ...semColuna } = linha('REL-3');
    estado.resposta = [semColuna];
    const p = await listarPaginaRelatorios();
    expect(p.itens[0].equipamentoAtivo).toBe(true);
  });
});

describe('a contagem conta os dois mundos', () => {
  it('devolve quantos históricos ficaram fora do escopo atual', async () => {
    estado.resposta = [{ total: 3, exato: true, historicos: 12 }];
    expect(await contarRelatorios()).toEqual({ total: 3, exato: true, historicos: 12 });
  });

  it('servidor sem a coluna: nenhum histórico anunciado, e nada quebra', async () => {
    estado.resposta = [{ total: 3, exato: true }];
    expect(await contarRelatorios()).toEqual({ total: 3, exato: true, historicos: 0 });
  });
});

/**
 * O AVISO NÃO PODE DIZER UM NÚMERO EXATO QUE ELE NÃO MEDIU.
 *
 * A contagem de órfãos tem teto próprio, e por medição: órfão é raro, e contar
 * coisa rara até 1.000 obriga a percorrer a tabela quase inteira (5.144 buffers
 * contra os 214 constantes da 9E.2). O teto resolve o custo — mas se a tela
 * imprimir o valor do teto como se fosse a conta fechada, ela passa a afirmar
 * "200" quando são 4.000.
 */
describe('rotuloHistoricos', () => {
  it('conta pequena vira o número, com o plural certo', () => {
    expect(rotuloHistoricos(1)).toBe('1 relatório');
    expect(rotuloHistoricos(12)).toBe('12 relatórios');
  });

  it('no teto ainda é número exato — o teto é alcançável de verdade', () => {
    expect(rotuloHistoricos(TETO_HISTORICOS)).toBe('200 relatórios');
  });

  it('acima do teto a tela DIZ que não contou tudo', () => {
    expect(rotuloHistoricos(TETO_HISTORICOS + 1)).toBe('mais de 200 relatórios');
  });
});
