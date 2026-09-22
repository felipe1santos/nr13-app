/**
 * MERGE POR ITEM + TOMBSTONE POR ITEM (22/09/2026).
 *
 * Os cenários são os pedidos na rodada de hardening, e cada um corresponde a
 * uma forma de perder dado que o modelo atual (escolher a lista inteira)
 * permite:
 *
 * - §11 · servidor A B C D E × local só C  → não pode virar "só C";
 * - §11 · C alterado offline               → A B C2 D E;
 * - §12 · C excluído no servidor           → C NÃO ressuscita;
 * - §13 · D criado offline                 → A B C D, nunca D sozinho;
 * - §14 · dois aparelhos, itens diferentes → sem conflito manual.
 *
 * O caso REAL medido em produção está no fim: `nr13_pront_indice`, 1 item local
 * contra 5 do servidor, dois deles prontuários emitidos.
 */
import { describe, expect, it } from 'vitest';
type RegistroTeste = Record<string, unknown>;

import {
  COLECOES,
  colecaoDaChave,
  ehColecao,
  marcarRemovido,
  mergeResolveSozinho,
  mesclarColecao,
  removido,
  visiveis,
} from './colecoes';

const ID = (i: object) => {
  const id = (i as RegistroTeste).id;
  return typeof id === 'string' ? id : null;
};
const item = (id: string, extra: Record<string, unknown> = {}): RegistroTeste => ({ id, ...extra });
const ids = (l: RegistroTeste[]) => l.map((i) => i.id);

describe('o CATÁLOGO é explícito — nada de heurística', () => {
  it('reconhece chave exata e chave por prefixo', () => {
    expect(colecaoDaChave('nr13_pront_indice')?.rotulo).toBe('documentos de prontuário');
    expect(colecaoDaChave('nr13_calibracoes_ZZ-1')?.rotulo).toBe('calibrações do equipamento');
    expect(colecaoDaChave('nr13_rascunhos')).not.toBeNull();
  });

  it('prefixo SEM sufixo não é coleção — `nr13_calibracoes_` sozinho não é chave de ninguém', () => {
    expect(ehColecao('nr13_calibracoes_')).toBe(false);
  });

  it('o que não é lista fica de fora', () => {
    for (const c of ['nr13_info_ZZ-1', 'nr13_rel_REL-1_ZZ', 'nr13_minha_empresa', 'capa.art']) {
      expect(ehColecao(c)).toBe(false);
    }
  });

  it('toda definição sabe extrair o id de um item', () => {
    for (const c of COLECOES) {
      expect(c.id({ id: 'x' })).toBe('x');
      // Sem id não inventa um: item não identificável não é mesclável.
      expect(c.id({})).toBeNull();
    }
  });
});

