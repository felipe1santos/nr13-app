import { ler, lerTudo, listarChavesComPrefixo, salvar, semearEquipamento } from '../../services/storage';
import * as buscaIndex from '../../services/buscaIndex';
import type { FiltrosBusca, ItemCatalogo, PaginaCatalogo } from '../../services/buscaIndex';
import { POR_TAG } from '../../services/familiasChave';
import { listarPendentes } from '../../services/sync';
import { chaveIndice, chaveRelatorio } from '../relatorios/historicoRelatorios';
import { podeCriarEquipamentoAgora } from '../../services/limiteTrial';
import type {
  CalculoSalvo,
  CategoriaSalva,
  EquipamentoResumo,
  FotoEquipamento,
  InfoEquipamento,
  TipoEquipamento,
} from './tipos';

const PREFIXO_INFO = 'nr13_info_';

export async function listarEquipamentos(): Promise<EquipamentoResumo[]> {
  await lerTudo();
  const chaves = listarChavesComPrefixo(PREFIXO_INFO);

  return chaves
    .map((chave) => chave.slice(PREFIXO_INFO.length))
    .map((tag) => montarResumo(tag))
    .filter((r): r is EquipamentoResumo => r !== null);
}

function montarResumo(tag: string): EquipamentoResumo | null {
  const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
  if (!info) return null;

  const categoria = ler<CategoriaSalva>(`nr13_cat_${tag}`);
  const calculo = ler<CalculoSalvo>(`nr13_calc_${tag}`);
  const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
  const unidade = ler<string>(`nr13_pref_unidade_${tag}`) || 'SI';

  const capa = fotos.find((f) => f.isCapa) || fotos[0] || null;

  return {
    tag,
    info,
    categoria,
    calculo,
    fotoCapa: capa ? { ref: capa.ref, base64: capa.src } : null,
    unidade: unidade as EquipamentoResumo['unidade'],
  };
}

export async function tagJaExiste(tag: string): Promise<boolean> {
  await lerTudo();
  return ler<InfoEquipamento>(`nr13_info_${tag}`) !== null;
}

export function carregarInfo(tag: string): InfoEquipamento | null {
  return ler<InfoEquipamento>(`nr13_info_${tag}`);
}

export async function salvarInfo(info: InfoEquipamento): Promise<void> {
  await salvar(`nr13_info_${info.tag}`, info);
}

export function carregarUnidade(tag: string): import('../../calc/unidades').SistemaUnidade {
  return (ler<string>(`nr13_pref_unidade_${tag}`) as import('../../calc/unidades').SistemaUnidade) || 'SI';
}

export async function salvarUnidade(tag: string, unidade: string): Promise<void> {
  await salvar(`nr13_pref_unidade_${tag}`, unidade);
}

/** Recusa do teto do trial. Mensagem já pronta para a tela. */
export class ErroLimiteTrial extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErroLimiteTrial';
  }
}

export async function criarEquipamento(
  tag: string,
  tipo: TipoEquipamento,
  subtipo: InfoEquipamento['subtipo'] = '',
): Promise<void> {
  // O teto do trial é checado AQUI, no serviço, e não só no botão: a criação
  // tem mais de um ponto de entrada (tela de equipamentos e importação de
  // planilha), e um gate que vive na tela não alcança o outro caminho.
  //
  // A versão ASSÍNCRONA porque sob `boot_v9` o cache não tem a organização: a
  // contagem local daria zero e o teto sumiria em silêncio. Fora do boot leve
  // ela não vai à rede — devolve o mesmo resultado síncrono de sempre.
  const limite = await podeCriarEquipamentoAgora();
  if (!limite.permitido) throw new ErroLimiteTrial(limite.motivo);

  const info: InfoEquipamento = {
    tag,
    tipo,
    // mantém o subtipo escolhido para autoclave E caldeira; vaso não tem subtipo.
    subtipo: tipo === 'autoclave' || tipo === 'caldeira' ? subtipo : '',
  };
  await salvar(`nr13_info_${tag}`, info);
}

// ── Fase 9 · lista leve e carregamento sob demanda ──────────────────────────

/**
 * Uma página de equipamentos, da PROJEÇÃO — sem hidratar a organização.
 *
 * Só é chamada com a flag `busca_v9` ligada. Fora dela, `listarEquipamentos()`
 * acima continua sendo o caminho, intacto.
 */
export async function listarPagina(
  filtros: FiltrosBusca = {},
  cursor: string | null = null,
  sinal?: AbortSignal,
): Promise<PaginaCatalogo> {
  return buscaIndex.listarPagina(filtros, cursor, sinal);
}

/**
 * As chaves de um equipamento, na ordem em que os prefixos foram declarados.
 *
 * Sai de `POR_TAG`, que é a MESMA tabela que o palco e a exclusão usam. Montar
 * uma lista própria aqui garantiria que, no dia em que uma família nova
 * nascesse, este caminho ficasse para trás — e um documento abriria sem ela.
 */
export function chavesDoEquipamento(tag: string): string[] {
  return POR_TAG.map((prefixo) => prefixo + tag);
}

