// Regra de negócio da assinatura, sem I/O: a mesma função decide o estado no
// front (espelho) e no webhook (Edge Function). Testável isoladamente.

export type StatusAssinatura =
  | 'trial'
  | 'ativa'
  | 'graca'
  | 'cancelada_no_prazo'
  | 'somente_leitura';

export type EventoKiwify =
  | 'compra_aprovada'
  | 'subscription_renewed'
  | 'subscription_late'
  | 'subscription_canceled'
  | 'compra_reembolsada'
  | 'chargeback';

/** `ate` = fim do período pago (ISO). `null` = sem vencimento (conta vitalícia/liberada na mão). */
export interface EstadoAssinatura {
  status: StatusAssinatura;
  ate: string | null;
}

export const DIAS_CICLO = 30;
/** Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar. */
export const DIAS_GRACA = 5;

// Exportada (Task 10): o painel Admin reusa para calcular a nova validade ao vincular
// manualmente um evento Kiwify órfão a um usuário — mesma regra de "30 dias corridos"
// usada pelo webhook, sem duplicar a conta em outro lugar.
export function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

function futuro(ate: string | null, agora: Date): boolean {
  if (ate === null) return true;
  const t = new Date(ate).getTime();
  return Number.isFinite(t) && t > agora.getTime();
}

export function aplicarEvento(
  atual: EstadoAssinatura,
  evento: EventoKiwify,
  agora: Date,
): EstadoAssinatura {
  switch (evento) {
    case 'compra_aprovada':
    case 'subscription_renewed':
      return { status: 'ativa', ate: somarDias(agora, DIAS_CICLO) };
    case 'subscription_late':
      return { status: 'graca', ate: somarDias(agora, DIAS_GRACA) };
    case 'subscription_canceled':
      // Cancelou: usa o que já pagou. Sem período restante, bloqueia agora.
      return futuro(atual.ate, agora)
        ? { status: 'cancelada_no_prazo', ate: atual.ate }
        : { status: 'somente_leitura', ate: atual.ate };
    case 'chargeback':
    case 'compra_reembolsada':
      // Dinheiro devolvido: corta na hora, ignorando período pago.
      return { status: 'somente_leitura', ate: agora.toISOString() };
  }
}

export function statusEfetivo(estado: EstadoAssinatura, agora: Date): StatusAssinatura {
  if (estado.status === 'somente_leitura') return 'somente_leitura';
  return futuro(estado.ate, agora) ? estado.status : 'somente_leitura';
}
