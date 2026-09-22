/**
 * AS CHAVES-LISTA, E COMO SE JUNTAM DUAS VERSÕES DELAS (22/09/2026).
 *
 * ## O problema
 *
 * A unidade de sincronização do sistema é a CHAVE: a fila manda o blob inteiro
 * e a RPC compara versões (`aplicar_mutacao_storage`). Para uma chave que
 * guarda UM documento isso é exato — o blob é a entidade.
 *
 * Para as chaves que guardam uma LISTA, não é. "Escolher um lado" vira escolher
 * a lista inteira, e o lado perdedor leva junto itens que ninguém quis remover.
 *
 * Medido em produção em 22/09/2026, conta de teste: `nr13_pront_indice` com
 * **1 item** neste aparelho e **5 no servidor** — o local era subconjunto
 * estrito, e mesmo assim a tela pedia ao usuário para escolher entre "perder
 * quatro" e "perder nada". Entre os quatro havia dois prontuários EMITIDOS.
 *
 * ## O desenho, e por que ele é o menor possível
 *
 * A lista continua sendo um array numa chave — **nada muda no formato de
 * negócio, na RPC, na fila ou no SQL**. O que entra é:
 *
 * 1. um CATÁLOGO explícito dizendo quais chaves são listas e qual campo
 *    identifica o item (nada de heurística espalhada);
 * 2. `removidoEm` NO PRÓPRIO ITEM — o tombstone mora dentro da lista, então ele
 *    viaja pelo mesmo caminho do resto e o servidor não precisa saber de nada;
 * 3. uma função de MERGE por item, usada quando as duas versões divergem.
 *
 * Tombstone por item é o que impede o merge de **ressuscitar** o que foi
 * excluído: sem ele, um aparelho offline que ainda tem o item C manda C de
 * volta, e o merge — que só sabe unir — o traz de volta à vida. É por isso que
 * catálogo e tombstone entram na MESMA entrega: merge sem tombstone é pior do
 * que não ter merge.
 *
 * ## O que este módulo NÃO faz
 *
 * Não resolve divergência no mesmo CAMPO do mesmo item: isso continua indo para
 * decisão do usuário. Não toca em documento oficial — `nr13_rel_` finalizado,
 * certificado emitido e PDF arquivado seguem imutáveis por trava no banco
 * (§4-quinquies) e não são listas.
 */

/** Um item de coleção, do ponto de vista do merge. */
export interface ItemColecao {
  /** Marca de EXCLUSÃO. Presente = removido; o item continua na lista. */
  removidoEm?: string;
  [campo: string]: unknown;
}

export interface DefinicaoColecao {
  /** A chave exata, ou o prefixo quando a coleção é por TAG. */
  chave: string;
  /** `true` quando `chave` é prefixo (`nr13_calibracoes_<TAG>`). */
  porPrefixo?: boolean;
  /**
   * O ID ESTÁVEL do item dentro da lista.
   *
   * É o que decide se dois itens são "o mesmo" nas duas versões. Tem de ser
   * estável entre aparelhos: um índice de array não serve (foi exatamente o
   * defeito dos ids posicionais do quadro 7.1.1).
   */
  id: (item: ItemColecao) => string | null;
  /** Para diagnóstico e mensagem de tela. */
  rotulo: string;
}

const porId = (campo: string) => (i: ItemColecao) => {
  const v = i?.[campo];
  return typeof v === 'string' && v !== '' ? v : null;
};

/**
 * O CATÁLOGO. Uma chave só entra aqui quando alguém pode editá-la em dois
 * aparelhos — é o que justifica pagar o custo do merge.
 */
export const COLECOES: DefinicaoColecao[] = [
  { chave: 'nr13_pront_indice', id: porId('id'), rotulo: 'documentos de prontuário' },
  { chave: 'nr13_rascunhos', id: porId('id'), rotulo: 'relatórios em rascunho' },
  { chave: 'nr13_lista_phs', id: porId('id'), rotulo: 'funcionários' },
  { chave: 'nr13_clientes', id: porId('id'), rotulo: 'clientes' },
  { chave: 'nr13_agenda_notas', id: porId('id'), rotulo: 'notas da agenda' },
  { chave: 'nr13_historico_indice_', porPrefixo: true, id: porId('id'), rotulo: 'histórico do equipamento' },
  { chave: 'nr13_calibracoes_', porPrefixo: true, id: porId('id'), rotulo: 'calibrações do equipamento' },
  { chave: 'nr13_docs_', porPrefixo: true, id: porId('id'), rotulo: 'containers de inspeção' },
  { chave: 'nr13_componentes_cal_', porPrefixo: true, id: porId('id'), rotulo: 'componentes de calibração' },
  { chave: 'nr13_lotes_cal_', porPrefixo: true, id: porId('id'), rotulo: 'lotes de calibração' },
];

