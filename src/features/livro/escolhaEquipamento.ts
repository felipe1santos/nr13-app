/**
 * De onde vem a lista do "Novo registro → Escolha o equipamento" (21/11/2026).
 *
 * ## O defeito
 *
 * Equipamento recém-criado não aparecia na escolha — nem nenhum outro que ainda
 * não tivesse registro. A causa: o seletor filtrava os `itens` da LISTA de
 * `/livro-registro`, e essa lista vem de `buscar_livros`, que por desenho só
 * devolve quem JÁ TEM livro (`livro_entradas is null or > 0`, ver
 * `supabase/busca_livro.sql`). Equipamento novo nasce com `livro_entradas = 0`
 * — e o primeiro registro, que o tiraria desse zero, era exatamente o que o
 * usuário tentava criar. Um círculo: só entrava na escolha quem não precisava
 * dela.
 *
 * ## A fonte certa
 *
 * Escolher onde lançar um registro é escolher QUALQUER equipamento da
 * organização, tenha ou não ficha preenchida, tenha ou não livro. Isso é o
 * catálogo de `/equipamentos`: `buscar_equipamentos` (a projeção, página de 50,
 * keyset), mais a rede de segurança do §6.5 — `equipamentosPendentesLocais`,
 * o que este aparelho gravou e o servidor ainda não confirmou — fundidos por
 * `fundirLocais`. Sem rede, o catálogo do aparelho (`catalogoLocal`).
 *
 * Nada aqui hidrata a organização (`lerTudo`) nem abre livro de ninguém.
 */
import * as buscaIndex from '../../services/buscaIndex';
import type { ItemCatalogo, PaginaCatalogo } from '../../services/buscaIndex';
import * as catalogoLocal from '../../services/catalogoLocal';
import { equipamentosPendentesLocais } from '../equipamento/equipamentoService';

export interface PaginaEscolha {
  itens: ItemCatalogo[];
  proximoCursor: string | null;
  temMais: boolean;
  /** A resposta veio do catálogo do aparelho, não do servidor. */
  offline: boolean;
}

/** As dependências, injetáveis — a suíte roda em `node`, sem Supabase. */
export interface FontesEscolha {
  listarPagina: (termo: string, cursor: string | null, sinal?: AbortSignal) => Promise<PaginaCatalogo>;
  paginaLocal: (termo: string, cursor: string | null) => Promise<PaginaCatalogo>;
  pendentes: () => ItemCatalogo[];
  casaTermo: (item: ItemCatalogo, termo: string) => boolean;
}

const FONTES_PADRAO: FontesEscolha = {
  listarPagina: (termo, cursor, sinal) => buscaIndex.listarPagina({ termo }, cursor, sinal),
  paginaLocal: (termo, cursor) => catalogoLocal.paginaLocal({ termo }, cursor),
  pendentes: equipamentosPendentesLocais,
  casaTermo: catalogoLocal.casaTermo,
};

/** Falha sem servidor e sem nada no aparelho. A tela mostra e oferece repetir. */
export class ErroEscolha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEscolha';
  }
}

/**
 * Uma página de equipamentos para escolher onde lançar o registro.
 *
 * `fundirLocais` recebe o `cursor`: um pendente de TAG alta só entra na página
 * em que a ordenação o coloca, e não em todas.
 */
export async function paginaParaRegistro(
  termo: string,
  cursor: string | null = null,
  sinal?: AbortSignal,
  fontes: FontesEscolha = FONTES_PADRAO,
): Promise<PaginaEscolha> {
  const t = termo.trim();
  const pendentes = (() => {
    try {
      return fontes.pendentes().filter((i) => fontes.casaTermo(i, t));
    } catch {
      return [];
    }
  })();

  try {
    const pagina = await fontes.listarPagina(t, cursor, sinal);
    return {
      itens: buscaIndex.fundirLocais(pagina.itens, pendentes, cursor),
      proximoCursor: pagina.proximoCursor,
      temMais: pagina.temMais,
      offline: false,
    };
  } catch (e) {
    if (sinal?.aborted) throw e;
    const local = await fontes.paginaLocal(t, cursor).catch(() => null);
    const itens = buscaIndex.fundirLocais(local?.itens ?? [], pendentes, cursor);
    if (itens.length === 0) {
      throw new ErroEscolha(
        e instanceof buscaIndex.ErroBusca
          ? 'Não foi possível carregar os equipamentos.'
          : 'Sem conexão, e este aparelho ainda não tem o catálogo de equipamentos.',
      );
    }
    return {
      itens,
      proximoCursor: local?.proximoCursor ?? null,
      temMais: local?.temMais ?? false,
      offline: true,
    };
  }
}
