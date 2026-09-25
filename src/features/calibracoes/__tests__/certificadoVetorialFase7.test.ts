import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pngSintetico } from '../../relatorios/pdfVetorial/pngSintetico.testutil';

/**
 * FASE 7 · o certificado interno vetorial NA EMISSÃO (25/09/2026).
 *
 * I · a prévia do rascunho é leitura pura;
 * J · emitido é arquivo: reabrir serve os bytes, nunca o gerador — inclusive
 *     os certificados RASTER emitidos antes desta fase;
 * K · certificado de laboratório externo não passa pelo gerador e sai byte a
 *     byte igual ao recebido.
 *
 * Armazenamento, bucket e `localStorage` são dublês; o gerador é o real, com
 * um espião contando as chamadas.
 */

// ── storage em memória, com registro de escritas ─────────────────────────────
const banco = new Map<string, unknown>();
const escritas: string[] = [];
const lidas: string[] = [];
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => {
    lidas.push(k);
    return banco.has(k) ? structuredClone(banco.get(k)) : null;
  },
  salvar: async (k: string, v: unknown) => {
    escritas.push(k);
    banco.set(k, structuredClone(v));
  },
  excluirChave: async (k: string) => {
    escritas.push(k);
    banco.delete(k);
  },
}));

// ── bucket/cofre ─────────────────────────────────────────────────────────────
const bucket = new Map<string, Uint8Array>();
const uploads: string[] = [];
let seq = 0;
vi.mock('../../../services/fotos', () => ({
  BUCKET: 'inspecao',
  salvarArquivo: async (b: Blob, escopo: string, ext: string, mime: string) => {
    const path = `org-1/${escopo}/${++seq}.${ext}`;
    uploads.push(path);
    bucket.set(path, new Uint8Array(await b.arrayBuffer()));
    return { bucket: 'inspecao', path, mimeType: mime, tamanho: b.size };
  },
  arquivoPendente: async () => false,
  baixarFoto: async (ref: { path: string }) => {
    const b = bucket.get(ref.path);
    if (!b) return null;
    const tipo = ref.path.endsWith('.png') ? 'image/png' : 'application/pdf';
    return new Blob([b.slice().buffer as ArrayBuffer], { type: tipo });
  },
  blobParaDataUrl: async (b: Blob) => `data:${b.type};base64,${Buffer.from(await b.arrayBuffer()).toString('base64')}`,
  montarPath: (org: string, escopo: string, ext: string) => `${org}/${escopo}/x.${ext}`,
}));

// ── o gerador REAL, contado ──────────────────────────────────────────────────
const chamadasGerador: string[] = [];
vi.mock('../../relatorios/pdfVetorial/certificadoCalibracao', async (original) => {
  const real = await original<typeof import('../../relatorios/pdfVetorial/certificadoCalibracao')>();
  return {
    ...real,
    gerarCertificadoCalibracaoPdf: async (...a: Parameters<typeof real.gerarCertificadoCalibracaoPdf>) => {
      chamadasGerador.push(a[0].numero);
      return real.gerarCertificadoCalibracaoPdf(...a);
    },
  };
});

// ── localStorage espião: as três chaves VIVAS do relatório em montagem ──────
const ls = new Map<string, string>();
const lsEscritas: string[] = [];
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
  setItem: (k: string, v: string) => {
    lsEscritas.push(k);
    ls.set(k, String(v));
  },
  removeItem: (k: string) => {
    lsEscritas.push(k);
    ls.delete(k);
  },
  clear: () => ls.clear(),
  key: (i: number) => [...ls.keys()][i] ?? null,
  get length() {
    return ls.size;
  },
};

beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (!String(url).startsWith('/fontes/')) return { ok: false, status: 404 };
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
});

