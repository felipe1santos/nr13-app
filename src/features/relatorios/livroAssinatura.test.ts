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

/**
 * O bucket falso guarda por PATH. É o que permite provar as duas propriedades
 * que sustentam o desenho: conteúdo igual → mesmo path (dedup) e conteúdo
 * diferente → path diferente (imutabilidade histórica).
 */
const bucket = new Map<string, Blob>();
let pendentes = new Set<string>();

vi.mock('../../services/fotos', async (original) => {
  const mod = await original<typeof import('../../services/fotos')>();
  async function sha(buf: ArrayBuffer) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return {
    ...mod,
    salvarArquivoPorConteudo: vi.fn(async (blob: Blob, escopo: string, ext: string, mime: string) => {
      const path = `org-1/${escopo}/${await sha(await blob.arrayBuffer())}.${ext}`;
      bucket.set(path, blob);
      return { bucket: 'inspecao', path, mimeType: mime, tamanho: blob.size };
    }),
    arquivoPendente: vi.fn(async (path: string) => pendentes.has(path)),
    baixarFoto: vi.fn(async (ref: { path: string }) => bucket.get(ref.path) ?? null),
  };
});

import {
  camposDaRubrica,
  migrarRubricasDoLivro,
  migrarRubricasDeTodosOsLivros,
  referenciaDaRubrica,
} from './livroAssinatura';
import type { LivroEntrada } from './livroLacre';
import { hashDaEntrada, lacrarEntrada, verificarEntrada } from './livroLacre';

const RUBRICA_A = 'data:image/png;base64,' + btoa('rubrica-do-yuri-2024'.repeat(400));
const RUBRICA_B = 'data:image/png;base64,' + btoa('rubrica-do-yuri-2026'.repeat(400));

function entrada(over: Partial<LivroEntrada> = {}): LivroEntrada {
  return {
    id: 'LIV-1',
    data: '10/08/2026',
    tipo: 'Inspeção Periódica',
    descricao: 'Relatório de inspeção gerado',
    relatorioCodigo: 'REL-1',
    phNome: 'Eng',
    phCrea: '123',
    origem: 'auto',
    criadoEm: '2026-08-10T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  bucket.clear();
  pendentes = new Set();
});

describe('rubrica endereçada pelo conteúdo', () => {
  it('a MESMA rubrica vira o mesmo path — um arquivo, N referências', async () => {
    const r1 = await referenciaDaRubrica(RUBRICA_A);
    const r2 = await referenciaDaRubrica(RUBRICA_A);
    expect(r1!.path).toBe(r2!.path);
    expect(bucket.size).toBe(1); // 20 entradas do livro custariam 1 arquivo
  });

  it('rubrica DIFERENTE vira path diferente, e o arquivo antigo continua lá', async () => {
    const antiga = await referenciaDaRubrica(RUBRICA_A);
    const nova = await referenciaDaRubrica(RUBRICA_B);
    expect(nova!.path).not.toBe(antiga!.path);
    // É isto que dá a imutabilidade histórica: a entrada de 2024 aponta para o
    // endereço de 2024, e trocar a assinatura no cadastro não o alcança.
    expect(bucket.has(antiga!.path)).toBe(true);
    expect(bucket.get(antiga!.path)).not.toBe(bucket.get(nova!.path));
  });

  it('a entrada nova leva a referência, e NUNCA os dois campos', async () => {
    const campos = await camposDaRubrica(RUBRICA_A);
    expect(campos.assinaturaRef?.path).toBeTruthy();
    expect(campos.assinaturaImg).toBeUndefined();
    expect(JSON.stringify(campos).length).toBeLessThan(400); // ~150 B contra 55 KB
  });

  it('sem rubrica não inventa campo nenhum', async () => {
    expect(await camposDaRubrica(undefined)).toEqual({});
    expect(await camposDaRubrica('')).toEqual({});
  });
});

