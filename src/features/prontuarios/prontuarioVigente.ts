import type { EmissaoProntuario } from './emissaoProntuario';
import type { DocumentoProntuario } from './indiceProntuarios';
import type { ProntuarioFabricanteSalvo } from '../equipamento/ProntuarioFabricante';

/**
 * O PRONTUÁRIO VIGENTE DE UM EQUIPAMENTO — A PORTA ÚNICA (24/09/2026).
 *
 * Regra de produto: **1 equipamento = 1 prontuário NR-13 vigente + histórico**.
 * O vigente pode ter sido GERADO pelo sistema ou ANEXADO (PDF existente); os
 * dois ocupam o mesmo slot lógico, e a origem é só metadado — ela decide como
 * abrir e qual selo mostrar, nunca quem ganha. A política de atualização é
 * NOVA VERSÃO: o documento novo vira vigente, o anterior vira histórico, e
 * nenhum byte, `pdfRef` ou SHA antigo é tocado.
 *
 * A ficha (slot do topo) e `/prontuarios` (uma linha por TAG) resolvem o
 * vigente AQUI — com o mesmo comparador sobre as duas fontes que já existem.
 * Nada é persistido: o vigente é uma PROJEÇÃO, não um segundo registro.
 *
 * ## O critério exato de "mais atual"
 *
 * `compararVersoes`, em ordem:
 *
 * 1. **`geradoEm`** (emissão) / **`atualizadoEm`** (linha do índice, que é a
 *    cópia do mesmo `geradoEm` — ver `docDeEmissao`). É o instante em que o
 *    PDF foi GERADO (emissão do sistema) ou ENVIADO (anexo), gravado por
 *    `publicarArtefato`. Comparado como instante, não como texto.
 * 2. **O carimbo do `id`** — `PRONT-<Date.now()>-rN|anexoN`, gravado por
 *    `registrarEmissao` no momento do registro. Desempata duas versões no
 *    mesmo milissegundo de `geradoEm`.
 * 3. **A posição na lista** (ordem de acréscimo) — último recurso, só para
 *    registros sem data legível.
 *
 * A ordem do array SOZINHA não é o critério: ela é a ordem de acréscimo NESTE
 * aparelho, e uma lista unida pelo merge da Sync V2 (união por item) não
 * promete cronologia.
 *
 * O número da revisão NÃO entra: ele conta só os GERADOS (`revisaoDe`), e um
 * anexo não tem revisão — compará-lo faria o tipo decidir o vigente.
 *
 * ## O que não é versão
 *
 * - **Rascunho** (`nr13_prontuario_<TAG>`, linha `rascunho` no índice) NÃO é
 *   documento: nunca é vigente. Com Rev. 02 emitida e a Rev. 03 em edição, o
 *   vigente segue a Rev. 02.
 * - **Item removido** (`removidoEm`, tombstone da Sync V2) não conta.
 * - **PDF do fabricante** (`nr13_pront_fab_<TAG>`) é LEGADO: só ocupa o slot
 *   quando a fonte principal está vazia, e nunca é convertido em emissão.
 *   Com emissão, ele fica preservado e aparece no histórico.
 */
export type OrigemVigente = 'gerado' | 'anexado' | 'fabricante';

export const ROTULO_ORIGEM: Record<OrigemVigente, string> = {
  gerado: 'GERADO PELO SISTEMA',
  anexado: 'PDF ANEXADO',
  fabricante: 'PDF DO FABRICANTE · LEGADO',
};

/** Uma versão do prontuário: uma emissão (gerada/anexada) ou o PDF legado. */
export interface VersaoProntuario {
  origem: OrigemVigente;
  emissao?: EmissaoProntuario;
  fabricante?: ProntuarioFabricanteSalvo;
}

export interface ProntuarioVigente extends VersaoProntuario {
  /** Versões que ficaram para trás, da mais recente para a mais antiga. */
  historico: VersaoProntuario[];
  /** `historico.length` — atalho para a tela. */
  outros: number;
}

/** Milissegundos de um ISO; `NaN` quando ilegível. */
function instante(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : NaN;
}

/** O carimbo `Date.now()` que `registrarEmissao` põe no id (`PRONT-<ms>-…`). */
function carimboDoId(id: string): number {
  const m = /^PRONT-(\d{10,})-/.exec(id ?? '');
  return m ? Number(m[1]) : NaN;
}

