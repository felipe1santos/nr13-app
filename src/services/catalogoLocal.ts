/**
 * Fase 9 · o CATÁLOGO offline de `/equipamentos`.
 *
 * A distinção que o dono fixou no desenho (§8.1), e que este arquivo respeita:
 *
 *   CATÁLOGO          = metadado leve de TODOS os equipamentos (~190 B cada,
 *                       medido). Serve para listar, pesquisar e saber que
 *                       existe. PODE ficar inteiro no aparelho.
 *   DADOS COMPLETOS   = as chaves `nr13_*` de uma TAG (~8,3 kB cada). Só o que
 *                       o usuário escolher. NÃO é assunto deste arquivo.
 *
 * "Conhecer e pesquisar milhares ≠ ter milhares completos no aparelho."
 *
 * COMO O CATÁLOGO SE ENCHE, e por que assim:
 *
 *   1. SOZINHO, sem pedir nada a mais: toda página que a tela busca é gravada
 *      aqui. Custo de rede: ZERO — é a resposta que já veio.
 *   2. POR PEDIDO EXPLÍCITO: `sincronizarTudo()` percorre o catálogo inteiro
 *      pelo mesmo keyset. É AÇÃO DO USUÁRIO, com contagem e progresso, nunca
 *      automática. Em 50.000 equipamentos são ~9,5 MB, e a cota de egresso do
 *      Supabase está sob aviso desde 08/2026 — baixar isso por conta própria,
 *      em toda a base instalada, seria repetir o problema que a Fase 9 combate.
 *
 * O QUE FICOU PARA DEPOIS, e é uma escolha declarada: sincronização incremental
 * por `source_updated_at`. Ela precisa de um parâmetro "mudou desde" na RPC e de
 * um quinto índice — logo, de mais um benchmark. Como a 9D já reescreve o
 * caminho de boot, ela nasce lá, com medição própria. Até então o catálogo é
 * atualizado pelas páginas que o usuário vê e pela sincronização explícita.
 */
import { abrirDb, aplicarAtomico, listarTudo, obter } from './db';
import { orgAtual } from './cacheLocal';
import type { FiltrosBusca, ItemCatalogo, PaginaCatalogo } from './buscaIndex';
import { TAMANHO_PAGINA } from './buscaIndex';

/**
 * A MESMA normalização de acento do banco.
 *
 * Se esta tabela divergir da do `busca_index_indices.sql`, o usuário digita uma
 * palavra que existe e não acha nada — online acha, offline não. `catalogo
 * Local.test.ts` compara caractere a caractere com a do SQL.
 */
const DE = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const PARA = 'aaaaaeeeeiiiiooooouuuucn';

export function normalizar(texto: string): string {
  let saida = '';
  for (const ch of (texto || '').toLowerCase()) {
    const i = DE.indexOf(ch);
    saida += i >= 0 ? PARA[i] : ch;
  }
  return saida;
}

