import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * ENSAIO DE ATIVAÇÃO — dois aparelhos, a fila REAL e os interruptores LIGADOS
 * só aqui dentro (22/09/2026).
 *
 * O objetivo desta rodada não é ligar nada: é **provar que ligar é seguro**.
 * Por isso os testes daqui ligam `tombstone` e `mergeAutomatico` via
 * `definirFlagsSync` e os devolvem ao padrão no `afterEach`. O código que vai
 * para produção continua com os três desligados — há um teste no fim que
 * verifica isso.
 *
 * ## O servidor simulado
 *
 * `rpcFake` reproduz `aplicar_mutacao_storage` (supabase/armazenamento_v2.sql)
 * nas partes que decidem o desfecho:
 *
 * - idempotência por `mutation_id`, devolvendo o resultado guardado;
 * - **o mascaramento**: `return v_res || jsonb_build_object('status','repetido')`
 *   — o `||` do jsonb sobrescreve o status, então um id que deu conflito ou
 *   recusa volta dizendo "repetido". É o defeito que a rodada anterior
 *   encontrou, e é por isso que ele é REPRODUZIDO aqui em vez de simplificado:
 *   um servidor de teste mais gentil do que o real prova a coisa errada;
 * - conflito quando `versao <> versao_esperada`, devolvendo a linha vigente;
 * - `versao_esperada <> 0` para chave inexistente = conflito.
 *
 * ## Como dois aparelhos são simulados
 *
 * O estado local do app (Map do `cacheLocal` + IndexedDB) é global ao módulo.
 * "Trocar de aparelho" é `novoAparelho()`: zera memória, fila, conflitos e o
 * banco, e semeia o cache com o que aquele aparelho conhecia. O SERVIDOR
 * sobrevive à troca — é ele que os dois compartilham, que é exatamente a
 * relação real.
 */

const ORG = '77777777-7777-7777-7777-777777777777';

/** A linha de `app_storage`. */
const servidor = new Map<string, { valor: string | null; versao: number }>();
/** `app_storage_mutacoes`: o resultado guardado por `mutation_id`. */
const mutacoes = new Map<string, Record<string, unknown>>();
/** Quantas chamadas a RPC recebeu — para provar que retry não reaplica. */
let chamadas: { mutationId: string; chave: string; versaoEsperada: number }[] = [];
/** Ligado, toda chamada falha como se a rede tivesse caído NA VOLTA. */
let perderRespostas = false;
/** Ligado, a rede nem chega ao servidor — o offline de verdade. */
let redeCaiu = false;

const implementacaoServidor = async (_nome: string, p: Record<string, unknown>) => {
  // OFFLINE de verdade: a requisição não sai, e o servidor não decide nada.
  if (redeCaiu) throw Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
  const mutationId = String(p.p_mutation_id);
  const chave = String(p.p_chave);
  const esperada = Number(p.p_versao_esperada);
  chamadas.push({ mutationId, chave, versaoEsperada: esperada });

  const responder = (res: Record<string, unknown>) => {
    // O servidor JÁ decidiu; perder a resposta é o timeout do §4.
    if (perderRespostas) throw Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
    return { data: res, error: null };
  };

  const guardado = mutacoes.get(mutationId);
  if (guardado) {
    // O `||` do jsonb: o status guardado é SOBRESCRITO por 'repetido'.
    return responder({ ...guardado, status: 'repetido' });
  }

  const atual = servidor.get(chave);
  let res: Record<string, unknown>;

  if (atual) {
    if (atual.versao !== esperada) {
      res = {
        status: 'conflito',
        versao: atual.versao,
        valor: atual.valor,
        atualizado_em: '2026-09-22T12:00:00.000Z',
        dispositivo: 'outro-aparelho',
      };
    } else {
      const nova = esperada + 1;
      servidor.set(chave, { valor: p.p_op === 'del' ? null : String(p.p_valor), versao: nova });
      res = { status: 'aplicado', versao: nova };
    }
  } else if (esperada !== 0) {
    res = { status: 'conflito', versao: 0, valor: null };
  } else {
    servidor.set(chave, { valor: p.p_op === 'del' ? null : String(p.p_valor), versao: 1 });
    res = { status: 'aplicado', versao: 1 };
  }

  mutacoes.set(mutationId, res);
  return responder(res);
};

