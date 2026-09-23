/**
 * O MERGE DE CONFLITO, NO CAMINHO DA FILA REAL (22/09/2026).
 *
 * Módulo leve de propósito: só `colecoes` (funções puras) e `baseColecao`
 * (IndexedDB `meta`). `sync.ts` importa daqui e não de `colecaoSync.ts`, que
 * passa por `./storage` e fecharia o ciclo `sync → storage → storageV2 → sync`.
 *
 * ## O que ele decide, e o que se recusa a decidir
 *
 * Recebe as DUAS versões brutas de uma chave em conflito e devolve o blob
 * mesclado — ou `null`, que significa "não sei, chame o usuário". Devolve
 * `null` em cinco situações, e nenhuma delas é um erro:
 *
 * 1. o interruptor está desligado (o caso de hoje, em produção);
 * 2. a chave não é uma coleção do catálogo — blob de documento não se mescla;
 * 3. um dos lados não é um array JSON válido;
 * 4. algum item foi alterado nos DOIS lados (`ambiguos`);
 * 5. o merge não mudaria nada — não vale gastar uma mutação para reescrever o
 *    que o servidor já tem.
 *
 * O caso 4 é o limite declarado desta entrega: divergência no mesmo item
 * continua sendo decisão humana, na tela de /pendencias. Inventar um vencedor
 * ali descartaria em silêncio o que o outro aparelho gravou — exatamente o
 * defeito que este trabalho inteiro está consertando.
 *
 * ## Por que a fila continua mandando o blob
 *
 * O merge acontece AQUI, no cliente, sobre a versão que o servidor devolveu no
 * conflito. O resultado sobe como uma mutação `set` normal, com
 * `versaoBase = versão do servidor` — a RPC não precisa saber de nada, e
 * nenhuma migration é necessária. A fila por item (`filaItem.ts`) reduziria o
 * TRÁFEGO desse envio; não é ela que torna o merge correto.
 */
import { baseDe } from './baseColecao';
import { colecaoDaChave, marcarRemovido, mesclarColecao, removido, type ResultadoMerge } from './colecoes';
import { configPermiteColecao, flagsSync } from './flagsSync';

/** Um item de coleção como o merge o vê. */
type Registro = Record<string, unknown>;

export interface MergeDeConflito {
  /** O blob a enviar, já serializado — é o que a fila sabe transportar. */
  valor: string;
  merge: ResultadoMerge<Registro>;
}

function comoLista(bruto: string | null | undefined): Registro[] | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? (v as Registro[]) : null;
  } catch {
    return null;
  }
}

/**
 * Uma exclusão CLÁSSICA (o item tirado da lista, sem `removidoEm`) vira marca
 * antes do merge.
 *
 * Achado ao projetar o rollback (23/09/2026): a organização estava com o
 * tombstone desligado, o aparelho excluiu offline do jeito antigo, o
 * administrador ligou tombstone+merge, e o aparelho reconectou. Para
 * `mesclarColecao` o item que falta aqui é "só no servidor" — e fica. A
 * exclusão do usuário seria desfeita em silêncio.
 *
 * A BASE é a prova: ela é a última lista que este aparelho confirmou com o
 * servidor. Um id que está nela e não está na lista local saiu AQUI. Voltar
 * com ele marcado é exatamente o que o protocolo 2 teria gravado. Se o
 * servidor também já não o tem, o item marcado entra como tombstone de um item
 * ausente — invisível e inofensivo. Sem base não há prova, e nada é inventado.
 */
function comExclusoesClassicasMarcadas(
  aqui: Registro[],
  base: Registro[] | null,
  idDe: (i: object) => string | null,
): Registro[] {
  if (!base) return aqui;
  const presentes = new Set(aqui.map((i) => idDe(i)).filter((x): x is string => x !== null));
  const quando = new Date().toISOString();
  const saidas = base.filter((i) => {
    const id = idDe(i);
    return id !== null && !presentes.has(id) && !removido(i);
  });
  return saidas.length ? [...aqui, ...saidas.map((i) => marcarRemovido(i, quando))] : aqui;
}

/**
 * Tenta resolver sozinho um conflito de coleção.
 *
 * `local` é o que ESTE aparelho quer gravar (o valor da mutação em conflito, ou
 * o registro do cache); `servidor` é o valor vigente que a RPC devolveu.
 */
export async function mergeDeConflito(
  chave: string,
  local: string | null | undefined,
  servidor: string | null | undefined,
): Promise<MergeDeConflito | null> {
  // Mesclar sozinho exige que o SERVIDOR tenha dito, nesta conexão, que o
  // merge está ligado. Um recibo em disco não basta: se o administrador
  // desligou enquanto o aparelho estava offline, é aqui que a decisão dele
  // precisa valer (ver a análise de rollback em docs/HARDENING-SINCRONIZACAO.md).
  if (!flagsSync().mergeAutomatico || !configPermiteColecao()) return null;

  const def = colecaoDaChave(chave);
  if (!def) return null;

  const aqui = comoLista(local);
  const la = comoLista(servidor);
  if (!aqui || !la) return null;

  // A BASE é o que separa "eu alterei" de "eu tenho a cópia velha". Sem ela o
  // merge ainda roda — só devolve mais casos ao usuário, o que é o lado seguro
  // de errar.
  const base = comoLista((await baseDe(chave))?.valor);

  const merge = mesclarColecao<Registro>(
    comExclusoesClassicasMarcadas(aqui, base, def.id),
    la,
    def.id,
    base ?? undefined,
  );
  if (merge.ambiguos.length > 0) return null;

  const valor = JSON.stringify(merge.lista);
  // Já é o que o servidor tem: enviar de novo custaria uma versão e uma
  // requisição para não mudar nada, e toda versão gasta é uma chance a mais de
  // conflito para os outros aparelhos.
  if (valor === JSON.stringify(la)) return null;

  return { valor, merge };
}
