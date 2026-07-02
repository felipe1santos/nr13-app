import { describe, expect, it } from 'vitest';
import { calcularVidaRemanescente, parseDataBR } from '../vidaRemanescente';

describe('parseDataBR', () => {
  it('converte dd/mm/aaaa', () => {
    const d = parseDataBR('15/03/2024');
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
  });

  it('rejeita lixo', () => {
    expect(parseDataBR('')).toBeNull();
    expect(parseDataBR('2024-03-15')).toBeNull();
    expect(parseDataBR('99/99/9999')).toBeNull();
  });
});

describe('calcularVidaRemanescente', () => {
  // Caso clássico: 12.0 mm → 11.0 mm em 2 anos = 0.5 mm/ano; t_req 8 mm →
  // sobremetal 3 mm → vida 6 anos → próxima = min(3, teto NR-13 cat III = 6) = 3.
  const base = {
    tAtualMm: 11,
    dataAtual: '01/01/2026',
    tAnteriorMm: 12,
    dataAnterior: '01/01/2024',
    tRequeridaMm: 8,
    categoria: 'III' as const,
    tipo: 'vaso' as const,
  };

  it('taxa, vida e próxima inspeção do caso clássico', () => {
    const r = calcularVidaRemanescente(base);
    expect(r.taxaMmAno).toBeCloseTo(0.5, 3);
    expect(r.sobremetalMm).toBeCloseTo(3, 3);
    expect(r.vidaAnos).toBeCloseTo(6, 2);
    expect(r.prazoNR13Anos).toBe(6);
    expect(r.proximaInspecaoAnos).toBeCloseTo(3, 2);
  });

  it('caldeira: teto NR-13 de 1 ano governa', () => {
    const r = calcularVidaRemanescente({ ...base, tipo: 'caldeira' });
    expect(r.prazoNR13Anos).toBe(1);
    expect(r.proximaInspecaoAnos).toBe(1);
  });

  it('sem desgaste (t_atual >= t_anterior): vida indefinida com aviso', () => {
    const r = calcularVidaRemanescente({ ...base, tAtualMm: 12.2 });
    expect(r.taxaMmAno).toBeNull();
    expect(r.vidaAnos).toBeNull();
    expect(r.avisos.some((a) => a.includes('desgaste'))).toBe(true);
    // ainda assim sugere próxima inspeção pelo teto NR-13
    expect(r.proximaInspecaoAnos).toBe(6);
  });

  it('sobremetal esgotado: vida 0', () => {
    const r = calcularVidaRemanescente({ ...base, tAtualMm: 7.5 });
    expect(r.sobremetalMm).toBeLessThan(0);
    expect(r.vidaAnos).toBe(0);
    expect(r.proximaInspecaoAnos).toBe(0);
    expect(r.avisos.some((a) => a.includes('abaixo da mínima'))).toBe(true);
  });

  it('datas invertidas ou iguais: aviso, sem taxa', () => {
    const r = calcularVidaRemanescente({ ...base, dataAnterior: '01/01/2026' });
    expect(r.taxaMmAno).toBeNull();
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('sem categoria: sem teto NR-13, próxima = vida/2', () => {
    const r = calcularVidaRemanescente({ ...base, categoria: null });
    expect(r.prazoNR13Anos).toBeNull();
    expect(r.proximaInspecaoAnos).toBeCloseTo(3, 2);
  });
});
