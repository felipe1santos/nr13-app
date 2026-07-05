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
}
