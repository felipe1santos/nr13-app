/**
 * VASO NÃO CATEGORIZADO (23/11/2026) — pedido do engenheiro parceiro e do dono.
 *
 * NR-13 vigente, 13.2.1: a norma se aplica a vasos de pressão
 *   b) cujo produto P·V seja superior a 8 (P em kPa, V em m³); e
 *   c) que contenham fluidos da classe A, INDEPENDENTE do produto P·V.
 *
 * Fora desses casos o vaso não é categorizado. O motivo vai ESCRITO — em
 * vermelho na ficha e no relatório —, nunca só um "N/A". Lê o que está gravado
 * em `nr13_cat_<TAG>`; não recalcula nada (§4: a base kPa × m³ é do cálculo).
 */
import type { CategoriaSalva } from '../equipamento/tipos';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ROTULO_NAO_CATEGORIZADO = 'NÃO CATEGORIZADO';

/** O motivo, pronto para a tela e para o PDF; `null` = categorizado ou nunca avaliado. */
export function motivoVasoNaoCategorizado(cat: Pick<CategoriaSalva, 'isEnquadrado' | 'PV_enq' | 'classe'> | null | undefined): string | null {
  if (!cat || cat.isEnquadrado !== false) return null;
  // Classe A entra na norma qualquer que seja o P·V (13.2.1 c): registro antigo
  // gravado como "não enquadra" com fluido classe A NÃO é "não categorizado".
  if (cat.classe === 'A') return null;
  const pv = Number(String(cat.PV_enq ?? '').replace(',', '.'));
  const pvTxt = Number.isFinite(pv) ? `${fmt(pv)} kPa·m³` : 'informado';
  return `Equipamento não categorizado pela NR-13, pois o produto P×V (${pvTxt}) não é superior a 8 e o fluido não é da classe A (NR-13, item 13.2.1 b e c).`;
}

/** Registro antigo: fluido classe A gravado como "não enquadra" antes da correção de 23/11/2026. */
export function precisaRecalcularClasseA(cat: Pick<CategoriaSalva, 'isEnquadrado' | 'classe'> | null | undefined): boolean {
  return !!cat && cat.isEnquadrado === false && cat.classe === 'A';
}
