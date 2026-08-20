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
  caminhosAssinados: [] as string[],
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
          estado.caminhosAssinados.push(path);
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
const cofre = vi.hoisted(() => ({
  mapa: new Map<string, Record<string, unknown>>(),
  /** >0 = a N-ésima gravação em diante falha. Usado no teste da D-18. */
  falharAPartirDe: 0,
  gravacoes: 0,
}));
vi.mock('./fotoStore', () => ({
  guardar: vi.fn(async (f: Record<string, unknown>) => {
    cofre.gravacoes++;
    if (cofre.falharAPartirDe && cofre.gravacoes >= cofre.falharAPartirDe) throw new Error('cofre cheio');
    cofre.mapa.set(f.path as string, f);
  }),
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
  baixarFoto,
  contarFotosPendentes,
  drenarFotosPendentes,
  ehBase64,
  ehRef,
  limparCacheDeUrls,
  montarPath,
  caminhoDaMiniatura,
  removerFoto,
  resolverFoto,
  salvarFoto,
  type RefFoto,
} from './fotos';

// A compressão usa canvas, que não existe no vitest. Mockada aqui para o teste
// cobrir o que é lógica — caminho, cofre, upload, fila e resolução. A compressão
// real é exercitada na validação pelo navegador.
const imagem = vi.hoisted(() => ({ falhaMiniatura: false }));
vi.mock('./imagem', () => ({
  comprimirParaBlob: vi.fn(async () => new Blob(['imagem-binaria-falsa'])),
  gerarMiniatura: vi.fn(async () => {
    if (imagem.falhaMiniatura) throw new Error('canvas sem memória');
    return new Blob(['mini']);
  }),
  PRINCIPAL_LARGURA: 1200,
  PRINCIPAL_ALTURA: 1600,
  PRINCIPAL_QUALIDADE: 0.7,
}));

function arquivoFalso(nome = 'foto.jpg'): File {
  return new File([new Blob(['conteudo'])], nome, { type: 'image/jpeg' });
}

beforeEach(() => {
  cofre.mapa.clear();
  cofre.falharAPartirDe = 0;
  cofre.gravacoes = 0;
  estado.uploads = [];
  estado.removidos = [];
  estado.erroUpload = null;
  estado.assinadas = 0;
  estado.caminhosAssinados = [];
  imagem.falhaMiniatura = false;
  limparCacheDeUrls();
  (globalThis as Record<string, unknown>).URL = Object.assign(globalThis.URL ?? {}, {
    createObjectURL: () => 'blob:local/fake',
    revokeObjectURL: () => {},
  });
  // Dublê de rede para o N-01: baixar a miniatura devolve bytes.
  (globalThis as Record<string, unknown>).fetch = async () => ({
    ok: true,
    blob: async () => new Blob(['mini-bytes'], { type: 'image/jpeg' }),
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
    // Principal + miniatura (Fase 5). A principal é sempre a primeira.
    expect(estado.uploads).toHaveLength(2);
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
    // Com a miniatura da Fase 5 o registro tem DUAS referências e ainda cabe em meio KB.
    expect(tamanhoRef).toBeLessThan(600);
    expect(tamanhoBase64Tipico / tamanhoRef).toBeGreaterThan(500);
  });
});

describe('offline', () => {
  it('sem rede a foto é salva mesmo assim, e fica pendente', async () => {
    estado.erroUpload = { message: 'Failed to fetch' };

    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(estado.uploads).toHaveLength(0);
    // Principal + miniatura: as duas nascem pendentes e as duas estão no aparelho.
    expect(await contarFotosPendentes()).toBe(2);
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

    expect(r.enviadas).toBe(2); // principal + miniatura, cada uma por sua conta
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

    expect(estado.removidos[0]).toEqual([ref.path, caminhoDaMiniatura(ref.path)]);
    expect(cofre.mapa.has(ref.path)).toBe(false);
  });

  it('referência ausente não vira erro', async () => {
    await expect(removerFoto(undefined)).resolves.toBeUndefined();
    expect(estado.removidos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — miniatura
// ---------------------------------------------------------------------------
describe('miniatura (Fase 5)', () => {
  it('nasce irmã da principal, na MESMA pasta — a policy do bucket não muda', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(ref.thumb).toBeDefined();
    expect(ref.thumb!.path).toBe(caminhoDaMiniatura(ref.path));
    expect(ref.thumb!.path.startsWith(`${ORG}/ACA_2002/`)).toBe(true);
    // Mesma primeira pasta = mesma organização = mesma policy (I-22).
    expect(ref.thumb!.path.split('/')[0]).toBe(ref.path.split('/')[0]);
  });

  it('é um OBJETO com `path`, não um campo string — é isso que o Portal autoriza', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    // `portal_arquivo.coletarPaths` recolhe todo objeto que tenha `path`.
    // Uma string solta não seria recolhida e o cliente receberia `nao_disponivel`.
    expect(typeof ref.thumb).toBe('object');
    expect(typeof ref.thumb!.path).toBe('string');
    expect(ref.thumb!.bucket).toBe(BUCKET);
  });

  it('as duas variantes vão ao cofre ANTES da rede', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    expect(cofre.mapa.has(ref.path)).toBe(true);
    expect(cofre.mapa.has(ref.thumb!.path)).toBe(true);
  });

  it('D-18 · falha ao GERAR a miniatura não custa a foto', async () => {
    imagem.falhaMiniatura = true;
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(ehRef(ref)).toBe(true);
    expect(ref.thumb).toBeUndefined();
    expect(cofre.mapa.has(ref.path)).toBe(true);
    expect(estado.uploads.map((u) => u.path)).toEqual([ref.path]);
  });

  it('D-18 · falha ao GRAVAR a miniatura no cofre não custa a foto', async () => {
    cofre.falharAPartirDe = 2; // a 1ª gravação (a principal) passa; a 2ª (a miniatura) quebra
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(ehRef(ref)).toBe(true);
    expect(ref.thumb).toBeUndefined();
    expect(cofre.mapa.has(ref.path)).toBe(true);
  });

  it('falha de UPLOAD da miniatura não desfaz nada — ela fica pendente como a principal', async () => {
    estado.erroUpload = { message: 'sem rede' };
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');

    expect(ref.thumb).toBeDefined();
    expect(cofre.mapa.get(ref.thumb!.path)?.pendente).toBe(true);
    expect(cofre.mapa.get(ref.path)?.pendente).toBe(true);
  });
});

describe('resolver por variante', () => {
  it('variante `thumb` usa a miniatura', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    cofre.mapa.delete(ref.path); // força ir ao bucket para poder ver qual caminho foi pedido
    cofre.mapa.delete(ref.thumb!.path);

    await resolverFoto({ ref }, { variante: 'thumb' });
    expect(estado.caminhosAssinados).toEqual([ref.thumb!.path]);
  });

  it('sem variante, continua sendo a principal — nenhuma tela muda sem ser tocada', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    cofre.mapa.delete(ref.path);
    cofre.mapa.delete(ref.thumb!.path);

    const url = await resolverFoto({ ref });
    expect(estado.caminhosAssinados).toEqual([ref.path]);
    expect(url).not.toContain('.thumb.jpg');
  });

  it('foto ANTIGA (sem miniatura) pedida como thumb cai na principal', async () => {
    const ref: RefFoto = {
      bucket: BUCKET, path: `${ORG}/x/antiga.jpg`, mimeType: 'image/jpeg', tamanho: 10,
    };
    const url = await resolverFoto({ ref }, { variante: 'thumb' });
    expect(url).toContain('antiga.jpg');
  });

  it('base64 legado continua aparecendo mesmo pedindo thumb', async () => {
    const legado = 'data:image/jpeg;base64,AAAA';
    expect(await resolverFoto({ base64: legado }, { variante: 'thumb' })).toBe(legado);
  });
});

describe('baixarFoto — o caminho do DOCUMENTO', () => {
  it('não conhece variante: mesmo com miniatura, entrega a principal', async () => {
    const ref = await salvarFoto(arquivoFalso(), 'ACA 2002');
    expect(ref.thumb).toBeDefined();

    const blob = await baixarFoto(ref);
    // O cofre tem as duas; a que volta é a do `ref.path`.
    expect(blob).toBe(cofre.mapa.get(ref.path)?.blob);
    expect(blob).not.toBe(cofre.mapa.get(ref.thumb!.path)?.blob);
  });
});

// ---------------------------------------------------------------------------
// N-01 — o cofre guarda a miniatura que baixou
// ---------------------------------------------------------------------------
describe('N-01 · miniatura baixada vira cache local', () => {
  const refComThumb = (): RefFoto => ({
    bucket: BUCKET,
    path: `${ORG}/x/foto.jpg`,
    mimeType: 'image/jpeg',
    tamanho: 112000,
    thumb: { bucket: BUCKET, path: `${ORG}/x/foto.thumb.jpg`, mimeType: 'image/jpeg', tamanho: 16000 },
  });

  it('a SEGUNDA resolução não vai à rede — era o re-download por sessão', async () => {
    const ref = refComThumb();
    expect(await resolverFoto({ ref }, { variante: 'thumb' })).toBe('blob:local/fake');
    expect(estado.assinadas).toBe(1);
    expect(cofre.mapa.has(ref.thumb!.path)).toBe(true);

    // Simula uma sessão nova: o cache de objectURL some, o cofre permanece.
    limparCacheDeUrls();
    await resolverFoto({ ref }, { variante: 'thumb' });
    expect(estado.assinadas).toBe(1); // nenhuma assinatura nova, nenhum byte novo
  });

  it('guarda como JÁ ENVIADA — não entra na fila de upload', async () => {
    const ref = refComThumb();
    await resolverFoto({ ref }, { variante: 'thumb' });
    expect(cofre.mapa.get(ref.thumb!.path)?.pendente).toBe(false);
    expect(await contarFotosPendentes()).toBe(0);
  });

  it('a PRINCIPAL continua sem ser cacheada por download', async () => {
    const ref = refComThumb();
    await resolverFoto({ ref });
    expect(cofre.mapa.has(ref.path)).toBe(false);
  });

  it('falha ao baixar os bytes ainda exibe a foto pela URL assinada', async () => {
    const ref = refComThumb();
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error('rede caiu no meio');
    };
    const url = await resolverFoto({ ref }, { variante: 'thumb' });
    expect(url).toContain('https://bucket.exemplo/');
    expect(cofre.mapa.has(ref.thumb!.path)).toBe(false);
  });
});
