import { describe, expect, it } from 'vitest';
import { calcularComponenteVaso, gerarBlocoComponenteVaso } from '../vaso';

describe('vaso — cascos e tampos (ASME VIII Div.1, verbatim do math.js)', () => {
  it('casco cilíndrico UG-27(c)(1): aprova quando t_util >= t_req', () => {
    const log = gerarBlocoComponenteVaso(
      'Casco',
      'cilindrico',
      { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, mat: 'SA-516-70', temp: 100 },
      1000,
      1.5,
    );
    expect(log.join('\n')).toContain('msg-aprovado');
  });

  it('tampo elíptico 2:1 UG-32(c) calcula sem erro', () => {
    const log = gerarBlocoComponenteVaso('Tampo Superior', 'eliptico', { t_comercial: 10, ca: 1.5, S: 137.9, E: 1 }, 1000, 1.5);
    expect(log.some((l) => l.includes('PMTA'))).toBe(true);
  });

  it('tampo cônico UG-32(g) — novo, usa meio-ângulo alfa', () => {
    const log = gerarBlocoComponenteVaso('Tampo Cônico', 'cone', { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, alfa: 30 }, 1000, 1.5);
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});

describe('vaso — extração de pmta/t_min (calcularComponenteVaso)', () => {
  // Regressão: a linha de resultado emite `\text{ mm}`/`\text{ MPa}` (sem espaço antes do `}`) e o
  // regex exigia espaço, então pmta/t_min vinham '' para cilíndrico/elíptico/etc — quebrava a
  // injeção na ficha (PMTA 0.00, card mostrando "—") apesar de resultado APROVADO.
  it('elíptico: pmta e t_min são numéricos, não vazios', () => {
    const r = calcularComponenteVaso('Tampo', 'eliptico', { t_comercial: 10, ca: 1.5, S: 137.9, E: 0.85, temp: 100 }, 1000, 1.5);
    expect(r.pmta).not.toBe('');
    expect(r.t_min).not.toBe('');
    expect(Number.isFinite(parseFloat(r.pmta))).toBe(true);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
  });

  it('cilíndrico: pmta e t_min são numéricos, não vazios', () => {
    const r = calcularComponenteVaso('Casco', 'cilindrico', { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, temp: 100 }, 1000, 1.5);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
    expect(parseFloat(r.t_min)).toBeGreaterThan(0);
  });

  it('planoAparafusado (linha com espaço final): continua extraindo', () => {
    const r = calcularComponenteVaso('Tampa', 'planoAparafusado', { t_comercial: 20, ca: 1.5, S: 137.9, E: 1, N_parafusos: 8, d_parafuso: 25, S_parafuso: 137.9 }, 600, 1.5);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
  });
});

describe('vaso — flange (bug de dispatch corrigido)', () => {
  it('flange agora calcula (no math.js original esse branch nunca executava)', () => {
    const log = gerarBlocoComponenteVaso(
      'Flange Casco',
      'flange',
      { A: 600, D: 500, C: 560, t: 40, S: 137.9, P: 1.5, G: 480, b: 10, m: 2, y: 20 },
      1000,
      1.5,
    );
    expect(log.join('\n')).toContain('ESPESSURA MÍNIMA REQUERIDA');
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});

describe('vaso — bocal UG-37', () => {
  it('exige dadosCascoRef, senão retorna erro sistêmico', () => {
    const log = gerarBlocoComponenteVaso('Bocal N1', 'bocal', { d: 150, t_comercial: 10, ca: 1.5 }, 1000, 1.5);
    expect(log[0]).toContain('ERRO SISTÊMICO');
  });

  it('calcula área de compensação quando o casco de referência é informado', () => {
    const log = gerarBlocoComponenteVaso(
      'Bocal N1',
      'bocal',
      {
        d: 150,
        t_comercial: 10,
        ca: 1.5,
        proj_int: 0,
        dadosCascoRef: { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85 },
      },
      1000,
      1.5,
    );
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});
