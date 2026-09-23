import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A EXCLUSÃO, DO CLIQUE AO OUTRO APARELHO (22/09/2026).
 *
 * Três coisas que só se provam juntas:
 *
 * 1. o leitor DERIVADO (o índice do histórico, que se repara sozinho a partir
 *    dos registros e do legado) não pode recolocar o que foi excluído — é o
 *    único lugar do sistema onde a ressurreição aconteceria sem rede nenhuma;
 * 2. o aparelho ANTIGO, que ainda tem o item, não o traz de volta pelo merge;
 * 3. a fila por item (§7) faz a mesma coisa pela intenção, e continua
 *    DESLIGADA.
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
  listarChavesDaTag: () => [...dados.keys()],
  bloqueadoParaEscrita: () => false,
}));

vi.mock('./colecaoSync', () => ({
  gravarNaColecao: async (chave: string, mutar: (a: unknown[]) => unknown[]) => {
    dados.set(chave, mutar((dados.get(chave) as unknown[]) ?? []));
    return true;
  },
  removerDaColecao: async () => true,
}));

import { marcarRemovido, mesclarColecao, visiveis } from './colecoes';
import { FILA_POR_ITEM_ATIVA, aplicarItem, reduzirParaBlob, removeItem, upsertItem } from './filaItem';
import { listarIndice, zerarCacheLegado } from '../features/relatorios/historicoRelatorios';

const TAG = 'V-9';
const MORTO = '2026-09-22T12:00:00.000Z';
const ID = (i: object) => (i as { id?: string }).id ?? null;

const relatorio = (id: string) => ({
  id,
  tagVaso: TAG,
  nome: `Relatório ${id}`,
  tipo: 'inicial',
  data: '2026-09-01',
  status: 'Finalizado',
  meta: { codigo: id },
});

beforeEach(() => {
  dados.clear();
  zerarCacheLegado();
});

