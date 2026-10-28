/**
 * O MODELO DO RELATÓRIO DE CALDEIRA FLAMOTUBULAR (22/10/2026).
 *
 * Parte do modelo COMUM (`montarModeloRelatorio`) — capa, empresa, assinantes,
 * exames visuais, TH, acumulação, ultrassom de vaso e livro já vêm resolvidos
 * por ele, das mesmas fontes — e acrescenta só o que é da caldeira:
 * `nr13_ficha_caldeira_<TAG>`, a grade de medição de caldeira, a verificação
 * pela espessura medida, a categoria A/B, os ensaios realizados com nº e laudo,
 * os dispositivos de segurança (indicador de pressão, PSV, pressostato) com o
 * status de calibração e os nºs rastreáveis de cada documento interno.
 *
 * Função síncrona e sem desenho: o teste a alcança sem jsPDF.
 */
import { ler } from '../../../services/storage';
import type { ModeloRelatorio } from './modelo';
import { numeroDoStorage, textoOu } from './modelo';
import { carregarDadosCaldeira, type DadosCaldeira } from '../../caldeira/dadosCaldeira';
import { extremosCaldeira, minimaDaRegiao, temMedicaoCaldeira, type ExtremosRegiao, type MedicaoCaldeira } from '../../caldeira/medicaoCaldeira';
import { categoriaCaldeira, rotuloCategoriaCaldeira } from '../../caldeira/categoriaCaldeira';
import {
  pmtaCorpoPelaEspessura,
  pmtaEspelhoPelaEspessura,
  tMinCorpo,
  tMinEspelho,
  veredicto,
  type VeredictoVerificacao,
} from '../../../calc/caldeiraVerificacao';
import { emCincoUnidades, formatarPressao, type UnidadePressao } from '../../../calc/pressaoCincoUnidades';
import { acumulacaoPreenchida, tipoDoEquipamento, type DadosAcumulacao } from '../../inspecoes/acumulacao';
import type { InfoEquipamento } from '../../equipamento/tipos';
import { listarCalibracoes } from '../../calibracoes/calibracaoService';
import { ehOficial, type DadosCalibracao } from '../../calibracoes/tipos';
import { diaDe } from '../../calibracoes/quadroInstrumentos';
import { numeroDoRelatorio, type RelatorioMeta } from '../tipos';

export const UNIDADES_QUATRO: UnidadePressao[] = ['MPa', 'psi', 'kgf/cm²', 'bar'];

export interface PressaoQuatro {
  mpa: number | null;
  valores: Record<UnidadePressao, string> | null;
}

export interface EtapaVerificacao {
  nome: string;
  formulaP: string;
  formulaT: string;
  /** Linhas "PARÂMETRO | valor" da folha. */
  parametros: [string, string][];
  tMedido: number | null;
  /** De onde veio a espessura: a mínima da medição ou a do memorial. */
  fonteEspessura: 'medicao' | 'memorial' | null;
  pmtaMedida: PressaoQuatro;
  tMin: number | null;
  veredicto: VeredictoVerificacao;
}

export interface LinhaEnsaio {
  id: string;
  nome: string;
  feito: boolean;
  laudo: string | null;
  numero: string | null;
}

export interface LinhaDispositivo {
  id: string;
  nome: string;
  possui: boolean;
  calibrado: 'Sim' | 'Não' | null;
  numero: string | null;
}

export interface ModeloCaldeira {
  base: ModeloRelatorio;
  /** "Caldeira Flamotubular" — tipo + subtipo, como a referência escreve. */
  tipoTexto: string | null;
  codigo: string | null;
  /** O nº rastreável de um documento interno: código + sufixo. */
  rastreavel: (sufixo: string) => string | null;
  dados: DadosCaldeira;
  pmo: PressaoQuatro;
  pmta: PressaoQuatro;
  pth: PressaoQuatro;
  categoria: string | null;
  medicao: MedicaoCaldeira | null;
  extremos: ExtremosRegiao[];
  calculos: EtapaVerificacao[];
  ensaios: LinhaEnsaio[];
  dispositivos: LinhaDispositivo[];
  acumulacaoFeita: boolean;
  /** Há prontuário de fabricação anexável (PDF do fabricante ou prontuário anexado)? */
  temFabricacao: boolean;
  tipoInspecao: string | null;
  dataEmissao: string | null;
}

