/**
 * A altura de UMA linha da grade virtualizada — sempre na MESMA grandeza.
 *
 * ## O defeito, reproduzido em 09/09/2026
 *
 * `ListaVirtualizada.medir` escolhia entre duas contas:
 *
 * ```
 * filhos.length > nColunas
 *   ? filhos[nColunas].offsetTop - filhos[0].offsetTop   // distância entre linhas
 *   : filhos[0].getBoundingClientRect().height           // altura do item
 * ```
 *
 * As duas NÃO medem a mesma coisa: a primeira inclui o `row-gap` da grade, a
 * segunda não. Medido no cartão do catálogo em uma coluna: **688 px** de altura
 * do cartão contra **706 px** de distância entre linhas, com `row-gap: 18px`.
 * Dezoito pixels — muito acima da tolerância de 1 px que existe para o
 * arredondamento sub-pixel.
 *
 * E aí o laço se fecha sozinho: a altura muda → `faixaVisivel` muda → o número
 * de filhos desenhados muda → a conta escolhida muda → a altura muda de volta.
 * O React corta em algumas dezenas de voltas com
 * **"Maximum update depth exceeded"**, que é erro de lifecycle: sobe até o
 * `errorElement` da rota e vira a tela "Ocorreu um erro inesperado".
 *
 * ## Por que só no celular, e só no cartão grande
 *
 * Porque só ali a janela chega a desenhar **uma linha só**:
 *
 * | | colunas | altura da linha | a janela cabe |
 * |---|---|---|---|
 * | grade no desktop | 3–4 | ~700 px | várias linhas, e cada uma com vários filhos |
 * | grade no celular | **1** (`@media`: `grid-template-columns: 1fr`) | ~706 px | **uma linha** em certas posições de rolagem |
 * | lista (qualquer tela) | 1 | ~76 px | dezenas de linhas, sempre |
 *
 * Com uma coluna e um cartão de 700 px, rolar leva a janela a um estado em que
 * `filhos.length === nColunas === 1` — e é exatamente esse estado que muda a
 * grandeza medida. Na visão de lista isso nunca acontece, e foi por isso que
 * trocar para lista "resolvia".
 *
 * ## A regra
 *
 * A altura de uma linha é a distância até a próxima. Quando não há próxima
 * linha desenhada para medir, ela é a altura do item **mais o `row-gap`** — que
 * é a mesma grandeza, e não um número diferente que vai brigar com o primeiro.
 *
 * Função pura, e no arquivo ao lado do `faixaVisivel` pelo mesmo motivo que
 * ele: a suíte roda em `environment: 'node'`, e enquanto esta conta vivia
 * dentro do componente, entre um `offsetTop` e um `getBoundingClientRect`,
 * nenhum teste a alcançava.
 */
export interface EntradaAlturaLinha {
  /** `offsetTop` do primeiro filho desenhado. */
  topoPrimeiro: number;
  /**
   * `offsetTop` do primeiro filho da linha SEGUINTE, quando ela existe no DOM.
   * `null` quando só uma linha está desenhada — e é esse o caso que quebrava.
   */
  topoProximaLinha: number | null;
  /** Altura do primeiro filho, sem o espaçamento da grade. */
  alturaPrimeiro: number;
  /** `row-gap` resolvido pelo CSS da grade, em px. */
  rowGap: number;
}

export function alturaDeLinha({
  topoPrimeiro,
  topoProximaLinha,
  alturaPrimeiro,
  rowGap,
}: EntradaAlturaLinha): number {
  if (topoProximaLinha !== null) {
    const distancia = topoProximaLinha - topoPrimeiro;
    // Distância não-positiva não é medida: acontece enquanto o layout ainda não
    // resolveu (ou com a grade escondida). Cai no outro caminho, que é a mesma
    // grandeza.
    if (distancia > 0) return distancia;
  }
  return alturaPrimeiro + (rowGap > 0 ? rowGap : 0);
}

