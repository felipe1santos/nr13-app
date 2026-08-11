import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O prontuário do fabricante aceita PDF de até 8 MB (`LIMITE_PDF_BYTES`) e o
 * gravava INTEIRO em base64 dentro do `app_storage`. Era o maior peso possível
 * por chave em todo o sistema, e o app o rebaixava a cada hidratação: uma conta
 * com cinco equipamentos documentados torrava 40 MB por sincronização.
 */
const salvarMock = vi.fn<(chave: string, obj: unknown) => Promise<void>>(async () => {});
let lido: unknown = null;

vi.mock('../../../services/storage', () => ({
  salvar: (chave: string, obj: unknown) => salvarMock(chave, obj),
  ler: () => lido,
  excluirChave: async () => {},
}));

const subirMock = vi.fn(async (_b: Blob, escopo: string, ext: string, mime: string) => ({
  bucket: 'inspecao',
  path: `org-1/${escopo}/uuid.${ext}`,
  mimeType: mime,
  tamanho: 4,
}));
const baixarMock = vi.fn(async () => new Blob(['pdf']) as Blob | null);

vi.mock('../../../services/fotos', () => ({
  salvarArquivo: (b: Blob, e: string, x: string, m: string) => subirMock(b, e, x, m),
  baixarFoto: () => baixarMock(),
  blobParaDataUrl: async () => 'data:application/pdf;base64,DOBUCKET',
}));

import {
  gravarProntuarioFabricante,
  lerProntuarioFabricante,
  resolverPdfFabricante,
  type ProntuarioFabricanteSalvo,
} from '../ProntuarioFabricante';

const PDF = 'data:application/pdf;base64,AAAA';

const reg = (over: Partial<ProntuarioFabricanteSalvo> = {}): ProntuarioFabricanteSalvo => ({
  nome: 'prontuario.pdf',
  tamanho: 4,
  pdfBase64: '',
  enviadoEm: '2026-08-11T12:00:00.000Z',
  ...over,
});

beforeEach(() => {
  salvarMock.mockClear();
  subirMock.mockClear();
  baixarMock.mockClear();
  lido = null;
});

describe('prontuário do fabricante no bucket', () => {
  it('PDF novo sobe e o registro guarda só a referência', async () => {
    await gravarProntuarioFabricante('TAG-1', reg({ pdfBase64: PDF }));

    expect(subirMock).toHaveBeenCalledTimes(1);
    const [, escopo, ext] = subirMock.mock.calls[0];
    expect(escopo).toBe('prontuario-fabricante');
    expect(ext).toBe('pdf');

    const [chave, gravado] = salvarMock.mock.calls[0] as unknown as [string, ProntuarioFabricanteSalvo];
    expect(chave).toBe('nr13_pront_fab_TAG-1');
    expect(gravado.pdfBase64).toBe('');
    expect(gravado.pdfRef?.path).toBe('org-1/prontuario-fabricante/uuid.pdf');
    expect(gravado.nome).toBe('prontuario.pdf');
  });

  it('falha no upload NÃO perde o documento — grava o base64 como antes', async () => {
    subirMock.mockRejectedValueOnce(new Error('sem organização ativa'));

    await gravarProntuarioFabricante('TAG-1', reg({ pdfBase64: PDF }));

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, ProntuarioFabricanteSalvo];
    expect(gravado.pdfBase64).toBe(PDF);
    expect(gravado.pdfRef).toBeUndefined();
  });

  it('registro com ref é reconhecido como existente (sem base64)', () => {
    lido = reg({ pdfRef: { bucket: 'inspecao', path: 'p.pdf', mimeType: 'application/pdf', tamanho: 4 } });
    // Antes exigia `p.pdfBase64` não-vazio: um registro migrado apareceria como
    // "nenhum prontuário enviado" e o usuário reenviaria o arquivo.
    expect(lerProntuarioFabricante('TAG-1')).not.toBeNull();
  });

  it('resolverPdfFabricante busca no bucket e cai no base64 legado', async () => {
    const comRef = reg({ pdfRef: { bucket: 'inspecao', path: 'p.pdf', mimeType: 'application/pdf', tamanho: 4 } });
    expect(await resolverPdfFabricante(comRef)).toBe('data:application/pdf;base64,DOBUCKET');

    baixarMock.mockResolvedValueOnce(null);
    expect(await resolverPdfFabricante({ ...comRef, pdfBase64: PDF })).toBe(PDF);
  });
});
