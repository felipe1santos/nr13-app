import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
import type { ComponenteResumo } from './tiposMemorial';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import {
  cilindrica,
  retangular,
  vertical,
  fundoVertical,
  bancada,
  calcularBancada,
  type DadosAutoclaveBancada,
  type DadosAutoclaveCilindrica,
  type DadosAutoclaveRetangular,
  type DadosAutoclaveVertical,
} from '../../calc/autoclave';
import type { ResultadoCalculo } from '../../calc/tipos';

export type SubtipoAutoclaveMemorial = 'retangular' | 'cilindrica' | 'vertical' | 'bancada';

export type DadosAutoclave = DadosAutoclaveRetangular &
  DadosAutoclaveCilindrica &
  Partial<DadosAutoclaveVertical> &
  Partial<DadosAutoclaveBancada>;

const PADRAO_RETANGULAR: DadosAutoclaveRetangular = {
  pressao: 0.29,
  tensao: 115.14,
  c_stay: 2.1,
  espacamento: 120,
  espessura: 12,
  diametro_tirante: 25,
  sigma_escoamento: 0,
  material: 'SA-516-70',
};

const PADRAO_CILINDRICA: DadosAutoclaveCilindrica = {
  pressao: 1.5,
  tensao: 137.9,
  eficiencia: 0.85,
  diametro: 1000,
  espessura: 12,
  ca: 1.5,
  sigma_escoamento: 0,
  material: 'SA-516-70',
};

// Autoclave vertical (Autoclave_vertical_corrigida_ASME): tampo plano removível UG-34 +
// costado UG-27 + fundo plano/cônico + travas. Defaults = valores da planilha de referência.
const PADRAO_VERTICAL: DadosAutoclaveVertical = {
  pressao: 0.2,
  diametro: 400,
  tensao: 138,
  eficiencia: 1,
  ca: 1,
  c_fator: 0.33,
  t_tampo: 8,
  t_costado: 4,
  t_fundo: 6,
  tipo_fundo: 'plano',
  alfa: 15,
  n_travas: 6,
  d_trava: 12,
  tensao_trava: 120,
  sigma_escoamento: 0,
  material: 'SA-240-304',
};

// Autoclave de bancada (23/11/2026): defaults = a planilha do engenheiro (SERCON AHMC10, 56 L).
// P = PMTA-alvo 2,2 kgf/cm² em MPa. As hipóteses (S do inox, E = 0,70, C = 0,33) são da planilha
// e devem ser confirmadas pelo PLH.
const PADRAO_BANCADA: DadosAutoclaveBancada = {
  pressao: 0.2157,
  diametro: 300,
  tensao: 115.14,
  ef_costado: 0.7,
  ef_fundo: 0.7,
  ef_porta: 0.7,
  ca: 0,
  t_costado: 0,
  t_fundo: 0,
  t_porta1: 0,
  t_porta2: 0,
  c_porta: 0.33,
  nerv_b: 0,
  nerv_h: 0,
  nerv_n: 0,
  vao_real: '',
  sigma_escoamento: 0,
  material: 'SA-240 TP 304',
};

function chaveDados(tag: string, subtipo: string): string {
  return `nr13_autoclave_dados_${subtipo}_${tag}`;
}

export function carregarDadosAutoclave(tag: string, subtipo: SubtipoAutoclaveMemorial): DadosAutoclave {
  const salvo = ler<DadosAutoclave>(chaveDados(tag, subtipo));
  const padrao =
    subtipo === 'retangular'
      ? PADRAO_RETANGULAR
      : subtipo === 'vertical'
        ? PADRAO_VERTICAL
        : subtipo === 'bancada'
          ? PADRAO_BANCADA
          : PADRAO_CILINDRICA;
  return { ...padrao, ...salvo } as DadosAutoclave;
}

export async function salvarDadosAutoclave(tag: string, subtipo: SubtipoAutoclaveMemorial, dados: DadosAutoclave): Promise<void> {
  await salvar(chaveDados(tag, subtipo), dados);
}

