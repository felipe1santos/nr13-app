/**
 * O ÍNDICE de documentos de prontuário — a lista canônica de `/prontuarios`.
 *
 * ## O problema que ele resolve
 *
 * A lista mostrava um EQUIPAMENTO por linha, com um selo "Prontuário OK". Um
 * equipamento com três revisões emitidas aparecia como uma linha só, e as duas
 * revisões anteriores — documentos assinados, com `pdfRef` e SHA-256 próprios —
 * não tinham onde ser vistas. A tela dizia "existe prontuário", quando a
 * pergunta do usuário é "quais documentos existem".
 *
 * ## Por que um índice, e não uma varredura
 *
 * As emissões moram em `nr13_pront_emitido_<TAG>`, chave POR EQUIPAMENTO.
 * Montar a lista da organização varrendo essas chaves só enxerga o que já foi
 * hidratado neste aparelho — e sob boot leve (9D) isso é uma fração do parque.
 * A lista ficaria incompleta em silêncio, que é o relato de "sumiu" com outro
 * nome.
 *
 * A projeção do servidor também não serve sozinha: ela tem `temProntuario`,
 * um BOOLEANO por equipamento. Ela sabe que existe; não sabe quantos, nem
 * quando, nem qual revisão.
 *
 * Então o índice é uma chave GLOBAL e leve — o mesmo desenho de
 * `nr13_rascunhos` (§10B.1) e do §7-sexies: registro pesado por TAG, índice
 * leve para listar. Ele sincroniza pela v2 como qualquer outra chave, então
 * aparelho novo recebe a lista inteira sem varrer nada, e cada entrada tem
 * ~200 bytes. Cresce com o número de DOCUMENTOS, não com o parque.
 *
 * ## O que ele NÃO é
 *
 * Não é a verdade sobre o documento. A verdade continua em
 * `nr13_pront_emitido_<TAG>` (o `pdfRef` e o SHA de cada emissão) e em
 * `nr13_prontuario_<TAG>` (os dados). O índice é DERIVADO: se ele se perder,
 * `reconciliar` o reconstrói a partir daquelas chaves. Perder o índice custa
 * uma lista mais pobre até a próxima abertura do equipamento; perder o
 * registro custaria o documento — e por isso o índice nunca é a única cópia.
 */
import { ler, listarChavesComPrefixo, salvar } from '../../services/storage';
import { listarEmissoes, type EmissaoProntuario } from './emissaoProntuario';
import type { ProntuarioDados } from './tipos';

export const CHAVE_INDICE_PRONT = 'nr13_pront_indice';

/** O prefixo das emissões — usado só na reconciliação. */
const PREFIXO_EMISSAO = 'nr13_pront_emitido_';
const PREFIXO_DADOS = 'nr13_prontuario_';

/**
 * As chaves IRMÃS que o prefixo `nr13_prontuario_` também casa.
 *
 * Elas não são o prontuário de nenhum equipamento, e cada uma virou uma linha
 * fantasma na lista antes de esta tabela existir:
 *
 * - `nr13_prontuario_atual` — a cópia de trabalho que os templates em iframe
 *   leem no `DOMContentLoaded`. Apareceu como um documento da TAG "atual";
 * - `nr13_prontuario_meta_<TAG>` — o número e a data do documento (§8).
 *   Apareceu como "meta_COMPRESSOR V8-15/200L", sem cliente e com data de 1970;
 * - `nr13_prontuario_assinantes_<TAG>` — quem assina.
 *
 * A tabela é EXPLÍCITA, e não uma regra esperta sobre o nome: é o mesmo motivo
 * de `familiasChave` existir no armazenamento — dedução por regex errou lá, e
 * erraria aqui na primeira TAG que começasse com uma dessas palavras.
 */
const IRMAS_DO_PREFIXO = ['atual'];
const IRMAS_COM_TAG = ['meta_', 'assinantes_'];

/** O sufixo do nome da chave é uma TAG de equipamento, ou uma chave irmã? */
export function ehChaveIrma(sufixo: string): boolean {
  return IRMAS_DO_PREFIXO.includes(sufixo) || IRMAS_COM_TAG.some((p) => sufixo.startsWith(p));
}

export type SituacaoDocumento = 'rascunho' | 'emitido';

/**
 * Uma linha da lista: um DOCUMENTO de prontuário.
 *
 * Um equipamento em edição tem uma entrada `rascunho`; cada emissão dele tem a
 * sua, com a revisão congelada. As duas coisas convivem: emitir a revisão 2 não
 * apaga a linha da revisão 1, e continuar editando depois de emitir cria de
 * novo a linha de rascunho — que é exatamente o estado real.
 */
