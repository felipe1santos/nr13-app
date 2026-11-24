import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GRAVAÇÃO NOVA ENQUANTO A ANTERIOR ESTÁ A CAMINHO (24/11/2026).
 *
 * Achado no E2E em produção: os formulários de um container gravam a MESMA
 * chave (`nr13_docs_<TAG>`). Salvar o 2º enquanto o 1º ainda estava a caminho
 * do servidor condensava os dois na fila — e a nova mutação herdava a
 * `versaoBase` da primeira (regra de `montarItem`, certa para mutações que
 * AINDA NÃO SUBIRAM). Só que a primeira subiu: o servidor foi para v+1, e a
 * nova chegava com a base v → conflito falso em /pendencias, com o técnico
 * tendo que escolher entre duas versões do próprio trabalho.
 *
 * A regra: quando o servidor CONFIRMA uma mutação, a sucessora da mesma chave
 * que nasceu com a mesma base é reancorada na versão confirmada — o conteúdo
 * dela já inclui o que acabou de ser aplicado (foi gravado em cima do cache).
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
import { definirOrg, gravarAtomico, zerarMemoria, type Registro } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  itemDaChave,
  drenar,
  listarConflitos,
  zerarFilaMemoria,
  zerarConflitosMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
} from './sync';

const CHAVE = 'nr13_docs_ZZ-1';
const reg = (valor: string, versao: number): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-11-24T10:00:00.000Z',
  dispositivo: 'dev-local',
});

async function gravar(valor: string, versaoServidor: number) {
  const item = montarItem('set', CHAVE, valor, versaoServidor);
  await gravarAtomico([{ chave: CHAVE, registro: reg(valor, versaoServidor + 1) }], [item]);
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

describe('gravação nova com a anterior a caminho do servidor', () => {
  it('a sucessora é reancorada na versão confirmada e NÃO vira conflito', async () => {
    const m1 = await gravar('[{"id":"c1","dados":{"checklist":1}}]', 6);

    // A RPC da 1ª fica pendente; durante ela, o técnico salva o 2º formulário.
    // A 2ª sobe na sequência (mesma drenagem) e o servidor a aceita só se ela
    // vier com a base que ele tem — como o banco de verdade.
    let liberar!: (v: unknown) => void;
    rpc.mockImplementation(async (_nome: string, a: { p_versao_esperada: number }) =>
      a.p_versao_esperada === 7
        ? { data: { status: 'aplicado', versao: 8 }, error: null }
        : { data: { status: 'conflito', versao: 7, valor: '[]', atualizado_em: '2026-11-24T10:00:01Z', dispositivo: 'dev-local' }, error: null },
    );
    rpc.mockImplementationOnce(() => new Promise((r) => (liberar = r)));
    const drenando = drenar();
    await new Promise((r) => setTimeout(r, 0));
    const m2 = await gravar('[{"id":"c1","dados":{"checklist":1,"th":1}}]', 6);
    expect(m2.mutationId).not.toBe(m1.mutationId);
    expect(m2.versaoBase).toBe(6); // herdou a base (regra de montarItem)

    liberar({ data: { status: 'aplicado', versao: 7 }, error: null });
    await drenando;
    zerarThrottleSync();
    await drenar();

    const envios = rpc.mock.calls.filter((c) => c[0] === 'aplicar_mutacao_storage');
    const daM2 = envios.map((c) => c[1] as { p_versao_esperada: number; p_mutation_id: string }).filter((a) => a.p_mutation_id === m2.mutationId);
    expect(daM2.length).toBeGreaterThan(0);
    expect(daM2.every((a) => a.p_versao_esperada === 7)).toBe(true);
    expect(listarConflitos()).toEqual([]);
    expect(listarFila()).toEqual([]);
  });

  it('sucessora com OUTRA base (já reancorada ou de outra origem) não é mexida', async () => {
    await gravar('[{"id":"c1"}]', 6);
    let liberar!: (v: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise((r) => (liberar = r)));
    const drenando = drenar();
    await new Promise((r) => setTimeout(r, 0));
    const m2 = await gravar('[{"id":"c1","x":1}]', 6);
    // Simula uma sucessora que já tinha base diferente.
    m2.versaoBase = 9;
    liberar({ data: { status: 'aplicado', versao: 7 }, error: null });
    await drenando;
    expect(itemDaChave(CHAVE)?.versaoBase).toBe(9);
  });
});
