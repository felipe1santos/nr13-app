import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O cliente do Portal NÃO fala com o Storage direto.
 *
 * Depois da Fase 0-B a policy do bucket recusa leitura para `papel='cliente'`
 * (fail closed, D-04). Se `fotos.ts` continuasse chamando `createSignedUrl` /
 * `storage.download` para o cliente, o Portal simplesmente pararia de mostrar
 * foto e PDF no instante em que a policy fosse aplicada — e a falha seria
 * visual, sem erro claro.
 *
 * Estes testes travam o roteamento: cliente sai pela Edge `portal_arquivo`,
 * papéis internos seguem pelo SDK como sempre.
 */

const storageMock = {
  createSignedUrl: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
};
const invokeMock = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    storage: { from: () => storageMock },
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
  escopoStorageAtual: async () => ({ id: 'org-1', coluna: 'org_id' }),
  TABELA_STORAGE: 'app_storage',
}));

// Cofre local vazio: força o caminho de rede, que é o que este teste cobre.
vi.mock('../fotoStore', () => ({
  guardar: vi.fn(),
  obter: vi.fn(async () => null),
  listarPendentes: vi.fn(async () => []),
  marcarEnviada: vi.fn(),
  registrarFalha: vi.fn(),
  remover: vi.fn(),
}));

const REF = { bucket: 'inspecao', path: 'org-1/TAG-1/abc.jpg', mimeType: 'image/jpeg', tamanho: 10 };

describe('fotos: roteamento do cliente do Portal', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const { limparCacheDeUrls } = await import('../fotos');
    limparCacheDeUrls();
  });

  it('CLIENTE: resolverFoto pede a URL à edge, nunca ao SDK', async () => {
    localStorage.setItem('nr13_papel', 'cliente');
    invokeMock.mockResolvedValue({ data: { url: 'https://assinada/abc.jpg' }, error: null });

    const { resolverFoto } = await import('../fotos');
    const url = await resolverFoto({ ref: REF });

    expect(url).toBe('https://assinada/abc.jpg');
    expect(invokeMock).toHaveBeenCalledWith('portal_arquivo', { body: { path: REF.path } });
    expect(storageMock.createSignedUrl).not.toHaveBeenCalled();
  });

  it('INTERNO: resolverFoto continua usando o SDK', async () => {
    localStorage.setItem('nr13_papel', 'funcionario');
    storageMock.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://sdk/abc.jpg' },
      error: null,
    });

    const { resolverFoto } = await import('../fotos');
    const url = await resolverFoto({ ref: REF });

    expect(url).toBe('https://sdk/abc.jpg');
    expect(storageMock.createSignedUrl).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('CLIENTE: baixarFoto busca pela URL da edge, nunca por storage.download', async () => {
    localStorage.setItem('nr13_papel', 'cliente');
    invokeMock.mockResolvedValue({ data: { url: 'https://assinada/abc.jpg' }, error: null });
    const blob = new Blob(['x']);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => blob })));

    const { baixarFoto } = await import('../fotos');
    const res = await baixarFoto(REF);

    expect(res).toBe(blob);
    expect(storageMock.download).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('INTERNO: baixarFoto continua usando storage.download', async () => {
    localStorage.setItem('nr13_papel', 'mestre');
    const blob = new Blob(['y']);
    storageMock.download.mockResolvedValue({ data: blob, error: null });

    const { baixarFoto } = await import('../fotos');
    const res = await baixarFoto(REF);

    expect(res).toBe(blob);
    expect(storageMock.download).toHaveBeenCalledWith(REF.path);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('CLIENTE: edge recusando devolve null, sem cair no SDK', async () => {
    localStorage.setItem('nr13_papel', 'cliente');
    invokeMock.mockResolvedValue({ data: { erro: 'nao_disponivel' }, error: null });

    const { resolverFoto } = await import('../fotos');
    const url = await resolverFoto({ ref: REF });

    // Sem fallback para o SDK: cair nele mascararia a recusa enquanto a policy
    // antiga ainda permitisse, e o defeito só apareceria no dia do SQL.
    expect(url).toBeNull();
    expect(storageMock.createSignedUrl).not.toHaveBeenCalled();
  });
});
