/**
 * /equipamentos ORDENADA POR CRIAÇÃO (21/11/2026) — o lado do cliente.
 *
 * O lado do banco (derivação da data, congelamento, keyset composto) foi
 * conferido no laboratório contra `supabase/equipamentos_ordem_criacao.sql`.
 * Aqui fica o que NÃO precisa de Postgres:
 *
 *   · a consulta certa para cada ordem, e o cursor composto que volta;
 *   · o FALLBACK: servidor sem a função nova responde por TAG, sem quebrar;
 *   · `fundirLocais` na ordem por criação: o pendente recém-criado no TOPO.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: unknown };

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      const r: Resposta = estado.respostas[fn] ?? { data: [], error: null };
      const p = Promise.resolve(r);
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import {
  ErroBusca,
  TAMANHO_PAGINA,
  __reiniciarDeteccaoOrdem,
  cursorCriacao,
  ehFuncaoAusente,
  fundirLocais,
  lerCursorCriacao,
  listarPagina,
  type ItemCatalogo,
} from './buscaIndex';

function linha(tag: string, criado: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    tag,
    descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numero_serie: null, localizacao: null, ano: null, cliente_nome: null, cliente_cidade: null,
    proxima_inspecao: null, tem_foto: false, foto_ref: null,
    pmta_mpa: null, pth_mpa: null, resultado: null, volume_m3: null,
    fluido: null, classe_fluido: null, vida_anos: null, tem_cliente: false,
    unidade: null, source_version: 1,
    ...(criado !== undefined ? { criado_em: criado } : {}),
    ...extra,
  };
}

function item(tag: string, extra: Partial<ItemCatalogo> = {}): ItemCatalogo {
  return {
    tag, descricao: null, tipo: null, subtipo: null, categoria: null, fabricante: null,
    numeroSerie: null, localizacao: null, ano: null, clienteNome: null, clienteCidade: null,
    proximaInspecao: null,
    temFoto: false, fotoRef: null, pmtaMpa: null, pthMpa: null,
    pmtaAdotadaMpa: null, pthAdotadaMpa: null, resultado: null,
    volumeM3: null, fluido: null, classeFluido: null, vidaAnos: null, temCliente: false,
    unidade: null, sourceVersion: 0, inspecoes: null, temProntuario: null, calibracoes: null,
    livroEntradas: null, livroUltima: null,
    ...extra,
  };
}

const AUSENTE = {
  code: 'PGRST202',
  message:
    'Could not find the function public.buscar_equipamentos_recentes(p_categoria, p_cursor_criado, p_cursor_tag, p_limite, p_termo, p_tipo) in the schema cache',
};

beforeEach(() => {
  estado.chamadas = [];
  estado.respostas = {};
  __reiniciarDeteccaoOrdem();
});

describe('a consulta por criação', () => {
  it('pede a função nova, sem organização, e a 1ª página sem cursor', async () => {
    await listarPagina({ termo: ' vp ' }, null, undefined, 'criacao');
    expect(estado.chamadas).toHaveLength(1);
    const { fn, args } = estado.chamadas[0];
    expect(fn).toBe('buscar_equipamentos_recentes');
    expect(args).toMatchObject({ p_termo: 'vp', p_cursor_criado: null, p_cursor_tag: null });
    expect(args.p_limite).toBe(TAMANHO_PAGINA + 1);
    expect(Object.keys(args).some((k) => /org/i.test(k))).toBe(false);
  });

  it('devolve o cursor COMPOSTO da última linha, com a data exatamente como veio', async () => {
    const criado = '2026-11-20T10:00:00.123+00:00';
    estado.respostas.buscar_equipamentos_recentes = {
      data: [
        ...Array.from({ length: TAMANHO_PAGINA - 1 }, (_, i) => linha(`N-${i}`, '2026-11-21T10:00:00+00:00')),
        linha('ULTIMO', criado),
        linha('EXTRA', '2026-01-01T00:00:00+00:00'), // o 51º só diz "tem mais"
      ],
      error: null,
    };
    const p = await listarPagina({}, null, undefined, 'criacao');
    expect(p.ordem).toBe('criacao');
    expect(p.temMais).toBe(true);
    expect(p.itens).toHaveLength(TAMANHO_PAGINA);
    expect(p.itens[TAMANHO_PAGINA - 1].criadoEm).toBe(criado);
    expect(lerCursorCriacao(p.proximoCursor)).toEqual({ o: 'criacao', c: criado, t: 'ULTIMO' });
  });

  it('a próxima página manda os DOIS cursores de volta, intactos', async () => {
    const cur = cursorCriacao('2026-11-20T10:00:00.123+00:00', 'VP/01 A');
    await listarPagina({}, cur, undefined, 'criacao');
    expect(estado.chamadas[0].fn).toBe('buscar_equipamentos_recentes');
    expect(estado.chamadas[0].args).toMatchObject({
      p_cursor_criado: '2026-11-20T10:00:00.123+00:00',
      p_cursor_tag: 'VP/01 A',
    });
  });

  it('as outras telas continuam na ordem por TAG (padrão)', async () => {
    await listarPagina({}, null);
    await listarPagina({}, 'VP-9');
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos', 'buscar_equipamentos']);
    expect(estado.chamadas[1].args.p_cursor).toBe('VP-9');
  });
});

describe('FALLBACK: servidor sem o SQL novo não quebra a tela', () => {
  it('função ausente → cai para buscar_equipamentos e diz que a ordem é por TAG', async () => {
    estado.respostas.buscar_equipamentos_recentes = { data: null, error: AUSENTE };
    estado.respostas.buscar_equipamentos = { data: [linha('A-1', undefined), linha('B-1', undefined)], error: null };
    const p = await listarPagina({}, null, undefined, 'criacao');
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos_recentes', 'buscar_equipamentos']);
    expect(p.ordem).toBe('tag');
    expect(p.itens.map((i) => i.tag)).toEqual(['A-1', 'B-1']);
    // Cursor de TAG: a continuação segue por TAG, sem misturar as ordens.
    expect(p.proximoCursor).toBe('B-1');
    expect(p.itens[0].criadoEm).toBeUndefined();
  });

  it('lembra na sessão: a busca seguinte já vai direto na antiga', async () => {
    estado.respostas.buscar_equipamentos_recentes = { data: null, error: AUSENTE };
    await listarPagina({}, null, undefined, 'criacao');
    estado.chamadas = [];
    await listarPagina({ termo: 'x' }, null, undefined, 'criacao');
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos']);
  });

  it('cursor de TAG com ordem por criação continua por TAG (rolagem após o fallback)', async () => {
    await listarPagina({}, 'B-1', undefined, 'criacao');
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos']);
    expect(estado.chamadas[0].args.p_cursor).toBe('B-1');
  });

  it('erro que NÃO é de assinatura vira ErroBusca e não troca a ordem da sessão', async () => {
    estado.respostas.buscar_equipamentos_recentes = { data: null, error: { code: '57014', message: 'timeout' } };
    await expect(listarPagina({}, null, undefined, 'criacao')).rejects.toBeInstanceOf(ErroBusca);
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos_recentes']);
    estado.respostas.buscar_equipamentos_recentes = { data: [], error: null };
    estado.chamadas = [];
    await listarPagina({}, null, undefined, 'criacao');
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos_recentes']);
  });

  it('função some no MEIO da rolagem: erro, nunca cair para TAG pulando itens', async () => {
    estado.respostas.buscar_equipamentos_recentes = { data: null, error: AUSENTE };
    const cur = cursorCriacao('2026-11-20T10:00:00+00:00', 'X');
    await expect(listarPagina({}, cur, undefined, 'criacao')).rejects.toBeInstanceOf(ErroBusca);
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos_recentes']);
  });

  it('reconhece a recusa de assinatura pelos códigos e pela mensagem', () => {
    expect(ehFuncaoAusente(AUSENTE)).toBe(true);
    expect(ehFuncaoAusente({ code: '42883', message: 'function does not exist' })).toBe(true);
    expect(ehFuncaoAusente({ message: AUSENTE.message })).toBe(true);
    expect(ehFuncaoAusente({ code: '57014', message: 'canceling statement' })).toBe(false);
    expect(ehFuncaoAusente(new TypeError('Failed to fetch'))).toBe(false);
    expect(ehFuncaoAusente(null)).toBe(false);
  });

  it('cursor de TAG nunca é lido como cursor composto', () => {
    expect(lerCursorCriacao('VP-01')).toBeNull();
    expect(lerCursorCriacao('{"a":1}')).toBeNull();
    expect(lerCursorCriacao('{quebrado')).toBeNull();
    expect(lerCursorCriacao(null)).toBeNull();
  });
});

describe('fundirLocais na ordem por criação — o recém-criado no TOPO', () => {
  const servidor = [
    item('ZZ-B', { criadoEm: '2026-11-20T10:00:00+00:00' }),
    item('AA-A', { criadoEm: '2026-11-01T10:00:00+00:00' }),
  ];

  it('pendente que o servidor ainda não conhece entra no topo, marcado', () => {
    const saida = fundirLocais(servidor, [item('MM-NOVO')], null, undefined, 'criacao');
    expect(saida.map((i) => i.tag)).toEqual(['MM-NOVO', 'ZZ-B', 'AA-A']);
    expect(saida[0].pendente).toBe(true);
  });

  it('vários pendentes: sem data primeiro (por TAG), depois o de data mais recente', () => {
    const saida = fundirLocais(
      servidor,
      [
        item('P-VELHO', { criadoEm: '2026-11-21T08:00:00Z' }),
        item('P-2'),
        item('P-NOVO', { criadoEm: '2026-11-21T09:00:00Z' }),
        item('P-1'),
      ],
      null,
      undefined,
      'criacao',
    );
    expect(saida.map((i) => i.tag)).toEqual(['P-1', 'P-2', 'P-NOVO', 'P-VELHO', 'ZZ-B', 'AA-A']);
  });

  it('edição pendente de um que o servidor JÁ devolveu: conteúdo local, posição e data do servidor', () => {
    const saida = fundirLocais(servidor, [item('AA-A', { descricao: 'editado agora' })], null, undefined, 'criacao');
    expect(saida.map((i) => i.tag)).toEqual(['ZZ-B', 'AA-A']);
    expect(saida[1].descricao).toBe('editado agora');
    expect(saida[1].criadoEm).toBe('2026-11-01T10:00:00+00:00');
    expect(saida[1].pendente).toBe(true);
  });

  it('não repete o pendente nas páginas seguintes (com cursor)', () => {
    const cur = cursorCriacao('2026-11-21T00:00:00+00:00', 'X');
    const saida = fundirLocais(servidor, [item('MM-NOVO')], cur, undefined, 'criacao');
    expect(saida.map((i) => i.tag)).toEqual(['ZZ-B', 'AA-A']);
  });

  it('não corta linha do servidor: a página cresce em vez de perder o fim (o cursor vem dela)', () => {
    const cheia = Array.from({ length: TAMANHO_PAGINA }, (_, i) => item(`S-${String(i).padStart(3, '0')}`));
    const saida = fundirLocais(cheia, [item('NOVO-1'), item('NOVO-2')], null, undefined, 'criacao');
    expect(saida).toHaveLength(TAMANHO_PAGINA + 2);
    expect(saida.slice(0, 2).map((i) => i.tag)).toEqual(['NOVO-1', 'NOVO-2']);
    expect(saida[saida.length - 1].tag).toBe(`S-${String(TAMANHO_PAGINA - 1).padStart(3, '0')}`);
  });

  it('sem pendentes devolve a MESMA lista do servidor', () => {
    expect(fundirLocais(servidor, [], null, undefined, 'criacao')).toBe(servidor);
  });

  it('a ordem por TAG continua a de antes (padrão)', () => {
    const saida = fundirLocais(servidor, [item('MM-NOVO')]);
    expect(saida.map((i) => i.tag)).toEqual(['AA-A', 'MM-NOVO', 'ZZ-B']);
  });
});
