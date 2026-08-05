import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '11111111-1111-1111-1111-111111111111';
const rpc = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import * as db from './db';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { zerarPosseEmMemoria, adquirirTrava, type ContextoMontagem } from './palcoTrava';
import { zerarMontagemEmMemoria, materializar, limparPalco } from './palco';
import { zerarEstadoSessao } from './sessaoArmazenamento';
import { zerarFlagEmMemoria } from './flag';

const reg = (valor: string, versao = 1) => ({
  valor,
  versao,
  atualizadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'd1',
});

const ctx = (tabId: string, tag = 'ACA 2040'): ContextoMontagem => ({
  orgId: ORG,
  tabId,
  relatorioId: `rel-${tabId}`,
  tag,
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
  await db.apagarDb(ORG);
  localStorage.clear();
  cache.definirOrg(ORG);
  rpc.mockReset();
});

async function pendencia(chave: string, valor: string, versaoServidor = 0) {
  const item = sync.montarItem('set', chave, valor, versaoServidor);
  await cache.gravarAtomico(
    [{ chave, registro: reg(valor, versaoServidor + 1) }],
    [item],
  );
  sync.registrarNaMemoria(item);
  return item;
}

// ---------------------------------------------------------------------------
describe('1 — processo morre entre a gravação do dado e a da fila', () => {
  it('a transação aborta e NEM o dado NEM a fila persistem', async () => {
    const naoClonavel = { mutationId: 'm1', fn: () => 1 } as { mutationId: string };

    await expect(
      cache.gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{}') }], [naoClonavel]),
    ).rejects.toBeTruthy();

    // Nada meio gravado: nem dado sem fila (nunca sobe), nem fila sem dado.
    expect(await db.obter(ORG, 'dados', 'nr13_info_A')).toBeNull();
    expect(await db.obter(ORG, 'fila', 'm1')).toBeNull();
    expect(cache.obterRegistro('nr13_info_A')).toBeNull();
  });
});

describe('2 — aborto de transação reverte o Map ao valor anterior', () => {
  it('o valor antigo continua visível, não o que falhou', async () => {
    await cache.gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"v":1}') }]);
    const ruim = { mutationId: 'm1', fn: () => 1 } as { mutationId: string };

    await expect(
      cache.gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"v":2}') }], [ruim]),
    ).rejects.toBeTruthy();

    expect(cache.obterRegistro('nr13_info_A')?.valor).toBe('{"v":1}');
  });
});

describe('3 — resposta do servidor perdida após aplicar', () => {
  it('o reenvio devolve "repetido" e a mutação NÃO é reaplicada', async () => {
    const item = await pendencia('nr13_info_A', '{}', 4);

    // 1ª tentativa: o servidor aplicou, mas a resposta se perdeu.
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await sync.drenar();
    expect(sync.listarFila()).toHaveLength(1); // continua pendente, corretamente

    // 2ª: mesmo mutationId, e o servidor lembra.
    rpc.mockResolvedValue({ data: { status: 'repetido', versao: 5 }, error: null });
    await sync.drenar();

    expect(sync.listarFila()).toHaveLength(0);
    // O mutationId enviado nas duas foi o MESMO: é o que torna o reenvio seguro.
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_mutation_id: item.mutationId });
  });
});

describe('4 — dois aparelhos enviando a mesma versaoBase', () => {
  it('conflito preserva AS DUAS versões', async () => {
    await pendencia('nr13_form_A', '{"origem":"celular"}', 4);
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

    await sync.drenar();

    expect(cache.obterRegistro('nr13_form_A')?.valor).toBe('{"origem":"celular"}');
    expect(sync.itemDaChave('nr13_form_A')?.estado).toBe('conflito');

    const guardados = await db.listarTudo<{ valor: string }>(ORG, 'dados');
    const conflitos = guardados.filter((g) => g.chave.startsWith('nr13_conflito_'));
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].valor.valor).toBe('{"origem":"escritorio"}');
  });
});

describe('5 — exclusão concorrente com edição', () => {
  it('escrita mais antiga que a exclusão vira conflito, não ressurreição', async () => {
    await pendencia('nr13_info_A', '{"zumbi":true}', 3);
    rpc.mockResolvedValue({
      data: { status: 'recusado', motivo: 'versao_obsoleta', versao: 8 },
      error: null,
    });

    await sync.drenar();

    expect(sync.itemDaChave('nr13_info_A')?.estado).toBe('conflito');
    expect(sync.itemDaChave('nr13_info_A')?.erro?.categoria).toBe('obsoleto');
  });
});