describe('migração do livro legado', () => {
  it('converte entrada SEM lacre e o base64 sai', async () => {
    localStorage.setItem('nr13_livro_V1', JSON.stringify([entrada({ assinaturaImg: RUBRICA_A })]));

    const r = await migrarRubricasDoLivro('nr13_livro_V1');
    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];

    expect(r.convertidas).toBe(1);
    expect(livro[0].assinaturaImg).toBeUndefined();
    expect((livro[0].assinaturaRef as { path: string }).path).toBeTruthy();
  });

  it('entrada LACRADA fica intacta — e continua íntegra pelo próprio lacre', async () => {
    const lacrada = await lacrarEntrada(entrada({ assinaturaImg: RUBRICA_A }), null);
    localStorage.setItem('nr13_livro_V1', JSON.stringify([lacrada]));

    const r = await migrarRubricasDoLivro('nr13_livro_V1');
    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];

    expect(r.lacradasIntactas).toBe(1);
    expect(r.convertidas).toBe(0);
    expect(livro[0].assinaturaImg).toBe(RUBRICA_A); // byte a byte
    // O ponto: se tivéssemos migrado, isto viraria 'adulterada'.
    expect(await verificarEntrada(livro[0])).toBe('integra');
  });

  it('trocar assinaturaImg por assinaturaRef QUEBRARIA o lacre — é por isso que não migramos', async () => {
    const lacrada = await lacrarEntrada(entrada({ assinaturaImg: RUBRICA_A }), null);
    const ref = await referenciaDaRubrica(RUBRICA_A);
    const { assinaturaImg: _fora, ...resto } = lacrada;
    const adulterada = { ...resto, assinaturaRef: ref } as LivroEntrada;
    expect(await hashDaEntrada(adulterada)).not.toBe(lacrada.sha256);
    expect(await verificarEntrada(adulterada)).toBe('adulterada');
  });

  it('upload ainda pendente ADIA: o base64 não sai antes do arquivo confirmar', async () => {
    const ref = await referenciaDaRubrica(RUBRICA_A);
    pendentes.add(ref!.path);
    localStorage.setItem('nr13_livro_V1', JSON.stringify([entrada({ assinaturaImg: RUBRICA_A })]));

    const r = await migrarRubricasDoLivro('nr13_livro_V1');
    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];

    expect(r.adiadas).toBe(1);
    expect(livro[0].assinaturaImg).toBe(RUBRICA_A); // rubrica preservada
  });

  it('é idempotente: a segunda passada não converte nada e não reescreve', async () => {
    localStorage.setItem('nr13_livro_V1', JSON.stringify([entrada({ assinaturaImg: RUBRICA_A })]));
    await migrarRubricasDoLivro('nr13_livro_V1');
    const depoisDaPrimeira = localStorage.getItem('nr13_livro_V1');

    const segunda = await migrarRubricasDoLivro('nr13_livro_V1');

    expect(segunda.convertidas).toBe(0);
    expect(localStorage.getItem('nr13_livro_V1')).toBe(depoisDaPrimeira);
    expect(bucket.size).toBe(1); // path é o hash: reenviar não duplica arquivo
  });

  it('livro vazio, ausente ou corrompido não derruba a migração', async () => {
    expect(await migrarRubricasDoLivro('nr13_livro_INEXISTENTE')).toEqual({ convertidas: 0, lacradasIntactas: 0, adiadas: 0 });
    localStorage.setItem('nr13_livro_V2', 'não é json');
    expect((await migrarRubricasDoLivro('nr13_livro_V2')).convertidas).toBe(0);
  });

  it('varre todos os livros e ignora nr13_livro_config_', async () => {
    localStorage.setItem('nr13_livro_V1', JSON.stringify([entrada({ assinaturaImg: RUBRICA_A })]));
    localStorage.setItem('nr13_livro_V2', JSON.stringify([entrada({ id: 'L2', assinaturaImg: RUBRICA_B })]));
    localStorage.setItem('nr13_livro_config_V1', JSON.stringify({ mostrarLogo: true }));

    const r = await migrarRubricasDeTodosOsLivros();

    expect(r.convertidas).toBe(2);
    expect(r.tags.sort()).toEqual(['V1', 'V2']);
    expect(localStorage.getItem('nr13_livro_config_V1')).toBe(JSON.stringify({ mostrarLogo: true }));
  });
});

describe('peso do livro conforme cresce', () => {
  it('20 entradas com a mesma rubrica não repetem o desenho', async () => {
    const campos = await camposDaRubrica(RUBRICA_A);
    const livro = Array.from({ length: 20 }, (_, i) => entrada({ id: `LIV-${i}`, ...campos }));

    const bytes = JSON.stringify(livro).length;
    const bytesAntes = JSON.stringify(
      Array.from({ length: 20 }, (_, i) => entrada({ id: `LIV-${i}`, assinaturaImg: RUBRICA_A })),
    ).length;

    expect(bucket.size).toBe(1);
    expect(bytes).toBeLessThan(bytesAntes / 20);
    expect(JSON.stringify(livro)).not.toContain('data:image');
  });
});
