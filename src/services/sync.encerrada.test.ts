import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recusa DEFINITIVA do servidor: a mutação não pode continuar sendo retentada,
 * mas também NÃO PODE SUMIR EM SILÊNCIO.
 *
 * Como era até 16/08/2026: `enviarItem` chamava `removerDaFila` com um
 * `console.warn`. A mutação saía da fila, saía do manifesto e a topbar voltava a
 * dizer "Tudo salvo" — a única cópia do que aconteceu ficava num log que ninguém
 * lê. É exatamente a mentira que este projeto existe para não contar: interface
 * dizendo "salvo" para o que o servidor recusou.
 *
 * Como é agora: o item fica na fila no estado `encerrado`. Não retenta, não
 * conta como falha (não existe conserto), aparece na tela de Pendências como
 * encerrada e só sai por ação explícita do usuário (`descartarEncerrada`).
 */

const ORG = '11111111-1111-1111-1111-111111111111';
const rpc = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb, listarTudo } from './db';
import { definirOrg, gravarAtomico, zerarMemoria, type Registro } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  listarPendentes,
  itemDaChave,
  drenar,
  tentarNovamente,
  descartarEncerrada,
  carregarFilaDoDisco,
  registrarTombstone,
  tombstoneMaisNovoQue,
  zerarFilaMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
  type ItemFila,
} from './sync';
import { resumoSelo, rotuloEstado } from './selo';
import { lerManifestoBruto } from './manifesto';

const MENSAGEM_LIVRO =
  'nr13_livro_imutavel: registro do Livro de Segurança já emitido não pode ser alterado, removido nem reordenado (chave nr13_livro_VP01).';

const reg = (valor: string, versao: number): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-16T12:00:00.000Z',
  dispositivo: 'd1',
});

async function pendenciaSet(chave: string, valor: string, versaoServidor: number) {
  const item = montarItem('set', chave, valor, versaoServidor);
  await gravarAtomico([{ chave, registro: reg(valor, versaoServidor + 1) }], [item]);
  registrarNaMemoria(item);
  return item;
}

async function pendenciaDel(chave: string, versaoServidor: number) {
  const item = montarItem('del', chave, undefined, versaoServidor);
  await gravarAtomico([{ chave, remover: true }], [item]);
  registrarNaMemoria(item);
  await registrarTombstone(chave, versaoServidor);
  return item;
}

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  rpc.mockReset();
  zerarThrottleSync();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recusa definitiva NÃO desaparece', () => {
  it('a mutação continua na fila, marcada como encerrada', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);

    await drenar();

    const item = itemDaChave('nr13_livro_VP01');
    expect(item).not.toBeNull();
    expect(item!.estado).toBe('encerrado');
    expect(item!.erro?.categoria).toBe('recusa_definitiva');
  });

  it('sobrevive a fechar e reabrir o navegador', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();

    zerarFilaMemoria();
    expect(listarFila()).toHaveLength(0);
    await carregarFilaDoDisco();

    expect(itemDaChave('nr13_livro_VP01')?.estado).toBe('encerrado');
  });

  it('a mensagem crua do servidor fica inteira nos detalhes', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();

    expect(itemDaChave('nr13_livro_VP01')?.erro?.detalhe.mensagemOriginal).toBe(MENSAGEM_LIVRO);
  });
});

describe('encerrada não vira ruído', () => {
  it('não é retentada nas drenagens seguintes', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();
    rpc.mockClear();

    expect(await drenar()).toEqual({ enviados: 0, falhas: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('`tentarNovamente` também não bate no servidor', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    const item = await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();
    rpc.mockClear();

    await tentarNovamente(item.mutationId);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('não conta como pendência nem como falha no selo', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();

    const resumo = resumoSelo(listarFila());
    expect(resumo).toMatchObject({ nivel: 'ok', pendentes: 0, falhas: 0 });
    expect(listarPendentes()).toHaveLength(0);
  });

  it('tem rótulo próprio, e não "Falhou"', () => {
    expect(rotuloEstado('encerrado')).toBe('Encerrada pelo servidor');
  });

  it('não segura o logout: `listarPendentes` é quem responde por trabalho a subir', async () => {
    // A do livro é recusada de vez; a de campo só não achou rede.
    rpc.mockRejectedValueOnce(new Error(MENSAGEM_LIVRO));
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await pendenciaSet('nr13_info_A', '{}', 1);
    await drenar();

    // A do livro encerrou; a de campo continua contando como trabalho pendente.
    expect(listarPendentes().map((i: ItemFila) => i.chave)).toEqual(['nr13_info_A']);
  });
});

describe('só sai por ação explícita do usuário', () => {
  it('`descartarEncerrada` remove da fila e do manifesto', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    const item = await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();

    await descartarEncerrada(item.mutationId);

    expect(itemDaChave('nr13_livro_VP01')).toBeNull();
    expect(await listarTudo<ItemFila>(ORG, 'fila')).toHaveLength(0);
    const manifesto = lerManifestoBruto(ORG);
    expect(manifesto.tipo === 'lido' ? manifesto.entradas : []).toHaveLength(0);
  });

  it('não descarta o que NÃO está encerrado — item aguardando é intocável', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const item = await pendenciaSet('nr13_info_A', '{}', 4);
    await drenar();

    await descartarEncerrada(item.mutationId);

    expect(itemDaChave('nr13_info_A')?.estado).toBe('aguardando');
  });
});

describe('exclusão recusada não deixa o aparelho divergente para sempre', () => {
  it('o tombstone sai, para a hidratação repor o que o servidor manteve', async () => {
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaDel('nr13_livro_VP01', 4);
    expect(tombstoneMaisNovoQue('nr13_livro_VP01', '2020-01-01T00:00:00.000Z')).toBe(true);

    await drenar();

    // O servidor recusou a exclusão: ele continua sendo a verdade. Manter o
    // tombstone esconderia localmente, para sempre, uma chave que existe lá.
    expect(tombstoneMaisNovoQue('nr13_livro_VP01', '2020-01-01T00:00:00.000Z')).toBe(false);
    expect(await listarTudo<unknown>(ORG, 'tombstones')).toHaveLength(0);
  });

  it('recusa de um `set` não mexe em tombstone nenhum', async () => {
    await registrarTombstone('nr13_outro', 1);
    rpc.mockRejectedValue(new Error(MENSAGEM_LIVRO));
    await pendenciaSet('nr13_livro_VP01', '{}', 4);
    await drenar();

    expect(tombstoneMaisNovoQue('nr13_outro', '2020-01-01T00:00:00.000Z')).toBe(true);
  });
});