describe('§11 · servidor tem mais — o local NÃO substitui a coleção', () => {
  const servidor = [item('A'), item('B'), item('C'), item('D'), item('E')];

  it('local só com C: o resultado continua A B C D E', () => {
    const r = mesclarColecao([item('C')], servidor, ID);
    expect(ids(r.lista)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(r.ambiguos).toEqual([]);
    expect(mergeResolveSozinho(r)).toBe(true);
  });

  it('C alterado offline: A B C2 D E — e C2 é NOMEADO como divergente', () => {
    const r = mesclarColecao([item('C', { nome: 'C2' })], servidor, ID);
    expect(ids(r.lista)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // Mesmo item com conteúdo diferente ainda é decisão do usuário (§10: sem
    // field merge nesta rodada). O que não acontece mais é perder B, D e E.
    expect(r.ambiguos).toEqual(['C']);
    expect(mergeResolveSozinho(r)).toBe(false);
  });
});

describe('§12 · EXCLUSÃO — o item não ressuscita', () => {
  it('C excluído no servidor, aparelho antigo ainda tem C: continua excluído', () => {
    const servidor = [item('A'), item('B'), marcarRemovido(item('C'), '2026-09-20T10:00:00Z')];
    const local = [item('A'), item('B'), item('C')]; // cópia anterior à exclusão
    const r = mesclarColecao(local, servidor, ID);
    expect(ids(visiveis(r.lista))).toEqual(['A', 'B']);
    expect(r.removidos).toEqual(['C']);
    expect(mergeResolveSozinho(r)).toBe(true);
  });

  it('o tombstone FICA na lista — sumir com ele deixaria o item ressuscitar depois', () => {
    const servidor = [marcarRemovido(item('C'), '2026-09-20T10:00:00Z')];
    const r = mesclarColecao([item('C')], servidor, ID);
    expect(r.lista).toHaveLength(1);
    expect(removido(r.lista[0])).toBe(true);
  });

  it('excluído AQUI e ainda vivo no servidor: a exclusão vale', () => {
    const r = mesclarColecao(
      [marcarRemovido(item('C'), '2026-09-21T08:00:00Z')],
      [item('A'), item('C')],
      ID,
    );
    expect(ids(visiveis(r.lista))).toEqual(['A']);
    expect(r.removidos).toEqual(['C']);
  });

  it('sem tombstone, o merge ressuscitaria — é o que esta regra impede', () => {
    // Simula o modelo ANTIGO: o item some da lista em vez de ser marcado.
    const servidorSemTombstone = [item('A'), item('B')];
    const r = mesclarColecao([item('A'), item('B'), item('C')], servidorSemTombstone, ID);
    // Sem a marca, C volta — e é exatamente por isso que a exclusão passou a
    // ser um carimbo, e não uma ausência.
    expect(ids(r.lista)).toContain('C');
  });
});

describe('§13 · CRIAÇÃO offline', () => {
  it('celular cria D: A B C D, nunca D sozinho', () => {
    const r = mesclarColecao([item('D')], [item('A'), item('B'), item('C')], ID);
    expect(ids(r.lista)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.adicionados).toEqual(['D']);
    expect(mergeResolveSozinho(r)).toBe(true);
  });

  it('coleção que ainda não existe no servidor: o local inteiro entra', () => {
    const r = mesclarColecao([item('D'), item('E')], [], ID);
    expect(ids(r.lista)).toEqual(['D', 'E']);
    expect(mergeResolveSozinho(r)).toBe(true);
  });
});

describe('§14 · DOIS DISPOSITIVOS, itens diferentes', () => {
  it('PC altera A, celular altera C: A_novo B C_novo, SEM decisão manual', () => {
    // A BASE é o que os dois tinham antes de divergir.
    const base = [item('A'), item('B'), item('C')];
    // O PC alterou A e já sincronizou.
    const servidor = [item('A', { v: 'A_novo' }), item('B'), item('C')];
    // O celular estava offline: A é a cópia velha, C é edição dele.
    const local = [item('A'), item('B'), item('C', { v: 'C_novo' })];

    const r = mesclarColecao(local, servidor, ID, base);
    expect(ids(r.lista)).toEqual(['A', 'B', 'C']);
    expect(r.lista.find((i) => i.id === 'A')?.v).toBe('A_novo'); // do PC
    expect(r.lista.find((i) => i.id === 'C')?.v).toBe('C_novo'); // do celular
    expect(r.ambiguos).toEqual([]);
    expect(mergeResolveSozinho(r)).toBe(true);
  });

  it('SEM base, o mesmo caso é conservador: servidor fica e a dúvida é nomeada', () => {
    // É o limite honesto do merge de duas vias: "eu alterei" e "eu tenho a
    // cópia velha" são indistinguíveis. Preservar o servidor e AVISAR não
    // perde nada — o valor local continua na store de conflitos.
    const servidor = [item('A', { v: 'A_novo' }), item('B'), item('C')];
    const local = [item('A'), item('B'), item('C', { v: 'C_novo' })];
    const r = mesclarColecao(local, servidor, ID);
    expect(r.ambiguos).toEqual(['A', 'C']);
    expect(mergeResolveSozinho(r)).toBe(false);
  });

  it('com base, o item que os DOIS alteraram continua sendo do usuário (§10)', () => {
    const base = [item('C')];
    const r = mesclarColecao([item('C', { v: 'local' })], [item('C', { v: 'servidor' })], ID, base);
    expect(r.ambiguos).toEqual(['C']);
    expect(r.lista[0].v).toBe('servidor');
  });

  it('quando as alterações NÃO se cruzam, resolve sozinho', () => {
    // O celular só acrescentou; o PC só acrescentou outro.
    const r = mesclarColecao([item('A'), item('X')], [item('A'), item('Y')], ID);
    expect(ids(r.lista).sort()).toEqual(['A', 'X', 'Y']);
    expect(mergeResolveSozinho(r)).toBe(true);
  });
});

describe('o merge não inventa nem descarta', () => {
  it('item SEM id é preservado, e não conta como ambíguo', () => {
    const r = mesclarColecao([{ nome: 'sem id' }], [item('A')], ID);
    expect(r.lista).toHaveLength(2);
    expect(r.ambiguos).toEqual([]);
  });

  it('listas vazias ou ausentes não quebram', () => {
    expect(mesclarColecao([], [], ID).lista).toEqual([]);
    expect(mesclarColecao(undefined as never, [item('A')], ID).lista).toHaveLength(1);
    expect(mesclarColecao([item('A')], undefined as never, ID).lista).toHaveLength(1);
  });

  it('é idempotente: mesclar duas vezes dá o mesmo resultado', () => {
    const servidor = [item('A'), item('B')];
    const local = [item('B'), item('C')];
    const um = mesclarColecao(local, servidor, ID);
    const dois = mesclarColecao(local, um.lista, ID);
    expect(ids(dois.lista)).toEqual(ids(um.lista));
  });

  it('a ordem do SERVIDOR é preservada — o que já está publicado não se remexe', () => {
    const r = mesclarColecao([item('Z')], [item('C'), item('A'), item('B')], ID);
    expect(ids(r.lista)).toEqual(['C', 'A', 'B', 'Z']);
  });
});

describe('`visiveis` é o que as telas leem', () => {
  it('esconde os tombstones sem apagá-los', () => {
    const lista = [item('A'), marcarRemovido(item('B'), '2026-09-20T10:00:00Z')];
    expect(ids(visiveis(lista))).toEqual(['A']);
    expect(lista).toHaveLength(2);
  });

  it('`removidoEm` vazio não conta como removido', () => {
    expect(removido({ id: 'A', removidoEm: '' })).toBe(false);
    expect(removido({ id: 'A' })).toBe(false);
  });
});

describe('O CASO REAL · nr13_pront_indice (medido em 22/09/2026)', () => {
  // Servidor, versão 6: cinco documentos, dois deles EMITIDOS.
  const servidor = [
    item('rascunho:ZZ-TESTE-VISUAL', { tag: 'ZZ-TESTE-VISUAL' }),
    item('rascunho:ZZ-FASE3', { tag: 'ZZ-FASE3' }),
    item('PRONT-178874259694', { tag: 'COMPRESSOR V8-15/200L' }),
    item('PRONT-178854098022', { tag: 'COMPRESSOR V8-15/200L' }),
    item('rascunho:ZZ-CALDEIRA-TESTE', { tag: 'ZZ-CALDEIRA-TESTE' }),
  ];
  // Este aparelho criou a lista do zero (versaoBase 0) com um item só.
  const local = [item('rascunho:ZZ-FASE3', { tag: 'ZZ-FASE3' })];

  it('o merge devolve os CINCO — os dois emitidos não somem', () => {
    const r = mesclarColecao(local, servidor, ID);
    expect(r.lista).toHaveLength(5);
    expect(ids(r.lista)).toContain('PRONT-178874259694');
    expect(ids(r.lista)).toContain('PRONT-178854098022');
  });

  it('resolve SOZINHO: o local é subconjunto, não há nada a decidir', () => {
    const r = mesclarColecao(local, servidor, ID);
    expect(r.ambiguos).toEqual([]);
    expect(r.adicionados).toEqual([]);
    expect(mergeResolveSozinho(r)).toBe(true);
  });

  it('é este o caso em que "Manter a minha" apagaria quatro referências', () => {
    // O que o botão faz hoje: o blob local inteiro substitui o do servidor.
    const oQueOBotaoFaz = local;
    expect(oQueOBotaoFaz).toHaveLength(1);
    // O que o merge faz:
    expect(mesclarColecao(local, servidor, ID).lista).toHaveLength(5);
  });
});

describe('PAYLOAD · o ganho de mandar a operação, não o blob', () => {
  it('a lista inteira é muito maior do que o item alterado', () => {
    const grande = Array.from({ length: 60 }, (_, i) =>
      item(`PRONT-${i}`, { tag: `EQUIP-${i}`, nome: `Prontuário do equipamento ${i}`, emitidoEm: '2026-09-20' }),
    );
    const blob = JSON.stringify(grande).length;
    const umItem = JSON.stringify(grande[7]).length;
    expect(blob).toBeGreaterThan(umItem * 20);
    // Medida registrada para a rodada de performance; aqui só se prova a ordem
    // de grandeza, não se otimiza nada.
  });
});
