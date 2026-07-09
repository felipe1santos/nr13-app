import { ler, salvar } from '../../services/storage';
import type { ComponenteResumo } from './tiposMemorial';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import {
  calcularCostadoCaldeira,
  calcularEspelhoCaldeira,
  calcularTuboCaldeira,
  pmtaCaldeiraKgf,
  thCaldeiraKgf,
} from '../../calc/caldeira';
import type { CostadoCaldeira, EspelhoCaldeira, ResultadoEtapaCaldeira, TuboCaldeira } from '../../calc/caldeira';

export interface CaldeiraSalva {
  tag: string;
  P: number | ''; // Pressão de projeto (MPa) — global da caldeira
  temp: number | ''; // Temperatura de projeto (°C)
  costado: CostadoCaldeira;
  tubo: TuboCaldeira;
  espelho: EspelhoCaldeira;
}

export interface ResumoMemorialCaldeira {
  etapas: { id: 'costado' | 'tubo' | 'espelho'; nome: string; resultado: ResultadoEtapaCaldeira }[];
  pmtaKgf: number | null;
  thKgf: number | null;
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE';
  logCompleto: string[];
}

const chaveCaldeira = (tag: string) => `nr13_vaso_cald_${tag}`;

export function carregarCaldeira(tag: string): CaldeiraSalva {
  return ler<CaldeiraSalva>(chaveCaldeira(tag)) || { tag, P: '', temp: '', costado: {}, tubo: {}, espelho: {} };
}

export async function salvarCaldeira(tag: string, c: CaldeiraSalva): Promise<void> {
  await salvar(chaveCaldeira(tag), c);
}

// PMTA da caldeira = pressão de projeto convertida (planilha de referência do usuário) e
// TH = 1,5 × PMTA — NÃO inverte a fórmula pela espessura encontrada (decisão de engenharia).
export function calcularResumoCaldeira(c: CaldeiraSalva): ResumoMemorialCaldeira {
  const etapas: ResumoMemorialCaldeira['etapas'] = [
    { id: 'costado', nome: 'Costado (PG-27.2.2)', resultado: calcularCostadoCaldeira(c.P, c.temp, c.costado) },
    { id: 'tubo', nome: 'Tubo (PG-27.2.1)', resultado: calcularTuboCaldeira(c.P, c.temp, c.tubo) },
    { id: 'espelho', nome: 'Espelho Diant./Tras. (PG-46.1)', resultado: calcularEspelhoCaldeira(c.P, c.temp, c.espelho) },
  ];

  const pNum = Number(c.P);
  const temP = Number.isFinite(pNum) && pNum > 0;
  const pmtaKgf = temP ? pmtaCaldeiraKgf(pNum) : null;
  const thKgf = temP ? thCaldeiraKgf(pNum) : null;

  const temFaltantes =
    !temP ||
    c.temp === '' || c.temp === null || c.temp === undefined ||
    etapas.some((e) => e.resultado.faltantes.length > 0);
  const resultado = temFaltantes
    ? 'PENDENTE'
    : etapas.every((e) => e.resultado.resultado === 'APROVADO')
      ? 'APROVADO'
      : 'REPROVADO';

  const blocoFinal = [
    `// ====================================================`,
    `// MEMORIAL DE CÁLCULO: PMTA E TESTE HIDROSTÁTICO DA CALDEIRA`,
    `// ====================================================`,
    `// PMTA (kgf/cm²) = P × 10,19716 = ${pmtaKgf != null ? pmtaKgf.toFixed(2) : '--'} kgf/cm²`,
    `// TESTE HIDROSTÁTICO: TH = 1,5 × PMTA = ${thKgf != null ? thKgf.toFixed(2) : '--'} kgf/cm²`,
    `<span class="${resultado === 'APROVADO' ? 'msg-aprovado' : 'msg-reprovado'}">RESULTADO FINAL: CALDEIRA ${resultado}.</span>`,
    ` `,
  ];

  return {
    etapas,
    pmtaKgf,
    thKgf,
    resultado,
    logCompleto: etapas.flatMap((e) => e.resultado.log).concat(blocoFinal),
  };
}

const FORMULAS_CALDEIRA: Record<string, [string, string]> = {
  costado: ['e = P·D / (2·S·E + 2·y·P) + C', 'PMTA = P de projeto (kgf/cm²) — PG-27.2.2'],
  tubo: ['e = P·D / (2·S + P) + 0,005·D + e', 'PMTA = P de projeto (kgf/cm²) — PG-27.2.1'],
  espelho: ['e = p·√(P / (S·C))', 'PMTA = P de projeto (kgf/cm²) — PG-46.1'],
};

function numV(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// Payload no MESMO shape do vaso (ver salvarResumoVaso) — RESUMO-MEMORIAL.html,
// MEMORIAL.html e a ficha ("Ver Memorial") funcionam sem alteração de template.
export async function salvarResumoCaldeira(tag: string, resumo: ResumoMemorialCaldeira): Promise<void> {
  const c = carregarCaldeira(tag);
  const P = numV(c.P);
  const dadosPorEtapa: Record<string, CostadoCaldeira & TuboCaldeira & EspelhoCaldeira> = {
    costado: c.costado, tubo: c.tubo, espelho: c.espelho,
  };
  const componentes: ComponenteResumo[] = resumo.etapas.map((e) => {
    const d = dadosPorEtapa[e.id];
    const f = FORMULAS_CALDEIRA[e.id];
    return {
      nome: e.nome,
      pmtaMpa: P,
      tReqMm: e.resultado.e,
      tNom: numV(d.espEncontrada),
      E: e.id === 'costado' ? numV((d as CostadoCaldeira).E) : null,
      S: numV(d.S),
      D: e.id === 'espelho' ? null : numV((d as CostadoCaldeira).D),
      raio: e.id === 'costado' && numV(d.D) != null ? (numV(d.D) as number) / 2 : null,
      ca: e.id === 'costado' ? numV((d as CostadoCaldeira).C) : null,
      material: d.mat || null,
      formulaT: f[0],
      formulaP: f[1],
    };
  });
  const payload = {
    pmta: P != null ? P.toFixed(2) : '', // MPa — templates convertem p/ kgf/bar
    pth: P != null ? (1.5 * P).toFixed(2) : '', // MPa (TH caldeira = 1,5×)
    ecasco: resumo.etapas[0].resultado.e.toFixed(3),
    etampo: resumo.etapas[2].resultado.e.toFixed(3),
    componentes,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  };
  await salvar(`nr13_calc_${tag}`, payload);
  // NÃO chamar atualizarCategoriaComPmta: categoria (kPa×m³) é regra de VASO; caldeira não usa.
}
