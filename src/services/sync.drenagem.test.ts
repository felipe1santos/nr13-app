import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '11111111-1111-1111-1111-111111111111';
const rpc = vi.fn();
// Updates feitos em `profiles` (é onde mora o carimbo de ultima_sync).
const perfilUpdates: Record<string, unknown>[] = [];

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
    from: vi.fn((tabela: string) => ({
      update: vi.fn((valores: Record<string, unknown>) => ({
        eq: vi.fn(async () => {
          perfilUpdates.push({ tabela, ...valores });
          return { error: null };
        }),
      })),
    })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb, listarTudo } from './db';
import { definirOrg, gravarAtomico, obterRegistro, zerarMemoria, type Registro } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  itemDaChave,
  removerDaFila,
  drenar,
  tentarNovamente,
  registrarTombstone,
  tombstoneMaisNovoQue,
  carregarTombstonesDoDisco,
  zerarFilaMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
} from './sync';

const reg = (valor: string, versao: number): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'd1',
});

async function pendencia(chave: string, valor: string, versaoServidor: number) {
  const item = montarItem('set', chave, valor, versaoServidor);
  const anterior = itemDaChave(chave);
  await gravarAtomico([{ chave, registro: reg(valor, versaoServidor + 1) }], [item]);
  if (anterior && anterior.mutationId !== item.mutationId) await removerDaFila(anterior.mutationId);
  registrarNaMemoria(item);
  return item;
}

const ok = (versao: number) => ({ data: { status: 'aplicado', versao }, error: null });

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  rpc.mockReset();
  perfilUpdates.length = 0;
  zerarThrottleSync();
});

describe('carimbo de profiles.ultima_sync', () => {
  it('marca a sincronização quando alguma coisa realmente sobe', async () => {
    // A tela Acessos le esta coluna. Sem o carimbo ela congela na data em que a
    // organizacao saiu da v1 e passa a mentir sobre o aparelho estar sincronizando.
    rpc.mockResolvedValue(ok(2));
    await pendencia('nr13_info_A', '{}', 1);

    await drenar();
    await new Promise((r) => setTimeout(r, 0)); // o carimbo é disparado sem await

    expect(perfilUpdates).toHaveLength(1);
    expect(perfilUpdates[0].tabela).toBe('profiles');
    expect(typeof perfilUpdates[0].ultima_sync).toBe('string');
  });

  it('não carimba quando nada subiu', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await pendencia('nr13_info_A', '{}', 1);

    await drenar();
    await new Promise((r) => setTimeout(r, 0));

    expect(perfilUpdates).toEqual([]);
  });

  it('drenagem sem pendência nenhuma não gera requisição', async () => {
    await drenar();
    await new Promise((r) => setTimeout(r, 0));
    expect(perfilUpdates).toEqual([]);
  });
});

describe('drenar — sucesso', () => {
  it('aplicado: sai da fila e o Map recebe a versão do servidor', async () => {
    rpc.mockResolvedValue(ok(5));
    await pendencia('nr13_info_A', '{}', 4);

    expect(await drenar()).toEqual({ enviados: 1, falhas: 0 });
    expect(listarFila()).toHaveLength(0);
    expect(obterRegistro('nr13_info_A')?.versao).toBe(5);
  });

  it('repetido é SUCESSO: a resposta anterior se perdeu, o servidor já aplicou', async () => {
    rpc.mockResolvedValue({ data: { status: 'repetido', versao: 5 }, error: null });
    await pendencia('nr13_info_A', '{}', 4);

    expect(await drenar()).toEqual({ enviados: 1, falhas: 0 });
    expect(listarFila()).toHaveLength(0);
  });

  it('manda os parâmetros que a RPC espera, com a versão-base do item', async () => {
    rpc.mockResolvedValue(ok(5));
    const item = await pendencia('nr13_info_A', '{"x":1}', 4);
    await drenar();

    expect(rpc).toHaveBeenCalledWith('aplicar_mutacao_storage', {
      p_chave: 'nr13_info_A',
      p_mutation_id: item.mutationId,
      p_op: 'set',
      p_valor: '{"x":1}',
      p_versao_esperada: 4,
      p_dispositivo: item.dispositivo,
      p_mutado_em: item.criadoEm,
    });
  });

  it('conta tentativas a cada envio', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await pendencia('nr13_info_A', '{}', 4);
    await drenar();
    await drenar();
    expect(itemDaChave('nr13_info_A')?.tentativas).toBe(2);
  });
});

describe('drenar — nada sai da fila sem confirmação', () => {
  it('offline: item FICA na fila, com erro traduzido', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await pendencia('nr13_info_A', '{}', 4);

    expect(await drenar()).toEqual({ enviados: 0, falhas: 1 });
    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('aguardando');
    expect(item.erro?.categoria).toBe('offline');
    expect(listarFila()).toHaveLength(1);
  });

  it('erro devolvido pelo supabase-js (não lançado) também mantém na fila', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });
    await pendencia('nr13_info_A', '{}', 4);
    await drenar();
    expect(listarFila()).toHaveLength(1);
  });

  it('resposta desconhecida NÃO é tratada como sucesso', async () => {
    rpc.mockResolvedValue({ data: { status: 'coisa_nova' }, error: null });
    await pendencia('nr13_info_A', '{}', 4);
    await drenar();
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_info_A')?.estado).toBe('falha_definitiva');
  });

  it('permissão: falha_definitiva, visível e sem sumir', async () => {
    rpc.mockResolvedValue({
      data: { status: 'recusado', motivo: 'sem_permissao' },
      error: null,
    });
    await pendencia('nr13_info_A', '{}', 4);
    await drenar();

    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('falha_definitiva');
    expect(item.erro?.categoria).toBe('permissao');
    expect(item.erro?.acao?.tipo).toBe('regularizar');
  });

  it('sessão expirada aparece com a ação de entrar novamente', async () => {
    rpc.mockRejectedValue({ status: 401, message: 'JWT expired' });
    await pendencia('nr13_info_A', '{}', 4);
    await drenar();

    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('falha_definitiva');
    expect(item.erro?.acao?.tipo).toBe('entrar');
    expect(listarFila()).toHaveLength(1);
  });
});

