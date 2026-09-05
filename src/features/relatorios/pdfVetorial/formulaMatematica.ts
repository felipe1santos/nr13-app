/**
 * Bloco 1.1 · a FÓRMULA como equação, não como frase.
 *
 * ## O que este arquivo é — e o que ele não é
 *
 * Ele **reformata**, nunca reinterpreta. A entrada é exatamente a string que o
 * motor do memorial gravou em `nr13_calc_<TAG>.componentes[].formulaT/formulaP`
 * (`'PMTA = S·E·t / (Ri + 0,6·t)'`), e a saída é a mesma expressão separada em
 * numerador e denominador para poder ser desenhada com o traço da fração.
 *
 * Nenhuma equação nova é escrita aqui. Se o motor mudar a fórmula de um
 * componente, o documento muda junto — é a única forma de a folha continuar
 * dizendo a verdade sobre como aquele número foi calculado.
 *
 * ## Por que separar numerador de denominador dá trabalho
 *
 * `S·E·t / (Ri + 0,6·t)` tem a barra no topo da expressão; `t = d·C·√(P/S)` tem
 * uma barra DENTRO de um radical, e ali ela não é a fração principal. Dividir
 * pela primeira barra que aparecer produziria `t = d·C·√(P` sobre `S)` — uma
 * equação que não existe. Por isso a divisão só acontece na barra de
 * profundidade zero de parênteses; havendo qualquer outra coisa, a expressão é
 * impressa em linha, como veio.
 */

export interface FormulaDesenhavel {
  /** O lado esquerdo: `PMTA`, `t`… */
  lhs: string;
  /** Quando é fração, o de cima e o de baixo. */
  numerador?: string;
  denominador?: string;
  /** Quando não é fração (ou não dá para separar com segurança), a expressão inteira. */
  expressao?: string;
}

/** Tira UM par de parênteses que envolva a expressão inteira. */
export function semParentesesExternos(texto: string): string {
  const t = texto.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) return t;
  let nivel = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') nivel++;
    else if (t[i] === ')') {
      nivel--;
      // Fechou antes do fim: os parênteses não envolvem tudo (ex.: `(a)+(b)`).
      if (nivel === 0 && i < t.length - 1) return t;
    }
  }
  return t.slice(1, -1).trim();
}

/** O índice da barra de divisão PRINCIPAL, ou -1. */
export function indiceDaBarra(expressao: string): number {
  let nivel = 0;
  for (let i = 0; i < expressao.length; i++) {
    const c = expressao[i];
    if (c === '(') nivel++;
    else if (c === ')') nivel--;
    // Uma barra dentro de radical (`√(P/S)`) está entre parênteses, então já
    // caiu no `nivel > 0`. A que sobra em nível zero é a fração da equação.
    else if (c === '/' && nivel === 0) return i;
  }
  return -1;
}

/**
 * A fórmula do motor, pronta para desenhar.
 *
 * Sem `=`, sem barra ou com barra dentro de parênteses, o resultado é a
 * expressão em linha — que continua sendo a fórmula certa, só não empilhada.
 */
export function prepararFormula(bruta: string | null | undefined): FormulaDesenhavel | null {
  const texto = String(bruta ?? '').trim();
  if (texto === '') return null;

  const igual = texto.indexOf('=');
  const lhs = igual >= 0 ? texto.slice(0, igual).trim() : '';
  const rhs = (igual >= 0 ? texto.slice(igual + 1) : texto).trim();
  if (rhs === '') return null;

  const barra = indiceDaBarra(rhs);
  if (barra < 0) return { lhs, expressao: rhs };

  const numerador = semParentesesExternos(rhs.slice(0, barra));
  const denominador = semParentesesExternos(rhs.slice(barra + 1));
  if (numerador === '' || denominador === '') return { lhs, expressao: rhs };
  return { lhs, numerador, denominador };
}

/**
 * As variáveis que aparecem na fórmula, com o nome de cada uma.
 *
 * A lista existe para a folha explicar os símbolos que ELA imprimiu — e só
 * descreve o que já está na expressão. Símbolo que a fórmula não usa não entra
 * na legenda: legenda com variável ausente é ruído num memorial.
 */
export const DESCRICAO_VARIAVEL: Record<string, { descricao: string; unidade: string }> = {
  P: { descricao: 'Pressão de projeto', unidade: 'MPa' },
  PMTA: { descricao: 'Pressão máxima de trabalho admissível', unidade: 'MPa' },
  S: { descricao: 'Tensão admissível do material', unidade: 'MPa' },
  E: { descricao: 'Eficiência da junta soldada', unidade: '—' },
  t: { descricao: 'Espessura', unidade: 'mm' },
  D: { descricao: 'Diâmetro interno', unidade: 'mm' },
  Ri: { descricao: 'Raio interno', unidade: 'mm' },
  R: { descricao: 'Raio interno', unidade: 'mm' },
  L: { descricao: 'Raio da coroa do tampo', unidade: 'mm' },
  C: { descricao: 'Fator de fixação (UG-34)', unidade: '—' },
  G: { descricao: 'Diâmetro da junta de vedação', unidade: 'mm' },
  d: { descricao: 'Diâmetro da abertura', unidade: 'mm' },
  a: { descricao: 'Menor dimensão do lado', unidade: 'mm' },
  c: { descricao: 'Margem de corrosão', unidade: 'mm' },
  α: { descricao: 'Meio-ângulo do cone', unidade: '°' },
};

/** Os símbolos citados na fórmula, na ordem em que a legenda deve aparecer. */
export function variaveisDaFormula(...formulas: (string | null | undefined)[]): string[] {
  const texto = formulas.filter(Boolean).join(' ');
  const achados = new Set<string>();
  // `Ri` antes de `R`: a busca é por símbolo inteiro, e `R` casaria dentro de
  // `Ri`, trocando "raio interno" por outra variável na legenda.
  for (const simbolo of ['PMTA', 'Ri', 'P', 'S', 'E', 't', 'D', 'R', 'L', 'C', 'G', 'd', 'a', 'c', 'α']) {
    const escapado = simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-zÀ-ú])${escapado}([^A-Za-zÀ-ú]|$)`);
    if (re.test(texto)) achados.add(simbolo);
  }
  return [...achados];
}
