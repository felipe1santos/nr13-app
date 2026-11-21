/**
 * A situação de UM acessório de calibração (21/11/2026) — regra pura, fora do
 * componente para a suíte (ambiente `node`) alcançar e para o Fast Refresh.
 */
import type { ComponenteCal } from './componentesService';
import { ehEmitido, ehOficial, ehTerceiro, type DadosCalibracao } from './tipos';
import { parseDataPrazo, statusPrazo } from '../../services/vencimentos';

function dataNum(c: DadosCalibracao): number {
  return parseDataPrazo(c.dataCalibracao || c.criadoEm)?.getTime() ?? 0;
}

export interface SituacaoAcessorio {
  ultima: DadosCalibracao | null;
  rascunho: DadosCalibracao | null;
  dias: number | null;
  /** Quantas calibrações OFICIAIS o acessório tem — o contador do "Histórico". */
  oficiais: number;
  /** Selo ao lado do nome. `null` = nunca calibrado ou sem data de próxima. */
  selo: 'em-dia' | 'vencido' | 'reprovado' | null;
  /** O que dizer do certificado da última calibração oficial. */
  certificado: 'emitido' | 'externo' | 'anterior' | null;
}

/**
 * A situação de UM acessório, das calibrações da TAG. Rascunho não é
 * calibração (§4-quinquies): não conta no histórico, não dá prazo e não tira
 * o acessório do estado "Requer calibração".
 */
export function situacaoDoAcessorio(c: ComponenteCal, cals: DadosCalibracao[], hoje = new Date()): SituacaoAcessorio {
  const doComp = cals.filter((x) => x.componenteId === c.id);
  const oficiais = doComp.filter(ehOficial).sort((a, b) => dataNum(b) - dataNum(a));
  const rascunho = doComp.find((x) => !ehOficial(x)) ?? null;
  const ultima = oficiais[0] ?? null;
  const venc = parseDataPrazo(ultima?.dataProxCalibracao ?? null);
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = venc ? statusPrazo(venc, hojeZero).dias : null;
  // Vencido primeiro: um certificado reprovado E vencido está, antes de tudo,
  // vencido. Reprovada vigente não é "Em dia" — o quadro 7.1.1 a lê como NÃO.
  const selo: SituacaoAcessorio['selo'] = !ultima
    ? null
    : dias !== null && dias < 0
      ? 'vencido'
      : ultima.statusConclusao === 'reprovado'
        ? 'reprovado'
        : dias !== null
          ? 'em-dia'
          : null;
  const certificado: SituacaoAcessorio['certificado'] = !ultima
    ? null
    : ehTerceiro(ultima)
      ? 'externo'
      : ehEmitido(ultima)
        ? 'emitido'
        : 'anterior';
  return { ultima, rascunho, dias, oficiais: oficiais.length, selo, certificado };
}

/** "em 294 dias" · "vence hoje" · "vencido há 3 dias" — o canto do cartão. */
export function prazoDoCanto(dias: number | null): string {
  if (dias === null) return 'sem prazo';
  if (dias < 0) return `vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'vence hoje';
  return `em ${dias} dia${dias === 1 ? '' : 's'}`;
}
