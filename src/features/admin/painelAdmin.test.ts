import { describe, it, expect } from 'vitest';
import {
  MENSALIDADE_PADRAO,
  chaveDia,
  serieDiaria,
  somaSerie,
  variacaoPercentual,
  pontosSparkline,
  areaSparkline,
  fmtBRL,
  calcularFaturamento,
} from './painelAdmin';

describe('MENSALIDADE_PADRAO', () => {
  it('é 197 — valor combinado com o dono do produto', () => {
    expect(MENSALIDADE_PADRAO).toBe(197);
  });
});

describe('chaveDia', () => {
  it('devolve AAAA-MM-DD no fuso de São Paulo', () => {
    // 2026-09-01T02:00:00Z = 31/08 23h em São Paulo (UTC-3). O dia do painel é
    // o dia do dono do produto, não o dia UTC — sem isso todo evento da noite
    // aparece no dia seguinte.
    expect(chaveDia('2026-09-01T02:00:00Z')).toBe('2026-08-31');
    expect(chaveDia('2026-09-01T15:00:00Z')).toBe('2026-09-01');
  });

  it('devolve null para entrada inválida ou ausente', () => {
    expect(chaveDia(null)).toBeNull();
    expect(chaveDia('')).toBeNull();
    expect(chaveDia('nao-e-data')).toBeNull();
  });
});

describe('serieDiaria', () => {
  const ate = new Date('2026-09-01T12:00:00Z'); // 01/09 09h em SP

  it('devolve exatamente `dias` pontos, do mais antigo ao mais recente', () => {
    const s = serieDiaria([], 7, ate);
    expect(s).toHaveLength(7);
    expect(s[0].dia).toBe('2026-08-26');
    expect(s[6].dia).toBe('2026-09-01');
  });

  it('conta os eventos no dia certo e preenche buraco com zero', () => {
    const s = serieDiaria(
      ['2026-09-01T13:00:00Z', '2026-09-01T14:00:00Z', '2026-08-30T13:00:00Z'],
      3,
      ate,
    );
    expect(s.map((p) => p.valor)).toEqual([1, 0, 2]); // 30/08, 31/08, 01/09
  });

  it('ignora data fora da janela, nula ou inválida em vez de quebrar', () => {
    const s = serieDiaria(['2020-01-01T00:00:00Z', null, 'lixo'], 3, ate);
    expect(s.map((p) => p.valor)).toEqual([0, 0, 0]);
  });
});

describe('somaSerie', () => {
  it('soma os valores', () => {
    expect(somaSerie([{ dia: 'a', valor: 2 }, { dia: 'b', valor: 5 }])).toBe(7);
  });
  it('série vazia soma zero', () => {
    expect(somaSerie([])).toBe(0);
  });
});

describe('variacaoPercentual', () => {
  const s = (vs: number[]) => vs.map((v, i) => ({ dia: String(i), valor: v }));

  it('compara a metade recente com a anterior', () => {
    expect(variacaoPercentual(s([1, 1, 2, 2]))).toBe(100); // 2 -> 4
    expect(variacaoPercentual(s([4, 4, 2, 2]))).toBe(-50); // 8 -> 4
  });

  it('devolve null quando a metade anterior é zero — divisão por zero não é "subiu 100%"', () => {
    expect(variacaoPercentual(s([0, 0, 3, 3]))).toBeNull();
  });

  it('devolve null com menos de dois pontos', () => {
    expect(variacaoPercentual(s([5]))).toBeNull();
    expect(variacaoPercentual([])).toBeNull();
  });
});

describe('pontosSparkline', () => {
  it('primeiro ponto encosta na esquerda e o último na direita', () => {
    const pts = pontosSparkline([{ dia: 'a', valor: 0 }, { dia: 'b', valor: 10 }], 100, 40);
    const [p1, p2] = pts.split(' ');
    expect(p1.split(',')[0]).toBe('0');
    expect(p2.split(',')[0]).toBe('100');
  });

  it('valor máximo fica no topo e o mínimo na base', () => {
    const pts = pontosSparkline([{ dia: 'a', valor: 0 }, { dia: 'b', valor: 10 }], 100, 40);
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys[1]).toBeLessThan(ys[0]); // y do SVG cresce para baixo
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
  });

  it('série toda zerada vira linha reta na base, sem NaN', () => {
    const pts = pontosSparkline([{ dia: 'a', valor: 0 }, { dia: 'b', valor: 0 }], 100, 40);
    expect(pts).not.toMatch(/NaN/);
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
  });

  it('série vazia devolve string vazia — o <polyline> some em vez de desenhar lixo', () => {
    expect(pontosSparkline([], 100, 40)).toBe('');
  });

  it('ponto único não divide por zero', () => {
    const pts = pontosSparkline([{ dia: 'a', valor: 3 }], 100, 40);
    expect(pts).not.toMatch(/NaN/);
  });
});

describe('areaSparkline', () => {
  it('fecha o polígono na base para o preenchimento', () => {
    const d = areaSparkline([{ dia: 'a', valor: 1 }, { dia: 'b', valor: 2 }], 100, 40);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/NaN/);
  });

  it('série vazia devolve string vazia', () => {
    expect(areaSparkline([], 100, 40)).toBe('');
  });
});

describe('fmtBRL', () => {
  it('formata no padrão brasileiro', () => {
    expect(fmtBRL(197)).toBe('R$ 197,00');
    expect(fmtBRL(1970.5)).toBe('R$ 1.970,50');
    expect(fmtBRL(0)).toBe('R$ 0,00');
  });
  it('valor inválido vira travessão em vez de "R$ NaN"', () => {
    expect(fmtBRL(NaN)).toBe('—');
    expect(fmtBRL(null)).toBe('—');
  });
});

describe('calcularFaturamento', () => {
  it('MRR = assinantes x mensalidade; anual = MRR x 12', () => {
    const f = calcularFaturamento(10, 197);
    expect(f.mrr).toBe(1970);
    expect(f.anual).toBe(23640);
    expect(f.assinantes).toBe(10);
  });
  it('sem assinantes, tudo zero (e não NaN)', () => {
    const f = calcularFaturamento(0, 197);
    expect(f.mrr).toBe(0);
    expect(f.anual).toBe(0);
  });
});
