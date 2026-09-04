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

import { bytesDaEmissao, emissaoAtual, listarEmissoes, registrarEmissao, revisaoDe } from '../emissaoProntuario';

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

describe('ABRIR emissão arquivada NÃO regenera nada', () => {
  // Teste bloqueante: abrir um documento emitido pode significar UMA coisa —
  // servir os bytes do pdfRef. Se algum dia a abertura passar pelo gerador, por
  // dados vivos do equipamento ou por gravação, este teste quebra.
  const BYTES = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' });

  function deps() {
    const chamadas: string[] = [];
    return {
      chamadas,
      artefatoDe: (r: unknown) => {
        chamadas.push('artefatoDe');
        return r;
      },
      baixarArtefato: async () => {
        chamadas.push('baixarArtefato');
        return BYTES;
      },
    };
  }

  it('serve os bytes do pdfRef e NADA mais', async () => {
    const e = await registrarEmissao(TAG, emissao('f'.repeat(64)));
    const d = deps();
    const blob = await bytesDaEmissao(e, d as never);
    expect(blob).toBe(BYTES);
    // Só duas chamadas, e nenhuma delas é geração.
    expect(d.chamadas).toEqual(['artefatoDe', 'baixarArtefato']);
  });

  it('NÃO cria emissão nova nem mexe na lista, mesmo abrindo várias vezes', async () => {
    const e = await registrarEmissao(TAG, emissao('g'.repeat(64)));
    const antes = JSON.stringify(listarEmissoes(TAG));
    await bytesDaEmissao(e, deps() as never);
    await bytesDaEmissao(e, deps() as never);
    expect(listarEmissoes(TAG)).toHaveLength(1);
    expect(JSON.stringify(listarEmissoes(TAG))).toBe(antes);
  });

  it('NÃO altera sha256 nem pdfRef do registro', async () => {
    const e = await registrarEmissao(TAG, emissao('h'.repeat(64)));
    const shaAntes = e.sha256;
    const pathAntes = e.pdfRef.path;
    await bytesDaEmissao(e, deps() as never);
    const depois = emissaoAtual(TAG)!;
    expect(depois.sha256).toBe(shaAntes);
    expect(depois.pdfRef.path).toBe(pathAntes);
  });

  it('basta o REGISTRO: não lê nada do equipamento', async () => {
    // Nenhuma chave do equipamento existe no storage, e ainda assim abre.
    localStorage.clear();
    const solto = {
      pdfRef: { bucket: 'inspecao', path: 'org/relatorios/x.pdf', mimeType: 'application/pdf', tamanho: 4 },
      sha256: 'j'.repeat(64),
      paginas: 6,
    };
    const blob = await bytesDaEmissao(solto, deps() as never);
    expect(blob).toBe(BYTES);
  });

  it('sem arquivo resolvido ERRA — nunca cai em remontagem silenciosa', async () => {
    const e = await registrarEmissao(TAG, emissao('i'.repeat(64)));
    await expect(
      bytesDaEmissao(e, { artefatoDe: () => null, baixarArtefato: async () => BYTES } as never),
    ).rejects.toThrow(/não tem arquivo arquivado/);
    await expect(
      bytesDaEmissao(e, { artefatoDe: (r: unknown) => r, baixarArtefato: async () => null } as never),
    ).rejects.toThrow(/não voltou/);
  });
});
