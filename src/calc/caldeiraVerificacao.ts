/**
 * VERIFICAÇÃO PELA ESPESSURA MEDIDA — caldeira flamotubular (22/10/2026).
 *
 * O memorial (`calc/caldeira.ts`) parte da pressão de PROJETO e calcula a
 * espessura mínima; a PMTA do documento é a ADOTADA (CLAUDE.md §3 — "não
 * inverter a fórmula pela espessura"). Isto aqui NÃO substitui nada disso: é a
 * VERIFICAÇÃO que o relatório de caldeira de referência imprime — com a
 * espessura MEDIDA, qual pressão o componente ainda suporta? Se essa "PMTA pela
 * espessura medida" for maior ou igual à PMTA adotada, o componente está
 * APROVADO (decisão do dono, 21/10/2026).
 *
 * Fórmulas do ASME Seção I, as mesmas do memorial, só que resolvidas para P:
 * - CORPO (PG-27.2.2):   t = P·D / (2·S·E + 2·y·P) + c
 *                        P = 2·S·E·(t − c) / (D − 2·y·(t − c))
 * - ESPELHO (PG-46.1):   t = p·√(P / (S·C)) [+ c]
 *                        P = (t − c)²·S·C / p²
 * Unidades: S e P em MPa; t, c, D e p em mm. Funções puras, sem arredondar —
 * a formatação é do documento.
 *
 * Conferido contra o laudo CAL-25/5340: corpo 12,28 bar / t mín 9,26 mm;
 * espelhos 3,76 e 3,90 MPa. O t mín de 12,57 mm que aquele PDF imprime para os
 * espelhos NÃO fecha com os próprios dados (com a PMTA de 1,10 MPa dá 10,07 mm)
 * — o teste usa o valor que a fórmula dá.
 */

export interface EntradaCorpo {
  /** Tensão admissível (MPa). */
  S: number;
  /** Eficiência de junta. */
  E: number;
  /** Diâmetro externo (mm). */
  D: number;
  /** Margem de corrosão (mm). */
  c: number;
  /** Coeficiente de temperatura (ASME I: 0,4 até 480 °C). */
  y: number;
}

export interface EntradaEspelho {
  /** Tensão admissível (MPa). */
  S: number;
  /** Constante dos estais (PG-46: 2,2 para estais soldados). */
  C: number;
  /** Distância entre estais/tubos (mm). */
  p: number;
  /** Margem de corrosão (mm). */
  c: number;
}

const finito = (n: number) => Number.isFinite(n) && n > 0;

/** PMTA do corpo com a espessura medida `t` (MPa). `null` se a entrada não fecha. */
export function pmtaCorpoPelaEspessura(e: EntradaCorpo, t: number): number | null {
  const util = t - e.c;
  const den = e.D - 2 * e.y * util;
  if (!finito(e.S) || !finito(e.E) || !finito(e.D) || !(util > 0) || !(den > 0)) return null;
  return (2 * e.S * e.E * util) / den;
}

/** Espessura mínima do corpo para a pressão `P` (mm). */
export function tMinCorpo(e: EntradaCorpo, P: number): number | null {
  const den = 2 * e.S * e.E + 2 * e.y * P;
  if (!finito(P) || !finito(e.D) || !(den > 0)) return null;
  return (P * e.D) / den + e.c;
}

/** PMTA do espelho estaiado com a espessura medida `t` (MPa). */
export function pmtaEspelhoPelaEspessura(e: EntradaEspelho, t: number): number | null {
  const util = t - e.c;
  if (!finito(e.S) || !finito(e.C) || !finito(e.p) || !(util > 0)) return null;
  return (util * util * e.S * e.C) / (e.p * e.p);
}

/** Espessura mínima do espelho para a pressão `P` (mm). */
export function tMinEspelho(e: EntradaEspelho, P: number): number | null {
  if (!finito(P) || !finito(e.S) || !finito(e.C) || !finito(e.p)) return null;
  return e.p * Math.sqrt(P / (e.S * e.C)) + e.c;
}

export type VeredictoVerificacao = 'APROVADO' | 'REPROVADO' | 'INDETERMINADO';

/**
 * APROVADO se a PMTA pela espessura medida é ≥ à PMTA adotada. Sem um dos dois
 * números não há veredito — e o documento diz isso, em vez de inventar.
 */
export function veredicto(pmtaMedida: number | null, pmtaAdotada: number | null): VeredictoVerificacao {
  if (pmtaMedida === null || pmtaAdotada === null || !(pmtaAdotada > 0)) return 'INDETERMINADO';
  return pmtaMedida >= pmtaAdotada ? 'APROVADO' : 'REPROVADO';
}
