import { flagsSync, origemConfigSync, PADRAO_SYNC } from './flagsSync';

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

/**
 * Um item de coleção, do ponto de vista do merge.
 *
 * SEM index signature de propósito: com ela, nenhuma interface de negócio real
 * (`DocumentoProntuario`, `RascunhoItem`…) satisfaria a constraint, e cada
 * chamador precisaria de um cast. O merge lê campos arbitrários por acesso
 * indexado interno, que é onde o `unknown` deve ficar.
 */
export interface ItemColecao {
  /** Marca de EXCLUSÃO. Presente = removido; o item continua na lista. */
  removidoEm?: string;
}

/** Leitura de um campo qualquer do item, sem espalhar cast pelos chamadores. */
function campo(item: object, nome: string): unknown {
  return (item as unknown as Record<string, unknown>)?.[nome];
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
  id: (item: object) => string | null;
  /** Para diagnóstico e mensagem de tela. */
  rotulo: string;
}

const porId = (nome: string) => (i: object) => {
  const v = campo(i, nome);
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
export function removido(item: object): boolean {
  const v = campo(item, 'removidoEm');
  return typeof v === 'string' && v !== '';
}

/**
 * Marca o item como REMOVIDO em vez de tirá-lo da lista.
 *
 * O carimbo é o `quando` que o chamador passa — nunca `Date.now()` lido aqui
 * dentro. O relógio do dispositivo não é autoridade (a ordenação continua sendo
 * da versão do servidor); este campo serve para o merge saber que houve uma
 * remoção deliberada, não para decidir quem ganhou.
 */
export function marcarRemovido<T extends object>(item: T, quando: string): T {
  return { ...item, removidoEm: quando };
}

/**
 * ONDE O TOMBSTONE MORA — a resposta ao §5 da rodada (22/09/2026).
 *
 * | pergunta | resposta |
 * |---|---|
 * | store | **nenhuma nova**: ele é um campo DO ITEM, dentro do array da chave |
 * | cliente | IndexedDB `nr13_dados_<org_id>`, store `dados`, chave da coleção |
 * | servidor | `app_storage.valor` da mesma chave — texto, como o resto da lista |
 * | formato | `removidoEm: string` ISO, no objeto do item |
 * | itemId | o id que o CATÁLOGO declara (`DefinicaoColecao.id`), não a posição |
 * | versão/base | a da CHAVE, em `baseColecao` — o item não tem versão própria |
 *
 * **Por que não uma store separada.** O IndexedDB já tem uma store
 * `tombstones` (`db.ts`), e ela é de outra coisa: a exclusão de uma CHAVE
 * inteira, que a RPC conhece e registra em `app_storage_excluidos`. Pôr o
 * tombstone de item lá criaria uma segunda fonte de verdade que o servidor não
 * recebe, que o merge precisaria consultar à parte, e que ficaria para trás do
 * dado na primeira falha parcial de transação.
 *
 * Dentro do item, o tombstone **viaja pelo mesmo caminho do resto**: a mesma
 * chave, a mesma mutação, a mesma versão, a mesma hidratação. É por isso que
 * NÃO existe migration a aplicar — nem local nem no servidor. `removidoEm` é
 * campo novo num objeto JSON; lista antiga simplesmente não o tem, e `removido`
 * responde `false`, que é a leitura correta de "este item nunca foi excluído".
 *
 * O custo é o acúmulo, e é ele que a seção PODA trata — sem apagar nada.
 */
export const ONDE_MORA_O_TOMBSTONE = 'no próprio item, dentro do array da chave da coleção';

/** A lista como as telas a leem: sem os tombstones. */
export function visiveis<T extends object>(lista: T[]): T[] {
  return (lista ?? []).filter((i) => !removido(i));
}

/**
 * O PADRÃO do interruptor do tombstone — o que vai para produção.
 *
 * O valor VIGENTE é `flagsSync().tombstone`, e é ele que `excluirDaLista` lê:
 * um `const` não se simula, e esta rodada precisa provar o comportamento
 * LIGADO sem entregar código ligado. Ver `flagsSync.ts`.
 *
 * Marcar sem mesclar é seguro (o leitor filtra); mesclar sem marcar ressuscita
 * item excluído. Por isso `definirFlagsSync` recusa `mergeAutomatico` sem este.
 */
export const TOMBSTONE_ATIVO = PADRAO_SYNC.tombstone;

/**
 * Exclui um item de uma lista BRUTA pela regra central.
 *
 * Com o tombstone ligado, marca; desligado, tira. Nenhum escritor decide isso
 * sozinho — foi a proliferação de `filter((x) => x.id !== id)` que tornou a
 * exclusão irrastreável para o merge.
 *
 * O `quando` é do chamador (relógio do dispositivo não é autoridade; ver
 * `marcarRemovido`), com o agora como conveniência de quem não tem um instante
 * melhor a oferecer.
 */
export function excluirDaLista<T extends object>(
  lista: T[],
  id: string,
  idDe: (i: object) => string | null,
  quando: string = new Date().toISOString(),
): T[] {
  const alvo = (i: T) => idDe(i) === id;
  return deveMarcarExclusao()
    ? (lista ?? []).map((i) => (alvo(i) ? marcarRemovido(i, quando) : i))
    : (lista ?? []).filter((i) => !alvo(i));
}

/**
 * Marcar ou tirar? Marca quando a organização tem tombstone — e TAMBÉM quando
 * este aparelho não sabe se tem (boot offline sem recibo; ver
 * `flagsSync.marcarConfigDesconhecida`).
 *
 * Por que marcar no desconhecido, e não tirar: tirar é a exclusão antiga, que
 * numa organização com tombstone ligado a guarda do servidor recusa e o merge
 * não enxerga. Marcar preserva a estrutura e adia a decisão para quando o
 * servidor responder — se ele disser que o tombstone está DESLIGADO, a marca
 * sai no envio (`sync.semMarcasParaEnvio`) e a exclusão vira a de sempre.
 * Nenhum dos dois lados perde a exclusão.
 */
export function deveMarcarExclusao(): boolean {
  return flagsSync().tombstone || origemConfigSync() === 'desconhecida';
}

/** Atalho para as coleções cujo id é o campo `id` — a maioria do catálogo. */
export function excluirPorId<T extends object>(lista: T[], id: string, quando?: string): T[] {
  return excluirDaLista(lista, id, porId('id'), quando);
}

export interface ResultadoMerge<T extends object = ItemColecao> {
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
export function mesclarColecao<T extends object>(
  local: T[],
  servidor: T[],
  idDe: (i: object) => string | null,
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
      const carimbo = campo(removido(doLocal) ? doLocal : doServidor, 'removidoEm') as string;
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

// ---------------------------------------------------------------------------
// PODA — telemetria agora, remoção nunca (22/09/2026)
// ---------------------------------------------------------------------------
/**
 * O tombstone é um item que continua na lista. Ele não some sozinho, e esta
 * seção é a resposta a "quando ele pode sumir".
 *
 * ## Por que NÃO existe poda automática aqui
 *
 * A regra tentadora — "tombstone com mais de N dias sai" — é insegura neste
 * sistema, e a razão é estrutural, não de gosto:
 *
 * 1. **O relógio não é autoridade.** `removidoEm` é carimbado pelo dispositivo
 *    que excluiu. Um aparelho com a data errada produz tombstone "antigo" no
 *    instante em que nasce, e a poda o apagaria na primeira drenagem.
 * 2. **Não existe piso de versão POR ITEM.** A RPC mantém
 *    `app_storage_excluidos.versao_final` por CHAVE — é o que impede uma chave
 *    excluída de voltar com versão antiga. Dentro da lista não há nada
 *    equivalente: o item é conteúdo, não linha. Sem piso por item, apagar o
 *    tombstone devolve a coleção ao estado anterior a esta rodada, em que um
 *    aparelho offline com a cópia velha reenvia o item e o merge o ressuscita.
 * 3. **Não existe piso de TEMPO conhecido.** O sistema é offline-first por
 *    desenho: o inspetor passa dias em campo sem rede. Não há limite superior
 *    demonstrável para "há quanto tempo o aparelho mais atrasado está sem
 *    sincronizar" — e a poda precisaria exatamente desse número.
 *
 * O usuário foi explícito: *"Prefiro tombstone acumulado a ressurreição
 * silenciosa."* Então a poda fica como PENDÊNCIA declarada, e o que entra é a
 * medição que dirá se ela chega a ser necessária.
 *
 * ## O que tornaria a poda segura (o desenho, para quando houver decisão)
 *
 * Um CORTE por coleção, confirmado pelo servidor: a versão da chave a partir da
 * qual todo aparelho ativo já sincronizou. Um tombstone cuja versão de origem
 * seja menor que o corte não pode mais ser contradito por ninguém, e só esse
 * pode sair. Isso exige duas coisas que hoje não existem:
 *
 * - o tombstone guardar a VERSÃO em que nasceu (não só a data);
 * - o servidor saber a menor versão sincronizada entre os dispositivos da
 *   organização (tabela de dispositivos com a última versão vista por chave).
 *
 * Nenhuma das duas é mudança local, e nenhuma é aplicada nesta rodada.
 */
export const PODA_AUTOMATICA_ATIVA = false;

export interface EstatisticaTombstones {
  /** Quantos itens a lista tem, tombstones inclusive. */
  total: number;
  /** Quantos estão marcados como removidos. */
  removidos: number;
  /** Bytes que os tombstones ocupam no JSON da lista. */
  bytes: number;
  /** O carimbo mais antigo entre eles, ou `null`. */
  maisAntigo: string | null;
}

/**
 * Mede o que a poda economizaria — e é só isso que se faz com o número por
 * enquanto. Serve para responder, com dado em vez de suposição, se o acúmulo
 * chega a ser um problema antes de o corte seguro existir.
 */
export function estatisticaTombstones(lista: object[]): EstatisticaTombstones {
  const mortos = (lista ?? []).filter((i) => removido(i));
  let maisAntigo: string | null = null;
  for (const i of mortos) {
    const q = campo(i, 'removidoEm');
    if (typeof q === 'string' && (maisAntigo === null || q < maisAntigo)) maisAntigo = q;
  }
  return {
    total: (lista ?? []).length,
    removidos: mortos.length,
    bytes: mortos.length === 0 ? 0 : JSON.stringify(mortos).length,
    maisAntigo,
  };
}

/**
 * A poda, quando houver corte seguro.
 *
 * `corte` é a versão confirmada a partir da qual nenhum aparelho pode mais
 * contradizer a exclusão. Enquanto `PODA_AUTOMATICA_ATIVA` for `false` ou o
 * corte não for informado, devolve a lista **inalterada** — fail-closed, como a
 * trava de produção do §12: a versão que não sabe se pode apagar, não apaga.
 */
export function podar<T extends object>(lista: T[], corte?: number): T[] {
  if (!PODA_AUTOMATICA_ATIVA || corte === undefined) return lista ?? [];
  return (lista ?? []).filter((i) => {
    if (!removido(i)) return true;
    const v = campo(i, 'removidoNaVersao');
    return !(typeof v === 'number' && v <= corte);
  });
}
