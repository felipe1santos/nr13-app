import { describe, expect, it } from 'vitest';
import { alturaAceita, alturaDeLinha } from './alturaDeLinha';
import { faixaVisivel } from './faixaVisivel';

/**
 * 09/09/2026 · O LAÇO QUE VIRAVA "Ocorreu um erro inesperado" AO ROLAR.
 *
 * Relato: no CELULAR, na tela de equipamentos, rolar para baixo mostrava a tela
 * de erro; trocando a visualização de cartão grande para LISTA, parava de
 * acontecer.
 *
 * Reproduzido em navegador, com números: a altura da linha alternava entre
 * 541 px e 522 px a cada volta, e o React cortava com **"Maximum update depth
 * exceeded"** — erro de lifecycle, que sobe até o `errorElement` da rota.
 *
 * Duas causas, somadas:
 *
 * 1. **Grandezas diferentes.** Com duas linhas desenhadas, media-se
 *    `offsetTop[n] - offsetTop[0]` (inclui o `row-gap`); com uma só, media-se
 *    `getBoundingClientRect().height` (não inclui). Medido: 706 contra 688,
 *    `row-gap: 18px`.
 * 2. **Cartões de alturas diferentes.** Nome que quebra em duas linhas, "Sem
 *    cliente vinculado" ocupando uma linha a mais. Com UMA coluna — que é o
 *    celular — cada linha é um cartão, e a medida muda conforme qual cartão
 *    está no topo da janela.
 *
 * Em ambos os casos: altura muda → faixa muda → outro cartão no topo → altura
 * muda de volta.
 *
 * Por que a LISTA não quebrava: todas as linhas dela têm a mesma altura, e a
 * janela sempre desenha várias — nunca cai no ramo de uma linha só, nunca mede
 * um vizinho diferente.
 */

describe('a altura da linha é sempre a MESMA grandeza', () => {
  it('com a linha seguinte desenhada, é a distância entre os topos', () => {
    expect(alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: 706, alturaPrimeiro: 688, rowGap: 18 })).toBe(706);
  });

  it('com uma linha só, é a altura do item MAIS o row-gap', () => {
    // Sem somar o gap, esta conta devolvia 688 — 18 px a menos que a de cima,
    // e era essa diferença que realimentava a faixa.
    expect(alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: null, alturaPrimeiro: 688, rowGap: 18 })).toBe(706);
  });

  it('os dois caminhos concordam — é essa a regra', () => {
    for (const [alt, gap] of [[688, 18], [76, 8], [200, 0], [521.5, 18.5]]) {
      const comVizinho = alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: alt + gap, alturaPrimeiro: alt, rowGap: gap });
      const sozinho = alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: null, alturaPrimeiro: alt, rowGap: gap });
      expect(sozinho).toBeCloseTo(comVizinho, 6);
    }
  });

  it('distância não-positiva (layout ainda não resolvido) cai no outro caminho', () => {
    expect(alturaDeLinha({ topoPrimeiro: 100, topoProximaLinha: 100, alturaPrimeiro: 50, rowGap: 8 })).toBe(58);
    expect(alturaDeLinha({ topoPrimeiro: 100, topoProximaLinha: 40, alturaPrimeiro: 50, rowGap: 8 })).toBe(58);
  });

  it('gap ausente ou inválido não vira NaN', () => {
    expect(alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: null, alturaPrimeiro: 90, rowGap: NaN })).toBe(90);
    expect(alturaDeLinha({ topoPrimeiro: 0, topoProximaLinha: null, alturaPrimeiro: 90, rowGap: -4 })).toBe(90);
  });
});

describe('a altura aceita só CRESCE — é o que encerra o laço', () => {
  it('medida maior é adotada', () => {
    expect(alturaAceita(522, 541)).toBe(541);
  });

  it('medida MENOR é recusada — voltar atrás é o laço', () => {
    expect(alturaAceita(541, 522)).toBe(541);
  });

  it('variação sub-pixel não conta como mudança', () => {
    expect(alturaAceita(541, 541.4)).toBe(541);
    expect(alturaAceita(541, 540.7)).toBe(541);
  });

  it('medida inválida não derruba a altura que já valia', () => {
    for (const m of [0, -10, NaN]) expect(alturaAceita(541, m)).toBe(541);
  });

  it('a sequência que quebrava a tela ESTABILIZA em uma volta', () => {
    // As medidas reais alternando, como o navegador as devolveu.
    const medidas = [522, 541, 522, 541, 522, 541, 530, 522];
    let altura = 564; // a estimativa inicial da grade
    const vistas = new Set<number>();
    for (const m of medidas) {
      altura = alturaAceita(altura, m);
      vistas.add(altura);
    }
    // UMA altura do começo ao fim: nada realimenta a faixa.
    expect(vistas.size).toBe(1);
    expect(altura).toBe(564);
  });

  it('subindo da estimativa, para no maior valor e fica', () => {
    let altura = 100;
    for (const m of [522, 541, 522, 541, 522]) altura = alturaAceita(altura, m);
    expect(altura).toBe(541);
  });
});

describe('a faixa deixa de oscilar quando a altura para de mudar', () => {
  /** Uma volta do laço real: altura → faixa → quantos filhos → altura. */
  function girar(alturaInicial: number, medidaCom1: number, medidaCom2: number, voltas: number) {
    let altura = alturaInicial;
    const historico: number[] = [];
    for (let i = 0; i < voltas; i += 1) {
      const { de, ate } = faixaVisivel({ acima: 7500, alturaJanela: 780, alturaLinha: altura, totalLinhas: 120, folga: 2 });
      const linhas = ate - de;
      altura = alturaAceita(altura, linhas > 1 ? medidaCom2 : medidaCom1);
      historico.push(altura);
    }
    return historico;
  }

  it('com a regra monótona, a altura converge e para', () => {
    const h = girar(564, 522, 541, 12);
    expect(new Set(h).size).toBeLessThanOrEqual(2);
    // E a última metade é constante: sem mudança, sem novo render, sem laço.
    expect(new Set(h.slice(6)).size).toBe(1);
  });
});
