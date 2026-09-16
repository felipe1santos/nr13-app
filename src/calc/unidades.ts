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
 * `nr13_pref_unidade_<TAG>` é gravada por `criarEquipamento(…, unidade)` (antes de
 * 16/09/2026 também por `salvarUnidade(tag, unidade: string)`, já removida)
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

/**
 * O NOME do sistema de unidades, como o usuário o escolhe.
 *
 * Estava escrito à mão dentro de `SeletorUnidade.tsx`; com a unidade virando
 * característica do equipamento (16/09/2026) o mesmo nome passou a aparecer no
 * cadastro, no cartão e na ficha, e três cópias divergem na primeira mudança.
 */
export const ROTULO_SISTEMA: Record<SistemaUnidade, string> = {
  SI: 'SI',
  TECNICO: 'Técnico',
  PETROBRAS: 'Petrobras',
};

/** `SI (MPa)` — o nome do sistema com a unidade de pressão entre parênteses. */
export function rotuloSistemaCompleto(sistema: SistemaUnidade): string {
  const u = unidadeValida(sistema);
  return `${ROTULO_SISTEMA[u]} (${FATORES_CONVERSAO[u].labelPressao})`;
}

/** O rótulo de pressão da unidade — `MPa`, `kgf/cm²` ou `bar`. */
export function rotuloPressao(sistema: SistemaUnidade): string {
  return FATORES_CONVERSAO[unidadeValida(sistema)].labelPressao;
}

/**
 * Casas decimais por unidade, e por que elas diferem.
 *
 * O documento sempre imprimiu MPa com 3 casas e kgf/cm²/bar com 2 — não é
 * capricho: 1 MPa vale ~10,2 kgf/cm², então a terceira casa em MPa carrega a
 * mesma informação que a segunda nas outras duas. Igualar todas em 2 perderia
 * precisão em MPa; igualar em 3 inventaria um dígito que a medição não tem.
 *
 * Ficam aqui, e não espalhadas pelas folhas, porque a partir de 16/09/2026 o
 * relatório inteiro imprime UMA unidade: se cada tabela escolhesse a sua, o
 * mesmo número apareceria com precisões diferentes em folhas diferentes.
 */
export const CASAS_POR_UNIDADE: Record<SistemaUnidade, number> = {
  SI: 3,
  TECNICO: 2,
  PETROBRAS: 2,
};

/**
 * Um valor canônico (MPa) → o texto na unidade do equipamento, SEM rótulo.
 *
 * Sem rótulo de propósito: quem chama é tabela, e o rótulo da unidade vive no
 * CABEÇALHO da coluna. Repeti-lo em cada célula é o que faz a tabela do
 * documento parecer planilha.
 *
 * `null` entra e `null` sai — o travessão é decisão da folha, não daqui.
 */
export function valorNaUnidade(valorMpa: number | null, sistema: SistemaUnidade): string | null {
  if (valorMpa === null || !Number.isFinite(valorMpa)) return null;
  const u = unidadeValida(sistema);
  return paraExibicao(valorMpa, u).toFixed(CASAS_POR_UNIDADE[u]);
}
