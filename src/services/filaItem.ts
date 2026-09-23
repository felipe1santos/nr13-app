/**
 * A FILA POR ITEM — implementada, NÃO integrada, NÃO ativada (22/09/2026).
 *
 * Os três estados são diferentes e o relatório desta rodada os separa:
 *
 * | estado | aqui |
 * |---|---|
 * | implementada | **SIM** — `upsertItem` / `removeItem` existem e são testadas |
 * | integrada | **NÃO** — nenhum caminho de produto as chama |
 * | ativada | **NÃO** — `FILA_POR_ITEM_ATIVA` é `false` |
 *
 * ## O problema que ela resolve, e por que ainda não entra
 *
 * A fila real manda o BLOB da chave inteira (`op: 'set'`, `valor` = a lista
 * serializada) e a RPC compara versões. Dois aparelhos que acrescentam itens
 * DIFERENTES à mesma lista colidem, porque a unidade de comparação é a chave e
 * não o item — mesmo quando ninguém tocou no que o outro fez.
 *
 * A operação por item descreve a INTENÇÃO ("acrescente/atualize o item X",
 * "marque X como removido") em vez do resultado ("a lista passa a ser esta").
 * Duas intenções sobre itens distintos compõem sem conflito nenhum.
 *
 * **Por que não ativar agora:** a RPC do servidor não sabe aplicar intenção —
 * ela grava o `valor` que recebe. Ativar a fila por item exigiria ou um SQL
 * novo (`aplicar_item_storage`), que é migration em produção, ou reduzir a
 * intenção a um blob no cliente antes de enviar — que é o que
 * `reduzirParaBlob` faz aqui, e é o caminho que uma rodada futura pode ligar
 * com a base já registrada por ACK.
 *
 * Nada neste arquivo é importado por código de produto. É de propósito: uma
 * fila nova parcialmente ligada seria duas filas discordando sobre a mesma
 * chave.
 */
import { colecaoDaChave, marcarRemovido, removido } from './colecoes';
import { PADRAO_SYNC } from './flagsSync';

/** O INTERRUPTOR. Desligado, e o produto sequer chama este módulo. */
export const FILA_POR_ITEM_ATIVA = PADRAO_SYNC.filaPorItem;

export type OpItem = 'upsert' | 'remove';

export interface MutacaoItem {
  /** Idempotência, igual à da fila atual: reenviar o mesmo id é inofensivo. */
  mutationId: string;
  op: OpItem;
  /** A chave da COLEÇÃO. Não é a chave do item — o item não tem chave própria. */
  chave: string;
  /** O id estável do item dentro da lista. */
  itemId: string;
  /** O item inteiro, no `upsert`. Ausente no `remove`. */
  valor?: object;
  /**
   * A versão da chave que este aparelho tinha como BASE quando a intenção
   * nasceu. Vem de `baseColecao.baseDe` — é o elo entre esta fila e o trabalho
   * de BASE desta rodada.
   */
  versaoBase: number;
  dispositivo: string;
  criadoEm: string;
}

/** Descreve "este item passa a ser assim". Função pura: não toca em storage. */
export function upsertItem(
  chave: string,
  item: object,
  contexto: { mutationId: string; versaoBase: number; dispositivo: string; criadoEm: string },
): MutacaoItem | null {
  const def = colecaoDaChave(chave);
  if (!def) return null; // chave que não é coleção não tem item para descrever
  const itemId = def.id(item);
  if (itemId === null) return null; // sem id estável não há intenção endereçável
  return { ...contexto, op: 'upsert', chave, itemId, valor: item };
}

/** Descreve "este item foi excluído". O tombstone nasce na aplicação, não aqui. */
export function removeItem(
  chave: string,
  itemId: string,
  contexto: { mutationId: string; versaoBase: number; dispositivo: string; criadoEm: string },
): MutacaoItem | null {
  if (!colecaoDaChave(chave)) return null;
  if (!itemId) return null;
  return { ...contexto, op: 'remove', chave, itemId };
}

/**
 * Aplica uma intenção a uma lista. É a semântica que o servidor teria de ter.
 *
 * `remove` MARCA, nunca tira: é o que impede a ressurreição quando um aparelho
 * atrasado reenviar o item. Item que não está na lista e é removido vira um
 * tombstone órfão — deliberado, porque a exclusão precisa sobreviver à ordem em
 * que as mutações chegarem.
 */
export function aplicarItem<T extends object>(lista: T[], m: MutacaoItem, quando?: string): T[] {
  const def = colecaoDaChave(m.chave);
  if (!def) return lista ?? [];
  const atual = lista ?? [];
  const i = atual.findIndex((x) => def.id(x) === m.itemId);

  if (m.op === 'upsert') {
    if (!m.valor) return atual;
    // Upsert NÃO ressuscita: um item marcado como removido continua removido,
    // porque a exclusão é posterior ao conteúdo que este upsert carrega. Quem
    // quiser recriá-lo cria um item com id novo.
    if (i >= 0 && removido(atual[i])) return atual;
    const novo = m.valor as T;
    return i >= 0 ? atual.map((x, k) => (k === i ? novo : x)) : [...atual, novo];
  }

  const carimbo = quando ?? m.criadoEm;
  if (i < 0) return [...atual, marcarRemovido({ id: m.itemId } as unknown as T, carimbo)];
  return atual.map((x, k) => (k === i ? marcarRemovido(x, carimbo) : x));
}

/**
 * Reduz uma sequência de intenções ao BLOB que a fila atual sabe enviar.
 *
 * É a ponte de compatibilidade: com ela, ligar a fila por item não exige
 * migration — a intenção vive no cliente, e o que sobe continua sendo a lista
 * inteira sobre a base correta. O ganho fica sendo a COMPOSIÇÃO local (duas
 * abas, dois fluxos) e a resolução de conflito sem perguntar ao usuário; o
 * ganho de rede exigiria o SQL novo.
 */
export function reduzirParaBlob<T extends object>(base: T[], mutacoes: MutacaoItem[]): T[] {
  let lista = base ?? [];
  for (const m of mutacoes) lista = aplicarItem(lista, m);
  return lista;
}
