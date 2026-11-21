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
  /** PMTA **calculada** pelo memorial (`nr13_calc_<TAG>.pmta`). */
  pmtaMpa: number | null;
  /** PTH **calculada** pelo memorial (`nr13_calc_<TAG>.pth`). */
  pthMpa: number | null;
  /**
   * PMTA **adotada** pelo engenheiro na ficha, seção "Pressões da Documentação"
   * (`nr13_info_<TAG>.pmtaAdotadaMpa`), em MPa.
   *
   * `null` = **não adotada**, e é o cartão de `/equipamentos` que precisa dessa
   * diferença: ele escreve "—" em vez de mostrar a calculada, porque o resumo
   * não pode afirmar uma adoção que o engenheiro não fez. Campo SEPARADO de
   * `pmtaMpa` de propósito — as outras listas (Inspeções, Prontuários,
   * Relatórios, Calibrações) continuam mostrando a calculada.
   *
   * Fora do cartão, a precedência oficial do sistema segue sendo
   * `adotada ?? calculada` (PLACA, PRONTUARIO, INSPECOES, PDF vetorial).
   */
  pmtaAdotadaMpa: number | null;
  /** PTH **adotada** na ficha (`nr13_info_<TAG>.pthAdotadaMpa`). Ver `pmtaAdotadaMpa`. */
  pthAdotadaMpa: number | null;
  resultado: string | null;
  volumeM3: number | null;
  fluido: string | null;
  classeFluido: string | null;
  vidaAnos: number | null;
  /** Tem `clienteId` — sem ele o equipamento não aparece no Portal. */
  temCliente: boolean;
  /**
   * Quantos containers de inspeção este equipamento tem — **`null` = não sei**.
   *
   * O número vem contado da projeção. A tela antiga o obtinha fazendo
   * `JSON.parse` de `nr13_docs_<TAG>` INTEIRO, duas vezes por cartão, dentro do
   * render: 11,4 KB por TAG na média medida em produção, 117 KB na cauda.
   *
   * `null` acontece em organização cuja projeção ainda não foi refeita, e NÃO
   * pode virar `0`: seria a tela afirmando "nenhuma inspeção" sem ter contado.
   */
  inspecoes: number | null;
  /**
   * Este equipamento tem prontuário salvo — **`null` = não sei** (9F.2.2).
   *
   * A tela antiga decidia isso chamando `carregarProntuario(tag)` dentro do
   * render, uma vez por cartão: `JSON.parse` do prontuário INTEIRO para escolher
   * entre duas palavras. Medido em produção em 29/08/2026: média de 6,6 KB por
   * TAG, máximo de 25,7 KB.
   *
   * `null` acontece em organização cuja projeção ainda não foi refeita, e NÃO
   * pode virar `false`: seria a tela afirmando "Sem Prontuário" sem ter olhado.
   */
  temProntuario: boolean | null;
  /**
   * Quantas calibrações esta TAG tem — **`null` = não sei** (9F.3.1).
   *
   * O número vem contado de `calibracoes_index`, a MESMA tabela que alimenta o
   * painel de vencimentos. A tela antiga o obtinha rodando
   * `listarCalibracoes(tag).length` dentro do `.map()` do render — um
   * `JSON.parse` da lista inteira por cartão, a cada quadro: média de 2,1 KB por
   * TAG medida em produção em 31/08/2026, 8,9 KB na maior.
   *
   * `null` acontece em organização cuja projeção ainda não foi refeita, e NÃO
   * pode virar `0`. Este é o `null` mais perigoso da fase: é o número que o
   * usuário lê para decidir que uma válvula não precisa calibrar.
   */
  calibracoes: number | null;
  /**
   * Quantas entradas o LIVRO DE REGISTRO desta TAG tem — **`null` = não sei**
   * (9F.4.1).
   *
   * É CATÁLOGO, e a distinção importa mais aqui do que em qualquer outra coluna
   * desta fase: o livro é registro técnico lacrado, e esta contagem NÃO é
   * autoridade sobre ele. Ela existe para a lista saber quem tem livro sem
   * baixar a organização inteira — a tela antiga descobria isso com `lerTudo()`,
   * medido em 780 KB para desenhar UMA linha na maior organização.
   *
   * O conteúdo das entradas, o lacre e a cadeia continuam vindo da verdade
   * (`nr13_livro_<TAG>`), lidos por TAG ao abrir o livro.
   *
   * `null` acontece em organização cuja projeção ainda não foi refeita, e NÃO
   * pode virar `0`: seria a lista afirmando "nenhum livro gerado" sobre um
   * parque que ninguém olhou.
   */
  livroEntradas: number | null;
  /**
   * A data da ÚLTIMA entrada do livro — `null` quando não há entrada com data
   * legível, o que é um fato e não uma omissão.
   *
   * Vem do `max` das datas, e não do último elemento do array: ocorrência manual
   * e retificação entram no fim da lista com data anterior.
   */
  livroUltima: string | null;
  unidade: string | null;
  /** Versão da verdade que originou esta linha. Serve à auditoria e ao merge. */
  sourceVersion: number;
  /**
   * Data de criação DERIVADA pelo servidor (`equipamentos_index.criado_em`,
   * ver `supabase/equipamentos_ordem_criacao.sql`), como o PostgREST a manda —
   * STRING, nunca `Date`: ela volta como cursor, e reconverter arriscaria a
   * emenda entre páginas.
   *
   * Opcional: só a consulta por criação a devolve. `undefined`/`null` = o
   * servidor não informou (consulta por TAG, servidor sem a migração, ou item
   * local ainda não sincronizado).
   */
  criadoEm?: string | null;
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

