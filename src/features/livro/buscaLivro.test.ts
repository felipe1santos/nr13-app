/**
 * Fase 9 · 9F.4.3 — o mapeamento da RPC do livro.
 *
 * O que estes testes protegem é a fronteira onde o `null` costuma morrer: o
 * PostgREST manda `undefined` quando a coluna não existe (banco sem a migração)
 * e `null` quando existe e ninguém contou. Os dois precisam chegar à tela como
 * `null` — um `?? 0` aqui faria a lista escrever "Sem registro" sobre livros que
 * existem, numa organização inteira que ninguém reprojetou.
 *
 * E o keyset: a página pede `TAMANHO + 1` para saber se há mais sem uma segunda
 * ida ao servidor. O item extra NÃO pode aparecer na tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  rpc: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  resposta: { data: null as unknown, error: null as unknown },
}));

vi.mock('../../services/supabase', () => ({
  supabase: {
    rpc: vi.fn((nome: string, args: Record<string, unknown>) => {
      estado.rpc.push({ nome, args });
      return {
        abortSignal: vi.fn(async () => estado.resposta),
      };
    }),
  },
}));

import { contar, ErroBuscaLivro, listarPagina } from './buscaLivro';

beforeEach(() => {
  estado.rpc.length = 0;
  estado.resposta = { data: [], error: null };
});

describe('listarPagina', () => {
  it('chama a RPC dedicada, e não `buscar_equipamentos`', async () => {
    await listarPagina('bomba');
    expect(estado.rpc[0].nome).toBe('buscar_livros');
    expect(estado.rpc[0].args.p_termo).toBe('bomba');
  });

  it('pede UM a mais que a página, para saber se há mais sem segunda ida', async () => {
    await listarPagina();
    expect(estado.rpc[0].args.p_limite).toBe(51);
  });

  it('o item extra NÃO aparece na lista, mas liga `temMais`', async () => {
    estado.resposta = {
      data: Array.from({ length: 51 }, (_, i) => ({
        tag: `T${String(i).padStart(3, '0')}`,
        livro_entradas: 2,
      })),
      error: null,
    };
    const pagina = await listarPagina();
    expect(pagina.itens).toHaveLength(50);
    expect(pagina.temMais).toBe(true);
    expect(pagina.proximoCursor).toBe('T049');
  });

  it('sem item extra, `temMais` é falso', async () => {
    estado.resposta = {
      data: [{ tag: 'A', livro_entradas: 1 }],
      error: null,
    };
    const pagina = await listarPagina();
    expect(pagina.temMais).toBe(false);
    expect(pagina.proximoCursor).toBe('A');
  });

  it('lista vazia não inventa cursor', async () => {
    estado.resposta = { data: [], error: null };
    const pagina = await listarPagina();
    expect(pagina.itens).toEqual([]);
    expect(pagina.proximoCursor).toBeNull();
    expect(pagina.temMais).toBe(false);
  });

  it('erro da RPC vira ErroBuscaLivro — a tela precisa distinguir de offline', async () => {
    estado.resposta = { data: null, error: { message: 'boom' } };
    await expect(listarPagina()).rejects.toBeInstanceOf(ErroBuscaLivro);
  });
});

describe('o `null` sobrevive à travessia', () => {
  it('`null` do servidor continua `null` — nunca vira 0', async () => {
    estado.resposta = { data: [{ tag: 'A', livro_entradas: null }], error: null };
    const pagina = await listarPagina();
    expect(pagina.itens[0].livroEntradas).toBeNull();
  });

  it('coluna AUSENTE (banco sem a migração) também vira `null`', async () => {
    estado.resposta = { data: [{ tag: 'A' }], error: null };
    const pagina = await listarPagina();
    expect(pagina.itens[0].livroEntradas).toBeNull();
    expect(pagina.itens[0].livroUltima).toBeNull();
  });

  it('`0` do servidor continua `0` — é um fato contado', async () => {
    estado.resposta = { data: [{ tag: 'A', livro_entradas: 0 }], error: null };
    const pagina = await listarPagina();
    expect(pagina.itens[0].livroEntradas).toBe(0);
  });

  it('inteiro que viaja como STRING vira número', async () => {
    // O PostgREST decide sozinho a forma; o mapeamento não pode depender dela.
    estado.resposta = { data: [{ tag: 'A', livro_entradas: '7' }], error: null };
    const pagina = await listarPagina();
    expect(pagina.itens[0].livroEntradas).toBe(7);
  });

  it('a data chega como `AAAA-MM-DD` e não é convertida para Date', async () => {
    // Converter aqui traria o problema de fuso: `new Date('2026-07-10')` é UTC,
    // e a oeste isso vira 09/07 — um dia antes do registro assinado.
    estado.resposta = {
      data: [{ tag: 'A', livro_entradas: 1, livro_ultima: '2026-07-10' }],
      error: null,
    };
    const pagina = await listarPagina();
    expect(pagina.itens[0].livroUltima).toBe('2026-07-10');
  });
});

describe('contar', () => {
  it('devolve total e se é exato', async () => {
    estado.resposta = { data: [{ total: 42, exato: true }], error: null };
    expect(await contar()).toEqual({ total: 42, exato: true });
  });

  it('`exato: false` significa "mais de N" — o teto é de propósito', async () => {
    estado.resposta = { data: [{ total: 1000, exato: false }], error: null };
    expect(await contar()).toEqual({ total: 1000, exato: false });
  });

  it('resposta vazia não quebra a tela', async () => {
    estado.resposta = { data: [], error: null };
    expect(await contar()).toEqual({ total: 0, exato: true });
  });
});
