import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { limparDecimal, paraPonto } from './EditorMz';

/**
 * 23/11/2026 · no memorial da caldeira, "1,1" digitado na pressão de projeto
 * gravou 11 MPa: o `<input type="number">` descartava a vírgula. Estes testes
 * travam a conversão e quebram se algum campo decimal voltar a `type="number"`.
 */
describe('vírgula decimal nos campos do memorial', () => {
  it('vírgula ou ponto viram o mesmo número', () => {
    expect(Number(paraPonto(limparDecimal('1,1')))).toBe(1.1);
    expect(Number(paraPonto(limparDecimal('1.1')))).toBe(1.1);
    expect(Number(paraPonto(limparDecimal('94,5')))).toBe(94.5);
  });
  it('a digitação no meio ("1,") não perde a vírgula na tela', () => {
    expect(limparDecimal('1,')).toBe('1,');
    expect(Number(paraPonto('1,'))).toBe(1);
  });
  it('um separador só; letras e espaços saem', () => {
    expect(limparDecimal('1,2,3')).toBe('1,23');
    expect(limparDecimal(' 12 mm')).toBe('12');
    expect(limparDecimal('-0,5')).toBe('-0,5');
  });
  it('nenhum campo decimal de memorial ou de calibração usa type="number"', () => {
    for (const arq of [
      'features/memorial/EditorMz.tsx',
      'features/memorial/MemorialVaso.tsx',
      'features/inspecoes/formularios/FormularioManometro.tsx',
      'features/inspecoes/formularios/FormularioPSV.tsx',
    ]) {
      const src = readFileSync(new URL(`../../${arq}`, import.meta.url), 'utf8');
      expect(src, arq).not.toMatch(/<input[^>]*type=\{?["']number/);
      expect(src, arq).not.toMatch(/type=\{tipo\}/);
    }
  });
});
