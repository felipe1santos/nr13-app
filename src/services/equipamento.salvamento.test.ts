import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Ciclo de vida de UM equipamento, do clique em "Criar" até ele aparecer em
 * outro aparelho — com a rede caindo no meio.
 *
 * Escrito depois da investigação de 16/08/2026, em que uma conta tinha 117
 * registros locais sem contrapartida no servidor. A causa era outra (uma purga
 * deliberada do servidor, `purgar_dados_por_email`), mas a pergunta que ficou
 * é a que este arquivo responde de forma executável: existe algum caminho em
 * que o app dá um dado como salvo sem que exista mutação registrada até o
 * servidor confirmar?
 *
 * A regra sob teste: entre "o app aceitou" e "o servidor confirmou" SEMPRE
 * existe um item de fila durável. Nunca há um instante em que o dado está no
 * cache local e não há nem pendência nem confirmação.
 */

const ORG = '33333333-3333-3333-3333-333333333333';

/** Estado do "servidor". Sobrevive à troca de aparelho dentro do teste. */
const SERVIDOR = new Map<
  string,
  { valor: string | null; versao: number; atualizado_em: string; dispositivo: string | null; deletado_em: string | null }
>();
/** Ids de mutação já aplicados — é o que torna a RPC idempotente. */
const APLICADAS = new Map<string, number>();
/** Falso = a RPC rejeita como falha de rede. */
let rede = true;
/** Quando setado, a RPC devolve este erro uma única vez. */
let erroUnico: { message: string; code?: string } | null = null;
let relogio = 0;

function agora(): string {
  relogio += 1;
  return `2026-08-16T12:00:${String(relogio).padStart(2, '0')}.000Z`;
}

const rpc = vi.fn(async (_nome: string, p: Record<string, unknown>) => {
  if (!rede) throw new TypeError('Failed to fetch');
  if (erroUnico) {
    const e = erroUnico;
    erroUnico = null;
    return { data: null, error: e };
  }
  const id = String(p.p_mutation_id);
  const jaFeita = APLICADAS.get(id);
  if (jaFeita !== undefined) return { data: { status: 'repetido', versao: jaFeita }, error: null };

  const chave = String(p.p_chave);
  const atual = SERVIDOR.get(chave);
  const versaoAtual = atual?.versao ?? 0;
  if (versaoAtual !== Number(p.p_versao_esperada)) {
    return {
      data: {
        status: 'conflito',
        versao: versaoAtual,
        valor: atual?.valor ?? null,
        atualizado_em: atual?.atualizado_em ?? '',
        dispositivo: atual?.dispositivo ?? null,
      },
      error: null,
    };
  }

  const versao = versaoAtual + 1;
  const quando = agora();
  if (p.p_op === 'del') {
    SERVIDOR.set(chave, { valor: null, versao, atualizado_em: quando, dispositivo: String(p.p_dispositivo), deletado_em: quando });
  } else {
    SERVIDOR.set(chave, {
      valor: String(p.p_valor),
      versao,
      atualizado_em: quando,
      dispositivo: String(p.p_dispositivo),
      deletado_em: null,
    });
  }
  APLICADAS.set(id, versao);
  return { data: { status: 'aplicado', versao }, error: null };
});

/**
 * Registra CADA chamada de `gravarAtomico` com o que foi na mesma transação.
 * É por aqui que se prova a atomicidade: não basta o dado e a fila existirem no
 * fim — eles precisam ter ido JUNTOS. Gravados em transações separadas, o
 * navegador fechado no meio deixa dado sem fila (nunca sobe, e a tela mostra
 * como se estivesse salvo) ou fila sem dado (sobe lixo).
 */
const gravacoes: Array<{ dados: number; fila: number }> = [];

vi.mock('./cacheLocal', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('./cacheLocal')>();
  return {
    ...original,
    gravarAtomico: async (
      dados: unknown[] = [],
      fila: unknown[] = [],
      tombstones: unknown[] = [],
    ) => {
      gravacoes.push({ dados: dados.length, fila: fila.length });
      return original.gravarAtomico(
        dados as Parameters<typeof original.gravarAtomico>[0],
        fila as Parameters<typeof original.gravarAtomico>[1],
        tombstones as Parameters<typeof original.gravarAtomico>[2],
      );
    },
  };
});

