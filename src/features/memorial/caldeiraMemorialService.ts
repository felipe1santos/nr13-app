import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
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
  costado: { pressao: 0.78, tensao: 108, eficiencia: 0.7, diametro_externo: 1100, t_comercial: 8.68, ca: 1.5, temperatura: 300, material: 'SA-516-70' },
  tampo: { pressao: 0.78, tensao: 108, raio_crown: 1100, w_solda: 1, t_comercial: 10, ca: 1.5, eficiencia: 1, diametro_medicao: 600, c_flat: 0.33, material: 'SA-516-70' },
  espelho: { pressao: 0.78, tensao: 108, passo: 150, c_stay: 2.1, t_comercial: 10, ca: 1.5, diametro_medicao: 600, eficiencia: 1, c_flat: 0.33, material: 'SA-516-70' },
  fornalha: { pressao: 0.78, diametro_medio: 800, t_comercial: 10, ca: 1.5, tipo_fornalha: 'fox', material: 'SA-285-C' },
  tubo: { pressao: 0.78, tensao: 108, diametro_externo: 100, t_comercial: 6, ca: 1, e_fator: 0, material: 'SA-178-A' },
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

// Dados estruturados por componente — consumidos pela folha RESUMO-MEMORIAL.html (linhas dinâmicas),
// evitando parse frágil do log. Vale para caldeira, vaso e autoclave (cada serviço monta o seu).
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

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const ROTULO_ABA_FLAMO: Record<string, string> = {
  costado: 'Costado',
  fornalha: 'Fornalha Ondulada',
  tubo: 'Tubos de Fogo',
  tampoAbaulado: 'Tampo Abaulado',
  tampoElipsoidal: 'Tampo Elipsoidal 2:1',
  tampoPlano: 'Tampo Plano',
  espelhoEstaiado: 'Espelho Estaiado',
  espelhoNaoEstaiado: 'Espelho Não-Estaiado',
};

// Fórmulas (texto) por tipo de componente de caldeira — ASME Sec. I.
const FORMULAS_FLAMO: Record<string, [string, string]> = {
  costado: ['t = P·D / (2·S·E + 2·y·P) + C', 'PMTA = 2·S·E·t / (D − 2·y·t)'],
  tubo: ['t = P·D / (2·S + P) + 0,005·D + e', 'PMTA = S·(2·t − 0,01·D − 2·e) / D'],
  fornalha: ['t = (P·D + 1,03) / 14,0 (Fox/Adamson)', 'PMTA conforme C do tipo de fornalha'],
  tampoAbaulado: ['t = 5·P·L / (4,8·S·w)', 'PMTA = 4,8·S·w·t / (5·L)'],
  tampoElipsoidal: ['t = P·D / (2·S·E + 2·y·P) + C', 'PMTA = 2·S·E·t / (D − 2·y·t)'],
  tampoPlano: ['t = d·√(C·P/S)', 'PMTA = S·(t/d)²/C'],
  espelhoEstaiado: ['t = p·√(C·P/S)', 'PMTA = S·(t/p)²/C'],
  espelhoNaoEstaiado: ['t = d·√(C·P/S)', 'PMTA = S·(t/d)²/C'],
};

function chaveTipoFlamo(aba: AbaCaldeira, tipos: TiposCaldeira): string {
  if (aba === 'tampo') return tipos.tampo;
  if (aba === 'espelho') return tipos.espelho;
  return aba; // costado | fornalha | tubo
}

function componentesFlamo(tag: string, tipos: TiposCaldeira, resumo: ResumoMemorialCaldeira): ComponenteResumo[] {
  return resumo.porAba.map(({ aba, resultado }) => {
    const d = carregarDadosCaldeira(tag, aba);
    const chave = chaveTipoFlamo(aba, tipos);
    const D = num(d.diametro_externo) ?? num(d.diametro_medio) ?? num((d as Record<string, unknown>).diametro);
    const raio = num(d.raio_crown) ?? (D != null ? D / 2 : null);
    const f = FORMULAS_FLAMO[chave] ?? ['', ''];
    return {
      nome: ROTULO_ABA_FLAMO[chave] ?? aba,
      pmtaMpa: num(resultado.pmta),
      tReqMm: num(resultado.t_min),
      tNom: num(d.t_comercial),
      E: num(d.eficiencia),
      S: num(d.tensao),
      D,
      raio,
      ca: num(d.ca),
      material: (d.material as string) || null,
      formulaT: f[0],
      formulaP: f[1],
    };
  });
}