/**
 * O mock precisa ser RESETADO e reinstalado a cada teste, não só limpo.
 * `mockClear` zera as chamadas e preserva implementações — inclusive um
 * `mockImplementationOnce` que o teste anterior enfileirou e não consumiu. Foi
 * assim que o ensaio produziu um falso positivo de ressurreição: o "offline"
 * de um teste vazou para o seguinte.
 */
const rpc = vi.fn(implementacaoServidor);

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(a[0] as string, a[1] as Record<string, unknown>),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
      })),
    })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'u1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { definirOrg, gravarAtomico, obterRegistro, zerarMemoria } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  listarConflitos,
  itemDaChave,
  removerDaFila,
  drenar,
  zerarFilaMemoria,
  zerarConflitosMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
} from './sync';
import { baseDe, registrarBase } from './baseColecao';
import { definirFlagsSync, flagsSync, restaurarFlagsSync, PADRAO_SYNC, CombinacaoDeFlagsInvalida } from './flagsSync';
import { excluirPorId, marcarRemovido, visiveis, estatisticaTombstones } from './colecoes';

/** Uma coleção do catálogo. */
const CHAVE = 'nr13_pront_indice';

type Item = { id: string; nome?: string; obs?: string; removidoEm?: string };

const j = (lista: Item[]) => JSON.stringify(lista);
const A: Item = { id: 'A', nome: 'a' };
const B: Item = { id: 'B', nome: 'b' };
const C: Item = { id: 'C', nome: 'c' };

/**
 * Troca de aparelho: estado local zerado, servidor preservado.
 *
 * `conhecia` é o que aquele aparelho tinha no cache e como BASE — ou seja, o
 * que ele viu do servidor da última vez que sincronizou.
 */
async function novoAparelho(conhecia?: { lista: Item[]; versao: number }): Promise<void> {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  zerarConflitosMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  zerarThrottleSync();
  if (conhecia) {
    await gravarAtomico([
      {
        chave: CHAVE,
        registro: { valor: j(conhecia.lista), versao: conhecia.versao, atualizadoEm: '', dispositivo: 'servidor' },
      },
    ]);
    await registrarBase(CHAVE, { versao: conhecia.versao, valor: j(conhecia.lista) });
  }
}

/**
 * Uma edição local. ESPELHA `storageV2.salvarUma` passo a passo, e isso é o
 * ponto: um harness mais simples que a produção prova outra coisa.
 *
 * A linha do `removerDaFila` foi a que este ensaio descobriu faltando aqui — a
 * condensação tira a mutação anterior da MEMÓRIA, e sem ela o IndexedDB ficava
 * com a linha superada. Num "fechar e reabrir" as duas voltavam, e a antiga
 * subia primeiro, publicando um valor desatualizado. A produção já faz isto; o
 * teste é que não fazia.
 */
async function editarLocalmente(lista: Item[], versaoBase: number): Promise<void> {
  const item = montarItem('set', CHAVE, j(lista), versaoBase);
  const antigo = itemDaChave(CHAVE);
  await gravarAtomico(
    [{ chave: CHAVE, registro: { valor: j(lista), versao: versaoBase, atualizadoEm: '', dispositivo: 'aqui' } }],
    [item],
  );
  if (antigo && antigo.mutationId !== item.mutationId) await removerDaFila(antigo.mutationId);
  registrarNaMemoria(item);
}

/** Drena até a fila parar de mudar — o merge sobe no CICLO SEGUINTE. */
async function sincronizar(maximo = 4): Promise<void> {
  for (let i = 0; i < maximo; i++) {
    const antes = listarFila().map((x) => x.mutationId).join(',');
    await drenar();
    const depois = listarFila().map((x) => x.mutationId).join(',');
    if (antes === depois) return;
  }
}

