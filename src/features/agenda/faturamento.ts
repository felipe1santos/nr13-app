import { statusDe, type NotaAgenda } from './notasAgenda';

/**
 * Faturamento da agenda — previsto × realizado.
 *
 * REGRA QUE DÁ SENTIDO AO MÓDULO: **serviço apenas agendado NÃO é faturamento
 * realizado.** Somar os dois num número só é o erro que faz o mês parecer
 * fechado antes de o trabalho existir; e é irreversível na cabeça de quem lê,
 * porque o número já foi visto.
 *
 *   · `previsto`  — serviços AGENDADOS e ainda não concluídos;
 *   · `realizado` — serviços CONCLUÍDOS;
 *   · `cancelado` — não entra em nenhum dos dois. Sai das duas contas em vez de
 *     virar previsto eterno.
 *
 * `valor` ausente é "não informado", que **não é zero**: por isso as contagens
 * `semValor` existem. Um mês com R$ 0,00 previsto e três serviços sem valor
 * informado não é um mês sem faturamento — é um mês sem preço digitado, e a
 * tela precisa poder dizer a diferença.
 *
 * Tudo aqui é função pura sobre `NotaAgenda[]`: a suíte roda em ambiente `node`,
 * sem DOM, então a regra não pode morar dentro do JSX.
 */
export interface ResumoFaturamento {
  previsto: number;
  realizado: number;
  /** Serviços que contam (agendados + concluídos). Cancelado não conta. */
  quantidade: number;
  agendados: number;
  concluidos: number;
  cancelados: number;
  /** Quantos, entre os que contam, estão sem valor informado. */
  semValor: number;
}

/** `AAAA-MM` de uma nota — a chave de agrupamento por mês. */
export function mesDaNota(n: NotaAgenda): string {
  return n.data.slice(0, 7);
}

/** `AAAA-MM` a partir de ano/mês (mês 0-based, como no `Date`). */
export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

export function notasDoMes(notas: NotaAgenda[], ano: number, mes: number): NotaAgenda[] {
  const alvo = chaveMes(ano, mes);
  return notas.filter((n) => mesDaNota(n) === alvo);
}

export function resumoFaturamento(notas: NotaAgenda[]): ResumoFaturamento {
  const r: ResumoFaturamento = {
    previsto: 0,
    realizado: 0,
    quantidade: 0,
    agendados: 0,
    concluidos: 0,
    cancelados: 0,
    semValor: 0,
  };
  for (const n of notas) {
    const s = statusDe(n);
    if (s === 'cancelado') {
      r.cancelados++;
      continue;
    }
    r.quantidade++;
    const v = typeof n.valor === 'number' && Number.isFinite(n.valor) ? n.valor : null;
    if (v === null) r.semValor++;
    if (s === 'concluido') {
      r.concluidos++;
      if (v !== null) r.realizado += v;
    } else {
      r.agendados++;
      if (v !== null) r.previsto += v;
    }
  }
  return r;
}

export function resumoDoMes(notas: NotaAgenda[], ano: number, mes: number): ResumoFaturamento {
  return resumoFaturamento(notasDoMes(notas, ano, mes));
}

/** R$ com duas casas, padrão brasileiro. */
export function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Texto do valor de UM serviço. `null`/ausente vira "—", nunca "R$ 0,00":
 * preço não informado e preço zero são coisas diferentes.
 */
export function textoValor(v: number | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? formatarBRL(v) : '—';
}
