/**
 * Fase 9 · leitura de `/equipamentos` pela PROJEÇÃO de busca.
 *
 * Só é usado com a flag `busca_v9` ligada. Com ela desligada a tela continua em
 * `listarEquipamentos()`, que hidrata a organização inteira — o caminho atual,
 * intacto.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, de propósito:
 *
 *   · não lê `app_storage` nem o `Map` do cache. A lista é METADADO, e metadado
 *     mora na projeção;
 *   · não cai em hidratação integral quando a consulta falha. O desenho (§16)
 *     proíbe: erro vira erro na tela, com repetir. Trocar uma falha de rede por
 *     "baixar 50.000 equipamentos" é o defeito, não o remédio;
 *   · não devolve a organização inteira. Página de 50, keyset, sempre.
 *
 * A ORGANIZAÇÃO NUNCA É PARÂMETRO. `buscar_equipamentos` a resolve no servidor
 * a partir do token. Não há como esta camada pedir a org errada.
 */
import { supabase } from './supabase';
import type { RefFoto } from './fotos';

/** Uma linha da projeção, como a tela a consome. */
export interface ItemCatalogo {
  tag: string;
  descricao: string | null;
  tipo: string | null;
  subtipo: string | null;
  categoria: string | null;
  fabricante: string | null;
  numeroSerie: string | null;
  localizacao: string | null;
  ano: string | null;
  /**
   * Nome do cliente, com a MESMA precedência do cartão antigo:
   * `razaoSocial || nomeFantasia`. Guardado separado da cidade de propósito —
   * ver `textoCliente()` logo abaixo.
   */
  clienteNome: string | null;
  /** Cidade do cliente. Só `cidade` — o cartão antigo não lê `localidade`. */
  clienteCidade: string | null;
  proximaInspecao: string | null;
  temFoto: boolean;
  /** REFERÊNCIA da capa no bucket (nunca a imagem). `FotoImg` resolve. */
  fotoRef: RefFoto | null;
  pmtaMpa: number | null;
  pthMpa: number | null;
  resultado: string | null;
  volumeM3: number | null;
  fluido: string | null;
  classeFluido: string | null;
  vidaAnos: number | null;
  /** Tem `clienteId` — sem ele o equipamento não aparece no Portal. */
  temCliente: boolean;
  unidade: string | null;
  /** Versão da verdade que originou esta linha. Serve à auditoria e ao merge. */
  sourceVersion: number;
  /**
   * Verdadeiro quando o item veio do que este aparelho gravou e ainda não
   * voltou do servidor. A tela mostra o selo de pendente — o item NUNCA some
   * (§6.5 do desenho).
   */
  pendente?: boolean;
}

/**
 * O texto do cliente exatamente como o cartão ANTIGO o monta.
 *
 * `CardEquipamento.tsx` faz
 *   [razaoSocial || nomeFantasia, cidade].filter(Boolean).join(' · ')
 * e esta função é o espelho disso do lado da V9. Existe uma só, e todas as
 * telas da V9 a usam, porque em 23/08/2026 a divergência que segurou o P9.2 foi
 * justamente cada lado compondo esse texto por conta própria.
 */
export function textoCliente(item: {
  clienteNome: string | null;
  clienteCidade: string | null;
}): string {
  return [item.clienteNome, item.clienteCidade].filter(Boolean).join(' · ');
}

export interface FiltrosBusca {
  termo?: string;
  tipo?: string;
  categoria?: string;
}

export interface PaginaCatalogo {
  itens: ItemCatalogo[];
  /** `tag` do último item; passe de volta para pedir a próxima página. */
  proximoCursor: string | null;
  temMais: boolean;
}

export interface Contagem {
  total: number;
  /** `false` significa "mais de `total`" — a contagem tem teto (ver o SQL). */
  exato: boolean;
}

/** Página de 50: o número medido no benchmark, e o mesmo do desenho §10. */
export const TAMANHO_PAGINA = 50;

/** Teto da contagem. Acima disso a tela escreve "mais de 1.000". */
export const TETO_CONTAGEM = 1000;

interface LinhaRpc {
  tag: string;
  descricao: string | null;
  tipo: string | null;
  subtipo: string | null;
  categoria: string | null;
  fabricante: string | null;
  numero_serie: string | null;
  localizacao: string | null;
  ano: string | null;
  cliente_nome: string | null;
  cliente_cidade: string | null;
  proxima_inspecao: string | null;
  tem_foto: boolean | null;
  foto_ref: RefFoto | null;
  pmta_mpa: number | string | null;
  pth_mpa: number | string | null;
  resultado: string | null;
  volume_m3: number | string | null;
  fluido: string | null;
  classe_fluido: string | null;
  vida_anos: number | string | null;
  tem_cliente: boolean | null;
  unidade: string | null;
  source_version: number | null;
}

