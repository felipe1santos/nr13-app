import { describe, expect, it } from 'vitest';
import { mascararData } from './mascaras';

describe('mascararData', () => {
  it('insere barras conforme digita', () => {
    expect(mascararData('0')).toBe('0');
    expect(mascararData('09')).toBe('09');
    expect(mascararData('090')).toBe('09/0');
    expect(mascararData('0907')).toBe('09/07');
    expect(mascararData('09072')).toBe('09/07/2');
    expect(mascararData('09072026')).toBe('09/07/2026');
  });
  it('normaliza colagem sem barras e limita a 8 dígitos', () => {
    expect(mascararData('09072026999')).toBe('09/07/2026');
    expect(mascararData('09/07/2026')).toBe('09/07/2026');
  });
  it('ignora não-dígitos', () => {
    expect(mascararData('ab')).toBe('');
    expect(mascararData('09a07b2026')).toBe('09/07/2026');
  });
  it('vazio permanece vazio (permite apagar)', () => {
    expect(mascararData('')).toBe('');
  });
});