/**
 * `nr13_relatorios_arquivados` guarda IDS (strings), não objetos — o merge de
 * um conjunto de ids é a UNIÃO, e ela não precisa de tombstone por item porque
 * desarquivar é a própria remoção do id. Fica fora do catálogo de propósito:
 * uma definição que não se aplica é pior do que a ausência dela.
 */
export const COLECOES_FORA = ['nr13_relatorios_arquivados', 'nr13_historico_relatorios'];

/** A definição daquela chave, ou `null` se ela não é uma coleção conhecida. */
export function colecaoDaChave(chave: string): DefinicaoColecao | null {
  for (const c of COLECOES) {
    if (c.porPrefixo ? chave.startsWith(c.chave) && chave.length > c.chave.length : chave === c.chave) {
      return c;
    }
  }
  return null;
}

export function ehColecao(chave: string): boolean {
  return colecaoDaChave(chave) !== null;
}

/** O item está marcado como removido? */
export function removido(item: ItemColecao): boolean {
  return typeof item?.removidoEm === 'string' && item.removidoEm !== '';
}

/**
 * Marca o item como REMOVIDO em vez de tirá-lo da lista.
 *
 * O carimbo é o `quando` que o chamador passa — nunca `Date.now()` lido aqui
 * dentro. O relógio do dispositivo não é autoridade (a ordenação continua sendo
 * da versão do servidor); este campo serve para o merge saber que houve uma
 * remoção deliberada, não para decidir quem ganhou.
 */
export function marcarRemovido(item: ItemColecao, quando: string): ItemColecao {
  return { ...item, removidoEm: quando };
}

/** A lista como as telas a leem: sem os tombstones. */
export function visiveis<T extends ItemColecao>(lista: T[]): T[] {
  return (lista ?? []).filter((i) => !removido(i));
}

export interface ResultadoMerge<T extends ItemColecao = ItemColecao> {
  lista: T[];
  /** Itens presentes nos dois lados e DIFERENTES — o caso que ainda é do usuário. */
  ambiguos: string[];
  /** Entrou porque só existia num dos lados. */
  adicionados: string[];
  /** Ficou marcado como removido por causa de um tombstone. */
  removidos: string[];
}

/**
 * Junta duas versões da MESMA coleção.
 *
 * As regras, e o caso que cada uma resolve:
 *
 * | situação | resultado |
 * |---|---|
 * | item só no servidor | fica (nada se perde por estar ausente aqui) |
 * | item só no local | entra (criação offline) |
 * | item igual nos dois | fica |
 * | item com TOMBSTONE de um lado | fica REMOVIDO — exclusão vence união |
 * | item diferente nos dois | fica o do SERVIDOR e entra em `ambiguos` |
 *
 * A última linha é deliberada e é o limite desta rodada: sem comparar campo a
 * campo, escolher o lado local seria descartar em silêncio o que outro aparelho
 * gravou. Preservar o do servidor e AVISAR é a escolha que não perde nada —
 * o valor local continua na store de conflitos.
 *
 * Item sem id não é mesclável: ele é mantido, de todo lado onde aparecer, e não
 * conta como ambíguo. Descartar um item porque o catálogo não sabe identificá-lo
 * seria o merge apagando dado por ignorância.
 */
