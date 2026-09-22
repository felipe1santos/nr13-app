import { aplicarAtomico, obter } from './db';
import { obterRegistro, orgAtual } from './cacheLocal';
import { colecaoDaChave, marcarRemovido, mesclarColecao, visiveis, type ResultadoMerge } from './colecoes';
import { ler, salvar, semearEquipamentoDetalhado } from './storage';

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
 * Merge de três vias precisa saber o que este aparelho **reconheceu do
 * servidor** antes de editar. Sem isso, "eu alterei" e "eu tenho a cópia velha"
 * são indistinguíveis.
 *
 * A base mora na store `meta` do IndexedDB, chave `base:<chave>`, com
 * `{ versao, valor }` — a versão monotônica DO SERVIDOR e o conteúdo daquela
 * versão. Nada de relógio: quem ordena é a versão.
 *
 * **Quando ela muda, e quando não muda:**
 *
 * | evento | base |
 * |---|---|
 * | hidratação/lookup traz a chave | **passa a ser** o que veio do servidor |
 * | edição local | **NÃO muda** — é o ponto inteiro |
 * | ACK de uma mutação | passa a ser o estado confirmado |
 * | conflito | **NÃO muda** até a resolução |
 *
 * A linha 2 é a crítica: se a base virasse o valor local depois da edição, o
 * sistema perderia a capacidade de detectar que os dois lados mexeram — que é
 * exatamente o caso que ainda precisa do usuário.
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

/** O que o aparelho reconheceu do servidor, por chave. */
export interface BaseColecao {
  /** A versão monotônica do servidor. `0` = a chave não existia lá. */
  versao: number;
  /** O conteúdo daquela versão, serializado como veio. */
  valor: string;
}

const chaveBase = (chave: string) => `base:${chave}`;

/** A base guardada desta chave, ou `null`. */
export async function baseDe(chave: string): Promise<BaseColecao | null> {
  const org = orgAtual();
  if (!org) return null;
  try {
    return await obter<BaseColecao>(org, 'meta', chaveBase(chave));
  } catch {
    return null;
  }
}

/**
 * Registra a base CONFIRMADA de uma chave.
 *
 * Só quem tem confirmação do servidor chama isto: a hidratação (que recebeu o
 * valor) e o ACK (que soube a versão aplicada). A edição local **nunca** chama.
 */
export async function registrarBase(chave: string, base: BaseColecao): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'meta', acao: 'put', chave: chaveBase(chave), valor: base }]);
}

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
  quando: string,
): Promise<boolean> {
  const def = colecaoDaChave(chave);
  if (!def) return false;
  return gravarNaColecao(chave, (atual) =>
    MERGE_AUTOMATICO_ATIVO
      ? atual.map((i) => (def.id(i) === itemId ? marcarRemovido(i, quando) : i))
      : atual.filter((i) => def.id(i) !== itemId),
  );
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
 * Ligar exige, nesta ordem: todos os leitores das coleções passando por
 * `lerColecaoVisivel`, e a base sendo registrada também no ACK da fila.
 */
export const MERGE_AUTOMATICO_ATIVO = false;
