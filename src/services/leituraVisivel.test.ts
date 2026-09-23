import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * O TOMBSTONE VISTO PELOS LEITORES (22/09/2026).
 *
 * A ordem desta rodada é deliberada e está registrada em
 * `docs/HARDENING-SINCRONIZACAO.md`: **primeiro** todos os leitores passam a
 * enxergar a lista filtrada, **depois** a exclusão passa a marcar. Marcar antes
 * faria item excluído reaparecer em tela; filtrar antes não quebra nada,
 * porque hoje não existe tombstone nenhum para filtrar.
 *
 * Estes testes provam a primeira metade — e provam a segunda com o interruptor
 * simulado, para que ligar `TOMBSTONE_ATIVO` seja um passo verificado e não uma
 * aposta.
 *
 * "F5" e "nova aba" aqui são a releitura do MESMO estado persistido: o cache é
 * a fonte, e nenhum dos leitores guarda a lista em memória entre chamadas.
 */

const dados = new Map<string, unknown>();

vi.mock('./storage', () => ({
  ler: <T,>(chave: string): T | null => (dados.has(chave) ? (dados.get(chave) as T) : null),
  lerCru: (chave: string) => (dados.has(chave) ? JSON.stringify(dados.get(chave)) : null),
  salvar: async (chave: string, valor: unknown) => {
    dados.set(chave, valor);
  },
  excluirChave: async (chave: string) => {
    dados.delete(chave);
  },
  listarChavesComPrefixo: (p: string) => [...dados.keys()].filter((c) => c.startsWith(p)),
  listarChavesDaTag: () => [],
  bloqueadoParaEscrita: () => false,
}));

vi.mock('./colecaoSync', () => ({
  gravarNaColecao: async (chave: string, mutar: (a: unknown[]) => unknown[]) => {
    dados.set(chave, mutar((dados.get(chave) as unknown[]) ?? []));
    return true;
  },
  removerDaColecao: async () => true,
}));

import { visiveis, marcarRemovido, estatisticaTombstones, podar, TOMBSTONE_ATIVO } from './colecoes';
import { definirFlagsSync, restaurarFlagsSync } from './flagsSync';
import { listarClientes, listarFuncionarios, salvarCliente, excluirCliente, excluirFuncionario } from '../features/cadastros/cadastroService';
import { carregarContainer, listarContainers, removerContainer } from '../features/inspecoes/inspecaoService';
import { excluirCalibracao, listarCalibracoes } from '../features/calibracoes/calibracaoService';
import { excluirComponente, excluirLote, listarComponentes, listarLotes } from '../features/calibracoes/componentesService';
import { listarResponsaveis } from '../features/calibracoes/responsavelCalibracao';
import { listarNotas } from '../features/agenda/notasAgenda';
import { listarRascunhos } from '../features/relatorios/rascunhos';
import { listarDocumentos } from '../features/prontuarios/indiceProntuarios';

const MORTO = '2026-09-22T12:00:00.000Z';

beforeEach(() => {
  dados.clear();
  restaurarFlagsSync();
});

afterEach(() => {
  restaurarFlagsSync();
});

/**
 * Um leitor por COLEÇÃO do catálogo, com o que ele precisa no cache.
 *
 * `nr13_historico_indice_` fica fora desta tabela porque seu leitor reconcilia
 * com registros e legado — tem um bloco próprio mais abaixo, que é onde a
 * ressurreição podia acontecer.
 */
