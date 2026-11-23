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
    // 23/11/2026 · não categorizado escrito igual à ficha.
    expect(categoriaDoCatalogo('vaso', 'N/A (Não Enquadra)')).toBe('Não categorizado');
  });
});

describe('categoriaExibida (cache)', () => {
  beforeEach(() => cache.clear());

  it('padrão = PMO (a norma): PMO 0,99 MPa = B, mesmo com nr13_cat_ dizendo III', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '0.99', pmtaAdotadaMpa: '2.5' });
    cache.set('nr13_cat_CAL', { catFinal: 'III' });
    expect(categoriaExibida('CAL')).toBe('B');
  });
  it('o usuário escolhe a PMTA: PMO 1,5 + PMTA 2,0 = A', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '1.5', pmtaAdotadaMpa: '2', pressaoClassificacao: 'pmta' });
    expect(categoriaExibida('CAL')).toBe('A');
  });
  it('PMTA escolhida sem adotada usa a calculada do memorial', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pressaoClassificacao: 'pmta' });
    cache.set('nr13_calc_CAL', { pmta: '2.1' });
    expect(categoriaExibida('CAL')).toBe('A');
  });
  it('caldeira sem a pressão escolhida = sem categoria (nunca cai no I–V)', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira' });
    cache.set('nr13_cat_CAL', { catFinal: 'III' });
    expect(categoriaExibida('CAL')).toBeNull();
  });
  it('caldeira com volume < 100 L = fora da NR-13', () => {
    cache.set('nr13_info_CAL', { tipo: 'caldeira', pmoAdotadaMpa: '1' });
    cache.set('nr13_ficha_caldeira_CAL', { volume: { totalLitros: '80' } });
    expect(categoriaExibida('CAL')).toBe('Não categorizado');
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
  it('a pressão de classificação só se troca no modo edição e só vale ao Salvar', () => {
    const s = fonte('src/features/caldeira/SecaoClassificacaoCaldeira.tsx');
    // seletor só dentro de `editando ? (...)`, sem gravar no clique
    expect(s).toMatch(/\{editando \? \(\s*<div className="cc-base" role="radiogroup"/);
    expect(s).toContain('onClick={() => setBaseLocal(b)}');
    expect(s).not.toMatch(/onClick=\{\(\) => void escolherBase/);
    // a gravação acontece no salvar(), relendo o nr13_info_
    expect(s).toMatch(/if \(baseLocal !== baseGravada\) \{[\s\S]{0,200}await salvarInfo\(novoInfo\)/);
  });

  it('Portal, Livro e Prontuário passam por categoriaExibida', () => {
    for (const p of ['src/features/portal/portalService.ts', 'src/pages/portal/PortalAtivo.tsx', 'src/pages/LivroRegistro.tsx', 'src/pages/Prontuarios.tsx']) {
      expect(fonte(p), p).toContain('categoriaExibida(');
    }
  });
  it('projeção SQL: pressão escolhida (pmta → adotada ?? calculada; senão PMO)', () => {
    const sql = fonte('supabase/busca_manutencao.sql');
    expect(sql).toMatch(/x\.p >= 1\.96 then 'A' when x\.p > 0\.06 then 'B'/);
    expect(sql).toMatch(/pressaoClassificacao' = 'pmta'[\s\S]{0,40}then coalesce\(public\.f9_num\(replace\(v_info ->> 'pmtaAdotadaMpa'[\s\S]{0,80}v_calc ->> 'pmta'\)\)[\s\S]{0,40}else public\.f9_num\(replace\(v_info ->> 'pmoAdotadaMpa'/);
  });
});

describe('ficha da caldeira organizada (23/11/2026)', () => {
  const s = fonte('src/pages/Equipamento.tsx');
  const cald = s.slice(s.indexOf("{info.tipo === 'caldeira' ? (\n        <>"), s.indexOf(') : (\n        <>\n'));
  it('ordem: dados (+placa) → pressões → memorial → construção/operação/acessórios → vida → empresa', () => {
    const pos = [
      'data-secao="dados"',
      'bloco="placa"',
      'data-secao="pressoes"',
      'Memorial de Cálculo',
      "['construcao', 'operacao', 'acessorios']",
      'data-secao="vida"',
      'data-secao="empresa"',
    ].map((m) => cald.indexOf(m));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  it('nada saiu: empresa e vida continuam na ficha da caldeira', () => {
    expect(cald).toContain('<DadosEmpresa tag={tag} />');
    expect(cald).toContain('<VidaRemanescente tag={tag} info={info} />');
    expect(cald).toContain('<DadosEquipamento info={info} onSalvo={setInfo} />');
  });
  it('todos os grupos da ficha da caldeira pertencem a algum bloco', async () => {
    const { BLOCOS_CALDEIRA } = await import('./FichaCaldeira');
    const { GRUPOS_CALDEIRA } = await import('./dadosCaldeira');
    const nosBlocos = Object.values(BLOCOS_CALDEIRA).flatMap((b) => [...b.grupos]);
    for (const g of GRUPOS_CALDEIRA) expect(nosBlocos, g.id).toContain(g.id);
  });
});
