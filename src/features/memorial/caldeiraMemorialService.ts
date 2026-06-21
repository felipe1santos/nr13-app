import { ler, salvar } from '../../services/storage';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import {
  costado,
  espelhoEstaiado,
  espelhoNaoEstaiado,
  fornalhaOndulada,
  fundoElipticoVIII,
  fundoTorisfericoVIII,
  tampoAbaulado,
  tampoElipsoidal,
  tampoPlano,
  testeHidrostatico,
  tubo,
  tuboThinWall,
  type DadosCosto,
  type DadosFundoElipticoVIII,
  type DadosFundoTorisfericoVIII,
  type DadosTuboThinWall,
} from '../../calc/caldeira';
import type { ResultadoCalculo } from '../../calc/tipos';

export type AbaCaldeira = 'costado' | 'tampo' | 'espelho' | 'fornalha' | 'tubo';
export type SubtipoTampo = 'tampoAbaulado' | 'tampoElipsoidal' | 'tampoPlano';
export type SubtipoEspelho = 'espelhoEstaiado' | 'espelhoNaoEstaiado';

export interface TiposCaldeira {
  tampo: SubtipoTampo;
  espelho: SubtipoEspelho;
}

const PADROES: Record<AbaCaldeira, Record<string, unknown>> = {
  costado: { pressao: 0.78, tensao: 108, eficiencia: 0.7, diametro_externo: 1100, t_comercial: 8.68, ca: 1.5, temperatura: 300 },
  tampo: { pressao: 0.78, tensao: 108, raio_crown: 1100, w_solda: 1, t_comercial: 10, ca: 1.5, eficiencia: 1, diametro_medicao: 600, c_flat: 0.33 },
  espelho: { pressao: 0.78, tensao: 108, passo: 150, c_stay: 2.1, t_comercial: 10, ca: 1.5, diametro_medicao: 600, eficiencia: 1, c_flat: 0.33 },
  fornalha: { pressao: 0.78, diametro_medio: 800, t_comercial: 10, ca: 1.5, tipo_fornalha: 'fox' },
  tubo: { pressao: 0.78, tensao: 108, diametro_externo: 100, t_comercial: 6, ca: 1, e_fator: 0 },
};

export function chaveDadosCaldeira(tag: string, aba: AbaCaldeira): string {
  return `nr13_caldeira_dados_${aba}_${tag}`;
}

export function carregarDadosCaldeira(tag: string, aba: AbaCaldeira): Record<string, unknown> {
  const salvo = ler<Record<string, unknown>>(chaveDadosCaldeira(tag, aba));
  return { ...PADROES[aba], ...salvo };
}

export async function salvarDadosCaldeira(tag: string, aba: AbaCaldeira, dados: Record<string, unknown>): Promise<void> {
  await salvar(chaveDadosCaldeira(tag, aba), dados);
}

export function carregarTiposCaldeira(tag: string): TiposCaldeira {
  return ler<TiposCaldeira>(`nr13_caldeira_tipos_${tag}`) || { tampo: 'tampoAbaulado', espelho: 'espelhoEstaiado' };
}

