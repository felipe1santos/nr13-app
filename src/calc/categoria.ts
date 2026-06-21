// Porte de calcularCategoria() (detalhes.html) — classificação de risco NR-13.
// Entradas em unidade de exibição já revertidas pra MPa antes de chamar esta função.

export type Categoria = 'I' | 'II' | 'III' | 'IV' | 'V';
export type ClasseFluido = 'A' | 'B' | 'C' | 'D';
export type Grupo = 1 | 2 | 3 | 4 | 5;

const TABELA_CATEGORIA: Record<ClasseFluido, Record<Grupo, Categoria>> = {
  A: { 1: 'I', 2: 'I', 3: 'II', 4: 'III', 5: 'III' },
  B: { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'IV' },
  C: { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' },
  D: { 1: 'II', 2: 'III', 3: 'IV', 4: 'V', 5: 'V' },
};

export interface ResultadoCategoria {
  classe: ClasseFluido;
  grupo: Grupo;
  pvEnq: number; // P(kPa) x V(m3)
  pvCat: number; // P(MPa) x V(m3)
  isEnquadrado: boolean;
  catFinal: Categoria | 'N/A (Não Enquadra)';
}

function grupoPorPV(pvCategoria: number): Grupo {
  if (pvCategoria >= 100) return 1;
  if (pvCategoria >= 30) return 2;
  if (pvCategoria >= 2.5) return 3;
  if (pvCategoria >= 1) return 4;
  return 5;
}

// volumeM3 e pressaoMpa já em SI (MPa/m³); fluido é a string completa, cuja 1ª letra é a classe.
export function calcularCategoriaNR13(volumeM3: number, pressaoMpa: number, fluido: string): ResultadoCategoria {
  const classe = (fluido.charAt(0).toUpperCase() || 'D') as ClasseFluido;

  const pKpa = pressaoMpa * 1000;
  const pvEnq = pKpa * volumeM3;
  const isEnquadrado = pvEnq > 8;

  const pvCat = pressaoMpa * volumeM3;
  const grupo = grupoPorPV(pvCat);

  const catFinal = isEnquadrado ? TABELA_CATEGORIA[classe][grupo] : 'N/A (Não Enquadra)';

  return { classe, grupo, pvEnq, pvCat, isEnquadrado, catFinal };
}