export interface DocumentoProntuario {
  /** `PRONT-…-rN` da emissão, ou `rascunho:<TAG>` para o trabalho em aberto. */
  id: string;
  tag: string;
  /** Descrição do equipamento no momento em que a linha foi escrita. */
  equipamento: string | null;
  /** Cliente, quando o cadastro o tinha. Nunca é buscado só para o índice. */
  cliente: string | null;
  /**
   * Tipo do equipamento e categoria de risco — só nas entradas gravadas a
   * partir de 07/09/2026.
   *
   * Existem para o filtro da lista. São OPCIONAIS de propósito: as entradas
   * antigas não os têm, e o filtro só oferece o seletor quando há valor —
   * um seletor que filtra tudo para fora sem explicação é pior do que nenhum.
   */
  tipo?: string | null;
  categoria?: string | null;
  situacao: SituacaoDocumento;
  /** Número da revisão, base 1. `null` no rascunho: ele ainda não é revisão. */
  revisao: number | null;
  /** Número impresso no documento (`meta.numero`). */
  numero: string | null;
  /** ISO. Emissão: quando o PDF foi gerado. Rascunho: última gravação. */
  atualizadoEm: string;
  /**
   * Há arquivo arquivado para esta linha?
   *
   * BOOLEANO, e não o `pdfRef`, de propósito: a referência do arquivo é a
   * verdade do documento e mora em `nr13_pront_emitido_<TAG>`. Copiá-la para cá
   * criaria duas fontes para a mesma coisa, e a cópia envelheceria. Para ABRIR
   * o documento a tela resolve a emissão por id, na chave da TAG.
   */
  temArquivo: boolean;
  paginas: number | null;
  /** Upload ainda não confirmado — a lista precisa poder dizer isso. */
  pdfPendente: boolean;
}

function lerIndice(): DocumentoProntuario[] {
  const lista = ler<DocumentoProntuario[]>(CHAVE_INDICE_PRONT);
  if (!Array.isArray(lista)) return [];
  return lista.filter((d) => d && typeof d.id === 'string' && typeof d.tag === 'string');
}

/** Mais recentes primeiro — a mesma ordem da lista de relatórios. */
function ordenar(lista: DocumentoProntuario[]): DocumentoProntuario[] {
  return [...lista].sort((a, b) => (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? ''));
}

export function listarDocumentos(): DocumentoProntuario[] {
  return ordenar(lerIndice());
}

/** O id da linha de rascunho de um equipamento — um por TAG, por construção. */
export const idRascunho = (tag: string) => `rascunho:${tag}`;

/**
 * Grava (ou atualiza) uma entrada.
 *
 * Substitui pelo `id`: emitir duas vezes a mesma revisão não duplica a linha, e
 * salvar o rascunho dez vezes continua sendo uma linha só.
 */
export async function registrarDocumento(doc: DocumentoProntuario): Promise<void> {
  const atual = lerIndice().filter((d) => d.id !== doc.id);
  await salvar(CHAVE_INDICE_PRONT, ordenar([...atual, doc]));
}

/**
 * Tira a linha de RASCUNHO daquele equipamento.
 *
 * Chamada ao emitir: o trabalho em aberto virou documento, e manter as duas
 * linhas anunciaria um rascunho que não existe mais. As emissões não são
 * tocadas.
 */
export async function encerrarRascunho(tag: string): Promise<void> {
  const atual = lerIndice();
  const restante = atual.filter((d) => d.id !== idRascunho(tag));
  if (restante.length === atual.length) return;
  await salvar(CHAVE_INDICE_PRONT, restante);
}

/** Remove tudo daquele equipamento — usado quando o prontuário é excluído. */
export async function removerDoIndice(tag: string): Promise<void> {
  const atual = lerIndice();
  const restante = atual.filter((d) => d.tag !== tag);
  if (restante.length === atual.length) return;
  await salvar(CHAVE_INDICE_PRONT, restante);
}

/** A entrada de rascunho, montada a partir dos dados salvos. */
export function docDeRascunho(
  tag: string,
  dados: Partial<Pick<ProntuarioDados, 'descricao' | 'empresaRazaoSocial' | 'categoria'>> | null,
  numero: string | null,
  agora = new Date().toISOString(),
  tipo: string | null = null,
): DocumentoProntuario {
  return {
    id: idRascunho(tag),
    tag,
    equipamento: dados?.descricao?.trim() || null,
    cliente: dados?.empresaRazaoSocial?.trim() || null,
    tipo,
    categoria: dados?.categoria?.trim() || null,
    situacao: 'rascunho',
    revisao: null,
    numero,
    atualizadoEm: agora,
    temArquivo: false,
    paginas: null,
    pdfPendente: false,
  };
}

/** A entrada de uma emissão. `revisao` é a posição dela na lista da TAG. */
export function docDeEmissao(
  e: EmissaoProntuario,
  revisao: number,
  equipamento: string | null,
  cliente: string | null,
  tipo: string | null = null,
  categoria: string | null = null,
): DocumentoProntuario {
  return {
    id: e.id,
    tag: e.tag,
    equipamento,
    cliente,
    tipo,
    categoria,
    situacao: 'emitido',
    revisao,
    numero: e.numero,
    atualizadoEm: e.geradoEm,
    temArquivo: !!e.pdfRef,
    paginas: e.paginas ?? null,
    pdfPendente: !!e.pdfPendente,
  };
}

