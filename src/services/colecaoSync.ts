import { obterRegistro } from './cacheLocal';
import { baseDe, registrarBase } from './baseColecao';
import { colecaoDaChave, excluirDaLista, mesclarColecao, visiveis, type ResultadoMerge } from './colecoes';
import { ler, salvar, semearEquipamentoDetalhado } from './storage';

export { baseDe, registrarBase, esquecerBase, deveGuardarBase } from './baseColecao';
export type { BaseColecao } from './baseColecao';

/** Um item de coleção como o merge o vê: objeto de campos livres. */
type Registro = Record<string, unknown>;

/**
 * A PORTA ÚNICA das coleções sincronizadas (22/09/2026).
 *
 * Fecha os quatro pré-requisitos que faltavam para o merge automático poder ser
 * ligado numa rodada seguinte. **O merge NÃO é ativado aqui** — ver
 * `MERGE_AUTOMATICO_ATIVO` no fim do arquivo.
 *
 * ## 1 · cache miss ≠ dado inexistente
 *
 * Era a causa raiz medida duas vezes: o cache não tem a chave, o código conclui
 * que ela não existe, cria do zero e a fila sai com `versaoBase: 0`. No
 * `nr13_pront_indice` isso produziu uma lista de 1 item contra 5 no servidor —
 * e a tela pediu ao usuário que escolhesse entre elas.
 *
 * `lerColecao` faz o lookup DIRIGIDO: só aquela chave, nunca a organização
 * inteira. `semearEquipamentoDetalhado` é o mesmo caminho que a ficha (§3-ter) e
 * a abertura de relatório já usam.
 *
 * ## 2 · a BASE
 *
 * Mora em `baseColecao.ts` (módulo separado só para `sync.ts` poder importá-la
 * sem ciclo). A tabela completa de quando ela avança está lá; o que importa
 * aqui é que existem DOIS escritores e só dois:
 *
 * - `lerColecao`, quando o lookup traz a chave do servidor;
 * - o ACK real da fila, em `sync.enviarItem`.
 *
 * ## 3 · tombstone respeitado na leitura
 *
 * `lerColecaoVisivel` é a porta de leitura: devolve a lista sem os itens
 * marcados. Nenhuma tela precisa conhecer `removidoEm`.
 *
 * ## 4 · fila
 *
 * A fila REAL continua mandando o blob (`set`/`del`) — mutação antiga e nova
 * convivem porque, na prática, **nada mudou no formato ainda**. O que este
 * módulo acrescenta é a base ao lado, que é o que uma operação por item exigiria
 * para ser resolvida. Ver "COMPATIBILIDADE" no fim.
 */

/**
 * Lê uma coleção, buscando no servidor quando o cache não a tem.
 *
 * Devolve também de onde veio, porque quem escreve precisa saber se está
 * criando de verdade ou continuando algo que já existe.
 */
export interface LeituraColecao<T extends object = Registro> {
  lista: T[];
  origem: 'cache' | 'servidor' | 'nova' | 'indisponivel';
}

export async function lerColecao<T extends object = Registro>(chave: string): Promise<LeituraColecao<T>> {
  // A PRESENÇA é decidida por `ler`, a API pública do storage — e não por
  // `obterRegistro`, que enxerga só o Map da v2. Usar as duas fontes fazia a
  // função perguntar a uma e responder com a outra: no caminho v1 (sem Map) ela
  // concluiria "ausente" para uma chave que o `ler` devolve inteira.
  const doCache = ler<T[]>(chave);
  if (Array.isArray(doCache)) return { lista: doCache, origem: 'cache' };

  // LOOKUP DIRIGIDO — só esta chave.
  let falhou: boolean;
  try {
    falhou = (await semearEquipamentoDetalhado([chave])).falhou;
  } catch {
    falhou = true;
  }

  const depois = ler<T[]>(chave);
  if (Array.isArray(depois)) {
    // Chegou do servidor: é base confirmada. A VERSÃO vem do registro do cache
    // quando ele existe (v2); no caminho v1 não há versão, e `0` aqui significa
    // "não sei", não "a chave não existia" — quem usa a base compara conteúdo.
    const reg = obterRegistro(chave);
    await registrarBase(chave, { versao: reg?.versao ?? 0, valor: JSON.stringify(depois) });
    return { lista: depois, origem: 'servidor' };
  }

  // Não achar por FALHA não é o mesmo que não existir. Criar uma chave aqui
  // seria repetir o defeito de origem — quem chama decide o que fazer.
  return { lista: [], origem: falhou ? 'indisponivel' : 'nova' };
}

/** A lista como as telas devem lê-la: sem os itens marcados como removidos. */
export async function lerColecaoVisivel<T extends object = Registro>(chave: string): Promise<T[]> {
  const { lista } = await lerColecao<T>(chave);
  return visiveis(lista);
}

