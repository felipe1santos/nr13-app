import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A BASE NO ACK REAL DA FILA (22/09/2026).
 *
 * A rodada anterior deixou uma ambiguidade: o relatório dizia "a base atualiza
 * no ACK", mas o único escritor era a HIDRATAÇÃO (`colecaoSync.lerColecao`) —
 * e o teste que provava a regra chamava `registrarBase` diretamente, sem passar
 * pela fila. Ou seja: a regra estava escrita e não estava ligada.
 *
 * Aqui a fila REAL é exercitada de ponta a ponta, e a regra passa a ser uma só:
 *
 *   ACK real confirmado pelo servidor
 *   → versão local alinhada
 *   → BASE daquela chave vira o estado confirmado
 *   → só então a mutação sai da fila.
 *
 * Erro, timeout, conflito e recusa NÃO avançam a base. Nenhum deles.
 */

const ORG = '66666666-6666-6666-6666-666666666666';
const rpc = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
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
import { definirOrg, gravarAtomico, obterRegistro, zerarMemoria, type Registro } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  drenar,
  tentarNovamente,
  zerarFilaMemoria,
  zerarConflitosMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
} from './sync';
import { baseDe } from './baseColecao';

/** Uma COLEÇÃO do catálogo — é para elas que a base existe. */
const COLECAO = 'nr13_pront_indice';
/** Uma chave comum, fora do catálogo. */
const AVULSA = 'nr13_info_VASO-9';

const LISTA_A = JSON.stringify([{ id: 'a' }]);
const LISTA_AB = JSON.stringify([{ id: 'a' }, { id: 'b' }]);

const reg = (valor: string, versao: number): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-09-22T10:00:00.000Z',
  dispositivo: 'dev-local',
});

/** Põe uma pendência para a chave, como `storageV2.salvar` faz. */
async function pendencia(chave: string, valor: string, versaoServidor = 4, op: 'set' | 'del' = 'set') {
  const item = montarItem(op, chave, op === 'set' ? valor : undefined, versaoServidor);
  await gravarAtomico([{ chave, registro: reg(valor, versaoServidor + 1) }], [item]);
  registrarNaMemoria(item);
  return item;
}

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  zerarConflitosMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  rpc.mockReset();
  zerarThrottleSync();
});

describe('ACK aplicado', () => {
  it('avança a BASE para o estado confirmado, com a versão do servidor', async () => {
    await pendencia(COLECAO, LISTA_AB);
    expect(await baseDe(COLECAO)).toBeNull(); // antes do ACK não existe base

    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 5 }, error: null });
    await drenar();

    expect(await baseDe(COLECAO)).toEqual({ versao: 5, valor: LISTA_AB });
  });

  it('alinha a versão local e ESVAZIA a fila — a base vem antes da remoção', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 5 }, error: null });
    await drenar();

    expect(obterRegistro(COLECAO)?.versao).toBe(5);
    expect(listarFila()).toHaveLength(0);
  });

  it('não guarda base de chave que não é coleção', async () => {
    await pendencia(AVULSA, '{"a":1}');
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 9 }, error: null });
    await drenar();

    // Guardar a base de TODA chave dobraria o IndexedDB do aparelho, e nada
    // fora de uma lista sabe o que fazer com ela.
    expect(await baseDe(AVULSA)).toBeNull();
    expect(listarFila()).toHaveLength(0); // o ACK funcionou do mesmo jeito
  });

  it('um `del` confirmado ESQUECE a base — a chave não existe mais no servidor', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 5 }, error: null });
    await drenar();
    expect(await baseDe(COLECAO)).not.toBeNull();

    await pendencia(COLECAO, LISTA_AB, 5, 'del');
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 6 }, error: null });
    await drenar();

    // `{versao, valor:''}` afirmaria que o servidor confirmou uma lista VAZIA,
    // e lista vazia é um estado legítimo — diferente de "a chave não existe".
    expect(await baseDe(COLECAO)).toBeNull();
  });
});

