import { ler, salvar } from '../../services/storage';
import { atualizarCategoriaComPmta } from '../categoria/categoriaService';
import type { ComponenteResumo } from './tiposMemorial';
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
  // '' = ainda não preenchido — inputs nascem vazios, o usuário digita os valores
  P: number | '';
  D: number | '';
  componentes: ComponenteVasoSalvo[];
  orientacao?: OrientacaoVaso;
}

export interface ResumoMemorialVaso {
  porComponente: { id: string; nome: string; tipo: TipoComponenteVaso; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE';
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
  return ler<VasoSalvo>(chaveVaso(tag, sufixo)) || { tag, P: '', D: '', componentes: [] };
}

export async function salvarVaso(tag: string, vaso: VasoSalvo, sufixo = ''): Promise<void> {
  await salvar(chaveVaso(tag, sufixo), vaso);
}

// Roda o motor calc/vaso.ts pra todos os componentes e consolida: PMTA do equipamento é o MENOR
// valor entre os componentes (cascos/tampos), PTH = 1.3 x PMTA (UG-99(b), mesmo teste do vaso/
// autoclave), aprovado só se TODOS os componentes (incluindo bocal/flange) estiverem aprovados.
export function calcularResumoVaso(vaso: VasoSalvo): ResumoMemorialVaso {
  // Bocais (UG-37) precisam dos dados do casco furado — injeta a referência na hora do
  // cálculo (não muta o estado salvo). Vale pro vaso e pro reuso no autoclave.
  const casco = vaso.componentes.find((c) => c.id === 'casco');
  const porComponente = vaso.componentes.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    resultado: calcularComponenteVaso(
      c.nome,
      c.tipo,
      c.tipo === 'bocal' && casco ? { ...c.dados, dadosCascoRef: casco.dados } : c.dados,
      vaso.D,
      vaso.P,
    ),
  }));

  const pmtas = porComponente
    .map((c) => parseFloat(c.resultado.pmta))
    .filter((n) => Number.isFinite(n));
  const pmtaFinal = pmtas.length > 0 ? Math.min(...pmtas) : null;
  const pthFinal = pmtaFinal != null ? pmtaFinal * 1.3 : null;

  // PENDENTE = algum campo obrigatório vazio (o cálculo saiu com valores padrão) — resultado
  // não confiável até o usuário preencher. Detalhes em c.resultado.faltantes (banner na UI).
  const temFaltantes =
    !Number.isFinite(Number(vaso.P)) || Number(vaso.P) <= 0 ||
    !Number.isFinite(Number(vaso.D)) || Number(vaso.D) <= 0 ||
    porComponente.some((c) => (c.resultado.faltantes ?? []).length > 0);
  const resultado = temFaltantes
    ? 'PENDENTE'
    : porComponente.every((c) => c.resultado.resultado === 'APROVADO')
      ? 'APROVADO'
      : 'REPROVADO';
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
  // Sub-componente do CORPO PRINCIPAL (ac_corpo — casco/tampos da autoclave cilíndrica; e
  // futuros sufixos de corpo, ex. celetrica) também atualiza a chave geral para que
  // Equipamento.tsx mostre o botão "Ver Memorial" e a PMTA corretos.
  // BUG CORRIGIDO: "gv" (Gerador de Vapor) é um sub-equipamento À PARTE, não o corpo principal.
  // Antes, salvar o memorial do GV sobrescrevia incondicionalmente `nr13_calc_<TAG>` com os
  // dados do GV — apagando o memorial do corpo principal (ac_corpo ou autoclave vertical/
  // retangular) que o usuário já tinha salvo, fazendo "Ver Memorial Completo" na ficha exibir
  // dados errados ou parecer que nada foi salvo. RESUMO-MEMORIAL.html só cai para ac_corpo como
  // fallback do vaso principal — nunca para gv — confirmando que gv não deve tocar a chave geral.
  if (sufixo && sufixo !== 'gv') {
    await salvar(`nr13_calc_${tag}`, payload);
  }
  // GV é sub-equipamento do autoclave (não o corpo principal): a categoria de risco do
  // equipamento pertence ao corpo, então salvar o memorial do GV não pode sobrescrevê-la
  // com a PMTA do GV (mesma razão do bloco acima, que já não grava a chave geral para 'gv').
  if (sufixo !== 'gv') {
    await atualizarCategoriaComPmta(tag, resumo.pmtaFinal);
  }
}