import { sha256Hex, baixarArtefato } from '../../relatorios/artefatoRelatorio';
import { folhaDoRelatorio, salvarCalibracao } from '../calibracaoService';
import {
  bytesArquivadosDaFolha,
  EmissaoRecusada,
  emitirCertificado,
  gerarPdfCertificado,
  gerarPreviaCertificado,
} from '../emissaoCertificado';
import { artefatoDaCalibracao } from '../artefatoCalibracao';
import { montarTerceiro } from '../terceiro';
import type { DadosManometro, DadosPSV, DadosTerceiro } from '../tipos';

const TAG = 'ZZ-F7';
const LOGO_REF = { bucket: 'inspecao', path: 'org-1/logos/l1.png', mimeType: 'image/png', tamanho: 1 };
const RUB_REF = { bucket: 'inspecao', path: 'org-1/assinaturas/r1.png', mimeType: 'image/png', tamanho: 1 };
const CHAVES_VIVAS = ['nr13_relatorio_meta_atual', 'nr13_inspecao_atual', 'nr13_injecao_atual'];

function png(dataUrl: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataUrl.split(',')[1], 'base64'));
}

function manometro(over: Partial<DadosManometro> = {}): DadosManometro {
  return {
    id: 'cal-f7',
    tag: TAG,
    tipo: 'manometro',
    nome: 'Manômetro sintético',
    criadoEm: '25/09/2026',
    numeroCertificado: 'CERT-F7-1',
    dataEmissao: '',
    empresa: 'CLIENTE ZZ',
    endereco: 'Rua 1',
    instrumento: 'Manômetro sintético',
    fabricante: 'FabZZ',
    modelo: 'M1',
    serie: 'S1',
    referencia: '0 a 10',
    dataCalibracao: '24/09/2026',
    dataProxCalibracao: '24/09/2027',
    tempAr: '23',
    umidade: '50',
    local: 'Lab ZZ',
    padraoInst: 'P',
    padraoSerie: 'PS',
    padraoCert: 'PC',
    padraoVal: '01/01/2027',
    statusConclusao: 'aprovado',
    textoMotivo: 'ok',
    unidade: 'bar',
    origem: 'interna',
    status: 'rascunho',
    responsavel: { id: 'f1', nome: 'Eng. ZZ', funcao: 'Engenheiro', registro: 'CREA 1', assinaturaRef: RUB_REF },
    crescente: [{ vc: '1,00', vi: '1,01', erro: '0,01' }],
    incertezaC: '0,1',
    coefC: '2',
    decrescente: [{ vc: '1,00', vi: '1,02', erro: '0,02' }],
    incertezaD: '0,1',
    coefD: '2',
    ...over,
  };
}

async function texto(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out += t.items.map((x) => ('str' in x ? x.str : '')).join(' ') + ' ';
  }
  return out.replace(/\s+/g, ' ');
}

beforeEach(() => {
  banco.clear();
  bucket.clear();
  escritas.length = 0;
  lidas.length = 0;
  uploads.length = 0;
  chamadasGerador.length = 0;
  ls.clear();
  lsEscritas.length = 0;
  bucket.set(LOGO_REF.path, png(pngSintetico(120, 40, 3)));
  bucket.set(RUB_REF.path, png(pngSintetico(90, 30, 5)));
  banco.set('nr13_minha_empresa', { razao: 'ZZ ENGENHARIA', logoRef: LOGO_REF });
  // O relatório em montagem NOUTRA aba: estas chaves são dele.
  for (const k of CHAVES_VIVAS) ls.set(k, JSON.stringify({ dono: 'relatorio-aberto', k }));
});

// ── I · prévia só leitura ────────────────────────────────────────────────────