/** `numeric` do Postgres chega como STRING no PostgREST — nunca como número. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function daLinha(l: LinhaRpc): ItemCatalogo {
  return {
    tag: l.tag,
    descricao: l.descricao,
    tipo: l.tipo,
    subtipo: l.subtipo,
    categoria: l.categoria,
    fabricante: l.fabricante,
    numeroSerie: l.numero_serie,
    localizacao: l.localizacao,
    ano: l.ano,
    clienteNome: l.cliente_nome,
    clienteCidade: l.cliente_cidade,
    proximaInspecao: l.proxima_inspecao,
    temFoto: l.tem_foto === true,
    fotoRef: l.foto_ref ?? null,
    pmtaMpa: num(l.pmta_mpa),
    pthMpa: num(l.pth_mpa),
    resultado: l.resultado,
    volumeM3: num(l.volume_m3),
    fluido: l.fluido,
    classeFluido: l.classe_fluido,
    vidaAnos: num(l.vida_anos),
    temCliente: l.tem_cliente === true,
    unidade: l.unidade,
    sourceVersion: l.source_version ?? 0,
  };
}

/** Falha de consulta da projeção. A tela mostra e oferece repetir. */
export class ErroBusca extends Error {
  causa?: unknown;
  constructor(message: string, causa?: unknown) {
    super(message);
    this.name = 'ErroBusca';
    this.causa = causa;
  }
}

/**
 * Uma página do catálogo, do servidor.
 *
 * Pede `TAMANHO_PAGINA + 1` para saber se há próxima SEM uma segunda consulta e
 * SEM contar a base inteira. O 51º é descartado; ele só responde "tem mais?".
 */
export async function listarPagina(
  filtros: FiltrosBusca = {},
  cursor: string | null = null,
  sinal?: AbortSignal,
): Promise<PaginaCatalogo> {
  const { data, error } = await supabase
    .rpc('buscar_equipamentos', {
      p_termo: filtros.termo?.trim() ?? '',
      p_tipo: filtros.tipo || null,
      p_categoria: filtros.categoria || null,
      p_cursor: cursor,
      p_limite: TAMANHO_PAGINA + 1,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBusca('Não foi possível consultar os equipamentos.', error);

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
 * Quantos resultados o filtro atual tem — com teto.
 *
 * Separada da listagem de propósito: a tela mostra a primeira página
 * imediatamente e o contador quando ele chegar. Amarrar os dois faria o usuário
 * esperar a contagem para ver a lista.
 */
export async function contar(filtros: FiltrosBusca = {}, sinal?: AbortSignal): Promise<Contagem> {
  const { data, error } = await supabase
    .rpc('contar_equipamentos', {
      p_termo: filtros.termo?.trim() ?? '',
      p_tipo: filtros.tipo || null,
      p_categoria: filtros.categoria || null,
      p_teto: TETO_CONTAGEM,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) throw new ErroBusca('Não foi possível contar os equipamentos.', error);
  const linha = (Array.isArray(data) ? data[0] : data) as { total?: number; exato?: boolean } | null;
  return { total: Number(linha?.total ?? 0), exato: linha?.exato !== false };
}

/**
 * Funde os itens locais sobre o resultado do servidor — §6.5 do desenho.
 *
 * O CASO QUE ISTO RESOLVE: o usuário salva `VASO-203` e a lista seguinte não
 * pode deixar de mostrá-lo. No caminho feliz nem é preciso, porque a projeção é
 * escrita na mesma transação da RPC; isto é a rede de segurança para o item que
 * ainda está na fila (offline, ou servidor lento).
 *
 * REGRA: local VENCE, e vai para a posição que a ordenação manda. Vencer é o
 * certo porque o local é o que o usuário acabou de digitar — se ele diverge do
 * servidor, é porque o servidor ainda não sabe.
 *
 * A ordenação replica a do banco: `tag` sob collation "C", que é comparação
 * byte a byte. `localeCompare` NÃO serve aqui — ele ordenaria diferente do
 * servidor e a paginação passaria a pular itens na emenda entre páginas.
 */
export function fundirLocais(
  doServidor: ItemCatalogo[],
  locais: ItemCatalogo[],
  cursor: string | null = null,
  limite = TAMANHO_PAGINA,
): ItemCatalogo[] {
  if (!locais.length) return doServidor;

  const porTag = new Map<string, ItemCatalogo>();
  for (const item of doServidor) porTag.set(item.tag, item);
  for (const item of locais) {
    // Só entram os que caem NESTA página: depois do cursor e, se a página do
    // servidor está cheia, antes do fim dela. Sem isso, um item local de TAG
    // alta apareceria em todas as páginas.
    if (cursor !== null && !(item.tag > cursor)) continue;
    porTag.set(item.tag, { ...item, pendente: item.pendente ?? true });
  }

  const ordenados = [...porTag.values()].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return ordenados.slice(0, limite);
}