/** O que o servidor tem agora, já filtrado como a tela leria. */
const noServidor = (): Item[] => visiveis(JSON.parse(servidor.get(CHAVE)?.valor ?? '[]') as Item[]);
/** O que ESTE aparelho mostraria. */
const naTela = (): Item[] => visiveis(JSON.parse(obterRegistro(CHAVE)?.valor ?? '[]') as Item[]);
const ids = (l: Item[]) => l.map((i) => i.id).sort();

beforeEach(async () => {
  servidor.clear();
  mutacoes.clear();
  chamadas = [];
  perderRespostas = false;
  redeCaiu = false;
  rpc.mockReset();
  rpc.mockImplementation(implementacaoServidor);
  restaurarFlagsSync();
  await novoAparelho();
});

afterEach(() => {
  // Um teste que liga e não desliga contamina os seguintes.
  restaurarFlagsSync();
});

// ===========================================================================
// 1 · Os interruptores
// ===========================================================================
describe('interruptores', () => {
  it('o PADRÃO — o que vai para produção — tem os três desligados', () => {
    expect(PADRAO_SYNC).toEqual({ tombstone: false, mergeAutomatico: false, filaPorItem: false });
  });

  it('recusa merge automático sem tombstone — é a combinação que apaga dado', () => {
    expect(() => definirFlagsSync({ mergeAutomatico: true })).toThrow(CombinacaoDeFlagsInvalida);
    expect(flagsSync().mergeAutomatico).toBe(false);
  });

  it('a fila por item continua desligada no ensaio', () => {
    definirFlagsSync({ tombstone: true, mergeAutomatico: true });
    expect(flagsSync().filaPorItem).toBe(false);
  });
});

// ===========================================================================
// 3 · Os casos A–F, com dois aparelhos
// ===========================================================================
describe('CASO A · edição offline simples', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('servidor A B C, celular edita C → A B C2, sem conflito manual', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });

    const C2 = { ...C, nome: 'c2' };
    await editarLocalmente([A, B, C2], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B', 'C']);
    expect(noServidor().find((i) => i.id === 'C')?.nome).toBe('c2');
    expect(listarConflitos()).toHaveLength(0);
    expect(listarFila()).toHaveLength(0);
    expect(await baseDe(CHAVE)).toEqual({ versao: 2, valor: j([A, B, C2]) });
  });
});

describe('CASO B · alterações em itens diferentes', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('PC altera A, celular altera C → A2 B C2, sem perda e sem pergunta', async () => {
    const A2 = { ...A, nome: 'a2' };
    const C2 = { ...C, nome: 'c2' };
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });

    // PC
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A2, B, C], 1);
    await sincronizar();
    expect(servidor.get(CHAVE)?.versao).toBe(2);

    // Celular, que ficou na versão 1
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, C2], 1);
    await sincronizar();

    const final = noServidor();
    expect(ids(final)).toEqual(['A', 'B', 'C']);
    expect(final.find((i) => i.id === 'A')?.nome).toBe('a2');
    expect(final.find((i) => i.id === 'C')?.nome).toBe('c2');
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
    expect(listarFila()).toHaveLength(0);
  });

  it('o merge sobe como mutação NOVA, com a versão do servidor como base', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([{ ...A, nome: 'a2' }, B, C], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, { ...C, nome: 'c2' }], 1);
    await sincronizar();

    // A 1ª tentativa foi com base 1 (conflito); a 2ª, com base 2 (a do servidor).
    const desteAparelho = chamadas.filter((c) => c.chave === CHAVE).slice(-2);
    expect(desteAparelho[0].versaoEsperada).toBe(1);
    expect(desteAparelho[1].versaoEsperada).toBe(2);
    expect(desteAparelho[0].mutationId).not.toBe(desteAparelho[1].mutationId);
  });
});

