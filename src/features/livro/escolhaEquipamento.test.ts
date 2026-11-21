/**
 * GATE · equipamento recém-criado aparece em "Novo registro" (21/11/2026).
 *
 * Causa raiz: a escolha do equipamento filtrava os `itens` da lista de
 * `/livro-registro`, que vem de `buscar_livros` — e essa RPC só devolve quem
 * JÁ TEM livro (`livro_entradas is null or > 0`). Equipamento novo nasce com
 * `livro_entradas = 0`: nunca entrava, e o primeiro registro (que o tiraria do
 * zero) era o que se tentava criar.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ItemCatalogo, PaginaCatalogo } from '../../services/buscaIndex';
import { ErroEscolha, paginaParaRegistro, type FontesEscolha } from './escolhaEquipamento';

function item(tag: string, extra: Partial<ItemCatalogo> = {}): ItemCatalogo {
  return {
    tag,
    descricao: null,
    tipo: 'vaso',
    subtipo: null,
    categoria: null,
    fabricante: null,
    numeroSerie: null,
    localizacao: null,
    ano: null,
    clienteNome: null,
    clienteCidade: null,
    proximaInspecao: null,
    temFoto: false,
    fotoRef: null,
    pmtaMpa: null,
    pthMpa: null,
    pmtaAdotadaMpa: null,
    pthAdotadaMpa: null,
    resultado: null,
    volumeM3: null,
    fluido: null,
    classeFluido: null,
    vidaAnos: null,
    temCliente: false,
    inspecoes: null,
    temProntuario: null,
    calibracoes: null,
    livroEntradas: null,
    livroUltima: null,
    unidade: null,
    sourceVersion: 1,
    ...extra,
  };
}

const pagina = (itens: ItemCatalogo[], temMais = false): PaginaCatalogo => ({
  itens,
  proximoCursor: itens.length ? itens[itens.length - 1].tag : null,
  temMais,
});

const casa = (i: ItemCatalogo, t: string) => !t || i.tag.toLowerCase().includes(t.toLowerCase());

function fontes(p: Partial<FontesEscolha>): FontesEscolha {
  return {
    listarPagina: async () => pagina([]),
    paginaLocal: async () => pagina([]),
    pendentes: () => [],
    casaTermo: casa,
    ...p,
  };
}

describe('a escolha lista TODOS os equipamentos — não só os que já têm livro', () => {
  it('equipamento sem registro nenhum (`livroEntradas: 0`) aparece', async () => {
    const r = await paginaParaRegistro(
      '',
      null,
      undefined,
      fontes({ listarPagina: async () => pagina([item('VP-COM-LIVRO', { livroEntradas: 3 }), item('VP-NOVO', { livroEntradas: 0 })]) }),
    );
    expect(r.itens.map((i) => i.tag)).toEqual(['VP-COM-LIVRO', 'VP-NOVO']);
    expect(r.offline).toBe(false);
  });

  it('equipamento recém-criado que o servidor ainda não confirmou também aparece', async () => {
    // A rede de segurança do §6.5: está na fila deste aparelho, não na projeção.
    const r = await paginaParaRegistro(
      '',
      null,
      undefined,
      fontes({
        listarPagina: async () => pagina([item('VP-A')]),
        pendentes: () => [item('VP-B-RECEM', { sourceVersion: 0 })],
      }),
    );
    expect(r.itens.map((i) => i.tag)).toEqual(['VP-A', 'VP-B-RECEM']);
    expect(r.itens[1].pendente).toBe(true);
  });

  it('ficha vazia não é motivo para ficar de fora', async () => {
    // Só a TAG: sem descrição, sem tipo, sem categoria.
    const r = await paginaParaRegistro(
      '',
      null,
      undefined,
      fontes({ listarPagina: async () => pagina([item('SO-TAG', { tipo: null })]) }),
    );
    expect(r.itens).toHaveLength(1);
  });

  it('o termo da busca vai ao servidor e filtra os pendentes', async () => {
    const pedidos: string[] = [];
    const r = await paginaParaRegistro(
      ' vp-b ',
      null,
      undefined,
      fontes({
        listarPagina: async (t) => {
          pedidos.push(t);
          return pagina([]);
        },
        pendentes: () => [item('VP-A'), item('VP-B')],
      }),
    );
    expect(pedidos).toEqual(['vp-b']);
    expect(r.itens.map((i) => i.tag)).toEqual(['VP-B']);
  });

  it('sem rede, responde pelo catálogo do aparelho e DIZ isso', async () => {
    const r = await paginaParaRegistro(
      '',
      null,
      undefined,
      fontes({
        listarPagina: async () => {
          throw new TypeError('Failed to fetch');
        },
        paginaLocal: async () => pagina([item('VP-LOCAL')]),
      }),
    );
    expect(r.offline).toBe(true);
    expect(r.itens.map((i) => i.tag)).toEqual(['VP-LOCAL']);
  });

  it('sem rede e sem nada no aparelho: erro nomeado, não lista vazia muda', async () => {
    await expect(
      paginaParaRegistro(
        '',
        null,
        undefined,
        fontes({
          listarPagina: async () => {
            throw new TypeError('Failed to fetch');
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ErroEscolha);
  });
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('a tela usa a fonte certa — e mostra a foto', () => {
  const catalogo = semComentarios(readFileSync('src/features/livro/CatalogoLivroV9.tsx', 'utf8'));
  const modal = semComentarios(readFileSync('src/features/livro/ModalEscolhaEquipamento.tsx', 'utf8'));
  const servico = semComentarios(readFileSync('src/features/livro/escolhaEquipamento.ts', 'utf8'));

  it('o seletor saiu do catálogo do livro — não filtra mais os `itens` de `buscar_livros`', () => {
    expect(catalogo).toContain('<ModalEscolhaEquipamento');
    expect(catalogo).not.toContain('filtroEscolha');
    expect(catalogo).not.toContain('iv4-escolha-item');
  });

  it('a fonte é o catálogo da organização + os pendentes locais', () => {
    expect(servico).toContain('buscaIndex.listarPagina(');
    expect(servico).toContain('equipamentosPendentesLocais');
    expect(servico).toContain('buscaIndex.fundirLocais(');
    expect(servico).not.toContain('buscar_livros');
    expect(servico).not.toContain('lerTudo');
  });

  it('com foto, a miniatura; sem foto, o ícone do tipo', () => {
    expect(modal).toContain('i.fotoRef ? (');
    expect(modal).toContain('<FotoImg');
    expect(modal).toContain('variante="thumb"');
    expect(modal).toContain('iconeDoTipo(i.tipo)');
  });

  it('a busca espera o usuário parar de digitar (não é uma consulta por tecla)', () => {
    expect(modal).toContain('setTimeout(() => setTermo(filtro.trim()), ESPERA_MS)');
    expect(modal).toContain('}, [buscar, termo]);');
  });
});