function pressao(mpa: number | null): PressaoQuatro {
  const todas = emCincoUnidades(mpa, 'MPa');
  if (!todas) return { mpa: null, valores: null };
  const valores = Object.fromEntries(
    UNIDADES_QUATRO.map((u) => [u, formatarPressao(todas[u], u === 'MPa' ? 'MPa' : u === 'psi' ? 'psi' : u)]),
  ) as Record<UnidadePressao, string>;
  // MPa com 2 casas no prontuário (a referência: 0,99 · 1,10 · 1,65); psi com 2.
  valores.MPa = todas.MPa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  valores.psi = todas.psi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  return { mpa, valores };
}

const mm = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const RESULTADO: Record<string, string> = { aprovado: 'Aprovado', reprovado: 'Reprovado' };

function rotuloLaudo(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return RESULTADO[t] ?? null;
}

interface MemorialCaldeira {
  P?: unknown;
  costado?: { S?: unknown; E?: unknown; D?: unknown; C?: unknown; y?: unknown; espEncontrada?: unknown };
  espelho?: { S?: unknown; passo?: unknown; cEstais?: unknown; espEncontrada?: unknown };
}

/** Calibração mais recente de cada instrumento (por componente ou série) de um tipo. */
function maisRecentes(lista: DadosCalibracao[]): DadosCalibracao[] {
  const porItem = new Map<string, DadosCalibracao>();
  for (const c of lista) {
    const chave = c.componenteId || c.serie || c.id;
    const atual = porItem.get(chave);
    const d = diaDe(c.dataCalibracao) ?? 0;
    if (!atual || d >= (diaDe(atual.dataCalibracao) ?? 0)) porItem.set(chave, c);
  }
  return [...porItem.values()];
}

function linhasDispositivo(
  oficiais: DadosCalibracao[],
  tipos: string[],
  nome: string,
  idBase: string,
  dataRef: string | null,
  /** Quantos deste dispositivo a FICHA da caldeira declara (identificação preenchida). */
  naFicha = 0,
): LinhaDispositivo[] {
  let cals: DadosCalibracao[];
  try {
    cals = maisRecentes(oficiais.filter((c) => tipos.includes(c.tipo)));
  } catch {
    cals = [];
  }
  if (cals.length === 0) {
    // Sem calibração registrada: "possui" vem da ficha; calibrado fica sem
    // resposta (não há certificado para afirmar nem negar).
    const n = Math.max(1, naFicha);
    return Array.from({ length: n }, (_, i) => ({
      id: `${idBase}-${i + 1}`,
      nome: `${nome} - ${String(i + 1).padStart(2, '0')}`,
      possui: i < naFicha,
      calibrado: null,
      numero: null,
    }));
  }
  const ref = diaDe(dataRef);
  return cals.slice(0, 4).map((c, i) => {
    const val = diaDe(c.dataProxCalibracao);
    const calibrado =
      c.statusConclusao === 'reprovado' ? 'Não' : val === null ? null : ref !== null && val < ref ? 'Não' : 'Sim';
    return {
      id: `${idBase}-${i + 1}`,
      nome: `${nome} - ${String(i + 1).padStart(2, '0')}`,
      possui: true,
      calibrado,
      numero: c.numeroCertificado || null,
    };
  });
}

