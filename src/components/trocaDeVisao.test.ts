/**
 * TROCAR A VISÃO (GRADE ↔ LISTA) NÃO PODE HERDAR A ALTURA DA OUTRA — 16/09/2026.
 *
 * ## O defeito, relatado no celular
 *
 * Em `/equipamentos`, rolar a grade de cartões grandes e trocar para a lista
 * pequena mostrava MENOS itens do que deveria — a quantidade de cartões mudava
 * conforme a visão.
 *
 * A causa é a combinação de duas regras corretas isoladamente:
 *   · `alturaAceita` só deixa a altura da linha CRESCER (é o que encerrou o laço
 *     "Maximum update depth exceeded" de 09/09/2026);
 *   · a altura só voltava ao ponto de partida quando a LISTA mudava
 *     (`chaveDoConjunto`) ou a janela era redimensionada.
 *
 * Trocar a visão não é nenhum dos dois: os itens são os mesmos. A grade media
 * ~706 px por linha no celular; a lista tem ~76 px — mas a altura aceita
 * continuava 706, e `faixaVisivel` calculava quantas linhas cabem com ela.
 * Resultado: meia dúzia de linhas de 76 px desenhadas numa janela de 700 px, e
 * um espaçador de 706 px × N linhas embaixo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alturaAceita, alturaAposTrocarEstimativa, alturaInicial, proximaAltura } from './alturaDeLinha';
import { faixaVisivel } from './faixaVisivel';

const GRADE_CELULAR = 706; // medido: cartão do catálogo em 1 coluna, com row-gap
const LISTA = 76; // medido: linha da lista pequena
const JANELA = 700;
const ITENS = 24;

function linhasDesenhadas(alturaLinha: number, acima = 0) {
  const { de, ate } = faixaVisivel({ acima, alturaJanela: JANELA, alturaLinha, totalLinhas: ITENS, folga: 2 });
  return ate - de;
}

describe('o defeito: a altura da grade vaza para a lista', () => {
  it('só com a regra monótona, a lista medida em 76 px continua valendo 706', () => {
    // A lista mede 76, mas a altura aceita não desce.
    expect(alturaAceita(GRADE_CELULAR, LISTA)).toBe(GRADE_CELULAR);
  });

  it('com 706, a lista desenha poucas linhas — não cobre nem a janela', () => {
    const n = linhasDesenhadas(GRADE_CELULAR);
    // 706 px por linha: cabe 1, mais a folga.
    expect(n).toBeLessThanOrEqual(3);
    // Em pixels reais da lista, isso não enche a tela.
    expect(n * LISTA).toBeLessThan(JANELA);
  });

  it('com a altura certa, a mesma janela desenha a tela cheia', () => {
    const n = linhasDesenhadas(LISTA);
    expect(n * LISTA).toBeGreaterThanOrEqual(JANELA);
  });
});

describe('o conserto: trocar a estimativa recomeça a altura', () => {
  const gradeMedida = { px: GRADE_CELULAR, medida: true };

  it('estimativa nova → a altura volta ao palpite, marcada como NÃO medida', () => {
    expect(alturaAposTrocarEstimativa(gradeMedida, 430, 92)).toEqual({ px: 92, medida: false });
  });

  it('e a primeira medição da lista entra, mesmo MENOR que o palpite', () => {
    const recomeco = alturaAposTrocarEstimativa(gradeMedida, 430, 92);
    expect(proximaAltura(recomeco, LISTA)).toEqual({ px: LISTA, medida: true });
  });

  it('voltar para a grade também recomeça — a medição a leva de novo a 706', () => {
    const lista = { px: LISTA, medida: true };
    const recomeco = alturaAposTrocarEstimativa(lista, 92, 430);
    expect(proximaAltura(recomeco, GRADE_CELULAR)).toEqual({ px: GRADE_CELULAR, medida: true });
  });

  it('mesma estimativa (re-render comum) NÃO mexe na altura medida', () => {
    // Senão a altura voltaria ao palpite a cada render e reabriria o laço.
    expect(alturaAposTrocarEstimativa(gradeMedida, 430, 430)).toBe(gradeMedida);
  });

  it('a lista virtual aplica a regra, ajustando durante o render', () => {
    const fonte = readFileSync(resolve(__dirname, 'ListaVirtualizada.tsx'), 'utf8');
    expect(fonte).toContain('alturaAposTrocarEstimativa(');
    expect(fonte).toContain('estimadaVista !== alturaEstimada');
    expect(fonte).toContain('proximaAltura(antes, medida)');
  });
});

describe('palpite MAIOR que a linha real não pode abrir vãos ao rolar', () => {
  // A lista compacta do celular mede ~60 px; o palpite é 92.
  const REAL = 60;

  it('antes: só crescendo a partir do palpite, a altura ficava em 92', () => {
    expect(alturaAceita(92, REAL)).toBe(92);
  });

  it('com 92 valendo e linhas de 60, rolar fundo deixa a janela sem item', () => {
    const acima = 2000;
    const { de, ate } = faixaVisivel({ acima, alturaJanela: JANELA, alturaLinha: 92, totalLinhas: 60, folga: 2 });
    // A janela é posta em de × 92, mas as linhas reais têm 60: o fim do que foi
    // desenhado fica acima do fim da tela.
    const fimDesenhado = de * 92 + (ate - de) * REAL;
    expect(fimDesenhado).toBeLessThan(acima + JANELA);
  });

  it('agora: a primeira medição substitui o palpite e a janela cobre a tela', () => {
    const estado = proximaAltura(alturaInicial(92), REAL);
    expect(estado).toEqual({ px: REAL, medida: true });
    const acima = 2000;
    const { de, ate } = faixaVisivel({ acima, alturaJanela: JANELA, alturaLinha: estado.px, totalLinhas: 60, folga: 2 });
    expect(de * REAL).toBeLessThanOrEqual(acima);
    expect(ate * REAL).toBeGreaterThanOrEqual(acima + JANELA);
  });

  it('depois da primeira medição a regra monótona continua — sem laço', () => {
    const medida = { px: 541, medida: true };
    // A oscilação 541 ↔ 522 de 09/09/2026 não pode voltar.
    expect(proximaAltura(medida, 522)).toBe(medida);
    expect(proximaAltura(medida, 541)).toBe(medida);
  });

  it('medição inválida não troca o palpite', () => {
    const inicial = alturaInicial(92);
    expect(proximaAltura(inicial, 0)).toBe(inicial);
    expect(proximaAltura(inicial, Number.NaN)).toBe(inicial);
  });
});
