/**
 * Fase 9 · 9E — a busca de `/relatorios`, server-side.
 *
 * ## Por que esta tela precisava disto mais do que qualquer outra
 *
 * `/relatorios` tem HOJE **zero** campo de texto: quem procura um relatório de
 * dois anos atrás rola a lista. E o remédio óbvio — "filtra no cliente" — é o
 * pior possível aqui: cada `nr13_rel_<id>_<TAG>` pesa ~110 KB por causa dos
 * snapshots congelados do §7-bis (logo, empresa, rubricas, calibrações). Uma
 * organização com 100 relatórios baixaria ~11 MB para escrever uma linha na
 * tela.
 *
 * Então a busca acontece sobre a PROJEÇÃO (`relatorios_index`), que guarda
 * metadados leves, e a página volta com 50 linhas de texto.
 *
 * ## A regra que não se quebra: o PDF não é tocado aqui
 *
 * Estas funções trafegam `pdfRef` — uma REFERÊNCIA de texto para o Storage — e
 * nunca o arquivo (invariante I10). É o que faz buscar em 10.000 relatórios
 * custar o mesmo que buscar em 10. O PDF é resolvido no clique, por
 * `artefatoRelatorio`, e o `sha256` viaja junto para a conferência continuar
 * possível sem baixar nada.
 *
 * ## Ordenação e keyset
 *
 * `ordem_emissao desc, relatorio_id desc` — as duas descendo juntas, para o
 * keyset ser uma comparação de tupla (ver o SQL). O desempate por id é
 * obrigatório: sem ele, dois relatórios emitidos no mesmo dia embaralham entre
 * páginas, e o usuário vê um duas vezes enquanto outro some (I5).
 */
import { supabase } from './supabase';

/** Data usada para ordenar relatório sem `emissao`. Espelha o SQL. */
export const DATA_MINIMA = '0001-01-01';

/** Página de 50, o mesmo número medido na 9C. */
export const TAMANHO_PAGINA_REL = 50;

/** Acima disto a tela escreve "mais de 1.000". */
export const TETO_CONTAGEM_REL = 1000;

export interface ItemRelatorio {
  relatorioId: string;
  tag: string;
  codigo: string | null;
  nome: string | null;
  tipo: string | null;
  status: string | null;
  profissional: string | null;
  emissao: string | null;
  validade: string | null;
  execucaoInspecao: string | null;
  proximaInterna: string | null;
  proximaExterna: string | null;
  /** REFERÊNCIA no Storage. Nunca o arquivo — ver o cabeçalho. */
  pdfRef: string | null;
  sha256: string | null;
  paginas: number | null;
  sourceVersion: number;
}

export interface FiltrosRelatorios {
  termo?: string;
  tipo?: string;
  /** Início do período, `AAAA-MM-DD`. */
  de?: string;
  /** Fim do período, `AAAA-MM-DD`. */
  ate?: string;
}

/** Cursor COMPOSTO: sem o id, empate de data embaralha as páginas. */
export interface CursorRelatorios {
  data: string;
  id: string;
}

export interface PaginaRelatorios {
  itens: ItemRelatorio[];
  proximoCursor: CursorRelatorios | null;
  temMais: boolean;
}

export interface ContagemRelatorios {
  total: number;
  /** `false` significa "mais de `total`" — a contagem tem teto. */
  exato: boolean;
}

export class ErroBuscaRelatorios extends Error {
  readonly causa: unknown;
  constructor(mensagem: string, causa?: unknown) {
    super(mensagem);
    this.name = 'ErroBuscaRelatorios';
    this.causa = causa;
  }
}

interface LinhaRpc {
  relatorio_id: string;
  tag: string;
  codigo: string | null;
  nome: string | null;
  tipo: string | null;
  status: string | null;
  profissional: string | null;
  emissao: string | null;
  validade: string | null;
  execucao_inspecao: string | null;
  proxima_inspecao_interna: string | null;
  proxima_inspecao_externa: string | null;
  pdf_ref: string | null;
  sha256: string | null;
  paginas: number | null;
  source_version: number | null;
}

function daLinha(l: LinhaRpc): ItemRelatorio {
  return {
    relatorioId: l.relatorio_id,
    tag: l.tag,
    codigo: l.codigo,
    nome: l.nome,
    tipo: l.tipo,
    status: l.status,
    profissional: l.profissional,
    emissao: l.emissao,
    validade: l.validade,
    execucaoInspecao: l.execucao_inspecao,
    proximaInterna: l.proxima_inspecao_interna,
    proximaExterna: l.proxima_inspecao_externa,
    pdfRef: l.pdf_ref,
    sha256: l.sha256,
    paginas: l.paginas,
    sourceVersion: Number(l.source_version ?? 0),
  };
}