export function montarModeloCaldeira(
  tag: string,
  base: ModeloRelatorio,
  meta: RelatorioMeta | null,
  injecao: Record<string, unknown>,
): ModeloCaldeira {
  const info = ler<Record<string, unknown>>(`nr13_info_${tag}`) ?? {};
  const calc = ler<{ pmta?: unknown; pth?: unknown }>(`nr13_calc_${tag}`) ?? {};
  const memorial = ler<MemorialCaldeira>(`nr13_vaso_cald_${tag}`) ?? {};
  const dados = carregarDadosCaldeira(tag);
  const codigo = numeroDoRelatorio(meta).trim() || null;
  const rastreavel = (sufixo: string) => (codigo ? `${codigo}/${sufixo}` : null);

  const pmtaMpa = numeroDoStorage(info.pmtaAdotadaMpa) ?? numeroDoStorage(calc.pmta);
  const pthMpa = numeroDoStorage(info.pthAdotadaMpa) ?? numeroDoStorage(calc.pth);
  const pmoMpa = numeroDoStorage(info.pmoAdotadaMpa);

  const us = (injecao.ultrassom ?? {}) as { caldeira?: MedicaoCaldeira; resultado?: unknown; medidas?: unknown };
  const medicao = us.caldeira && temMedicaoCaldeira(us.caldeira) ? us.caldeira : null;

  // ── Verificação pela espessura medida ──────────────────────────────────
  const cos = memorial.costado ?? {};
  const esp = memorial.espelho ?? {};
  const corpo = {
    S: numeroDoStorage(cos.S) ?? 0,
    E: numeroDoStorage(cos.E) ?? 0,
    D: numeroDoStorage(cos.D) ?? 0,
    c: numeroDoStorage(cos.C) ?? 0,
    y: numeroDoStorage(cos.y) ?? 0.4,
  };
  const espelho = {
    S: numeroDoStorage(esp.S) ?? 0,
    C: numeroDoStorage(esp.cEstais) ?? 2.2,
    p: numeroDoStorage(esp.passo) ?? 0,
    c: 0,
  };
  const espessura = (regiao: Parameters<typeof minimaDaRegiao>[1], doMemorial: unknown) => {
    const medida = minimaDaRegiao(medicao, regiao);
    if (medida !== null) return { t: medida, fonte: 'medicao' as const };
    const m = numeroDoStorage(doMemorial);
    return m !== null ? { t: m, fonte: 'memorial' as const } : { t: null, fonte: null };
  };

  const tCorpo = espessura('corpo', cos.espEncontrada);
  const pCorpo = tCorpo.t !== null ? pmtaCorpoPelaEspessura(corpo, tCorpo.t) : null;
  const etapaCorpo: EtapaVerificacao = {
    nome: 'Corpo',
    formulaP: 'P = 2·S·E·(t − c) / (D − 2·y·(t − c))',
    formulaT: 't = P·D / (2·S·E + 2·y·P) + c',
    parametros: [
      ['TENSÃO ADMISSÍVEL DO MATERIAL — S (MPa)', mm(corpo.S || null)],
      ['ESPESSURA MÍNIMA MENSURADA — t (mm)', mm(tCorpo.t)],
      ['COEFICIENTE DE TEMPERATURA — y', mm(corpo.y || null)],
      ['EFICIÊNCIA DE JUNTA — E', mm(corpo.E || null)],
      ['DIÂMETRO EXTERNO — D (mm)', mm(corpo.D || null)],
      ['MARGEM DE CORROSÃO — c (mm)', mm(corpo.c)],
    ],
    tMedido: tCorpo.t,
    fonteEspessura: tCorpo.fonte,
    pmtaMedida: pressao(pCorpo),
    tMin: pmtaMpa !== null ? tMinCorpo(corpo, pmtaMpa) : null,
    veredicto: veredicto(pCorpo, pmtaMpa),
  };

  const etapaEspelho = (nome: string, regiao: 'espelhoDianteiro' | 'espelhoTraseiro', doMemorial: unknown): EtapaVerificacao => {
    const t = espessura(regiao, doMemorial);
    const p = t.t !== null ? pmtaEspelhoPelaEspessura(espelho, t.t) : null;
    return {
      nome,
      formulaP: 'P = t²·S·C / p²',
      formulaT: 't = p·√(P / (S·C))',
      parametros: [
        ['TENSÃO ADMISSÍVEL DO MATERIAL — S (MPa)', mm(espelho.S || null)],
        ['ESPESSURA MÍNIMA MENSURADA — t (mm)', mm(t.t)],
        ['DISTÂNCIA ENTRE ESTAIS/TUBOS — p (mm)', mm(espelho.p || null)],
        ['CONSTANTE DOS ESTAIS — C', mm(espelho.C)],
      ],
      tMedido: t.t,
      fonteEspessura: t.fonte,
      pmtaMedida: pressao(p),
      tMin: pmtaMpa !== null ? tMinEspelho(espelho, pmtaMpa) : null,
      veredicto: veredicto(p, pmtaMpa),
    };
  };
  // Sem medição do traseiro, o memorial (um espelho só) vale para os dois — e a
  // folha diz de onde veio a espessura.
  const calculos = [
    etapaCorpo,
    etapaEspelho('Espelho dianteiro', 'espelhoDianteiro', esp.espEncontrada),
    etapaEspelho('Espelho traseiro', 'espelhoTraseiro', esp.espEncontrada),
  ];

  // ── Ensaios realizados — com nº rastreável e laudo por ensaio ──────────
  const th = (injecao.th ?? {}) as Record<string, unknown>;
  const acum = injecao.acumulacao as Partial<DadosAcumulacao> | undefined;
  const acumulacaoFeita = !!acum && acumulacaoPreenchida(acum);
  const temMedicao = medicao !== null || (base.ultrassom?.pontos?.some((p) => p.medidas.some((v) => v && v !== '—')) ?? false);
  const ensaios: LinhaEnsaio[] = [
    { id: 'espessura', nome: 'Medição de espessura por ultrassom', feito: temMedicao, laudo: temMedicao ? rotuloLaudo(us.resultado) : null, numero: temMedicao ? rastreavel('ME') : null },
    {
      id: 'th',
      nome: 'Teste hidrostático',
      feito: !!(typeof th.pressaoTeste === 'string' && th.pressaoTeste.trim()) || !!rotuloLaudo(th.resultado),
      laudo: rotuloLaudo(th.resultado),
      numero: null,
    },
    { id: 'estanqueidade', nome: 'Estanqueidade', feito: false, laudo: null, numero: null },
    { id: 'acumulacao', nome: 'Ensaio de acumulação', feito: acumulacaoFeita, laudo: acumulacaoFeita ? rotuloLaudo(acum?.resultado) : null, numero: acumulacaoFeita ? rastreavel('EA') : null },
    { id: 'alimentacao', nome: 'Ensaio dos dispositivos de alimentação de água', feito: false, laudo: null, numero: null },
  ];
  ensaios[1].numero = ensaios[1].feito ? rastreavel('TS') : null;

  const dataRef = meta?.execucaoInspecao || meta?.emissao || null;
  const preenchido = (grupo: string) => {
    const g = dados[grupo];
    return !!g && typeof g === 'object' && Object.values(g).some((v) => typeof v === 'string' && v.trim() !== '' && v.trim() !== '---');
  };
  // Uma leitura da lista por modelo, filtrada por tipo em cada linha.
  let oficiais: DadosCalibracao[];
  try {
    oficiais = listarCalibracoes(tag).filter((c) => ehOficial(c));
  } catch {
    oficiais = [];
  }
  const dispositivos = [
    ...linhasDispositivo(oficiais, ['manometro'], 'Indicador de pressão', 'pi', dataRef, preenchido('indicadorPressao') ? 1 : 0),
    ...linhasDispositivo(
      oficiais,
      ['psv'],
      'Dispositivo de segurança (PSV)',
      'psv',
      dataRef,
      (preenchido('alivio1') ? 1 : 0) + (preenchido('alivio2') ? 1 : 0),
    ),
    ...linhasDispositivo(oficiais, ['pressostato'], 'Pressostato', 'ps', dataRef),
  ];

  return {
    base,
    tipoTexto: tipoDoEquipamento(info as unknown as InfoEquipamento),
    codigo,
    rastreavel,
    dados,
    pmo: pressao(pmoMpa),
    pmta: pressao(pmtaMpa),
    pth: pressao(pthMpa),
    categoria: rotuloCategoriaCaldeira(categoriaCaldeira(pmoMpa)),
    medicao,
    extremos: extremosCaldeira(medicao),
    calculos,
    ensaios,
    dispositivos,
    acumulacaoFeita,
    temFabricacao: false,
    tipoInspecao: textoOu(meta?.tipoInspecao ?? null, '') || null,
    dataEmissao: textoOu(meta?.emissao ?? null, '') || null,
  };
}
