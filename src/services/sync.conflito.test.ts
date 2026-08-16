import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Conflito, do começo ao fim.
 *
 * A pré-condição desta fase (docs/medicoes/2026-08-16-fase3-mutationid.md) mediu
 * contra o banco: a tentativa que termina em conflito FICA REGISTRADA no
 * servidor, e reenviar o mesmo `mutationId` devolve `repetido` carregando o
 * valor do SERVIDOR — sem gravar nada. Como `enviarItem` trata `repetido` como
 * sucesso, "Tentar de novo" num item em conflito hoje apaga a edição do usuário
 * em silêncio.
 *
 * Estes testes fecham as duas pontas: o botão não pode mais fazer isso, e o
 * usuário passa a ter como decidir.
 */

const ORG = '55555555-5555-5555-5555-555555555555';
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

import { fecharDb, apagarDb, listarTudo, aplicarAtomico } from './db';
import {
  definirOrg,
  gravarAtomico,
  obterRegistro,
  zerarMemoria,
  hidratarDoDisco,
  chaves,
  type Registro,
} from './cacheLocal';
import {
  montarItem,
  registrarNaMemoria,
  listarFila,
  itemDaChave,
  drenar,
  tentarNovamente,
  listarConflitos,
  conflitoDaChave,
  carregarConflitosDoDisco,
  resolverMantendoLocal,
  resolverUsandoServidor,
  descartarSubstituida,
  migrarConflitosAntigos,
  zerarFilaMemoria,
  zerarConflitosMemoria,
  zerarTombstonesMemoria,
  zerarThrottleSync,
  type ItemFila,
  type RegistroConflito,
} from './sync';

const CHAVE = 'nr13_info_VASO-1';
const LOCAL = '{"origem":"celular-em-campo"}';
const SERVIDOR = '{"origem":"escritorio"}';

const reg = (valor: string, versao: number, dispositivo = 'dev-local'): Registro => ({
  valor,
  versao,
  atualizadoEm: '2026-08-16T10:00:00.000Z',
  dispositivo,
});

const respostaConflito = {
  data: {
    status: 'conflito',
    versao: 7,
    valor: SERVIDOR,
    atualizado_em: '2026-08-16T11:00:00.000Z',
    dispositivo: 'dev-escritorio',
  },
  error: null,
};

/** Põe uma pendência local para a chave, como `storageV2.salvar` faz. */
async function pendencia(valor = LOCAL, versaoServidor = 6) {
  const item = montarItem('set', CHAVE, valor, versaoServidor);
  await gravarAtomico([{ chave: CHAVE, registro: reg(valor, versaoServidor + 1) }], [item]);
  registrarNaMemoria(item);
  return item;
}

