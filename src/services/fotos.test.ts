import { describe, it, expect, beforeEach, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

const ORG = '06f84f2e-5dd5-475d-a8e5-29d839d1fe5e';
const OUTRA_ORG = '99f642d3-6efd-446d-9e76-d234ad8d211c';

const estado = vi.hoisted(() => ({
  uploads: [] as Array<{ path: string; corpo: unknown }>,
  removidos: [] as string[][],
  erroUpload: null as { message: string } | null,
  assinadas: 0,
}));

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string, corpo: unknown) => {
          if (estado.erroUpload) return { data: null, error: estado.erroUpload };
          estado.uploads.push({ path, corpo });
          return { data: { path }, error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => {
          estado.assinadas++;
          return { data: { signedUrl: `https://bucket.exemplo/${path}?token=abc` }, error: null };
        }),
        download: vi.fn(async () => ({ data: new Blob(['bytes']), error: null })),
        remove: vi.fn(async (paths: string[]) => {
          estado.removidos.push(paths);
          return { data: null, error: null };
        }),
      })),
    },
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id' as const, id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

// Cofre em memória: o IndexedDB real não existe no vitest, e o que importa aqui
// é o CONTRATO (o blob é guardado antes do upload e sobrevive à falha dele).
const cofre = vi.hoisted(() => ({ mapa: new Map<string, Record<string, unknown>>() }));
vi.mock('./fotoStore', () => ({
  guardar: vi.fn(async (f: Record<string, unknown>) => void cofre.mapa.set(f.path as string, f)),
  obter: vi.fn(async (p: string) => cofre.mapa.get(p) ?? null),
  listarPendentes: vi.fn(async () => [...cofre.mapa.values()].filter((f) => f.pendente)),
  marcarEnviada: vi.fn(async (p: string) => {
    const f = cofre.mapa.get(p);
    if (f) cofre.mapa.set(p, { ...f, pendente: false });
  }),
  registrarFalha: vi.fn(async (p: string, erro: string) => {
    const f = cofre.mapa.get(p);
    if (f) cofre.mapa.set(p, { ...f, tentativas: (f.tentativas as number) + 1, erro });
  }),
  remover: vi.fn(async (p: string) => void cofre.mapa.delete(p)),
  fechar: vi.fn(),
}));

import {
  BUCKET,
  contarFotosPendentes,
  drenarFotosPendentes,
  ehBase64,
  ehRef,
  limparCacheDeUrls,
  montarPath,
  removerFoto,
  resolverFoto,
  salvarFoto,
  type RefFoto,
} from './fotos';

// A compressão usa canvas, que não existe no vitest. Mockada aqui para o teste
// cobrir o que é lógica — caminho, cofre, upload, fila e resolução. A compressão
// real é exercitada na validação pelo navegador.
vi.mock('./imagem', () => ({
  comprimirParaBlob: vi.fn(async () => new Blob(['imagem-binaria-falsa'])),
}));

function arquivoFalso(nome = 'foto.jpg'): File {
  return new File([new Blob(['conteudo'])], nome, { type: 'image/jpeg' });
}

beforeEach(() => {
  cofre.mapa.clear();
  estado.uploads = [];
  estado.removidos = [];
  estado.erroUpload = null;
  estado.assinadas = 0;
  limparCacheDeUrls();
  (globalThis as Record<string, unknown>).URL = Object.assign(globalThis.URL ?? {}, {
    createObjectURL: () => 'blob:local/fake',
    revokeObjectURL: () => {},
  });
});

describe('caminho no bucket', () => {
  it('começa SEMPRE pela organização — é o que a policy compara', () => {
    const path = montarPath(ORG, 'ACA 2002');
    expect(path.startsWith(`${ORG}/`)).toBe(true);
  });

  it('a organização A não consegue montar caminho dentro da B', () => {
    // A policy compara `storage.foldername(name)[1]` com `org_atual()`. Um path
    // montado com a org da sessão nunca aponta para a pasta de outra.
    const path = montarPath(ORG, 'equipamento');
    expect(path.includes(OUTRA_ORG)).toBe(false);
  });

  it('sanitiza a TAG e usa nome imutável (sem sobrescrever nem cachear errado)', () => {
    const a = montarPath(ORG, 'CPA F085273/25004021');
    const b = montarPath(ORG, 'CPA F085273/25004021');
    expect(a).not.toContain('/25004021/'); // barra da TAG não vira pasta nova
    expect(a).not.toBe(b); // dois uploads nunca colidem
    expect(a.endsWith('.jpg')).toBe(true);
  });
});

describe('reconhecimento de formato', () => {
  it('distingue referência de base64 legado', () => {
    expect(ehRef({ bucket: 'inspecao', path: 'a/b.jpg' })).toBe(true);
    expect(ehRef({ bucket: 'inspecao', path: '' })).toBe(false);
    expect(ehRef('data:image/jpeg;base64,AAA')).toBe(false);
    expect(ehBase64('data:image/jpeg;base64,AAA')).toBe(true);
    expect(ehBase64('')).toBe(false);
  });
});

