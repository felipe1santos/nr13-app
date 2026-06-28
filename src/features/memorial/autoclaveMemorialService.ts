import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
import type { ComponenteResumo } from './caldeiraMemorialService';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import { cilindrica, retangular, type DadosAutoclaveCilindrica, type DadosAutoclaveRetangular } from '../../calc/autoclave';
import type { ResultadoCalculo } from '../../calc/tipos';

export type DadosAutoclave = DadosAutoclaveRetangular & DadosAutoclaveCilindrica;

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

function chaveDados(tag: string, subtipo: string): string {
  return `nr13_autoclave_dados_${subtipo}_${tag}`;
}

export function carregarDadosAutoclave(tag: string, subtipo: 'retangular' | 'cilindrica'): DadosAutoclave {
  const salvo = ler<DadosAutoclave>(chaveDados(tag, subtipo));
  const padrao = subtipo === 'retangular' ? PADRAO_RETANGULAR : PADRAO_CILINDRICA;
  return { ...padrao, ...salvo } as DadosAutoclave;
}

export async function salvarDadosAutoclave(tag: string, subtipo: 'retangular' | 'cilindrica', dados: DadosAutoclave): Promise<void> {
  await salvar(chaveDados(tag, subtipo), dados);
}

export function calcularAutoclave(subtipo: 'retangular' | 'cilindrica', dados: DadosAutoclave): ResultadoCalculo {
  return subtipo === 'retangular' ? retangular(dados) : cilindrica(dados);
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
function componentesAutoclave(
  subtipo: 'retangular' | 'cilindrica',
  dados: DadosAutoclave,
  resultado: ResultadoCalculo,
): ComponenteResumo[] {
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
  subtipo: 'retangular' | 'cilindrica',
  dados: DadosAutoclave,
  resultado: ResultadoCalculo,
): Promise<void> {
  const pmta = parseFloat(resultado.t_min) >= 0 ? parseFloat(resultado.pmta) : NaN;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resultado.pmta,
    pth: Number.isFinite(pmta) ? (pmta * 1.3).toFixed(2) : '',
    ecasco: resultado.t_min,
    componentes: componentesAutoclave(subtipo, dados, resultado),
    memorialHTML: formatarMemorialHTML(resultado.log),
    logCalculo: resultado.log,
    resultado: resultado.resultado,
  });
  await atualizarCategoriaComPmta(tag, Number.isFinite(pmta) ? pmta : null);
}