export function calcularAutoclave(subtipo: SubtipoAutoclaveMemorial, dados: DadosAutoclave): ResultadoCalculo {
  if (subtipo === 'retangular') return retangular(dados);
  if (subtipo === 'vertical') return vertical(dados as DadosAutoclaveVertical);
  if (subtipo === 'bancada') return bancada(dados as unknown as DadosAutoclaveBancada);
  return cilindrica(dados);
}

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// Fórmulas (texto) usadas pelo cálculo de cada subtipo — para injeção na folha RESUMO-MEMORIAL.html.
// Cilíndrica: ASME VIII Div.1 UG-27(c)(1) (junta circunferencial — forma governante do casco).
// Retangular: ASME VIII Div.1 UG-47 (placa plana estaiada por tirantes).
const FORMULAS_CILINDRICA: [string, string] = [
  't = P·R / (S·E − 0,6·P)',
  'PMTA = S·E·t / (R + 0,6·t)',
];
const FORMULAS_RETANGULAR: [string, string] = [
  't = a·√(P / (S·C))',
  'PMTA = S·C·(t_real/a)²',
];

// Monta o array `componentes[]` consumido pelo RESUMO-MEMORIAL.html a partir dos dados de entrada
// e do resultado do cálculo. Campos sem fonte no subtipo (ex.: E/D/raio/ca na retangular) ficam null
// (o RESUMO já exibe "--"). Mesmo formato dos builders de vaso/caldeira.
const FORMULAS_VERTICAL: Record<'tampo' | 'costado' | 'fundoPlano' | 'fundoConico', [string, string]> = {
  tampo: ['t = D·√(C·P/(S·E))', 'PMTA = (S·E/C)·(t/D)²'],
  costado: ['t = P·R/(S·E − 0,6·P)', 'PMTA = S·E·t/(R + 0,6·t)'],
  fundoPlano: ['t = D·√(C·P/(S·E))', 'PMTA = (S·E/C)·(t/D)²'],
  fundoConico: ['t = P·D/(2·cos α·(S·E − 0,6·P))', 'PMTA = t·S·E/((D/2cos α) + 0,6·t)'],
};

// Linhas de componente da autoclave vertical p/ o RESUMO-MEMORIAL: recalcula os valores por
// componente com as MESMAS fórmulas de calc/autoclave.vertical() (que só devolve o agregado).
function componentesVertical(dados: DadosAutoclaveVertical, resultado: ResultadoCalculo): ComponenteResumo[] {
  const P = Number(dados.pressao);
  const D = Number(dados.diametro);
  const R = D / 2;
  const S = Number(dados.tensao);
  const E = Number(dados.eficiencia ?? 1) || 1;
  const CA = Number(dados.ca ?? 0) || 0;
  const C = Number(dados.c_fator ?? 0.33) || 0.33;
  const treqTampo = D * Math.sqrt((C * P) / (S * E));
  const pmtaTampo = ((S * E) / C) * Math.pow((Number(dados.t_tampo) - CA) / D, 2);
  const treqCost = (P * R) / (S * E - 0.6 * P);
  const tuCost = Number(dados.t_costado) - CA;
  const pmtaCost = (S * E * tuCost) / (R + 0.6 * tuCost);
  // Fundo pelo MESMO cálculo do memorial (plano, cônico ou torisférico — 23/11/2026).
  const fundo = fundoVertical(dados);
  const treqFundo = fundo.treq;
  const pmtaFundo = fundo.pmta;
  const fFundo = fundo.formulas;
  const base = { E, S, D, raio: R, ca: CA, material: dados.material || null };
  void resultado;
  return [
    { nome: 'Tampo Plano Aparafusado (UG-34)', pmtaMpa: pmtaTampo, tReqMm: treqTampo, tNom: num(dados.t_tampo), ...base, formulaT: FORMULAS_VERTICAL.tampo[0], formulaP: FORMULAS_VERTICAL.tampo[1] },
    { nome: 'Costado Cilíndrico (UG-27)', pmtaMpa: pmtaCost, tReqMm: treqCost, tNom: num(dados.t_costado), ...base, formulaT: FORMULAS_VERTICAL.costado[0], formulaP: FORMULAS_VERTICAL.costado[1] },
    { nome: fundo.nome, pmtaMpa: pmtaFundo, tReqMm: treqFundo, tNom: num(dados.t_fundo), ...base, formulaT: fFundo[0], formulaP: fFundo[1] },
  ];
}

