import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: { status: 'aplicado', versao: 1 }, error: null })) },
  escopoStorageAtual: vi.fn(async () => null),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import * as db from './db';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { adquirirTrava, donoAtual, zerarPosseEmMemoria, type ContextoMontagem } from './palcoTrava';
import { materializar, zerarMontagemEmMemoria } from './palco';
import { armazenamentoV2Ativo, definirArmazenamentoV2, zerarFlagEmMemoria } from './flag';
import {
  trocarOrganizacao,
  encerrarSessao,
  podeSairSemPerder,
  apagarBancoLocal,
  estadoSessao,
  bloqueadoParaUso,
  erroDaSessao,
  zerarEstadoSessao,
} from './sessaoArmazenamento';
import { ler, listarChavesComPrefixo, salvar, ErroTrocandoConta } from './storageV2';

const ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const reg = (valor: string, versao = 1) => ({
  valor,
  versao,
  atualizadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'd1',
});

const ctxPalco = (tabId: string): ContextoMontagem => ({
  orgId: ORG_A,
  tabId,
  relatorioId: 'rel-1',
  tag: 'ACA 2040',
  nonce: `n-${tabId}`,
});

beforeEach(async () => {
  cache.zerarMemoria();
  sync.zerarFilaMemoria();
  sync.zerarTombstonesMemoria();
  zerarPosseEmMemoria();
  zerarMontagemEmMemoria();
  zerarEstadoSessao();
  zerarFlagEmMemoria();
  db.fecharDb();
  await db.apagarDb(ORG_A);
  await db.apagarDb(ORG_B);
  localStorage.clear();
});

async function popular(org: string, chaves: string[]): Promise<void> {
  cache.definirOrg(org);
  await cache.gravarAtomico(chaves.map((c) => ({ chave: c, registro: reg(`{"de":"${org}"}`) })));
}

describe('troca de organização — isolamento', () => {
  it('nenhuma chave de A é visível em B', async () => {
    await popular(ORG_A, ['nr13_info_A1', 'nr13_info_A2']);
    expect(cache.chavesComPrefixo('nr13_info_')).toHaveLength(2);

    expect(await trocarOrganizacao(ORG_B)).toEqual({ ok: true });

    expect(cache.chavesComPrefixo('nr13_info_')).toEqual([]);
    expect(cache.obterRegistro('nr13_info_A1')).toBeNull();
    expect(cache.orgAtual()).toBe(ORG_B);
  });

  it('troca rápida A -> B -> A recupera os dados de A do disco', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    await popular(ORG_B, ['nr13_info_B1']);

    cache.definirOrg(ORG_A);
    await trocarOrganizacao(ORG_B);
    expect(cache.chavesComPrefixo('nr13_info_')).toEqual(['nr13_info_B1']);

    await trocarOrganizacao(ORG_A);
    expect(cache.chavesComPrefixo('nr13_info_')).toEqual(['nr13_info_A1']);
  });

  it('durante a transição as telas ficam bloqueadas e ler() não devolve nada', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    definirArmazenamentoV2(true);

    // Intercepta a hidratação para observar o meio da troca.
    const original = cache.hidratarDoDisco;
    let durante: { bloqueado: boolean; leitura: unknown; lista: string[] } | null = null;
    const espia = vi.spyOn(cache, 'hidratarDoDisco').mockImplementation(async () => {
      durante = {
        bloqueado: bloqueadoParaUso(),
        leitura: ler('nr13_info_A1'),
        lista: listarChavesComPrefixo('nr13_info_'),
      };
      return original.call(cache);
    });

    await trocarOrganizacao(ORG_B);
    espia.mockRestore();

    expect(durante!.bloqueado).toBe(true);
    expect(durante!.leitura).toBeNull(); // nem por um frame
    expect(durante!.lista).toEqual([]);
  });

  it('gravar durante a troca é recusado', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    definirArmazenamentoV2(true);

    const original = cache.hidratarDoDisco;
    let erro: unknown = null;
    const espia = vi.spyOn(cache, 'hidratarDoDisco').mockImplementation(async () => {
      await salvar('nr13_info_X', { x: 1 }).catch((e) => {
        erro = e;
      });
      return original.call(cache);
    });

    await trocarOrganizacao(ORG_B);
    espia.mockRestore();

    expect(erro).toBeInstanceOf(ErroTrocandoConta);
  });

  it('fila e tombstones da anterior somem da MEMÓRIA (o disco continua)', async () => {
    cache.definirOrg(ORG_A);
    const item = sync.montarItem('set', 'nr13_info_A1', '{}', 0);
    await cache.gravarAtomico([{ chave: 'nr13_info_A1', registro: reg('{}') }], [item]);
    sync.registrarNaMemoria(item);
    await sync.registrarTombstone('nr13_info_A9', 3);

    await trocarOrganizacao(ORG_B);
    expect(sync.listarFila()).toEqual([]);
    expect(sync.tombstoneMaisNovoQue('nr13_info_A9', '2020-01-01T00:00:00.000Z')).toBe(false);

    // Voltando para A, a fila é recuperada do IndexedDB: nada foi perdido.
    await trocarOrganizacao(ORG_A);
    expect(sync.listarFila()).toHaveLength(1);
  });

  it('o palco desta aba é liberado na troca', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    const c = ctxPalco('aba-1');
    await adquirirTrava(c);
    materializar(c, [{ chave: 'nr13_info_A1', valor: '{"de":"A"}' }]);
    expect(donoAtual()).not.toBeNull();

    await trocarOrganizacao(ORG_B);

    expect(donoAtual()).toBeNull();
    expect(localStorage.getItem('nr13_info_A1')).toBeNull();
  });

  it('a flag é recalculada: a decisão da conta anterior não é reaproveitada', async () => {
    definirArmazenamentoV2(true);
    expect(armazenamentoV2Ativo()).toBe(true);

    // A nova conta não tem a flag: o valor memoizado precisa ser descartado.
    await trocarOrganizacao(ORG_B);
    localStorage.removeItem('nr13_armazenamento_v2');

    expect(armazenamentoV2Ativo()).toBe(false);
  });
});

