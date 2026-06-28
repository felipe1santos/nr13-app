import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
import type { ComponenteResumo } from './caldeiraMemorialService';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import { calcularComponenteVaso } from '../../calc/vaso';
import type { DadosComponenteVaso, TipoComponenteVaso } from '../../calc/vaso';
import type { ResultadoCalculo } from '../../calc/tipos';

export interface ComponenteVasoSalvo {
  id: string;
  nome: string;
  tipo: TipoComponenteVaso;
  dados: DadosComponenteVaso;
}

export type OrientacaoVaso = 'vertical' | 'horizontal';

export interface VasoSalvo {
  tag: string;
  P: number;
  D: number;
  componentes: ComponenteVasoSalvo[];
  orientacao?: OrientacaoVaso;
}

export interface ResumoMemorialVaso {
  porComponente: { id: string; nome: string; tipo: TipoComponenteVaso; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO';
  logCompleto: string[];
}

// sufixo '' = vaso principal (nr13_vaso_<TAG>); 'gv' = gerador de vapor do autoclave (nr13_vaso_gv_<TAG>)
function chaveVaso(tag: string, sufixo: string): string {
  return sufixo ? `nr13_vaso_${sufixo}_${tag}` : `nr13_vaso_${tag}`;
}
function chaveCalc(tag: string, sufixo: string): string {
  return sufixo ? `nr13_calc_${sufixo}_${tag}` : `nr13_calc_${tag}`;
}

export function carregarVaso(tag: string, sufixo = ''): VasoSalvo {
  return ler<VasoSalvo>(chaveVaso(tag, sufixo)) || { tag, P: 1.5, D: 1000, componentes: [] };
}

export async function salvarVaso(tag: string, vaso: VasoSalvo, sufixo = ''): Promise<void> {
  await salvar(chaveVaso(tag, sufixo), vaso);
}

// Roda o motor calc/vaso.ts pra todos os componentes e consolida: PMTA do equipamento é o MENOR
// valor entre os componentes (cascos/tampos), PTH = 1.3 x PMTA (UG-99(b), mesmo teste do vaso/
// autoclave), aprovado só se TODOS os componentes (incluindo bocal/flange) estiverem aprovados.
export function calcularResumoVaso(vaso: VasoSalvo): ResumoMemorialVaso {
  const porComponente = vaso.componentes.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    resultado: calcularComponenteVaso(c.nome, c.tipo, c.dados, vaso.D, vaso.P),
  }));

  const pmtas = porComponente
    .map((c) => parseFloat(c.resultado.pmta))
    .filter((n) => Number.isFinite(n));
  const pmtaFinal = pmtas.length > 0 ? Math.min(...pmtas) : null;
  const pthFinal = pmtaFinal != null ? pmtaFinal * 1.3 : null;

  const resultado = porComponente.every((c) => c.resultado.resultado === 'APROVADO') ? 'APROVADO' : 'REPROVADO';
  const logCompleto = porComponente.flatMap((c) => c.resultado.log);

  return { porComponente, pmtaFinal, pthFinal, resultado, logCompleto };
}

const TIPOS_CASCO: TipoComponenteVaso[] = ['cilindrico', 'esferico'];
const TIPOS_TAMPO: TipoComponenteVaso[] = ['eliptico', 'toroesferico', 'esferico', 'plano', 'planoAparafusado', 'cone'];

const FORMULAS_VASO: Record<string, [string, string]> = {
  cilindrico: ['t = P·Ri / (S·E − 0,6·P)', 'PMTA = S·E·t / (Ri + 0,6·t)'],
  eliptico: ['t = P·D / (2·S·E − 0,2·P)', 'PMTA = 2·S·E·t / (D + 0,2·t)'],
  toroesferico: ['t = 0,885·P·L / (S·E − 0,1·P)', 'PMTA = S·E·t / (0,885·L + 0,1·t)'],
  esferico: ['t = P·R / (2·S·E − 0,2·P)', 'PMTA = 2·S·E·t / (R + 0,2·t)'],
  plano: ['t = d·C·√(P/S)', 'PMTA = S·(t/d)²/C'],
  planoAparafusado: ['t = G·√(C·P/S)', 'PMTA = S·(t/G)²/C'],
  cone: ['t = P·D / (2·cos α·(S·E − 0,6·P))', 'PMTA = 2·cos α·S·E·t / (D + 1,2·t·cos α)'],
};

function numV(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function salvarResumoVaso(tag: string, resumo: ResumoMemorialVaso, sufixo = ''): Promise<void> {
  const primeiroCasco = resumo.porComponente.find((c) => TIPOS_CASCO.includes(c.tipo));
  const primeiroTampo = resumo.porComponente.find((c) => TIPOS_TAMPO.includes(c.tipo));
  const vaso = carregarVaso(tag, sufixo);
  const D = numV(vaso.D);
  const componentes: ComponenteResumo[] = resumo.porComponente
    .filter((c) => c.tipo !== 'bocal' && c.tipo !== 'flange')
    .map((c) => {
      const dadosComp = vaso.componentes.find((x) => x.id === c.id)?.dados ?? {};
      const f = FORMULAS_VASO[c.tipo] ?? ['', ''];
      return {
        nome: c.nome,
        pmtaMpa: numV(c.resultado.pmta),
        tReqMm: numV(c.resultado.t_min),
        tNom: numV(dadosComp.t_comercial),
        E: numV(dadosComp.E),
        S: numV(dadosComp.S),
        D,
        raio: D != null ? D / 2 : null,
        ca: numV(dadosComp.ca),
        material: dadosComp.mat || null,
        formulaT: f[0],
        formulaP: f[1],
      };
    });
  const payload = {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: primeiroCasco?.resultado.t_min,
    etampo: primeiroTampo?.resultado.t_min,
    componentes,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  };
  await salvar(chaveCalc(tag, sufixo), payload);
  // Sub-componentes (ac_corpo, gv) também atualizam a chave principal para que
  // Equipamento.tsx mostre o botão "Ver Memorial" e a PMTA corretos.
  if (sufixo) {
    await salvar(`nr13_calc_${tag}`, payload);
  }
  await atualizarCategoriaComPmta(tag, resumo.pmtaFinal);
}