export async function salvarTiposCaldeira(tag: string, tipos: TiposCaldeira): Promise<void> {
  await salvar(`nr13_caldeira_tipos_${tag}`, tipos);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calcularAbaCaldeira(aba: AbaCaldeira, tipos: TiposCaldeira, dados: any): ResultadoCalculo {
  if (aba === 'costado') return costado(dados);
  if (aba === 'tubo') return tubo(dados);
  if (aba === 'fornalha') return fornalhaOndulada(dados);
  if (aba === 'tampo') {
    if (tipos.tampo === 'tampoAbaulado') return tampoAbaulado(dados);
    if (tipos.tampo === 'tampoElipsoidal') return tampoElipsoidal(dados);
    return tampoPlano(dados);
  }
  // espelho
  return tipos.espelho === 'espelhoEstaiado' ? espelhoEstaiado(dados) : espelhoNaoEstaiado(dados);
}

export interface ResumoMemorialCaldeira {
  porAba: { aba: AbaCaldeira; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO';
  logCompleto: string[];
}

const ABAS: AbaCaldeira[] = ['costado', 'tampo', 'espelho', 'fornalha', 'tubo'];

export function calcularResumoCaldeira(tag: string, tipos: TiposCaldeira): ResumoMemorialCaldeira {
  const porAba = ABAS.map((aba) => ({
    aba,
    resultado: calcularAbaCaldeira(aba, tipos, carregarDadosCaldeira(tag, aba)),
  }));

  const pmtas = porAba.map((c) => parseFloat(c.resultado.pmta)).filter((n) => Number.isFinite(n));
  const pmtaFinal = pmtas.length > 0 ? Math.min(...pmtas) : null;

  const limitante = porAba.find((c) => parseFloat(c.resultado.pmta) === pmtaFinal);
  const tensaoLimitante = limitante ? parseFloat(String(carregarDadosCaldeira(tag, limitante.aba).tensao ?? 0)) : 0;

  const teste = pmtaFinal != null ? testeHidrostatico({ pmta: pmtaFinal, tensao_componente_limitante: tensaoLimitante }) : null;

  const resultado = porAba.every((c) => c.resultado.resultado === 'APROVADO') ? 'APROVADO' : 'REPROVADO';
  const logCompleto = porAba.flatMap((c) => c.resultado.log).concat(teste ? teste.log : []);

  return {
    porAba,
    pmtaFinal,
    pthFinal: teste ? parseFloat(teste.p_teste) : pmtaFinal != null ? pmtaFinal * 1.5 : null,
    resultado,
    logCompleto,
  };
}

export async function salvarResumoCaldeira(tag: string, resumo: ResumoMemorialCaldeira): Promise<void> {
  const costadoResultado = resumo.porAba.find((c) => c.aba === 'costado')?.resultado;
  const tampoResultado = resumo.porAba.find((c) => c.aba === 'tampo')?.resultado;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: costadoResultado?.t_min,
    etampo: tampoResultado?.t_min,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  });
}

// ─── CALDEIRA AQUATUBULAR ─────────────────────────────────────────────────────

export type TipoCaldeira = 'flamotubular' | 'aquatubular';

export type AbaAquatubular =
  | 'tubulaoSup'
  | 'tubulaoInf'
  | 'fundoEliptico'
  | 'fundoTorisferico'
  | 'tuboGerador'
  | 'superaquecedor'
  | 'economizador'
  | 'coletor';

export const ABAS_AQUATUBULAR: AbaAquatubular[] = [
  'tubulaoSup',
  'tubulaoInf',
  'fundoEliptico',
  'fundoTorisferico',
  'tuboGerador',
  'superaquecedor',
  'economizador',
  'coletor',
];

export const ROTULOS_AQUATUBULAR: Record<AbaAquatubular, string> = {
  tubulaoSup: 'Tubulão Superior',
  tubulaoInf: 'Tubulão Inferior',
  fundoEliptico: 'Fundo Elíptico 2:1',
  fundoTorisferico: 'Fundo Torisférico',
  tuboGerador: 'Tubos Geradores',
  superaquecedor: 'Superaquecedor',
  economizador: 'Economizador',
  coletor: 'Coletores',
};

const PADROES_AQUATUBULAR: Record<AbaAquatubular, Record<string, unknown>> = {
  tubulaoSup:     { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 400, t_comercial: 12, ca: 1.5, temperatura: 300 },
  tubulaoInf:     { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 350, t_comercial: 10, ca: 1.5, temperatura: 300 },
  fundoEliptico:  { pressao: 3, tensao: 108, eficiencia: 0.85, diametro: 400, t_comercial: 12, ca: 1.5 },
  fundoTorisferico:{ pressao: 3, tensao: 108, eficiencia: 0.85, diametro: 400, raio_crown: 400, t_comercial: 12, ca: 1.5 },
  tuboGerador:    { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5 },
  superaquecedor: { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5 },
  economizador:   { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5 },
  coletor:        { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 150, t_comercial: 8, ca: 1.5, temperatura: 300 },
};

