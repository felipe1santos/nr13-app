import { describe, expect, it } from 'vitest';
import {
  chaveMes,
  notasDoMes,
  resumoDoMes,
  resumoFaturamento,
  textoValor,
} from './faturamento';
import { statusDe, type NotaAgenda } from './notasAgenda';

function nota(p: Partial<NotaAgenda> & { data: string }): NotaAgenda {
  return {
    id: p.data + (p.titulo ?? '') + String(p.valor ?? ''),
    titulo: 'serviço',
    tipo: 'inspecao',
    criadoEm: '2026-09-01T00:00:00.000Z',
    ...p,
  };
}

describe('faturamento previsto × realizado', () => {
  it('serviço apenas AGENDADO não conta como realizado', () => {
    const r = resumoFaturamento([nota({ data: '2026-09-10', valor: 1200, status: 'agendado' })]);
    expect(r.previsto).toBe(1200);
    expect(r.realizado).toBe(0);
  });

  it('serviço CONCLUÍDO sai do previsto e entra no realizado', () => {
    const r = resumoFaturamento([nota({ data: '2026-09-10', valor: 1200, status: 'concluido' })]);
    expect(r.previsto).toBe(0);
    expect(r.realizado).toBe(1200);
  });

  it('CANCELADO não entra em nenhuma das duas contas', () => {
    const r = resumoFaturamento([
      nota({ data: '2026-09-10', valor: 900, status: 'cancelado' }),
      nota({ data: '2026-09-11', valor: 100, status: 'agendado' }),
    ]);
    expect(r.previsto).toBe(100);
    expect(r.realizado).toBe(0);
    expect(r.cancelados).toBe(1);
    expect(r.quantidade).toBe(1);
  });

  it('nota anterior à 10A (sem status) conta como AGENDADA, nunca como concluída', () => {
    const antiga = nota({ data: '2026-05-04', titulo: 'anotação velha' });
    expect(antiga.status).toBeUndefined();
    expect(statusDe(antiga)).toBe('agendado');
    const r = resumoFaturamento([antiga]);
    expect(r.agendados).toBe(1);
    expect(r.concluidos).toBe(0);
  });

  it('valor ausente NÃO é zero — é contado à parte', () => {
    const r = resumoFaturamento([
      nota({ data: '2026-09-10', status: 'concluido' }),
      nota({ data: '2026-09-12', valor: 0, status: 'concluido' }),
    ]);
    expect(r.realizado).toBe(0);
    expect(r.semValor).toBe(1); // só a primeira; a segunda tem preço zero DIGITADO
    expect(textoValor(undefined)).toBe('—');
    expect(textoValor(0)).toContain('0,00');
  });

  it('valor não numérico (NaN) é tratado como não informado', () => {
    const r = resumoFaturamento([nota({ data: '2026-09-10', valor: Number.NaN, status: 'agendado' })]);
    expect(r.previsto).toBe(0);
    expect(r.semValor).toBe(1);
  });
});

describe('recorte por mês', () => {
  const notas = [
    nota({ data: '2026-08-31', valor: 10, status: 'concluido' }),
    nota({ data: '2026-09-01', valor: 20, status: 'concluido' }),
    nota({ data: '2026-09-30', valor: 30, status: 'agendado' }),
    nota({ data: '2026-10-01', valor: 40, status: 'agendado' }),
  ];

  it('chaveMes usa mês 0-based, como o Date', () => {
    expect(chaveMes(2026, 8)).toBe('2026-09');
  });

  it('não vaza o dia 31 do mês anterior nem o dia 1 do seguinte', () => {
    expect(notasDoMes(notas, 2026, 8).map((n) => n.data)).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('resumo do mês soma só o mês pedido', () => {
    const r = resumoDoMes(notas, 2026, 8);
    expect(r.realizado).toBe(20);
    expect(r.previsto).toBe(30);
    expect(r.quantidade).toBe(2);
  });
});