describe('salvar foto', () => {
  it('sobe para o bucket e devolve SÓ referência — nada de base64', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(ref.bucket).toBe(BUCKET);
    expect(ref.path.startsWith(`${ORG}/ACA_2002/`)).toBe(true);
    expect(ref.mimeType).toBe('image/jpeg');
    expect(ref.tamanho).toBeGreaterThan(0);
    // O que vai para o app_storage não pode conter imagem nenhuma.
    expect(JSON.stringify(ref)).not.toContain('data:image');
    expect(JSON.stringify(ref)).not.toContain('base64');
    expect(estado.uploads).toHaveLength(1);
    expect(estado.uploads[0].path).toBe(ref.path);
  });

  it('guarda o blob ANTES de tentar a rede', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    expect(cofre.mapa.has(ref.path)).toBe(true);
  });

  it('o registro salvo é ordens de grandeza menor que o base64 equivalente', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    const tamanhoRef = JSON.stringify(ref).length;
    // Uma foto de inspeção comprimida a 800px pesa ~180 KB; em base64, ~240 KB.
    const tamanhoBase64Tipico = 240 * 1024;
    expect(tamanhoRef).toBeLessThan(300);
    expect(tamanhoBase64Tipico / tamanhoRef).toBeGreaterThan(500);
  });
});

describe('offline', () => {
  it('sem rede a foto é salva mesmo assim, e fica pendente', async () => {
    estado.erroUpload = { message: 'Failed to fetch' };

    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(estado.uploads).toHaveLength(0);
    expect(await contarFotosPendentes()).toBe(1);
    // A ÚNICA cópia da foto continua no aparelho.
    expect(cofre.mapa.get(ref.path)?.pendente).toBe(true);
    expect(cofre.mapa.get(ref.path)?.blob).toBeInstanceOf(Blob);
  });

  it('o caminho gravado no banco já é o definitivo, mesmo antes de subir', async () => {
    // Sem isso o registro precisaria ser reescrito depois do upload, e um
    // aparelho que nunca mais abrisse o app deixaria o dado apontando p/ nada.
    estado.erroUpload = { message: 'Failed to fetch' };
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    estado.erroUpload = null;
    await drenarFotosPendentes();

    expect(estado.uploads[0].path).toBe(ref.path);
  });

  it('ao voltar a rede, a fila sobe e a foto deixa de ser pendente', async () => {
    estado.erroUpload = { message: 'Failed to fetch' };
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    estado.erroUpload = null;

    const r = await drenarFotosPendentes();

    expect(r.enviadas).toBe(1);
    expect(await contarFotosPendentes()).toBe(0);
    expect(cofre.mapa.get(ref.path)?.pendente).toBe(false);
  });

  it('NUNCA apaga a cópia local — nem depois de confirmar o upload', async () => {
    // Apagar economizaria disco e custaria a foto na tela de quem está sem
    // sinal, que é o cenário principal do app.
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    await drenarFotosPendentes();
    expect(cofre.mapa.get(ref.path)?.blob).toBeInstanceOf(Blob);
  });

  it('falha de upload conta tentativa e preserva a pendência', async () => {
    estado.erroUpload = { message: 'timeout' };
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    await drenarFotosPendentes();

    expect(cofre.mapa.get(ref.path)?.tentativas).toBeGreaterThanOrEqual(1);
    expect(cofre.mapa.get(ref.path)?.pendente).toBe(true);
  });
});

describe('resolver para exibição', () => {
  it('usa o blob local quando existe — sem tocar na rede', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    const url = await resolverFoto({ ref });

    expect(url).toBe('blob:local/fake');
    expect(estado.assinadas).toBe(0); // egress zero
  });

  it('sem cópia local, pede URL assinada ao bucket', async () => {
    const ref: RefFoto = { bucket: BUCKET, path: `${ORG}/x/y.jpg`, mimeType: 'image/jpeg', tamanho: 10 };
    const url = await resolverFoto({ ref });

    expect(url).toContain('https://bucket.exemplo/');
    expect(estado.assinadas).toBe(1);
  });

  it('foto ANTIGA em base64 continua aparecendo', async () => {
    const legado = 'data:image/jpeg;base64,AAAA';
    expect(await resolverFoto({ base64: legado })).toBe(legado);
    expect(await resolverFoto(legado)).toBe(legado);
  });

  it('sem foto nenhuma devolve null em vez de imagem quebrada', async () => {
    expect(await resolverFoto(null)).toBeNull();
    expect(await resolverFoto({})).toBeNull();
    expect(await resolverFoto({ base64: '' })).toBeNull();
  });
});

describe('remover foto', () => {
  it('apaga do bucket e do cofre local', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    await removerFoto(ref);

    expect(estado.removidos[0]).toEqual([ref.path]);
    expect(cofre.mapa.has(ref.path)).toBe(false);
  });

  it('referência ausente não vira erro', async () => {
    await expect(removerFoto(undefined)).resolves.toBeUndefined();
    expect(estado.removidos).toHaveLength(0);
  });
});
