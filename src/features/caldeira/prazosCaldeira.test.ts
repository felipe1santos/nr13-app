import { describe, expect, it } from 'vitest';
import { avaliacaoVinteECincoAnos, prazoMaximoCaldeira, somarMesesBr } from './prazosCaldeira';

describe('prazo máximo da inspeção periódica (NR-13 13.4.4.4 / 13.4.4.5)', () => {
  it('A e B = 12 meses (13.4.4.4 a)', () => {
    expect(prazoMaximoCaldeira('A')).toEqual({ meses: 12, item: '13.4.4.4 a)' });
    expect(prazoMaximoCaldeira('B')).toEqual({ meses: 12, item: '13.4.4.4 a)' });
  });
  it('recuperação de álcalis = 18', () => expect(prazoMaximoCaldeira('B', { recuperacaoAlcalis: true })?.meses).toBe(18));
  it('A com válvulas testadas aos 12 meses = 24', () => expect(prazoMaximoCaldeira('A', { valvulasTestadasAos12Meses: true })?.meses).toBe(24));
  it('B com SGC (Anexo IV) = 30', () => expect(prazoMaximoCaldeira('B', { sgcAnexoIV: true })?.meses).toBe(30));
  it('o benefício de A não vale para B e vice-versa', () => {
    expect(prazoMaximoCaldeira('B', { valvulasTestadasAos12Meses: true })?.meses).toBe(12);
    expect(prazoMaximoCaldeira('A', { sgcAnexoIV: true })?.meses).toBe(12);
  });
  it('SPIE: B 24, A 30, A com SIS 48, álcalis 24', () => {
    expect(prazoMaximoCaldeira('B', { spie: true })?.meses).toBe(24);
    expect(prazoMaximoCaldeira('A', { spie: true })?.meses).toBe(30);
    expect(prazoMaximoCaldeira('A', { spie: true, sis: true })?.meses).toBe(48);
    expect(prazoMaximoCaldeira('A', { spie: true, recuperacaoAlcalis: true })?.meses).toBe(24);
  });
  it('sem categoria A/B não sugere', () => {
    expect(prazoMaximoCaldeira(null)).toBeNull();
    expect(prazoMaximoCaldeira('III')).toBeNull();
    expect(prazoMaximoCaldeira('Fora da NR-13')).toBeNull();
  });
});

describe('somarMesesBr', () => {
  it('caso da referência: 29/03/2022 + 12 = 29/03/2023', () => expect(somarMesesBr('29/03/2022', 12)).toBe('29/03/2023'));
  it('dia inexistente cai no último dia do mês', () => {
    expect(somarMesesBr('31/01/2023', 1)).toBe('28/02/2023');
    expect(somarMesesBr('29/02/2024', 12)).toBe('28/02/2025');
  });
  it('virada de ano', () => expect(somarMesesBr('15/11/2026', 3)).toBe('15/02/2027'));
  it('data inválida = null', () => {
    expect(somarMesesBr('', 12)).toBeNull();
    expect(somarMesesBr('2026-11-15', 12)).toBeNull();
    expect(somarMesesBr('15/13/2026', 12)).toBeNull();
  });
});

describe('13.4.4.6 — 25 anos', () => {
  it('exige a partir de 25 anos', () => {
    expect(avaliacaoVinteECincoAnos('2001', 2026)).toEqual({ idade: 25, exige: true });
    expect(avaliacaoVinteECincoAnos(2011, 2026)).toEqual({ idade: 15, exige: false });
  });
  it('ano ausente ou absurdo = sem avaliação', () => {
    expect(avaliacaoVinteECincoAnos('', 2026)).toBeNull();
    expect(avaliacaoVinteECincoAnos('3000', 2026)).toBeNull();
  });
});