/**
 * A altura ACEITA, dada a que já valia — e ela só CRESCE.
 *
 * ## A segunda fonte do mesmo laço, e a que explica o defeito
 *
 * Uniformizar a grandeza (acima) não bastou: medindo a rolagem do catálogo em
 * uma coluna, a altura continuou alternando entre **541 px e 522 px**. A razão
 * é que os cartões **não têm todos a mesma altura** — o nome do equipamento
 * quebra em duas linhas num, "Sem cliente vinculado" ocupa uma linha a mais
 * noutro. `filhos[n].offsetTop - filhos[0].offsetTop` mede a linha que está
 * DESENHADA AGORA; ao rolar, o primeiro cartão da janela muda, a medida muda, a
 * faixa muda, e o primeiro cartão muda de novo.
 *
 * É por isso que só a grade grande no celular quebrava: ali cada linha é UM
 * cartão, e a variação vai direto para a medida. Com 3–4 colunas a linha assume
 * a altura do maior cartão dela e as linhas ficam parecidas; e na visão de
 * LISTA todas as linhas têm exatamente a mesma altura, então nunca houve o que
 * oscilar — que é exatamente o que o usuário observou ao trocar de visão.
 *
 * ## Por que MONÓTONA, e não uma média ou uma tolerância maior
 *
 * Esta janela virtual assume linha de altura CONSTANTE (o cabeçalho do
 * componente diz isso: altura variável célula a célula está listada como
 * recurso que ele não tem). Com alturas diferentes, qualquer regra que aceite
 * o valor "mais recente" pode voltar atrás — e voltar atrás é o laço.
 *
 * Ficar com a MAIOR medida encerra a realimentação em uma volta e erra para o
 * lado barato: o espaçador fica um pouco mais alto que o necessário, o que
 * sobra como um respiro no fim da lista. Errar para menos é que esconderia
 * item — e esconder item é o defeito histórico que este projeto conserta.
 *
 * A altura volta ao ponto de partida quando a LISTA muda ou quando a janela é
 * redimensionada (ver `chaveDoConjunto` e o `resize` em `ListaVirtualizada`):
 * aí a medida antiga não descreve mais nada, e mantê-la é que seria errado.
 */
/**
 * A altura quando a ESTIMATIVA muda — ou seja, quando muda o LAYOUT das linhas.
 *
 * ## O defeito que isto fecha (16/09/2026)
 *
 * `/equipamentos` alterna entre grade de cartões grandes e lista pequena, e a
 * tela passa `alturaEstimada` diferente para cada uma. A altura aceita, sendo
 * monótona, só voltava ao ponto de partida com LISTA nova ou redimensionamento:
 * trocar de visão herdava a altura da outra. No celular a grade mede ~706 px por
 * linha e a lista ~76 — com 706 valendo, a lista desenhava duas ou três linhas
 * e deixava o resto da tela em branco. "A quantidade de cartões muda conforme
 * a visão", como foi relatado.
 *
 * Estimativa diferente = outro layout de linha = a medida antiga não descreve
 * mais nada, exatamente como no `resize`. Estimativa igual (render comum) não
 * mexe: voltar ao estimado a cada render reabriria o laço de medição.
 */
export function alturaAposTrocarEstimativa(
  atual: EstadoAltura,
  estimadaAnterior: number,
  estimadaNova: number,
): EstadoAltura {
  return estimadaNova !== estimadaAnterior ? alturaInicial(estimadaNova) : atual;
}

/**
 * A altura da linha e se ela já foi MEDIDA ou ainda é a estimativa.
 *
 * ## Por que a distinção (16/09/2026)
 *
 * `alturaAceita` só deixa crescer, e crescia a partir da ESTIMATIVA. Quando a
 * linha real é MENOR que a estimada, a altura nunca chegava nela: a janela
 * calculava a posição de cada linha com o valor maior, as linhas reais ficavam
 * mais baixas que o previsto e, ao rolar, abria-se um vão sem item — o mesmo
 * sintoma de "cartões faltando". Com a lista compacta do celular (~60 px contra
 * 92 estimados) isso deixava de ser teórico.
 *
 * A estimativa é um palpite, não uma medida: a PRIMEIRA medição real a
 * substitui, para mais ou para menos. Daí em diante vale a regra monótona, que
 * é o que impede o laço de medição de 09/09/2026 — ele nasce da oscilação ENTRE
 * medidas, e não da troca do palpite pela primeira delas.
 */
export interface EstadoAltura {
  px: number;
  medida: boolean;
}

export function alturaInicial(estimada: number): EstadoAltura {
  return { px: estimada, medida: false };
}

/** Aplica uma medição. Devolve o MESMO objeto quando nada muda (o React não re-renderiza). */
export function proximaAltura(atual: EstadoAltura, medida: number): EstadoAltura {
  if (!(medida > 0)) return atual;
  if (!atual.medida) return { px: medida, medida: true };
  const px = alturaAceita(atual.px, medida);
  return px === atual.px ? atual : { px, medida: true };
}

export function alturaAceita(anterior: number, medida: number): number {
  if (!(medida > 0)) return anterior;
  // Tolerância de 1 px: arredondamento sub-pixel não é mudança.
  return medida > anterior + 1 ? medida : anterior;
}
