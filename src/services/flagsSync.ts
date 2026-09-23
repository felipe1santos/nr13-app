/**
 * OS INTERRUPTORES DA SINCRONIZAÇÃO, NUM LUGAR SÓ (22/09/2026).
 *
 * Até esta rodada cada interruptor era um `const` no seu módulo
 * (`colecoes.TOMBSTONE_ATIVO`, `colecaoSync.MERGE_AUTOMATICO_ATIVO`,
 * `filaItem.FILA_POR_ITEM_ATIVA`). Isso bastava para mantê-los desligados, e
 * não bastava para o que o dono pediu agora: **provar que ligá-los é seguro,
 * antes de ligar**. Um `const` não se simula — ou o teste mente (mockando o
 * módulo inteiro, e aí não testa o módulo) ou o código de produção nasce ligado.
 *
 * Aqui os três são estado, com o PADRÃO desligado. O padrão é o que vai para
 * produção; quem liga é explícito e nominal.
 *
 * ## Quem tem permissão de ligar
 *
 * - os TESTES, via `definirFlagsSync`, sempre com `restaurarFlagsSync` no
 *   `beforeEach` — um teste que liga e não desliga contamina os seguintes;
 * - uma futura ATIVAÇÃO CONTROLADA por organização, que é o destino desta
 *   infraestrutura: a v2 já provou (§2-ter do CLAUDE.md) que virar uma chave
 *   para todo mundo de uma vez é o caminho caro.
 *
 * Nada mais. Não há leitura de `localStorage`, de URL nem de variável de
 * ambiente: um interruptor que se liga sozinho por um parâmetro de query é o
 * que se liga por engano.
 *
 * ## A ORDEM, que não se inverte
 *
 * 1. leitores enxergando a visão filtrada — feito em 22/09/2026;
 * 2. base registrada no ACK real da fila — feito em 22/09/2026;
 * 3. `tombstone` — a exclusão passa a MARCAR;
 * 4. `mergeAutomatico` — o conflito de coleção passa a resolver sozinho.
 *
 * O 3 antes do 1 faria item excluído reaparecer na tela. O 4 antes do 3
 * RESSUSCITA item excluído, porque o merge só sabe unir: sem tombstone, o
 * aparelho atrasado que ainda tem o item o traz de volta e o merge o aceita.
 * `definirFlagsSync` recusa essa combinação em vez de confiar em quem chama.
 */

export interface FlagsSync {
  /** A exclusão MARCA o item (`removidoEm`) em vez de tirá-lo da lista. */
  tombstone: boolean;
  /** Conflito de coleção resolvido por merge de três vias, sem perguntar. */
  mergeAutomatico: boolean;
  /** A fila descreve intenção por item em vez do blob da chave. */
  filaPorItem: boolean;
}

/** O que vai para produção. Os três desligados. */
export const PADRAO_SYNC: Readonly<FlagsSync> = Object.freeze({
  tombstone: false,
  mergeAutomatico: false,
  filaPorItem: false,
});

let atual: FlagsSync = { ...PADRAO_SYNC };

/** O estado vigente. Chamada em caminho quente: devolve o objeto, sem cópia. */
export function flagsSync(): Readonly<FlagsSync> {
  return atual;
}

export class CombinacaoDeFlagsInvalida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'CombinacaoDeFlagsInvalida';
  }
}

/**
 * Liga/desliga interruptores. Só teste e ativação controlada chamam.
 *
 * Recusa `mergeAutomatico` sem `tombstone`: é a única combinação capaz de
 * apagar dado do usuário — o merge une, o aparelho atrasado manda o item
 * excluído de volta, e a exclusão é desfeita sem ninguém pedir. Recusar aqui é
 * mais barato do que descobrir em produção.
 */
export function definirFlagsSync(parcial: Partial<FlagsSync>): void {
  const proposto = { ...atual, ...parcial };
  if (proposto.mergeAutomatico && !proposto.tombstone) {
    throw new CombinacaoDeFlagsInvalida(
      'mergeAutomatico exige tombstone: sem a marca de exclusão, o merge ressuscita o item excluído',
    );
  }
  atual = proposto;
}

/** Volta ao padrão de produção. Todo teste que liga alguma coisa chama isto. */
export function restaurarFlagsSync(): void {
  atual = { ...PADRAO_SYNC };
}
