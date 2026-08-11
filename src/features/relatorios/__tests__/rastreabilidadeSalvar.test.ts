import { beforeEach, describe, expect, it, vi } from 'vitest';

// Este arquivo é separado do rastreabilidadeService.test.ts porque precisa MOCKAR o
// storage para inspecionar o que chega ao Supabase — e vi.mock vale para o arquivo todo.
const salvarMock = vi.fn<(chave: string, obj: unknown) => Promise<void>>(async () => {});

vi.mock('../../../services/storage', () => ({
  salvar: (chave: string, obj: unknown) => salvarMock(chave, obj),
  ler: () => null,
  excluirChave: async () => {},
  listarChavesComPrefixo: () => [],
  lerRemoto: async () => null,
}));

const subirMock = vi.fn(async (_blob: Blob, escopo: string, ext: string, mime: string) => ({
  bucket: 'inspecao',
  path: `org-1/${escopo}/uuid-1.${ext}`,
  mimeType: mime,
  tamanho: 3,
}));
const baixarMock = vi.fn(async () => new Blob(['pdf']) as Blob | null);

vi.mock('../../../services/fotos', () => ({
  salvarArquivo: (b: Blob, e: string, x: string, m: string) => subirMock(b, e, x, m),
  baixarFoto: () => baixarMock(),
  blobParaDataUrl: async () => 'data:application/pdf;base64,DOBUCKET',
  removerFoto: async () => {},
  ehRef: (v: unknown) =>
    typeof v === 'object' && v !== null && typeof (v as { path?: unknown }).path === 'string',
}));

import { salvarRastreabilidade, resolverPdf, temPdfDe } from '../rastreabilidadeService';
import type { Rastreabilidade } from '../rastreabilidadeService';
import { guardarPdf } from '../../../services/pdfStore';

const PDF = 'data:application/pdf;base64,AAAA';

const enxuto = (over: Partial<Rastreabilidade> = {}): Rastreabilidade => ({
  id: 'x1',
  nome: 'Manômetro padrão MP-01',
  certificadoPadrao: 'CERT-1',
  validade: '2027-01-01',
  pdfBase64: '', // como vem do cache: o arquivo mora no IndexedDB
  temPdf: true,
  injetarNoRelatorio: true,
  criadoEm: '20/07/2026',
  tipoInstrumento: 'manometro',
  ...over,
});

beforeEach(() => {
  salvarMock.mockClear();
  subirMock.mockClear();
  baixarMock.mockClear();
});