export function mesclarColecao<T extends ItemColecao>(
  local: T[],
  servidor: T[],
  idDe: (i: ItemColecao) => string | null,
  /**
   * A BASE: a versão da coleção que este aparelho conhecia quando começou a
   * editar. Opcional, e é ela que separa os dois casos que, de fora, parecem
   * iguais:
   *
   * - **eu alterei o item** (local ≠ base) → a minha alteração é real;
   * - **eu tenho a cópia velha** (local = base) → não alterei nada; o servidor
   *   mudou enquanto eu estava offline, e a versão dele vence SEM ambiguidade.
   *
   * Sem base, os dois casos se confundem e todo item que o servidor mexeu
   * durante o offline viraria "divergente" — devolvendo ao usuário uma decisão
   * que não existe. Com base, o §14 (dois aparelhos, itens diferentes) resolve
   * sozinho.
   *
   * Note que **nenhum relógio é consultado**: a comparação é de CONTEÚDO contra
   * a base, não de horário. O relógio do dispositivo não é autoridade aqui.
   */
  base?: T[],
): ResultadoMerge<T> {
  const saida: T[] = [];
  const ambiguos: string[] = [];
  const adicionados: string[] = [];
  const removidos: string[] = [];

  const mapaLocal = new Map<string, T>();
  const semIdLocal: T[] = [];
  for (const i of local ?? []) {
    const id = idDe(i);
    if (id === null) semIdLocal.push(i);
    else mapaLocal.set(id, i);
  }

  const mapaBase = new Map<string, string>();
  for (const i of base ?? []) {
    const id = idDe(i);
    if (id !== null) mapaBase.set(id, JSON.stringify(i));
  }
  /** O item está IGUAL ao que este aparelho conhecia? Então ninguém o editou aqui. */
  const naoMexeuAqui = (id: string, doLocal: T) =>
    mapaBase.has(id) && mapaBase.get(id) === JSON.stringify(doLocal);
  /** E o inverso: o servidor está igual à base, então quem mexeu fui eu. */
  const naoMexeuLa = (id: string, doServidor: T) =>
    mapaBase.has(id) && mapaBase.get(id) === JSON.stringify(doServidor);

  const vistos = new Set<string>();

  // 1 · o SERVIDOR é a base: percorrer por ele preserva a ordem de quem já está
  // publicado, e é o que garante que nada de lá desapareça por ausência aqui.
  for (const doServidor of servidor ?? []) {
    const id = idDe(doServidor);
    if (id === null) {
      saida.push(doServidor);
      continue;
    }
    vistos.add(id);
    const doLocal = mapaLocal.get(id);

    if (!doLocal) {
      saida.push(doServidor);
      continue;
    }

    // TOMBSTONE de qualquer lado vence: quem excluiu tomou uma decisão, e o
    // outro lado só tem uma cópia anterior a ela.
    if (removido(doLocal) || removido(doServidor)) {
      const carimbo = (removido(doLocal) ? doLocal.removidoEm : doServidor.removidoEm) as string;
      saida.push({ ...doServidor, ...doLocal, removidoEm: carimbo });
      removidos.push(id);
      continue;
    }

    if (JSON.stringify(doLocal) === JSON.stringify(doServidor)) {
      saida.push(doServidor);
      continue;
    }

    // Com BASE, a maioria das "divergências" tem dono claro.
    if (naoMexeuAqui(id, doLocal)) {
      // Cópia velha: o servidor mudou durante o offline. Nada meu se perde.
      saida.push(doServidor);
      continue;
    }
    if (naoMexeuLa(id, doServidor)) {
      // Só eu mexi: a minha edição é a alteração mais recente DESTE item.
      saida.push(doLocal);
      continue;
    }

    // Os DOIS mexeram no mesmo item (ou não há base para saber): o servidor
    // fica e a divergência é NOMEADA. Field merge é a próxima rodada (§10).
    saida.push(doServidor);
    ambiguos.push(id);
  }

  // 2 · o que só existe aqui — criação offline.
  for (const [id, doLocal] of mapaLocal) {
    if (vistos.has(id)) continue;
    saida.push(doLocal);
    if (!removido(doLocal)) adicionados.push(id);
  }

  // 3 · itens sem id nunca somem.
  saida.push(...semIdLocal);

  return { lista: saida, ambiguos, adicionados, removidos };
}

/**
 * Dá para resolver esta divergência sozinho?
 *
 * Só quando nenhum item ficou ambíguo. Um único item divergente já devolve a
 * decisão ao usuário — o ganho está em que os outros casos (criação offline,
 * itens diferentes, exclusão, subconjunto) param de precisar dela.
 */
export function mergeResolveSozinho(r: ResultadoMerge): boolean {
  return r.ambiguos.length === 0;
}