/** Deixa a chave em CONFLITO: pendência local + servidor divergente. */
async function emConflito() {
  const item = await pendencia();
  rpc.mockResolvedValue(respostaConflito);
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

describe('a cópia do conflito sai de `dados`', () => {
  it('vai para a store `conflitos`, com a chave ORIGINAL', async () => {
    await emConflito();

    const guardados = await listarTudo<RegistroConflito>(ORG, 'conflitos');
    expect(guardados).toHaveLength(1);
    expect(guardados[0].chave).toBe(CHAVE);
    expect(guardados[0].valor.remoto?.valor).toBe(SERVIDOR);
    expect(guardados[0].valor.local?.valor).toBe(LOCAL);
  });

  it('não polui a store `dados` com `nr13_conflito_*`', async () => {
    await emConflito();

    const dados = await listarTudo<unknown>(ORG, 'dados');
    expect(dados.filter((d) => d.chave.startsWith('nr13_conflito_'))).toEqual([]);
  });

  it('não entra no Map na hidratação', async () => {
    await emConflito();
    zerarMemoria();
    await hidratarDoDisco();

    expect(chaves().filter((c) => c.startsWith('nr13_conflito_'))).toEqual([]);
    expect(chaves()).toContain(CHAVE); // o dado do usuário continua lá
  });

  it('DUAS detecções do mesmo conflito produzem UMA cópia, não duas', async () => {
    // Era o vazamento: `nr13_conflito_<chave>__<Date.now()>` gravava uma por
    // tentativa, sem teto, e todas iam para o Map.
    await emConflito();
    await drenar();
    await drenar();

    expect(await listarTudo<unknown>(ORG, 'conflitos')).toHaveLength(1);
  });

  it('sobrevive a fechar o navegador', async () => {
    await emConflito();
    zerarConflitosMemoria();
    expect(listarConflitos()).toHaveLength(0);

    await carregarConflitosDoDisco();
    expect(conflitoDaChave(CHAVE)?.remoto?.valor).toBe(SERVIDOR);
  });
});

describe('o defeito ativo: retentar item em conflito', () => {
  it('`tentarNovamente` RECUSA item em conflito — não chama a RPC', async () => {
    const item = await emConflito();
    rpc.mockClear();

    await tentarNovamente(item.mutationId);

    // Medido contra o banco: o reenvio devolveria `repetido` com o valor do
    // SERVIDOR, e `enviarItem` removeria o item da fila reportando sucesso —
    // apagando a edição do usuário sem aviso.
    expect(rpc).not.toHaveBeenCalled();
    expect(itemDaChave(CHAVE)?.estado).toBe('conflito');
    expect(obterRegistro(CHAVE)?.valor).toBe(LOCAL);
  });

  it('`drenar` continua pulando conflito (aguarda decisão)', async () => {
    await emConflito();
    rpc.mockClear();

    expect(await drenar()).toEqual({ enviados: 0, falhas: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('resolver mantendo a minha versão', () => {
  it('cria UMA mutação nova, com resolveDe e a versão do SERVIDOR como base', async () => {
    const original = await emConflito();

    await resolverMantendoLocal(CHAVE);

    const fila = listarFila();
    expect(fila).toHaveLength(1);
    const novo = fila[0];
    expect(novo.mutationId).not.toBe(original.mutationId); // id NOVO (Caso B)
    expect(novo.resolveDe).toBe(original.mutationId); // vínculo de auditoria
    expect(novo.versaoBase).toBe(7); // a versão que o SERVIDOR tinha
    expect(novo.valor).toBe(LOCAL);
    expect(novo.estado).toBe('aguardando');
  });

  it('a troca é UMA transação: o original nunca coexiste com o novo no disco', async () => {
    await emConflito();
    await resolverMantendoLocal(CHAVE);

    const noDisco = await listarTudo<ItemFila>(ORG, 'fila');
    expect(noDisco).toHaveLength(1);
    expect(noDisco[0].valor.resolveDe).toBeTruthy();
  });

  it('a resolução SOBE e o item sai da fila', async () => {
    await emConflito();
    await resolverMantendoLocal(CHAVE);

    rpc.mockClear(); // a chamada que gerou o conflito já está no histórico
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 8 }, error: null });
    expect(await drenar()).toEqual({ enviados: 1, falhas: 0 });

    expect(listarFila()).toHaveLength(0);
    expect(obterRegistro(CHAVE)?.valor).toBe(LOCAL);
    expect(obterRegistro(CHAVE)?.versao).toBe(8);
    // E a RPC recebeu a versão do servidor como base — sem isso ela recusaria
    // para sempre.
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_versao_esperada: 7, p_valor: LOCAL });
  });

  it('a versão do servidor continua recuperável, marcada como substituída', async () => {
    await emConflito();
    await resolverMantendoLocal(CHAVE);

    const c = conflitoDaChave(CHAVE)!;
    expect(c.resolucao?.escolha).toBe('local');
    expect(c.remoto?.valor).toBe(SERVIDOR); // nada foi descartado
    expect(listarConflitos().filter((x) => !x.resolucao)).toHaveLength(0); // sai da lista "a decidir"
  });

  it('falha de rede na resolução não cria um terceiro item nem ressuscita o original', async () => {
    const original = await emConflito();
    await resolverMantendoLocal(CHAVE);

    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await drenar();
    await drenar();

    const fila = listarFila();
    expect(fila).toHaveLength(1);
    expect(fila[0].mutationId).not.toBe(original.mutationId);
    expect(fila[0].erro?.categoria).toBe('offline');
  });

  it('resolver de novo o que já foi resolvido é no-op', async () => {
    await emConflito();
    await resolverMantendoLocal(CHAVE);
    await resolverMantendoLocal(CHAVE);

    expect(listarFila()).toHaveLength(1);
  });
});

describe('resolver usando a versão do servidor', () => {
  it('aplica o remoto no cache e tira o item da fila', async () => {
    await emConflito();

    await resolverUsandoServidor(CHAVE);

    expect(obterRegistro(CHAVE)?.valor).toBe(SERVIDOR);
    expect(obterRegistro(CHAVE)?.versao).toBe(7);
    expect(listarFila()).toHaveLength(0);
  });

  it('funciona OFFLINE: não chama a RPC', async () => {
    await emConflito();
    rpc.mockClear();

    await resolverUsandoServidor(CHAVE);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('guarda o valor LOCAL como substituído — escolher o servidor não descarta em silêncio', async () => {
    await emConflito();

    await resolverUsandoServidor(CHAVE);

    const c = conflitoDaChave(CHAVE)!;
    expect(c.resolucao?.escolha).toBe('servidor');
    expect(c.local?.valor).toBe(LOCAL);
  });
});

describe('descartar a versão substituída é ação do usuário', () => {
  it('remove o registro da store e da memória', async () => {
    await emConflito();
    await resolverUsandoServidor(CHAVE);

    await descartarSubstituida(CHAVE);

    expect(conflitoDaChave(CHAVE)).toBeNull();
    expect(await listarTudo<unknown>(ORG, 'conflitos')).toEqual([]);
  });

  it('NÃO descarta conflito ainda não decidido', async () => {
    await emConflito();

    await descartarSubstituida(CHAVE);

    expect(conflitoDaChave(CHAVE)).not.toBeNull();
    expect(itemDaChave(CHAVE)?.estado).toBe('conflito');
  });
});

describe('migração das cópias antigas', () => {
  const antiga = (ts: number, valor: string) => ({
    chave: `nr13_conflito_${CHAVE}__${ts}`,
    valor: reg(valor, 5, 'dev-antigo'),
  });

  it('move de `dados` para `conflitos`, ficando a MAIS RECENTE', async () => {
    for (const c of [antiga(1000, '{"v":"velha"}'), antiga(2000, '{"v":"nova"}')]) {
      await aplicarAtomico(ORG, [{ store: 'dados', acao: 'put', chave: c.chave, valor: c.valor }]);
    }

    await migrarConflitosAntigos();

    const guardados = await listarTudo<RegistroConflito>(ORG, 'conflitos');
    expect(guardados).toHaveLength(1);
    expect(guardados[0].valor.remoto?.valor).toBe('{"v":"nova"}');
    const dados = await listarTudo<unknown>(ORG, 'dados');
    expect(dados.filter((d) => d.chave.startsWith('nr13_conflito_'))).toEqual([]);
  });

  it('é idempotente: rodar duas vezes dá o mesmo resultado', async () => {
    await aplicarAtomico(ORG, [
      { store: 'dados', acao: 'put', chave: antiga(1000, '{"v":1}').chave, valor: antiga(1000, '{"v":1}').valor },
    ]);

    await migrarConflitosAntigos();
    const depoisDaPrimeira = await listarTudo<RegistroConflito>(ORG, 'conflitos');
    await migrarConflitosAntigos();

    expect(await listarTudo<RegistroConflito>(ORG, 'conflitos')).toEqual(depoisDaPrimeira);
  });

  it('não apaga a origem sem ter gravado o destino', async () => {
    // Sem cópia antiga nenhuma, a migração não pode tocar em nada.
    await gravarAtomico([{ chave: CHAVE, registro: reg(LOCAL, 1) }]);

    await migrarConflitosAntigos();

    expect(obterRegistro(CHAVE)?.valor).toBe(LOCAL);
    expect(await listarTudo<unknown>(ORG, 'conflitos')).toEqual([]);
  });

  it('não sobrescreve conflito novo já existente para a mesma chave', async () => {
    await emConflito();
    await aplicarAtomico(ORG, [
      { store: 'dados', acao: 'put', chave: antiga(1, '{"v":"antiga"}').chave, valor: antiga(1, '{"v":"antiga"}').valor },
    ]);

    await migrarConflitosAntigos();

    expect(conflitoDaChave(CHAVE)?.remoto?.valor).toBe(SERVIDOR);
  });
});