vi.mock('./supabase', () => {
  const construir = () => {
    let corte: string | null = null;
    const api = {
      select: () => api,
      eq: () => api,
      gt: (_c: string, v: string) => {
        corte = v;
        return api;
      },
      order: () => api,
      range: async (inicio: number, fim: number) => {
        if (!rede) return { data: null, error: { message: 'offline' } };
        const linhas = [...SERVIDOR.entries()]
          .map(([chave, l]) => ({ chave, ...l }))
          .filter((l) => !corte || l.atualizado_em > corte)
          .sort(
            (a, b) => a.atualizado_em.localeCompare(b.atualizado_em) || a.chave.localeCompare(b.chave),
          );
        return { data: linhas.slice(inicio, fim + 1), error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    };
    return api;
  };
  return {
    supabase: {
      from: () => construir(),
      rpc: (...a: unknown[]) => rpc(a[0] as string, a[1] as Record<string, unknown>),
      auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    },
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    idUsuarioAtual: vi.fn(async () => 'u1'),
    TABELA_STORAGE: 'app_storage',
  };
});

import { fecharDb, apagarDb, listarTudo } from './db';
import { zerarMemoria } from './cacheLocal';
import {
  zerarFilaMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
  listarFila,
  itemDaChave,
  tentarNovamente,
  type ItemFila,
} from './sync';
import { ler, salvar, lerTudo, flushFila, contarPendencias, limparCacheDados, iniciar } from './storageV2';

const TAG = 'ZZ-VALIDA';
const CHAVE = `nr13_info_${TAG}`;
const FICHA = { tag: TAG, tipo: 'vaso', fabricante: 'ACME' };

/** Zera o aparelho mas NÃO o servidor: é a troca de dispositivo. */
async function trocarDeAparelho(): Promise<void> {
  limparCacheDados();
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.removeItem('nr13_dispositivo_id'); // outro aparelho, outro id
  await iniciar();
}

/** Fecha e reabre o navegador: memória some, IndexedDB fica. */
async function reabrirNavegador(): Promise<void> {
  limparCacheDados();
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await iniciar();
}

beforeEach(async () => {
  limparCacheDados();
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  SERVIDOR.clear();
  APLICADAS.clear();
  rpc.mockClear();
  rede = true;
  erroUnico = null;
  relogio = 0;
  gravacoes.length = 0;
  zerarThrottleSync();
  await iniciar();
});

describe('atomicidade: dado e mutação vão na MESMA transação', () => {
  it('a gravação do equipamento carrega o item de fila junto', async () => {
    rede = false; // sem rede nada é confirmado depois — sobra só o que a escrita fez
    await salvar(CHAVE, FICHA);

    const primeira = gravacoes[0];
    expect(primeira).toEqual({ dados: 1, fila: 1 });
  });

  it('nunca existe uma transação que grave o dado SEM a mutação', async () => {
    rede = false;
    await salvar(CHAVE, FICHA);
    await salvar(CHAVE, { ...FICHA, fabricante: 'OUTRO' });

    // Transações que tocam em `dados` mas não levam item de fila seriam
    // exatamente o estado "salvo na tela, invisível para o servidor".
    expect(gravacoes.filter((g) => g.dados > 0 && g.fila === 0)).toEqual([]);
  });
});

describe('criar equipamento com rede', () => {
  it('grava no servidor e a fila fica vazia', async () => {
    await salvar(CHAVE, FICHA);

    expect(SERVIDOR.get(CHAVE)?.valor).toBe(JSON.stringify(FICHA));
    expect(listarFila()).toHaveLength(0);
    expect(contarPendencias()).toBe(0);
  });

  it('a versão local passa a ser a do servidor — não a otimista local', async () => {
    // Sem esse alinhamento a próxima edição sairia com versaoBase errada e viraria
    // conflito eterno contra um servidor que nunca discordou de nada.
    await salvar(CHAVE, FICHA);
    await salvar(CHAVE, { ...FICHA, fabricante: 'OUTRO' });

    expect(SERVIDOR.get(CHAVE)?.versao).toBe(2);
    expect(listarFila()).toHaveLength(0);
  });
});

describe('criar equipamento sem rede', () => {
  it('o dado fica no aparelho E existe mutação pendente — nunca um sem o outro', async () => {
    rede = false;

    await salvar(CHAVE, FICHA);

    expect(ler(CHAVE)).toEqual(FICHA); // a tela mostra o equipamento
    expect(itemDaChave(CHAVE)?.estado).toBe('aguardando'); // e ele está devendo
    expect(contarPendencias()).toBe(1);
    expect(SERVIDOR.has(CHAVE)).toBe(false);
  });

  it('a mutação está no DISCO, não só na memória', async () => {
    rede = false;
    await salvar(CHAVE, FICHA);

    const naFila = await listarTudo<ItemFila>(ORG, 'fila');
    expect(naFila).toHaveLength(1);
    expect(naFila[0].valor.chave).toBe(CHAVE);
  });

  it('sobrevive a fechar e reabrir o navegador, e sobe quando a rede volta', async () => {
    rede = false;
    await salvar(CHAVE, FICHA);

    await reabrirNavegador();
    expect(ler(CHAVE)).toEqual(FICHA);
    expect(contarPendencias()).toBe(1);
    expect(SERVIDOR.has(CHAVE)).toBe(false);

    rede = true;
    await flushFila();

    expect(SERVIDOR.get(CHAVE)?.valor).toBe(JSON.stringify(FICHA));
    expect(contarPendencias()).toBe(0);
  });
});

describe('falha da RPC', () => {
  it('erro do servidor NÃO remove a mutação da fila', async () => {
    erroUnico = { message: 'erro interno do servidor', code: 'XX000' };

    await salvar(CHAVE, FICHA);

    expect(SERVIDOR.has(CHAVE)).toBe(false);
    expect(listarFila()).toHaveLength(1);
  });

  it('o retry usa o MESMO mutationId e o dado chega uma vez só', async () => {
    erroUnico = { message: 'erro interno do servidor', code: 'XX000' };
    await salvar(CHAVE, FICHA);
    const item = itemDaChave(CHAVE)!;

    await tentarNovamente(item.mutationId);

    expect(SERVIDOR.get(CHAVE)?.versao).toBe(1); // não aplicou duas vezes
    expect(APLICADAS.get(item.mutationId)).toBe(1);
    expect(listarFila()).toHaveLength(0);
  });

  it('resposta perdida depois de aplicar: o reenvio devolve "repetido", não duplica', async () => {
    // O servidor aplicou e a resposta se perdeu na volta. O aparelho reenvia.
    await salvar(CHAVE, FICHA);
    const id = [...APLICADAS.keys()][0];

    const r = await rpc('aplicar_mutacao_storage', {
      p_chave: CHAVE,
      p_mutation_id: id,
      p_op: 'set',
      p_valor: JSON.stringify(FICHA),
      p_versao_esperada: 0,
      p_dispositivo: 'd1',
      p_mutado_em: '',
    });

    expect(r).toMatchObject({ data: { status: 'repetido', versao: 1 } });
    expect(SERVIDOR.get(CHAVE)?.versao).toBe(1);
  });
});

describe('outro aparelho', () => {
  it('vê o equipamento vindo do servidor, sem nada no cache local', async () => {
    await salvar(CHAVE, FICHA);

    await trocarDeAparelho();
    expect(ler(CHAVE)).toBeNull(); // aparelho zerado

    await lerTudo();

    expect(ler(CHAVE)).toEqual(FICHA);
    expect(contarPendencias()).toBe(0);
  });

  it('o que ficou preso offline num aparelho só aparece no outro DEPOIS de subir', async () => {
    rede = false;
    await salvar(CHAVE, FICHA);

    // Aparelho B, com rede: o equipamento ainda não existe para ele — e essa é a
    // resposta certa. Quem tem a única cópia é o aparelho A, e o selo dele diz isso.
    rede = true;
    const pendenciasDeA = contarPendencias();
    await trocarDeAparelho();
    await lerTudo();
    expect(ler(CHAVE)).toBeNull();
    expect(pendenciasDeA).toBe(1);
  });

  it('hidratação NÃO apaga o que só existe localmente (invariante I-07)', async () => {
    // Regra que não se quebra: nada é removido do aparelho por não ter voltado do
    // servidor. Foi o apagar-por-ausência que transformava falha de rede em sumiço.
    rede = false;
    await salvar(CHAVE, FICHA);
    rede = true;

    await lerTudo(); // o servidor não conhece a chave

    expect(ler(CHAVE)).toEqual(FICHA);
  });
});