export async function salvarResumoCaldeira(tag: string, resumo: ResumoMemorialCaldeira, tipos?: TiposCaldeira): Promise<void> {
  const tiposEf = tipos ?? carregarTiposCaldeira(tag);
  const costadoResultado = resumo.porAba.find((c) => c.aba === 'costado')?.resultado;
  const tampoResultado = resumo.porAba.find((c) => c.aba === 'tampo')?.resultado;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: costadoResultado?.t_min,
    etampo: tampoResultado?.t_min,
    componentes: componentesFlamo(tag, tiposEf, resumo),
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  });
  await atualizarCategoriaComPmta(tag, resumo.pmtaFinal);
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
  tubulaoSup:     { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 400, t_comercial: 12, ca: 1.5, temperatura: 300, material: 'SA-516-70' },
  tubulaoInf:     { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 350, t_comercial: 10, ca: 1.5, temperatura: 300, material: 'SA-516-70' },
  fundoEliptico:  { pressao: 3, tensao: 108, eficiencia: 0.85, diametro: 400, t_comercial: 12, ca: 1.5, material: 'SA-516-70' },
  fundoTorisferico:{ pressao: 3, tensao: 108, eficiencia: 0.85, diametro: 400, raio_crown: 400, t_comercial: 12, ca: 1.5, material: 'SA-516-70' },
  tuboGerador:    { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5, material: 'SA-178-A' },
  superaquecedor: { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5, material: 'SA-213-T11' },
  economizador:   { pressao: 3, tensao: 108, eficiencia: 1.0, diametro_externo: 38, t_comercial: 3, ca: 0.5, material: 'SA-178-A' },
  coletor:        { pressao: 3, tensao: 108, eficiencia: 0.85, diametro_externo: 150, t_comercial: 8, ca: 1.5, temperatura: 300, material: 'SA-106-B' },
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

const FORMULAS_AQUA: Record<string, [string, string]> = {
  cilindro: ['t = P·D / (2·S·E + 2·y·P) + C', 'PMTA = 2·S·E·t / (D − 2·y·t)'],
  fundo: ['t = P·D / (2·S·E − 0,2·P) + C', 'PMTA = 2·S·E·t / (D + 0,2·t)'],
  tubo: ['t = P·D / (2·S + P) + 0,005·D + e', 'PMTA = S·(2·t − 0,01·D) / D'],
};

function tipoAqua(aba: AbaAquatubular): 'cilindro' | 'fundo' | 'tubo' {
  if (aba === 'tubulaoSup' || aba === 'tubulaoInf' || aba === 'coletor') return 'cilindro';
  if (aba === 'fundoEliptico' || aba === 'fundoTorisferico') return 'fundo';
  return 'tubo';
}

function componentesAqua(tag: string, resumo: ResumoMemorialAqua): ComponenteResumo[] {
  return resumo.porAba.map(({ aba, resultado }) => {
    const d = carregarDadosAqua(tag, aba);
    const D = num(d.diametro_externo) ?? num((d as Record<string, unknown>).diametro);
    const raio = num(d.raio_crown) ?? (D != null ? D / 2 : null);
    const f = FORMULAS_AQUA[tipoAqua(aba)];
    return {
      nome: ROTULOS_AQUATUBULAR[aba],
      pmtaMpa: num(resultado.pmta),
      tReqMm: num(resultado.t_min),
      tNom: num(d.t_comercial),
      E: num(d.eficiencia),
      S: num(d.tensao),
      D,
      raio,
      ca: num(d.ca),
      material: (d.material as string) || null,
      formulaT: f[0],
      formulaP: f[1],
    };
  });
}

export async function salvarResumoAqua(tag: string, resumo: ResumoMemorialAqua): Promise<void> {
  const tubulao = resumo.porAba.find((c) => c.aba === 'tubulaoSup')?.resultado;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: tubulao?.t_min,
    componentes: componentesAqua(tag, resumo),
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  });
  await atualizarCategoriaComPmta(tag, resumo.pmtaFinal);
}
