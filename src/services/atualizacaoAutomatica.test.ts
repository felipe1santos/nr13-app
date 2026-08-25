import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Atualização automática ao reconectar / voltar para a aba.
 *
 * A v2 já subia sozinha o que foi feito offline (`online` e `visibilitychange`
 * chamavam `sync.drenar`), mas só SUBIA. Descer — descobrir o que os OUTROS
 * aparelhos fizeram — dependia de recarregar a página, entrar de novo ou abrir
 * a lista de equipamentos, que é quem chama `lerTudo`.
 *
 * O caso real: o usuário apaga um vaso pelo celular, em campo; o computador
 * ficou aberto no escritório e continua mostrando o vaso apagado até alguém
 * recarregar.
 *
 * O cuidado é o inverso do defeito: hidratar a cada foco de aba viraria
 * requisição por distração do usuário, e trocar o dado embaixo de um documento
 * em montagem produziria folha com dado de outro equipamento.
 */

const ORG = '77777777-7777-7777-7777-777777777777';

const SERVIDOR: Array<Record<string, unknown>> = [];
function linha(chave: string, valor: string, atualizadoEm: string, deletado = false, versao = 1) {
  return {
    chave,
    valor: deletado ? null : valor,
    versao,
    atualizado_em: atualizadoEm,
    dispositivo: 'celular-em-campo',
    deletado_em: deletado ? atualizadoEm : null,
  };
}

/** Cada consulta ao servidor é contada — é o custo que o throttle protege. */
const consultas: string[] = [];

vi.mock('./supabase', () => {
  const construir = () => {
    let corte: string | null = null;
    const api = {
      select: () => api,
      eq: () => api,
      gt: (_coluna: string, valor: string) => {
        corte = valor;
        return api;
      },
      order: () => api,
      range: async (inicio: number, fim: number) => {
        const filtradas = SERVIDOR.filter((l) => !corte || String(l.atualizado_em) > corte).sort(
          (a, b) => String(a.atualizado_em).localeCompare(String(b.atualizado_em)),
        );
        if (inicio === 0) consultas.push(corte ?? '(tudo)');
        return { data: filtradas.slice(inicio, fim + 1), error: null };
      },
    };
    return api;
  };
  return {
    supabase: {
      from: () => construir(),
      rpc: vi.fn(async () => ({ data: { status: 'aplicado', versao: 2 }, error: null })),
    },
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    idUsuarioAtual: vi.fn(async () => 'user-1'),
    TABELA_STORAGE: 'app_storage',
  };
});

import { fecharDb, apagarDb } from './db';
import { zerarMemoria, definirOrg, obterRegistro } from './cacheLocal';
import { zerarFilaMemoria, zerarTombstonesMemoria } from './sync';
import {
  lerTudo,
  atualizarDoServidor,
  zerarThrottleAtualizacao,
  zerarThrottleHidratacao,
  JANELA_ATUALIZACAO_MS,
} from './storageV2';
import { CHAVE_DONO, TTL_TRAVA_MS } from './palcoTrava';

const CHAVE = 'nr13_info_VP-01';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); // só Date: falsear timers quebra o fake-indexeddb
  vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  consultas.length = 0;
  SERVIDOR.length = 0;
  definirOrg(ORG);
  zerarThrottleAtualizacao();
  zerarThrottleHidratacao();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Estado inicial: o equipamento existe nos dois lados. */
async function comEquipamento() {
  SERVIDOR.push(linha(CHAVE, '{"tag":"VP-01"}', '2026-08-19T10:00:00.000Z'));
  await lerTudo();
  expect(obterRegistro(CHAVE)).not.toBeNull();
  consultas.length = 0;
  // A hidratação acima é MONTAGEM do cenário; a janela dela não pode engolir a
  // consulta que cada teste abaixo exercita.
  zerarThrottleHidratacao();
}

describe('descobrir o que outro aparelho fez, sem recarregar', () => {
  it('aplica a exclusão feita no celular', async () => {
    await comEquipamento();

    // O celular apagou: soft delete, com `atualizado_em` mais novo.
    SERVIDOR[0] = linha(CHAVE, '', '2026-08-19T12:00:01.000Z', true);
    vi.setSystemTime(new Date('2026-08-19T12:05:00.000Z'));

    await atualizarDoServidor();

    expect(obterRegistro(CHAVE)).toBeNull();
  });

  it('aplica a edição feita no celular', async () => {
    await comEquipamento();

    // Edição real sobe a versão — é ela que autoriza sobrescrever o local.
    SERVIDOR[0] = linha(
      CHAVE,
      '{"tag":"VP-01","fabricante":"editado-em-campo"}',
      '2026-08-19T12:00:01.000Z',
      false,
      2,
    );
    vi.setSystemTime(new Date('2026-08-19T12:05:00.000Z'));

    await atualizarDoServidor();

    expect(obterRegistro(CHAVE)?.valor).toContain('editado-em-campo');
  });
});

describe('o custo: uma consulta por janela, não por foco de aba', () => {
  it('a segunda chamada dentro da janela não vai ao servidor', async () => {
    await comEquipamento();

    await atualizarDoServidor();
    expect(consultas).toHaveLength(1);

    // Usuário troca de aba três vezes em seguida.
    await atualizarDoServidor();
    await atualizarDoServidor();
    await atualizarDoServidor();

    expect(consultas).toHaveLength(1);
  });

  it('passada a janela, volta a consultar', async () => {
    await comEquipamento();
    await atualizarDoServidor();
    expect(consultas).toHaveLength(1);

    vi.setSystemTime(new Date(Date.now() + JANELA_ATUALIZACAO_MS + 1000));
    await atualizarDoServidor();

    expect(consultas).toHaveLength(2);
  });
});

describe('nunca troca o dado embaixo de um documento em montagem', () => {
  it('não consulta enquanto o palco tem dono vivo', async () => {
    await comEquipamento();

    localStorage.setItem(
      CHAVE_DONO,
      JSON.stringify({ tabId: 'outra-aba', org: ORG, expiraEm: Date.now() + TTL_TRAVA_MS }),
    );

    await atualizarDoServidor();

    expect(consultas).toEqual([]);
  });

  it('trava vencida não segura a atualização', async () => {
    await comEquipamento();

    localStorage.setItem(
      CHAVE_DONO,
      JSON.stringify({ tabId: 'aba-morta', org: ORG, expiraEm: Date.now() - 1 }),
    );

    await atualizarDoServidor();

    expect(consultas).toHaveLength(1);
  });
});
