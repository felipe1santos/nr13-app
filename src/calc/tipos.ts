// Tipos compartilhados pelo motor de cálculo. Mesmo formato de saída do math.js original:
// { t_min, pmta, resultado, log } — log é array de strings (texto + blocos KaTeX $$...$$ +
// HTML de status), consumido pela UI exatamente como hoje.

export type NumLike = number | string | undefined | null;

export type Resultado = 'APROVADO' | 'REPROVADO';

export interface ResultadoCalculo {
  t_min: string;
  pmta: string;
  resultado: Resultado;
  log: string[];
  /** Rótulos de campos obrigatórios sem valor — cálculo saiu com defaults; resultado não confiável. */
  faltantes?: string[];
}

export interface ResultadoTeste {
  p_teste: string;
  resultado: Resultado;
  log: string[];
}