/**
 * O que o badge de inspeções escreve — ou `null`, quando não há o que escrever.
 *
 * Existe aqui, e não dentro da tela, pela mesma razão de `textoCliente`: a regra
 * de "não sei ≠ zero" precisa de UM lugar só, testável sem DOM. A suíte roda em
 * `environment: 'node'`, então regra que mora no JSX não tem teste.
 */
export function rotuloInspecoes(n: number | null): string | null {
  if (n === null) return null;
  return `${n} ${n === 1 ? 'Inspeção' : 'Inspeções'}`;
}

/**
 * O que o badge de prontuário escreve — ou `null`, quando não há o que escrever.
 *
 * Mesma razão de existir de `rotuloInspecoes`: a regra "não sei ≠ não tem"
 * precisa de UM lugar só, testável sem DOM.
 *
 *   `true`  → "Prontuário OK"   · o equipamento tem prontuário salvo
 *   `false` → "Sem Prontuário"  · olhei, e não há
 *   `null`  → nada              · ninguém olhou (projeção não refeita)
 */
export function rotuloProntuario(tem: boolean | null): string | null {
  if (tem === null) return null;
  return tem ? 'Prontuário OK' : 'Sem Prontuário';
}

/**
 * O que a linha de calibrações escreve — ou `null`, quando não há o que dizer.
 *
 * Mesma razão de existir de `rotuloInspecoes` e `rotuloProntuario`: a regra
 * "não sei ≠ zero" precisa de UM lugar só, testável sem DOM.
 *
 *   `3`    → "3 calibrações"      · contei
 *   `1`    → "1 calibração"       · singular
 *   `0`    → "Nenhuma calibração" · contei, e não há
 *   `null` → nada                 · ninguém contou (projeção não refeita)
 *
 * O `0` escreve por extenso, e não "0 calibrações", porque nesta tela ele é a
 * informação principal do cartão — quem abre `/calibracoes` está procurando
 * exatamente o equipamento que ainda não tem nenhuma.
 */
export function rotuloCalibracoes(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return 'Nenhuma calibração';
  return `${n} ${n === 1 ? 'calibração' : 'calibrações'}`;
}

export interface FiltrosBusca {
  termo?: string;
  tipo?: string;
  categoria?: string;
}

/**
 * Ordem do catálogo.
 *
 *   `tag`     · a de sempre (collation "C"). Inspeções, Livro, Calibrações,
 *               Prontuários e Relatórios continuam nela.
 *   `criacao` · mais NOVOS no topo (`/equipamentos`). Exige o SQL
 *               `equipamentos_ordem_criacao.sql`; sem ele, cai em `tag`.
 */
export type OrdemCatalogo = 'tag' | 'criacao';

