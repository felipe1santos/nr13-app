import type { ItemFaltante } from './oQueFalta';

/**
 * O QUE FALTA, EM POUCOS ITENS — 10/09/2026.
 *
 * ## O problema
 *
 * A detecção campo a campo está certa e não muda: `oQueFalta` deriva do MESMO
 * ponto que pinta o amarelo, e o gate prova que nenhum campo crítico fica sem
 * pendência. Mas um documento novo tem ~100 células vazias, e a barra virava
 * uma lista de cem linhas — a informação certa numa forma inútil.
 *
 * ## A separação
 *
 * - **Camada interna** (`oQueFalta`): continua sabendo dos cem campos, com id,
 *   página, seção e coordenada. Nada aqui a substitui.
 * - **Camada de apresentação** (este arquivo): agrupa os cem em poucas AÇÕES.
 *
 * É por isso que o agrupamento é uma função pura sobre `ItemFaltante[]`, e não
 * uma lista de grupos escrita à mão: uma lista à mão deixaria de fora o campo
 * que alguém acrescentasse amanhã, e é exatamente o defeito que a rodada de
 * 09/09 consertou.
 *
 * ## As duas regras de fusão
 *
 * 1. **Mesmo campo do painel** (`campoConfig`) vira UM item. `capa.art` e
 *    `inspecao.art` são duas linhas do documento e um dado só; listá-las
 *    separadas pede duas ações para um preenchimento.
 * 2. **Mesma seção** vira um item, com a contagem ao lado.
 *
 * E uma exceção que evita burocracia: seção com UM campo mostra o nome do
 * campo, não o da seção — "Escopo (1)" diz menos do que "Escopo e observações
 * da inspeção".
 */

export interface GrupoPendencia {
  /** Estável, para `key` e para teste. */
  id: string;
  /** O que a barra escreve. */
  titulo: string;
  /** "8 campos" — `null` quando o grupo é um campo só. */
  detalhe: string | null;
  /** Todos os campos do grupo, na ordem das folhas. */
  itens: ItemFaltante[];
  /**
   * Para onde o clique leva: o PRIMEIRO campo pendente do grupo, que é o mais
   * acima no documento. Clicar de novo avança — ver `proximoDoGrupo`.
   */
  primeiro: ItemFaltante;
}

/**
 * Agrupa preservando a ORDEM DE APARIÇÃO. Quem revisa lê a barra com o
 * documento do lado; uma barra reordenada por contagem obrigaria a procurar.
 */
export function agruparPendencias(itens: ItemFaltante[]): GrupoPendencia[] {
  const ordem: string[] = [];
  const porChave = new Map<string, ItemFaltante[]>();

  for (const it of itens) {
    // Campo de painel: a chave é o CAMPO, não a seção — o mesmo dado aparece
    // em folhas diferentes e se resolve num lugar só.
    const chave = it.campoConfig ? `cfg:${it.campoConfig}` : `sec:${it.secao}`;
    if (!porChave.has(chave)) {
      porChave.set(chave, []);
      ordem.push(chave);
    }
    porChave.get(chave)!.push(it);
  }

  return ordem.map((chave) => {
    const grupo = porChave.get(chave)!;
    const primeiro = grupo[0];
    const doPainel = chave.startsWith('cfg:');
    // Um campo só — ou um campo do painel, que é sempre uma ação só — leva o
    // nome do campo. Vários campos de uma seção levam o nome da seção.
    const titulo = doPainel || grupo.length === 1 ? primeiro.nome : primeiro.secao;
    return {
      id: chave,
      titulo,
      // Campo de painel não leva contagem: as duas linhas do documento se
      // resolvem num input só, e dizer "2 campos" prometeria dois trabalhos.
      detalhe: !doPainel && grupo.length > 1 ? `${grupo.length} campos` : null,
      itens: grupo,
      primeiro,
    };
  });
}

/**
 * O próximo campo do grupo, para o clique repetido percorrer a seção inteira.
 *
 * `atual` é o id visitado por último. Sem ele, ou no fim da volta, devolve o
 * primeiro — o ciclo fecha em vez de travar no último.
 */
export function proximoDoGrupo(grupo: GrupoPendencia, atual: string | null): ItemFaltante {
  if (!atual) return grupo.primeiro;
  const i = grupo.itens.findIndex((x) => x.id === atual);
  if (i < 0) return grupo.primeiro;
  return grupo.itens[(i + 1) % grupo.itens.length];
}

/**
 * A conta que o painel mostra: GRUPOS para o usuário, campos para o
 * diagnóstico. Os dois números são úteis, e confundi-los foi o que produziu
 * "O que falta (105)".
 */
export function contagemPendencias(itens: ItemFaltante[]): { grupos: number; campos: number } {
  return { grupos: agruparPendencias(itens).length, campos: itens.length };
}
