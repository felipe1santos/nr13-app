import { describe, expect, it } from 'vitest';
import { calcularResumoCaldeira, type CaldeiraSalva } from '../caldeiraMemorialService';

const planilha: CaldeiraSalva = {
  tag: 'CAL1',
  P: 0.9,
  temp: 200,
  costado: { D: 1200, S: 108, E: 0.9, y: 0.4, C: 0, espProjeto: 10, espEncontrada: 10, mat: 'A285C' },
  tubo: { D: 88.9, S: 90, fatorE: 0.12, espProjeto: 3.05, espEncontrada: 3.3, mat: 'A178A' },
  espelho: { S: 118, passo: 215, cEstais: 2.2, espProjeto: 12.7, espEncontrada: 12.7, mat: 'A285C' },
};

describe('calcularResumoCaldeira', () => {
  it('caso da planilha: 3 etapas aprovadas, PMTA 9,18 e TH 13,77 kgf/cm²', () => {
    const r = calcularResumoCaldeira(planilha);
    expect(r.etapas).toHaveLength(3);
    expect(r.resultado).toBe('APROVADO');
    expect(r.pmtaKgf).toBeCloseTo(9.18, 2);
    expect(r.thKgf).toBeCloseTo(13.77, 2);
    expect(r.etapas[0].resultado.e).toBeCloseTo(5.535, 2);
    expect(r.etapas[1].resultado.e).toBeCloseTo(1.01, 2);
    expect(r.etapas[2].resultado.e).toBeCloseTo(12.66, 2);
  });

  it('uma etapa reprovada → REPROVADO', () => {
    const r = calcularResumoCaldeira({ ...planilha, tubo: { ...planilha.tubo, espEncontrada: 0.5 } });
    expect(r.resultado).toBe('REPROVADO');
  });

  it('campo obrigatório vazio → PENDENTE', () => {
    const r = calcularResumoCaldeira({ ...planilha, costado: { ...planilha.costado, S: '' } });
    expect(r.resultado).toBe('PENDENTE');
  });

  it('P vazio → PENDENTE e PMTA nula', () => {
    const r = calcularResumoCaldeira({ ...planilha, P: '' });
    expect(r.resultado).toBe('PENDENTE');
    expect(r.pmtaKgf).toBeNull();
  });

  it('log completo tem os 3 blocos + bloco de PMTA/TH final', () => {
    const log = calcularResumoCaldeira(planilha).logCompleto.join('\n');
    expect(log).toContain('MEMORIAL DE CÁLCULO: COSTADO');
    expect(log).toContain('MEMORIAL DE CÁLCULO: TUBO');
    expect(log).toContain('MEMORIAL DE CÁLCULO: ESPELHO');
    expect(log).toContain('PMTA');
    expect(log).toContain('TESTE HIDROSTÁTICO');
  });
});
