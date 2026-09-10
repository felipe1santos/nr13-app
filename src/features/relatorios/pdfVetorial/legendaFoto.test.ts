import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { legendaEmDuasLinhas } from './documento';

/**
 * A LEGENDA DA FOTO era cortada em uma linha, sem reticência (10/09/2026).
 *
 * Medido no relatório "RELATORIO DA IA": a legenda digitada no formulário —
 * "Memorial de cálculo — Folha de rosto do memorial da PMTA de casco e tampos."
 * — saiu no documento como "…de casco e", cortada no meio da frase e sem
 * nenhum sinal de que faltava texto. O inspetor escreve e parte some do
 * documento assinado.
 *
 * A causa era literal: `splitTextToSize(...)[0]` desenhava só a PRIMEIRA linha.
 */
describe('legendaEmDuasLinhas', () => {
  it('uma linha continua uma linha', () => {
    expect(legendaEmDuasLinhas(['Vista geral do vaso'])).toEqual(['Vista geral do vaso']);
  });

  it('duas linhas saem inteiras — era exatamente o que se perdia', () => {
    expect(legendaEmDuasLinhas(['Memorial de cálculo — Folha de rosto', 'do memorial da PMTA de casco e tampos.'])).toEqual([
      'Memorial de cálculo — Folha de rosto',
      'do memorial da PMTA de casco e tampos.',
    ]);
  });

  it('mais que isso termina em reticência — o corte precisa APARECER', () => {
    const r = legendaEmDuasLinhas(['linha um', 'linha dois inteira', 'linha três que não cabe']);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe('linha um');
    expect(r[1].endsWith('…')).toBe(true);
    // A última palavra sai para a reticência não colar no meio de uma palavra.
    expect(r[1]).toBe('linha dois…');
  });

  it('legenda vazia não desenha linha nenhuma', () => {
    expect(legendaEmDuasLinhas([''])).toEqual([]);
    expect(legendaEmDuasLinhas([])).toEqual([]);
  });

  it('linha única muito longa sem espaço ainda ganha a reticência', () => {
    const r = legendaEmDuasLinhas(['a', 'bbbbbbbb', 'ccc']);
    expect(r[1]).toBe('bbbbbbbb…');
  });
});

describe('gate · a faixa da legenda cabe nas duas linhas', () => {
  const doc = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
  const grade = doc.slice(doc.indexOf('fotos(itens: FotoDoc[]'), doc.indexOf('/**\n * A legenda de uma foto'));

  it('a altura reservada cresceu junto', () => {
    // 5 mm cabia UMA linha de 8,5pt. Duas precisam de ~7; 9 dá o respiro.
    expect(grade).toContain('const altLegenda = 9;');
  });

  it('as 4 fotos por folha continuam sendo a regra (§5)', () => {
    expect(grade).toContain('const POR_FOLHA = 4;');
  });

  it('a segunda linha é desenhada abaixo da primeira', () => {
    expect(grade).toContain('y + altQuadro + 3.4 + n * 3.4');
  });
});