/** Os mesmos campos que o `busca` do servidor concatena. */
function textoDe(item: ItemCatalogo): string {
  const serie = item.numeroSerie ?? '';
  return normalizar(
    [
      item.tag,
      item.descricao,
      item.fabricante,
      // `cliente_cidade` NÃO entra: o vetor `busca` do servidor também não a
      // inclui, e o catálogo local precisa achar exatamente o mesmo conjunto —
      // senão a busca offline devolveria itens que a online não devolve.
      item.clienteNome,
      item.localizacao,
      item.tipo,
      item.subtipo,
      item.ano,
      item.categoria,
      serie.replace(/[^A-Za-z0-9]/g, ''),
      serie.replace(/[^0-9]/g, ''),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Casa como o servidor casa: por PALAVRA, com prefixo no fim de cada token.
 *
 * NÃO é `includes` de substring. Se fosse, offline acharia coisa que online não
 * acha, e o usuário veria a lista mudar ao entrar e sair de rede — que é o tipo
 * de inconsistência que faz perder a confiança na busca.
 */
export function casaTermo(item: ItemCatalogo, termo: string): boolean {
  const t = normalizar(termo).trim();
  if (!t) return true;

  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length) {
    const palavras = textoDe(item).split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.every((tk) => palavras.some((p) => p.startsWith(tk)))) return true;
  }

  // Prefixo de TAG e de série — os dois caminhos que o servidor também tenta.
  const alvo = termo.trim().toUpperCase();
  if (alvo && item.tag.toUpperCase().startsWith(alvo)) return true;
  const serie = (item.numeroSerie ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const alvoSerie = termo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return !!alvoSerie && !!serie && serie.startsWith(alvoSerie);
}

const STORE = 'meta';
const PREFIXO = 'cat:';

function chaveDe(tag: string): string {
  return PREFIXO + tag;
}

/** Grava (ou atualiza) itens no catálogo do aparelho. Silencioso por design. */
export async function guardar(itens: ItemCatalogo[]): Promise<void> {
  const org = orgAtual();
  if (!org || !itens.length) return;
  try {
    await abrirDb(org);
    await aplicarAtomico(
      org,
      itens.map((item) => ({
        store: STORE,
        acao: 'put' as const,
        chave: chaveDe(item.tag),
        valor: item,
      })),
    );
  } catch {
    // Catálogo é CONVENIÊNCIA. Falhar aqui não pode custar a listagem que o
    // usuário já tem na tela — online ele continua vendo tudo.
  }
}

export async function remover(tag: string): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  try {
    await abrirDb(org);
    await aplicarAtomico(org, [{ store: STORE, acao: 'delete', chave: chaveDe(tag) }]);
  } catch {
    /* idem */
  }
}

export async function obterItem(tag: string): Promise<ItemCatalogo | null> {
  const org = orgAtual();
  if (!org) return null;
  try {
    await abrirDb(org);
    return await obter<ItemCatalogo>(org, STORE, chaveDe(tag));
  } catch {
    return null;
  }
}

async function todos(): Promise<ItemCatalogo[]> {
  const org = orgAtual();
  if (!org) return [];
  try {
    await abrirDb(org);
    const linhas = await listarTudo<ItemCatalogo>(org, STORE);
    return linhas
      .filter((l) => typeof l?.chave === 'string' && l.chave.startsWith(PREFIXO))
      .map((l) => l.valor)
      .filter((v): v is ItemCatalogo => !!v && typeof v.tag === 'string');
  } catch {
    return [];
  }
}

export async function quantosGuardados(): Promise<number> {
  return (await todos()).length;
}

/**
 * A MESMA consulta, sobre o que está no aparelho.
 *
 * Mesma ordenação do servidor (byte a byte, como a collation "C"), mesmo
 * keyset, mesma página de 50 — para a lista não mudar de comportamento quando a
 * rede cai.
 */
export async function paginaLocal(
  filtros: FiltrosBusca = {},
  cursor: string | null = null,
): Promise<PaginaCatalogo> {
  const itens = (await todos())
    .filter((i) => (!filtros.tipo || i.tipo === filtros.tipo))
    .filter((i) => (!filtros.categoria || i.categoria === filtros.categoria))
    .filter((i) => casaTermo(i, filtros.termo ?? ''))
    .filter((i) => cursor === null || i.tag > cursor)
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const pagina = itens.slice(0, TAMANHO_PAGINA);
  return {
    itens: pagina,
    proximoCursor: pagina.length ? pagina[pagina.length - 1].tag : null,
    temMais: itens.length > TAMANHO_PAGINA,
  };
}

export async function contarLocal(filtros: FiltrosBusca = {}): Promise<number> {
  const itens = await todos();
  return itens
    .filter((i) => (!filtros.tipo || i.tipo === filtros.tipo))
    .filter((i) => (!filtros.categoria || i.categoria === filtros.categoria))
    .filter((i) => casaTermo(i, filtros.termo ?? '')).length;
}

/**
 * Baixa o catálogo INTEIRO para uso offline. **Só por ação do usuário.**
 *
 * Percorre pelo mesmo keyset da tela, em páginas, gravando cada uma. Retomável
 * na prática: se parar no meio, o que já desceu fica.
 */
export async function sincronizarTudo(
  buscar: (filtros: FiltrosBusca, cursor: string | null) => Promise<PaginaCatalogo>,
  aoAndar?: (baixados: number) => void,
): Promise<number> {
  let cursor: string | null = null;
  let baixados = 0;
  // Teto de segurança: 1.000 páginas × 50 = 50.000. Um catálogo maior que isso
  // precisa de decisão de produto, não de um laço que roda para sempre.
  for (let pagina = 0; pagina < 1000; pagina++) {
    const p: PaginaCatalogo = await buscar({}, cursor);
    if (!p.itens.length) break;
    await guardar(p.itens);
    baixados += p.itens.length;
    aoAndar?.(baixados);
    if (!p.temMais || !p.proximoCursor) break;
    cursor = p.proximoCursor;
  }
  return baixados;
}
