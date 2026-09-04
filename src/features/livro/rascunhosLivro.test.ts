import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// A suíte roda em `node`: shim de localStorage (mesmo padrão dos outros testes)
// e de `crypto.subtle`, que é o que calcula o lacre.
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
if (!globalThis.crypto?.subtle) {
  (globalThis as Record<string, unknown>).crypto = webcrypto;
}

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  chaveLivro,
  chaveRascunhoLivro,
  excluirRascunhoLivro,
  listarRascunhosLivro,
  salvarRascunhoLivro,
  trancarRegistroLivro,
} from './rascunhosLivro';
import { ehOficial, estadoDoRegistro, somenteOficiais } from './estadoRegistro';
import { verificarCadeia, verificarEntrada, type LivroEntrada } from '../relatorios/livroLacre';

const TAG = 'VASO A23';

function registro(id: string, sobrescrever: Partial<LivroEntrada> = {}): LivroEntrada {
  return {
    id,
    data: '2026-09-04',
    tipo: 'Manutenção corretiva',
    descricao: 'Troca da válvula de segurança',
    relatorioCodigo: '',
    phNome: 'Eng. Teste',
    phCrea: 'CREA-1',
    origem: 'manual',
    criadoEm: '2026-09-04T00:00:00.000Z',
    ...sobrescrever,
  };
}

beforeEach(() => localStorage.clear());

describe('rascunho NÃO entra no livro oficial', () => {
  it('salvar grava só a chave de rascunho', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));

    expect(localStorage.getItem(chaveRascunhoLivro(TAG))).not.toBeNull();
    // A chave oficial nem existe: é ela que a projeção conta (`livro_entradas`),
    // que o Portal lê e que a folha `LIVRO-REGISTRO.html` imprime.
    expect(localStorage.getItem(chaveLivro(TAG))).toBeNull();
    expect(listarRascunhosLivro(TAG)).toHaveLength(1);
  });

  it('o rascunho nasce sem lacre e marcado como rascunho', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    const r = listarRascunhosLivro(TAG)[0];
    expect(r.estado).toBe('rascunho');
    expect(r.sha256).toBeUndefined();
    expect(r.lacrado).toBe(false);
    expect(estadoDoRegistro(r)).toBe('rascunho');
    expect(ehOficial(r)).toBe(false);
  });

  it('regravar substitui o mesmo id — não cria um segundo rascunho', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    await salvarRascunhoLivro(TAG, registro('R1', { descricao: 'texto corrigido' }));
    const lista = listarRascunhosLivro(TAG);
    expect(lista).toHaveLength(1);
    expect(lista[0].descricao).toBe('texto corrigido');
  });

  it('excluir tira o rascunho e não deixa resíduo', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    await excluirRascunhoLivro(TAG, 'R1');
    expect(listarRascunhosLivro(TAG)).toEqual([]);
  });
});

describe('TRANCAR: lacra, encadeia e move para o livro oficial', () => {
  it('o registro sai dos rascunhos e entra no livro, lacrado', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    const trancado = await trancarRegistroLivro(TAG, 'R1');

    expect(trancado.estado).toBe('trancado');
    expect(trancado.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(trancado.shaAnterior).toBeNull(); // primeiro da cadeia
    expect(await verificarEntrada(trancado)).toBe('integra');

    expect(listarRascunhosLivro(TAG)).toEqual([]);
    const livro = JSON.parse(localStorage.getItem(chaveLivro(TAG))!) as LivroEntrada[];
    expect(livro).toHaveLength(1);
    expect(livro[0].id).toBe('R1');
  });

  it('o segundo registro encadeia no primeiro, e a cadeia fica íntegra', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    const primeiro = await trancarRegistroLivro(TAG, 'R1');
    await salvarRascunhoLivro(TAG, registro('R2', { descricao: 'segunda ocorrência' }));
    const segundo = await trancarRegistroLivro(TAG, 'R2');

    expect(segundo.shaAnterior).toBe(primeiro.sha256);
    const livro = JSON.parse(localStorage.getItem(chaveLivro(TAG))!) as LivroEntrada[];
    expect(await verificarCadeia(livro)).toEqual({ ok: true, problemas: [] });
  });

  it('ACRESCENTA AO FIM mesmo com data anterior — a cadeia é de lacres, não de datas', async () => {
    await salvarRascunhoLivro(TAG, registro('R1', { data: '2026-09-04' }));
    await trancarRegistroLivro(TAG, 'R1');
    await salvarRascunhoLivro(TAG, registro('R2', { data: '2020-01-01' }));
    await trancarRegistroLivro(TAG, 'R2');

    const livro = JSON.parse(localStorage.getItem(chaveLivro(TAG))!) as LivroEntrada[];
    // Ordenar por data aqui reordenaria entradas lacradas — e o gatilho
    // `livro_imutavel.sql` recusa um valor novo cuja sequência lacrada não
    // comece pela antiga.
    expect(livro.map((e) => e.id)).toEqual(['R1', 'R2']);
    expect((await verificarCadeia(livro)).ok).toBe(true);
  });

  it('o estado trancado está DENTRO do hash — marcar depois deixaria a prova incompleta', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    const trancado = await trancarRegistroLivro(TAG, 'R1');
    // Rebaixar o estado quebra a verificação: é o que prova que ele foi hasheado.
    expect(await verificarEntrada({ ...trancado, estado: 'rascunho' })).toBe('adulterada');
  });

  it('editar um registro trancado é detectado', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    const trancado = await trancarRegistroLivro(TAG, 'R1');
    expect(await verificarEntrada({ ...trancado, descricao: 'texto trocado' })).toBe('adulterada');
  });

  it('trancar duas vezes não duplica o registro', async () => {
    await salvarRascunhoLivro(TAG, registro('R1'));
    await trancarRegistroLivro(TAG, 'R1');
    // Simula a retomada de um trancamento que gravou o livro e falhou depois.
    await salvarRascunhoLivro(TAG, registro('R1'));
    await trancarRegistroLivro(TAG, 'R1');

    const livro = JSON.parse(localStorage.getItem(chaveLivro(TAG))!) as LivroEntrada[];
    expect(livro).toHaveLength(1);
    expect(listarRascunhosLivro(TAG)).toEqual([]);
  });

  it('rascunho inexistente recusa, sem tocar no livro', async () => {
    await expect(trancarRegistroLivro(TAG, 'NAO-EXISTE')).rejects.toThrow();
    expect(localStorage.getItem(chaveLivro(TAG))).toBeNull();
  });
});

describe('registro LEGADO é oficial — e isto é a regra inteira', () => {
  it('entrada antiga, sem estado e sem sha256, NÃO é rascunho', () => {
    const antiga = registro('LIV-2019');
    expect(antiga.estado).toBeUndefined();
    expect(antiga.sha256).toBeUndefined();
    expect(estadoDoRegistro(antiga)).toBe('legado');
    expect(ehOficial(antiga)).toBe(true);
  });

  it('entrada lacrada ANTES do campo `estado` conta como trancada', () => {
    const lacradaAntiga = registro('LIV-2026', { sha256: 'a'.repeat(64) });
    expect(estadoDoRegistro(lacradaAntiga)).toBe('trancado');
  });

  it('somenteOficiais tira o rascunho e preserva legado e trancado', () => {
    const lista = [
      registro('legado'),
      registro('trancado', { estado: 'trancado', sha256: 'b'.repeat(64) }),
      registro('rascunho', { estado: 'rascunho' }),
    ];
    expect(somenteOficiais(lista).map((e) => e.id)).toEqual(['legado', 'trancado']);
  });
});