/**
 * Traz do servidor tudo que a TAG precisa e deposita no cache — a "estratégia
 * oficial de compatibilidade" do desenho (§4), em uma chamada.
 *
 * Depois disto:
 *   · `ler('nr13_info_<TAG>')` continua SÍNCRONO e encontra;
 *   · `montarResumo`, ficha, memorial e categoria funcionam sem alteração;
 *   · `coletarItens(tag)` acha as chaves e monta o palco;
 *   · os 40+ templates HTML seguem exatamente como sempre foram.
 *
 * DUAS PASSADAS, e a segunda não é desperdício: existem duas famílias cujo
 * NOME depende de um id que só se conhece depois de ler uma chave da primeira
 * passada. `POR_TAG` não as alcança — nenhuma lista de prefixos alcançaria:
 *
 *   · `nr13_calibracao_item_<id>` — os ids estão em `nr13_calibracoes_<TAG>`.
 *     Sem esta passada, o certificado do relatório sai em branco;
 *   · `nr13_rel_<id>_<TAG>`       — o REGISTRO de cada relatório salvo. A
 *     família é `POR_ID_E_TAG` (a TAG fica no fim porque a Edge do Portal
 *     filtra por `endsWith('_'+tag)`), e os ids estão no índice
 *     `nr13_historico_indice_<TAG>`. Sem esta passada o histórico abre curto:
 *     o índice lista os relatórios e abrir qualquer um deles não acha o
 *     registro.
 *
 * Não lança: sem rede, o que já estiver no cache continua valendo, e a tela de
 * detalhe decide o que dizer. Derrubar a navegação por causa da rede seria
 * transformar uma tela degradada numa tela quebrada.
 */
export async function carregarEquipamento(tag: string): Promise<void> {
  await semearEquipamento(chavesDoEquipamento(tag));

  const porId: string[] = [];

  const calibracoes = ler<Array<{ id?: unknown }>>(`nr13_calibracoes_${tag}`);
  for (const id of idsDe(calibracoes)) porId.push(`nr13_calibracao_item_${id}`);

  const indice = ler<Array<{ id?: unknown }>>(chaveIndice(tag));
  for (const id of idsDe(indice)) porId.push(chaveRelatorio(id, tag));

  if (porId.length) await semearEquipamento(porId);
}

/** Os ids de uma lista lida do cache, ignorando o que não for id. */
function idsDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((item) => (item as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

/**
 * Os equipamentos que ESTE aparelho gravou e o servidor ainda não confirmou.
 *
 * É a rede de segurança do §6.5: item recém-salvo nunca some da lista. Sai da
 * fila de sincronização, que é a mesma fonte que o selo da topbar usa.
 */
export function equipamentosPendentesLocais(): ItemCatalogo[] {
  return listarPendentes()
    .filter((item) => item.chave.startsWith(PREFIXO_INFO) && item.op !== 'del')
    .map((item) => {
      const tag = item.chave.slice(PREFIXO_INFO.length);
      const info = ler<InfoEquipamento>(item.chave);
      const cat = ler<CategoriaSalva>(`nr13_cat_${tag}`);
      const emp = ler<{
        nomeFantasia?: string;
        razaoSocial?: string;
        cidade?: string;
        clienteId?: string;
      }>(`nr13_emp_${tag}`);
      const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
      const calc = ler<CalculoSalvo>(`nr13_calc_${tag}`);
      const vida = ler<{ vidaAnos?: number | null }>(`nr13_vida_${tag}`);
      return {
        tag,
        descricao: info?.descricao ?? null,
        tipo: info?.tipo ?? null,
        subtipo: info?.subtipo || null,
        categoria: cat?.catFinal ?? null,
        fabricante: info?.fabricante ?? null,
        numeroSerie: info?.numeroSerie ?? null,
        localizacao: info?.localizacao ?? null,
        ano: info?.ano ?? null,
        // MESMA precedência do cartão antigo e da projeção: razão social
        // primeiro. Este caminho monta a linha do item que ainda não voltou do
        // servidor; divergir aqui faria o cartão TROCAR de nome ao sincronizar.
        clienteNome: emp?.razaoSocial || emp?.nomeFantasia || null,
        clienteCidade: emp?.cidade || null,
        proximaInspecao: null,
        temFoto: fotos.length > 0,
        fotoRef: (fotos.find((f) => f.isCapa) ?? fotos[0])?.ref ?? null,
        pmtaMpa: calc?.pmta ? Number(calc.pmta) : null,
        pthMpa: calc?.pth ? Number(calc.pth) : null,
        resultado: calc?.resultado ?? null,
        volumeM3: typeof cat?.volInput === 'number' ? cat.volInput : null,
        fluido: cat?.fluidoInput ?? null,
        classeFluido: cat?.classe ?? null,
        vidaAnos: typeof vida?.vidaAnos === 'number' ? vida.vidaAnos : null,
        temCliente: !!emp?.clienteId,
        unidade: ler<string>(`nr13_pref_unidade_${tag}`),
        sourceVersion: 0,
        pendente: true,
      } satisfies ItemCatalogo;
    });
}
