import { describe, it, expect } from 'vitest';
import { classificarConta, CONTAS_INTERNAS, type ContaClassificavel } from './classificarConta';

const FUTURO = new Date(Date.now() + 30 * 86_400_000).toISOString();
const PASSADO = new Date(Date.now() - 5 * 86_400_000).toISOString();

function conta(over: Partial<ContaClassificavel> = {}): ContaClassificavel {
  return {
    email: 'cliente@exemplo.com',
    ativo: true,
    role: 'user',
    plano: 'completo',
    acesso_expira_em: FUTURO,
    assinatura_ate: FUTURO,
    kiwify_subscription_id: 'sub_123',
    ...over,
  };
}

describe('classificarConta', () => {
  it('conta com assinatura Kiwify vigente é pagante', () => {
    expect(classificarConta(conta())).toBe('pagante');
  });

  it('conta sem assinatura mas com prazo pago segue pagante', () => {
    expect(classificarConta(conta({ kiwify_subscription_id: null }))).toBe('pagante');
  });

  it('kiwify_email preenchido basta para ser pagante, mesmo sem prazo nenhum', () => {
    // É a marcação manual do painel (o webhook não grava `kiwify_subscription_id`
    // — pendência 0.4). Sem esta regra, `engyuricesar@gmail.com`, que tem
    // assinatura ativa na Kiwify desde 04/08/2026, caía em "Vitalícia" e sumia
    // do MRR.
    const marcado = conta({
      kiwify_subscription_id: null,
      kiwify_email: 'engyuricesar@gmail.com',
      acesso_expira_em: null,
      assinatura_ate: null,
    });
    expect(classificarConta(marcado)).toBe('pagante');
  });

  it('desmarcar (kiwify_email nulo) devolve a conta para vitalícia', () => {
    const desmarcado = conta({
      kiwify_subscription_id: null,
      kiwify_email: null,
      acesso_expira_em: null,
      assinatura_ate: null,
    });
    expect(classificarConta(desmarcado)).toBe('cortesia');
  });

  it('e-mail vazio não conta como marcação', () => {
    const vazio = conta({
      kiwify_subscription_id: null,
      kiwify_email: '   ',
      acesso_expira_em: null,
      assinatura_ate: null,
    });
    expect(classificarConta(vazio)).toBe('cortesia');
  });

  it('vitalícia (sem assinatura e sem vencimento nenhum) é cortesia, não pagante', () => {
    const v = conta({ kiwify_subscription_id: null, acesso_expira_em: null, assinatura_ate: null });
    expect(classificarConta(v)).toBe('cortesia');
  });

  it('conta interna do dono é interna mesmo estando ativa e vigente', () => {
    expect(classificarConta(conta({ email: CONTAS_INTERNAS[0] }))).toBe('interna');
  });

  it('e-mail interno casa sem depender de caixa ou espaço em volta', () => {
    expect(classificarConta(conta({ email: '  TESTE@Gmail.com ' }))).toBe('interna');
  });

  it('superadmin é interna, qualquer que seja o e-mail', () => {
    expect(classificarConta(conta({ role: 'admin', email: 'dono@exemplo.com' }))).toBe('interna');
  });

  it('interna vence a inativa — conta interna bloqueada não vira "sem acesso"', () => {
    // A ordem importa: se `inativa` fosse testada antes, a conta do dono
    // desligada apareceria como cliente perdido no relatório de churn.
    expect(classificarConta(conta({ email: CONTAS_INTERNAS[0], ativo: false }))).toBe('interna');
  });

  it('conta bloqueada, em trial ou vencida não entra em receita', () => {
    expect(classificarConta(conta({ ativo: false }))).toBe('inativa');
    expect(classificarConta(conta({ plano: 'trial' }))).toBe('inativa');
    expect(classificarConta(conta({ acesso_expira_em: PASSADO }))).toBe('inativa');
  });

  it('vencida vence a cortesia — prazo no passado não é vitalícia', () => {
    const v = conta({
      kiwify_subscription_id: null,
      acesso_expira_em: PASSADO,
      assinatura_ate: null,
    });
    expect(classificarConta(v)).toBe('inativa');
  });

  it('campos de assinatura ausentes (conta pré-migração) não quebram a regra', () => {
    const antiga: ContaClassificavel = {
      email: 'antiga@exemplo.com',
      ativo: true,
      role: 'user',
      plano: 'demonstracao',
      acesso_expira_em: FUTURO,
    };
    expect(classificarConta(antiga)).toBe('pagante');
  });

  it('e-mail nulo não casa com a lista de internas por engano', () => {
    expect(classificarConta(conta({ email: null }))).toBe('pagante');
  });
});