describe('CASO C · criação offline', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('servidor A B, celular cria C → A B C (nunca C sozinho)', async () => {
    servidor.set(CHAVE, { valor: j([A, B]), versao: 1 });
    await novoAparelho({ lista: [A, B], versao: 1 });

    await editarLocalmente([A, B, C], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B', 'C']);
  });

  it('os DOIS criam offline: nada se perde e ninguém é perguntado', async () => {
    const D: Item = { id: 'D', nome: 'd' };
    servidor.set(CHAVE, { valor: j([A, B]), versao: 1 });

    await novoAparelho({ lista: [A, B], versao: 1 });
    await editarLocalmente([A, B, D], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B], versao: 1 });
    await editarLocalmente([A, B, C], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B', 'C', 'D']);
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
  });

  it('o cache NUNCA vira a lista parcial: o aparelho enxerga a união', async () => {
    servidor.set(CHAVE, { valor: j([A, B]), versao: 1 });
    await novoAparelho({ lista: [A, B], versao: 1 });
    await editarLocalmente([A, B, { id: 'D' }], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B], versao: 1 });
    await editarLocalmente([A, B, C], 1);
    await sincronizar();

    expect(ids(naTela())).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('CASO D · exclusão contra aparelho atrasado', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  /** PC exclui C; o celular, parado na versão 1, edita B e sincroniza. */
  async function cenarioExclusao() {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente(excluirPorId([A, B, C], 'C', '2026-09-22T12:00:00.000Z'), 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, { ...B, nome: 'b2' }, C], 1);
    await sincronizar();
  }

  it('com o tombstone ligado, a exclusão MARCA em vez de sumir', async () => {
    const lista = excluirPorId([A, B, C], 'C', '2026-09-22T12:00:00.000Z');
    expect(lista).toHaveLength(3);
    expect(lista.find((i) => i.id === 'C')?.removidoEm).toBe('2026-09-22T12:00:00.000Z');
  });

  it('C NÃO ressuscita, e a edição do celular sobrevive', async () => {
    await cenarioExclusao();

    expect(ids(noServidor())).toEqual(['A', 'B']);
    expect(noServidor().find((i) => i.id === 'B')?.nome).toBe('b2');
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
  });

  it('F5 / nova aba / novo carregamento: continua A B', async () => {
    await cenarioExclusao();
    const antes = ids(naTela());

    // "F5" = o aparelho recarrega e relê o cache já persistido.
    expect(ids(naTela())).toEqual(antes);
    // "Nova aba" = outro contexto lendo o MESMO estado do servidor.
    expect(ids(noServidor())).toEqual(['A', 'B']);
    expect(antes).toEqual(['A', 'B']);
  });

  it('segundo ciclo de sincronização não traz C de volta', async () => {
    await cenarioExclusao();
    await sincronizar();
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B']);
    expect(listarFila()).toHaveLength(0); // e não entra em laço
  });

  it('um TERCEIRO aparelho, que nunca soube da exclusão, também não a desfaz', async () => {
    await cenarioExclusao();
    const versaoAtual = servidor.get(CHAVE)!.versao;

    await novoAparelho({ lista: [A, B, C], versao: 1 }); // cópia velha, com C vivo
    await editarLocalmente([A, B, C, { id: 'E', nome: 'e' }], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B', 'E']);
    expect(servidor.get(CHAVE)!.versao).toBeGreaterThan(versaoAtual);
  });

  it('o tombstone SOBREVIVE no bruto — é ele que segura as próximas rodadas', async () => {
    await cenarioExclusao();
    const bruto = JSON.parse(servidor.get(CHAVE)!.valor!) as Item[];
    expect(bruto.find((i) => i.id === 'C')?.removidoEm).toBeTruthy();
  });
});

