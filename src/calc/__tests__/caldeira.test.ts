import { describe, expect, it } from 'vitest';
import {
  calcularCostadoCaldeira,
  calcularEspelhoCaldeira,
  calcularTuboCaldeira,
  pmtaCaldeiraKgf,
  thCaldeiraKgf,
} from '../caldeira';

describe('caldeira — costado PG-27.2.2 (valores da planilha)', () => {
  const dados = { D: 1200, S: 108, E: 0.9, y: 0.4, C: 0, espProjeto: 10, espEncontrada: 10, mat: 'ASTM A285 C' };
  it('e = 5,535 mm com P=0,9 D=1200 S=108 E=0,90 y=0,40 C=0', () => {
    const r = calcularCostadoCaldeira(0.9, 25, dados);
    expect(r.e).toBeCloseTo(5.535, 2);
    expect(r.resultado).toBe('APROVADO');
    expect(r.faltantes).toEqual([]);
  });
  it('reprova quando espessura encontrada < e', () => {
    const r = calcularCostadoCaldeira(0.9, 25, { ...dados, espEncontrada: 5 });
    expect(r.resultado).toBe('REPROVADO');
  });
  it('log tem header de bloco e fórmula da norma', () => {
    const r = calcularCostadoCaldeira(0.9, 25, dados);
    const log = r.log.join('\n');
    expect(log).toContain('MEMORIAL DE CÁLCULO: COSTADO');
    expect(log).toContain('PG-27.2.2');
  });
  it('faltantes quando D/S/E/espessura vazios', () => {
    const r = calcularCostadoCaldeira(0.9, 25, {});
    expect(r.faltantes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('caldeira — tubo PG-27.2.1 (valores da planilha)', () => {
  it('e = 1,01 mm com P=0,9 S=90 D=88,9 fatorE=0,12', () => {
    const r = calcularTuboCaldeira(0.9, 25, { D: 88.9, S: 90, fatorE: 0.12, espProjeto: 3.05, espEncontrada: 3.3 });
    expect(r.e).toBeCloseTo(1.01, 2);
    expect(r.resultado).toBe('APROVADO');
  });
});

describe('caldeira — espelho PG-46.1 (valores da planilha)', () => {
  it('e = 12,66 mm com P=0,9 S=118 p=215 C=2,2', () => {
    const r = calcularEspelhoCaldeira(0.9, 25, { S: 118, passo: 215, cEstais: 2.2, espProjeto: 12.7, espEncontrada: 12.7 });
    expect(r.e).toBeCloseTo(12.66, 2);
    expect(r.resultado).toBe('APROVADO');
  });
  it('cEstais vazio assume 2,2 (estais soldados)', () => {
    const r = calcularEspelhoCaldeira(0.9, 25, { S: 118, passo: 215, espEncontrada: 12.7 });
    expect(r.e).toBeCloseTo(12.66, 2);
  });
});

describe('caldeira — PMTA/TH (planilha: PMTA 9,18 / TH 13,77 p/ P=0,9 MPa)', () => {
  it('PMTA = P × 10,19716 kgf/cm²', () => expect(pmtaCaldeiraKgf(0.9)).toBeCloseTo(9.18, 2));
  it('TH = 1,5 × PMTA', () => expect(thCaldeiraKgf(0.9)).toBeCloseTo(13.77, 2));
});