describe('drenar — conflito preserva AS DUAS versões', () => {
  it('guarda a versão do servidor e mantém a local na fila', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'conflito',
        versao: 5,
        valor: '{"origem":"escritorio"}',
        atualizado_em: '2026-08-05T13:00:00.000Z',
        dispositivo: 'desktop-1',
      },
      error: null,
    });
    await pendencia('nr13_form_A', '{"origem":"celular"}', 4);
    await drenar();

    // A local continua no Map e na fila, marcada como conflito.
    expect(obterRegistro('nr13_form_A')?.valor).toBe('{"origem":"celular"}');
    expect(itemDaChave('nr13_form_A')?.estado).toBe('conflito');

    // A do servidor foi preservada à parte — na store `conflitos` desde a Fase 3.
    const conflitos = await listarTudo<{ remoto: Registro }>(ORG, 'conflitos');
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].valor.remoto.valor).toBe('{"origem":"escritorio"}');
    expect(conflitos[0].valor.remoto.dispositivo).toBe('desktop-1');
  });

  it('item em conflito NÃO é reenviado automaticamente na próxima drenagem', async () => {
    rpc.mockResolvedValue({
      data: { status: 'conflito', versao: 5, valor: '{"s":1}', atualizado_em: '', dispositivo: null },
      error: null,
    });
    await pendencia('nr13_form_A', '{"c":1}', 4);
    await drenar();
    rpc.mockClear();

    expect(await drenar()).toEqual({ enviados: 0, falhas: 0 });
    expect(rpc).not.toHaveBeenCalled(); // espera decisão do usuário
  });

  it('versao_obsoleta vira conflito, não sumiço: aparelho parado não ressuscita nada', async () => {
    rpc.mockResolvedValue({
      data: { status: 'recusado', motivo: 'versao_obsoleta', versao: 8 },
      error: null,
    });
    await pendencia('nr13_info_A', '{}', 3);
    await drenar();

    expect(itemDaChave('nr13_info_A')?.estado).toBe('conflito');
    expect(itemDaChave('nr13_info_A')?.erro?.categoria).toBe('obsoleto');
  });

  it('tombstone_mais_novo também vira conflito', async () => {
    rpc.mockResolvedValue({
      data: { status: 'recusado', motivo: 'tombstone_mais_novo', versao: 8 },
      error: null,
    });
    await pendencia('nr13_info_A', '{}', 3);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('conflito');
  });
});

describe('drenar — uma falha não trava as outras', () => {
  it('envia as demais mesmo com uma recusada', async () => {
    rpc
      .mockResolvedValueOnce({ data: { status: 'recusado', motivo: 'sem_permissao' }, error: null })
      .mockResolvedValueOnce(ok(2));
    await pendencia('nr13_info_A', '{}', 0);
    await pendencia('nr13_info_B', '{}', 0);

    expect(await drenar()).toEqual({ enviados: 1, falhas: 1 });
    expect(itemDaChave('nr13_info_B')).toBeNull();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('falha_definitiva');
  });
});

describe('tentarNovamente — reusa o mutationId', () => {
  it('não cria um segundo item e usa o mesmo id', async () => {
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'sem_permissao' }, error: null });
    const item = await pendencia('nr13_info_A', '{}', 4);
    await drenar();

    rpc.mockClear();
    rpc.mockResolvedValue(ok(5));
    await tentarNovamente(item.mutationId);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_mutation_id: item.mutationId });
    expect(listarFila()).toHaveLength(0);
  });

  it('falhando de novo, o item permanece na fila', async () => {
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'sem_permissao' }, error: null });
    const item = await pendencia('nr13_info_A', '{}', 4);
    await drenar();
    await tentarNovamente(item.mutationId);
    expect(listarFila()).toHaveLength(1);
  });

  it('mutationId inexistente é no-op', async () => {
    await expect(tentarNovamente('nao-existe')).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('tombstones', () => {
  it('tombstone mais novo que o servidor impede ressurreição', async () => {
    await registrarTombstone('nr13_info_A', 5);
    expect(tombstoneMaisNovoQue('nr13_info_A', '2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('servidor mais novo que o tombstone: a chave volta (foi recriada depois)', async () => {
    await registrarTombstone('nr13_info_A', 5);
    expect(tombstoneMaisNovoQue('nr13_info_A', '2099-01-01T00:00:00.000Z')).toBe(false);
  });

  it('sem tombstone nunca bloqueia', () => {
    expect(tombstoneMaisNovoQue('nr13_info_Z', '2020-01-01T00:00:00.000Z')).toBe(false);
  });

  it('data do servidor ilegível: mantém excluído (postura segura)', async () => {
    await registrarTombstone('nr13_info_A', 5);
    expect(tombstoneMaisNovoQue('nr13_info_A', 'lixo')).toBe(true);
  });

  it('sobrevive a fechar o navegador', async () => {
    await registrarTombstone('nr13_info_A', 5);
    zerarTombstonesMemoria();
    expect(tombstoneMaisNovoQue('nr13_info_A', '2020-01-01T00:00:00.000Z')).toBe(false);

    await carregarTombstonesDoDisco();
    expect(tombstoneMaisNovoQue('nr13_info_A', '2020-01-01T00:00:00.000Z')).toBe(true);
  });
});