describe('ACK repetido — idempotência depois do ACK perdido', () => {
  it('o reenvio do MESMO mutationId grava a mesma base e não duplica nada', async () => {
    const item = await pendencia(COLECAO, LISTA_AB);

    // 1ª tentativa: o servidor aplicou, mas a resposta se perdeu na volta.
    rpc.mockRejectedValueOnce(Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' }));
    await drenar();
    expect(listarFila()).toHaveLength(1); // nada saiu da fila
    expect(await baseDe(COLECAO)).toBeNull(); // e a base NÃO avançou

    // 2ª tentativa: mesmo id, e o servidor devolve o resultado guardado.
    rpc.mockResolvedValue({ data: { status: 'repetido', versao: 5 }, error: null });
    await drenar();

    expect(await baseDe(COLECAO)).toEqual({ versao: 5, valor: LISTA_AB });
    expect(listarFila()).toHaveLength(0);
    // O mesmo id foi reenviado — nenhuma mutação nova foi criada.
    //
    // Filtrado por `aplicar_mutacao_storage`: a drenagem bem-sucedida também
    // chama `registrar_dispositivo_sync` (telemetria de protocolo), e ela não
    // carrega mutationId nenhum.
    const mutacoes = rpc.mock.calls.filter((c) => c[0] === 'aplicar_mutacao_storage');
    expect(mutacoes.length).toBeGreaterThan(0);
    expect(mutacoes.every((c) => (c[1] as { p_mutation_id: string }).p_mutation_id === item.mutationId)).toBe(true);
  });

  it('repetir o ACK duas vezes deixa a MESMA base (idempotente)', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'repetido', versao: 5 }, error: null });
    await drenar();
    const primeira = await baseDe(COLECAO);

    await pendencia(COLECAO, LISTA_AB, 4);
    await drenar();

    expect(await baseDe(COLECAO)).toEqual(primeira);
  });
});

describe('o que NÃO avança a base', () => {
  it('erro de rede / timeout: base intacta e item na fila', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' }));
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
    expect(listarFila()).toHaveLength(1);
  });

  it('conflito: base intacta', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({
      data: {
        status: 'conflito',
        versao: 7,
        valor: LISTA_A,
        atualizado_em: '2026-09-22T11:00:00.000Z',
        dispositivo: 'dev-escritorio',
      },
      error: null,
    });
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
    expect(listarFila()[0].estado).toBe('conflito');
  });

  it('recusado por versão: base intacta', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'versao_obsoleta', versao: 9 }, error: null });
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
  });

  it('recusado por permissão: base intacta', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'sem_permissao', versao: 0 }, error: null });
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
    expect(listarFila()[0].estado).toBe('falha_definitiva');
  });

  it('a base de um ACK ANTERIOR não é desfeita por um conflito posterior', async () => {
    await pendencia(COLECAO, LISTA_A);
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 5 }, error: null });
    await drenar();

    await pendencia(COLECAO, LISTA_AB, 5);
    rpc.mockResolvedValue({
      data: { status: 'conflito', versao: 8, valor: LISTA_A, atualizado_em: '', dispositivo: null },
      error: null,
    });
    await drenar();

    // A base continua sendo o último estado CONFIRMADO, que é exatamente o que
    // o merge de três vias precisa para saber que quem mexeu foi este aparelho.
    expect(await baseDe(COLECAO)).toEqual({ versao: 5, valor: LISTA_A });
  });
});

describe('`repetido` que mascara outro resultado não vale como ACK', () => {
  /**
   * A RPC devolve `resultado || {'status':'repetido'}` no caminho rápido de
   * idempotência — o `||` do jsonb SOBRESCREVE o status guardado. Um id que da
   * primeira vez deu conflito ou recusa volta dizendo "repetido", e tratá-lo
   * como ACK carimbaria a versão do servidor sobre um valor que ele recusou.
   */
  it('repetido carregando `motivo` é RECUSA — nada sai da fila, base intacta', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'repetido', motivo: 'sem_permissao', versao: 0 }, error: null });
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
    expect(listarFila()).toHaveLength(1);
    expect(listarFila()[0].estado).toBe('falha_definitiva');
  });

  it('repetido carregando a linha do servidor é CONFLITO — base intacta', async () => {
    await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({
      data: {
        status: 'repetido',
        versao: 7,
        valor: LISTA_A,
        atualizado_em: '2026-09-22T11:00:00.000Z',
        dispositivo: 'dev-escritorio',
      },
      error: null,
    });
    await drenar();

    expect(await baseDe(COLECAO)).toBeNull();
    expect(listarFila()[0].estado).toBe('conflito');
  });

  it('“tentar de novo” numa falha definitiva não vira ACK por causa do mascaramento', async () => {
    const item = await pendencia(COLECAO, LISTA_AB);
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'sem_permissao', versao: 0 }, error: null });
    await drenar();
    expect(listarFila()[0].estado).toBe('falha_definitiva');

    // O reenvio cai no caminho rápido e volta mascarado.
    rpc.mockResolvedValue({ data: { status: 'repetido', motivo: 'sem_permissao', versao: 0 }, error: null });
    await tentarNovamente(item.mutationId);

    expect(listarFila()).toHaveLength(1); // a edição do usuário continua viva
    expect(await baseDe(COLECAO)).toBeNull();
  });
});
