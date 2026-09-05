import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  DESCRICAO_VARIAVEL,
  indiceDaBarra,
  prepararFormula,
  semParentesesExternos,
  variaveisDaFormula,
} from './formulaMatematica';

/**
 * Bloco 1.1 · o gate da FÓRMULA.
 *
 * Duas garantias, e a segunda é a que protege o documento:
 *
 * 1. a expressão do motor vira fração desenhável sem virar OUTRA equação;
 * 2. o gerador **não** conhece engenharia — nenhuma fórmula literal mora nas
 *    folhas, e nenhum cálculo é refeito para imprimir.
 *
 * As strings abaixo são as REAIS do sistema (`FORMULAS_VASO`,
 * `FORMULAS_VERTICAL`, `FORMULAS_CILINDRICA`), copiadas do motor.
 */

describe('a fórmula do motor vira fração', () => {
  it('separa numerador e denominador na barra principal', () => {
    const f = prepararFormula('PMTA = S·E·t / (Ri + 0,6·t)');
    expect(f).toEqual({ lhs: 'PMTA', numerador: 'S·E·t', denominador: 'Ri + 0,6·t' });
  });

  it('o tampo elíptico também', () => {
    const f = prepararFormula('PMTA = 2·S·E·t / (D + 0,2·t)');
    expect(f?.numerador).toBe('2·S·E·t');
    expect(f?.denominador).toBe('D + 0,2·t');
  });

  it('barra DENTRO de radical não é fração — a expressão sai em linha', () => {
    const f = prepararFormula('t = d·C·√(P/S)');
    expect(f).toEqual({ lhs: 't', expressao: 'd·C·√(P/S)' });
  });

  it('expressão sem barra nenhuma sai em linha', () => {
    expect(prepararFormula('PMTA = S·C·(t_real/a)²')?.expressao).toBe('S·C·(t_real/a)²');
  });

  it('fórmula vazia ou ausente devolve null — a folha não desenha nada', () => {
    expect(prepararFormula('')).toBeNull();
    expect(prepararFormula(null)).toBeNull();
    expect(prepararFormula(undefined)).toBeNull();
  });

  it('a equação não é reescrita: numerador + denominador reproduzem a origem', () => {
    for (const bruta of [
      't = P·Ri / (S·E − 0,6·P)',
      'PMTA = 2·cos α·S·E·t / (D + 1,2·t·cos α)',
      't = 0,885·P·L / (S·E − 0,1·P)',
    ]) {
      const f = prepararFormula(bruta)!;
      const recomposta = `${f.lhs} = ${f.numerador} / (${f.denominador})`;
      expect(recomposta.replace(/\s+/g, '')).toBe(bruta.replace(/\s+/g, ''));
    }
  });
});

describe('as peças da separação', () => {
  it('tira só o par de parênteses que envolve tudo', () => {
    expect(semParentesesExternos('(a + b)')).toBe('a + b');
    expect(semParentesesExternos('(a) + (b)')).toBe('(a) + (b)');
    expect(semParentesesExternos('S·E·t')).toBe('S·E·t');
  });

  it('acha a barra de nível zero, e ignora as de dentro', () => {
    expect(indiceDaBarra('a / b')).toBe(2);
    expect(indiceDaBarra('√(P/S)')).toBe(-1);
    expect(indiceDaBarra('(a/b) + c')).toBe(-1);
  });
});

describe('a legenda descreve só o que a fórmula usa', () => {
  it('lista os símbolos presentes', () => {
    const vars = variaveisDaFormula('PMTA = S·E·t / (Ri + 0,6·t)');
    expect(vars).toContain('S');
    expect(vars).toContain('E');
    expect(vars).toContain('t');
    expect(vars).toContain('Ri');
    expect(vars).toContain('PMTA');
  });

  it('não inventa símbolo que a equação não tem', () => {
    const vars = variaveisDaFormula('t = P·Ri / (S·E − 0,6·P)');
    expect(vars).not.toContain('L');
    expect(vars).not.toContain('G');
    expect(vars).not.toContain('α');
  });

  it('todo símbolo listado tem descrição e unidade', () => {
    for (const s of variaveisDaFormula('t = d·C·√(P/S)', 'PMTA = S·(t/d)²/C')) {
      expect(DESCRICAO_VARIAVEL[s]?.descricao ?? '').not.toBe('');
      expect(DESCRICAO_VARIAVEL[s]?.unidade ?? '').not.toBe('');
    }
  });
});