/**
 * RECONSTRÓI o índice a partir das chaves que já estão neste aparelho.
 *
 * Roda uma vez por sessão, ao abrir a lista. É idempotente e **só acrescenta**:
 * uma entrada que já existe no índice não é reescrita, porque o índice pode
 * conhecer documentos de OUTRO aparelho que esta máquina ainda não hidratou —
 * e reescrever a partir do que há aqui os apagaria.
 *
 * É o que faz o índice nascer preenchido para quem já usava o sistema antes
 * dele existir, sem migração de banco e sem varrer o servidor.
 *
 * Devolve quantas entradas foram acrescentadas.
 */
export async function reconciliar(): Promise<number> {
  const atual = lerIndice();
  const conhecidos = new Set(atual.map((d) => d.id));
  const novos: DocumentoProntuario[] = [];

  for (const chave of listarChavesComPrefixo(PREFIXO_EMISSAO)) {
    const tag = chave.slice(PREFIXO_EMISSAO.length);
    if (!tag) continue;
    const dados = ler<ProntuarioDados>(`${PREFIXO_DADOS}${tag}`);
    const equipamento = dados?.descricao?.trim() || null;
    const cliente = dados?.empresaRazaoSocial?.trim() || null;
    const emissoes = listarEmissoes(tag);
    emissoes.forEach((e, i) => {
      if (conhecidos.has(e.id)) return;
      novos.push(docDeEmissao(e, i + 1, equipamento, cliente, null, dados?.categoria?.trim() || null));
    });
  }

  /*
   * O rascunho é o caso ambíguo, e a regra aqui é conservadora.
   *
   * Ter `nr13_prontuario_<TAG>` significa que existem DADOS salvos — mas não
   * diz se eles já foram emitidos. Se houver emissão, os dados podem ser a
   * cópia do que foi emitido, e anunciar "rascunho" faria a lista mostrar um
   * trabalho em aberto que ninguém abriu. Então só vira rascunho o equipamento
   * com dados e SEM nenhuma emissão.
   */
  for (const chave of listarChavesComPrefixo(PREFIXO_DADOS)) {
    const tag = chave.slice(PREFIXO_DADOS.length);
    if (!tag || ehChaveIrma(tag) || conhecidos.has(idRascunho(tag))) continue;
    if (listarEmissoes(tag).length > 0) continue;
    const dados = ler<ProntuarioDados>(chave);
    /*
     * O PREFIXO PEGA MAIS DO QUE OS DADOS — medido em produção em 06/09/2026.
     *
     * `nr13_prontuario_` também casa com `nr13_prontuario_meta_<TAG>` (o número
     * e a data do documento, §8) e com `nr13_prontuario_assinantes_`. A
     * varredura criava linhas fantasma com TAG `meta_COMPRESSOR V8-15/200L`,
     * sem cliente e com data de 1970.
     *
     * O teste não é o nome da chave: é o CONTEÚDO. `ProntuarioDados` carrega a
     * própria TAG, e ela tem que bater com a do nome da chave. Um registro que
     * não sabe de quem é não vira linha na lista.
     */
    if (!dados || typeof dados !== "object") continue;
    if (typeof dados.tag !== "string" || dados.tag !== tag) continue;
    // Sem `criadoEm` a data fica VAZIA. `new Date(0)` imprimia 01/01/1970 na
    // coluna — um dado falso é pior do que um travessão.
    novos.push(docDeRascunho(tag, dados, null, dados.criadoEm || ""));
  }

  /*
   * PURGA das linhas fantasma que a varredura por prefixo criou antes da
   * correção acima. Elas já estão gravadas no índice de quem abriu a tela, e
   * `reconciliar` só acrescenta — então precisam sair por nome.
   *
   * O critério é ESTREITO de propósito: só entrada de RASCUNHO cuja TAG começa
   * por um sufixo de chave conhecido (`meta_`, `assinantes_`) e que não tem
   * registro de dados correspondente. Nenhuma dessas três condições vale para
   * um equipamento de verdade, e a regra de nunca apagar o que veio de outro
   * aparelho continua valendo para todo o resto.
   */
  const fantasma = (d: DocumentoProntuario) =>
    d.situacao === 'rascunho' &&
    ehChaveIrma(d.tag) &&
    ler<ProntuarioDados>(`${PREFIXO_DADOS}${d.tag}`)?.tag !== d.tag;

  const limpos = atual.filter((d) => !fantasma(d));
  const removidas = atual.length - limpos.length;

  if (novos.length === 0 && removidas === 0) return 0;
  await salvar(CHAVE_INDICE_PRONT, ordenar([...limpos, ...novos]));
  return novos.length;
}

/** Filtro de texto sobre o índice — TAG, equipamento, cliente e número. */
export function filtrarDocumentos(
  lista: DocumentoProntuario[],
  termo: string,
): DocumentoProntuario[] {
  const t = termo.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((d) =>
    [d.tag, d.equipamento, d.cliente, d.numero]
      .filter(Boolean)
      .some((c) => String(c).toLowerCase().includes(t)),
  );
}
