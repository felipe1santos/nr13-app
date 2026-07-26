import { describe, it, expect } from 'vitest';
import {
  aplicarEvento,
  statusEfetivo,
  bloqueioEntrada,
  somarDias,
  camposVinculoManual,
  camposAssinaturaAdmin,
  COLUNAS_ASSINATURA,
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

describe('bloqueioEntrada (gate de login/verificarAcesso — achado C2)', () => {
  const VENCIDO = '2026-07-20T12:00:00.000Z';
  const FUTURO = '2026-08-20T12:00:00.000Z';

  it('conta suspensa ENTRA (somente leitura) em vez de ser deslogada', () => {
    // É o coração do achado: antes, assinatura_ate no passado (o webhook grava a mesma data em
    // acesso_expira_em) derrubava a conta no login e a barra vermelha/modal nunca apareciam.
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: VENCIDO, assinaturaStatus: 'somente_leitura' }, AGORA),
    ).toBeNull();
  });

  it('assinante com renovacao atrasada (data vencida, status ativa) nao e expulso', () => {
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: VENCIDO, assinaturaStatus: 'ativa' }, AGORA),
    ).toBeNull();
  });

  it('trial vencido com a migracao rodada entra e cai no funil de pagamento', () => {
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: VENCIDO, assinaturaStatus: 'trial' }, AGORA),
    ).toBeNull();
  });

  it('LEGADO preservado: sem status de assinatura, data vencida continua barrando', () => {
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: VENCIDO, assinaturaStatus: '' }, AGORA),
    ).toBe('expirado');
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: VENCIDO, assinaturaStatus: null }, AGORA),
    ).toBe('expirado');
  });

  it('LEGADO: sem status e sem data (ou data futura) entra normalmente', () => {
    expect(bloqueioEntrada({ ativo: true, acessoExpiraEm: null, assinaturaStatus: '' }, AGORA)).toBeNull();
    expect(bloqueioEntrada({ ativo: true, acessoExpiraEm: FUTURO, assinaturaStatus: '' }, AGORA)).toBeNull();
  });

  it('bloqueio manual do Admin (ativo=false) barra sempre, mesmo com assinatura ativa', () => {
    expect(
      bloqueioEntrada({ ativo: false, acessoExpiraEm: FUTURO, assinaturaStatus: 'ativa' }, AGORA),
    ).toBe('inativo');
  });

  it('data invalida sem assinatura e tratada como expirada (fail-closed)', () => {
    expect(
      bloqueioEntrada({ ativo: true, acessoExpiraEm: 'nao-e-data', assinaturaStatus: '' }, AGORA),
    ).toBe('expirado');
  });
});

describe('camposAssinaturaAdmin (ações de acesso do Admin — achado I1)', () => {
  it('libera a escrita: status ativa com a MESMA validade das colunas legadas', () => {
    // Sem estes campos, a conta liberada pelo Admin loga mas não salva nada (a RLS decide por
    // assinatura_status/assinatura_ate), com a barra vermelha de suspensa na tela.
    expect(camposAssinaturaAdmin('2026-08-25T12:00:00.000Z')).toEqual({
      assinatura_status: 'ativa',
      assinatura_ate: '2026-08-25T12:00:00.000Z',
    });
  });

  it('sem expiração vira assinatura_ate null (sem vencimento, nunca rebaixa)', () => {
    const campos = camposAssinaturaAdmin(null);
    expect(campos.assinatura_ate).toBeNull();
    expect(statusEfetivo({ status: campos.assinatura_status, ate: campos.assinatura_ate }, AGORA)).toBe('ativa');
  });

  it('COLUNAS_ASSINATURA cobre todos os campos que o banco pré-migração não tem', () => {
    // Lista usada pelo Admin para reenviar o update sem essas colunas quando o banco ainda
    // não rodou assinatura_setup.sql.
    for (const coluna of Object.keys(camposVinculoManual(AGORA, null, null))) {
      if (coluna.startsWith('assinatura_') || coluna.startsWith('kiwify_')) {
        expect(COLUNAS_ASSINATURA).toContain(coluna);
      }
    }
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
