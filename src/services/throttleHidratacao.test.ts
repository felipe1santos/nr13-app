/**
 * Fase 9 · 9D.3 — o throttle de `lerTudo()`, que a v2 perdeu.
 *
 * A v1 tinha uma janela de 60 s e o comentário dela dizia o motivo: sem janela,
 * o app re-baixava o banco inteiro a cada clique no menu — a "demora do banco".
 * A v2 nasceu sem ela, e `listarEquipamentos()` chama `lerTudo()` em todo
 * `useEffect`: quatro telas do sistema o fazem, e a Fase 8 mediu o resultado.
 *
 * Duas diferenças que os testes abaixo travam, e as duas seriam sumiço de dado
 * se copiadas da v1 sem pensar:
 *
 *   · dentro da janela a v1 devolvia `{}`. Na v2 o retorno é o SNAPSHOT — uma
 *     tela que recebesse `{}` concluiria "conta vazia";
 *   · a fila NÃO é throttled. Fila vazia não faz requisição nenhuma, e
 *     trabalho de campo parado no aparelho é o defeito mais caro do sistema.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '44444444-4444-4444-4444-444444444444';

const SERVIDOR: Array<Record<string, unknown>> = [];
let consultas = 0;

vi.mock('./supabase', () => {
  const construir = () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      gt: () => api,
      in: () => api,
      like: () => api,
      order: () => api,
      range: async (inicio: number, fim: number) => {
        if (inicio === 0) consultas++;
        return { data: SERVIDOR.slice(inicio, fim + 1), error: null };
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
import { zerarMemoria, definirOrg } from './cacheLocal';
import * as sync from './sync';
import {
  CHAVE_HIDRATACAO_COMPLETA,
  lerTudo,
  limparCacheDados,
  zerarThrottleHidratacao,
} from './storageV2';

beforeEach(async () => {
  zerarMemoria();
  sync.zerarFilaMemoria();
  sync.zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  consultas = 0;
  SERVIDOR.length = 0;
  zerarThrottleHidratacao();
  definirOrg(ORG);
});

describe('throttle de lerTudo', () => {
  it('cinco chamadas seguidas fazem UMA paginação', async () => {
    SERVIDOR.push({
      chave: 'nr13_info_A',
      valor: '{"tag":"A"}',
      versao: 1,
      atualizado_em: '2026-08-24T10:00:00.000Z',
      dispositivo: 'servidor',
      deletado_em: null,
    });

    for (let i = 0; i < 5; i++) await lerTudo();

    expect(consultas).toBe(1);
  });

  it('dentro da janela devolve o SNAPSHOT, nunca vazio', async () => {
    SERVIDOR.push({
      chave: 'nr13_info_A',
      valor: '{"tag":"A"}',
      versao: 1,
      atualizado_em: '2026-08-24T10:00:00.000Z',
      dispositivo: 'servidor',
      deletado_em: null,
    });

    await lerTudo();
    const segundo = await lerTudo();

    expect(consultas).toBe(1);
    expect(segundo['nr13_info_A']).toBe('{"tag":"A"}');
  });

  it('a fila continua drenando dentro da janela', async () => {
    await lerTudo();
    const drenar = vi.spyOn(sync, 'drenar');

    await lerTudo();

    expect(consultas).toBe(1);
    expect(drenar).toHaveBeenCalled();
    drenar.mockRestore();
  });

  it('a chave de emergência passa POR CIMA da janela', async () => {
    // `nr13_hidratacao_completa` é alavanca manual, puxada no console do
    // aparelho afetado quando algo ficou para trás. Quem a puxa quer a
    // organização inteira AGORA — esperar a janela seria a alavanca não
    // funcionar, e o conserto viraria um deploy.
    await lerTudo();
    localStorage.setItem(CHAVE_HIDRATACAO_COMPLETA, '1');

    await lerTudo();

    expect(consultas).toBe(2);
  });

  it('trocar de conta zera a janela', async () => {
    await lerTudo();
    limparCacheDados();
    definirOrg(ORG);

    await lerTudo();

    // Sem isto, o primeiro `lerTudo` da conta NOVA cairia na janela da conta
    // anterior e serviria um cache que não é dela.
    expect(consultas).toBe(2);
  });
});
