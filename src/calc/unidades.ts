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

/**
 * A unidade GUARDADA vira uma unidade VÁLIDA (09/09/2026).
 *
 * `nr13_pref_unidade_<TAG>` é gravada por `salvarUnidade(tag, unidade: string)`
 * — string livre — e volta do servidor na projeção do catálogo como
 * `unidade: string | null`. Quem consome fazia `item.unidade as SistemaUnidade`:
 * um CAST, que não verifica coisa nenhuma.
 *
 * Com um valor fora do domínio (chave legada, dado de importação, qualquer
 * coisa), `FATORES_CONVERSAO[sistema]` é `undefined` e a linha seguinte lança
 * "Cannot read properties of undefined (reading 'labelPressao')". Dentro de um
 * render do React isso não é um valor feio na tela: é a TELA INTEIRA caindo no
 * `errorElement` — "Ocorreu um erro inesperado" —, e a lista de equipamentos
 * desenha esse valor em cada cartão.
 *
 * O recuo é SI porque é o padrão do sistema e a base do cálculo (MPa). A unidade
 * só afeta EXIBIÇÃO: cair no padrão mostra a pressão numa unidade diferente da
 * preferida — visível, e corrigível pelo próprio seletor — enquanto a exceção
 * não deixa nem abrir a tela.
 */
export function unidadeValida(v: unknown): SistemaUnidade {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FATORES_CONVERSAO, v)
    ? (v as SistemaUnidade)
    : 'SI';
}

export function paraExibicao(valorMpa: number, sistema: SistemaUnidade): number {
  return valorMpa * FATORES_CONVERSAO[unidadeValida(sistema)].mult;
}

export function paraMpa(valorExibido: number, sistema: SistemaUnidade): number {
  return valorExibido / FATORES_CONVERSAO[unidadeValida(sistema)].mult;
}

export function formatarValor(valorMpa: number, sistema: SistemaUnidade, casas = 2): string {
  const fator = FATORES_CONVERSAO[unidadeValida(sistema)];
  return `${paraExibicao(valorMpa, sistema).toFixed(casas)} ${fator.labelPressao}`;
}
