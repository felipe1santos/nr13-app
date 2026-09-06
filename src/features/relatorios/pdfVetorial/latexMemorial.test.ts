import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { ehFormulaLatex, formulaDoLatex, partirFrac, pedacosComSubscrito, simbolosDoLatex } from './latexMemorial';
import { celulaVazia, corDeFundo } from './documento';

/**
 * A memória de cálculo em ÁLGEBRA.
 *
 * O motor grava as equações em LaTeX (é o que o KaTeX renderiza na tela), e a
 * folha 6.1 imprimia a string crua: saía `$$ t_{req} = $$` no papel, porque o
 * jsPDF corta no primeiro caractere ausente da fonte. Estes testes usam as
 * strings REAIS lidas de `nr13_calc_ZZ-FASE3.memorialHTML` em produção.
 */

describe('LaTeX do memorial vira fração desenhável', () => {
  it('a fórmula simbólica da espessura', () => {
    const f = formulaDoLatex('$$ t_{req} = \\frac{P \\cdot D}{2 \\cdot S \\cdot E - 0.2 \\cdot P} $$')!;
    expect(f.lhs).toBe('t_{req}');
    expect(f.numerador).toBe('P · D');
    expect(f.denominador).toBe('2 · S · E - 0.2 · P');
  });

  it('a substituição numérica, que é o que faz a folha ser MEMÓRIA de cálculo', () => {
    const f = formulaDoLatex('$$ t_{req} = \\frac{1.0000 \\cdot 500.0000}{2(138.0000 \\cdot 0.8500) - 0.2(1.0000)} $$')!;
    expect(f.numerador).toBe('1.0000 · 500.0000');
    expect(f.denominador).toBe('2(138.0000 · 0.8500) - 0.2(1.0000)');
  });

  it('o resultado com unidade sai em linha, com a unidade preservada', () => {
    const f = formulaDoLatex('$$ t_{req} = 2.1331 \\text{ mm} $$')!;
    expect(f.expressao).toBe('2.1331 mm');
    expect(f.numerador).toBeUndefined();
  });

  it('a PMTA com T_{util} no numerador e no denominador', () => {
    const f = formulaDoLatex('$$ PMTA = \\frac{2 \\cdot S \\cdot E \\cdot T_{util}}{D + 0.2 \\cdot T_{util}} $$')!;
    expect(f.lhs).toBe('PMTA');
    expect(f.numerador).toBe('2 · S · E · T_{util}');
    expect(f.denominador).toBe('D + 0.2 · T_{util}');
  });

  it('linha que não é fórmula devolve null — o texto normal segue impresso', () => {
    expect(formulaDoLatex('STATUS: APROVADO. A espessura útil é maior…')).toBeNull();
    expect(formulaDoLatex('Norma Base: ASME Sec. VIII Div. 1')).toBeNull();
    expect(ehFormulaLatex('$$ PMTA = 2.2712 \\text{ MPa} $$')).toBe(true);
    expect(ehFormulaLatex('P = 1.0000 MPa (Pressão de Projeto estipulada)')).toBe(false);
  });

  it('NENHUMA marca de LaTeX sobra no papel', () => {
    const linhas = [
      '$$ t_{req} = \\frac{P \\cdot D}{2 \\cdot S \\cdot E - 0.2 \\cdot P} $$',
      '$$ PMTA = \\frac{2(138.0000) \\cdot 0.8500 \\cdot 4.8500}{500.0000 + 0.2(4.8500)} $$',
      '$$ t = d \\cdot C \\cdot \\sqrt{\\frac{P}{S}} $$',
    ];
    for (const l of linhas) {
      const f = formulaDoLatex(l)!;
      const tudo = [f.lhs, f.numerador, f.denominador, f.expressao].filter(Boolean).join(' ');
      expect(tudo).not.toContain('\\');
      expect(tudo).not.toContain('$$');
      expect(tudo).not.toContain('frac');
      expect(tudo).not.toContain('text');
    }
  });
});

describe('as peças da tradução', () => {
  it('a chave aninhada não engana o separador da fração', () => {
    const p = partirFrac('\\frac{2 \\cdot S \\text{ mm}}{D + 1}')!;
    expect(p.numerador).toBe('2 \\cdot S \\text{ mm}');
    expect(p.denominador).toBe('D + 1');
  });

  it('os símbolos traduzidos existem no subconjunto de Carlito', () => {
    // Símbolo fora do subconjunto reintroduz o truncamento que este módulo
    // conserta — o defeito medido em 05/09/2026.
    const script = readFileSync('scripts/fontes/subset-carlito.mjs', 'utf8');
    const lista = script.slice(script.indexOf('const CARACTERES'), script.indexOf('const ORIGENS'));
    const traduzido = simbolosDoLatex('a \\cdot b \\times c \\div d \\pm e \\leq f \\geq g \\neq h \\alpha \\sqrt{i} j^{2}');
    for (const c of traduzido) {
      if (c === ' ') continue;
      expect(lista.includes(c) || /[a-z0-9()]/i.test(c), `fora do subconjunto: ${c}`).toBe(true);
    }
  });

  it('o subscrito é separado para ser DESENHADO menor, não escrito com underline', () => {
    expect(pedacosComSubscrito('T_{util}')).toEqual([
      { texto: 'T', subscrito: false },
      { texto: 'util', subscrito: true },
    ]);
    expect(pedacosComSubscrito('2 · S · E · T_{util}').filter((p) => p.subscrito)).toHaveLength(1);
    expect(pedacosComSubscrito('D + 0.2')).toEqual([{ texto: 'D + 0.2', subscrito: false }]);
  });

  it('o gerador desenha o subscrito, em vez de imprimir a chave', () => {
    const documento = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
    expect(documento).toContain('textoComSubscrito');
    expect(documento).toContain('pedacosComSubscrito');
  });
});

describe('o amarelo da prévia não invade linha já respondida', () => {
  it('coluna de marcação vazia NÃO fica amarela', () => {
    const marca = { texto: '', valor: true, semDestaque: true };
    expect(celulaVazia(marca)).toBe(false);
    expect(corDeFundo(marca, 'preview')).toBe('#ffffff');
  });

  it('campo de dado vazio continua amarelo — a pendência real não some', () => {
    const campo = { texto: '', valor: true };
    expect(celulaVazia(campo)).toBe(true);
    expect(corDeFundo(campo, 'preview')).not.toBe('#ffffff');
  });

  it('no documento final nada é amarelo, marcado ou não', () => {
    expect(corDeFundo({ texto: '', valor: true }, 'final')).toBe('#ffffff');
    expect(corDeFundo({ texto: 'X', valor: true, semDestaque: true }, 'final')).toBe('#ffffff');
  });

  it('as folhas marcam as colunas com semDestaque', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    const trecho = folhas.slice(folhas.indexOf('function celulaMarca'), folhas.indexOf('function celulaMarca') + 400);
    expect(trecho).toContain('semDestaque: true');
  });
});
