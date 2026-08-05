import { describe, it, expect, beforeEach } from 'vitest';
import { fecharDb, apagarDb, obter } from './db';
import {
  definirOrg,
  obterRegistro,
  gravarAtomico,
  chavesComPrefixo,
  chavesDaTag,
  hidratarDoDisco,
  zerarMemoria,
  snapshot,
  aplicarRemoto,
  hidratado,
  aguardarHidratacao,
  type Registro,
} from './cacheLocal';

const ORG = '11111111-1111-1111-1111-111111111111';

const reg = (valor: string, versao = 1): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-04T12:00:00.000Z',
  dispositivo: 'd1',
});

beforeEach(async () => {
  zerarMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
});

describe('cacheLocal — atomicidade', () => {
  it('gravarAtomico só confirma depois do commit (sem sleep nenhum)', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
    expect(await obter(ORG, 'dados', 'nr13_info_A')).not.toBeNull();
  });

  it('grava dado e item de fila na MESMA transação', async () => {
    await gravarAtomico(
      [{ chave: 'nr13_info_A', registro: reg('{}') }],
      [{ mutationId: 'm1' }],
    );
    expect(await obter(ORG, 'dados', 'nr13_info_A')).not.toBeNull();
    expect(await obter(ORG, 'fila', 'm1')).not.toBeNull();
  });

  it('grava dado, fila e tombstone juntos', async () => {
    await gravarAtomico(
      [{ chave: 'nr13_info_A', remover: true }],
      [{ mutationId: 'm1' }],
      [{ chave: 'nr13_info_A', valor: { chave: 'nr13_info_A' } }],
    );
    expect(await obter(ORG, 'tombstones', 'nr13_info_A')).not.toBeNull();
  });

  it('REVERTE o Map ao valor anterior quando a transação falha', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"v":1}') }]);

    // Função não é clonável: aborta a transação inteira.
    const itemRuim = { mutationId: 'm1', fn: () => 1 } as { mutationId: string };
    await expect(
      gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"v":2}') }], [itemRuim]),
    ).rejects.toBeTruthy();

    // Sem a reversão, a tela mostraria {"v":2} para um dado que nunca foi gravado.
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"v":1}');
  });

  it('REVERTE removendo a chave quando ela não existia antes da falha', async () => {
    const itemRuim = { mutationId: 'm1', fn: () => 1 } as { mutationId: string };
    await expect(
      gravarAtomico([{ chave: 'nr13_info_NOVA', registro: reg('{}') }], [itemRuim]),
    ).rejects.toBeTruthy();
    expect(obterRegistro('nr13_info_NOVA')).toBeNull();
    expect(chavesDaTag('NOVA')).toEqual([]);
  });

  it('sem organização definida, gravar falha em vez de perder o dado em silêncio', async () => {
    definirOrg(null);
    await expect(gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{}') }])).rejects.toThrow(
      /organiza/i,
    );
  });
});

describe('cacheLocal — sem o teto de 5 MB do localStorage', () => {
  it('38 fichas convivem com 40 fotos de 200 KB', async () => {
    const gordo = 'x'.repeat(200 * 1024);
    for (let i = 0; i < 40; i++) {
      await gravarAtomico([{ chave: `nr13_fotos_T${i}`, registro: reg(gordo) }]);
    }
    for (let i = 0; i < 38; i++) {
      await gravarAtomico([{ chave: `nr13_info_T${i}`, registro: reg('{}') }]);
    }
    // No localStorage, as fotos comeriam a cota e NENHUM nr13_info_ entraria.
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(38);
  });
});

describe('cacheLocal — índice por TAG', () => {
  it('usa a tabela de famílias, não casamento por sufixo', async () => {
    await gravarAtomico([
      { chave: 'nr13_info_B', registro: reg('{}') },
      { chave: 'nr13_info_A_B', registro: reg('{}') },
      { chave: 'nr13_med_esp_B', registro: reg('{}') },
      { chave: 'nr13_minha_empresa', registro: reg('{}') },
    ]);
    expect(chavesDaTag('B').sort()).toEqual(['nr13_info_B', 'nr13_med_esp_B']);
    expect(chavesDaTag('A_B')).toEqual(['nr13_info_A_B']);
  });

  it('remover tira do Map e do índice', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{}') }]);
    await gravarAtomico([{ chave: 'nr13_info_A', remover: true }]);
    expect(obterRegistro('nr13_info_A')).toBeNull();
    expect(chavesDaTag('A')).toEqual([]);
  });

  it('chave global não entra em índice de TAG nenhum', async () => {
    await gravarAtomico([{ chave: 'nr13_minha_empresa', registro: reg('{}') }]);
    expect(chavesDaTag('empresa')).toEqual([]);
  });
});