describe('I · a prévia do rascunho é leitura pura', () => {
  it('não grava registro, não publica arquivo, não toca as chaves vivas do relatório', async () => {
    const cal = manometro();
    const antes = CHAVES_VIVAS.map((k) => ls.get(k));
    const { bytes, paginas } = await gerarPreviaCertificado(cal);
    expect(paginas).toBe(1);
    expect(escritas).toEqual([]);
    expect(uploads).toEqual([]);
    expect(lsEscritas).toEqual([]);
    expect(CHAVES_VIVAS.map((k) => ls.get(k))).toEqual(antes);
    for (const k of CHAVES_VIVAS) expect(lidas).not.toContain(k);
    const t = await texto(bytes);
    expect(t).toContain('RASCUNHO');
    expect(t).toContain('Eng. ZZ');
  });

  it('prévia = documento: mesmo conteúdo da emissão, só sem a marca', async () => {
    const cal = manometro({ dataEmissao: '25/09/2026' });
    const previa = await texto((await gerarPreviaCertificado(cal)).bytes);
    const emitido = await texto((await gerarPdfCertificado({ ...cal, status: 'emitido' })).bytes);
    expect(previa.replace('RASCUNHO — NÃO EMITIDO', '').replace(/\s+/g, ' ').trim()).toBe(emitido.trim());
  });

  it('a tela do rascunho não monta palco nem iframe do template', () => {
    for (const f of ['src/features/calibracoes/PreviaCertificado.tsx', 'src/features/calibracoes/acoesPreviaCertificado.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/usePalcoDocumento|salvar\(|localStorage|arquivos-inspecao/);
    }
    const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
    expect(pagina).toContain('!arquivoAtual || ehRascunhoInterno(calAtual)');
    // Baixar/imprimir o rascunho passam pelo funil do trial, como exportarPdf/imprimirRelatorio.
    const acoes = readFileSync('src/features/calibracoes/acoesPreviaCertificado.ts', 'utf8');
    expect(acoes.match(/if \(avisarBloqueioDocumentos\(\)\) return;/g)).toHaveLength(2);
    const lote = readFileSync('src/features/calibracoes/ModalDetalhesLote.tsx', 'utf8');
    expect(lote).toContain('pular: !!arte || !arquivo || rascunho');
  });
});

// ── J · emitido é arquivo ────────────────────────────────────────────────────

describe('J · emitido: reabrir serve os bytes arquivados, nunca o gerador', () => {
  it('emite em vetor, arquiva, e a reabertura devolve o MESMO SHA sem gerar de novo', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    expect(chamadasGerador).toHaveLength(1);
    const arquivo = bucket.get(emitido.emissao!.pdfRef.path)!;
    expect(await sha256Hex(arquivo)).toBe(emitido.emissao!.sha256);
    expect(await texto(arquivo)).toContain('CERT-F7-1'); // texto extraível = vetor

    // Mudar a empresa, a logo e a rubrica DEPOIS não muda nada.
    banco.set('nr13_minha_empresa', { razao: 'OUTRA RAZAO', logoRef: { ...LOGO_REF, path: 'org-1/logos/nova.png' } });
    bucket.set(RUB_REF.path, png(pngSintetico(10, 10, 9)));
    for (let i = 0; i < 3; i++) {
      const reaberto = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);
      expect(await sha256Hex(reaberto!)).toBe(emitido.emissao!.sha256);
    }
    expect(chamadasGerador).toHaveLength(1);
    await expect(emitirCertificado(TAG, emitido)).rejects.toBeInstanceOf(EmissaoRecusada);
    expect(chamadasGerador).toHaveLength(1);
  });

  it('certificado RASTER emitido antes da Fase 7 continua sendo o seu arquivo, byte a byte', async () => {
    // Um "PDF raster" antigo: bytes quaisquer arquivados com o SHA da emissão.
    const antigo = new TextEncoder().encode('%PDF-1.7\n% raster antigo (JPEG de pagina inteira)\n%%EOF\n');
    const path = 'org-1/certificados-calibracao/antigo.pdf';
    bucket.set(path, antigo);
    const sha = await sha256Hex(antigo);
    const legado: DadosPSV = {
      ...(manometro() as unknown as DadosPSV),
      tipo: 'psv',
      id: 'cal-antigo',
      pressaoAbertura: '1',
      pressaoAjuste: '1',
      fechamento: '1',
      incerteza: '0',
      coef: '2',
      status: 'emitido',
      emissao: { pdfRef: { bucket: 'inspecao', path, mimeType: 'application/pdf', tamanho: antigo.length }, sha256: sha, emitidoEm: '2026-09-19T21:08:02Z', paginas: 1, pendente: false },
    };
    banco.set(`nr13_calibracao_item_${legado.id}`, legado);
    const reaberto = await bytesArquivadosDaFolha(`CERTIIFCADO-CAL-PSV.html?calibId=${legado.id}`);
    expect(Buffer.from(reaberto!).equals(Buffer.from(antigo))).toBe(true);
    expect(await sha256Hex(reaberto!)).toBe(sha);
    expect(chamadasGerador).toEqual([]);
    expect(escritas).toEqual([]);
    expect(artefatoDaCalibracao(legado)?.pdfRef.path).toBe(path);
  });

  it('a tela abre o ARTEFATO antes de qualquer caminho de prévia', () => {
    const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
    const iArte = pagina.indexOf('{artefatoAtual ? (\n            <div className="cal-preview-arquivo">'.replace(/\n/g, pagina.includes('\r\n') ? '\r\n' : '\n'));
    const iPrevia = pagina.indexOf('<PreviaCertificado');
    expect(iArte).toBeGreaterThan(0);
    expect(iArte).toBeLessThan(iPrevia);
  });
});

