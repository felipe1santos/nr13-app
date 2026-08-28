/**
 * Fase 9 · 9E — o mesmo estado de equipamento, offline.
 *
 * Offline não há projeção nem RPC: quem sabe se o equipamento ainda existe é a
 * presença de `nr13_info_<TAG>` no cache deste aparelho. É a MESMA pergunta que
 * o servidor responde por `equipamentos_index`, feita na única fonte disponível.
 *
 * E há uma armadilha específica do modo offline, que estes testes travam: sob
 * `boot_v9` o cache não tem a organização inteira. Um aparelho que conhece o
 * índice de relatórios de uma TAG mas ainda não baixou a ficha dela responderia
 * "equipamento excluído" para um equipamento vivo — trocando "não sei" por uma
 * afirmação falsa, que é exatamente o defeito que a prova offline da 9D pegou
 * no Dashboard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cache = vi.hoisted(() => ({ dados: new Map<string, unknown>() }));

vi.mock('./storage', () => ({
  ler: (chave: string) => (cache.dados.has(chave) ? cache.dados.get(chave) : null),
  listarChavesComPrefixo: (p: string) =>
    [...cache.dados.keys()].filter((c) => c.startsWith(p)),
}));

import { relatoriosLocais } from './relatoriosLocais';

function indice(tag: string, ids: string[]) {
  cache.dados.set(
    'nr13_historico_indice_' + tag,
    ids.map((id) => ({ id, tagVaso: tag, emissao: '12/08/2026', codigo: id })),
  );
}

beforeEach(() => {
  cache.dados = new Map();
});

describe('estado do equipamento no cache', () => {
  it('com ficha no cache: ativo', () => {
    indice('VASO-01', ['REL-1']);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
    expect(relatoriosLocais({ escopo: 'todos' })[0].equipamentoAtivo).toBe(true);
  });

  it('sem ficha e SEM catálogo nenhum no cache: ativo — "não sei" não vira acusação', () => {
    indice('VASO A23', ['REL-9']);
    expect(relatoriosLocais({ escopo: 'todos' })[0].equipamentoAtivo).toBe(true);
  });

  /**
   * Só quando o aparelho PROVA que conhece o catálogo — tem ao menos uma ficha —
   * a ausência de uma TAG passa a significar alguma coisa.
   */
  it('sem ficha, mas COM catálogo no cache: excluído', () => {
    indice('VASO-01', ['REL-1']);
    indice('VASO A23', ['REL-9']);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
    const porTag = new Map(relatoriosLocais({ escopo: 'todos' }).map((i) => [i.tag, i]));
    expect(porTag.get('VASO-01')!.equipamentoAtivo).toBe(true);
    expect(porTag.get('VASO A23')!.equipamentoAtivo).toBe(false);
  });
});

describe('o escopo filtra localmente igual ao servidor', () => {
  beforeEach(() => {
    indice('VASO-01', ['REL-1']);
    indice('VASO A23', ['REL-9']);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
  });

  it('`ativos` é o padrão e deixa o órfão de fora', () => {
    expect(relatoriosLocais().map((i) => i.tag)).toEqual(['VASO-01']);
  });

  it('`historicos` mostra SÓ o órfão', () => {
    expect(relatoriosLocais({ escopo: 'historicos' }).map((i) => i.tag)).toEqual(['VASO A23']);
  });

  it('`todos` não esconde nada', () => {
    expect(relatoriosLocais({ escopo: 'todos' })).toHaveLength(2);
  });
});

describe('a referência do PDF arquivado', () => {
  /**
   * `RefFoto` grava o caminho em **`path`**. Ler `caminho` devolvia `null` para
   * todo relatório finalizado — o campo simplesmente não existe com esse nome —
   * e a tela ficava sem por onde abrir o artefato. Medido em produção em
   * 25/08/2026: `pdf_ref` nulo nas 15 linhas da organização de teste, inclusive
   * nas 4 que TÊM artefato e `sha256`.
   */
  it('lê `path` da RefFoto', () => {
    cache.dados.set('nr13_historico_indice_VASO-01', [
      {
        id: 'REL-1',
        tagVaso: 'VASO-01',
        emissao: '12/08/2026',
        pdfRef: { bucket: 'inspecao', path: 'org/relatorios/uuid.pdf', mimeType: 'application/pdf' },
      },
    ]);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
    expect(relatoriosLocais()[0].pdfRef).toBe('org/relatorios/uuid.pdf');
  });

  it('pdfRef em texto puro continua valendo', () => {
    cache.dados.set('nr13_historico_indice_VASO-01', [
      { id: 'REL-1', tagVaso: 'VASO-01', emissao: '12/08/2026', pdfRef: 'org/rel/x.pdf' },
    ]);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
    expect(relatoriosLocais()[0].pdfRef).toBe('org/rel/x.pdf');
  });

  it('relatório legado, sem artefato: null, e nada de string vazia', () => {
    indice('VASO-01', ['REL-1']);
    cache.dados.set('nr13_info_VASO-01', { tag: 'VASO-01' });
    expect(relatoriosLocais()[0].pdfRef).toBeNull();
  });
});