describe('cacheLocal — hidratação do disco (reabrir offline)', () => {
  it('repovoa a memória a partir do IndexedDB', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    zerarMemoria();
    expect(obterRegistro('nr13_info_A')).toBeNull();

    expect(await hidratarDoDisco()).toBe(1);
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });

  it('reconstrói o índice por TAG na hidratação', async () => {
    await gravarAtomico([{ chave: 'nr13_med_esp_A', registro: reg('{}') }]);
    zerarMemoria();
    await hidratarDoDisco();
    expect(chavesDaTag('A')).toEqual(['nr13_med_esp_A']);
  });

  it('snapshot devolve o conteúdo inteiro do Map', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    expect(snapshot()).toEqual({ 'nr13_info_A': '{"tag":"A"}' });
  });
});

describe('cacheLocal — versão decide na hidratação', () => {
  it('linha ANTIGA do servidor NÃO sobrescreve versão local mais nova', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"local":true}', 9) }]);
    await aplicarRemoto('nr13_info_A', reg('{"servidor":true}', 4));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"local":true}');
  });

  it('linha de versão IGUAL não sobrescreve (nada mudou)', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"local":true}', 5) }]);
    await aplicarRemoto('nr13_info_A', reg('{"servidor":true}', 5));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"local":true}');
  });

  it('linha MAIS NOVA do servidor sobrescreve', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"local":true}', 4) }]);
    await aplicarRemoto('nr13_info_A', reg('{"servidor":true}', 9));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"servidor":true}');
  });

  it('chave inédita do servidor entra normalmente', async () => {
    await aplicarRemoto('nr13_info_Z', reg('{"servidor":true}', 1));
    expect(obterRegistro('nr13_info_Z')?.valor).toBe('{"servidor":true}');
  });
});

describe('cacheLocal — barreira de inicialização', () => {
  it('hidratado() é falso antes e verdadeiro depois', async () => {
    expect(hidratado()).toBe(false);
    await hidratarDoDisco();
    expect(hidratado()).toBe(true);
  });

  it('aguardarHidratacao só resolve depois da hidratação', async () => {
    let resolvida = false;
    void aguardarHidratacao().then(() => {
      resolvida = true;
    });
    await Promise.resolve();
    expect(resolvida).toBe(false);

    await hidratarDoDisco();
    await aguardarHidratacao();
    expect(resolvida).toBe(true);
  });
});

/**
 * O BroadcastChannel nativo do Node entrega de forma ASSÍNCRONA. Esperar por
 * CONDIÇÃO (e não por tempo fixo) mantém o teste determinístico: ou a condição
 * acontece em alguma volta do event loop, ou o teste falha alto dizendo isso.
 */
async function ate(condicao: () => boolean, voltas = 50): Promise<void> {
  for (let i = 0; i < voltas; i++) {
    if (condicao()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('condição não atingida depois de 50 voltas do event loop');
}

/** Uma volta do event loop, para provar AUSÊNCIA de efeito. */
const umaVolta = () => new Promise((r) => setImmediate(r));

describe('cacheLocal — duas abas', () => {
  it('gravação de outra aba chega no Map desta', async () => {
    const outraAba = new BroadcastChannel(`nr13_cache_${ORG}`);
    outraAba.postMessage({
      tipo: 'gravado',
      chave: 'nr13_info_OUTRA_ABA',
      registro: reg('{"origem":"aba2"}'),
    });

    await ate(() => obterRegistro('nr13_info_OUTRA_ABA') !== null);
    expect(obterRegistro('nr13_info_OUTRA_ABA')?.valor).toBe('{"origem":"aba2"}');
    expect(chavesDaTag('OUTRA_ABA')).toEqual(['nr13_info_OUTRA_ABA']);
    outraAba.close();
  });

  it('remoção de outra aba tira do Map desta', async () => {
    await gravarAtomico([{ chave: 'nr13_info_X', registro: reg('{}') }]);
    const outraAba = new BroadcastChannel(`nr13_cache_${ORG}`);
    outraAba.postMessage({ tipo: 'removido', chave: 'nr13_info_X' });

    await ate(() => obterRegistro('nr13_info_X') === null);
    expect(chavesDaTag('X')).toEqual([]);
    outraAba.close();
  });

  it('canal de OUTRA organização não afeta este Map', async () => {
    const outraOrg = new BroadcastChannel('nr13_cache_99999999-9999-9999-9999-999999999999');
    outraOrg.postMessage({ tipo: 'gravado', chave: 'nr13_info_VAZADA', registro: reg('{}') });

    await umaVolta();
    expect(obterRegistro('nr13_info_VAZADA')).toBeNull();
    outraOrg.close();
  });
});
