/**
 * Fase 9 · 9F.4.3 — a consulta de `/livro-registro`, pelo servidor.
 *
 * Espelha `services/buscaIndex` em forma e contrato, mas contra
 * `buscar_livros` / `contar_livros`: a RPC dedicada que filtra "tem livro" ONDE
 * estão os dados. Filtrar isso no cliente devolveria 50 equipamentos para
 * desenhar 2 — ver a justificativa medida em `supabase/busca_livro.sql`.
 *
 * As colunas são só as que a LISTA desenha. O livro em si não passa por aqui:
 * ele é lido da verdade, por TAG, em `catalogoLivro.abrirEquipamentoParaLivro`.
 */
import { supabase } from '../../services/supabase';

/** Página pedida ao servidor. O `+1` detecta "tem mais" sem uma segunda ida. */
const TAMANHO_PAGINA = 50;

export interface ItemLivro {
  tag: string;
  descricao: string | null;
  tipo: string | null;
  categoria: string | null;
  /** **`null` = ninguém contou.** Nunca tratar como `0` — ver `catalogoLivro`. */
  livroEntradas: number | null;
  /** `AAAA-MM-DD`, ou `null` quando não há entrada com data legível. */
  livroUltima: string | null;
}

export interface PaginaLivros {
  itens: ItemLivro[];
  proximoCursor: string | null;
  temMais: boolean;
}

export interface ContagemLivros {
  total: number;
  /** `false` = "mais de N" — a contagem tem teto de propósito. */
  exato: boolean;
}

export class ErroBuscaLivro extends Error {
  // Campo declarado e atribuído no corpo, e não como parâmetro do construtor:
  // o projeto compila com `erasableSyntaxOnly`, que proíbe a forma abreviada
  // (ela gera código, e não só tipo).
  readonly causa?: unknown;

  constructor(mensagem: string, causa?: unknown) {
    super(mensagem);
    this.name = 'ErroBuscaLivro';
    this.causa = causa;
  }
}

interface LinhaRpc {
  tag: string;
  descricao?: string | null;
  tipo?: string | null;
  categoria?: string | null;
  /** O PostgREST decide sozinho se um inteiro viaja como número ou texto. */
  livro_entradas?: number | string | null;
  livro_ultima?: string | null;
}

function daLinha(l: LinhaRpc): ItemLivro {
  return {
    tag: l.tag,
    descricao: l.descricao ?? null,
    tipo: l.tipo ?? null,
    categoria: l.categoria ?? null,
    // `undefined` (banco sem a migração) e `null` viram `null` — "não sei".
    // Um `?? 0` aqui faria a lista afirmar "Sem registro" sobre livros que
    // existem, numa organização inteira que ninguém reprojetou.
    livroEntradas:
      l.livro_entradas === null || l.livro_entradas === undefined
        ? null
        : Number(l.livro_entradas),
    livroUltima: l.livro_ultima ?? null,
  };
}

export async function listarPagina(
  termo = '',
  cursor: string | null = null,
  sinal?: AbortSignal,
): Promise<PaginaLivros> {
  const { data, error } = await supabase
    .rpc('buscar_livros', {
      p_termo: termo.trim(),
      p_cursor: cursor,
      p_limite: TAMANHO_PAGINA + 1,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBuscaLivro('Não foi possível consultar os livros.', error);

  const linhas = (data ?? []) as LinhaRpc[];
  const temMais = linhas.length > TAMANHO_PAGINA;
  const itens = linhas.slice(0, TAMANHO_PAGINA).map(daLinha);
  return {
    itens,
    proximoCursor: itens.length ? itens[itens.length - 1].tag : null,
    temMais,
  };
}

/**
 * Quantos livros o filtro atual tem — com teto.
 *
 * Separada da listagem de propósito: a tela mostra a primeira página
 * imediatamente e o contador quando ele chegar.
 */
export async function contar(termo = '', sinal?: AbortSignal): Promise<ContagemLivros> {
  const { data, error } = await supabase
    .rpc('contar_livros', { p_termo: termo.trim() })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBuscaLivro('Não foi possível contar os livros.', error);

  const linha = (Array.isArray(data) ? data[0] : data) as
    | { total?: number | string; exato?: boolean }
    | undefined;
  return {
    total: Number(linha?.total ?? 0),
    exato: linha?.exato !== false,
  };
}
