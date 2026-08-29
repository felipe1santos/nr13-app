/**
 * Qual fatia da lista a janela virtual deve desenhar.
 *
 * Saiu de dentro de `ListaVirtualizada` na 9F.1 por um motivo concreto: a suíte
 * roda em `environment: 'node'`, sem DOM, e enquanto esta conta vivia junto do
 * `getBoundingClientRect` **nenhum teste a alcançava**. O defeito abaixo passou
 * pelos gates da 9C e da 9E exatamente por isso, e só apareceu no navegador.
 *
 * ── O DEFEITO, medido em 28/08/2026 ─────────────────────────────────────────
 * Com 50.000 equipamentos: rolar a lista e depois buscar algo com poucos
 * resultados deixava a área da lista **vazia**, com o cabeçalho escrevendo
 * "11 resultados". A rolagem herdada (2.436 px) apontava para além do fim da
 * lista nova (924 px de altura total), a faixa calculada caía inteira fora, e o
 * `slice` devolvia nada.
 *
 * O usuário lê "11 resultados" e vê o vazio: conclui que sumiu. Num sistema cujo
 * defeito histórico é justamente dado que some, isso não é detalhe visual.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────
 * A janela é uma fatia DA LISTA: quando a lista encolhe, a janela desce junto.
 * `de` nunca passa da última linha existente. Lista vazia é o único caso em que
 * a faixa é vazia — aí o nada é a verdade, e quem desenha a mensagem de "nenhum
 * resultado" é a tela.
 */
export interface EntradaFaixa {
  /** Quantos pixels da lista já passaram acima do topo visível do rolador. */
  acima: number;
  /** Altura útil do rolador, em px. */
  alturaJanela: number;
  /** Altura de UMA linha, medida (não estimada, depois do primeiro quadro). */
  alturaLinha: number;
  /** Total de LINHAS (itens ÷ colunas), não de itens. */
  totalLinhas: number;
  /** Linhas desenhadas além da janela, de cada lado. */
  folga: number;
}

export interface Faixa {
  de: number;
  ate: number;
}

export function faixaVisivel({
  acima,
  alturaJanela,
  alturaLinha,
  totalLinhas,
  folga,
}: EntradaFaixa): Faixa {
  if (totalLinhas <= 0) return { de: 0, ate: 0 };

  const altura = alturaLinha > 0 ? alturaLinha : 1;
  const janela = alturaJanela > 0 ? alturaJanela : 800;
  const primeiraVisivel = Math.floor(Math.max(0, acima) / altura);
  const cabem = Math.ceil(janela / altura);

  // O TETO É O CONSERTO. Sem ele, uma rolagem herdada de uma lista maior põe
  // `de` além do fim e a janela desenha o vazio.
  const ultima = totalLinhas - 1;
  const de = Math.min(ultima, Math.max(0, primeiraVisivel - folga));
  const ate = Math.max(de + 1, Math.min(totalLinhas, primeiraVisivel + cabem + folga));

  return { de, ate };
}
