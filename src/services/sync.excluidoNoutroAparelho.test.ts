import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A pendência que o servidor recusa POR VERSÃO e que não tem lado de servidor
 * para comparar.
 *
 * Encontrado em produção em 19/08/2026, na conta `teste`: o selo dizia "3
 * falhas" e a tela de Pendências oferecia UMA decisão. Os outros dois itens
 * (`nr13_historico_indice_EQUIPE TESTE` e o relatório do mesmo equipamento)
 * estavam em estado `conflito` sem `RegistroConflito`, porque a recusa por
 * `tombstone_mais_novo`/`anterior_ao_corte` não devolve valor nenhum do
 * servidor — do lado de lá o registro foi EXCLUÍDO.
 *
 * Resultado: contados no selo, invisíveis na tela, sem botão. E pior que o
 * ruído — enquanto o item fica na fila, `lerTudo` pula a chave
 * (`sync.itemDaChave`), então a exclusão feita no outro aparelho NUNCA é
 * aplicada aqui: o equipamento apagado no celular continua aparecendo no
 * computador para sempre.
 */

const ORG = '66666666-6666-6666-6666-666666666666';
const rpc = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'u1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import {
  definirOrg,
  gravarAtomico,
  zerarMemoria,
  type Registro,
} from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  itemDaChave,
  drenar,
  listarConflitos,
  pendenciasSemComparacao,
  descartarPendencia,
  recriarNoServidor,
  zerarFilaMemoria,
  zerarConflitosMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
} from './sync';

const CHAVE = 'nr13_info_EQUIPE TESTE';
const LOCAL = '{"tag":"EQUIPE TESTE","fabricante":"editado-no-celular"}';

const reg = (valor: string, versao: number): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-16T10:00:00.000Z',
  dispositivo: 'dev-local',
});

/** O servidor recusa: a chave foi EXCLUÍDA em outro aparelho, na versão 9. */
const respostaExcluido = {
  data: { status: 'recusado', motivo: 'tombstone_mais_novo', versao: 9 },
  error: null,
};

async function pendenciaRecusada() {
  const item = montarItem('set', CHAVE, LOCAL, 6);
  await gravarAtomico([{ chave: CHAVE, registro: reg(LOCAL, 7) }], [item]);
  registrarNaMemoria(item);
  rpc.mockResolvedValue(respostaExcluido);
  await drenar();
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

describe('recusa por versão sem lado do servidor', () => {
  it('guarda a versão que o servidor devolveu — sem ela não há como reenviar', async () => {
    const item = await pendenciaRecusada();

    const naFila = listarFila().find((i) => i.mutationId === item.mutationId);
    expect(naFila?.estado).toBe('conflito');
    expect(naFila?.versaoServidor).toBe(9);
  });

  it('não inventa RegistroConflito: não existe versão do servidor para comparar', async () => {
    await pendenciaRecusada();
    expect(listarConflitos()).toEqual([]);
  });

  it('aparece em `pendenciasSemComparacao` — é o que a tela não mostrava', async () => {
    const item = await pendenciaRecusada();

    const sem = pendenciasSemComparacao();
    expect(sem.map((i) => i.mutationId)).toEqual([item.mutationId]);
    expect(sem[0].chave).toBe(CHAVE);
  });
});

describe('descartar a minha alteração', () => {
  it('tira o item da fila, liberando a chave para a exclusão do servidor', async () => {
    const item = await pendenciaRecusada();

    await descartarPendencia(item.mutationId);

    expect(listarFila()).toEqual([]);
    // `lerTudo` só aplica o `deletado_em` do servidor em chave SEM pendência.
    expect(itemDaChave(CHAVE)).toBeNull();
  });
});

describe('recriar no servidor', () => {
  it('reenvia com a versão do servidor como base, em mutação NOVA', async () => {
    const item = await pendenciaRecusada();

    await recriarNoServidor(item.mutationId);

    const novo = itemDaChave(CHAVE);
    expect(novo).not.toBeNull();
    expect(novo?.mutationId).not.toBe(item.mutationId);
    expect(novo?.resolveDe).toBe(item.mutationId);
    // A base é a versão do SERVIDOR: `versao + 1` precisa passar do piso que a
    // exclusão deixou, senão a RPC recusa de novo, para sempre.
    expect(novo?.versaoBase).toBe(9);
    expect(novo?.valor).toBe(LOCAL);
    expect(novo?.estado).toBe('aguardando');
    expect(listarFila()).toHaveLength(1);
  });

  it('o reenvio sobe quando a rede volta', async () => {
    const item = await pendenciaRecusada();
    await recriarNoServidor(item.mutationId);

    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 10 }, error: null });
    await zerarThrottleSync();
    await drenar();

    expect(listarFila()).toEqual([]);
  });
});
