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
});
