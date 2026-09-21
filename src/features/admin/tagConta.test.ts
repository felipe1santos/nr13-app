/**
 * A TAG DA CONTA E A SOMA DO FATURAMENTO (21/09/2026).
 *
 * O painel deixou de ter abas de trial e de leads: passou a ser uma lista só,
 * com a tag de cada conta. Duas regras não podem escorregar:
 *
 *  · a tag escolhida À MÃO vence a derivada — "pagante" e "vitalício" têm os
 *    mesmos campos no banco, e só o dono sabe qual é qual;
 *  · **só pagante soma.** Vitalício, interna e suspenso aparecem na tela e
 *    valem R$ 0 no MRR.
 */
import { describe, expect, it } from 'vitest';
import {
  mensalidadeDaConta,
  somarMensalidades,
  tagDaConta,
  tagEhManual,
  tagSomaNoFaturamento,
  ROTULO_TAG,
  TAGS,
} from './classificarConta';

type Entrada = Parameters<typeof tagDaConta>[0] & { valor_mensal?: number | string | null };
const conta = (p: Partial<Entrada> = {}) => ({
  email: 'cliente@exemplo.com',
  ativo: true,
  role: 'user',
  plano: 'completo',
  acesso_expira_em: null,
  ...p,
}) as Entrada;

describe('a tag manual vence a derivada', () => {
  it('conta sem prazo e sem Kiwify seria vitalícia — marcada, vira pagante', () => {
    const c = conta();
    expect(tagDaConta(c)).toBe('vitalicio');
    expect(tagDaConta({ ...c, classificacao: 'pagante' })).toBe('pagante');
    expect(tagEhManual({ classificacao: 'pagante' })).toBe(true);
    expect(tagEhManual({ classificacao: null })).toBe(false);
  });

  it('tag inválida ou vazia é ignorada — a conta volta para a derivada', () => {
    const c = conta({ classificacao: 'vip' });
    expect(tagDaConta(c)).toBe('vitalicio');
    expect(tagEhManual({ classificacao: 'vip' })).toBe(false);
  });

  it('as quatro tags existem e têm rótulo', () => {
    expect(TAGS).toEqual(['pagante', 'vitalicio', 'interna', 'suspenso']);
    for (const t of TAGS) expect(ROTULO_TAG[t]).toBeTruthy();
  });
});

describe('sem marcação, nada muda em relação ao comportamento antigo', () => {
  it('admin e conta interna continuam internas', () => {
    expect(tagDaConta(conta({ role: 'admin' }))).toBe('interna');
    expect(tagDaConta(conta({ email: 'teste@gmail.com' }))).toBe('interna');
  });

  it('bloqueada, em trial ou vencida continua fora do faturamento', () => {
    expect(tagDaConta(conta({ ativo: false }))).toBe('suspenso');
    expect(tagDaConta(conta({ plano: 'trial' }))).toBe('suspenso');
    expect(tagDaConta(conta({ acesso_expira_em: '2020-01-01T00:00:00Z' }))).toBe('suspenso');
  });

  it('com vínculo de cobrança continua pagante', () => {
    expect(tagDaConta(conta({ kiwify_email: 'x@y.com' }))).toBe('pagante');
  });
});

describe('só pagante soma', () => {
  it('as outras três valem zero', () => {
    expect(tagSomaNoFaturamento('pagante')).toBe(true);
    for (const t of ['vitalicio', 'interna', 'suspenso'] as const) {
      expect(tagSomaNoFaturamento(t)).toBe(false);
    }
    expect(mensalidadeDaConta(conta({ classificacao: 'vitalicio', valor_mensal: 300 }), 197)).toBe(0);
    expect(mensalidadeDaConta(conta({ classificacao: 'interna', valor_mensal: 300 }), 197)).toBe(0);
  });

  it('valor não informado usa o padrão — nunca zero', () => {
    expect(mensalidadeDaConta(conta({ classificacao: 'pagante' }), 197)).toBe(197);
    expect(mensalidadeDaConta(conta({ classificacao: 'pagante', valor_mensal: null }), 197)).toBe(197);
    expect(mensalidadeDaConta(conta({ classificacao: 'pagante', valor_mensal: 0 }), 197)).toBe(197);
  });

  it('valor informado manda, inclusive vindo como texto do banco', () => {
    expect(mensalidadeDaConta(conta({ classificacao: 'pagante', valor_mensal: 250 }), 197)).toBe(250);
    expect(mensalidadeDaConta(conta({ classificacao: 'pagante', valor_mensal: '149.90' }), 197)).toBe(149.9);
  });

  it('o MRR é a soma dos valores REAIS, não pagantes × valor único', () => {
    const contas = [
      conta({ email: 'a@x.com', classificacao: 'pagante', valor_mensal: 250 }),
      conta({ email: 'b@x.com', classificacao: 'pagante', valor_mensal: 150 }),
      conta({ email: 'c@x.com', classificacao: 'pagante' }), // sem valor → padrão
      conta({ email: 'd@x.com', classificacao: 'vitalicio', valor_mensal: 999 }),
      conta({ email: 'e@x.com', role: 'admin' }),
      conta({ email: 'f@x.com', ativo: false }),
    ];
    expect(somarMensalidades(contas, 197)).toEqual({ pagantes: 3, mrr: 250 + 150 + 197 });
  });

  it('sem pagante nenhum, o MRR é zero — e não o valor padrão', () => {
    expect(somarMensalidades([conta({ classificacao: 'vitalicio' })], 197)).toEqual({ pagantes: 0, mrr: 0 });
  });
});