describe('o índice do histórico não ressuscita pelo próprio reparo', () => {
  it('lista os ativos e esconde o tombstonado', () => {
    dados.set(`nr13_historico_indice_${TAG}`, [
      { id: 'A', tagVaso: TAG, status: 'Finalizado' },
      { id: 'B', tagVaso: TAG, status: 'Finalizado' },
      marcarRemovido({ id: 'C', tagVaso: TAG, status: 'Finalizado' }, MORTO),
    ]);

    expect(listarIndice(TAG).map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('o REGISTRO do excluído continua no cache e mesmo assim não volta à lista', () => {
    // Este é o caso que o reparo (`listarIndice` reconstrói o que faltar no
    // índice varrendo `nr13_rel_`) faria errado sem o conjunto de sepultados:
    // o registro do relatório C existe, o índice diz que ele foi excluído, e o
    // reparo o traria de volta achando que era o índice que estava incompleto.
    dados.set(`nr13_rel_C_${TAG}`, relatorio('C'));
    dados.set(`nr13_historico_indice_${TAG}`, [
      { id: 'A', tagVaso: TAG, status: 'Finalizado' },
      { id: 'B', tagVaso: TAG, status: 'Finalizado' },
      marcarRemovido({ id: 'C', tagVaso: TAG, status: 'Finalizado' }, MORTO),
    ]);

    expect(listarIndice(TAG).map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('o LEGADO também não o traz de volta', () => {
    dados.set('nr13_historico_relatorios', [relatorio('A'), relatorio('C')]);
    dados.set(`nr13_historico_indice_${TAG}`, [
      { id: 'A', tagVaso: TAG, status: 'Finalizado' },
      marcarRemovido({ id: 'C', tagVaso: TAG, status: 'Finalizado' }, MORTO),
    ]);

    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['A']);
  });

  it('reler (F5 / nova aba) dá o mesmo resultado — nada é memoizado a favor', () => {
    dados.set(`nr13_rel_C_${TAG}`, relatorio('C'));
    dados.set(`nr13_historico_indice_${TAG}`, [
      { id: 'A', tagVaso: TAG, status: 'Finalizado' },
      marcarRemovido({ id: 'C', tagVaso: TAG, status: 'Finalizado' }, MORTO),
    ]);

    const primeira = listarIndice(TAG).map((i) => i.id);
    zerarCacheLegado();
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(primeira);
    expect(primeira).toEqual(['A']);
  });
});

describe('A B C → excluo C → outro aparelho ainda tem C', () => {
  const A = { id: 'A', nome: 'a' };
  const B = { id: 'B', nome: 'b' };
  const C = { id: 'C', nome: 'c' };

  it('o aparelho atrasado NÃO ressuscita C', () => {
    const aqui = [A, B, marcarRemovido(C, MORTO)];
    const la = [A, B, C]; // a cópia velha do outro dispositivo

    const r = mesclarColecao(aqui, la, ID, [A, B, C]);

    expect(visiveis(r.lista).map((i) => i.id).sort()).toEqual(['A', 'B']);
    expect(r.removidos).toEqual(['C']);
    expect(r.ambiguos).toEqual([]); // não é decisão do usuário: exclusão vence
  });

  it('e o tombstone SOBREVIVE ao merge — senão a próxima rodada o ressuscitaria', () => {
    const r = mesclarColecao([A, B, marcarRemovido(C, MORTO)], [A, B, C], ID, [A, B, C]);
    // Segunda rodada, com o mesmo aparelho atrasado.
    const r2 = mesclarColecao(r.lista, [A, B, C], ID, [A, B, C]);
    expect(visiveis(r2.lista).map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('o aparelho atrasado que EDITOU C continua não o ressuscitando', () => {
    const laEditado = [A, B, { ...C, nome: 'c editado offline' }];
    const r = mesclarColecao([A, B, marcarRemovido(C, MORTO)], laEditado, ID, [A, B, C]);
    expect(visiveis(r.lista).map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('criação offline em A e exclusão em B compõem sem perguntar nada', () => {
    const aqui = [A, B, marcarRemovido(C, MORTO)];
    const la = [A, B, C, { id: 'D', nome: 'criado no outro aparelho' }];

    const r = mesclarColecao(aqui, la, ID, [A, B, C]);

    expect(visiveis(r.lista).map((i) => i.id).sort()).toEqual(['A', 'B', 'D']);
    expect(r.ambiguos).toEqual([]);
  });
});

describe('FILA POR ITEM · implementada, não integrada, não ativada', () => {
  const ctx = { mutationId: 'm1', versaoBase: 4, dispositivo: 'dev', criadoEm: MORTO };

  it('o interruptor está desligado', () => {
    expect(FILA_POR_ITEM_ATIVA).toBe(false);
  });

  it('descreve a intenção de upsert numa coleção conhecida', () => {
    const m = upsertItem('nr13_pront_indice', { id: 'x', tag: TAG }, ctx);
    expect(m).toMatchObject({ op: 'upsert', chave: 'nr13_pront_indice', itemId: 'x', versaoBase: 4 });
  });

  it('recusa chave que não é coleção e item sem id estável', () => {
    expect(upsertItem('nr13_info_V-9', { id: 'x' }, ctx)).toBeNull();
    expect(upsertItem('nr13_pront_indice', { semId: true }, ctx)).toBeNull();
    expect(removeItem('nr13_info_V-9', 'x', ctx)).toBeNull();
  });

  it('`remove` MARCA — nunca tira da lista', () => {
    const m = removeItem('nr13_pront_indice', 'B', ctx)!;
    const depois = aplicarItem([{ id: 'A' }, { id: 'B' }], m);
    expect(depois).toHaveLength(2);
    expect(visiveis(depois).map((i) => (i as { id: string }).id)).toEqual(['A']);
  });

  it('`remove` de item ausente deixa tombstone órfão — a ordem de chegada não decide', () => {
    const m = removeItem('nr13_pront_indice', 'Z', ctx)!;
    const depois = aplicarItem([{ id: 'A' }], m);
    expect(depois).toHaveLength(2);
    expect(visiveis(depois).map((i) => (i as { id: string }).id)).toEqual(['A']);
  });

  it('`upsert` NÃO ressuscita item marcado como removido', () => {
    const lista = [marcarRemovido({ id: 'B' }, MORTO)];
    const m = upsertItem('nr13_pront_indice', { id: 'B', nome: 'voltei' }, ctx)!;
    expect(visiveis(aplicarItem(lista, m))).toEqual([]);
  });

  it('reduz uma sequência de intenções ao blob que a fila atual sabe enviar', () => {
    const ms = [
      upsertItem('nr13_pront_indice', { id: 'A' }, ctx)!,
      upsertItem('nr13_pront_indice', { id: 'B' }, { ...ctx, mutationId: 'm2' })!,
      removeItem('nr13_pront_indice', 'A', { ...ctx, mutationId: 'm3' })!,
    ];
    const blob = reduzirParaBlob([], ms);
    expect(visiveis(blob).map((i) => (i as { id: string }).id)).toEqual(['B']);
  });

  it('aplicar a MESMA intenção duas vezes dá o mesmo resultado (idempotente)', () => {
    const m = upsertItem('nr13_pront_indice', { id: 'A', v: 1 }, ctx)!;
    expect(reduzirParaBlob([], [m, m])).toEqual(reduzirParaBlob([], [m]));
  });

  it('nenhum módulo de produto importa a fila por item', async () => {
    // A prova de "não integrada": o único importador é o teste.
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = `${dir}/${nome}`;
        if (statSync(p).isDirectory()) varrer(p);
        else if (/\.tsx?$/.test(nome) && !nome.includes('.test.')) {
          if (/from '[^']*filaItem'/.test(readFileSync(p, 'utf8'))) achados.push(p);
        }
      }
    };
    varrer('src');
    expect(achados).toEqual([]);
  });
});
