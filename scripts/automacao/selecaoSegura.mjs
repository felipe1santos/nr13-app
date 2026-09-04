/**
 * Seleção de alvo para AÇÃO DESTRUTIVA na interface — e por que este arquivo
 * existe.
 *
 * ## O acidente, em 04/09/2026
 *
 * Uma automação precisava excluir a empresa "ZZ TESTE CRIACAO CLIENTE LTDA" e
 * localizou o botão assim:
 *
 *     const alvo = botoesExcluir.find((b) => {
 *       let e = b;
 *       for (let i = 0; i < 6 && e; i++) {          // sobe 6 ancestrais
 *         if (/ZZ TESTE CRIACAO CLIENTE/.test(e.innerText)) return true;
 *         e = e.parentElement;
 *       }
 *       return false;
 *     });
 *
 * Um desses seis ancestrais é o CONTÊINER DA LISTA INTEIRA, cujo texto contém o
 * nome procurado — porque contém o de todos. A condição deu verdadeira para o
 * PRIMEIRO botão Excluir da página, e o registro apagado foi o de outro cliente
 * ("TERCAL"), que não tinha nada a ver com o teste.
 *
 * O defeito não é o regex: é procurar o alvo pelo TEXTO DE UM ANCESTRAL. Subir
 * na árvore aumenta o escopo até englobar a lista toda, e aí "este elemento
 * contém o nome" para de significar "este elemento É o registro".
 *
 * ## A regra
 *
 * Para excluir, exigir identificação EXATA:
 *
 *   1. o card é achado por **id estável** do registro, não por texto;
 *   2. o nome exibido **dentro daquele mesmo card** confere com o esperado;
 *   3. o botão é procurado **dentro do card**, nunca na página;
 *   4. qualquer ambiguidade — nenhum card, mais de um, nome divergente, mais de
 *      um botão — **PARA**, em vez de escolher.
 *
 * Nada aqui sobe para `parentElement`. A busca só desce.
 *
 * ## Interface
 *
 * As funções operam sobre um "card" mínimo — `{ id, nome, botoes }` — que tanto
 * um elemento real quanto um objeto de teste satisfazem. Assim a regra é
 * testável sem navegador, que é o mesmo motivo de `documentoSomenteLeitura`
 * existir separado do gate do `sb-storage.js` (§7-ter).
 */

export class SelecaoAmbigua extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'SelecaoAmbigua';
  }
}

/**
 * Acha o card do registro e confere que é ele mesmo.
 *
 * @param {Array<{id: string, nome: string, botoes?: Array<{rotulo: string}>}>} cards
 * @param {{ id: string, nomeEsperado: string }} alvo
 * @returns o card, ou lança `SelecaoAmbigua`.
 */
export function acharCardPorId(cards, { id, nomeEsperado }) {
  if (!id || typeof id !== 'string') {
    throw new SelecaoAmbigua('sem id estável do registro: ação destrutiva exige identificação exata');
  }
  if (!nomeEsperado || typeof nomeEsperado !== 'string') {
    throw new SelecaoAmbigua('sem nome esperado: o id sozinho não permite conferir que o alvo é o certo');
  }

  const casam = (cards ?? []).filter((c) => c && c.id === id);
  if (casam.length === 0) {
    throw new SelecaoAmbigua(`nenhum card com id ${id}`);
  }
  if (casam.length > 1) {
    throw new SelecaoAmbigua(`${casam.length} cards com o mesmo id ${id} — a tela está inconsistente`);
  }

  const card = casam[0];
  // A conferência é sobre o nome DAQUELE card, não sobre o texto da página. É
  // esta linha que teria impedido o acidente: o card do TERCAL não tem o nome
  // da empresa ZZ dentro dele.
  if (normalizar(card.nome) !== normalizar(nomeEsperado)) {
    throw new SelecaoAmbigua(
      `o card ${id} mostra "${card.nome}", esperado "${nomeEsperado}" — PARAR em vez de excluir o registro errado`,
    );
  }
  return card;
}

/**
 * O botão da ação, procurado DENTRO do card já confirmado.
 *
 * Nunca receba a lista de botões da página: é o escopo que separa "o Excluir
 * deste registro" de "o primeiro Excluir que apareceu".
 */
export function acharBotaoNoCard(card, rotulo) {
  const achados = (card.botoes ?? []).filter((b) => b && normalizar(b.rotulo) === normalizar(rotulo));
  if (achados.length === 0) throw new SelecaoAmbigua(`o card ${card.id} não tem botão "${rotulo}"`);
  if (achados.length > 1) throw new SelecaoAmbigua(`o card ${card.id} tem ${achados.length} botões "${rotulo}"`);
  return achados[0];
}

/**
 * O caminho completo de uma exclusão: id → nome → mesmo card → botão.
 *
 * Devolve `{ card, botao }` pronto para o clique, ou lança. Não clica: quem
 * decide apertar é o chamador, e a confirmação em dois passos da tela continua
 * valendo por cima disto.
 */
export function prepararExclusao(cards, { id, nomeEsperado, rotulo = 'Excluir' }) {
  const card = acharCardPorId(cards, { id, nomeEsperado });
  return { card, botao: acharBotaoNoCard(card, rotulo) };
}

/**
 * Extrai os cards de um contêiner real do DOM.
 *
 * `seletorCard` precisa casar o ELEMENTO DO REGISTRO — não um ancestral. O id
 * vem de um atributo estável (`data-id`), e o nome, de um elemento interno.
 * Sem `data-id` na tela, prefira casar pelo id vindo do estado/armazenamento e
 * NÃO tente adivinhar pelo texto.
 */
export function lerCardsDoDom(raiz, { seletorCard, seletorNome, atributoId = 'data-id' }) {
  return [...raiz.querySelectorAll(seletorCard)].map((el) => ({
    id: el.getAttribute(atributoId) ?? '',
    nome: (el.querySelector(seletorNome)?.textContent ?? '').trim(),
    botoes: [...el.querySelectorAll('button')].map((b) => ({
      rotulo: (b.getAttribute('title') || b.textContent || '').trim(),
      el: b,
    })),
    el,
  }));
}

function normalizar(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * O padrão PROIBIDO, preservado para o teste poder demonstrar que ele erra.
 *
 * Não use. Existe só para que a regressão seja provada, não afirmada.
 */
export function __padraoInseguroSobeAncestrais(botoes, textoProcurado, niveis = 6) {
  return botoes.find((b) => {
    let e = b;
    for (let i = 0; i < niveis && e; i++) {
      if (String(e.texto ?? '').includes(textoProcurado)) return true;
      e = e.pai;
    }
    return false;
  });
}