const NOMES_COMPONENTE: Record<AbaAquatubular, string> = {
  tubulaoSup:     'TUBULÃO SUPERIOR',
  tubulaoInf:     'TUBULÃO INFERIOR',
  fundoEliptico:  'FUNDO ELÍPTICO 2:1',
  fundoTorisferico:'FUNDO TORISFÉRICO',
  tuboGerador:    'TUBOS GERADORES',
  superaquecedor: 'SUPERAQUECEDOR',
  economizador:   'ECONOMIZADOR',
  coletor:        'COLETORES',
};

export function carregarTipoCaldeira(tag: string): TipoCaldeira {
  return ler<TipoCaldeira>(`nr13_caldeira_tipo_${tag}`) || 'flamotubular';
}

export async function salvarTipoCaldeira(tag: string, tipo: TipoCaldeira): Promise<void> {
  await salvar(`nr13_caldeira_tipo_${tag}`, tipo);
}

export function carregarDadosAqua(tag: string, aba: AbaAquatubular): Record<string, unknown> {
  const salvo = ler<Record<string, unknown>>(`nr13_caldeira_aqua_${aba}_${tag}`);
  return { ...PADROES_AQUATUBULAR[aba], ...salvo };
}

export async function salvarDadosAqua(tag: string, aba: AbaAquatubular, dados: Record<string, unknown>): Promise<void> {
  await salvar(`nr13_caldeira_aqua_${aba}_${tag}`, dados);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calcularAbaAqua(aba: AbaAquatubular, dados: any): ResultadoCalculo {
  const nome = NOMES_COMPONENTE[aba];
  if (aba === 'tubulaoSup' || aba === 'tubulaoInf' || aba === 'coletor') {
    return costado(dados as DadosCosto, nome);
  }
  if (aba === 'fundoEliptico') return fundoElipticoVIII(dados as DadosFundoElipticoVIII);
  if (aba === 'fundoTorisferico') return fundoTorisfericoVIII(dados as DadosFundoTorisfericoVIII);
  return tuboThinWall(dados as DadosTuboThinWall, nome);
}

export interface ResumoMemorialAqua {
  porAba: { aba: AbaAquatubular; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO';
  logCompleto: string[];
}

export function calcularResumoAqua(tag: string): ResumoMemorialAqua {
  const porAba = ABAS_AQUATUBULAR.map((aba) => ({
    aba,
    resultado: calcularAbaAqua(aba, carregarDadosAqua(tag, aba)),
  }));

  const pmtas = porAba.map((c) => parseFloat(c.resultado.pmta)).filter((n) => Number.isFinite(n));
  const pmtaFinal = pmtas.length > 0 ? Math.min(...pmtas) : null;

  const limitante = porAba.find((c) => parseFloat(c.resultado.pmta) === pmtaFinal);
  const tensaoLimitante = limitante
    ? parseFloat(String(carregarDadosAqua(tag, limitante.aba).tensao ?? 0))
    : 0;
  const teste = pmtaFinal != null ? testeHidrostatico({ pmta: pmtaFinal, tensao_componente_limitante: tensaoLimitante }) : null;

  const resultado = porAba.every((c) => c.resultado.resultado === 'APROVADO') ? 'APROVADO' : 'REPROVADO';
  const logCompleto = porAba.flatMap((c) => c.resultado.log).concat(teste ? teste.log : []);

  return {
    porAba,
    pmtaFinal,
    pthFinal: teste ? parseFloat(teste.p_teste) : pmtaFinal != null ? pmtaFinal * 1.5 : null,
    resultado,
    logCompleto,
  };
}

export async function salvarResumoAqua(tag: string, resumo: ResumoMemorialAqua): Promise<void> {
  const tubulao = resumo.porAba.find((c) => c.aba === 'tubulaoSup')?.resultado;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: tubulao?.t_min,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  });
}