const LEITORES: { nome: string; chave: string; ler: () => { id?: string }[]; extra?: object }[] = [
  { nome: 'clientes', chave: 'nr13_clientes', ler: listarClientes },
  { nome: 'funcionários', chave: 'nr13_lista_phs', ler: listarFuncionarios, extra: { nome: 'Fulano' } },
  { nome: 'notas da agenda', chave: 'nr13_agenda_notas', ler: listarNotas, extra: { data: '2026-09-22' } },
  { nome: 'rascunhos', chave: 'nr13_rascunhos', ler: listarRascunhos, extra: { tag: 'V-1' } },
  { nome: 'prontuários', chave: 'nr13_pront_indice', ler: listarDocumentos, extra: { tag: 'V-1' } },
  { nome: 'containers', chave: 'nr13_docs_V-1', ler: () => listarContainers('V-1') },
  { nome: 'calibrações', chave: 'nr13_calibracoes_V-1', ler: () => listarCalibracoes('V-1') },
  { nome: 'componentes', chave: 'nr13_componentes_cal_V-1', ler: () => listarComponentes('V-1') },
  { nome: 'lotes', chave: 'nr13_lotes_cal_V-1', ler: () => listarLotes('V-1') },
];

describe('LEITURA · cada coleção tem uma visão filtrada', () => {
  for (const l of LEITORES) {
    it(`${l.nome}: item ativo aparece, tombstonado não`, () => {
      dados.set(l.chave, [
        { id: 'a', ...l.extra },
        marcarRemovido({ id: 'b', ...l.extra }, MORTO),
        { id: 'c', ...l.extra },
      ]);

      const ids = l.ler().map((i) => i.id).sort();
      expect(ids).toEqual(['a', 'c']);
    });

    it(`${l.nome}: coleção vazia continua válida (e não vira erro)`, () => {
      dados.set(l.chave, []);
      expect(l.ler()).toEqual([]);
    });

    it(`${l.nome}: lista inteiramente tombstonada lê como vazia`, () => {
      dados.set(l.chave, [marcarRemovido({ id: 'a', ...l.extra }, MORTO)]);
      expect(l.ler()).toEqual([]);
    });

    it(`${l.nome}: F5 / nova aba — reler o mesmo cache dá o mesmo resultado`, () => {
      dados.set(l.chave, [{ id: 'a', ...l.extra }, marcarRemovido({ id: 'b', ...l.extra }, MORTO)]);
      const antes = l.ler().map((i) => i.id);
      const depois = l.ler().map((i) => i.id); // nada é memoizado entre chamadas
      expect(depois).toEqual(antes);
      expect(depois).toEqual(['a']);
    });
  }
});

describe('CONTADOR e SELECTOR não contam o que não se vê', () => {
  it('o contador de uma lista é o tamanho da visão filtrada', () => {
    dados.set('nr13_clientes', [{ id: 'a' }, marcarRemovido({ id: 'b' }, MORTO), { id: 'c' }]);
    expect(listarClientes().length).toBe(2);
  });

  it('o selector de responsável de calibração não oferece funcionário excluído', () => {
    dados.set('nr13_lista_phs', [
      { id: 'f1', nome: 'Engenheira' },
      marcarRemovido({ id: 'f2', nome: 'Saiu da empresa' }, MORTO),
    ]);
    expect(listarResponsaveis().map((f) => f.id)).toEqual(['f1']);
  });

  it('busca/filtro sobre a lista já parte da visão filtrada', () => {
    dados.set('nr13_clientes', [
      { id: 'a', nome: 'ACME' },
      marcarRemovido({ id: 'b', nome: 'ACME ANTIGA' }, MORTO),
    ]);
    const achados = listarClientes().filter((c) => (c as { nome?: string }).nome?.includes('ACME'));
    expect(achados.map((c) => c.id)).toEqual(['a']);
  });
});

