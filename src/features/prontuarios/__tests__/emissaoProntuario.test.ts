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

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { emissaoAtual, listarEmissoes, registrarEmissao, revisaoDe } from '../emissaoProntuario';

const TAG = 'VP-77';

function emissao(sha: string, numero = 'REL-1') {
  return {
    numero,
    emissao: '04/09/2026',
    motor: 'vetorial' as const,
    pdfRef: { bucket: 'inspecao', path: `org/relatorios/${sha}.pdf`, mimeType: 'application/pdf', tamanho: 1000 },
    sha256: sha,
    paginas: 6,
    tamanho: 1000,
    geradoEm: new Date().toISOString(),
    pdfPendente: false,
  };
}

beforeEach(() => localStorage.clear());

describe('emitir NÃO sobrescreve — cada emissão é uma revisão', () => {
  it('a primeira emissão vira a vigente', async () => {
    const e = await registrarEmissao(TAG, emissao('a'.repeat(64)));
    expect(listarEmissoes(TAG)).toHaveLength(1);
    expect(emissaoAtual(TAG)!.id).toBe(e.id);
    expect(revisaoDe(TAG, e.id)).toBe(1);
  });

  it('emitir de novo ACRESCENTA e a anterior continua alcançável', async () => {
    const r1 = await registrarEmissao(TAG, emissao('a'.repeat(64), 'REL-1'));
    const r2 = await registrarEmissao(TAG, emissao('b'.repeat(64), 'REL-2'));

    const lista = listarEmissoes(TAG);
    expect(lista).toHaveLength(2);
    expect(emissaoAtual(TAG)!.id).toBe(r2.id);

    // A PRIMEIRA continua inteira: pdfRef e SHA intocados.
    const antiga = lista.find((e) => e.id === r1.id)!;
    expect(antiga.sha256).toBe('a'.repeat(64));
    expect(antiga.pdfRef.path).toBe(`org/relatorios/${'a'.repeat(64)}.pdf`);
    expect(antiga.numero).toBe('REL-1');
    expect(revisaoDe(TAG, r1.id)).toBe(1);
    expect(revisaoDe(TAG, r2.id)).toBe(2);
  });

  it('NENHUM pdfRef já gravado é substituído por uma emissão nova', async () => {
    await registrarEmissao(TAG, emissao('a'.repeat(64)));
    const antes = listarEmissoes(TAG).map((e) => ({ id: e.id, sha: e.sha256, path: e.pdfRef.path }));
    await registrarEmissao(TAG, emissao('c'.repeat(64)));
    const depois = listarEmissoes(TAG).slice(0, 1).map((e) => ({ id: e.id, sha: e.sha256, path: e.pdfRef.path }));
    expect(depois).toEqual(antes);
  });

  it('emitir duas vezes SEM mudar nada não duplica a linha', async () => {
    const r1 = await registrarEmissao(TAG, emissao('d'.repeat(64)));
    const r2 = await registrarEmissao(TAG, emissao('d'.repeat(64)));
    expect(listarEmissoes(TAG)).toHaveLength(1);
    expect(r2.id).toBe(r1.id);
  });

  it('equipamento sem emissão devolve null, não erro', () => {
    expect(emissaoAtual('NUNCA-EMITIDO')).toBeNull();
    expect(listarEmissoes('NUNCA-EMITIDO')).toEqual([]);
  });

  it('valor corrompido na chave não derruba a lista', () => {
    localStorage.setItem(`nr13_pront_emitido_${TAG}`, JSON.stringify({ nao: 'é array' }));
    expect(listarEmissoes(TAG)).toEqual([]);
    expect(emissaoAtual(TAG)).toBeNull();
  });

  it('o motor fica gravado para AUDITORIA — não é decisão de leitura', async () => {
    const e = await registrarEmissao(TAG, { ...emissao('e'.repeat(64)), motor: 'atual' });
    expect(e.motor).toBe('atual');
    // Trocar o motor global depois não muda o que ficou gravado.
    expect(emissaoAtual(TAG)!.motor).toBe('atual');
  });
});
