import { describe, expect, it } from 'vitest';
import { cilindrica, retangular, vertical } from '../autoclave';

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

  it('parede grossa (R − 0,4·t_util ≤ 0): aviso de limite de aplicação da UG-27(c)(2)', () => {
    const r = cilindrica({ pressao: 1, tensao: 138, eficiencia: 1, diametro: 100, espessura: 130, ca: 0 });
    const log = r.log.join('\n');
    expect(log).toContain('Limite de aplicação');
    expect(log).toContain('NÃO APLICÁVEL');
    expect(Number(r.pmta)).toBeGreaterThan(0); // min() fica na junta circunferencial, não Infinity
    expect(Number.isFinite(Number(r.pmta))).toBe(true);
  });
});

describe('autoclave vertical', () => {
  // Autoclave_vertical_corrigida_ASME (1).xlsx — fórmula padrão UG-34/UG-27
  // (sem o fator /10 espúrio da planilha, que era bug de unidade cm×mm)
  const base = {
    pressao: 0.2, diametro: 400, tensao: 138, eficiencia: 1, ca: 1, c_fator: 0.33,
    t_tampo: 8, t_costado: 4, t_fundo: 6, n_travas: 6, d_trava: 12, tensao_trava: 120,
  };

  it('tampo reprova (t_req 8.7477 > 8), travas aprovam, geral REPROVADO', () => {
    const r = vertical(base);
    expect(parseFloat(r.t_min)).toBeCloseTo(8.7477, 3);
    expect(r.resultado).toBe('REPROVADO');
    expect(r.log.join('\n')).toContain('TRAVAS');
  });

  it('costado aprova no caso da planilha (t_req 0.2901)', () => {
    const r = vertical(base);
    expect(r.log.join('\n')).toMatch(/0\.2901/);
    expect(r.log.join('\n')).toMatch(/4188\.79/); // carga por trava (N)
  });

  it('fundo cônico bate com a planilha do cone (α=15°, D=680, P=0.69, S=108, E=0.8, t=6.51)', () => {
    const r = vertical({
      pressao: 0.69, diametro: 680, tensao: 108, eficiencia: 0.8, ca: 0, c_fator: 0.3,
      t_tampo: 30, t_costado: 10, t_fundo: 6.51, tipo_fundo: 'conico', alfa: 15,
      n_travas: 8, d_trava: 20, tensao_trava: 138,
    });
    // t_req cone = P·D/(2·cosα·(S·E − 0.6·P)) = 2.8246 mm; PMTA cone = t·S·E/((D/2cosα)+0.6t) = 1.5804
    expect(r.log.join('\n')).toMatch(/2.8246/);
    expect(r.log.join('\n')).toMatch(/1\.5804/);
  });
});