// ── K · externo intocado ─────────────────────────────────────────────────────

describe('K · certificado de laboratório externo: original, mesmo SHA, fora do gerador', () => {
  it('não passa pelo gerador e é servido byte a byte', async () => {
    const original = new TextEncoder().encode('%PDF-1.4\n% PDF do laboratorio externo, nunca tocado\n%%EOF\n');
    const ref = { bucket: 'inspecao', path: 'org-1/certificados-externos/lab.pdf', mimeType: 'application/pdf', tamanho: original.length };
    bucket.set(ref.path, original);
    const sha = await sha256Hex(original);
    const ext = montarTerceiro(
      {
        tipo: 'manometro',
        nome: 'PI-01',
        fabricante: 'F',
        modelo: 'M',
        serie: 'S',
        faixa: '0 a 10',
        unidade: 'bar',
        laboratorio: 'Lab Externo ZZ',
        responsavelExterno: 'Fulano',
        numeroCertificado: 'EXT-1',
        dataCalibracao: '10/09/2026',
        validade: '10/09/2027',
        statusConclusao: 'aprovado',
        observacoes: '',
      },
      TAG,
      { id: 'cal-ext', componenteId: 'c1' },
      { ref, nome: 'lab.pdf', sha256: sha },
    ) as DadosTerceiro;

    await expect(emitirCertificado(TAG, ext)).rejects.toBeInstanceOf(EmissaoRecusada);
    await expect(gerarPdfCertificado(ext as unknown as DadosManometro)).rejects.toBeInstanceOf(EmissaoRecusada);
    expect(folhaDoRelatorio(ext)).toBeNull();
    expect(chamadasGerador).toEqual([]);

    const arte = artefatoDaCalibracao(ext)!;
    expect(arte.pdfRef.path).toBe(ref.path);
    const servido = new Uint8Array(await (await baixarArtefato(arte))!.arrayBuffer());
    expect(Buffer.from(servido).equals(Buffer.from(original))).toBe(true);
    expect(await sha256Hex(servido)).toBe(ext.pdfExternoSha256);
    expect(uploads).toEqual([]);
  });

  it('nenhum caminho do gerador vetorial referencia o PDF externo', () => {
    for (const f of [
      'src/features/relatorios/pdfVetorial/certificadoCalibracao.ts',
      'src/features/calibracoes/emissaoCertificado.ts',
      'src/features/calibracoes/PreviaCertificado.tsx',
      'src/features/calibracoes/acoesPreviaCertificado.ts',
    ]) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/pdfExternoRef|certificados-externos\//);
    }
  });
});