interface Ordenavel {
  id: string;
  quando: string | null | undefined;
  posicao: number;
}

/** Negativo = `a` é mais ANTIGA. Ver o critério no cabeçalho. */
export function compararVersoes(a: Ordenavel, b: Ordenavel): number {
  const ta = instante(a.quando);
  const tb = instante(b.quando);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  const ia = carimboDoId(a.id);
  const ib = carimboDoId(b.id);
  if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
  return a.posicao - b.posicao;
}

/** Ordena do MAIS RECENTE para o mais antigo, sem tocar na entrada. */
function maisRecentesPrimeiro<T>(itens: readonly T[], id: (t: T) => string, quando: (t: T) => string | null | undefined): T[] {
  return itens
    .map((t, posicao) => ({ t, o: { id: id(t), quando: quando(t), posicao } }))
    .sort((x, y) => compararVersoes(y.o, x.o))
    .map((x) => x.t);
}

const removido = (x: object) => typeof (x as { removidoEm?: unknown }).removidoEm === 'string';

function versaoDaEmissao(e: EmissaoProntuario): VersaoProntuario {
  return { origem: e.origem === 'anexado' ? 'anexado' : 'gerado', emissao: e };
}

/**
 * O vigente e o histórico de UMA TAG, das fontes da TAG — é o que a ficha usa.
 */
export function resolverProntuarioVigente(
  emissoes: readonly EmissaoProntuario[],
  fabricante: ProntuarioFabricanteSalvo | null,
): ProntuarioVigente | null {
  const ordem = maisRecentesPrimeiro(
    emissoes.filter((e) => e && !removido(e)),
    (e) => e.id,
    (e) => e.geradoEm,
  );
  if (ordem.length === 0) {
    return fabricante ? { origem: 'fabricante', fabricante, historico: [], outros: 0 } : null;
  }
  const [atual, ...anteriores] = ordem;
  const historico = anteriores.map(versaoDaEmissao);
  if (fabricante) historico.push({ origem: 'fabricante', fabricante });
  return { ...versaoDaEmissao(atual), historico, outros: historico.length };
}

/** Um equipamento em `/prontuarios`: UMA linha principal. */
export interface GrupoProntuario {
  tag: string;
  /** A linha do índice do documento vigente; `null` = só rascunho. */
  vigente: DocumentoProntuario | null;
  /** Trabalho em aberto (nova revisão ou primeira emissão). */
  rascunho: DocumentoProntuario | null;
  /** Linhas emitidas que ficaram para trás, mais recente primeiro. */
  historico: DocumentoProntuario[];
}

/**
 * A lista de `/prontuarios` agrupada por equipamento — PROJEÇÃO do índice
 * (`nr13_pront_indice`), com o MESMO comparador da ficha. O índice não muda de
 * formato: ele segue com uma linha por documento, e o agrupamento é da tela.
 *
 * Ordem dos grupos: o mais recentemente movimentado primeiro (a data do
 * vigente ou do rascunho, a que for mais nova) — a ordem que a lista já tinha.
 */
export function agruparPorTag(docs: readonly DocumentoProntuario[]): GrupoProntuario[] {
  const porTag = new Map<string, DocumentoProntuario[]>();
  for (const d of docs) {
    if (!d || typeof d.tag !== 'string' || removido(d)) continue;
    const l = porTag.get(d.tag) ?? [];
    l.push(d);
    porTag.set(d.tag, l);
  }
  const grupos: GrupoProntuario[] = [];
  for (const [tag, lista] of porTag) {
    const emitidos = maisRecentesPrimeiro(
      lista.filter((d) => d.situacao === 'emitido'),
      (d) => d.id,
      (d) => d.atualizadoEm,
    );
    const rascunho = lista.find((d) => d.situacao === 'rascunho') ?? null;
    grupos.push({ tag, vigente: emitidos[0] ?? null, rascunho, historico: emitidos.slice(1) });
  }
  const recente = (g: GrupoProntuario) =>
    Math.max(instante(g.vigente?.atualizadoEm) || 0, instante(g.rascunho?.atualizadoEm) || 0);
  return grupos.sort((a, b) => recente(b) - recente(a));
}