describe('CASO E · mesmo item, mesmo campo', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('NÃO resolve sozinho: continua conflito manual', async () => {
    servidor.set(CHAVE, { valor: j([{ id: 'C', nome: 'A' }]), versao: 1 });

    await novoAparelho({ lista: [{ id: 'C', nome: 'A' }], versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'B' }], 1);
    await sincronizar();

    await novoAparelho({ lista: [{ id: 'C', nome: 'A' }], versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'C' }], 1);
    await sincronizar();

    const abertos = listarConflitos().filter((c) => !c.resolucao);
    expect(abertos).toHaveLength(1);
    expect(listarFila()[0].estado).toBe('conflito');
    // As DUAS versões sobrevivem para o usuário comparar.
    expect(abertos[0].remoto?.valor).toContain('"nome":"B"');
    expect(abertos[0].local?.valor).toContain('"nome":"C"');
  });

  it('e a BASE não avança enquanto a decisão não sai', async () => {
    servidor.set(CHAVE, { valor: j([{ id: 'C', nome: 'A' }]), versao: 1 });
    await novoAparelho({ lista: [{ id: 'C', nome: 'A' }], versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'B' }], 1);
    await sincronizar();

    await novoAparelho({ lista: [{ id: 'C', nome: 'A' }], versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'C' }], 1);
    await sincronizar();

    expect(await baseDe(CHAVE)).toEqual({ versao: 1, valor: j([{ id: 'C', nome: 'A' }]) });
  });
});

describe('CASO F · alterações disjuntas no MESMO item (P2)', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  /**
   * O motor atual não faz field merge, e não vai inventar um. `nome` e `obs`
   * são campos diferentes do mesmo item, e uni-los exigiria saber que ninguém
   * mais depende da combinação — coisa que só o domínio sabe. Fica manual, e
   * fica registrado como P2 em `docs/HARDENING-SINCRONIZACAO.md`.
   */
  it('mantém conflito manual em vez de inventar o resultado', async () => {
    const base = [{ id: 'C', nome: 'A', obs: 'X' }];
    servidor.set(CHAVE, { valor: j(base), versao: 1 });

    await novoAparelho({ lista: base, versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'B', obs: 'X' }], 1);
    await sincronizar();

    await novoAparelho({ lista: base, versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'A', obs: 'Y' }], 1);
    await sincronizar();

    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(1);
    // Nada foi perdido: o servidor mantém a versão do PC, o aparelho mantém a sua.
    expect(JSON.parse(servidor.get(CHAVE)!.valor!)[0]).toEqual({ id: 'C', nome: 'B', obs: 'X' });
    expect(JSON.parse(obterRegistro(CHAVE)!.valor)[0]).toEqual({ id: 'C', nome: 'A', obs: 'Y' });
  });
});