describe('o gerador NÃO reimplementa a engenharia', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
  const documento = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
  const formula = readFileSync('src/features/relatorios/pdfVetorial/formulaMatematica.ts', 'utf8');

  it('nenhuma fórmula literal de engenharia mora nas folhas', () => {
    // O que a folha imprime vem de `c.formulaT` / `c.formulaP`, que o motor
    // gravou. Uma string com a equação escrita aqui seria uma segunda verdade.
    expect(folhas).not.toMatch(/t = P·/);
    expect(folhas).not.toMatch(/PMTA = S·E·t/);
    expect(folhas).toContain('prepararFormula(c.formulaT)');
    expect(folhas).toContain('prepararFormula(c.formulaP)');
  });

  it('nenhuma conta de engenharia é refeita para imprimir', () => {
    for (const fonte of [folhas, documento, formula]) {
      expect(fonte).not.toMatch(/Math\.(pow|sqrt|log|sin|cos|tan)\(/);
    }
    // O único aritmético da folha é comparação e a conversão raio→diâmetro,
    // que é leitura do mesmo número, não cálculo de pressão nem de espessura.
    expect(folhas).not.toMatch(/\bS\s*\*\s*E\b/);
  });

  it('o desenho da fórmula é vetorial — texto e linha, nunca imagem', () => {
    expect(documento).toContain('formula(f: FormulaDesenhavel');
    expect(documento).toMatch(/this\.pdf\.line\([\s\S]{0,120}meio/);
    const trecho = documento.slice(documento.indexOf('formula(f: FormulaDesenhavel'), documento.indexOf('banner(conteudo: string)'));
    expect(trecho).not.toContain('addImage');
  });

  it('a fórmula estrutural não vira campo de texto livre', () => {
    // Valores e situação são editáveis (13D-bis); a EQUAÇÃO não — trocá-la por
    // texto livre faria o documento afirmar um método de cálculo que o sistema
    // não usou.
    const trechoMemorial = folhas.slice(folhas.indexOf('MEMÓRIA DE CÁLCULO —'), folhas.indexOf('Conclusão do cálculo'));
    expect(trechoMemorial).toContain('doc.formula(fT)');
    expect(trechoMemorial).not.toMatch(/doc\.formula\([^)]*id:/);
  });
});

describe('os sinais da fórmula existem na fonte embutida', () => {
  it('o subconjunto de Carlito inclui ·, −, √ e α', () => {
    // Sem eles, o jsPDF corta o texto no primeiro caractere ausente: a fórmula
    // `PMTA = 2·S·E·t / (D + 0,2·t)` saía como `PMTA = 2 / (D + 0,2)`.
    // Medido em produção em 05/09/2026.
    const script = readFileSync('scripts/fontes/subset-carlito.mjs', 'utf8');
    for (const sinal of ['·', '−', '√', 'α']) {
      expect(script).toContain(sinal);
    }
  });

  it('as fórmulas do motor só usam sinais cobertos pelo subconjunto', () => {
    const script = readFileSync('scripts/fontes/subset-carlito.mjs', 'utf8');
    const lista = script.slice(script.indexOf('const CARACTERES'), script.indexOf('const ORIGENS'));
    const doMotor = readFileSync('src/features/memorial/vasoMemorialService.ts', 'utf8');
    const formulas = [...doMotor.matchAll(/'((?:t|PMTA) = [^']+)'/g)].map((m) => m[1]);
    expect(formulas.length).toBeGreaterThan(5);
    for (const f of formulas) {
      for (const c of f) {
        if (c === ' ') continue;
        expect(lista.includes(c), `caractere ausente no subconjunto: ${c} (em ${f})`).toBe(true);
      }
    }
  });
});