describe('troca de organização — falha na hidratação', () => {
  it('mantém bloqueado, mostra o erro e NÃO restaura a organização anterior', async () => {
    await popular(ORG_A, ['nr13_info_A1']);

    const espia = vi.spyOn(cache, 'hidratarDoDisco').mockRejectedValue(new Error('IndexedDB caiu'));
    const r = await trocarOrganizacao(ORG_B);
    espia.mockRestore();

    expect(r.ok).toBe(false);
    expect(estadoSessao()).toBe('falhou');
    expect(bloqueadoParaUso()).toBe(true);
    expect(erroDaSessao()?.detalhe.mensagemOriginal).toBe('IndexedDB caiu');

    // Dado de A não voltou: tela travada com erro é melhor que tela mentindo.
    expect(cache.chavesComPrefixo('nr13_info_')).toEqual([]);
    expect(cache.orgAtual()).toBeNull();
  });

  it('tentar de novo depois da falha funciona', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    const espia = vi.spyOn(cache, 'hidratarDoDisco').mockRejectedValueOnce(new Error('caiu'));
    await trocarOrganizacao(ORG_B);
    espia.mockRestore();

    expect(await trocarOrganizacao(ORG_B)).toEqual({ ok: true });
    expect(bloqueadoParaUso()).toBe(false);
  });
});

