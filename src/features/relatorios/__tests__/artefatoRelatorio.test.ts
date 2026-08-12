import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O artefato é o que transforma "relatório salvo" de RECEITA em DOCUMENTO.
 * Estes testes cobrem as três garantias que sustentam isso: o hash é do
 * conteúdo, o arquivo vai para a pasta da organização, e nada é dado por
 * publicado sem o arquivo existir.
 */
const subirMock = vi.fn(async (_b: Blob, escopo: string, ext: string, mime: string) => ({
  bucket: 'inspecao',
  path: `org-1/${escopo}/uuid-1.${ext}`,
  mimeType: mime,
  tamanho: 10,
}));
const baixarMock = vi.fn(async (): Promise<Blob | null> => null);
const pendenteMock = vi.fn(async () => false);

vi.mock('../../../services/fotos', () => ({
  salvarArquivo: (b: Blob, e: string, x: string, m: string) => subirMock(b, e, x, m),
  baixarFoto: () => baixarMock(),
  arquivoPendente: async () => pendenteMock(),
  montarPath: (org: string, escopo: string, ext: string) => `${org}/${escopo}/uuid.${ext}`,
}));

import {
  sha256Hex,
  publicarArtefato,
  verificarIntegridade,
  caminhoDoRelatorio,
  ESCOPO_RELATORIOS,
  type PdfArtefato,
} from '../artefatoRelatorio';

const bytes = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  subirMock.mockClear();
  baixarMock.mockClear();
  pendenteMock.mockClear();
  pendenteMock.mockResolvedValue(false);
});

describe('sha256Hex', () => {
  it('devolve o hash conhecido de "abc"', async () => {
    // Vetor de teste público do SHA-256. Se este valor mudar, o hash deixou de
    // ser SHA-256 e a prova de integridade não vale nada.
    expect(await sha256Hex(bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('conteúdo diferente muda o hash', async () => {
    expect(await sha256Hex(bytes('relatorio A'))).not.toBe(await sha256Hex(bytes('relatorio B')));
  });

  it('mesmo conteúdo dá sempre o mesmo hash', async () => {
    expect(await sha256Hex(bytes('igual'))).toBe(await sha256Hex(bytes('igual')));
  });
});

describe('publicarArtefato', () => {
  it('sobe o PDF na pasta de relatórios e devolve ref + hash + páginas', async () => {
    const a = await publicarArtefato(bytes('%PDF-1.4 conteudo'), 31);

    expect(subirMock).toHaveBeenCalledTimes(1);
    const [blob, escopo, ext, mime] = subirMock.mock.calls[0];
    expect(escopo).toBe(ESCOPO_RELATORIOS);
    expect(ext).toBe('pdf');
    expect(mime).toBe('application/pdf');
    expect(blob.type).toBe('application/pdf');

    expect(a.pdfRef.path).toBe('org-1/relatorios/uuid-1.pdf');
    expect(a.sha256).toBe(await sha256Hex(bytes('%PDF-1.4 conteudo')));
    expect(a.paginas).toBe(31);
    expect(a.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('PDF vazio é recusado — nunca publicar artefato sem conteúdo', async () => {
    await expect(publicarArtefato(new Uint8Array(), 0)).rejects.toThrow(/vazio/i);
  });

  it('falha de upload PROPAGA — quem salva não pode marcar como salvo', async () => {
    subirMock.mockRejectedValueOnce(new Error('sem organização ativa'));
    await expect(publicarArtefato(bytes('x'), 1)).rejects.toThrow(/organiza/i);
  });

  it('upload NÃO confirmado marca o artefato como PENDENTE', async () => {
    // Bug medido em produção em 11/08/2026: o upload devolveu 500 com o
    // navegador ONLINE, `salvarArquivo` engoliu a falha (é o comportamento certo
    // para foto de campo — a fila reenvia) e o relatório foi gravado dizendo que
    // estava sincronizado, com `pdfRef` apontando para um arquivo que não existia
    // no bucket. A verdade tem que vir do cofre, não de `navigator.onLine`.
    pendenteMock.mockResolvedValueOnce(true);
    const a = await publicarArtefato(bytes('%PDF-1.4 x'), 1);
    expect(a.pendente).toBe(true);
  });

  it('upload confirmado marca como NÃO pendente', async () => {
    pendenteMock.mockResolvedValueOnce(false);
    const a = await publicarArtefato(bytes('%PDF-1.4 x'), 1);
    expect(a.pendente).toBe(false);
  });

  it('o caminho começa pela organização — é o que isola os clientes no bucket', () => {
    expect(caminhoDoRelatorio('org-42').startsWith('org-42/')).toBe(true);
    expect(caminhoDoRelatorio('org-42')).toContain('/relatorios/');
  });
});

describe('verificarIntegridade', () => {
  const artefato = (sha: string): PdfArtefato => ({
    pdfRef: { bucket: 'inspecao', path: 'org-1/relatorios/a.pdf', mimeType: 'application/pdf', tamanho: 3 },
    sha256: sha,
    geradoEm: '2026-08-11T12:00:00.000Z',
    paginas: 1,
    pendente: false,
  });

  it('arquivo intacto confere', async () => {
    baixarMock.mockResolvedValueOnce(new Blob([bytes('conteudo')]));
    expect(await verificarIntegridade(artefato(await sha256Hex(bytes('conteudo'))))).toBe(true);
  });

  it('arquivo trocado NÃO confere', async () => {
    baixarMock.mockResolvedValueOnce(new Blob([bytes('adulterado')]));
    expect(await verificarIntegridade(artefato(await sha256Hex(bytes('conteudo'))))).toBe(false);
  });

  it('sem arquivo devolve null — "não deu para verificar" não é "não confere"', async () => {
    baixarMock.mockResolvedValueOnce(null);
    expect(await verificarIntegridade(artefato('qualquer'))).toBeNull();
  });
});
