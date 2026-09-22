/**
 * OS QUATRO PRÉ-REQUISITOS DO MERGE AUTOMÁTICO (22/09/2026).
 *
 * 1. cache miss ≠ dado inexistente — lookup dirigido antes de criar;
 * 2. a BASE confirmada, e as transições em que ela muda (e as em que NÃO muda);
 * 3. tombstone respeitado na leitura;
 * 4. resolução automática pronta — e **desligada**.
 *
 * O cenário do `nr13_pront_indice` (1 local × 5 no servidor) aparece aqui com a
 * base, que é o que faltava para ele resolver sozinho.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, { valor: string; versao: number; atualizadoEm: string; dispositivo: string | null }>();
const servidor = new Map<string, { valor: string; versao: number }>();
const meta = new Map<string, unknown>();
const gravados: { chave: string; valor: unknown }[] = [];
let semeouCom: string[][] = [];
let semearFalha = false;

vi.mock('./cacheLocal', () => ({
  orgAtual: () => 'org-1',
  obterRegistro: (c: string) => cache.get(c) ?? null,
}));

vi.mock('./db', () => ({
  obter: async (_o: string, store: string, chave: string) => (store === 'meta' ? (meta.get(chave) ?? null) : null),
  aplicarAtomico: async (_o: string, ops: { store: string; acao: string; chave: string; valor?: unknown }[]) => {
    for (const op of ops) {
      if (op.store !== 'meta') continue;
      if (op.acao === 'put') meta.set(op.chave, op.valor);
      else meta.delete(op.chave);
    }
  },
}));

vi.mock('./storage', () => ({
  ler: <T,>(chave: string): T | null => {
    const r = cache.get(chave);
    return r === undefined ? null : (JSON.parse(r.valor) as T);
  },
  salvar: async (chave: string, valor: unknown) => {
    gravados.push({ chave, valor });
    const anterior = cache.get(chave);
    cache.set(chave, {
      valor: JSON.stringify(valor),
      versao: anterior?.versao ?? 0,
      atualizadoEm: '',
      dispositivo: null,
    });
  },
  // Lookup DIRIGIDO: traz do "servidor" só as chaves pedidas.
  semearEquipamentoDetalhado: async (chaves: string[]) => {
    semeouCom.push(chaves);
    if (semearFalha) return { postas: 0, falhou: true };
    let postas = 0;
    for (const c of chaves) {
      const s = servidor.get(c);
      if (s) {
        cache.set(c, { valor: s.valor, versao: s.versao, atualizadoEm: '', dispositivo: null });
        postas++;
      }
    }
    return { postas, falhou: false };
  },
}));

import {
  MERGE_AUTOMATICO_ATIVO,
  baseDe,
  gravarNaColecao,
  lerColecao,
  lerColecaoVisivel,
  registrarBase,
  removerDaColecao,
  resolverAutomaticamente,
} from './colecaoSync';
import { marcarRemovido } from './colecoes';

const CHAVE = 'nr13_pront_indice';
const item = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, ...extra });
const ids = (l: Record<string, unknown>[]) => l.map((i) => i.id);
const noServidor = (chave: string, lista: Record<string, unknown>[], versao: number) =>
  servidor.set(chave, { valor: JSON.stringify(lista), versao });
const noCache = (chave: string, lista: Record<string, unknown>[], versao: number) =>
  cache.set(chave, { valor: JSON.stringify(lista), versao, atualizadoEm: '', dispositivo: null });

beforeEach(() => {
  cache.clear();
  servidor.clear();
  meta.clear();
  gravados.length = 0;
  semeouCom = [];
  semearFalha = false;
});

describe('1 · CACHE MISS ≠ DADO INEXISTENTE', () => {
  it('cache vazio e chave EXISTE no servidor: traz de lá', async () => {
    noServidor(CHAVE, [item('A'), item('B')], 4);
    const r = await lerColecao(CHAVE);
    expect(r.origem).toBe('servidor');
    expect(ids(r.lista)).toEqual(['A', 'B']);
    expect(semeouCom).toEqual([[CHAVE]]);
  });

  it('busca SÓ a chave pedida — nunca a organização inteira', async () => {
    noServidor(CHAVE, [item('A')], 1);
    await lerColecao(CHAVE);
    expect(semeouCom).toHaveLength(1);
    expect(semeouCom[0]).toEqual([CHAVE]);
  });

  it('cache vazio e chave NÃO existe no servidor: aí sim é nova', async () => {
    const r = await lerColecao(CHAVE);
    expect(r.origem).toBe('nova');
    expect(r.lista).toEqual([]);
  });

  it('cache cheio: NÃO pergunta ao servidor (caminho offline)', async () => {
    noCache(CHAVE, [item('A')], 9);
    const r = await lerColecao(CHAVE);
    expect(r.origem).toBe('cache');
    expect(semeouCom).toHaveLength(0);
  });

  it('rede falhou: `indisponivel`, e NÃO se conclui que a chave não existe', async () => {
    noServidor(CHAVE, [item('A'), item('B')], 3);
    semearFalha = true;
    const r = await lerColecao(CHAVE);
    expect(r.origem).toBe('indisponivel');
  });
});

describe('2 · A PRIMEIRA ESCRITA DEPOIS DO BOOT FALHO', () => {
  it('o servidor já tinha 5 itens: a escrita continua a lista, não cria do zero', async () => {
    // É exatamente o cenário que gerou o conflito real: boot não trouxe a
    // chave, o usuário registra um rascunho, e o código antigo gravava [1 item].
    noServidor(CHAVE, [item('A'), item('B'), item('C'), item('D'), item('E')], 6);
    const ok = await gravarNaColecao(CHAVE, (atual) => [...atual, item('F')]);
    expect(ok).toBe(true);
    expect(ids(gravados[0].valor as Record<string, unknown>[])).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('com a rede fora GRAVA assim mesmo — offline-first —, mas avisa que a base é desconhecida', async () => {
    // Recusar a gravação faria o usuário PERDER a ação em campo. O que mudou em
    // relação ao defeito original é que agora isso é sabido: `false` diz que a
    // base não pôde ser confirmada, e o merge por item resolve depois.
    noServidor(CHAVE, [item('A'), item('B')], 2);
    semearFalha = true;
    const ok = await gravarNaColecao(CHAVE, (atual) => [...atual, item('C')]);
    expect(ok).toBe(false);
    expect(gravados).toHaveLength(1);
    expect(ids(gravados[0].valor as Record<string, unknown>[])).toEqual(['C']);
  });

  it('chave realmente nova: grava normalmente', async () => {
    const ok = await gravarNaColecao(CHAVE, (atual) => [...atual, item('A')]);
    expect(ok).toBe(true);
    expect(ids(gravados[0].valor as Record<string, unknown>[])).toEqual(['A']);
  });
});

describe('3 · A BASE', () => {
  it('nasce quando a chave chega do SERVIDOR', async () => {
    noServidor(CHAVE, [item('A'), item('B')], 4);
    await lerColecao(CHAVE);
    const b = await baseDe(CHAVE);
    expect(b?.versao).toBe(4);
    expect(ids(JSON.parse(b!.valor))).toEqual(['A', 'B']);
  });

  it('a EDIÇÃO LOCAL não mexe na base — é o ponto inteiro', async () => {
    noServidor(CHAVE, [item('C', { v: 1 })], 4);
    await lerColecao(CHAVE);
    const antes = await baseDe(CHAVE);

    await gravarNaColecao(CHAVE, () => [item('C', { v: 2 })]);

    const depois = await baseDe(CHAVE);
    expect(depois).toEqual(antes);
    // A base continua sabendo que o valor conhecido era v:1.
    expect(JSON.parse(depois!.valor)[0].v).toBe(1);
  });

  it('o ACK move a base para o estado confirmado', async () => {
    noServidor(CHAVE, [item('A')], 4);
    await lerColecao(CHAVE);
    await registrarBase(CHAVE, { versao: 5, valor: JSON.stringify([item('A'), item('B')]) });
    const b = await baseDe(CHAVE);
    expect(b?.versao).toBe(5);
    expect(ids(JSON.parse(b!.valor))).toEqual(['A', 'B']);
  });

  it('sem base registrada, `baseDe` devolve null e o merge fica conservador', async () => {
    expect(await baseDe(CHAVE)).toBeNull();
  });

  it('a base sobrevive offline: mora no IndexedDB, não em memória de sessão', async () => {
    await registrarBase(CHAVE, { versao: 7, valor: JSON.stringify([item('X')]) });
    // `meta` é o store persistente; nada foi para a rede.
    expect(meta.get(`base:${CHAVE}`)).toBeTruthy();
    expect(semeouCom).toHaveLength(0);
  });
});

describe('4 · TOMBSTONE respeitado na leitura', () => {
  it('`lerColecaoVisivel` esconde o item marcado, sem apagá-lo', async () => {
    noCache(CHAVE, [item('A'), marcarRemovido(item('B'), '2026-09-20T10:00:00Z')], 3);
    expect(ids(await lerColecaoVisivel(CHAVE))).toEqual(['A']);
    // O tombstone continua no dado.
    expect((await lerColecao(CHAVE)).lista).toHaveLength(2);
  });

  it('enquanto o merge está DESLIGADO, excluir continua removendo (nada muda no produto)', async () => {
    noCache(CHAVE, [item('A'), item('B')], 3);
    await removerDaColecao(CHAVE, 'B', '2026-09-22T00:00:00Z');
    const lista = gravados[0].valor as Record<string, unknown>[];
    expect(MERGE_AUTOMATICO_ATIVO).toBe(false);
    expect(ids(lista)).toEqual(['A']);
  });

  it('chave que não é coleção não aceita remoção por item', async () => {
    expect(await removerDaColecao('nr13_info_ZZ-1', 'x', 'agora')).toBe(false);
  });
});

describe('5 · RESOLUÇÃO AUTOMÁTICA — pronta e DESLIGADA', () => {
  it('o interruptor está desligado', () => {
    expect(MERGE_AUTOMATICO_ATIVO).toBe(false);
  });

  it('§16 · base A–E, local só C, servidor A–E → A B C D E, sem perda', async () => {
    const todos = [item('A'), item('B'), item('C'), item('D'), item('E')];
    await registrarBase(CHAVE, { versao: 6, valor: JSON.stringify(todos) });
    const r = await resolverAutomaticamente(CHAVE, JSON.stringify([item('C')]), JSON.stringify(todos));
    expect(r).not.toBeNull();
    expect(ids(r!.lista)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('§16 · C alterado offline → A B C2 D E', async () => {
    const base = [item('A'), item('B'), item('C', { n: 1 }), item('D'), item('E')];
    await registrarBase(CHAVE, { versao: 6, valor: JSON.stringify(base) });
    const local = [item('A'), item('B'), item('C', { n: 2 }), item('D'), item('E')];
    const r = await resolverAutomaticamente(CHAVE, JSON.stringify(local), JSON.stringify(base));
    expect(r).not.toBeNull();
    expect(r!.lista.find((i) => i.id === 'C')?.n).toBe(2);
    expect(ids(r!.lista)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('§17 · os DOIS alteraram o mesmo item → NÃO resolve sozinho', async () => {
    await registrarBase(CHAVE, { versao: 1, valor: JSON.stringify([item('C', { nome: 'A' })]) });
    const r = await resolverAutomaticamente(
      CHAVE,
      JSON.stringify([item('C', { nome: 'B' })]),
      JSON.stringify([item('C', { nome: 'C' })]),
    );
    expect(r).toBeNull();
  });

  it('§19 · exclusão × aparelho offline → C não volta', async () => {
    const base = [item('A'), item('B'), item('C')];
    await registrarBase(CHAVE, { versao: 3, valor: JSON.stringify(base) });
    const r = await resolverAutomaticamente(
      CHAVE,
      JSON.stringify(base), // o celular ainda tem C
      JSON.stringify([item('A'), item('B'), marcarRemovido(item('C'), '2026-09-20T10:00:00Z')]),
    );
    expect(r).not.toBeNull();
    expect(ids(visiveisDe(r!.lista))).toEqual(['A', 'B']);
  });

  it('§20 · criação offline → A B C', async () => {
    const base = [item('A'), item('B')];
    await registrarBase(CHAVE, { versao: 2, valor: JSON.stringify(base) });
    const r = await resolverAutomaticamente(
      CHAVE,
      JSON.stringify([item('A'), item('B'), item('C')]),
      JSON.stringify(base),
    );
    expect(ids(r!.lista)).toEqual(['A', 'B', 'C']);
  });

  it('§21 · dois dispositivos → A2 B C2, sem pergunta', async () => {
    const base = [item('A', { v: 1 }), item('B'), item('C', { v: 1 })];
    await registrarBase(CHAVE, { versao: 3, valor: JSON.stringify(base) });
    const servidorPc = [item('A', { v: 2 }), item('B'), item('C', { v: 1 })];
    const localCelular = [item('A', { v: 1 }), item('B'), item('C', { v: 2 })];
    const r = await resolverAutomaticamente(CHAVE, JSON.stringify(localCelular), JSON.stringify(servidorPc));
    expect(r).not.toBeNull();
    expect(r!.lista.find((i) => i.id === 'A')?.v).toBe(2);
    expect(r!.lista.find((i) => i.id === 'C')?.v).toBe(2);
    expect(r!.merge.ambiguos).toEqual([]);
  });

  it('§18 · alterações DISJUNTAS no mesmo item ainda NÃO são resolvidas (fica para P2)', async () => {
    await registrarBase(CHAVE, { versao: 1, valor: JSON.stringify([item('C', { nome: 'A', obs: 'X' })]) });
    const r = await resolverAutomaticamente(
      CHAVE,
      JSON.stringify([item('C', { nome: 'B', obs: 'X' })]),
      JSON.stringify([item('C', { nome: 'A', obs: 'Y' })]),
    );
    // O motor compara o ITEM inteiro: campos diferentes no mesmo item ainda
    // contam como divergência. Classificado como P2, não implementado.
    expect(r).toBeNull();
  });

  it('chave que não é coleção nunca resolve sozinha', async () => {
    expect(await resolverAutomaticamente('nr13_info_ZZ', '[]', '[]')).toBeNull();
  });

  it('valor que não é lista nunca resolve sozinho', async () => {
    expect(await resolverAutomaticamente(CHAVE, '{"a":1}', '[]')).toBeNull();
    expect(await resolverAutomaticamente(CHAVE, undefined, '[]')).toBeNull();
  });
});

describe('6 · IDEMPOTÊNCIA da resolução', () => {
  it('resolver duas vezes dá o mesmo resultado — retry é seguro', async () => {
    const base = [item('A')];
    await registrarBase(CHAVE, { versao: 1, valor: JSON.stringify(base) });
    const local = JSON.stringify([item('A'), item('B')]);
    const srv = JSON.stringify(base);
    const um = await resolverAutomaticamente(CHAVE, local, srv);
    const dois = await resolverAutomaticamente(CHAVE, local, srv);
    expect(ids(dois!.lista)).toEqual(ids(um!.lista));
  });

  it('reaplicar sobre o resultado não duplica item', async () => {
    const base = [item('A')];
    await registrarBase(CHAVE, { versao: 1, valor: JSON.stringify(base) });
    const um = await resolverAutomaticamente(CHAVE, JSON.stringify([item('A'), item('B')]), JSON.stringify(base));
    const dois = await resolverAutomaticamente(
      CHAVE,
      JSON.stringify(um!.lista),
      JSON.stringify(um!.lista),
    );
    expect(ids(dois!.lista)).toEqual(['A', 'B']);
  });
});

/** Helper local — `visiveis` do módulo puro, sem reimportar a lista toda. */
function visiveisDe(l: Record<string, unknown>[]): Record<string, unknown>[] {
  return l.filter((i) => !i.removidoEm);
}
