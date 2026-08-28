/**
 * Fase 9 · 9F.1.2 — O BADGE "N INSPEÇÕES" SEM ABRIR O CONTAINER.
 *
 * A tela antiga escreve esse número chamando `listarContainers(tag)` — que é
 * `JSON.parse` de `nr13_docs_<TAG>` INTEIRO — **duas vezes por cartão, dentro do
 * render**. Medida em produção em 28/08/2026: média de 11,4 KB por TAG, p95 de
 * 71,8 KB, maior de 117,3 KB. Com 1.000 equipamentos isso é ~22 MB de parse por
 * quadro, para escrever um inteiro.
 *
 * A contagem passa a viajar na linha do catálogo, como um número.
 *
 * ## A regra que estes testes existem para travar
 *
 * **`null` NÃO é `0`.** Numa organização cuja projeção ainda não foi refeita, a
 * coluna vem ausente — e ausente significa "não sei", não "nenhuma inspeção".
 * Escrever "0 Inspeções" ali seria afirmar um fato que ninguém mediu, em cima de
 * um equipamento que pode ter dez inspeções em campo. É o mesmo defeito que a
 * prova offline da 9D pegou no painel ("o painel inventava zero") e o que a 9E
 * evitou com `equipamento_ativo` (ausente vale ativo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  resposta: [] as unknown[],
  erro: null as unknown,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      const p = Promise.resolve({ data: estado.resposta, error: estado.erro });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import { listarPagina, rotuloInspecoes } from './buscaIndex';

function linha(tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag,
    descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numero_serie: null, localizacao: null, ano: null, cliente_nome: null, cliente_cidade: null,
    proxima_inspecao: null, tem_foto: false, foto_ref: null,
    pmta_mpa: null, pth_mpa: null, resultado: null, volume_m3: null,
    fluido: null, classe_fluido: null, vida_anos: null, tem_cliente: false,
    unidade: null, source_version: 1, inspecoes: null as number | null,
    ...extra,
  };
}

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = [];
  estado.erro = null;
});

describe('a contagem de inspeções viaja na linha do catálogo', () => {
  it('o número da projeção chega ao item', async () => {
    estado.resposta = [linha('VP-01', { inspecoes: 3 })];
    const p = await listarPagina();
    expect(p.itens[0].inspecoes).toBe(3);
  });

  it('ZERO explícito é um fato, e continua zero', async () => {
    // Organização projetada, equipamento sem nenhum container: aqui o `0` foi
    // medido, e dizer "0 Inspeções" é verdade.
    estado.resposta = [linha('VP-02', { inspecoes: 0 })];
    const p = await listarPagina();
    expect(p.itens[0].inspecoes).toBe(0);
  });

  it('coluna AUSENTE vira null — nunca zero', async () => {
    // Servidor ainda sem a coluna (projeção não refeita). `0` aqui seria a tela
    // afirmando "este equipamento não tem inspeção nenhuma" sem ter contado.
    const { inspecoes: _fora, ...semColuna } = linha('VP-03', { inspecoes: 9 });
    estado.resposta = [semColuna];
    const p = await listarPagina();
    expect(p.itens[0].inspecoes).toBeNull();
  });

  it('null explícito do banco também fica null', async () => {
    estado.resposta = [linha('VP-04', { inspecoes: null })];
    const p = await listarPagina();
    expect(p.itens[0].inspecoes).toBeNull();
  });

  it('a busca continua NÃO pedindo o container: só a RPC do índice é chamada', async () => {
    estado.resposta = [linha('VP-05', { inspecoes: 2 })];
    await listarPagina();
    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_equipamentos']);
  });
});

describe('rotuloInspecoes — o que a tela escreve', () => {
  it('sem saber, não escreve nada', () => {
    // O badge some. Some é honesto; "0 Inspeções" seria falso.
    expect(rotuloInspecoes(null)).toBeNull();
  });

  it('zero medido é escrito', () => {
    expect(rotuloInspecoes(0)).toBe('0 Inspeções');
  });

  it('singular e plural', () => {
    expect(rotuloInspecoes(1)).toBe('1 Inspeção');
    expect(rotuloInspecoes(4)).toBe('4 Inspeções');
  });
});
