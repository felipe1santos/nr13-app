import { describe, expect, it } from 'vitest';
import { calcularCategoriaNR13 } from '../../calc/categoria';
import { motivoVasoNaoCategorizado, precisaRecalcularClasseA } from './naoCategorizadoVaso';

describe('NR-13 13.2.1 b/c — enquadramento do vaso', () => {
  it('P·V ≤ 8 com fluido classe C: não enquadra', () => {
    const r = calcularCategoriaNR13(0.01, 0.5, 'C - Ar comprimido'); // 500 kPa × 0,01 = 5
    expect(r.isEnquadrado).toBe(false);
    expect(r.catFinal).toBe('N/A (Não Enquadra)');
  });
  it('fluido classe A enquadra mesmo com P·V ≤ 8 (13.2.1 c)', () => {
    const r = calcularCategoriaNR13(0.01, 0.5, 'A - Hidrogênio');
    expect(r.isEnquadrado).toBe(true);
    expect(r.catFinal).toBe('III'); // classe A × grupo 5
  });
  it('P·V > 8 continua enquadrando como sempre', () => {
    expect(calcularCategoriaNR13(1, 1, 'C - Ar comprimido').isEnquadrado).toBe(true);
  });
});

describe('motivo do não categorizado', () => {
  it('escreve o P×V e o item', () => {
    const m = motivoVasoNaoCategorizado({ isEnquadrado: false, PV_enq: '5.0000', classe: 'C' });
    expect(m).toBe('Equipamento não categorizado pela NR-13, pois o produto P×V (5,00 kPa·m³) não é superior a 8 e o fluido não é da classe A (NR-13, item 13.2.1 b e c).');
  });
  it('enquadrado ou nunca avaliado = sem aviso', () => {
    expect(motivoVasoNaoCategorizado({ isEnquadrado: true, PV_enq: '50', classe: 'C' })).toBeNull();
    expect(motivoVasoNaoCategorizado(null)).toBeNull();
  });
  it('registro antigo classe A "não enquadra" não vira não categorizado — pede recálculo', () => {
    const cat = { isEnquadrado: false, PV_enq: '5', classe: 'A' as const };
    expect(motivoVasoNaoCategorizado(cat)).toBeNull();
    expect(precisaRecalcularClasseA(cat)).toBe(true);
  });
});
