import { describe, expect, it } from 'vitest';
import { KGF_POR_MPA, classificarCaldeira, numeroBr, volumeCaldeira } from './classificacaoCaldeira';

const MPA_POR_KGF = 1 / KGF_POR_MPA;

describe('numeroBr', () => {
  it('lê vírgula decimal e milhar com ponto', () => {
    expect(numeroBr('1.234,5')).toBe(1234.5);
    expect(numeroBr('302,57')).toBeCloseTo(302.57);
    expect(numeroBr('850')).toBe(850);
  });
  it('vazio, zero e lixo = null', () => {
    expect(numeroBr('')).toBeNull();
    expect(numeroBr('0')).toBeNull();
    expect(numeroBr('abc')).toBeNull();
    expect(numeroBr(undefined)).toBeNull();
  });
});

describe('volumeCaldeira', () => {
  it('corpo cilíndrico π·D²/4·L em m³', () => {
    const v = volumeCaldeira({ volume: { corpoDiametro: '1000', corpoComprimento: '1000' } });
    expect(v.corpo.m3).toBeCloseTo(Math.PI / 4, 6);
    expect(v.corpo.fonte).toBe('calculado');
    expect(v.totalM3).toBeCloseTo(Math.PI / 4, 6);
    expect(v.fonteTotal).toBe('soma');
  });

  it('tampos pelas fórmulas do modelador de vaso', () => {
    const d = 1000;
    const v = volumeCaldeira({
      volume: { corpoDiametro: '1000', corpoComprimento: '0,001', tampo1Tipo: 'eliptico', tampo1Diametro: '1000', tampo2Tipo: 'hemisferico', tampo2Diametro: '1000' },
    });
    expect(v.tampo1.m3).toBeCloseTo((Math.PI * d ** 3) / 24 / 1e9, 6);
    expect(v.tampo2.m3).toBeCloseTo((Math.PI * d ** 3) / 12 / 1e9, 6);
  });

  it('tampo plano (espelho) = 0 sem pedir diâmetro', () => {
    const v = volumeCaldeira({ volume: { corpoDiametro: '1000', corpoComprimento: '1000', tampo1Tipo: 'plano' } });
    expect(v.tampo1.m3).toBe(0);
  });

  it('litros informados vencem o cálculo da parte — esboço do engenheiro', () => {
    const v = volumeCaldeira({
      volume: { corpoLitros: '302,57563', tampo1Litros: '26,385591', tampo2Litros: '66,867542' },
    });
    expect((v.totalM3 ?? 0) * 1000).toBeCloseTo(395.82876, 4);
    expect(v.corpo.fonte).toBe('informado');
  });

  it('total informado vence a soma', () => {
    const v = volumeCaldeira({ volume: { corpoLitros: '300', totalLitros: '450' } });
    expect(v.totalM3).toBeCloseTo(0.45);
    expect(v.fonteTotal).toBe('informado');
  });

  it('sem corpo não há soma', () => {
    expect(volumeCaldeira({ volume: { tampo1Litros: '30' } }).totalM3).toBeNull();
    expect(volumeCaldeira(null).totalM3).toBeNull();
  });
});

describe('classificarCaldeira (NR-13 13.2.1 a, 13.2.2 k, 13.4.1.1)', () => {
  it('exatamente 1.960 kPa = A (igual OU superior)', () => {
    expect(classificarCaldeira(1.96, 0.4).categoria).toBe('A');
  });
  it('logo abaixo de 1.960 kPa = B', () => {
    expect(classificarCaldeira(1.959, 0.4).categoria).toBe('B');
  });
  it('caso real CAL-25/5340: PMO 10,10 kgf/cm² = B', () => {
    const c = classificarCaldeira(10.1 * MPA_POR_KGF, 0.4);
    expect(c.categoria).toBe('B');
    expect(c.situacao).toBe('aplica');
    expect(c.item).toBe('NR-13 13.4.1.1');
  });
  it('60 kPa exatos = fora (a norma exige SUPERIOR a 60 kPa)', () => {
    const c = classificarCaldeira(0.06, 0.4);
    expect(c.situacao).toBe('fora-pressao');
    expect(c.categoria).toBeNull();
  });
  it('volume abaixo de 100 L = fora da NR-13, mesmo com pressão de categoria A', () => {
    const c = classificarCaldeira(3, 0.099);
    expect(c.situacao).toBe('fora-volume');
    expect(c.categoria).toBeNull();
    expect(c.item).toBe('NR-13 13.2.2 k)');
  });
  it('100 L exatos = aplica', () => {
    expect(classificarCaldeira(1, 0.1).situacao).toBe('aplica');
  });
  it('sem volume a categoria sai pela pressão, e o volume vira falta declarada', () => {
    const c = classificarCaldeira(1, null);
    expect(c.categoria).toBe('B');
    expect(c.faltas).toContain('Volume interno da caldeira');
  });
  it('sem pressão não chuta categoria', () => {
    const c = classificarCaldeira(null, 0.4);
    expect(c.categoria).toBeNull();
    expect(c.situacao).toBe('indefinida');
    expect(c.faltas.length).toBe(1);
  });
});
