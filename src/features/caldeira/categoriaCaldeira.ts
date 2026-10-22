/**
 * CATEGORIA DA CALDEIRA — NR-13 (Portaria MTP nº 1.846/2022), subitem 13.4.1.1
 * (22/10/2026).
 *
 * "a) caldeiras da categoria A são aquelas cuja pressão de operação é igual ou
 * superior a 1.960 kPa (19,98 kgf/cm²); ou b) caldeiras da categoria B são
 * aquelas cuja pressão de operação seja superior a 60 kPa (0,61 kgf/cm²) e
 * inferior a 1 960 kPa (19,98 kgf/cm2)."
 *
 * Só pela PRESSÃO DE OPERAÇÃO — o critério de volume da redação de 2018 saiu.
 * A pressão é a PMO ADOTADA na ficha (MPa). Sem ela não há categoria: o
 * documento escreve que falta, em vez de chutar.
 *
 * Calculada SÓ no relatório de caldeira (rascunhos e emissões novos). A
 * `nr13_cat_<TAG>` cadastrada não é regravada: nada muda nos cartões, no Portal
 * nem em prazo algum — o prazo de caldeira no sistema não depende de categoria.
 */
export type CategoriaCaldeira = 'A' | 'B' | 'FORA';

/** 1.960 kPa e 60 kPa, em MPa. */
export const LIMITE_A_MPA = 1.96;
export const LIMITE_B_MPA = 0.06;

export function categoriaCaldeira(pmoMpa: number | null): CategoriaCaldeira | null {
  if (pmoMpa === null || !Number.isFinite(pmoMpa) || pmoMpa <= 0) return null;
  if (pmoMpa >= LIMITE_A_MPA) return 'A';
  if (pmoMpa > LIMITE_B_MPA) return 'B';
  return 'FORA';
}

export function rotuloCategoriaCaldeira(c: CategoriaCaldeira | null): string | null {
  if (c === null) return null;
  return c === 'FORA' ? 'Abaixo de 60 kPa (fora da categorização da NR-13)' : c;
}
