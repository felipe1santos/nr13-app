import { describe, expect, it } from 'vitest';
import { cilindrica, retangular } from '../autoclave';

describe('autoclave.retangular — fórmula corrigida (ASME UG-47, ver plano de refatoração)', () => {
  // A fórmula mudou de 0.51*K*P/(S*E) (ad-hoc, sem base normativa) para a fórmula real de
  // UG-47: t_min = a*sqrt(P/(S*C)). Testamos consistência interna: PMTA(t_real=t_min) == P.
  it('PMTA calculada com t_real = t_min recupera a pressão de projeto', () => {
    const dados = { pressao: 0.29, tensao: 115.14, c_stay: 2.1, espacamento: 120, diametro_tirante: 100, espessura: 0 };
    const r1 = retangular({ ...dados, espessura: 4.8 });
    const r2 = retangular({ ...dados, espessura: Number(r1.t_min) });
    expect(Number(r2.pmta)).toBeCloseTo(dados.pressao, 2);
  });

  it('reprova quando a espessura real é menor que a mínima requerida', () => {
    const r = retangular({
      pressao: 0.29,
      tensao: 115.14,
      c_stay: 2.1,
      espacamento: 120,
      diametro_tirante: 100,
      espessura: 0.1,
    });
    expect(r.resultado).toBe('REPROVADO');
  });

  it('sinaliza passo fora do limite geométrico UG-47 (215mm)', () => {
    const r = retangular({
      pressao: 0.29,
      tensao: 115.14,
      c_stay: 2.1,
      espacamento: 300,
      diametro_tirante: 100,
      espessura: 20,
    });
    expect(r.log.join('\n')).toContain('excede 215 mm');
  });
});

describe('autoclave.cilindrica — UG-27(c), verbatim', () => {
  it('adota a pior entre junta circunferencial e longitudinal', () => {
    const r = cilindrica({ pressao: 1.5, tensao: 137.9, eficiencia: 0.85, diametro: 1000, espessura: 12, ca: 1.5 });
    // t_min_circ = P*R/(S*E-0.6P); t_min_long = P*R/(2*S*E+0.4P) -> circ é sempre >= long pra P>0
    const R = 500;
    const tCirc = (1.5 * R) / (137.9 * 0.85 - 0.6 * 1.5);
    expect(Number(r.t_min)).toBeCloseTo(tCirc, 2);
  });
});