// ===========================================================================
// 4 · interpretarResposta com a fila REAL
// ===========================================================================
describe('interpretarResposta ponta a ponta', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('ACK aplicado → base avança, fila esvazia', async () => {
    await novoAparelho();
    await editarLocalmente([A], 0);
    await sincronizar();

    expect(await baseDe(CHAVE)).toEqual({ versao: 1, valor: j([A]) });
    expect(listarFila()).toHaveLength(0);
  });

  it('ACK perdido + retry com o MESMO mutationId → repetido genuíno, sem reaplicar', async () => {
    servidor.set(CHAVE, { valor: j([A]), versao: 1 });
    await novoAparelho({ lista: [A], versao: 1 });
    await editarLocalmente([A, B], 1);

    // O servidor aplica; a resposta se perde na volta.
    perderRespostas = true;
    await drenar();
    expect(servidor.get(CHAVE)!.versao).toBe(2); // aplicou lá
    expect(listarFila()).toHaveLength(1); // e continua pendente aqui
    expect(await baseDe(CHAVE)).toEqual({ versao: 1, valor: j([A]) }); // base NÃO avançou

    // Retry: mesmo id, caminho rápido de idempotência.
    perderRespostas = false;
    await sincronizar();

    expect(servidor.get(CHAVE)!.versao).toBe(2); // NÃO reaplicou
    expect(await baseDe(CHAVE)).toEqual({ versao: 2, valor: j([A, B]) });
    expect(listarFila()).toHaveLength(0);
    const idsUsados = new Set(chamadas.filter((c) => c.chave === CHAVE).map((c) => c.mutationId));
    expect(idsUsados.size).toBe(1);
  });

  it('CONFLITO não é lido como repetido, nem no reenvio do mesmo id', async () => {
    // Um conflito que o merge NÃO resolve (mesmo item, mesmo campo).
    servidor.set(CHAVE, { valor: j([{ id: 'C', nome: 'servidor' }]), versao: 2 });
    await novoAparelho({ lista: [{ id: 'C', nome: 'base' }], versao: 1 });
    await editarLocalmente([{ id: 'C', nome: 'meu' }], 1);
    await sincronizar();

    expect(listarFila()[0].estado).toBe('conflito');
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(1);
    expect(await baseDe(CHAVE)).toEqual({ versao: 1, valor: j([{ id: 'C', nome: 'base' }]) });

    // Drenar de novo NÃO reenvia item em conflito, e se reenviasse o contrato
    // desmascararia o "repetido".
    await drenar();
    expect(listarFila()[0].estado).toBe('conflito');
  });

  it('RECUSA por permissão não vira ACK, e a pendência não some', async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { status: 'recusado', motivo: 'sem_permissao', versao: 0 },
      error: null,
    }));
    await novoAparelho();
    await editarLocalmente([A], 0);
    await drenar();

    expect(listarFila()).toHaveLength(1);
    expect(listarFila()[0].estado).toBe('falha_definitiva');
    expect(await baseDe(CHAVE)).toBeNull();
  });

  it('a recusa MASCARADA de repetido também não vira ACK', async () => {
    rpc.mockImplementation(async () => ({
      data: { status: 'repetido', motivo: 'sem_permissao', versao: 0 },
      error: null,
    }));
    await novoAparelho();
    await editarLocalmente([A], 0);
    await drenar();

    expect(listarFila()).toHaveLength(1);
    expect(listarFila()[0].estado).toBe('falha_definitiva');
    expect(await baseDe(CHAVE)).toBeNull();
  });

  it('falha_definitiva não é retentada na drenagem seguinte', async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { status: 'recusado', motivo: 'sem_permissao', versao: 0 },
      error: null,
    }));
    await novoAparelho();
    await editarLocalmente([A], 0);
    await drenar();
    const antes = rpc.mock.calls.length;

    await drenar();
    expect(rpc.mock.calls.length).toBe(antes); // não gastou requisição
    expect(listarFila()[0].estado).toBe('falha_definitiva');
  });
});

// ===========================================================================
// 6 · As três coleções com histórico de problema real
// ===========================================================================
describe('cache parcial nas coleções que já deram problema', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  for (const chaveAlvo of ['nr13_pront_indice', 'nr13_rascunhos', 'nr13_historico_indice_V-9']) {
    it(`${chaveAlvo}: aparelho com cache VAZIO não sobe lista parcial`, async () => {
      // O servidor tem cinco itens; este aparelho não tem nada no cache — foi
      // exatamente o estado medido em produção em 22/09/2026, que produziu uma
      // mutação de 1 item com `versaoBase: 0` contra um servidor na versão 6.
      const cinco: Item[] = ['P1', 'P2', 'P3', 'P4', 'P5'].map((id) => ({ id }));
      servidor.set(chaveAlvo, { valor: j(cinco), versao: 6 });

      await novoAparelho(); // cache vazio, sem base

      // O defeito ORIGINAL, reproduzido: alguém conclui "não existe" e grava um
      // item só, com base 0.
      const item = montarItem('set', chaveAlvo, j([{ id: 'novo' }]), 0);
      await gravarAtomico(
        [{ chave: chaveAlvo, registro: { valor: j([{ id: 'novo' }]), versao: 0, atualizadoEm: '', dispositivo: 'aqui' } }],
        [item],
      );
      registrarNaMemoria(item);
      await sincronizar();

      // Com o merge ligado, o desfecho deixa de ser "escolha entre perder
      // quatro e perder nada": os cinco continuam lá e o novo entra.
      const final = visiveis(JSON.parse(servidor.get(chaveAlvo)!.valor!) as Item[]);
      expect(final.map((i) => i.id).sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'novo']);
      expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
    });
  }

  it('depois do ACK a base é a confirmada — o ciclo seguinte não repete o conflito', async () => {
    const cinco: Item[] = ['P1', 'P2', 'P3', 'P4', 'P5'].map((id) => ({ id }));
    servidor.set(CHAVE, { valor: j(cinco), versao: 6 });
    await novoAparelho();

    const item = montarItem('set', CHAVE, j([{ id: 'novo' }]), 0);
    await gravarAtomico(
      [{ chave: CHAVE, registro: { valor: j([{ id: 'novo' }]), versao: 0, atualizadoEm: '', dispositivo: 'aqui' } }],
      [item],
    );
    registrarNaMemoria(item);
    await sincronizar();

    const base = await baseDe(CHAVE);
    expect(base?.versao).toBe(servidor.get(CHAVE)!.versao);
    expect(base?.valor).toBe(servidor.get(CHAVE)!.valor);

    // Uma edição nova, agora com a base correta: aplica direto, sem conflito.
    const depois = [...(JSON.parse(base!.valor) as Item[]), { id: 'mais-um' }];
    await editarLocalmente(depois, base!.versao);
    await sincronizar();
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
    expect(listarFila()).toHaveLength(0);
  });
});

