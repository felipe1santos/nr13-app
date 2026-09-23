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
 * - o SERVIDOR, via `aplicarFlagsDoServidor`, chamada por
 *   `flag.sincronizarFlagDoServidor()` com o que veio de `org_sync`. É a fonte
 *   da verdade, e é por organização;
 * - os TESTES, via `definirFlagsSync`, sempre com `restaurarFlagsSync` no
 *   `beforeEach` — um teste que liga e não desliga contamina os seguintes.
 *
 * Nada mais. Não há leitura de `localStorage`, de URL nem de variável de
 * ambiente: um interruptor que se liga sozinho por um parâmetro de query é o
 * que se liga por engano, e este é de arquitetura de dados.
 *
 * ## A última configuração CONFIRMADA sobrevive offline (23/09/2026)
 *
 * Até o canário da ZZ estas flags só existiam em memória. Boot OFFLINE → a
 * consulta a `org_sync` falha → padrões desligados pela sessão inteira, mesmo
 * depois de a rede voltar. Medido: um aparelho no bundle novo excluiu SEM
 * `removidoEm` numa organização com tombstone ligado, e a guarda do servidor o
 * tratou como cliente antigo. Para um sistema offline-first, "errar para o lado
 * desligado" deixou de ser o lado barato.
 *
 * Agora `flag.ts` grava a resposta do servidor no IndexedDB DA ORGANIZAÇÃO
 * (`meta`, chave `sync-config`) e `storageV2.iniciar` a recarrega quando o
 * servidor não respondeu. O valor em disco não é configuração editável: é "o
 * que o servidor disse da última vez", e a ORIGEM de cada valor em memória fica
 * registrada aqui (`origemConfigSync`) porque quem decide depende dela:
 *
 * | origem | de onde veio | pode subir coleção? | pode mesclar? |
 * |---|---|---|---|
 * | `padrao` | nada carregado (testes, pré-boot) | sim — comportamento de sempre | só se ligado |
 * | `desconhecida` | boot offline e nenhum registro em disco | não | não |
 * | `cache` | disco, ou `servidor` que precisa ser revalidado | não | não |
 * | `servidor` | respondido NESTA conexão | sim | se ligado |
 *
 * O servidor continua sendo a autoridade: nada aqui libera escrita, e a guarda
 * `trg_guardar_exclusao_sem_marca` continua recusando exclusão sem marca.
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

/** De onde vieram os valores em memória. Ver a tabela no topo do arquivo. */
export type OrigemConfigSync = 'padrao' | 'desconhecida' | 'cache' | 'servidor';

let origem: OrigemConfigSync = 'padrao';
/** A organização a que os valores em memória pertencem. `null` em `padrao`. */
let orgDaConfig: string | null = null;
/** Quando o servidor confirmou pela última vez (ISO). */
let confirmadoEm: string | null = null;

export function origemConfigSync(): OrigemConfigSync {
  return origem;
}

export function orgConfigSync(): string | null {
  return orgDaConfig;
}

export function configConfirmadaEm(): string | null {
  return confirmadoEm;
}

/**
 * O servidor respondeu NESTA conexão? É a pergunta que a drenagem de coleção e
 * o merge automático fazem antes de agir.
 *
 * `padrao` responde que sim porque é o comportamento de sempre — nenhuma
 * organização carregou nada, então não existe configuração a contradizer.
 */
export function configPermiteColecao(): boolean {
  return origem === 'padrao' || origem === 'servidor';
}

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

/**
 * Aplica o que o SERVIDOR informou para esta organização.
 *
 * CLAMPA em vez de lançar, ao contrário de `definirFlagsSync`. A constraint
 * `org_sync_merge_exige_tombstone` já impede a combinação inválida no banco;
 * se ela chegar aqui mesmo assim (banco sem a migração, linha adulterada), o
 * certo é desligar o merge e seguir — derrubar o login por causa de uma flag
 * deixaria a conta inteira inacessível por um campo que só decide como um
 * conflito é resolvido.
 */
export function aplicarFlagsDoServidor(
  parcial: Partial<FlagsSync>,
  org: string | null = null,
  quando: string = new Date().toISOString(),
): void {
  atual = normalizar(parcial);
  origem = 'servidor';
  orgDaConfig = org;
  confirmadoEm = quando;
}

function normalizar(parcial: Partial<FlagsSync>): FlagsSync {
  const proposto = { ...PADRAO_SYNC, ...parcial, filaPorItem: false };
  if (proposto.mergeAutomatico && !proposto.tombstone) {
    console.warn('[sync] org com mergeAutomatico sem tombstone: merge desligado por segurança.');
    proposto.mergeAutomatico = false;
  }
  return proposto;
}

/**
 * Boot sem resposta do servidor: vale a ÚLTIMA configuração que ele confirmou
 * para esta organização. Nunca sobrescreve uma resposta do servidor desta
 * sessão para a mesma org — o disco é mais velho que ela por definição.
 */
export function aplicarFlagsDoCache(
  parcial: Partial<FlagsSync>,
  org: string,
  quandoConfirmado: string | null,
): void {
  if (origem === 'servidor' && orgDaConfig === org) return;
  atual = normalizar(parcial);
  origem = 'cache';
  orgDaConfig = org;
  confirmadoEm = quandoConfirmado;
}

/**
 * Boot offline e NENHUM registro em disco para esta organização — o aparelho
 * nunca ouviu o servidor sobre ela (ou o registro foi perdido). Não se inventa
 * que a Sync V2 está ligada: as flags ficam desligadas. Mas a origem fica
 * `desconhecida`, e é isso que faz a exclusão MARCAR provisoriamente e a
 * coleção esperar a confirmação antes de subir (ver `colecoes.excluirDaLista`
 * e `sync.drenar`).
 */
export function marcarConfigDesconhecida(org: string): void {
  if (origem === 'servidor' && orgDaConfig === org) return;
  atual = { ...PADRAO_SYNC };
  origem = 'desconhecida';
  orgDaConfig = org;
  confirmadoEm = null;
}

/**
 * A conexão voltou (ou caiu): a confirmação desta sessão pode estar velha. Os
 * VALORES ficam — são a melhor informação que existe — e só a origem desce a
 * `cache`, para que a próxima drenagem de coleção pergunte ao servidor antes.
 */
export function marcarParaRevalidar(): void {
  if (origem === 'servidor') origem = 'cache';
}

/**
 * Volta ao padrão de produção.
 *
 * Chamada no LOGOUT e na troca de organização (`flag.zerarFlagEmMemoria`): as
 * flags são POR ORGANIZAÇÃO, e herdar as da conta anterior ligaria o tombstone
 * numa organização que não o habilitou. Todo teste que liga alguma coisa também
 * chama isto.
 */
export function restaurarFlagsSync(): void {
  atual = { ...PADRAO_SYNC };
  origem = 'padrao';
  orgDaConfig = null;
  confirmadoEm = null;
}
