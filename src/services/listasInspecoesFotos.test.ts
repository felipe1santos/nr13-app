/**
 * /inspecoes ORDENADA POR Nº DE INSPEÇÕES e FOTO nas listas (21/11/2026).
 *
 * O SQL (`supabase/listas_inspecoes_fotos.sql`) foi conferido no laboratório:
 * ordem, keyset, `fotos_equipamentos` e anon recusado. Aqui, o lado do cliente:
 * a consulta certa, o cursor que volta, o FALLBACK sem a função nova e o
 * agrupamento das fotos — N linhas, UMA chamada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      const r = estado.respostas[fn] ?? { data: [], error: null };
      const p = Promise.resolve(r);
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import {
  __reiniciarDeteccaoOrdem,
  cursorInspecoes,
  lerCursorInspecoes,
  listarPagina,
} from './buscaIndex';
import { __limparFotosEquipamentos, carregarFotos } from './fotosEquipamentos';

function linha(tag: string, inspecoes: number | null) {
  return {
    tag, descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numero_serie: null, localizacao: null, ano: null, cliente_nome: null, cliente_cidade: null,
    proxima_inspecao: null, tem_foto: false, foto_ref: null,
    pmta_mpa: null, pth_mpa: null, resultado: null, volume_m3: null,
    fluido: null, classe_fluido: null, vida_anos: null, tem_cliente: false,
    unidade: null, source_version: 1, inspecoes,
  };
}

beforeEach(() => {
  estado.chamadas = [];
  estado.respostas = {};
  __reiniciarDeteccaoOrdem();
  __limparFotosEquipamentos();
});

describe('ordem por nº de inspeções', () => {
  it('pede a RPC nova e devolve cursor (qtd, TAG); "não contado" vira -1', async () => {
    estado.respostas.buscar_equipamentos_por_inspecoes = {
      data: [linha('B', 6), linha('A', 1), linha('C', null)],
      error: null,
    };
    const p = await listarPagina({}, null, undefined, 'inspecoes');
    expect(estado.chamadas[0].fn).toBe('buscar_equipamentos_por_inspecoes');
    expect(p.ordem).toBe('inspecoes');
    expect(p.itens.map((i) => i.tag)).toEqual(['B', 'A', 'C']);
    expect(lerCursorInspecoes(p.proximoCursor)).toEqual({ o: 'inspecoes', q: -1, t: 'C' });
  });

  it('o cursor carrega a ordem: "carregar mais" continua nela', async () => {
    await listarPagina({}, cursorInspecoes(1, 'A'));
    expect(estado.chamadas[0]).toMatchObject({
      fn: 'buscar_equipamentos_por_inspecoes',
      args: { p_cursor_qtd: 1, p_cursor_tag: 'A' },
    });
  });

  it('servidor sem a função: cai na ordem por TAG e não pergunta de novo na sessão', async () => {
    estado.respostas.buscar_equipamentos_por_inspecoes = { data: null, error: { code: 'PGRST202' } };
    estado.respostas.buscar_equipamentos = { data: [linha('A', 1)], error: null };
    const p = await listarPagina({}, null, undefined, 'inspecoes');
    expect(p.ordem).toBe('tag');
    expect(p.proximoCursor).toBe('A');
    await listarPagina({}, null, undefined, 'inspecoes');
    expect(estado.chamadas.map((c) => c.fn)).toEqual([
      'buscar_equipamentos_por_inspecoes',
      'buscar_equipamentos',
      'buscar_equipamentos',
    ]);
  });
});

describe('fotos das listas que não trazem foto', () => {
  it('N TAGs, UMA chamada; a segunda vez sai do cache', async () => {
    estado.respostas.fotos_equipamentos = {
      data: [{ tag: 'A', tipo: 'vaso', foto_ref: { path: 'org/a.jpg' } }],
      error: null,
    };
    const r = await carregarFotos(['A', 'B', 'A']);
    expect(estado.chamadas).toHaveLength(1);
    expect(estado.chamadas[0].args).toEqual({ p_tags: ['A', 'B'] });
    expect(r.A?.fotoRef).toEqual({ path: 'org/a.jpg' });
    expect(r.B).toBeNull(); // não veio = sem foto, guardado para não perguntar de novo
    await carregarFotos(['A', 'B']);
    expect(estado.chamadas).toHaveLength(1);
  });

  it('servidor sem a função: nenhuma nova tentativa na sessão', async () => {
    estado.respostas.fotos_equipamentos = { data: null, error: { code: 'PGRST202' } };
    await carregarFotos(['A']);
    await carregarFotos(['Z']);
    expect(estado.chamadas).toHaveLength(1);
  });
});