// ===========================================================================
// 7 · Offline com persistência real (IndexedDB)
// ===========================================================================
describe('offline: o trabalho sobrevive ao fechar e reabrir', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  it('criar, editar e excluir offline → tudo persistido → reconectar concilia', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });

    // OFFLINE: a rede recusa toda chamada, e o servidor nem é consultado.
    redeCaiu = true;

    const comD = [A, { ...B, nome: 'b-editado-em-campo' }, C, { id: 'D', nome: 'criado em campo' }];
    await editarLocalmente(comD, 1);
    await editarLocalmente(excluirPorId(comD, 'C', '2026-09-22T13:00:00.000Z'), 1);
    await drenar();

    expect(listarFila()).toHaveLength(1); // nada subiu
    expect(ids(naTela())).toEqual(['A', 'B', 'D']); // a tela já reflete o trabalho

    // "Fechar e reabrir": a memória some, o IndexedDB fica.
    const { hidratarDoDisco } = await import('./cacheLocal');
    const { carregarFilaDoDisco } = await import('./sync');
    zerarMemoria();
    zerarFilaMemoria();
    await hidratarDoDisco();
    await carregarFilaDoDisco();

    expect(listarFila()).toHaveLength(1); // a pendência sobreviveu ao reload
    expect(ids(naTela())).toEqual(['A', 'B', 'D']); // e o dado também

    // Volta a rede.
    redeCaiu = false;
    await sincronizar();
    expect(ids(noServidor())).toEqual(['A', 'B', 'D']);
    expect(listarFila()).toHaveLength(0);
  });
});

