import { beforeEach, describe, expect, it, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { montarModeloRelatorio, numeroBr, numeroDoStorage } from './modelo';
import type { CategoriaSalva } from '../../equipamento/tipos';

/**
 * 13A · o GATE **STORAGE → MODELO**.
 *
 * ## Por que ele existe
 *
 * O gate que já havia (`conferencia.ts`) recebe o MODELO e lista os campos
 * vazios dele. Um campo lido de uma chave com o nome errado chega vazio ao
 * modelo, e a conferência o reporta como "vazio" — **indistinguível de "o
 * usuário não preencheu"**. Ela compara o modelo consigo mesmo.
 *
 * Foi assim que o Modelo Novo passou a imprimir travessão em CLASSE DO FLUIDO,
 * VOLUME, FLUIDO, ENQUADRAMENTO, PMTA e PTH sem que nada acusasse — provado em
 * relatório já emitido em 04/09/2026.
 *
 * Este gate parte do outro lado: **grava dado REAL no storage, monta o modelo e
 * exige que o dado tenha chegado**. Se o storage tem valor e o modelo entrega
 * vazio, o teste falha. É a única forma de pegar chave com nome errado.
 *
 * As formas gravadas aqui são as que o SISTEMA grava, não as que seriam
 * convenientes: `CategoriaSalva` vem de `categoriaService.calcularESalvarCategoria`
 * e o `nr13_calc_` de `vasoMemorialService` / `caldeiraMemorialService`
 * (strings com `toFixed(2)`) e de `autoclaveMemorialService` (número).
 */

const TAG = 'VP-GATE';

/** Exatamente o que `calcularESalvarCategoria` grava. */
const CATEGORIA: CategoriaSalva = {
  classe: 'A',
  grupo: 4,
  PV_cat: '1.0000',
  PV_enq: '1000.0000',
  isEnquadrado: true,
  catFinal: 'III',
  volInput: 1.25,
  presInput: 1,
  unidInput: 'SI',
  fluidoInput: 'A - Fluido inflamável, combustível (T ≥ 200 °C)',
};

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function comCategoria() {
  gravar(`nr13_cat_${TAG}`, CATEGORIA);
}

beforeEach(() => localStorage.clear());

describe('categoria de risco: o que está no storage chega ao documento', () => {
  it('CLASSE DO FLUIDO sai de `classe`, não de um campo inexistente', () => {
    comCategoria();
    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['CLASSE DO FLUIDO']).toBe('Classe A');
  });

  it('VOLUME sai de `volInput`', () => {
    comCategoria();
    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['VOLUME (m³)']).toBe('1,25');
    expect(m.categoria.volume).toBe('1,25');
  });

  it('FLUIDO DE OPERAÇÃO sai de `fluidoInput`, sem repetir a classe', () => {
    comCategoria();
    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['FLUIDO DE OPERAÇÃO']).toBe('Fluido inflamável, combustível (T ≥ 200 °C)');
  });

  it('ENQUADRAMENTO sai de `isEnquadrado`', () => {
    comCategoria();
    expect(montarModeloRelatorio(TAG).categoria.enquadramento).toBe('Enquadrado na NR-13');
    gravar(`nr13_cat_${TAG}`, { ...CATEGORIA, isEnquadrado: false });
    expect(montarModeloRelatorio(TAG).categoria.enquadramento).toBe('Não enquadrado');
  });

  it('nunca categorizado é AUSÊNCIA, não "não enquadrado"', () => {
    // Sem `nr13_cat_` não há resposta. Dizer "Não enquadrado" faria a folha
    // afirmar que o equipamento está fora da norma sem ninguém ter avaliado.
    const m = montarModeloRelatorio(TAG);
    expect(m.categoria.enquadramento).toBeNull();
    expect(m.equipamento['CLASSE DO FLUIDO']).toBeNull();
  });

  it('grupo e categoria continuam saindo (não houve regressão)', () => {
    comCategoria();
    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['GRUPO DE RISCO']).toBe('4');
    expect(m.equipamento['CATEGORIA DO VASO']).toBe('III');
    expect(m.categoria.catFinal).toBe('III');
  });

  it('o VOLUME da ficha vence o da categoria quando existe', () => {
    comCategoria();
    gravar(`nr13_info_${TAG}`, { volume: 2.5 });
    expect(montarModeloRelatorio(TAG).equipamento['VOLUME (m³)']).toBe('2,5');
  });
});

