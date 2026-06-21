import { describe, expect, it } from 'vitest';
import { costado, espelhoEstaiado, fornalhaOndulada } from '../caldeira';

describe('caldeira.costado — PG-27.2.2', () => {
  // Caso de referência do plano de refatoração (mesmos números do math.js original):
  // P=0,78; D=1100; T=300°C; S=108; E=0,7; y=0,4; CA=1,5; Tnom=8,68 → t_min≈7,15mm, PMTA≈0,99MPa, APROVADO.
  it('reproduz o caso de referência costado/caldeira', () => {
    const r = costado({
      pressao: 0.78,
      diametro_externo: 1100,
      tensao: 108,
      eficiencia: 0.7,
      y: 0.4,
      ca: 1.5,
      temperatura: 300,
      t_comercial: 8.68,
    });
    expect(Number(r.t_min)).toBeCloseTo(7.15, 1);
    expect(Number(r.pmta)).toBeCloseTo(0.99, 1);
    expect(r.resultado).toBe('APROVADO');
  });

  it('obtém y automaticamente pela temperatura quando não informado', () => {
    const semY = costado({
      pressao: 0.78,
      diametro_externo: 1100,
      tensao: 108,
      eficiencia: 0.7,
      ca: 1.5,
      temperatura: 300,
      t_comercial: 8.68,
    });
    const comY = costado({
      pressao: 0.78,
      diametro_externo: 1100,
      tensao: 108,
      eficiencia: 0.7,
      y: 0.4,
      ca: 1.5,
      temperatura: 300,
      t_comercial: 8.68,
    });
    expect(semY.t_min).toBe(comY.t_min);
    expect(semY.pmta).toBe(comY.pmta);
  });

  it('aplica o piso PG-16.3 de 6mm quando a fórmula daria menos que isso', () => {
    const r = costado({
      pressao: 0.05,
      diametro_externo: 200,
      tensao: 200,
      eficiencia: 1,
      y: 0.4,
      ca: 0,
      temperatura: 100,
      t_comercial: 6,
    });
    expect(Number(r.t_min)).toBeGreaterThanOrEqual(6);
  });
});

describe('caldeira.espelhoEstaiado — PG-46.1 (mesma física do UG-47 usado no autoclave retangular)', () => {
  it('PMTA(t_util) e t_min(P) são inversas uma da outra', () => {
    const dados = { pressao: 1.0, tensao: 100, passo: 150, c_stay: 2.1, ca: 0, t_comercial: 10 };
    const r = espelhoEstaiado(dados);
    // recalcula PMTA usando o próprio t_min como t_util — deve devolver a pressão original
    const r2 = espelhoEstaiado({ ...dados, t_comercial: Number(r.t_min) });
    expect(Number(r2.pmta)).toBeCloseTo(dados.pressao, 2);
  });
});

describe('caldeira.fornalhaOndulada — PFT-19 (ressalva mantida, não corrigida)', () => {
  it('usa o coeficiente certo por tipo de fornalha e mantém o aviso de não verificado', () => {
    const base = { pressao: 1, diametro_medio: 800, ca: 0, t_comercial: 10 };
    const fox = fornalhaOndulada({ ...base, tipo_fornalha: 'fox' });
    const morison = fornalhaOndulada({ ...base, tipo_fornalha: 'morison' });
    const leeds = fornalhaOndulada({ ...base, tipo_fornalha: 'leeds' });
    expect(Number(fox.t_min)).toBeCloseTo((1 * 800) / 97, 2);
    expect(Number(morison.t_min)).toBeCloseTo((1 * 800) / 108, 2);
    expect(Number(leeds.t_min)).toBeCloseTo((1 * 800) / 119, 2);
    expect(fox.log.join('\n')).toContain('NÃO VERIFICADO');
  });
});