// ===========================================================================
// 10 · Dispositivo antigo × novo
// ===========================================================================
describe('dispositivo ANTIGO contra dispositivo NOVO', () => {
  beforeEach(() => definirFlagsSync({ tombstone: true, mergeAutomatico: true }));

  /**
   * "Antigo" = bundle anterior a esta entrega: não conhece `removidoEm`, exclui
   * tirando o item da lista, e manda o blob inteiro pela fila `set`/`del` — que
   * é a fila que continua valendo, por isso ele nem percebe a diferença.
   */
  const excluirAoModoAntigo = (lista: Item[], id: string) => lista.filter((i) => i.id !== id);

  it('o antigo não desfaz a exclusão feita pelo novo', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });

    // NOVO: marca.
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente(excluirPorId([A, B, C], 'C', '2026-09-22T12:00:00.000Z'), 1);
    await sincronizar();

    // ANTIGO: lista sem tombstone, editando outro item.
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, { ...B, nome: 'b-antigo' }, C], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B']);
    expect(noServidor().find((i) => i.id === 'B')?.nome).toBe('b-antigo');
  });

  it('a exclusão feita pelo ANTIGO (sem tombstone) também é respeitada', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });

    // ANTIGO exclui C sumindo com ele.
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente(excluirAoModoAntigo([A, B, C], 'C'), 1);
    await sincronizar();
    expect(ids(noServidor())).toEqual(['A', 'B']);

    // NOVO, atrasado, com C ainda vivo e uma edição própria.
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, C, { id: 'E' }], 1);
    await sincronizar();

    // LIMITAÇÃO CONHECIDA, e é a razão de o tombstone existir: sem marca, o
    // merge não tem como saber que C foi EXCLUÍDO e não apenas ausente — e
    // "ausente de um lado" significa "criado no outro". C volta.
    expect(ids(noServidor())).toContain('C');
    expect(ids(noServidor())).toEqual(['A', 'B', 'C', 'E']);
  });

  it('não entra em laço de conflito: a fila esvazia e fica vazia', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([{ ...A, nome: 'a2' }, B, C], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, { ...C, nome: 'c2' }], 1);
    await sincronizar();
    await sincronizar();
    await sincronizar();

    expect(listarFila()).toHaveLength(0);
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(0);
  });

  it('nenhum item some em nenhum dos cenários acima', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, C, { id: 'X' }], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, C, { id: 'Y' }], 1);
    await sincronizar();

    expect(ids(noServidor())).toEqual(['A', 'B', 'C', 'X', 'Y']);
  });
});

// ===========================================================================
// 8 · Poda continua desligada, só medida
// ===========================================================================
describe('poda', () => {
  it('continua desligada, e o acúmulo é MEDIDO', async () => {
    definirFlagsSync({ tombstone: true, mergeAutomatico: true });
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });
    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente(excluirPorId([A, B, C], 'C', '2026-09-22T12:00:00.000Z'), 1);
    await sincronizar();

    const bruto = JSON.parse(servidor.get(CHAVE)!.valor!) as Item[];
    const e = estatisticaTombstones(bruto);
    expect(e.total).toBe(3);
    expect(e.removidos).toBe(1);
    expect(e.bytes).toBeGreaterThan(0);
    expect(e.maisAntigo).toBe('2026-09-22T12:00:00.000Z');
    // Nada foi apagado: o tombstone continua inteiro no blob.
    expect(bruto).toHaveLength(3);
  });
});

// ===========================================================================
// 11 · Regressão: com as flags no padrão, nada muda
// ===========================================================================
describe('REGRESSÃO · com os interruptores no padrão, o comportamento é o de hoje', () => {
  it('a exclusão continua TIRANDO o item da lista', () => {
    expect(excluirPorId([A, B, C], 'C')).toEqual([A, B]);
  });

  it('o conflito continua indo para a tela manual — nada é resolvido sozinho', async () => {
    servidor.set(CHAVE, { valor: j([A, B, C]), versao: 1 });

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([{ ...A, nome: 'a2' }, B, C], 1);
    await sincronizar();

    await novoAparelho({ lista: [A, B, C], versao: 1 });
    await editarLocalmente([A, B, { ...C, nome: 'c2' }], 1);
    await sincronizar();

    // Itens DIFERENTES — o merge resolveria; com a flag no padrão, não resolve.
    expect(listarConflitos().filter((c) => !c.resolucao)).toHaveLength(1);
    expect(listarFila()[0].estado).toBe('conflito');
  });

  it('o ACK continua avançando a base (isto é da rodada anterior, e ficou ligado)', async () => {
    await novoAparelho();
    await editarLocalmente([A], 0);
    await sincronizar();
    expect(await baseDe(CHAVE)).toEqual({ versao: 1, valor: j([A]) });
  });

  it('os leitores continuam filtrando tombstone — filtrar é inócuo sem tombstone', () => {
    expect(visiveis([A, marcarRemovido(B, '2026-09-22T12:00:00.000Z'), C]).map((i) => i.id)).toEqual(['A', 'C']);
    expect(visiveis([A, B, C])).toHaveLength(3);
  });
});