describe('PDF de rastreabilidade vai para o bucket, não para o app_storage', () => {
  // ANTES: `pdfBase64` seguia COMPLETO para o Supabase (o §2-bis só o tirava do
  // localStorage). Medido na conta gabriel.dadona em 11/08/2026: 5451 KB e 1941 KB
  // em DOIS registros, baixados inteiros a cada hidratação do app — o maior peso
  // isolado da conta e combustível direto do egress que estourou a cota.
  it('PDF novo sobe para o bucket e o registro guarda só a referência', async () => {
    await salvarRastreabilidade(enxuto({ id: 'novo', pdfBase64: PDF, temPdf: undefined }));

    expect(subirMock).toHaveBeenCalledTimes(1);
    const [, escopo, ext, mime] = subirMock.mock.calls[0];
    expect(escopo).toBe('certificados');
    expect(ext).toBe('pdf');
    expect(mime).toBe('application/pdf');

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe(''); // o peso NÃO vai para o app_storage
    expect(gravado.pdfRef?.path).toBe('org-1/certificados/uuid-1.pdf');
    expect(gravado.temPdf).toBe(true);
    expect(temPdfDe(gravado)).toBe(true);
  });

  it('registro que já tem ref não sobe de novo nem recarrega o arquivo', async () => {
    const comRef = enxuto({
      id: 'jaref',
      pdfBase64: '',
      pdfRef: { bucket: 'inspecao', path: 'org-1/certificados/velho.pdf', mimeType: 'application/pdf', tamanho: 9 },
    });

    await salvarRastreabilidade({ ...comRef, injetarNoRelatorio: false });

    expect(subirMock).not.toHaveBeenCalled();
    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfRef?.path).toBe('org-1/certificados/velho.pdf');
    expect(gravado.pdfBase64).toBe('');
  });

  it('registro com ref NÃO carrega base64 junto para o app_storage', async () => {
    // A tela de Certificados pré-preenche `pdfBase64` com o arquivo resolvido
    // para exibir "Trocar PDF". Se esse valor viajasse junto no save, o peso
    // voltaria para o app_storage pela porta dos fundos — exatamente o que esta
    // mudança existe para impedir.
    const comRef = enxuto({
      id: 'prefill',
      pdfBase64: PDF,
      pdfRef: { bucket: 'inspecao', path: 'org-1/certificados/velho.pdf', mimeType: 'application/pdf', tamanho: 9 },
    });

    await salvarRastreabilidade(comRef);

    expect(subirMock).not.toHaveBeenCalled();
    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe('');
    expect(gravado.pdfRef?.path).toBe('org-1/certificados/velho.pdf');
  });

  it('resolverPdf busca pelo ref antes de cair no caminho legado', async () => {
    const r = enxuto({
      id: 'lê',
      pdfBase64: '',
      pdfRef: { bucket: 'inspecao', path: 'org-1/certificados/x.pdf', mimeType: 'application/pdf', tamanho: 9 },
    });

    expect(await resolverPdf(r)).toBe('data:application/pdf;base64,DOBUCKET');
    expect(baixarMock).toHaveBeenCalledTimes(1);
  });

  it('ref sem arquivo recuperável NÃO devolve lixo — cai para o legado', async () => {
    // Bucket fora do ar / arquivo removido: o certificado legado no Supabase
    // ainda é o socorro dos relatórios salvos.
    baixarMock.mockResolvedValueOnce(null);
    const r = enxuto({
      id: 'semarquivo',
      pdfBase64: '',
      temPdf: true,
      pdfRef: { bucket: 'inspecao', path: 'org-1/certificados/sumiu.pdf', mimeType: 'application/pdf', tamanho: 9 },
    });

    await guardarPdf('nr13_rastreab_semarquivo', PDF);
    expect(await resolverPdf(r)).toBe(PDF);
  });
});

describe('salvarRastreabilidade — blindagem do PDF ao regravar registro enxuto', () => {
  // Sem a blindagem, o soft-delete gravaria no Supabase um registro sem PDF por cima
  // do completo: o certificado sumiria de vez, inclusive dos relatórios já salvos que
  // o referenciam por id.
  it('soft-delete preserva o PDF no valor enviado ao storage', async () => {
    await guardarPdf('nr13_rastreab_x1', PDF);

    await salvarRastreabilidade({ ...enxuto(), substituidoEm: '30/07/2026' });

    const [chave, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(chave).toBe('nr13_rastreab_x1');
    expect(gravado.pdfBase64).toBe(PDF);
    expect(gravado.substituidoEm).toBe('30/07/2026');
  });

  it('alternar a caixinha de injeção preserva o PDF e o id', async () => {
    await guardarPdf('nr13_rastreab_x1', PDF);

    await salvarRastreabilidade({ ...enxuto(), injetarNoRelatorio: false });

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe(PDF);
    expect(gravado.id).toBe('x1'); // preferência não cria versão nova
    expect(gravado.injetarNoRelatorio).toBe(false);
  });

  it('registro que já traz o PDF não busca de novo — sobe o que veio', async () => {
    // Contrato mudou em 11/08/2026: o PDF que chega vai para o bucket em vez de
    // ser gravado dentro do registro. A intenção original do teste continua
    // valendo e é o que se verifica aqui: nada é RE-resolvido do storage.
    await salvarRastreabilidade(enxuto({ id: 'x2', pdfBase64: 'data:application/pdf;base64,ZZZZ' }));

    expect(subirMock).toHaveBeenCalledTimes(1);
    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe('');
    expect(gravado.pdfRef?.path).toBe('org-1/certificados/uuid-1.pdf');
  });

  it('registro sem PDF nenhum (temPdf ausente) grava vazio sem tentar resolver', async () => {
    await salvarRastreabilidade(enxuto({ id: 'x3', temPdf: undefined }));

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe('');
  });
});