describe('logout', () => {
  it('sem pendências: sai, limpa memória e PRESERVA o banco local', async () => {
    await popular(ORG_A, ['nr13_info_A1']);

    expect(podeSairSemPerder()).toEqual({ pode: true });
    const r = await encerrarSessao();

    expect(r).toEqual({ ok: true, bancoPreservado: true });
    expect(cache.chavesComPrefixo('nr13_info_')).toEqual([]);
    expect(cache.orgAtual()).toBeNull();

    // O banco continua lá: reabrir a conta traz tudo de volta.
    const linhas = await db.listarTudo(ORG_A, 'dados');
    expect(linhas).toHaveLength(1);
  });

  it('com pendências: BLOQUEIA e informa quantas e desde quando', async () => {
    cache.definirOrg(ORG_A);
    const item = sync.montarItem('set', 'nr13_info_A1', '{}', 0);
    await cache.gravarAtomico([{ chave: 'nr13_info_A1', registro: reg('{}') }], [item]);
    sync.registrarNaMemoria(item);

    const saida = podeSairSemPerder();
    expect(saida.pode).toBe(false);
    if (!saida.pode) {
      expect(saida.pendencias).toBe(1);
      expect(saida.maisAntiga).toBe(item.criadoEm);
    }

    const r = await encerrarSessao();
    expect(r).toMatchObject({ ok: false, motivo: 'pendencias', pendencias: 1 });
    expect(cache.orgAtual()).toBe(ORG_A); // não saiu
  });

  it('confirmação explícita permite sair E preserva o banco', async () => {
    cache.definirOrg(ORG_A);
    const item = sync.montarItem('set', 'nr13_info_A1', '{}', 0);
    await cache.gravarAtomico([{ chave: 'nr13_info_A1', registro: reg('{}') }], [item]);
    sync.registrarNaMemoria(item);

    const r = await encerrarSessao({ confirmouPendencias: true });
    expect(r).toEqual({ ok: true, bancoPreservado: true });

    const fila = await db.listarTudo(ORG_A, 'fila');
    expect(fila).toHaveLength(1); // pendência intacta no disco
  });

  it('"Sincronizar agora" drena antes e então a saída é livre', async () => {
    cache.definirOrg(ORG_A);
    const item = sync.montarItem('set', 'nr13_info_A1', '{}', 0);
    await cache.gravarAtomico([{ chave: 'nr13_info_A1', registro: reg('{}') }], [item]);
    sync.registrarNaMemoria(item);

    const r = await encerrarSessao({ sincronizarAntes: true });
    expect(r).toEqual({ ok: true, bancoPreservado: true });
  });

  it('palco aberto é liberado no logout', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    const c = ctxPalco('aba-1');
    await adquirirTrava(c);
    materializar(c, [{ chave: 'nr13_info_A1', valor: '{"de":"A"}' }]);

    await encerrarSessao();
    expect(donoAtual()).toBeNull();
    expect(localStorage.getItem('nr13_info_A1')).toBeNull();
  });

  it('a conexão do IndexedDB anterior é fechada', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    const espia = vi.spyOn(db, 'fecharDb');
    await encerrarSessao();
    expect(espia).toHaveBeenCalled();
    espia.mockRestore();
  });
});

describe('apagar o banco local — ação explícita e separada', () => {
  it('NÃO acontece como consequência do logout', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    await encerrarSessao();
    expect(await db.listarTudo(ORG_A, 'dados')).toHaveLength(1);
  });

  it('recusa apagar enquanto houver pendência', async () => {
    cache.definirOrg(ORG_A);
    const item = sync.montarItem('set', 'nr13_info_A1', '{}', 0);
    await cache.gravarAtomico([{ chave: 'nr13_info_A1', registro: reg('{}') }], [item]);
    sync.registrarNaMemoria(item);

    expect(await apagarBancoLocal(ORG_A)).toEqual({ ok: false, motivo: 'pendencias' });
    expect(await db.listarTudo(ORG_A, 'dados')).toHaveLength(1);
  });

  it('apaga quando explicitamente autorizado', async () => {
    await popular(ORG_A, ['nr13_info_A1']);
    expect(await apagarBancoLocal(ORG_A)).toEqual({ ok: true });
    expect(await db.listarTudo(ORG_A, 'dados')).toHaveLength(0);
  });
});

describe('duas abas', () => {
  it('mesma organização: gravação de uma chega no Map da outra', async () => {
    cache.definirOrg(ORG_A);
    const outraAba = new BroadcastChannel(`nr13_cache_${ORG_A}`);
    outraAba.postMessage({ tipo: 'gravado', chave: 'nr13_info_DA_OUTRA', registro: reg('{}') });

    for (let i = 0; i < 50 && !cache.obterRegistro('nr13_info_DA_OUTRA'); i++) {
      await new Promise((r) => setImmediate(r));
    }
    expect(cache.obterRegistro('nr13_info_DA_OUTRA')).not.toBeNull();
    outraAba.close();
  });

  it('organizações diferentes: nada vaza entre os canais', async () => {
    cache.definirOrg(ORG_A);
    const abaDeOutraOrg = new BroadcastChannel(`nr13_cache_${ORG_B}`);
    abaDeOutraOrg.postMessage({ tipo: 'gravado', chave: 'nr13_info_VAZOU', registro: reg('{}') });

    await new Promise((r) => setImmediate(r));
    expect(cache.obterRegistro('nr13_info_VAZOU')).toBeNull();
    abaDeOutraOrg.close();
  });
});
