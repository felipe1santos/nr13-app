import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
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
};

const PADRAO_CILINDRICA: DadosAutoclaveCilindrica = {
  pressao: 1.5,
  tensao: 137.9,
  eficiencia: 0.85,
  diametro: 1000,
  espessura: 12,
  ca: 1.5,
  sigma_escoamento: 0,
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

export async function salvarResultadoAutoclave(tag: string, resultado: ResultadoCalculo): Promise<void> {
  const pmta = parseFloat(resultado.t_min) >= 0 ? parseFloat(resultado.pmta) : NaN;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resultado.pmta,
    pth: Number.isFinite(pmta) ? (pmta * 1.3).toFixed(2) : '',
    ecasco: resultado.t_min,
    memorialHTML: formatarMemorialHTML(resultado.log),
    logCalculo: resultado.log,
    resultado: resultado.resultado,
  });
  await atualizarCategoriaComPmta(tag, Number.isFinite(pmta) ? pmta : null);
}
