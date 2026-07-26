import { describe, it, expect } from 'vitest';
import { extrairDados } from '../../../../supabase/functions/kiwify_webhook/parser';

describe('extrairDados', () => {
  it('le o formato com Customer maiusculo', () => {
    const r = extrairDados({
      webhook_event_type: 'compra_aprovada',
      Customer: { email: 'Fulano@Empresa.com' },
      subscription_id: 'sub_123',
    });
    expect(r).toEqual({ evento: 'compra_aprovada', email: 'fulano@empresa.com', subscriptionId: 'sub_123', sck: null });
  });

  it('le o formato aninhado em data.customer', () => {
    const r = extrairDados({
      event: 'subscription_late',
      data: { customer: { email: 'a@b.com' }, subscription: { id: 'sub_9' } },
    });
    expect(r.evento).toBe('subscription_late');
    expect(r.email).toBe('a@b.com');
    expect(r.subscriptionId).toBe('sub_9');
  });

  it('le o sck dos parametros de rastreamento', () => {
    const r = extrairDados({ order_status: 'chargeback', email: 'c@d.com', TrackingParameters: { sck: 'uid-42' } });
    expect(r.evento).toBe('chargeback');
    expect(r.sck).toBe('uid-42');
  });

  it('payload irreconhecivel devolve tudo nulo, sem lancar', () => {
    expect(extrairDados({ qualquer: 'coisa' })).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
    expect(extrairDados(null)).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
    expect(extrairDados('texto')).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
  });

  it('evento desconhecido nao vira evento valido', () => {
    expect(extrairDados({ webhook_event_type: 'pix_gerado', email: 'a@b.com' }).evento).toBeNull();
  });

  it('payload que e array no topo nao lanca e devolve tudo nulo', () => {
    expect(extrairDados([1, 2])).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
    expect(extrairDados([])).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
  });

  it('valor intermediario string onde caminho espera objeto nao lanca', () => {
    // Customer é string "oops", não objeto — o caminho Customer.email não consegue prosseguir
    expect(extrairDados({ Customer: 'oops', webhook_event_type: 'compra_aprovada' })).toEqual({
      evento: 'compra_aprovada',
      email: null,
      subscriptionId: null,
      sck: null,
    });
  });

  it('null no meio do caminho nao lanca e devolve tudo nulo', () => {
    // data é null, então data.customer.email não resolve
    const r = extrairDados({ data: null, webhook_event_type: 'compra_aprovada' });
    expect(r.email).toBeNull();
    expect(r.subscriptionId).toBeNull();
    expect(r.sck).toBeNull();
  });

  it('fallback order_id como subscriptionId', () => {
    // Sem subscription_id nem subscription.id, mas com order_id
    const r = extrairDados({ order_id: 'ord_999', email: 'test@example.com', webhook_event_type: 'compra_aprovada' });
    expect(r.subscriptionId).toBe('ord_999');
  });
});
