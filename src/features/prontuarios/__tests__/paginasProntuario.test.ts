import { describe, expect, it } from 'vitest';
import { PAGINAS_PRONTUARIO, paginasProntuario, temCroqui2d } from '../tipos';

/**
 * Caldeira e autoclave não têm croqui 2D — o editor nunca soube desenhá-las. O
 * prontuário delas saía com duas folhas genéricas: um desenho que não é o
 * equipamento e uma tabela de dimensões vazia, dentro de um documento que vai
 * assinado por engenheiro.
 */
describe('quem tem croqui', () => {
  it('só vaso de pressão', () => {
    expect(temCroqui2d('vaso')).toBe(true);
    expect(temCroqui2d('caldeira')).toBe(false);
    expect(temCroqui2d('autoclave')).toBe(false);
  });

  it('tipo desconhecido não ganha croqui', () => {
    // Errar para o lado de NÃO imprimir a folha: uma folha a menos é uma
    // ausência; uma folha genérica dentro do prontuário é informação errada.
    expect(temCroqui2d('')).toBe(false);
    expect(temCroqui2d('tanque')).toBe(false);
  });
});

describe('folhas do prontuário', () => {
  it('vaso mantém as seis, na ordem do §8', () => {
    expect(paginasProntuario('vaso')).toEqual(PAGINAS_PRONTUARIO);
  });

  it('caldeira e autoclave saem sem as duas folhas do croqui', () => {
    for (const tipo of ['caldeira', 'autoclave']) {
      const folhas = paginasProntuario(tipo);
      expect(folhas).toHaveLength(4);
      expect(folhas).not.toContain('PRONT-CROQUI2D.html');
      expect(folhas).not.toContain('PRONT-FOLHA-DADOS.html');
    }
  });

  it('as folhas que sobram mantêm a ordem original', () => {
    expect(paginasProntuario('caldeira')).toEqual([
      'PRONT-ULTRASSOM.html',
      'PRONT-PRONTUARIO.html',
      'PRONT-CONTINUACAO.html',
      'PRONT-MEMORIAL.html',
    ]);
  });

  it('a folha de ultrassom nunca sai — é ela que traz a grade de espessuras', () => {
    for (const tipo of ['vaso', 'caldeira', 'autoclave', 'qualquer']) {
      expect(paginasProntuario(tipo)).toContain('PRONT-ULTRASSOM.html');
    }
  });

  it('não altera a lista original', () => {
    paginasProntuario('caldeira');
    expect(PAGINAS_PRONTUARIO).toHaveLength(6);
  });
});
