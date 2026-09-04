import { ler, salvar } from '../../services/storage';

/**
 * Relatório FINALIZADO arquivado — tirado da lista, preservado no histórico.
 *
 * ## Por que não existe "excluir" para relatório finalizado
 *
 * Um relatório emitido é um ARQUIVO (§7-quater): PDF imutável no bucket, com
 * SHA-256 que prova que ele não foi trocado. Ele também alimenta o vencimento do
 * equipamento, aparece no Portal do Cliente e pode ter registro no Livro de
 * Segurança. Apagá-lo destruiria evidência técnica de um equipamento em
 * operação — e destruiria em silêncio, porque o cliente só perceberia quando
 * fosse procurar.
 *
 * O que o usuário quer quando pede para "excluir" um relatório da lista quase
 * nunca é destruir: é **parar de ver**. Então é isso que esta chave faz.
 *
 * ## O que arquivar NÃO faz
 *
 * Não apaga o PDF, não apaga o `pdfRef`, não toca no `sha256`, não altera um
 * byte do arquivo, não mexe no índice do equipamento, não mexe na projeção, não
 * altera vencimento, Portal nem Livro. **Só esconde da lista padrão de
 * `/relatorios`** — e a própria tela oferece o escopo "Arquivados" para
 * encontrá-lo de volta.
 *
 * ## Por que uma chave global de IDs
 *
 * A lista de `/relatorios` vem da PROJEÇÃO do servidor, que não conhece este
 * estado (seria coluna nova + SQL, e o editor do Supabase segue sem abrir). Uma
 * chave global e leve — mesmo desenho de `nr13_rascunhos` — é lida no boot e
 * permite à tela filtrar sem requisição nenhuma. Ela guarda IDs, não relatórios:
 * ~40 bytes por item.
 */
export const CHAVE_ARQUIVADOS = 'nr13_relatorios_arquivados';

export interface ItemArquivado {
  id: string;
  tag: string;
  /** ISO de quando saiu da lista. Serve para explicar, não para ordenar nada. */
  em: string;
}

function lerCru(): ItemArquivado[] {
  const lista = ler<ItemArquivado[]>(CHAVE_ARQUIVADOS);
  if (!Array.isArray(lista)) return [];
  return lista.filter((i) => i && typeof i.id === 'string');
}

export function listarArquivados(): ItemArquivado[] {
  return lerCru();
}

/** Só os ids — é o que a lista precisa para filtrar. */
export function idsArquivados(): Set<string> {
  return new Set(lerCru().map((i) => i.id));
}

export async function arquivarRelatorio(id: string, tag: string): Promise<void> {
  if (lerCru().some((i) => i.id === id)) return;
  await salvar(CHAVE_ARQUIVADOS, [...lerCru(), { id, tag, em: new Date().toISOString() }]);
}

export async function desarquivarRelatorio(id: string): Promise<void> {
  const resto = lerCru().filter((i) => i.id !== id);
  if (resto.length === lerCru().length) return; // nada a fazer: não escreve à toa
  await salvar(CHAVE_ARQUIVADOS, resto);
}

/** O recorte da lista. `'arquivados'` mostra SÓ os arquivados. */
export type ModoArquivo = 'ativos' | 'arquivados' | 'todos';

export function filtrarPorArquivo<T extends { relatorioId: string }>(
  itens: T[],
  arquivados: Set<string>,
  modo: ModoArquivo,
): T[] {
  if (modo === 'todos') return itens;
  if (modo === 'arquivados') return itens.filter((i) => arquivados.has(i.relatorioId));
  return itens.filter((i) => !arquivados.has(i.relatorioId));
}
