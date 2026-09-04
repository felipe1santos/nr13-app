import { beforeEach, describe, expect, it, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  CHAVE_ARQUIVADOS,
  arquivarRelatorio,
  desarquivarRelatorio,
  filtrarPorArquivo,
  idsArquivados,
  listarArquivados,
} from './arquivados';
import { carregarRelatorio, renomearRelatorio, salvarRelatorio, zerarCacheLegado } from './historicoRelatorios';
import type { RelatorioSalvo } from './tipos';

const TAG = 'VP-01';

function rel(id: string): RelatorioSalvo {
  return {
    id,
    tagVaso: TAG,
    nome: `Relatorio_${id}.pdf`,
    tipo: 'Inspeção Periódica',
    data: '04/09/2026',
    documentos: ['CAPA.html'],
    status: 'Aprovado',
    meta: { codigo: id, emissao: '04/09/2026' } as RelatorioSalvo['meta'],
    pdfRef: { bucket: 'inspecao', path: `org/relatorios/${id}.pdf`, mimeType: 'application/pdf', tamanho: 1234 },
    sha256: 'a'.repeat(64),
    paginas: 12,
    geradoEm: '2026-09-04T00:00:00.000Z',
  } as RelatorioSalvo;
}

beforeEach(() => {
  localStorage.clear();
  zerarCacheLegado();
});

describe('arquivar NÃO apaga nada', () => {
  it('guarda só o id, e o registro do relatório continua inteiro', async () => {
    await salvarRelatorio(rel('REL-1'));
    await arquivarRelatorio('REL-1', TAG);

    const r = carregarRelatorio('REL-1', TAG)!;
    expect(r.pdfRef?.path).toBe('org/relatorios/REL-1.pdf');
    expect(r.sha256).toBe('a'.repeat(64));
    expect(r.paginas).toBe(12);
    expect(listarArquivados()).toEqual([{ id: 'REL-1', tag: TAG, em: expect.any(String) }]);
  });

  it('arquivar duas vezes não duplica', async () => {
    await arquivarRelatorio('REL-1', TAG);
    await arquivarRelatorio('REL-1', TAG);
    expect(listarArquivados()).toHaveLength(1);
  });

  it('desarquivar devolve o relatório à lista', async () => {
    await arquivarRelatorio('REL-1', TAG);
    await desarquivarRelatorio('REL-1');
    expect(idsArquivados().size).toBe(0);
  });

  it('valor corrompido na chave não derruba a lista', () => {
    localStorage.setItem(CHAVE_ARQUIVADOS, JSON.stringify({ nao: 'é array' }));
    expect(listarArquivados()).toEqual([]);
  });
});

describe('o recorte da lista', () => {
  const itens = [{ relatorioId: 'A' }, { relatorioId: 'B' }, { relatorioId: 'C' }];
  const arquivados = new Set(['B']);

  it('padrão esconde os arquivados', () => {
    expect(filtrarPorArquivo(itens, arquivados, 'ativos').map((i) => i.relatorioId)).toEqual(['A', 'C']);
  });

  it('"arquivados" mostra SÓ eles — o documento continua alcançável', () => {
    expect(filtrarPorArquivo(itens, arquivados, 'arquivados').map((i) => i.relatorioId)).toEqual(['B']);
  });

  it('"todos" não esconde nada', () => {
    expect(filtrarPorArquivo(itens, arquivados, 'todos')).toHaveLength(3);
  });
});

describe('renomear mexe no RÓTULO, e em mais nada', () => {
  it('troca o nome e preserva pdfRef, sha256, páginas e geradoEm', async () => {
    await salvarRelatorio(rel('REL-2'));
    const antes = carregarRelatorio('REL-2', TAG)!;

    expect(await renomearRelatorio('REL-2', TAG, '  Inspeção anual da caldeira  ')).toBe(true);

    const depois = carregarRelatorio('REL-2', TAG)!;
    expect(depois.nome).toBe('Inspeção anual da caldeira');
    expect(depois.pdfRef).toEqual(antes.pdfRef);
    expect(depois.sha256).toBe(antes.sha256);
    expect(depois.paginas).toBe(antes.paginas);
    expect(depois.geradoEm).toBe(antes.geradoEm);
    expect(depois.documentos).toEqual(antes.documentos);
    expect(depois.meta).toEqual(antes.meta);
  });

  it('nome vazio é recusado — linha sem identificação é pior que nome feio', async () => {
    await salvarRelatorio(rel('REL-3'));
    expect(await renomearRelatorio('REL-3', TAG, '   ')).toBe(false);
    expect(carregarRelatorio('REL-3', TAG)!.nome).toBe('Relatorio_REL-3.pdf');
  });

  it('registro inexistente devolve false, sem criar nada', async () => {
    expect(await renomearRelatorio('NAO-EXISTE', TAG, 'x')).toBe(false);
    expect(carregarRelatorio('NAO-EXISTE', TAG)).toBeNull();
  });
});
