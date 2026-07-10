import { describe, expect, it } from 'vitest';
import { dimensoesTampo, comprimentoTotalMm, circunferenciaMm, volumeInternoM3, volumeAcoM3, pesosKg } from '../geometriaVaso';
import type { ModeloVaso } from '../tiposModelador';

function modeloBase(): ModeloVaso {
  return {
    tag: 'T1', orientacao: 'horizontal', diametroInterno: 1000, comprimentoCilindro: 2000,
    espessuraCasco: 10, tampo1: { tipo: 'eliptico', espessura: 10 }, tampo2: { tipo: 'eliptico', espessura: 10 },
    bocais: [], suporte: { tipo: 'nenhum', altura: '', quantidade: '' }, densidadeAco: 7850,
    pesoOperacao: '', material: 'SA-516-70',
  };
}

describe('dimensoesTampo', () => {
  it('elíptico 2:1: h = D/4', () => {
    expect(dimensoesTampo('eliptico', 1000, 10).profundidade).toBeCloseTo(250, 5);
  });
  it('toriesférico Klopper: h=0,1935D, coroa=D, canto=0,1D', () => {
    const d = dimensoesTampo('toriesferico', 1000, 10);
    expect(d.profundidade).toBeCloseTo(193.5, 1);
    expect(d.raioCoroa).toBe(1000);
    expect(d.raioCanto).toBeCloseTo(100, 5);
  });
  it('hemisférico: h = D/2; plano: h = t', () => {
    expect(dimensoesTampo('hemisferico', 1000, 10).profundidade).toBe(500);
    expect(dimensoesTampo('plano', 1000, 12).profundidade).toBe(12);
  });
});

describe('derivadas do modelo Ø1000 L2000 t10 elíptico×2', () => {
  it('comprimento total = 2000 + 250 + 250', () => {
    expect(comprimentoTotalMm(modeloBase())).toBeCloseTo(2500, 3);
  });
  it('circunferência = π·1020', () => {
    expect(circunferenciaMm(modeloBase())).toBeCloseTo(Math.PI * 1020, 1);
  });
  it('volume interno ≈ 1,8326 m³ (cilindro 1,5708 + 2 tampos 0,2618)', () => {
    expect(volumeInternoM3(modeloBase())).toBeCloseTo(1.8326, 3);
  });
  it('volume de aço ≈ 0,0851 m³ e peso vazio ≈ 668 kg', () => {
    const va = volumeAcoM3(modeloBase())!;
    expect(va).toBeCloseTo(0.0851, 3);
    const p = pesosKg(modeloBase());
    expect(p.vazioKg!).toBeCloseTo(668, 0);
    expect(p.cheioDaguaKg!).toBeCloseTo(668 + 1832.6, 0);
    expect(p.operacaoKg).toBe(p.cheioDaguaKg); // default
  });
  it('entrada incompleta → null (nunca NaN)', () => {
    const m = { ...modeloBase(), diametroInterno: '' as const };
    expect(volumeInternoM3(m)).toBeNull();
    expect(pesosKg(m).vazioKg).toBeNull();
    expect(comprimentoTotalMm(m)).toBeNull();
  });
  it('bocal soma aço; saia soma casca', () => {
    const m = modeloBase();
    m.bocais = [{ id: 'N1', doMemorial: false, servico: '', dn: '', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 500, angulo: 0, projecao: 150 }];
    m.suporte = { tipo: 'saia', altura: 300, quantidade: '' };
    const base = volumeAcoM3(modeloBase())!;
    expect(volumeAcoM3(m)!).toBeGreaterThan(base);
  });
});