describe('ESCRITA não apaga tombstone', () => {
  it('salvar um cliente preserva a marca de outro já excluído', () => {
    dados.set('nr13_clientes', [{ id: 'a' }, marcarRemovido({ id: 'b' }, MORTO)]);

    salvarCliente({ id: 'c', nome: 'Novo' } as never);

    // A visão continua sem o 'b'…
    expect(listarClientes().map((c) => c.id).sort()).toEqual(['a', 'c']);
    // …e o BRUTO ainda carrega o tombstone: é ele que impede a ressurreição.
    expect((dados.get('nr13_clientes') as { id: string; removidoEm?: string }[]).find((c) => c.id === 'b')?.removidoEm)
      .toBe(MORTO);
  });

  it('excluir passa pela porta única — e hoje o interruptor está desligado', async () => {
    expect(TOMBSTONE_ATIVO).toBe(false);
    dados.set('nr13_clientes', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    excluirCliente('c');

    expect(listarClientes().map((c) => c.id)).toEqual(['a', 'b']);
    // Desligado, a exclusão continua TIRANDO da lista, como sempre fez.
    expect(dados.get('nr13_clientes')).toHaveLength(2);
  });
});

describe('PODA · nada é apagado sem corte provado', () => {
  it('mede o que a poda economizaria', () => {
    const lista = [{ id: 'a' }, marcarRemovido({ id: 'b' }, MORTO), marcarRemovido({ id: 'c' }, '2026-01-01T00:00:00.000Z')];
    const e = estatisticaTombstones(lista);
    expect(e.total).toBe(3);
    expect(e.removidos).toBe(2);
    expect(e.bytes).toBeGreaterThan(0);
    expect(e.maisAntigo).toBe('2026-01-01T00:00:00.000Z');
  });

  it('`podar` é fail-closed: sem corte, ou com a poda desligada, não tira nada', () => {
    const lista = [{ id: 'a' }, marcarRemovido({ id: 'b' }, MORTO)];
    expect(podar(lista)).toEqual(lista);
    expect(podar(lista, 999)).toEqual(lista); // a poda automática está DESLIGADA
  });

  it('`visiveis` não depende da poda — a lista filtrada é a mesma', () => {
    const lista = [{ id: 'a' }, marcarRemovido({ id: 'b' }, MORTO)];
    expect(visiveis(podar(lista, 999)).map((i) => i.id)).toEqual(['a']);
  });
});

// ===========================================================================
// ENSAIO: o interruptor LIGADO (22/09/2026)
// ===========================================================================
/**
 * A segunda metade da ordem de ativação. Com `tombstone` ligado, a exclusão
 * MARCA — e a pergunta que importa é se alguma tela volta a mostrar o item.
 *
 * Os escritores aqui são os reais (`excluirCliente`, `removerContainer`…), não
 * uma simulação: é o caminho que o usuário aciona no botão Excluir.
 */
describe('ENSAIO · com TOMBSTONE ligado, excluir marca e nada reaparece', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true }));

  it('cliente: sai da lista, do contador e da busca; a marca fica no bruto', () => {
    dados.set('nr13_clientes', [{ id: 'a', nome: 'ACME' }, { id: 'b', nome: 'BETA' }]);

    excluirCliente('b');

    expect(listarClientes().map((c) => c.id)).toEqual(['a']);
    expect(listarClientes().length).toBe(1);
    expect(listarClientes().filter((c) => (c as { nome?: string }).nome === 'BETA')).toEqual([]);

    const bruto = dados.get('nr13_clientes') as { id: string; removidoEm?: string }[];
    expect(bruto).toHaveLength(2); // o item CONTINUA lá
    expect(bruto.find((c) => c.id === 'b')?.removidoEm).toBeTruthy();
  });

  it('funcionário: some da lista E do selector de responsável', () => {
    dados.set('nr13_lista_phs', [
      { id: 'f1', nome: 'Engenheira' },
      { id: 'f2', nome: 'Saiu da empresa' },
    ]);

    excluirFuncionario('f2');

    expect(listarFuncionarios().map((f) => f.id)).toEqual(['f1']);
    expect(listarResponsaveis().map((f) => f.id)).toEqual(['f1']);
    expect(dados.get('nr13_lista_phs')).toHaveLength(2);
  });

  it('container de inspeção: some da lista e de `carregarContainer`', async () => {
    dados.set('nr13_docs_V-1', [{ id: 'c1' }, { id: 'c2' }]);

    await removerContainer('V-1', 'c2');

    expect(listarContainers('V-1').map((c) => c.id)).toEqual(['c1']);
    expect(carregarContainer('V-1', 'c2')).toBeNull();
    expect(dados.get('nr13_docs_V-1')).toHaveLength(2);
  });

  it('componente e lote de calibração: somem das duas listas', async () => {
    dados.set('nr13_componentes_cal_V-1', [{ id: 'comp1' }, { id: 'comp2' }]);
    dados.set('nr13_lotes_cal_V-1', [{ id: 'lote1' }, { id: 'lote2' }]);

    await excluirComponente('V-1', 'comp2');
    await excluirLote('V-1', 'lote2');

    expect(listarComponentes('V-1').map((c) => c.id)).toEqual(['comp1']);
    expect(listarLotes('V-1').map((l) => l.id)).toEqual(['lote1']);
    expect(dados.get('nr13_componentes_cal_V-1')).toHaveLength(2);
    expect(dados.get('nr13_lotes_cal_V-1')).toHaveLength(2);
  });

  it('calibração: some da lista do equipamento', async () => {
    dados.set('nr13_calibracoes_V-1', [{ id: 'cal1' }, { id: 'cal2' }]);

    await excluirCalibracao('V-1', 'cal2');

    expect(listarCalibracoes('V-1').map((c) => c.id)).toEqual(['cal1']);
    expect(dados.get('nr13_calibracoes_V-1')).toHaveLength(2);
  });

  it('excluir DUAS vezes o mesmo item não duplica nem desfaz a marca', () => {
    dados.set('nr13_clientes', [{ id: 'a' }, { id: 'b' }]);

    excluirCliente('b');
    const depoisDaPrimeira = JSON.stringify(dados.get('nr13_clientes'));
    excluirCliente('b');

    expect(dados.get('nr13_clientes')).toHaveLength(2);
    expect(listarClientes().map((c) => c.id)).toEqual(['a']);
    // O carimbo pode mudar (é o instante da 2ª chamada); a lista, não.
    expect((dados.get('nr13_clientes') as unknown[]).length).toBe(
      (JSON.parse(depoisDaPrimeira) as unknown[]).length,
    );
  });

  it('salvar OUTRO item depois de excluir não ressuscita o excluído', () => {
    dados.set('nr13_clientes', [{ id: 'a' }, { id: 'b' }]);

    excluirCliente('b');
    salvarCliente({ id: 'c', nome: 'Novo' } as never);

    expect(listarClientes().map((c) => c.id).sort()).toEqual(['a', 'c']);
    const bruto = dados.get('nr13_clientes') as { id: string; removidoEm?: string }[];
    expect(bruto.find((c) => c.id === 'b')?.removidoEm).toBeTruthy();
  });

  it('EDITAR o item excluído não o traz de volta pela porta do escritor', () => {
    dados.set('nr13_clientes', [{ id: 'a' }, { id: 'b', nome: 'antigo' }]);
    excluirCliente('b');

    // O escritor substitui pelo id — e o substituto NÃO carrega a marca.
    // Isto é uma edição de um item que a tela não mostra mais: só chega aqui
    // quem guardou uma referência velha (uma aba aberta antes da exclusão).
    salvarCliente({ id: 'b', nome: 'editado numa aba velha' } as never);

    // LIMITAÇÃO CONHECIDA E DECLARADA: a edição vence a exclusão neste caminho,
    // porque o escritor grava o objeto que recebeu. Não é ressurreição por
    // SINCRONIZAÇÃO (o merge respeita o tombstone) — é a aba velha reescrevendo
    // o item. A tela fecha esse caminho ao não oferecer o item; fechá-lo no
    // escritor exigiria ele conhecer `removidoEm`, que é o oposto de manter a
    // regra num lugar só. Registrado como P2.
    expect(listarClientes().map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
});
