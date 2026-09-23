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
import { colecaoDaChave, mesclarColecao, type ResultadoMerge } from './colecoes';
import { flagsSync } from './flagsSync';

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
  if (!flagsSync().mergeAutomatico) return null;

  const def = colecaoDaChave(chave);
  if (!def) return null;

  const aqui = comoLista(local);
  const la = comoLista(servidor);
  if (!aqui || !la) return null;

  // A BASE é o que separa "eu alterei" de "eu tenho a cópia velha". Sem ela o
  // merge ainda roda — só devolve mais casos ao usuário, o que é o lado seguro
  // de errar.
  const base = comoLista((await baseDe(chave))?.valor);

  const merge = mesclarColecao<Registro>(aqui, la, def.id, base ?? undefined);
  if (merge.ambiguos.length > 0) return null;

  const valor = JSON.stringify(merge.lista);
  // Já é o que o servidor tem: enviar de novo custaria uma versão e uma
  // requisição para não mudar nada, e toda versão gasta é uma chance a mais de
  // conflito para os outros aparelhos.
  if (valor === JSON.stringify(la)) return null;

  return { valor, merge };
}
