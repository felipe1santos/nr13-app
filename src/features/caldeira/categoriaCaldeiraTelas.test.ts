/**
 * CALDEIRA NUNCA MOSTRA A CATEGORIA DE VASO (23/11/2026).
 *
 * NR-13 13.4.1.1: caldeira é A ou B pela pressão de operação. A `nr13_cat_`
 * (classe de fluido × P·V → I–V) é o método de VASO e não vale para ela. Este
 * teste trava as quatro portas por onde a categoria chega à tela: a ficha, o
 * catálogo (projeção), as leituras do cache (Portal, Livro, Prontuário) e o SQL.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, unknown>();
vi.mock('../../services/storage', () => ({
  ler: (k: string) => (cache.has(k) ? cache.get(k) : null),
  salvar: async (k: string, v: unknown) => void cache.set(k, v),
}));

import { categoriaDoCatalogo } from '../../services/buscaIndex';
import { categoriaExibida } from './categoriaExibida';

const raiz = resolve(__dirname, '../../..');
const fonte = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('catálogo: caldeira só aceita A ou B', () => {
  it('I–V de vaso numa caldeira vira "sem categoria"', () => {
    for (const c of ['I', 'II', 'III', 'IV', 'V']) expect(categoriaDoCatalogo('caldeira', c)).toBeNull();
  });
  it('A e B passam', () => {
    expect(categoriaDoCatalogo('caldeira', 'A')).toBe('A');
    expect(categoriaDoCatalogo('caldeira', 'B')).toBe('B');
  });
  it('vaso e autoclave inalterados', () => {
    expect(categoriaDoCatalogo('vaso', 'III')).toBe('III');
    expect(categoriaDoCatalogo('autoclave', 'II')).toBe('II');
    expect(categoriaDoCatalogo('vaso', '')).toBeNull();
  });
});

describe('categoriaExibida (cache)', () => {
  beforeEach(() => cache.clear());

  it('caldeira com PMTA 1,10 MPa = B, mesmo com nr13_cat_ dizendo III', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '0.99', pmtaAdotadaMpa: '1.10' });
    cache.set('nr13_cat_CAL', { catFinal: 'III' });
    expect(categoriaExibida('CAL')).toBe('B');
  });
  it('classifica pela PMTA, não pela PMO (critério do PLH): PMO 1,5 + PMTA 2,0 = A', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '1.5', pmtaAdotadaMpa: '2' });
    expect(categoriaExibida('CAL')).toBe('A');
  });
  it('sem PMTA adotada usa a calculada do memorial', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira' });
    cache.set('nr13_calc_CAL', { pmta: '2.1' });
    expect(categoriaExibida('CAL')).toBe('A');
  });
  it('caldeira sem PMTA = sem categoria (nunca cai no I–V)', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira' });
    cache.set('nr13_cat_CAL', { catFinal: 'III' });
    expect(categoriaExibida('CAL')).toBeNull();
  });
  it('caldeira com volume < 100 L = fora da NR-13', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '1' });
    cache.set('nr13_ficha_caldeira_CAL', { volume: { totalLitros: '80' } });
    expect(categoriaExibida('CAL')).toBe('Fora da NR-13');
  });
  it('vaso continua lendo nr13_cat_', () => {
    cache.set('nr13_info_VP', { tipo: 'vaso' });
    cache.set('nr13_cat_VP', { catFinal: 'IV' });
    expect(categoriaExibida('VP')).toBe('IV');
  });
});

describe('as portas usam a regra', () => {
  it('ficha: caldeira mostra a classificação própria, vaso a calculadora de sempre', () => {
    const s = fonte('src/pages/Equipamento.tsx');
    expect(s).toMatch(/info\.tipo === 'caldeira' \?\s*\(\s*<SecaoClassificacaoCaldeira/);
    expect(s).toContain('<CategoriaNR13 tag={tag} unidade={unidade} />');
  });
  it('Portal, Livro e Prontuário passam por categoriaExibida', () => {
    for (const p of ['src/features/portal/portalService.ts', 'src/pages/portal/PortalAtivo.tsx', 'src/pages/LivroRegistro.tsx', 'src/pages/Prontuarios.tsx']) {
      expect(fonte(p), p).toContain('categoriaExibida(');
    }
  });
  it('projeção SQL calcula A/B para caldeira pela PMTA (adotada ?? calculada)', () => {
    const sql = fonte('supabase/busca_manutencao.sql');
    expect(sql).toMatch(/= 'caldeira' then[\s\S]{0,200}coalesce\(public\.f9_num\(replace\(v_info ->> 'pmtaAdotadaMpa'[\s\S]{0,80}v_calc ->> 'pmta'\)\) >= 1\.96 then 'A'/);
    expect(sql).not.toMatch(/pmoAdotadaMpa[\s\S]{0,40}>= 1\.96/);
    expect(sql).toMatch(/> 0\.06 then 'B'/);
  });
});
