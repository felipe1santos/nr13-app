/**
 * CRUZAMENTO autoclave (memorial próprio) → folhas 5 e 6 do relatório (24/11/2026).
 *
 * Achado no E2E em produção com a autoclave de bancada: a folha 5 (dados
 * técnicos/prontuário) saía com MATERIAL, MARGEM DE CORROSÃO e TEMPERATURA em
 * branco, e a folha 6 com "P — pressão de projeto: —" em todo componente e
 * sem o C e o d da porta UG-34. Os dados existiam — no memorial da autoclave —
 * mas o modelo só sabia ler o memorial de VASO.
 */
import { describe, expect, it, vi } from 'vitest';

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

import { montarModeloRelatorio } from './modelo';
import { bancada, type DadosAutoclaveBancada } from '../../../calc/autoclave';
import { componentesAutoclave, type DadosAutoclave } from '../../memorial/autoclaveMemorialService';

const TAG = 'ZZ-CRUZ-BANC';
const g = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const DADOS: DadosAutoclaveBancada = {
  pressao: 0.21575,
  diametro: 300,
  tensao: 115.14,
  ca: 0.5,
  t_costado: 2.18,
  t_fundo: 2.15,
  t_porta1: 1.49,
  t_porta2: 1.5,
  c_porta: 0.33,
  nerv_b: 5,
  nerv_h: 40,
  nerv_n: 8,
  vao_real: 90,
  material: 'SA-240 TP 304',
  temperatura: 134,
};

describe('autoclave de bancada → relatório', () => {
  g(`nr13_info_${TAG}`, { tag: TAG, tipo: 'autoclave', subtipo: 'bancada', pmtaAdotadaMpa: '0.2157' });
  g(`nr13_autoclave_dados_bancada_${TAG}`, DADOS);
  const r = bancada(DADOS);
  g(`nr13_calc_${TAG}`, { pmta: r.pmta, componentes: componentesAutoclave('bancada', DADOS as unknown as DadosAutoclave, r) });
  const m = montarModeloRelatorio(TAG);

  it('folha 5: material, corrosão e temperatura vêm do memorial da autoclave', () => {
    expect(m.prontuario.materialCorpo).toBe('SA-240 TP 304');
    expect(m.prontuario.materialTampo1).toBe('SA-240 TP 304');
    expect(m.prontuario.margemCorrosao).toBe('0.5');
    expect(m.prontuario.temperaturaProjeto).toBe('134');
  });

  it('folha 6: P em todo componente; C e d na porta; L = raio da coroa no fundo', () => {
    for (const c of m.componentes) expect(c.p, c.nome).toBe('0.21575');
    const porta = m.componentes.find((c) => /Porta/.test(c.nome))!;
    expect(porta.c).toBe('0.33');
    expect(porta.dAbertura).toBe('90');
    const fundo = m.componentes.find((c) => /Torisf/.test(c.nome))!;
    expect(fundo.raio).toBe('300');
  });
});
