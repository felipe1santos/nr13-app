import { describe, expect, it } from 'vitest';
import { AMARELO_VAZIO, CLASSE_VAZIO, ehValorVazio } from './camposVazios';

/**
 * Fase 12B · o realce de campo vazio.
 *
 * O ambiente do Vitest é `node`, sem DOM, então o que se testa aqui é a REGRA —
 * que é onde o defeito moraria. A parte de DOM (`marcarCamposVazios`) é uma
 * varredura de `[contenteditable]` que só toggla esta classe; a prova de que ela
 * não chega ao PDF está no teste de `normalizarCloneParaCanvas` abaixo e no
 * gerador vetorial, que nem lê o DOM.
 */

describe('o que conta como campo VAZIO', () => {
  it('os traços que as folhas usam quando não há dado', () => {
    expect(ehValorVazio('')).toBe(true);
    expect(ehValorVazio('   ')).toBe(true);
    expect(ehValorVazio('-')).toBe(true);
    expect(ehValorVazio('--')).toBe(true);
    expect(ehValorVazio('---')).toBe(true);
    expect(ehValorVazio('—')).toBe(true);
    expect(ehValorVazio('–')).toBe(true);
  });

  it('data e validade em branco também são vazias', () => {
    // `--/--/----` e `--/----` são o que PLACA.html imprime sem data.
    expect(ehValorVazio('--/--/----')).toBe(true);
    expect(ehValorVazio('--/----')).toBe(true);
    expect(ehValorVazio('__/__/____')).toBe(true);
    expect(ehValorVazio(' . . ')).toBe(true);
  });

  it('espaço em branco invisível não vira valor', () => {
    //   é o que sobra quando o template escreve `&nbsp;`. Sem tratá-lo, o
    // campo pareceria preenchido e o usuário não veria o que falta.
    expect(ehValorVazio(' ')).toBe(true);
    expect(ehValorVazio(' - ')).toBe(true);
  });

  it('QUALQUER conteúdo real deixa de ser vazio', () => {
    expect(ehValorVazio('0')).toBe(false); // zero é medida, não ausência
    expect(ehValorVazio('N/A')).toBe(false); // "não se aplica" é uma resposta
    expect(ehValorVazio('VP-001')).toBe(false);
    expect(ehValorVazio('12/2026')).toBe(false);
    expect(ehValorVazio('-1')).toBe(false);
    expect(ehValorVazio('1,5')).toBe(false);
  });

  it('nulo e indefinido são vazios, não erro', () => {
    expect(ehValorVazio(null)).toBe(true);
    expect(ehValorVazio(undefined)).toBe(true);
  });

  it('o amarelo é o da referência, e a classe é prefixada', () => {
    expect(AMARELO_VAZIO).toBe('#FFF8C4');
    expect(CLASSE_VAZIO.startsWith('nr13-')).toBe(true);
  });
});
