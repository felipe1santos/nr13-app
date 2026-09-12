import type { CampoEditavel } from '../pdfVetorial/documento';
import {
  comOverride,
  overrideDeTexto,
  type MapaOverrides,
} from '../overridesRelatorio';
import { rotuloDoCampo } from './camposPredefiniveis';
import { idsDoConjunto, type Predefinicao } from './modelo';

/**
 * APLICAR UMA PREDEFINIÇÃO — o plano, antes do ato (12/09/2026).
 *
 * ## A regra que motiva este módulo
 *
 * Uma predefinição **não pode apagar em silêncio o que alguém digitou**. O
 * modelo antigo aplicava direto e, pior, limpava as linhas de recomendação que
 * sobravam: quem tinha escrito a quarta recomendação à mão e aplicava um
 * conjunto de duas perdia a quarta sem nunca ver um aviso.
 *
 * Então aplicar passou a ter duas etapas. Primeiro monta-se o PLANO — campo a
 * campo, o que está no documento hoje e o que a predefinição propõe. O usuário
 * lê, escolhe o modo e só então confirma.
 *
 * ## Os quatro estados de um campo no plano
 *
 * | estado | quando | o que acontece |
 * |---|---|---|
 * | `ausente` | o campo não foi desenhado neste relatório | nada, e a tela diz por quê |
 * | `igual` | o documento já diz exatamente isso | nada |
 * | `preenche` | o campo está vazio | preenchido nos dois modos |
 * | `conflito` | há conteúdo diferente escrito ali | só no modo `substituir` |
 *
 * `ausente` é o que impede o defeito silencioso: um conjunto com campos do
 * teste hidrostático aplicado num relatório sem a folha de TH gravaria
 * overrides para campos que ninguém desenha, e o usuário veria "8 campos
 * preenchidos" e nenhuma mudança no papel.
 *
 * ## Os modos
 *
 * Dois, não três. A especificação pedia "manter os valores existentes",
 * "preencher apenas campos vazios" e "substituir"; as duas primeiras descrevem
 * o mesmo comportamento — em ambas, o que já está escrito fica —, e oferecer
 * duas opções idênticas com nomes diferentes faz o usuário procurar a diferença
 * que não existe. Ficaram `vazios` (o padrão) e `substituir`.
 */
export type ModoAplicacao = 'vazios' | 'substituir';

export type EstadoCampoPlano = 'ausente' | 'igual' | 'preenche' | 'conflito';

export interface ItemPlano {
  id: string;
  rotulo: string;
  /** O que o documento mostra HOJE naquele campo. */
  atual: string;
  /** O que a predefinição propõe. Pode ser vazio — é o "deixar em branco". */
  novo: string;
  estado: EstadoCampoPlano;
  /** O valor automático do campo, que o override precisa guardar. */
  auto: string;
}

export interface PlanoAplicacao {
  itens: ItemPlano[];
  /** Quantos serão escritos no modo `vazios`. */
  totalVazios: number;
  /** Quantos já têm conteúdo diferente — o número que a tela destaca. */
  totalConflitos: number;
  /** Quantos não existem neste relatório. */
  totalAusentes: number;
  /** Quantos já dizem exatamente o que a predefinição propõe. */
  totalIguais: number;
}

/**
 * Monta o plano a partir do que o GERADOR acabou de desenhar.
 *
 * `editaveis` é a mesma lista que pinta o amarelo da prévia e alimenta a barra
 * "O que falta": valor já resolvido, override aplicado. Comparar contra o mapa
 * de overrides em vez desta lista mostraria "vazio" num campo que a fonte
 * automática preenche — e o usuário confirmaria uma sobrescrita achando que
 * estava preenchendo um buraco.
 */
export function planoAplicacao(p: Predefinicao, editaveis: CampoEditavel[]): PlanoAplicacao {
  const noDocumento = new Map(editaveis.map((c) => [c.id, c]));
  const itens: ItemPlano[] = [];

  for (const id of idsDoConjunto(p)) {
    const novo = p.campos[id] ?? '';
    const campo = noDocumento.get(id);
    const rotulo = campo?.rotulo ?? rotuloDoCampo(id);
    if (!campo) {
      itens.push({ id, rotulo, atual: '', novo, estado: 'ausente', auto: '' });
      continue;
    }
    const atual = campo.valor ?? '';
    const estado: EstadoCampoPlano =
      atual.trim() === novo.trim() ? 'igual' : atual.trim() === '' ? 'preenche' : 'conflito';
    itens.push({ id, rotulo, atual, novo, estado, auto: campo.auto ?? '' });
  }

  return {
    itens,
    totalVazios: itens.filter((i) => i.estado === 'preenche').length,
    totalConflitos: itens.filter((i) => i.estado === 'conflito').length,
    totalAusentes: itens.filter((i) => i.estado === 'ausente').length,
    totalIguais: itens.filter((i) => i.estado === 'igual').length,
  };
}

/** Os itens que o modo escolhido realmente escreve. */
export function itensQueSeraoEscritos(plano: PlanoAplicacao, modo: ModoAplicacao): ItemPlano[] {
  return plano.itens.filter(
    (i) => i.estado === 'preenche' || (modo === 'substituir' && i.estado === 'conflito'),
  );
}

/**
 * O mapa de overrides RESULTANTE — uma gravação só.
 *
 * Aplicar campo a campo faria o documento ser redesenhado uma vez por campo (o
 * vetorial leva ~1,8 s num relatório completo). O mapa sai pronto daqui e entra
 * pelo caminho oficial: `gravarOverrides` → fila durável → RPC.
 *
 * **Nada além dos campos do plano é tocado.** O modelo antigo limpava as linhas
 * de recomendação que o conjunto não usava; agora um conjunto controla apenas o
 * que declara. Quem quiser limpar uma linha declara o campo com valor vazio —
 * que vira override `branco`, o estado em que o automático não volta sozinho.
 */
export function overridesDaAplicacao(
  base: MapaOverrides,
  plano: PlanoAplicacao,
  modo: ModoAplicacao,
): MapaOverrides {
  let mapa = base;
  for (const item of itensQueSeraoEscritos(plano, modo)) {
    mapa = comOverride(mapa, item.id, overrideDeTexto(item.novo, item.auto));
  }
  return mapa;
}

/**
 * O conjunto que os campos ATUAIS do documento produziriam.
 *
 * É o "guardar o que está neste relatório": pega, entre os campos que a
 * allowlist permite, os que têm conteúdo. Campo vazio não entra — guardar um
 * conjunto cheio de campos vazios faria aplicá-lo APAGAR o relatório seguinte,
 * que é o oposto do que quem clicou em guardar quis dizer.
 */
export function camposDoDocumento(editaveis: CampoEditavel[], permitido: (id: string) => boolean): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const c of editaveis) {
    if (!permitido(c.id)) continue;
    const v = (c.valor ?? '').trim();
    if (v === '') continue;
    campos[c.id] = c.valor;
  }
  return campos;
}
