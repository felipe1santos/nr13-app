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
