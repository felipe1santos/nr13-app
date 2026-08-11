import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '22222222-2222-2222-2222-222222222222';

/** Linhas do "servidor", com `atualizado_em` crescente. */
const SERVIDOR: Array<Record<string, unknown>> = [];
function linha(chave: string, valor: string, atualizadoEm: string, deletado = false) {
  return {
    chave,
    valor: deletado ? null : valor,
    versao: 1,
    atualizado_em: atualizadoEm,
    dispositivo: 'servidor',
    deletado_em: deletado ? atualizadoEm : null,
  };
}

/** Registra o filtro recebido para provar que a 2ª leitura é incremental. */
const consultas: Array<{ corte: string | null; devolvidas: number }> = [];

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
        const filtradas = SERVIDOR.filter((l) => !corte || String(l.atualizado_em) > corte)
          .sort((a, b) =>
            String(a.atualizado_em).localeCompare(String(b.atualizado_em)) ||
            String(a.chave).localeCompare(String(b.chave)),
          );
        const pagina = filtradas.slice(inicio, fim + 1);
        if (inicio === 0) consultas.push({ corte, devolvidas: filtradas.length });
        return { data: pagina, error: null };
      },
    };
    return api;
  };
  return {
    supabase: { from: () => construir(), rpc: vi.fn(async () => ({ data: { status: 'aplicado', versao: 2 }, error: null })) },
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    idUsuarioAtual: vi.fn(async () => 'user-1'),
    TABELA_STORAGE: 'app_storage',
  };
});

import { fecharDb, apagarDb } from './db';
import { zerarMemoria, definirOrg, hidratarDoDisco, obterRegistro, chavesComPrefixo } from './cacheLocal';
import { zerarFilaMemoria, zerarTombstonesMemoria } from './sync';
import { lerTudo, CHAVE_HIDRATACAO_COMPLETA } from './storageV2';
import { lerMarca } from './marcaSync';

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  consultas.length = 0;
  SERVIDOR.length = 0;
  definirOrg(ORG);
});

describe('hidratação incremental', () => {
  it('a PRIMEIRA leitura baixa tudo', async () => {
    SERVIDOR.push(
      linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'),
      linha('nr13_info_B', '{"tag":"B"}', '2026-08-01T11:00:00.000Z'),
    );

    await lerTudo();

    expect(consultas[0].corte).toBeNull();
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(2);
    expect(await lerMarca(ORG)).toBe('2026-08-01T11:00:00.000Z');
  });

  it('a SEGUNDA leitura pede só o que mudou — e não traz nada quando nada mudou', async () => {
    // É este o ponto do trabalho todo: 8 MB na primeira abertura, ~zero nas
    // seguintes. Era a releitura da conta inteira que estourou o egress.
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    consultas.length = 0;

    await lerTudo();

    expect(consultas[0].corte).toBe('2026-08-01T10:00:00.000Z');
    expect(consultas[0].devolvidas).toBe(0);
  });

  it('traz a linha nova sem rebaixar as antigas', async () => {
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    SERVIDOR.push(linha('nr13_info_B', '{"tag":"B"}', '2026-08-02T10:00:00.000Z'));
    consultas.length = 0;

    await lerTudo();

    expect(consultas[0].devolvidas).toBe(1); // só a nova trafegou
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(2); // a antiga continua
    expect(obterRegistro('nr13_info_A')).not.toBeNull();
  });

  it('exclusão feita em outro aparelho chega pelo incremento', async () => {
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    expect(obterRegistro('nr13_info_A')).not.toBeNull();

    SERVIDOR.length = 0;
    SERVIDOR.push(linha('nr13_info_A', '', '2026-08-03T10:00:00.000Z', true));
    await lerTudo();

    expect(obterRegistro('nr13_info_A')).toBeNull();
  });

  it('cache apagado zera a marca junto — e o boot seguinte baixa tudo de novo', async () => {
    // A invariante que mais importa: marca sem dados faria o app pedir "só o
    // que mudou" com o cache vazio, e a conta abriria vazia para sempre.
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    expect(await lerMarca(ORG)).not.toBeNull();

    fecharDb();
    await apagarDb(ORG); // é o que `apagarBancoLocal` faz
    zerarMemoria();
    definirOrg(ORG);
    await hidratarDoDisco();
    consultas.length = 0;

    await lerTudo();

    expect(consultas[0].corte).toBeNull(); // baixou tudo
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(1);
  });

  it('falha de rede NÃO avança a marca', async () => {
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    const marcaAntes = await lerMarca(ORG);

    SERVIDOR.push(linha('nr13_info_B', '{"tag":"B"}', '2026-08-05T10:00:00.000Z'));
    const from = (await import('./supabase')).supabase.from as unknown as () => unknown;
    const original = from;
    (await import('./supabase')).supabase.from = (() => {
      throw new TypeError('Failed to fetch');
    }) as never;

    await lerTudo();

    expect(await lerMarca(ORG)).toBe(marcaAntes);
    (await import('./supabase')).supabase.from = original as never;
  });

  it('a chave de emergência volta a baixar tudo', async () => {
    SERVIDOR.push(linha('nr13_info_A', '{"tag":"A"}', '2026-08-01T10:00:00.000Z'));
    await lerTudo();
    consultas.length = 0;

    localStorage.setItem(CHAVE_HIDRATACAO_COMPLETA, '1');
    await lerTudo();

    expect(consultas[0].corte).toBeNull();
  });
});