describe('PMTA e PTH: o storage guarda string em vaso e caldeira', () => {
  it('VASO — `toFixed(2)` grava string, e ela chega ao documento', () => {
    // `vasoMemorialService.ts:137` → `pmtaFinal.toFixed(2)`
    gravar(`nr13_calc_${TAG}`, { pmta: '1.25', pth: '1.63', memorialHTML: '' });
    const m = montarModeloRelatorio(TAG);
    expect(m.pressoes[0].mpa).toBe('1.250');
    expect(m.pressoes[0].kgf).toBe('12.75');
    expect(m.pressoes[0].bar).toBe('12.50');
    expect(m.pressoes[1].mpa).toBe('1.630');
  });

  it('CALDEIRA — mesma forma, mesmo resultado', () => {
    // `caldeiraMemorialService.ts:121` → `P.toFixed(2)`
    gravar(`nr13_calc_${TAG}`, { pmta: '0.80', pth: '1.20', memorialHTML: '' });
    const m = montarModeloRelatorio(TAG);
    expect(m.pressoes[0].mpa).toBe('0.800');
    expect(m.pressoes[1].mpa).toBe('1.200');
  });

  it('AUTOCLAVE — número continua funcionando (não houve regressão)', () => {
    gravar(`nr13_calc_${TAG}`, { pmta: 1.25, pth: 1.63, memorialHTML: '' });
    expect(montarModeloRelatorio(TAG).pressoes[0].mpa).toBe('1.250');
  });

  it('sem memorial, PMTA e PTH são AUSÊNCIA', () => {
    const m = montarModeloRelatorio(TAG);
    expect(m.pressoes[0].mpa).toBeNull();
    expect(m.pressoes[1].mpa).toBeNull();
  });

  it('lixo textual NÃO vira número', () => {
    // O travessão continua sendo a resposta honesta: aceitar "--" como 0
    // imprimiria uma pressão de zero num laudo.
    for (const ruim of ['--', '', 'N/A', 'abc', '1.2.3', '-']) {
      gravar(`nr13_calc_${TAG}`, { pmta: ruim, pth: ruim, memorialHTML: '' });
      expect(montarModeloRelatorio(TAG).pressoes[0].mpa).toBeNull();
    }
  });
});

describe('as duas conversões, isoladas', () => {
  it('numeroDoStorage aceita as formas que o sistema grava', () => {
    expect(numeroDoStorage(1.25)).toBe(1.25);
    expect(numeroDoStorage('1.25')).toBe(1.25);
    expect(numeroDoStorage('12,50')).toBe(12.5); // decimal digitado à mão
    expect(numeroDoStorage('0')).toBe(0);
    expect(numeroDoStorage('-3.5')).toBe(-3.5);
  });

  it('numeroDoStorage recusa o que não é número', () => {
    for (const v of ['--', 'N/A', '', '  ', 'abc', '1.2.3', null, undefined, {}, []]) {
      expect(numeroDoStorage(v)).toBeNull();
    }
    expect(numeroDoStorage(Number.NaN)).toBeNull();
    expect(numeroDoStorage(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('numeroBr não inventa casas decimais', () => {
    expect(numeroBr(1)).toBe('1');
    expect(numeroBr(1.25)).toBe('1,25');
    expect(numeroBr('0.500')).toBe('0,5');
    expect(numeroBr('--')).toBeNull();
  });
});
