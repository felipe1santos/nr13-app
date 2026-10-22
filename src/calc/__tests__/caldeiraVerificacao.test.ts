import { describe, expect, it } from 'vitest';
import {
  pmtaCorpoPelaEspessura,
  pmtaEspelhoPelaEspessura,
  tMinCorpo,
  tMinEspelho,
  veredicto,
} from '../caldeiraVerificacao';

/** Valores do laudo CAL-25/5340 (TP.C.0193.22). S = 15664,04 psi = 108,00 MPa. */
const CORPO = { S: 108, E: 0.9, D: 1510, c: 0.75, y: 0.4 };
const ESPELHO = { S: 108, C: 2.2, p: 148, c: 0 };
const PMTA_ADOTADA = 1.1;

describe('corpo — ASME I PG-27.2.2', () => {
  it('PMTA pela espessura medida 10,24 mm = 1,23 MPa = 12,28 bar', () => {
    const p = pmtaCorpoPelaEspessura(CORPO, 10.24)!;
    expect(p).toBeCloseTo(1.2279, 4);
    expect((p * 10).toFixed(2)).toBe('12.28');
  });

  it('t mín para a PMTA adotada 1,10 MPa = 9,26 mm (0,36 in)', () => {
    const t = tMinCorpo(CORPO, PMTA_ADOTADA)!;
    expect(t.toFixed(2)).toBe('9.26');
    expect((t / 25.4).toFixed(2)).toBe('0.36');
  });

  it('as duas fórmulas são inversas: t mín da PMTA medida devolve a espessura medida', () => {
    const p = pmtaCorpoPelaEspessura(CORPO, 10.24)!;
    expect(tMinCorpo(CORPO, p)).toBeCloseTo(10.24, 9);
  });

  it('entrada incompleta não vira número', () => {
    expect(pmtaCorpoPelaEspessura({ ...CORPO, S: 0 }, 10.24)).toBeNull();
    expect(pmtaCorpoPelaEspessura(CORPO, 0.5)).toBeNull(); // t ≤ c
    expect(tMinCorpo(CORPO, 0)).toBeNull();
  });
});

describe('espelhos estaiados — ASME I PG-46.1', () => {
  it('dianteiro 18,62 mm → 3,76 MPa (37,61 bar); traseiro 18,95 mm → 3,90 MPa (38,95 bar)', () => {
    const d = pmtaEspelhoPelaEspessura(ESPELHO, 18.62)!;
    const t = pmtaEspelhoPelaEspessura(ESPELHO, 18.95)!;
    expect(d.toFixed(2)).toBe('3.76');
    expect((d * 10).toFixed(2)).toBe('37.61');
    expect(t.toFixed(2)).toBe('3.90');
    expect((t * 10).toFixed(2)).toBe('38.95');
  });

  it('t mín para 1,10 MPa = 10,07 mm — o 12,57 do laudo de referência não fecha com os dados dele', () => {
    expect(tMinEspelho(ESPELHO, PMTA_ADOTADA)!.toFixed(2)).toBe('10.07');
    expect(tMinEspelho(ESPELHO, PMTA_ADOTADA)!.toFixed(2)).not.toBe('12.57');
  });

  it('margem de corrosão entra nos dois sentidos', () => {
    const comC = { ...ESPELHO, c: 1 };
    const p = pmtaEspelhoPelaEspessura(comC, 18.62)!;
    expect(tMinEspelho(comC, p)).toBeCloseTo(18.62, 9);
  });
});

describe('veredicto — PMTA pela espessura medida contra a PMTA adotada', () => {
  it('maior ou igual aprova; menor reprova; sem número não decide', () => {
    expect(veredicto(1.2279, 1.1)).toBe('APROVADO');
    expect(veredicto(1.1, 1.1)).toBe('APROVADO');
    expect(veredicto(1.05, 1.1)).toBe('REPROVADO');
    expect(veredicto(null, 1.1)).toBe('INDETERMINADO');
    expect(veredicto(1.2, null)).toBe('INDETERMINADO');
  });
});
