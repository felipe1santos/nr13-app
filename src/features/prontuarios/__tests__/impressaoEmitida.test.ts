import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fase 12 · IMPRIMIR é servir o ARQUIVO.
 *
 * Estes testes travam a última divergência que o inventário achou: o PDF do
 * prontuário já era vetorial e arquivado, mas o botão "Imprimir" ainda
 * rasterizava as seis folhas montadas na tela — papel feito com os dados de HOJE
 * para um documento emitido meses atrás.
 *
 * O que fica provado aqui: imprimir resolve o MESMO `pdfRef` que visualizar e
 * baixar, e não escreve nada.
 */

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

// O download do artefato é o único lado externo: devolve o blob e ANOTA o pdfRef
// que recebeu. É por essa anotação que se prova a identidade dos três caminhos.
const pedidos: unknown[] = [];
const BYTES = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });

vi.mock('../../relatorios/artefatoRelatorio', async (original) => {
  const real = await original<typeof import('../../relatorios/artefatoRelatorio')>();
  return {
    ...real,
    baixarArtefato: async (a: { pdfRef: unknown }) => {
      pedidos.push(a.pdfRef);
      return BYTES;
    },
  };
});

import { artefatoDe } from '../../relatorios/artefatoRelatorio';
import { bytesDaEmissao, emissaoAtual, listarEmissoes, registrarEmissao } from '../emissaoProntuario';
import { fonteDeImpressao } from '../../documentos/fonteImpressao';
import { baixarPdfArquivado, imprimirPdfArquivado } from '../../../components/VisualizadorPdf';

const TAG = 'VP-IMPRESSAO';
const SHA = 'a'.repeat(64);
const REF = { bucket: 'inspecao', path: 'org/relatorios/abc.pdf', mimeType: 'application/pdf', tamanho: 71426 };

function emissao() {
  return {
    numero: 'REL-1',
    emissao: '19/08/2026',
    motor: 'vetorial' as const,
    pdfRef: REF,
    sha256: SHA,
    paginas: 6,
    tamanho: 71426,
    geradoEm: '2026-09-04T16:56:20.151Z',
    pdfPendente: false,
  };
}

// window/URL não existem no ambiente `node` do Vitest — o que interessa é PARA ONDE
// o arquivo vai, não o leitor do navegador.
const aberturas: string[] = [];
const baixados: string[] = [];
function prepararNavegador() {
  aberturas.length = 0;
  baixados.length = 0;
  (globalThis as Record<string, unknown>).window = {
    open: (u: string) => {
      aberturas.push(u);
      return {};
    },
    setTimeout: () => 0,
  };
  (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:teste';
  (URL as unknown as Record<string, unknown>).revokeObjectURL = () => undefined;
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      set download(v: string) {
        baixados.push(v);
      },
      href: '',
      click: () => undefined,
      remove: () => undefined,
    }),
    body: { appendChild: () => undefined },
  };
}

beforeEach(() => {
  localStorage.clear();
  pedidos.length = 0;
  prepararNavegador();
});

describe('prontuário emitido: imprimir serve o ARQUIVO', () => {
  it('a decisão é do `pdfRef`: emitido = arquivo, não emitido = prévia', async () => {
    expect(fonteDeImpressao(emissaoAtual(TAG))).toBe('previa');
    const e = await registrarEmissao(TAG, emissao());
    expect(fonteDeImpressao(e)).toBe('arquivo');
  });

  it('VISUALIZAR, BAIXAR e IMPRIMIR pedem o MESMO pdfRef', async () => {
    const e = await registrarEmissao(TAG, emissao());
    const arte = artefatoDe(e)!;

    await bytesDaEmissao(e, { artefatoDe, baixarArtefato: (await import('../../relatorios/artefatoRelatorio')).baixarArtefato });
    await baixarPdfArquivado(arte, 'prontuario.pdf');
    await imprimirPdfArquivado(arte);

    expect(pedidos).toHaveLength(3);
    expect(pedidos[0]).toEqual(REF);
    expect(pedidos[1]).toEqual(REF);
    expect(pedidos[2]).toEqual(REF);
    // E o artefato levado aos três é o mesmo: SHA e páginas do registro.
    expect(arte.sha256).toBe(SHA);
    expect(arte.paginas).toBe(6);
  });

  it('IMPRIMIR não cria emissão, não muda versão, não mexe no histórico', async () => {
    const e = await registrarEmissao(TAG, emissao());
    const antes = JSON.stringify(listarEmissoes(TAG));

    await imprimirPdfArquivado(artefatoDe(e)!);
    await imprimirPdfArquivado(artefatoDe(e)!);

    expect(listarEmissoes(TAG)).toHaveLength(1);
    expect(JSON.stringify(listarEmissoes(TAG))).toBe(antes);
    expect(emissaoAtual(TAG)!.sha256).toBe(SHA);
    expect(emissaoAtual(TAG)!.geradoEm).toBe('2026-09-04T16:56:20.151Z');
    expect(aberturas).toEqual(['blob:teste', 'blob:teste']);
  });

  it('documento arquivado pelo motor RASTER imprime os próprios bytes', async () => {
    // Nada no caminho de impressão consulta o motor: quem manda é o `pdfRef`.
    const e = await registrarEmissao(TAG, { ...emissao(), motor: 'atual' });
    expect(fonteDeImpressao(e)).toBe('arquivo');
    await imprimirPdfArquivado(artefatoDe(e)!);
    expect(pedidos[0]).toEqual(REF);
    expect(listarEmissoes(TAG)).toHaveLength(1);
  });

  it('sem arquivo no cofre nem no bucket, imprimir FALHA — não cai na prévia calada', async () => {
    const e = await registrarEmissao(TAG, emissao());
    const mod = await import('../../relatorios/artefatoRelatorio');
    const espiao = vi.spyOn(mod, 'baixarArtefato').mockResolvedValue(null);
    await expect(imprimirPdfArquivado(artefatoDe(e)!)).resolves.toBe(false);
    expect(aberturas).toEqual([]);
    espiao.mockRestore();
  });
});