/** Filtro em branco vira `null`: `tipo = ''` não casaria com nada no banco. */
function ouNulo(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** A chave de ordenação de um item — a mesma do `ordem_emissao` do SQL. */
function chaveOrdem(r: ItemRelatorio): string {
  return r.emissao ?? DATA_MINIMA;
}

export async function listarPaginaRelatorios(
  filtros: FiltrosRelatorios = {},
  cursor: CursorRelatorios | null = null,
  sinal?: AbortSignal,
): Promise<PaginaRelatorios> {
  const { data, error } = await supabase
    .rpc('buscar_relatorios', {
      p_termo: filtros.termo?.trim() ?? '',
      p_tipo: ouNulo(filtros.tipo),
      p_de: ouNulo(filtros.de),
      p_ate: ouNulo(filtros.ate),
      p_cursor_data: cursor?.data ?? null,
      p_cursor_id: cursor?.id ?? null,
      // Uma linha a mais do que a página: é assim que se sabe que há próxima
      // sem pagar uma contagem.
      p_limite: TAMANHO_PAGINA_REL + 1,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBuscaRelatorios('Não foi possível consultar os relatórios.', error);

  const linhas = (data ?? []) as LinhaRpc[];
  const temMais = linhas.length > TAMANHO_PAGINA_REL;
  const itens = linhas.slice(0, TAMANHO_PAGINA_REL).map(daLinha);
  const ultimo = itens.length ? itens[itens.length - 1] : null;

  return {
    itens,
    proximoCursor: ultimo ? { data: chaveOrdem(ultimo), id: ultimo.relatorioId } : null,
    temMais,
  };
}

/**
 * Quantos resultados o filtro atual tem — com teto.
 *
 * Separada da listagem de propósito: a tela mostra a primeira página
 * imediatamente e o contador quando ele chegar. Amarrar os dois faria o usuário
 * esperar a contagem para ver a lista.
 */
export async function contarRelatorios(
  filtros: FiltrosRelatorios = {},
  sinal?: AbortSignal,
): Promise<ContagemRelatorios> {
  const { data, error } = await supabase
    .rpc('contar_relatorios', {
      p_termo: filtros.termo?.trim() ?? '',
      p_tipo: ouNulo(filtros.tipo),
      p_de: ouNulo(filtros.de),
      p_ate: ouNulo(filtros.ate),
      p_teto: TETO_CONTAGEM_REL,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBuscaRelatorios('Não foi possível contar os relatórios.', error);

  const linha = (Array.isArray(data) ? data[0] : data) as
    | { total?: number; exato?: boolean }
    | null
    | undefined;
  return { total: Number(linha?.total ?? 0), exato: linha?.exato !== false };
}

/**
 * Funde os relatórios locais sobre o resultado do servidor (§6.4).
 *
 * O CASO QUE ISTO RESOLVE: o usuário acabou de salvar um relatório e a lista
 * seguinte não pode deixar de mostrá-lo. No caminho feliz nem é preciso — a
 * projeção é escrita na mesma transação da RPC; isto é a rede de segurança para
 * o que ainda está na fila (offline, ou servidor lento).
 *
 * REGRA: local VENCE, e vai para a posição que a ordenação manda. Vencer é o
 * certo porque o local é o que o usuário acabou de gravar; se diverge do
 * servidor, é porque o servidor ainda não sabe.
 *
 * A ordenação replica a do banco: data decrescente e, no empate, `relatorio_id`
 * decrescente sob collation "C" — comparação byte a byte. `localeCompare` NÃO
 * serve: ordenaria diferente do servidor e a emenda entre páginas passaria a
 * pular itens.
 */
export function fundirRelatoriosLocais(
  doServidor: ItemRelatorio[],
  locais: ItemRelatorio[],
): ItemRelatorio[] {
  if (locais.length === 0) return doServidor;

  const porId = new Map<string, ItemRelatorio>();
  for (const r of doServidor) porId.set(r.relatorioId, r);
  for (const r of locais) porId.set(r.relatorioId, r); // local vence

  return [...porId.values()].sort((a, b) => {
    const da = chaveOrdem(a);
    const db = chaveOrdem(b);
    if (da !== db) return da < db ? 1 : -1; // data desc
    // Byte a byte, como a collation "C" do banco.
    return a.relatorioId < b.relatorioId ? 1 : a.relatorioId > b.relatorioId ? -1 : 0;
  });
}