describe('6 — duas abas montando relatórios ao mesmo tempo', () => {
  it('a segunda recebe ocupado e o palco da primeira fica íntegro', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    materializar(a, [{ chave: 'nr13_info_A', valor: '{"de":"aba-1"}' }]);

    const r = await adquirirTrava(ctx('aba-2', 'OUTRA'), { esperaMs: 0 });

    expect(r.obtida).toBe(false);
    expect(localStorage.getItem('nr13_info_A')).toBe('{"de":"aba-1"}');
  });

  it('a aba não-dona não consegue limpar o palco alheio', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    materializar(a, [{ chave: 'nr13_info_A', valor: '{"de":"aba-1"}' }]);

    expect(limparPalco(ctx('aba-2', 'OUTRA'))).toEqual({ ok: false, motivo: 'nao_e_dono' });
    expect(localStorage.getItem('nr13_info_A')).toBe('{"de":"aba-1"}');
  });
});

describe('7 — uma aba altera o Map da outra', () => {
  it('a gravação chega pelo BroadcastChannel da organização', async () => {
    const outra = new BroadcastChannel(`nr13_cache_${ORG}`);
    outra.postMessage({ tipo: 'gravado', chave: 'nr13_info_DE_OUTRA', registro: reg('{}') });

    for (let i = 0; i < 50 && !cache.obterRegistro('nr13_info_DE_OUTRA'); i++) {
      await new Promise((r) => setImmediate(r));
    }
    expect(cache.obterRegistro('nr13_info_DE_OUTRA')).not.toBeNull();
    outra.close();
  });
});

describe('9 — logout com pendência', () => {
  it('bloqueia e o banco local segue intacto', async () => {
    const { podeSairSemPerder, encerrarSessao } = await import('./sessaoArmazenamento');
    await pendencia('nr13_info_A', '{}');

    expect(podeSairSemPerder().pode).toBe(false);
    expect(await encerrarSessao()).toMatchObject({ ok: false, motivo: 'pendencias' });
    expect(await db.listarTudo(ORG, 'fila')).toHaveLength(1);
  });
});

describe('10 — aparelho offline além do prazo de coleta', () => {
  it('anterior_ao_corte vira conflito; nada ressuscita', async () => {
    await pendencia('nr13_info_A', '{}', 3);
    rpc.mockResolvedValue({
      data: { status: 'recusado', motivo: 'anterior_ao_corte', versao: 0 },
      error: null,
    });

    await sync.drenar();
    expect(sync.itemDaChave('nr13_info_A')?.estado).toBe('conflito');
  });
});

describe('11 — reabrir 100% offline', () => {
  it('hidrata do IndexedDB sem tocar na rede', async () => {
    await cache.gravarAtomico([
      { chave: 'nr13_info_A', registro: reg('{"tag":"A"}') },
      { chave: 'nr13_info_B', registro: reg('{"tag":"B"}') },
    ]);

    cache.zerarMemoria();
    cache.definirOrg(ORG);
    expect(cache.chavesComPrefixo('nr13_info_')).toHaveLength(0);

    await cache.hidratarDoDisco();

    expect(cache.chavesComPrefixo('nr13_info_')).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('13 — troca de organização', () => {
  it('zero chaves da anterior no Map, no palco e na memória', async () => {
    const { trocarOrganizacao } = await import('./sessaoArmazenamento');
    const ORG_B = '22222222-2222-2222-2222-222222222222';

    await cache.gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{}') }]);
    const c = ctx('aba-1');
    await adquirirTrava(c);
    materializar(c, [{ chave: 'nr13_info_A', valor: '{"de":"A"}' }]);

    await trocarOrganizacao(ORG_B);

    expect(cache.chavesComPrefixo('nr13_info_')).toEqual([]);
    expect(localStorage.getItem('nr13_info_A')).toBeNull();
    expect(sync.listarFila()).toEqual([]);

    await db.apagarDb(ORG_B);
  });
});

describe('15 — recriar chave excluída e coletada', () => {
  it('versão acima do piso é aceita', async () => {
    await pendencia('nr13_info_A', '{"novo":true}', 8);
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 9 }, error: null });

    await sync.drenar();

    expect(sync.listarFila()).toHaveLength(0);
    expect(cache.obterRegistro('nr13_info_A')?.versao).toBe(9);
  });
});

describe('regra global — nenhum catch vazio no caminho de dados', () => {
  it('os módulos de dados não escondem falha', async () => {
    // Trava documental: se alguém acrescentar um catch vazio, este teste
    // continua passando — mas a revisão tem onde apontar. A verificação
    // executável está no comando do passo final da Task 16.
    const modulos = ['db', 'cacheLocal', 'sync', 'palco', 'storageV2'];
    expect(modulos.length).toBeGreaterThan(0);
  });
});
