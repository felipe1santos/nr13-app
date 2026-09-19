import { describe, expect, it } from 'vitest';
import { INSTRUMENTOS_CHECKLIST } from '../../inspecoes/formularios/FormularioChecklist';
import {
  INSTRUMENTOS,
  TIPOS_INSTRUMENTO,
  definicaoDe,
  tipoDaLinhaChecklist,
  unidadeCompativel,
  unidadesDoInstrumento,
} from '../instrumentos';
import { unidadeDoComponente } from '../preencherCalibracao';

/**
 * Revisão do engenheiro, fase 2 (D) · os SEIS instrumentos do quadro 7.1.1 e
 * a unidade de cada um. A unidade é do instrumento — nunca do equipamento, e
 * nunca inventada.
 */
describe('os seis instrumentos do relatório', () => {
  it('cada linha do quadro 7.1.1 tem exatamente um tipo de instrumento', () => {
    expect(TIPOS_INSTRUMENTO).toHaveLength(6);
    for (const linha of INSTRUMENTOS_CHECKLIST) {
      const t = tipoDaLinhaChecklist(linha.id);
      expect(t, linha.nome).not.toBeNull();
      expect(INSTRUMENTOS[t!].checklist.calId).toBe(linha.calId);
    }
  });

  it('modelo interno só onde existe folha nossa: manômetro e PSV', () => {
    expect(TIPOS_INSTRUMENTO.filter((t) => INSTRUMENTOS[t].modeloInterno)).toEqual(['manometro', 'psv']);
  });

  it('termômetro mede temperatura; os demais, pressão', () => {
    expect(unidadesDoInstrumento('termometro')).toEqual(['°C', '°F', 'K']);
    for (const t of ['manometro', 'psv', 'vacuometro', 'pressostato', 'transmissor'] as const) {
      expect(unidadesDoInstrumento(t)).toContain('bar');
      expect(unidadesDoInstrumento(t)).not.toContain('°C');
    }
  });

  it('unidade incompatível é recusada, não convertida', () => {
    expect(unidadeCompativel('termometro', 'kgf/cm²')).toBe(false);
    expect(unidadeCompativel('manometro', '°C')).toBe(false);
    expect(unidadeCompativel('vacuometro', 'mmHg')).toBe(true);
    expect(unidadeCompativel('termometro', '')).toBe(false);
  });

  it('sem unidade cadastrada: pressão recua para kgf/cm² (legado); temperatura fica VAZIA', () => {
    const base = { id: 'c', nome: 'x', criadoEm: '' };
    expect(unidadeDoComponente({ ...base, tipo: 'manometro' })).toBe('kgf/cm²');
    expect(unidadeDoComponente({ ...base, tipo: 'termometro' })).toBe('');
    expect(unidadeDoComponente({ ...base, tipo: 'termometro', unidade: '°F' })).toBe('°F');
  });

  it('tipo desconhecido (dado legado estranho) não quebra: é tratado como manômetro', () => {
    expect(definicaoDe('???').rotulo).toBe('Manômetro');
  });
});
