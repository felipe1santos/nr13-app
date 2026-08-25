/**
 * Fase 9 · 9D.1 — o boot passa a baixar só o ESSENCIAL.
 *
 * O que estes testes travam:
 *   · o essencial NÃO inclui nada que cresça com o tamanho da organização;
 *   · a marca d'água da hidratação incremental NÃO avança — uma leitura
 *     parcial que avançasse a marca faria o `lerTudo()` seguinte pular a
 *     organização inteira, e o dado nunca chegaria;
 *   · as mesmas guardas da hidratação (tombstone local, fila local, exclusão
 *     em outro aparelho) continuam valendo;
 *   · sem rede não lança e não apaga nada;
 *   · a função MEDE o que trouxe — é o instrumento do "teto real" da 9D.1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '33333333-3333-3333-3333-333333333333';

/** Linhas do "servidor". */
const SERVIDOR: Array<Record<string, unknown>> = [];
function linha(chave: string, valor: string, atualizadoEm = '2026-08-24T10:00:00.000Z', deletado = false) {
  return {
    chave,
    valor: deletado ? null : valor,
    versao: 3,
    atualizado_em: atualizadoEm,
    dispositivo: 'servidor',
    deletado_em: deletado ? atualizadoEm : null,
  };
}

/** Filtros que a implementação pediu — a prova de que ela não varre a org. */
const pedidos: Array<{ tipo: 'in' | 'like'; alvo: string[] | string }> = [];
let falharConsulta = false;

vi.mock('./supabase', () => {
  const construir = () => {
    let filtro: { tipo: 'in' | 'like'; alvo: string[] | string } | null = null;
    const resolver = () => {
      if (falharConsulta) return { data: null, error: { message: 'sem rede' } };
      if (!filtro) return { data: [], error: null };
      const casa = (chave: string) =>
        filtro!.tipo === 'in'
          ? (filtro!.alvo as string[]).includes(chave)
          : chave.startsWith(String(filtro!.alvo).replace(/%$/, ''));
      return { data: SERVIDOR.filter((l) => casa(String(l.chave))), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: (_coluna: string, valores: string[]) => {
        filtro = { tipo: 'in', alvo: valores };
        pedidos.push(filtro);
        return api;
      },
      like: (_coluna: string, padrao: string) => {
        filtro = { tipo: 'like', alvo: padrao };
        pedidos.push(filtro);
        return api;
      },
      order: () => api,
      range: async () => resolver(),
      then: (aceitar: (v: unknown) => unknown) => Promise.resolve(resolver()).then(aceitar),
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
import { hidratarEssencial } from './storageV2';
import { CHAVES_ESSENCIAIS, PREFIXOS_ESSENCIAIS } from './essencial';
import { lerMarca } from './marcaSync';
import { POR_TAG } from './familiasChave';

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  pedidos.length = 0;
  SERVIDOR.length = 0;
  falharConsulta = false;
  definirOrg(ORG);
});

describe('o que é ESSENCIAL — a lista, e o teto que ela promete', () => {
  it('nenhuma família essencial cresce com o número de equipamentos', () => {
    for (const prefixo of PREFIXOS_ESSENCIAIS) {
      expect(POR_TAG).not.toContain(prefixo);
    }
  });

  it('o histórico legado da organização inteira fica de fora', () => {
    // `nr13_historico_relatorios` cresce sem teto (§7-sexies). Ele é o oposto
    // de "teto conhecido", e desde a migração por relatório ninguém depende
    // dele para abrir uma tela.
    expect(CHAVES_ESSENCIAIS).not.toContain('nr13_historico_relatorios');
  });

  it('as chaves de documento em montagem ficam de fora', () => {
    // `nr13_inspecao_atual`/`nr13_injecao_atual` carregam as fotos de campo
    // (640 KB × 2). São escritas na geração do documento, não no boot.
    expect(CHAVES_ESSENCIAIS).not.toContain('nr13_inspecao_atual');
    expect(CHAVES_ESSENCIAIS).not.toContain('nr13_injecao_atual');
  });
});

describe('hidratarEssencial', () => {
  it('traz as globais e NÃO traz os equipamentos', async () => {
    SERVIDOR.push(
      linha('nr13_minha_empresa', '{"nome":"ACME"}'),
      linha('nr13_lista_phs', '[{"id":"1"}]'),
      linha('nr13_info_VASO-1', '{"tag":"VASO-1"}'),
      linha('nr13_fotos_VASO-1', '[{"src":"..."}]'),
    );

    await hidratarEssencial();

    expect(obterRegistro('nr13_minha_empresa')?.valor).toBe('{"nome":"ACME"}');
    expect(obterRegistro('nr13_lista_phs')?.valor).toBe('[{"id":"1"}]');
    expect(obterRegistro('nr13_info_VASO-1')).toBeNull();
    expect(obterRegistro('nr13_fotos_VASO-1')).toBeNull();
  });

  it('nunca pede a organização inteira — só chaves nomeadas e prefixos fixos', async () => {
    await hidratarEssencial();

    expect(pedidos.length).toBeGreaterThan(0);
    for (const p of pedidos) {
      if (p.tipo === 'in') expect((p.alvo as string[]).length).toBeGreaterThan(0);
      else expect(String(p.alvo).startsWith('nr13_')).toBe(true);
    }
  });

  it('devolve o peso do que trouxe, por família — o instrumento do teto', async () => {
    SERVIDOR.push(
      linha('nr13_minha_empresa', 'x'.repeat(1000)),
      linha('nr13_rastreab_abc', 'y'.repeat(500)),
    );

    const medida = await hidratarEssencial();

    expect(medida.chaves).toBe(2);
    expect(medida.bytes).toBe(1500);
    expect(medida.porFamilia['nr13_minha_empresa']).toBe(1000);
    expect(medida.porFamilia['nr13_rastreab_']).toBe(500);
  });

  it('NÃO avança a marca dágua da hidratação incremental', async () => {
    SERVIDOR.push(linha('nr13_minha_empresa', '{}', '2026-08-24T12:00:00.000Z'));

    await hidratarEssencial();

    expect(await lerMarca(ORG)).toBeNull();
  });

  it('não ressuscita o que foi excluído em outro aparelho', async () => {
    SERVIDOR.push(linha('nr13_minha_empresa', '{}', '2026-08-24T10:00:00.000Z', true));

    await hidratarEssencial();

    expect(obterRegistro('nr13_minha_empresa')).toBeNull();
  });

  it('sem rede não lança e não apaga o que já estava no cache', async () => {
    SERVIDOR.push(linha('nr13_minha_empresa', '{"nome":"ACME"}'));
    await hidratarEssencial();
    falharConsulta = true;

    await expect(hidratarEssencial()).resolves.toBeDefined();

    expect(obterRegistro('nr13_minha_empresa')?.valor).toBe('{"nome":"ACME"}');
  });
});
