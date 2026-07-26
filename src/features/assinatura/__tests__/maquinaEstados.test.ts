import { describe, it, expect } from 'vitest';
import {
  aplicarEvento,
  statusEfetivo,
  somarDias,
  camposVinculoManual,
  DIAS_CICLO,
  type EstadoAssinatura,
} from '../maquinaEstados';

const AGORA = new Date('2026-07-26T12:00:00.000Z');
const trial: EstadoAssinatura = { status: 'trial', ate: '2026-07-27T12:00:00.000Z' };

describe('aplicarEvento', () => {
  it('compra aprovada ativa a conta por 30 dias', () => {
    const r = aplicarEvento(trial, 'compra_aprovada', AGORA);
    expect(r.status).toBe('ativa');
    expect(r.ate).toBe('2026-08-25T12:00:00.000Z');
  });

  it('renovacao estende 30 dias a partir de agora', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-07-27T12:00:00.000Z' };
    expect(aplicarEvento(ativa, 'subscription_renewed', AGORA).ate).toBe('2026-08-25T12:00:00.000Z');
  });

  it('cartao recusado joga para graca de 5 dias', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-07-26T12:00:00.000Z' };
    const r = aplicarEvento(ativa, 'subscription_late', AGORA);
    expect(r.status).toBe('graca');
    expect(r.ate).toBe('2026-07-31T12:00:00.000Z');
  });

  it('pagamento durante a graca volta para ativa', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-31T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'compra_aprovada', AGORA).status).toBe('ativa');
  });

  it('cancelamento preserva o periodo ja pago', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-08-20T12:00:00.000Z' };
    const r = aplicarEvento(ativa, 'subscription_canceled', AGORA);
    expect(r.status).toBe('cancelada_no_prazo');
    expect(r.ate).toBe('2026-08-20T12:00:00.000Z');
  });

  it('cancelamento sem periodo restante bloqueia na hora', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-20T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'subscription_canceled', AGORA).status).toBe('somente_leitura');
  });

  it('chargeback e reembolso bloqueiam na hora, mesmo com periodo pago', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-08-20T12:00:00.000Z' };
    expect(aplicarEvento(ativa, 'chargeback', AGORA).status).toBe('somente_leitura');
    expect(aplicarEvento(ativa, 'chargeback', AGORA).ate).toBe(AGORA.toISOString());
    expect(aplicarEvento(ativa, 'compra_reembolsada', AGORA).status).toBe('somente_leitura');
  });

  it('renovacao fora de ordem depois de late reativa (webhook atrasado nao pode punir)', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-31T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'subscription_renewed', AGORA).status).toBe('ativa');
  });
});

describe('somarDias (vínculo manual de evento órfão no Admin)', () => {
  it('soma DIAS_CICLO (30) a partir de agora, em ISO', () => {
    expect(somarDias(AGORA, DIAS_CICLO)).toBe('2026-08-25T12:00:00.000Z');
  });

  it('vira o mes/ano corretamente perto da virada', () => {
    expect(somarDias(new Date('2026-12-10T00:00:00.000Z'), DIAS_CICLO)).toBe('2027-01-09T00:00:00.000Z');
  });
});

describe('camposVinculoManual (Admin — vínculo manual de evento órfão, fix round 1 do CRITICAL 1)', () => {
  it('grava assinatura_status ativa e assinatura_ate = agora + DIAS_CICLO', () => {
    const r = camposVinculoManual(AGORA, 'cliente@teste.com', 'sub-123');
    expect(r.assinatura_status).toBe('ativa');
    expect(r.assinatura_ate).toBe('2026-08-25T12:00:00.000Z');
  });

  it('inclui as colunas LEGADAS que o login() realmente usa para liberar a entrada', () => {
    // Sem isso, o painel mostra "Ativa" mas o usuário continua barrado em auth.ts (!perfil.ativo
    // ou expirado(perfil.acessoExpiraEm)) — era exatamente o bug do CRITICAL 1.
    const r = camposVinculoManual(AGORA, 'cliente@teste.com', 'sub-123');
    expect(r.ativo).toBe(true);
    expect(r.plano).toBe('completo');
    expect(r.acesso_expira_em).toBe(r.assinatura_ate);
  });

  it('propaga e-mail e subscription_id do evento para as colunas kiwify_*', () => {
    const r = camposVinculoManual(AGORA, 'pagador@kiwify.com', 'sub-999');
    expect(r.kiwify_email).toBe('pagador@kiwify.com');
    expect(r.kiwify_subscription_id).toBe('sub-999');
  });

  it('aceita email/subscriptionId nulos (evento sem esses dados) sem quebrar', () => {
    const r = camposVinculoManual(AGORA, null, null);
    expect(r.kiwify_email).toBeNull();
    expect(r.kiwify_subscription_id).toBeNull();
    expect(r.ativo).toBe(true);
  });
});

describe('statusEfetivo', () => {
  it('rebaixa para somente leitura quando a data passou', () => {
    expect(statusEfetivo({ status: 'ativa', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
    expect(statusEfetivo({ status: 'graca', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
    expect(statusEfetivo({ status: 'trial', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
  });

  it('data nula significa sem vencimento e nunca rebaixa', () => {
    expect(statusEfetivo({ status: 'ativa', ate: null }, AGORA)).toBe('ativa');
  });

  it('mantem o status quando a data ainda esta no futuro', () => {
    expect(statusEfetivo({ status: 'cancelada_no_prazo', ate: '2026-08-20T12:00:00.000Z' }, AGORA)).toBe('cancelada_no_prazo');
  });
});