export interface PaginaCatalogo {
  itens: ItemCatalogo[];
  /**
   * Passe de volta para pedir a próxima página. É OPACO para a tela: na ordem
   * por TAG é a `tag` do último item (como sempre foi); na ordem por criação é
   * um cursor composto (`criado_em` + `tag`) codificado por `cursorCriacao`.
   */
  proximoCursor: string | null;
  temMais: boolean;
  /**
   * A ordem que o servidor REALMENTE aplicou. Pode ser `tag` mesmo quando se
   * pediu `criacao` — servidor sem a migração. A tela usa este valor, e não o
   * que pediu, para posicionar os itens locais.
   */
  ordem?: OrdemCatalogo;
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
  /** 9F.1.2 — opcional de propósito: servidor sem a coluna manda `undefined`. */
  inspecoes?: number | null;
  /** 9F.2.2 — idem: banco sem a migração da 9F.2 manda `undefined`. */
  tem_prontuario?: boolean | null;
  /**
   * 9F.3.1 — idem: banco sem a migração da 9F.3 manda `undefined`.
   *
   * Aceita `string` porque o PostgREST decide sozinho se um inteiro viaja como
   * número ou como texto, e o mapeamento não pode depender dessa escolha.
   */
  calibracoes?: number | string | null;
  /**
   * 9F.4.1 — idem: banco sem a migração da 9F.4 manda `undefined`, e o
   * `undefined` precisa virar `null` (não sei), nunca `0`.
   */
  livro_entradas?: number | string | null;
  /** `date` do Postgres chega como `AAAA-MM-DD`. */
  livro_ultima?: string | null;
  /**
   * Pressões adotadas — opcionais porque banco sem esta migração simplesmente
   * não devolve as colunas, e `undefined` precisa virar `null` ("não adotada"),
   * que é exatamente o que o cartão já sabe desenhar como "—".
   */
  pmta_adotada_mpa?: number | string | null;
  pth_adotada_mpa?: number | string | null;
  /** Só `buscar_equipamentos_recentes` devolve. `timestamptz` em ISO. */
  criado_em?: string | null;
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
    // `num` já devolve `null` para ausente/vazio/ilegível — e aqui `null` é a
    // resposta CERTA: "o engenheiro não adotou". Nada de cair na calculada.
    pmtaAdotadaMpa: num(l.pmta_adotada_mpa),
    pthAdotadaMpa: num(l.pth_adotada_mpa),
    resultado: l.resultado,
    volumeM3: num(l.volume_m3),
    fluido: l.fluido,
    classeFluido: l.classe_fluido,
    vidaAnos: num(l.vida_anos),
    temCliente: l.tem_cliente === true,
    unidade: l.unidade,
    sourceVersion: l.source_version ?? 0,
    // AUSENTE E NULL VIRAM `null`, E ZERO CONTINUA ZERO. Um `?? 0` aqui seria a
    // tela afirmando "nenhuma inspeção" numa organização cuja projeção nem foi
    // refeita — o mesmo defeito do painel que inventava zero (prova offline da
    // 9D), e o oposto do que a 9E fez com `equipamento_ativo`.
    inspecoes: l.inspecoes === null || l.inspecoes === undefined ? null : Number(l.inspecoes),
    // MESMA REGRA, e pelo mesmo motivo: ausente e `null` viram `null`; `false`
    // continua `false`. Um `=== true` puro aqui transformaria "não sei" em
    // "não tem" — a tela afirmando ausência de prontuário numa organização cuja
    // projeção ainda não foi refeita.
    temProntuario:
      l.tem_prontuario === null || l.tem_prontuario === undefined ? null : l.tem_prontuario === true,
    // 9F.3.1 · MESMA regra das duas acima, e aqui ela é a que mais custa errar:
    // um `?? 0` faria a tela escrever "Nenhuma calibração" sobre um acessório
    // que ninguém contou — e é esse número que o usuário lê para decidir que
    // uma válvula não precisa calibrar.
    calibracoes: l.calibracoes === null || l.calibracoes === undefined ? null : Number(l.calibracoes),
    // 9F.4.1 · MESMA regra das três acima. Aqui o `?? 0` faria a lista do livro
    // dizer "nenhum livro de registro gerado ainda" para uma organização inteira
    // cuja projeção não foi refeita — e o livro é o documento que a fiscalização
    // pede. "Não sei" precisa continuar sendo "não sei" até alguém contar.
    livroEntradas:
      l.livro_entradas === null || l.livro_entradas === undefined
        ? null
        : Number(l.livro_entradas),
    livroUltima: l.livro_ultima ?? null,
    ...(l.criado_em !== undefined ? { criadoEm: l.criado_em } : {}),
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

/** Cursor composto da ordem por criação: a última linha da página anterior. */
interface CursorCriacao {
  o: 'criacao';
  /** `criado_em` EXATAMENTE como o servidor mandou (string). */
  c: string;
  t: string;
}

/** Codifica o cursor da ordem por criação. Exportado para teste. */
export function cursorCriacao(criadoEm: string, tag: string): string {
  const c: CursorCriacao = { o: 'criacao', c: criadoEm, t: tag };
  return JSON.stringify(c);
}

/**
 * Lê um cursor da ordem por criação — `null` quando é um cursor de TAG (ou
 * lixo). TAG nunca começa com `{`; mesmo que começasse, sem `o: 'criacao'` o
 * texto continua sendo tratado como TAG.
 */
export function lerCursorCriacao(cursor: string | null): CursorCriacao | null {
  if (!cursor || cursor[0] !== '{') return null;
  try {
    const c = JSON.parse(cursor) as Partial<CursorCriacao> | null;
    return c && c.o === 'criacao' && typeof c.c === 'string' && typeof c.t === 'string'
      ? { o: 'criacao', c: c.c, t: c.t }
      : null;
  } catch {
    return null;
  }
}

/**
 * O servidor ainda não tem `buscar_equipamentos_recentes` (o front pode ir ao
 * ar antes do SQL). Lembrado por SESSÃO: perguntar de novo a cada busca seria
 * uma requisição perdida por tecla. Só a recusa de ASSINATURA marca — erro de
 * rede não, senão uma queda momentânea prenderia a tela na ordem por TAG.
 */
let recentesAusente = false;

/** Só para teste: esquece que a função nova faltou. */
export function __reiniciarDeteccaoOrdem(): void {
  recentesAusente = false;
}

/**
 * A RPC não existe (ou não com estes argumentos) no servidor.
 *
 *   PGRST202 · PostgREST: "Could not find the function … in the schema cache"
 *   42883    · Postgres: undefined_function
 *
 * Exportado para teste.
 */
export function ehFuncaoAusente(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const e = erro as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202' || e.code === '42883') return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  return /could not find the function/i.test(msg) && /buscar_equipamentos_recentes/.test(msg);
}

function montarPagina(data: unknown, ordem: OrdemCatalogo): PaginaCatalogo {
  const linhas = (data ?? []) as LinhaRpc[];
  const temMais = linhas.length > TAMANHO_PAGINA;
  const itens = linhas.slice(0, TAMANHO_PAGINA).map(daLinha);
  const ultimo = itens.length ? itens[itens.length - 1] : null;
  let proximoCursor: string | null = null;
  if (ultimo) {
    proximoCursor =
      ordem === 'criacao' && ultimo.criadoEm ? cursorCriacao(ultimo.criadoEm, ultimo.tag) : ultimo.tag;
  }
  return { itens, proximoCursor, temMais, ordem };
}

async function paginaPorTag(
  filtros: FiltrosBusca,
  cursor: string | null,
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
  return montarPagina(data, 'tag');
}

/**
 * Uma página do catálogo, do servidor.
 *
 * Pede `TAMANHO_PAGINA + 1` para saber se há próxima SEM uma segunda consulta e
 * SEM contar a base inteira. O 51º é descartado; ele só responde "tem mais?".
 *
 * `ordem: 'criacao'` usa `buscar_equipamentos_recentes` (mais novos no topo).
 * Se o servidor ainda não a tiver, cai em `buscar_equipamentos` (ordem por TAG)
 * e devolve `ordem: 'tag'` — a tela continua funcionando, só na ordem antiga.
 * O CURSOR decide a continuação: cursor de TAG segue por TAG, mesmo que a tela
 * peça criação, porque misturar as duas ordens no meio da rolagem pularia itens.
 */
export async function listarPagina(
  filtros: FiltrosBusca = {},
  cursor: string | null = null,
  sinal?: AbortSignal,
  ordem: OrdemCatalogo = 'tag',
): Promise<PaginaCatalogo> {
  const cc = lerCursorCriacao(cursor);
  const porCriacao = cc !== null || (ordem === 'criacao' && cursor === null && !recentesAusente);
  if (!porCriacao) return paginaPorTag(filtros, cursor, sinal);

  const { data, error } = await supabase
    .rpc('buscar_equipamentos_recentes', {
      p_termo: filtros.termo?.trim() ?? '',
      p_tipo: filtros.tipo || null,
      p_categoria: filtros.categoria || null,
      p_cursor_criado: cc?.c ?? null,
      p_cursor_tag: cc?.t ?? null,
      p_limite: TAMANHO_PAGINA + 1,
    })
    .abortSignal(sinal as AbortSignal);

  if (error) {
    // Primeira página e o servidor não conhece a função: ordem por TAG. No meio
    // da rolagem não há para onde cair sem pular itens — vira erro comum.
    if (cc === null && ehFuncaoAusente(error)) {
      recentesAusente = true;
      return paginaPorTag(filtros, null, sinal);
    }
    throw new ErroBusca('Não foi possível consultar os equipamentos.', error);
  }
  return montarPagina(data, 'criacao');
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
 * ORDEM POR TAG (padrão): replica a do banco — `tag` sob collation "C", que é
 * comparação byte a byte. `localeCompare` NÃO serve aqui — ele ordenaria
 * diferente do servidor e a paginação passaria a pular itens na emenda entre
 * páginas.
 *
 * ORDEM POR CRIAÇÃO (`/equipamentos`): o item local que o servidor ainda não
 * devolveu é, por definição, o mais NOVO — vai para o TOPO, e só na PRIMEIRA
 * página (com cursor, ele já foi mostrado). Entre vários pendentes, o de
 * `criadoEm` mais recente primeiro; sem data (o normal para quem ainda não
 * sincronizou), na frente de todos, por TAG. O pendente que o servidor JÁ
 * devolveu (uma edição na fila) fica onde o servidor o pôs — editar não é
 * criar. Aqui NÃO se corta a página: cortar descartaria linhas do servidor
 * ANTES do cursor, e elas nunca mais apareceriam.
 */
export function fundirLocais(
  doServidor: ItemCatalogo[],
  locais: ItemCatalogo[],
  cursor: string | null = null,
  limite = TAMANHO_PAGINA,
  ordem: OrdemCatalogo = 'tag',
): ItemCatalogo[] {
  if (!locais.length) return doServidor;
  if (ordem === 'criacao') return fundirPorCriacao(doServidor, locais, cursor);

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

function porTagC(a: ItemCatalogo, b: ItemCatalogo): number {
  return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
}

function fundirPorCriacao(
  doServidor: ItemCatalogo[],
  locais: ItemCatalogo[],
  cursor: string | null,
): ItemCatalogo[] {
  const local = new Map<string, ItemCatalogo>();
  for (const item of locais) local.set(item.tag, { ...item, pendente: item.pendente ?? true });

  // Os que o servidor já devolveu: conteúdo local, POSIÇÃO e data do servidor.
  const noServidor = new Set<string>();
  const mesclados = doServidor.map((s) => {
    noServidor.add(s.tag);
    const l = local.get(s.tag);
    return l ? { ...l, criadoEm: l.criadoEm ?? s.criadoEm } : s;
  });
  if (cursor !== null) return mesclados;

  const tempo = (i: ItemCatalogo): number => {
    const t = i.criadoEm ? Date.parse(i.criadoEm) : NaN;
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; // sem data = mais novo
  };
  const novos = [...local.values()]
    .filter((i) => !noServidor.has(i.tag))
    .sort((a, b) => {
      const ta = tempo(a);
      const tb = tempo(b);
      if (ta !== tb) return ta > tb ? -1 : 1;
      return porTagC(a, b);
    });
  return novos.length ? [...novos, ...mesclados] : mesclados;
}
