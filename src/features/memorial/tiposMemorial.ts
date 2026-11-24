// Componente estruturado gravado em nr13_calc_<TAG>.componentes[] — consumido pelo RESUMO-MEMORIAL.
export interface ComponenteResumo {
  nome: string;
  pmtaMpa: number | null;
  tReqMm: number | null;
  tNom: number | null;
  E: number | null;
  S: number | null;
  D: number | null;
  raio: number | null;
  ca: number | null;
  material: string | null;
  formulaT: string;
  formulaP: string;
  /** C da UG-34 (tampo/porta plana) — 24/11/2026, para a legenda da folha 6. */
  C?: number | null;
  /** d da UG-34: diâmetro ou vão que entra na fórmula do tampo/porta plana. */
  d?: number | null;
}
