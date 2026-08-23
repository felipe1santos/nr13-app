/**
 * Fase 9 · 9C — o que a busca promete ao usuário, travado por teste.
 *
 * O que cada bloco protege está escrito no `describe`. Nenhum destes testes
 * fala com o banco: os que precisam de Postgres estão em
 * `scripts/fase9/testes-9c.sql`, porque provar keyset e RLS exige o servidor.
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

import { ErroBusca, TAMANHO_PAGINA, contar, fundirLocais, listarPagina, type ItemCatalogo } from './buscaIndex';

function linha(tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag,
    descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numero_serie: null, localizacao: null, ano: null, cliente: null,
    proxima_inspecao: null, tem_foto: false, foto_ref: null,
    pmta_mpa: null, pth_mpa: null, resultado: null, volume_m3: null,
    fluido: null, classe_fluido: null, vida_anos: null, tem_cliente: false,
    unidade: null, source_version: 1,
    ...extra,
  };
}

function item(tag: string, extra: Partial<ItemCatalogo> = {}): ItemCatalogo {
  return {
    tag, descricao: null, tipo: null, subtipo: null, categoria: null, fabricante: null,
    numeroSerie: null, localizacao: null, ano: null, cliente: null, proximaInspecao: null,
    temFoto: false, fotoRef: null, pmtaMpa: null, pthMpa: null, resultado: null,
    volumeM3: null, fluido: null, classeFluido: null, vidaAnos: null, temCliente: false,
    unidade: null, sourceVersion: 0,
    ...extra,
  };
}

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = [];
  estado.erro = null;
});

describe('a consulta que sai daqui', () => {
  it('nunca manda a organização — quem a resolve é o servidor', async () => {
    await listarPagina({ termo: 'werner' });
    const args = estado.chamadas[0].args;
    expect(estado.chamadas[0].fn).toBe('buscar_equipamentos');
    // Se um dia aparecer um `p_org` aqui, o cliente passa a poder pedir a org
    // de outra pessoa — e a RLS deixa de ser a única guarda.
    expect(Object.keys(args)).not.toContain('p_org');
    expect(Object.keys(args).some((k) => /org/i.test(k))).toBe(false);
  });

  it('pede UMA página a mais para saber se há próxima sem contar a base', async () => {
    estado.resposta = Array.from({ length: TAMANHO_PAGINA + 1 }, (_, i) => linha(`VP-${String(i).padStart(4, '0')}`));
    const p = await listarPagina();
    expect(estado.chamadas[0].args.p_limite).toBe(TAMANHO_PAGINA + 1);
    // O 51º NÃO vai para a tela: ele só respondeu "tem mais?".
    expect(p.itens).toHaveLength(TAMANHO_PAGINA);
    expect(p.temMais).toBe(true);
  });

  it('o cursor é a ÚLTIMA tag da página, e volta como veio', async () => {
    estado.resposta = [linha('VP-0001'), linha('VP-0002'), linha('VP-0003')];
    const p = await listarPagina();
    expect(p.proximoCursor).toBe('VP-0003');
    expect(p.temMais).toBe(false);

    await listarPagina({}, p.proximoCursor);
    expect(estado.chamadas[1].args.p_cursor).toBe('VP-0003');
  });

  it('página vazia devolve cursor nulo — senão a rolagem pediria para sempre', async () => {
    const p = await listarPagina();
    expect(p.itens).toEqual([]);
    expect(p.proximoCursor).toBeNull();
    expect(p.temMais).toBe(false);
  });

  it('filtro em branco vira NULL, não string vazia', async () => {
    await listarPagina({ termo: '  ', tipo: '', categoria: '' });
    expect(estado.chamadas[0].args.p_tipo).toBeNull();
    expect(estado.chamadas[0].args.p_categoria).toBeNull();
  });

  it('erro do servidor vira ErroBusca — a tela mostra e oferece repetir', async () => {
    estado.erro = { message: 'falhou' };
    await expect(listarPagina()).rejects.toBeInstanceOf(ErroBusca);
  });
});

describe('os números que o Postgres manda como texto', () => {
  it('numeric chega STRING no PostgREST e vira número aqui', async () => {
    // Sem esta conversão o cartão imprimiria "0.6084" cru em vez de formatar a
    // PMTA na unidade escolhida, e a barra de vida ficaria em zero.
    estado.resposta = [linha('VP-1', { pmta_mpa: '0.6084', vida_anos: '12.5', volume_m3: '9.413' })];
    const p = await listarPagina();
    expect(p.itens[0].pmtaMpa).toBeCloseTo(0.6084);
    expect(p.itens[0].vidaAnos).toBeCloseTo(12.5);
    expect(p.itens[0].volumeM3).toBeCloseTo(9.413);
  });

  it('valor ilegível vira null, não NaN', async () => {
    estado.resposta = [linha('VP-1', { pmta_mpa: '--', vida_anos: '' })];
    const p = await listarPagina();
    expect(p.itens[0].pmtaMpa).toBeNull();
    expect(p.itens[0].vidaAnos).toBeNull();
  });
});

describe('a contagem tem teto, e diz quando tem', () => {
  it('devolve exato quando o servidor diz que é exato', async () => {
    estado.resposta = [{ total: 128, exato: true }];
    expect(await contar()).toEqual({ total: 128, exato: true });
  });

  it('devolve "mais de N" sem inventar um total', async () => {
    estado.resposta = [{ total: 1000, exato: false }];
    expect(await contar()).toEqual({ total: 1000, exato: false });
  });
});

describe('o item recém-salvo NUNCA some da lista (§6.5)', () => {
  it('entra mesmo sem o servidor conhecê-lo, e marcado como pendente', () => {
    const saida = fundirLocais([item('VP-0002')], [item('VP-0001')]);
    expect(saida.map((i) => i.tag)).toEqual(['VP-0001', 'VP-0002']);
    expect(saida[0].pendente).toBe(true);
  });

  it('o LOCAL vence o do servidor na mesma TAG', () => {
    // O local é o que o usuário acabou de digitar. Se diverge, é porque o
    // servidor ainda não sabe.
    const saida = fundirLocais(
      [item('VP-1', { descricao: 'do servidor' })],
      [item('VP-1', { descricao: 'que eu acabei de salvar' })],
    );
    expect(saida).toHaveLength(1);
    expect(saida[0].descricao).toBe('que eu acabei de salvar');
  });

  it('não duplica: uma TAG, uma linha', () => {
    const saida = fundirLocais([item('A'), item('B')], [item('B'), item('C')]);
    expect(saida.map((i) => i.tag)).toEqual(['A', 'B', 'C']);
  });

  it('ordena como o BANCO ordena — byte a byte, não por localidade', () => {
    // `localeCompare` em pt-BR põe "a" antes de "B"; o servidor, sob collation
    // "C", põe "B" antes de "a". Se divergissem, a emenda entre páginas pularia
    // itens — que é o defeito que a regra de cursor estável proíbe.
    const saida = fundirLocais([], [item('a-1'), item('B-1'), item('A-1')]);
    expect(saida.map((i) => i.tag)).toEqual(['A-1', 'B-1', 'a-1']);
  });

  it('não repete o pendente em TODA página: respeita o cursor', () => {
    const saida = fundirLocais([item('VP-9')], [item('VP-1')], 'VP-5');
    expect(saida.map((i) => i.tag)).toEqual(['VP-9']);
  });

  it('sem pendentes, devolve o do servidor sem tocar em nada', () => {
    const doServidor = [item('A'), item('B')];
    expect(fundirLocais(doServidor, [])).toBe(doServidor);
  });

  it('nunca estoura o tamanho da página', () => {
    const servidor = Array.from({ length: TAMANHO_PAGINA }, (_, i) => item(`S-${String(i).padStart(3, '0')}`));
    const locais = [item('A-000'), item('A-001')];
    expect(fundirLocais(servidor, locais)).toHaveLength(TAMANHO_PAGINA);
  });
});
