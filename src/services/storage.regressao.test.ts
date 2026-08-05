import { describe, it, expect, beforeEach, vi } from 'vitest';

const ORG = '11111111-1111-1111-1111-111111111111';

/**
 * Espelha a conta `cmam.caldeiras@gmail.com` medida em 04/08/2026:
 * 340 chaves, ~5,7 MB, 38 equipamentos. As fotos vêm ANTES de `nr13_info_`
 * na ordem alfabética (`f` < `i`) — era exatamente aí que a hidratação da v1
 * estourava a cota do localStorage e nenhum equipamento entrava no cache.
 */
const LINHAS: Array<Record<string, unknown>> = [];
for (let i = 0; i < 38; i++) {
  const tag = `ACA ${2000 + i}`;
  LINHAS.push({
    chave: `nr13_fotos_${tag}`,
    valor: 'f'.repeat(103 * 1024),
    versao: 1,
    atualizado_em: '2026-08-01T00:00:00.000Z',
    dispositivo: null,
    deletado_em: null,
  });
  LINHAS.push({
    chave: `nr13_info_${tag}`,
    valor: JSON.stringify({ tag, tipo: 'vaso' }),
    versao: 1,
    atualizado_em: '2026-08-01T00:00:00.000Z',
    dispositivo: null,
    deletado_em: null,
  });
}
// Completa até 340 chaves com as demais famílias do equipamento.
const FAMILIAS = [
  'nr13_calc_',
  'nr13_cat_',
  'nr13_emp_',
  'nr13_med_esp_',
  'nr13_docs_',
  'nr13_livro_',
  'nr13_vaso_',
];
for (let f = 0; f < FAMILIAS.length && LINHAS.length < 340; f++) {
  for (let i = 0; i < 38 && LINHAS.length < 340; i++) {
    const familia = FAMILIAS[f];
    LINHAS.push({
      chave: `${familia}ACA ${2000 + i}`,
      valor: 'd'.repeat(familia === 'nr13_docs_' ? 30 * 1024 : 512),
      versao: 1,
      atualizado_em: '2026-08-01T00:00:00.000Z',
      dispositivo: null,
      deletado_em: null,
    });
  }
}
LINHAS.sort((a, b) => String(a.chave).localeCompare(String(b.chave)));

const PESO_TOTAL = LINHAS.reduce((s, l) => s + String(l.valor).length, 0);

const range = vi.fn(async (inicio: number, fim: number) => ({
  data: LINHAS.slice(inicio, fim + 1),
  error: null,
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: (a: number, b: number) => range(a, b),
          }),
        }),
      }),
    }),
    rpc: vi.fn(async () => ({ data: { status: 'aplicado', versao: 2 }, error: null })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { zerarMemoria, definirOrg, hidratarDoDisco, chavesComPrefixo } from './cacheLocal';
import { zerarFilaMemoria, zerarTombstonesMemoria } from './sync';
import { ler, listarChavesComPrefixo, lerTudo, definirArmazenamentoV2 } from './storage';
import { zerarFlagEmMemoria } from './flag';

beforeEach(async () => {
  zerarMemoria();
  zerarFilaMemoria();
  zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  zerarFlagEmMemoria();
  definirArmazenamentoV2(true); // esta suíte exercita o caminho v2
  definirOrg(ORG);
});

describe('REGRESSÃO — sumiço de equipamentos (conta cmam.caldeiras, 04/08/2026)', () => {
  it('o cenário reproduz a conta real: ~340 chaves, ~5,7 MB, 38 equipamentos', () => {
    expect(LINHAS.length).toBe(340);
    expect(PESO_TOTAL / 1024).toBeGreaterThan(4_500);
    expect(LINHAS.filter((l) => String(l.chave).startsWith('nr13_info_')).length).toBe(38);
  });

  it('as fotos vêm ANTES dos equipamentos na ordem alfabética (a causa do bug)', () => {
    expect('nr13_fotos_ACA 2000' < 'nr13_info_ACA 2000').toBe(true);
  });

  it('OS 38 EQUIPAMENTOS APARECEM', async () => {
    await lerTudo();
    expect(listarChavesComPrefixo('nr13_info_')).toHaveLength(38);
  });

  it('a ficha de cada equipamento é legível', async () => {
    await lerTudo();
    expect(ler<{ tag: string }>('nr13_info_ACA 2037')?.tag).toBe('ACA 2037');
    expect(ler<{ tag: string }>('nr13_info_ACA 2000')?.tag).toBe('ACA 2000');
  });

  it('NADA depende de caber no localStorage', async () => {
    await lerTudo();
    // Nenhuma chave de dado foi para o localStorage — só o Map e o IndexedDB.
    const noLocalStorage = Object.keys(localStorage).filter((k) => k.startsWith('nr13_info_'));
    expect(noLocalStorage).toEqual([]);
    expect(ler('nr13_info_ACA 2000')).not.toBeNull();
  });

  it('limpar o localStorage NÃO faz os equipamentos sumirem', async () => {
    await lerTudo();
    localStorage.clear();
    expect(listarChavesComPrefixo('nr13_info_')).toHaveLength(38);
    expect(ler<{ tag: string }>('nr13_info_ACA 2010')?.tag).toBe('ACA 2010');
  });

  it('fechar e reabrir OFFLINE continua mostrando os 38 após hidratar o IndexedDB', async () => {
    await lerTudo(); // sessão online: encheu o IndexedDB
    range.mockClear();

    // Fecha o app: memória zerada, IndexedDB preservado.
    zerarMemoria();
    zerarFilaMemoria();
    expect(listarChavesComPrefixo('nr13_info_')).toHaveLength(0);

    // Reabre sem rede.
    range.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    definirOrg(ORG);
    await hidratarDoDisco();

    expect(chavesComPrefixo('nr13_info_')).toHaveLength(38);
    const snapshot = await lerTudo();
    expect(Object.keys(snapshot).filter((k) => k.startsWith('nr13_info_'))).toHaveLength(38);
  });

  it('offline, lerTudo devolve o snapshot do disco — nunca objeto vazio', async () => {
    await lerTudo();
    zerarMemoria();
    definirOrg(ORG);
    await hidratarDoDisco();

    range.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const snapshot = await lerTudo();

    expect(Object.keys(snapshot).length).toBeGreaterThan(0);
    expect(snapshot['nr13_info_ACA 2000']).toContain('ACA 2000');

    range.mockImplementation(async (inicio: number, fim: number) => ({
      data: LINHAS.slice(inicio, fim + 1),
      error: null,
    }));
  });

  it('a v1 continua sendo o caminho quando a flag está desligada', async () => {
    definirArmazenamentoV2(false);
    // Sem tocar no banco: só confirma que o despacho mudou de implementação.
    expect(listarChavesComPrefixo('nr13_info_')).toEqual([]);
  });
});
