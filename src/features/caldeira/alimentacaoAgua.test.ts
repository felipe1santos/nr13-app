import { describe, expect, it } from 'vitest';
import { LAUDO_PADRAO_ALIMENTACAO, alimentacaoPreenchida, normalizarAlimentacao, verificarAlimentacao } from './alimentacaoAgua';
import { ENSAIOS_DISPONIVEIS, FORM_POR_ENSAIO } from '../inspecoes/tipos';

describe('ensaio de alimentação de água e controle de nível', () => {
  it('normaliza e descarta resposta inválida', () => {
    const d = normalizarAlimentacao({ respostas: { intertravamento: 'sim', x: 'talvez' }, resultado: 'bla' });
    expect(d.respostas).toEqual({ intertravamento: 'sim' });
    expect(d.resultado).toBe('');
  });
  it('preenchido = alguma resposta ou resultado', () => {
    expect(alimentacaoPreenchida(undefined)).toBe(false);
    expect(alimentacaoPreenchida({ respostas: {} })).toBe(false);
    expect(alimentacaoPreenchida({ respostas: { visores: 'na' } })).toBe(true);
    expect(alimentacaoPreenchida({ resultado: 'aprovado' })).toBe(true);
  });
  it('intertravamento falho + aprovado = erro (13.4.1.2 e)', () => {
    const a = verificarAlimentacao({ respostas: { intertravamento: 'nao' }, resultado: 'aprovado' });
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('erro');
  });
  it('outro "não" + aprovado = só alerta', () => {
    expect(verificarAlimentacao({ respostas: { alarmeNivelBaixo: 'nao' }, resultado: 'aprovado' })[0].nivel).toBe('alerta');
  });
  it('reprovado com laudo padrão de aprovação = erro', () => {
    expect(verificarAlimentacao({ resultado: 'reprovado', laudo: LAUDO_PADRAO_ALIMENTACAO })[0].nivel).toBe('erro');
  });
  it('é ensaio só de caldeira', () => {
    expect(ENSAIOS_DISPONIVEIS.map((e) => e.value)).not.toContain('alimentacao_agua');
    expect(FORM_POR_ENSAIO.alimentacao_agua).toBe('alimentacao');
  });
});
