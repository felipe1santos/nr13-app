import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As anotações da agenda são o único dado do calendário que o usuário digita
 * (o resto é vencimento derivado). Duas coisas precisam estar certas: a data
 * não pode escorregar um dia por causa de fuso, e gravar uma nota não pode
 * apagar as outras.
 */
const salvarMock = vi.fn<(chave: string, obj: unknown) => Promise<void>>(async () => {});
let lido: unknown = [];

vi.mock('../../../services/storage', () => ({
  salvar: (chave: string, obj: unknown) => salvarMock(chave, obj),
  ler: () => lido,
}));

import {
  dataISO,
  dataDeISO,
  listarNotas,
  notasDoDia,
  salvarNota,
  excluirNota,
  novaNota,
  separarPorTempo,
  type NotaAgenda,
} from '../notasAgenda';

const nota = (over: Partial<NotaAgenda> = {}): NotaAgenda => ({
  id: 'n1',
  data: '2026-08-20',
  titulo: 'Visita à Santa Casa',
  tipo: 'visita',
  criadoEm: '2026-08-13T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  salvarMock.mockClear();
  lido = [];
});

describe('data local', () => {
  it('não escorrega um dia por causa do fuso', () => {
    // toISOString() converteria para UTC: no Brasil (UTC-3) qualquer horário
    // antes das 3h volta um dia, e a nota do dia 20 apareceria no dia 19.
    const meiaNoiteEMeia = new Date(2026, 7, 20, 0, 30);
    expect(dataISO(meiaNoiteEMeia)).toBe('2026-08-20');
  });

  it('ida e volta preserva o dia', () => {
    const d = dataDeISO('2026-08-20');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
    expect(dataISO(d)).toBe('2026-08-20');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    expect(dataISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('listar', () => {
  it('devolve lista vazia quando não há nada salvo', () => {
    lido = null;
    expect(listarNotas()).toEqual([]);
  });

  it('não quebra se o valor salvo não for um array', () => {
    lido = { qualquer: 'coisa' };
    expect(listarNotas()).toEqual([]);
  });

  it('devolve em ordem de data', () => {
    lido = [nota({ id: 'b', data: '2026-09-01' }), nota({ id: 'a', data: '2026-08-20' })];
    expect(listarNotas().map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('filtra por dia', () => {
    lido = [nota({ id: 'a', data: '2026-08-20' }), nota({ id: 'b', data: '2026-08-21' })];
    expect(notasDoDia('2026-08-20').map((n) => n.id)).toEqual(['a']);
  });
});

describe('salvar e excluir', () => {
  it('acrescenta sem apagar as existentes', async () => {
    lido = [nota({ id: 'a' })];
    await salvarNota(nota({ id: 'b', data: '2026-09-10' }));
    const [chave, gravado] = salvarMock.mock.calls[0];
    expect(chave).toBe('nr13_agenda_notas');
    expect((gravado as NotaAgenda[]).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('substitui a nota de mesmo id em vez de duplicar', async () => {
    lido = [nota({ id: 'a', titulo: 'Antigo' })];
    await salvarNota(nota({ id: 'a', titulo: 'Novo' }));
    const gravado = salvarMock.mock.calls[0][1] as NotaAgenda[];
    expect(gravado).toHaveLength(1);
    expect(gravado[0].titulo).toBe('Novo');
  });

  it('excluir tira só a pedida', async () => {
    lido = [nota({ id: 'a' }), nota({ id: 'b', data: '2026-09-01' })];
    await excluirNota('a');
    const gravado = salvarMock.mock.calls[0][1] as NotaAgenda[];
    expect(gravado.map((n) => n.id)).toEqual(['b']);
  });

  it('nota nova nasce com id próprio e a data pedida', () => {
    const a = novaNota('2026-08-20');
    const b = novaNota('2026-08-20');
    expect(a.data).toBe('2026-08-20');
    expect(a.id).not.toBe(b.id);
  });
});

describe('passado e futuro', () => {
  const lista = [
    nota({ id: 'antiga', data: '2026-08-01' }),
    nota({ id: 'hoje', data: '2026-08-13' }),
    nota({ id: 'futura', data: '2026-09-01' }),
  ];

  it('o dia de hoje conta como futuro — o compromisso ainda não passou', () => {
    const { passadas, futuras } = separarPorTempo(lista, '2026-08-13');
    expect(passadas.map((n) => n.id)).toEqual(['antiga']);
    expect(futuras.map((n) => n.id)).toEqual(['hoje', 'futura']);
  });

  it('as passadas vêm da mais recente para a mais antiga', () => {
    const { passadas } = separarPorTempo(
      [nota({ id: 'x', data: '2026-07-01' }), nota({ id: 'y', data: '2026-08-01' })],
      '2026-08-13',
    );
    expect(passadas.map((n) => n.id)).toEqual(['y', 'x']);
  });
});
