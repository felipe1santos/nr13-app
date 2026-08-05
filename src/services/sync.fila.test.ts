import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
  escopoStorageAtual: vi.fn(),
  idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb, obter } from './db';
import { definirOrg, gravarAtomico, zerarMemoria, type Registro } from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  itemDaChave,
  removerDaFila,
  marcarEstado,
  carregarFilaDoDisco,
  zerarFilaMemoria,
  idDispositivo,
  type ItemFila,
} from './sync';

const ORG = '11111111-1111-1111-1111-111111111111';
const reg = (valor: string, versao = 1): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'd1',
});

/** Caminho real: monta o item, grava dado+fila atomicamente, registra na memória. */
async function salvarComFila(chave: string, valor: string, versaoServidor: number): Promise<ItemFila> {
  const item = montarItem('set', chave, valor, versaoServidor);
  const anterior = itemDaChave(chave);
  await gravarAtomico([{ chave, registro: reg(valor, versaoServidor + 1) }], [item]);
  if (anterior && anterior.mutationId !== item.mutationId) await removerDaFila(anterior.mutationId);
  registrarNaMemoria(item);
  return item;
}

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
});

describe('sync — montagem do item', () => {
  it('item novo nasce aguardando, com dispositivo e versão-base do servidor', () => {
    const item = montarItem('set', 'nr13_info_A', '{"a":1}', 4);
    expect(item.estado).toBe('aguardando');
    expect(item.versaoBase).toBe(4);
    expect(item.op).toBe('set');
    expect(item.tentativas).toBe(0);
    expect(item.dispositivo).toBe(idDispositivo());
    expect(item.mutationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('idDispositivo é estável entre chamadas e sobrevive no localStorage', () => {
    const a = idDispositivo();
    expect(idDispositivo()).toBe(a);
    expect(localStorage.getItem('nr13_dispositivo_id')).toBe(a);
  });
});

describe('sync — versão-base preservada na condensação', () => {
  it('condensar autosaves NÃO avança a versaoBase: o servidor segue na antiga', async () => {
    // O servidor está na versão 4. Três autosaves seguidos, sem nenhum subir.
    await salvarComFila('nr13_form_A', '{"v":1}', 4);
    await salvarComFila('nr13_form_A', '{"v":2}', 5);
    await salvarComFila('nr13_form_A', '{"v":3}', 6);

    const item = itemDaChave('nr13_form_A')!;
    expect(listarFila()).toHaveLength(1);
    expect(item.versaoBase).toBe(4); // a ORIGINAL, não a 6
    expect(item.valor).toBe('{"v":3}'); // com o conteúdo mais recente
  });

  it('sem preservar, a RPC recusaria para sempre — a versaoBase precisa casar com o servidor', async () => {
    await salvarComFila('nr13_form_A', '{"v":1}', 4);
    await salvarComFila('nr13_form_A', '{"v":2}', 5);
    expect(itemDaChave('nr13_form_A')!.versaoBase).not.toBe(5);
  });

  it('criadoEm também é o da primeira edição, não o da última', async () => {
    const primeiro = await salvarComFila('nr13_form_A', '{"v":1}', 4);
    await salvarComFila('nr13_form_A', '{"v":2}', 5);
    expect(itemDaChave('nr13_form_A')!.criadoEm).toBe(primeiro.criadoEm);
  });

  it('mutationId é PRESERVADO quando op e valor são idênticos', async () => {
    const a = await salvarComFila('nr13_form_A', '{"v":1}', 4);
    const b = await salvarComFila('nr13_form_A', '{"v":1}', 4);
    expect(b.mutationId).toBe(a.mutationId);
    expect(listarFila()).toHaveLength(1);
  });

  it('mutationId é NOVO quando o valor muda', async () => {
    const a = await salvarComFila('nr13_form_A', '{"v":1}', 4);
    const b = await salvarComFila('nr13_form_A', '{"v":2}', 5);
    expect(b.mutationId).not.toBe(a.mutationId);
    expect(listarFila()).toHaveLength(1);
  });

  it('tentativas acumuladas são preservadas quando o conteúdo é idêntico', async () => {
    const a = await salvarComFila('nr13_form_A', '{"v":1}', 4);
    a.tentativas = 3;
    const b = montarItem('set', 'nr13_form_A', '{"v":1}', 4);
    expect(b.tentativas).toBe(3);
  });

  it('del depois de set deixa só o del, com a versão-base original', async () => {
    await salvarComFila('nr13_form_A', '{"v":1}', 4);
    const del = montarItem('del', 'nr13_form_A', undefined, 9);
    registrarNaMemoria(del);
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_form_A')!.op).toBe('del');
    expect(itemDaChave('nr13_form_A')!.versaoBase).toBe(4);
  });
});

describe('sync — durabilidade da fila', () => {
  it('sobrevive a fechar o navegador (recarrega do IndexedDB, sem sleep)', async () => {
    await salvarComFila('nr13_info_A', '{"tag":"A"}', 0);
    expect(await obter(ORG, 'fila', itemDaChave('nr13_info_A')!.mutationId)).not.toBeNull();

    zerarFilaMemoria();
    expect(listarFila()).toHaveLength(0);

    await carregarFilaDoDisco();
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });

  it('removerDaFila tira da memória e do disco', async () => {
    const item = await salvarComFila('nr13_info_A', '{}', 0);
    await removerDaFila(item.mutationId);
    expect(listarFila()).toHaveLength(0);
    expect(await obter(ORG, 'fila', item.mutationId)).toBeNull();
  });

  it('itemDaChave devolve null para chave sem pendência', () => {
    expect(itemDaChave('nr13_info_INEXISTENTE')).toBeNull();
  });
});

describe('sync — estado e erro', () => {
  it('marcarEstado guarda o erro já traduzido, com o detalhe técnico', async () => {
    const item = await salvarComFila('nr13_info_A', '{}', 0);
    await marcarEstado(item.mutationId, 'falha_definitiva', {
      code: '42501',
      message: 'new row violates row-level security policy',
    });

    const atual = itemDaChave('nr13_info_A')!;
    expect(atual.estado).toBe('falha_definitiva');
    expect(atual.erro?.categoria).toBe('permissao');
    expect(atual.erro?.titulo).not.toContain('row-level');
    expect(atual.erro?.detalhe.mensagemOriginal).toBe('new row violates row-level security policy');
    expect(atual.erro?.detalhe.mutationId).toBe(item.mutationId);
  });

  it('marcarEstado persiste no disco', async () => {
    const item = await salvarComFila('nr13_info_A', '{}', 0);
    await marcarEstado(item.mutationId, 'conflito');
    zerarFilaMemoria();
    await carregarFilaDoDisco();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('conflito');
  });

  it('marcarEstado em mutationId inexistente é no-op, não lança', async () => {
    await expect(marcarEstado('nao-existe', 'conflito')).resolves.toBeUndefined();
  });
});