/** 4 casas: o RESUMO imprimia "1.1612316599254502" (23/11/2026). */
const r4 = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(4)) : v);

function componentesAutoclave(
  subtipo: SubtipoAutoclaveMemorial,
  dados: DadosAutoclave,
  resultado: ResultadoCalculo,
): ComponenteResumo[] {
  if (subtipo === 'vertical') {
    return componentesVertical(dados as DadosAutoclaveVertical, resultado).map((c) => ({
      ...c,
      pmtaMpa: r4(c.pmtaMpa as number),
      tReqMm: r4(c.tReqMm as number),
    }));
  }
  if (subtipo === 'bancada') {
    // Mesmo cálculo do memorial (calcularBancada) — 1 linha por componente.
    const d = dados as unknown as DadosAutoclaveBancada;
    const c = calcularBancada(d);
    const base = { S: c.S, D: c.D, raio: c.R, ca: c.CA, material: d.material || null };
    return [
      { nome: 'Costado Cilíndrico (UG-27)', pmtaMpa: r4(c.costado.pmta), tReqMm: r4(c.costado.tReq), tNom: num(d.t_costado), E: c.costado.E, ...base, formulaT: 't = P·R/(S·E − 0,6·P)', formulaP: 'PMTA = S·E·t/(R + 0,6·t)' },
      { nome: 'Fundo Torisférico (UG-32e)', pmtaMpa: r4(c.fundo.pmta), tReqMm: r4(c.fundo.tReq), tNom: num(d.t_fundo), E: c.fundo.E, ...base, formulaT: 't = P·L·M/(2·S·E − 0,2·P)', formulaP: 'PMTA = 2·S·E·t/(L·M + 0,2·t)' },
      { nome: 'Porta Plana Reforçada (UG-34)', pmtaMpa: r4(c.porta.pmta), tReqMm: r4(c.porta.tReq), tNom: c.porta.t1 + c.porta.t2, E: c.porta.E, ...base, formulaT: 't = d·√(C·P/(S·E))', formulaP: 'PMTA = (S·E/C)·(t/d)²' },
    ];
  }
  if (subtipo === 'cilindrica') {
    const D = num(dados.diametro);
    return [
      {
        nome: 'Casco Cilíndrico',
        pmtaMpa: num(resultado.pmta),
        tReqMm: num(resultado.t_min),
        tNom: num(dados.espessura),
        E: num(dados.eficiencia),
        S: num(dados.tensao),
        D,
        raio: D != null ? D / 2 : null,
        ca: num(dados.ca),
        material: dados.material || null,
        formulaT: FORMULAS_CILINDRICA[0],
        formulaP: FORMULAS_CILINDRICA[1],
      },
    ];
  }
  // Retangular (tirantes/stays): não há E, diâmetro nem CA mapeáveis para a tabela de componente.
  return [
    {
      nome: 'Corpo Retangular',
      pmtaMpa: num(resultado.pmta),
      tReqMm: num(resultado.t_min),
      tNom: num(dados.espessura),
      E: null,
      S: num(dados.tensao),
      D: null,
      raio: null,
      ca: null,
      material: dados.material || null,
      formulaT: FORMULAS_RETANGULAR[0],
      formulaP: FORMULAS_RETANGULAR[1],
    },
  ];
}

export async function salvarResultadoAutoclave(
  tag: string,
  subtipo: SubtipoAutoclaveMemorial,
  dados: DadosAutoclave,
  resultado: ResultadoCalculo,
): Promise<void> {
  const pmta = parseFloat(resultado.t_min) >= 0 ? parseFloat(resultado.pmta) : NaN;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resultado.pmta,
    // 4 casas em MPa (23/11/2026): autoclave de baixa pressão perdia precisão com 2 (0,35 × 0,3505).
    pth: Number.isFinite(pmta) ? (pmta * 1.3).toFixed(4) : '',
    ecasco: resultado.t_min,
    componentes: componentesAutoclave(subtipo, dados, resultado),
    memorialHTML: formatarMemorialHTML(resultado.log),
    logCalculo: resultado.log,
    resultado: resultado.resultado,
  });
  await atualizarCategoriaComPmta(tag, Number.isFinite(pmta) ? pmta : null);
}
