import { describe, expect, it } from 'vitest';
import { dimensoesTampo, comprimentoTotalMm, circunferenciaMm, volumeInternoM3, volumeAcoM3, pesosKg, direcaoBocalLocal } from '../geometriaVaso';
import type { ModeloVaso } from '../tiposModelador';

function modeloBase(): ModeloVaso {
  return {
    tag: 'T1', orientacao: 'horizontal', diametroInterno: 1000, comprimentoCilindro: 2000,
    espessuraCasco: 10, virolas: 1, tampo1: { tipo: 'eliptico', espessura: 10 }, tampo2: { tipo: 'eliptico', espessura: 10 },
    bocais: [], suporte: { tipo: 'nenhum', altura: '', quantidade: '' }, dispositivos: [], densidadeAco: 7850,
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
  it('pesoOperacao digitado nunca é descartado, mesmo sem volume de aço/interno calculável', () => {
    // Sem casco/tampos completos (diametroInterno vazio) → volumeAcoM3/volumeInternoM3 = null,
    // mas o usuário digitou o peso de operação: operacaoKg tem que refletir o valor digitado.
    const semCasco = { ...modeloBase(), diametroInterno: '' as const, pesoOperacao: 1234 };
    expect(volumeAcoM3(semCasco)).toBeNull();
    expect(pesosKg(semCasco).operacaoKg).toBe(1234);

    // Casco completo mas espessuraCasco vazia (volumeAcoM3 null; volumeInternoM3 ainda calculável
    // já que não depende de espessuraCasco) — mesmo assim, com espessuraCasco vazia volumeAcoM3
    // depende de t, então cai no primeiro branch (volAco null) e ainda assim preserva pesoOperacao.
    const semEspessura = { ...modeloBase(), espessuraCasco: '' as const, pesoOperacao: 555 };
    expect(volumeAcoM3(semEspessura)).toBeNull();
    expect(pesosKg(semEspessura).operacaoKg).toBe(555);

    // Sem pesoOperacao digitado, continua null como antes (não inventa valor).
    const semNada = { ...modeloBase(), diametroInterno: '' as const };
    expect(pesosKg(semNada).operacaoKg).toBeNull();
  });
});

describe('direcaoBocalLocal', () => {
  it('0° → (1,0): direção local que, após a rotação de orientação horizontal, cai no topo do mundo', () => {
    const d = direcaoBocalLocal(0);
    expect(d.x).toBeCloseTo(1, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });
  it('90° → (0,+1): sentido horário visto de cima, mesma convenção do svgTransversal (croqui2dService)', () => {
    const d = direcaoBocalLocal(90);
    expect(d.x).toBeCloseTo(0, 10);
    expect(d.z).toBeCloseTo(1, 10);
  });
  it('180° → (−1,0)', () => {
    const d = direcaoBocalLocal(180);
    expect(d.x).toBeCloseTo(-1, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });
  it('270° → (0,−1)', () => {
    const d = direcaoBocalLocal(270);
    expect(d.x).toBeCloseTo(0, 10);
    expect(d.z).toBeCloseTo(-1, 10);
  });
});
