// Sistema de unidades por equipamento (detalhes.html, FATORES_CONVERSAO) — preservado.
// O cálculo interno é SEMPRE em MPa/mm; a unidade só afeta exibição/entrada de pressão e tensão.

export type SistemaUnidade = 'SI' | 'TECNICO' | 'PETROBRAS';

export interface FatorUnidade {
  mult: number;
  labelPressao: string;
  labelTensao: string;
}

export const FATORES_CONVERSAO: Record<SistemaUnidade, FatorUnidade> = {
  SI: { mult: 1, labelPressao: 'MPa', labelTensao: 'MPa' },
  TECNICO: { mult: 10.19716, labelPressao: 'kgf/cm²', labelTensao: 'kgf/cm²' },
  PETROBRAS: { mult: 10, labelPressao: 'bar', labelTensao: 'bar' },
};

export function paraExibicao(valorMpa: number, sistema: SistemaUnidade): number {
  return valorMpa * FATORES_CONVERSAO[sistema].mult;
}

export function paraMpa(valorExibido: number, sistema: SistemaUnidade): number {
  return valorExibido / FATORES_CONVERSAO[sistema].mult;
}

export function formatarValor(valorMpa: number, sistema: SistemaUnidade, casas = 2): string {
  const fator = FATORES_CONVERSAO[sistema];
  return `${paraExibicao(valorMpa, sistema).toFixed(casas)} ${fator.labelPressao}`;
}
