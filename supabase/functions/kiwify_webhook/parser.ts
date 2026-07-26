// TS puro (sem APIs do Deno nem imports) para rodar igual na Edge Function e no Vitest.
// A Kiwify NÃO publica o schema do webhook de vendas: por isso lemos por tentativa e,
// quando não achamos, devolvemos null — o evento vira órfão e ninguém é liberado/bloqueado
// por engano.

export type EventoKiwify =
  | 'compra_aprovada'
  | 'subscription_renewed'
  | 'subscription_late'
  | 'subscription_canceled'
  | 'compra_reembolsada'
  | 'chargeback';

const EVENTOS: EventoKiwify[] = [
  'compra_aprovada',
  'subscription_renewed',
  'subscription_late',
  'subscription_canceled',
  'compra_reembolsada',
  'chargeback',
];

export interface DadosEvento {
  evento: EventoKiwify | null;
  email: string | null;
  subscriptionId: string | null;
  sck: string | null;
}

const VAZIO: DadosEvento = { evento: null, email: null, subscriptionId: null, sck: null };

// Valida se um valor é um objeto (não null, não array).
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// Busca o primeiro valor string não vazio entre vários caminhos "a.b.c".
// Por exemplo: primeiraString(raiz, ['Customer.email', 'customer.email', 'email'])
// vai tentar raiz.Customer.email, depois raiz.customer.email, depois raiz.email.
function primeiraString(raiz: Record<string, unknown>, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = raiz;
    // Percorre cada parte do caminho (ex: "Customer.email" → ["Customer", "email"])
    for (const parte of caminho.split('.')) {
      const o = obj(atual);
      atual = o ? o[parte] : undefined;
    }
    // Se achou uma string não vazia, retorna após trim
    if (typeof atual === 'string' && atual.trim() !== '') return atual.trim();
  }
  return null;
}

export function extrairDados(payload: unknown): DadosEvento {
  const raiz = obj(payload);
  if (!raiz) return { ...VAZIO };

  // Tenta vários nomes de campo para o tipo de evento (a Kiwify usa formatos diferentes).
  const eventoBruto = primeiraString(raiz, [
    'webhook_event_type',
    'event',
    'event_type',
    'order_status',
    'status',
    'data.event',
    'data.webhook_event_type',
  ]);
  // Só valida o evento se for um dos 6 conhecidos; senão null.
  const evento = EVENTOS.includes(eventoBruto as EventoKiwify) ? (eventoBruto as EventoKiwify) : null;

  // Busca o e-mail em diversos caminhos possíveis.
  const email = primeiraString(raiz, [
    'Customer.email',
    'customer.email',
    'data.customer.email',
    'data.Customer.email',
    'buyer.email',
    'email',
  ]);

  // Busca o subscription ID (identificador da assinatura/compra).
  const subscriptionId = primeiraString(raiz, [
    'subscription_id',
    'subscription.id',
    'data.subscription.id',
    'Subscription.id',
    'order_id',
  ]);

  // Busca o SCK dos parametros de rastreamento (user tracking ID).
  const sck = primeiraString(raiz, [
    'TrackingParameters.sck',
    'tracking_parameters.sck',
    'data.tracking_parameters.sck',
    'sck',
  ]);

  // Retorna com email normalizado (lowercase) para comparação consistente.
  return { evento, email: email ? email.toLowerCase() : null, subscriptionId, sck };
}
