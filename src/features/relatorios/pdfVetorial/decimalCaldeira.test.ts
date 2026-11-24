import { describe, expect, it } from 'vitest';
import { decimalBr } from './folhasCaldeira';

describe('decimalBr — vírgula decimal na folha 3 e na placa da caldeira (23/11/2026)', () => {
  it('número com ponto vira vírgula', () => {
    expect(decimalBr('11.22')).toBe('11,22');
    expect(decimalBr('0.00')).toBe('0,00');
  });
  it('o que não é número puro passa intacto', () => {
    expect(decimalBr('11,22')).toBe('11,22');
    expect(decimalBr('10')).toBe('10');
    expect(decimalBr('ASME Sec. I')).toBe('ASME Sec. I');
    expect(decimalBr(null)).toBeNull();
  });
});