/**
 * Grava a coleção pelo caminho seguro.
 *
 * O `mutar` recebe a lista que EXISTE (do cache ou do servidor) — nunca uma
 * lista vazia por engano. É isto que impede o `versaoBase: 0` falso.
 *
 * Devolve `false` quando a base não pôde ser confirmada (`indisponivel`). A
 * gravação acontece do mesmo jeito — ver o comentário no corpo.
 */
export async function gravarNaColecao<T extends object = Registro>(
  chave: string,
  mutar: (atual: T[]) => T[],
): Promise<boolean> {
  const { lista, origem } = await lerColecao<T>(chave);
  await salvar(chave, mutar(lista));
  // OFFLINE-FIRST: sem resposta do servidor a gravação acontece do mesmo jeito.
  //
  // A primeira versão desta função recusava gravar em `indisponivel`, para não
  // criar uma lista parcial. Estava errado: recusar faz o usuário PERDER a
  // ação — ele anexa um prontuário em campo, sem sinal, e a linha não aparece.
  // Trabalhar offline é o caso de uso do sistema, não a exceção.
  //
  // Gravar aqui pode, sim, produzir uma lista parcial e um conflito depois. A
  // diferença em relação ao defeito original é que agora isso é SABIDO e
  // resolvível: `false` diz que a base é desconhecida, e o merge por item une
  // as duas versões em vez de escolher uma. O que não se faz mais é CONCLUIR
  // que a chave não existe no servidor só porque o cache não a tem.
  return origem !== 'indisponivel';
}

/**
 * Exclui um item de uma coleção — marcando, não sumindo.
 *
 * Enquanto `MERGE_AUTOMATICO_ATIVO` estiver desligado, o comportamento é o de
 * sempre (o item sai da lista): adotar o tombstone antes de TODOS os leitores
 * usarem `visiveis()` faria itens excluídos reaparecerem nas telas. A ordem
 * está registrada em `docs/HARDENING-SINCRONIZACAO.md`.
 */
export async function removerDaColecao(
  chave: string,
  itemId: string,
  quando: string = new Date().toISOString(),
): Promise<boolean> {
  const def = colecaoDaChave(chave);
  if (!def) return false;
  // A decisão marcar-ou-tirar é UMA só, e mora em `colecoes.excluirDaLista`
  // (`TOMBSTONE_ATIVO`). Os escritores síncronos usam a mesma função; este é o
  // caminho assíncrono, que ainda passa pelo lookup dirigido antes de gravar.
  return gravarNaColecao(chave, (atual) => excluirDaLista(atual, itemId, def.id, quando));
}

/**
 * A resolução automática de um conflito de coleção — **pronta, e não ligada**.
 *
 * Devolve `null` quando não deve resolver sozinho: chave que não é coleção, ou
 * algum item que os dois lados alteraram (§10 — field merge é outra rodada).
 */
export async function resolverAutomaticamente(
  chave: string,
  localBruto: string | undefined,
  servidorBruto: string | undefined,
): Promise<{ lista: Registro[]; merge: ResultadoMerge } | null> {
  const def = colecaoDaChave(chave);
  if (!def) return null;

  const parse = (s: string | undefined): Registro[] | null => {
    if (!s) return null;
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? (v as Registro[]) : null;
    } catch {
      return null;
    }
  };

  const local = parse(localBruto);
  const servidor = parse(servidorBruto);
  if (!local || !servidor) return null;

  const base = parse((await baseDe(chave))?.valor);
  const merge = mesclarColecao(local, servidor, def.id, base ?? undefined);
  if (merge.ambiguos.length > 0) return null;
  return { lista: merge.lista, merge };
}

/**
 * O INTERRUPTOR. Desligado.
 *
 * Nada no produto chama a resolução automática enquanto isto for `false`: a
 * tela de conflito ("Neste aparelho" / "No servidor" / versões substituídas)
 * continua exatamente como está, e a exclusão continua removendo o item da
 * lista como sempre fez.
 *
 * Ordem de ativação, e ela não se inverte:
 *
 * 1. os leitores enxergando a visão filtrada — FEITO (22/09/2026);
 * 2. a base registrada no ACK real da fila — FEITO (22/09/2026);
 * 3. `colecoes.TOMBSTONE_ATIVO` ligado, para a exclusão passar a MARCAR;
 * 4. só então este interruptor.
 *
 * O 3 antes do 1 faria item excluído reaparecer na tela; o 4 antes do 3 é o que
 * ressuscita item excluído, porque o merge só sabe unir.
 */
export const MERGE_AUTOMATICO_ATIVO = false;
