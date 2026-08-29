/**
 * Fase 9 · 9F.1 — A JANELA NUNCA PODE FICAR VAZIA COM LISTA CHEIA.
 *
 * ## O defeito, medido no gate de navegador em 28/08/2026
 *
 * Com 50.000 equipamentos no banco: o usuário rola a lista, depois digita uma
 * busca com poucos resultados. O cabeçalho escreve **"11 resultados"** e a área
 * da lista fica **VAZIA** — zero linhas no DOM. Só rolando de volta ao topo os 11
 * aparecem.
 *
 * Medido: `scrollTop` 1.954, conteúdo novo com 924 px de altura total, e a janela
 * ainda em `translateY(2436px)` — a faixa calculada caía inteira depois do fim da
 * lista nova.
 *
 * ## Por que é grave, e não cosmético
 *
 * O usuário lê "11 resultados" e vê o vazio embaixo. A conclusão natural é "o
 * sistema não achou" ou "sumiu" — que é exatamente o defeito que esta fase
 * inteira existe para combater. Some com a informação sem nenhum erro na tela.
 *
 * ## A regra
 *
 * A faixa é uma JANELA sobre a lista: quando a lista encolhe, a janela desce
 * junto. `de` nunca pode passar da última linha existente, e `ate` é sempre pelo
 * menos `de + 1`. Isso vale para qualquer rolagem — inclusive a que ficou órfã
 * de um conteúdo que não existe mais.
 */
import { describe, it, expect } from 'vitest';
import { faixaVisivel } from './faixaVisivel';

/** Uma janela de 700 px, linhas de 84 px, folga de 2 — o caso real medido. */
const base = { alturaJanela: 700, alturaLinha: 84, folga: 2 };

describe('faixaVisivel', () => {
  it('no topo, mostra da primeira linha até o fim da janela mais a folga', () => {
    const f = faixaVisivel({ ...base, acima: 0, totalLinhas: 50 });
    expect(f.de).toBe(0);
    // cabem 9 linhas em 700 px + 2 de folga
    expect(f.ate).toBe(11);
  });

  it('rolado até o meio, a janela acompanha', () => {
    const f = faixaVisivel({ ...base, acima: 84 * 20, totalLinhas: 50 });
    expect(f.de).toBe(18); // 20 - 2 de folga
    expect(f.ate).toBe(31);
  });

  it('LISTA QUE ENCOLHEU NÃO DEIXA A JANELA VAZIA', () => {
    // O caso do gate: rolagem de 29 linhas herdada, e a lista nova tem 11.
    const f = faixaVisivel({ ...base, acima: 2436, totalLinhas: 11 });
    expect(f.ate).toBeGreaterThan(f.de);
    expect(f.de).toBeLessThan(11);
    // E o que sobra é conteúdo de verdade, não uma linha fantasma.
    expect(f.ate).toBeLessThanOrEqual(11);
  });

  it('rolagem muito além do fim ainda mostra a última linha', () => {
    const f = faixaVisivel({ ...base, acima: 999_999, totalLinhas: 3 });
    expect(f.de).toBe(2);
    expect(f.ate).toBe(3);
  });

  it('lista de um item só continua visível depois de qualquer rolagem', () => {
    const f = faixaVisivel({ ...base, acima: 50_000, totalLinhas: 1 });
    expect(f).toEqual({ de: 0, ate: 1 });
  });

  it('lista vazia devolve faixa vazia — aqui o nada é a verdade', () => {
    // Sem itens, a tela mostra a mensagem de "nenhum resultado", não uma linha.
    expect(faixaVisivel({ ...base, acima: 0, totalLinhas: 0 })).toEqual({ de: 0, ate: 0 });
  });

  it('nunca devolve índice negativo', () => {
    const f = faixaVisivel({ ...base, acima: -500, totalLinhas: 20 });
    expect(f.de).toBe(0);
  });
});
