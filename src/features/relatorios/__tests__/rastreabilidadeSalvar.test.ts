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

import { salvarRastreabilidade } from '../rastreabilidadeService';
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

beforeEach(() => salvarMock.mockClear());

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

  it('registro que já traz o PDF é gravado como veio (não busca de novo)', async () => {
    await salvarRastreabilidade(enxuto({ id: 'x2', pdfBase64: 'data:application/pdf;base64,ZZZZ' }));

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe('data:application/pdf;base64,ZZZZ');
  });

  it('registro sem PDF nenhum (temPdf ausente) grava vazio sem tentar resolver', async () => {
    await salvarRastreabilidade(enxuto({ id: 'x3', temPdf: undefined }));

    const [, gravado] = salvarMock.mock.calls[0] as unknown as [string, Rastreabilidade];
    expect(gravado.pdfBase64).toBe('');
  });
});
