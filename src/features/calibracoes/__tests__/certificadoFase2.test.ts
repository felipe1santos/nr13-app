import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pngSintetico } from '../../relatorios/pdfVetorial/pngSintetico.testutil';

// Fontes do PDF vetorial (Carlito) lidas de `public/`; o resto (selo) não existe aqui.
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const caminho = resolve(process.cwd(), 'public', String(url).replace(/^\//, ''));
    if (!String(url).startsWith('/fontes/')) return { ok: false, status: 404 };
    const buf = readFileSync(caminho);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
});

/**
 * Revisão do engenheiro, fase 2 — C.2 (responsável/assinatura), C.3 (emissão
 * imutável com SHA-256 + pdfRef) e D (terceiro / instrumentos).
 *
 * O armazenamento, o bucket e o host da folha são dublês em memória: o que se
 * prova aqui é a REGRA — quem pode emitir, o que é gravado, que os bytes
 * arquivados são os bytes gerados, e que nada depois da emissão os altera.
 */

// ── storage em memória ─────────────────────────────────────────────────────
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
}));

// ── bucket/cofre em memória ────────────────────────────────────────────────
const bucket = new Map<string, Uint8Array>();
let pendenteNoCofre = false;
let seq = 0;
vi.mock('../../../services/fotos', () => ({
  BUCKET: 'inspecao',
  salvarArquivo: async (b: Blob, escopo: string, ext: string, mime: string) => {
    const path = `org-1/${escopo}/${++seq}.${ext}`;
    bucket.set(path, new Uint8Array(await b.arrayBuffer()));
    return { bucket: 'inspecao', path, mimeType: mime, tamanho: b.size };
  },
  arquivoPendente: async () => pendenteNoCofre,
  baixarFoto: async (ref: { path: string }) => {
    const img = imagens.get(ref.path);
    if (img) return img === 'indisponivel' ? null : new Blob([Buffer.from(img.split(',')[1], 'base64')], { type: 'image/png' });
    const b = bucket.get(ref.path);
    return b ? new Blob([b.slice().buffer as ArrayBuffer], { type: 'application/pdf' }) : null;
  },
  blobParaDataUrl: async (b: Blob) => `data:${b.type};base64,${Buffer.from(await b.arrayBuffer()).toString('base64')}`,
  montarPath: (org: string, escopo: string, ext: string) => `${org}/${escopo}/x.${ext}`,
}));

// ── as imagens do cofre (logo e rubrica) — PNG sintético; 'indisponivel' = não baixa ──
// Fase 7 · a emissão não monta mais folha HTML: desenha em vetor e resolve a
// logo e a rubrica pelo cofre/bucket (`baixarFoto`).
const imagens = new Map<string, string>();
const LOGO_PNG = pngSintetico(120, 40, 3);
const RUB_PNG = pngSintetico(90, 30, 5);
function imagensPadrao() {
  imagens.clear();
  imagens.set('org-1/logos/l1.png', LOGO_PNG);
  imagens.set('org-1/assinaturas/abc.png', RUB_PNG);
}

import { sha256Hex } from '../../relatorios/artefatoRelatorio';
import {
  CertificadoEmitidoImutavel,
  arquivoCalibracao,
  contagemParaRelatorio,
  excluirCalibracao,
  folhaDoRelatorio,
  salvarCalibracao,
} from '../calibracaoService';
import { bytesArquivadosDaFolha, emitirCertificado, EmissaoRecusada } from '../emissaoCertificado';
import { avisosEmissao, pendenciasEmissao, snapshotResponsavel } from '../responsavelCalibracao';
import { montarTerceiro, faltasTerceiro } from '../terceiro';
import { artefatoDaCalibracao } from '../artefatoCalibracao';
import type { DadosManometro, DadosTerceiro } from '../tipos';
import type { Funcionario } from '../../cadastros/tipos';

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out += t.items.map((x) => ('str' in x ? x.str : '')).join(' ') + ' ';
  }
  return out;
}

const TAG = 'ZZ-CAL';
const REF_RUBRICA = { bucket: 'inspecao', path: 'org-1/assinaturas/abc.png', mimeType: 'image/png', tamanho: 10 };
const ENG: Funcionario = {
  id: 'f1',
  nome: 'Eng. Ana Souza',
  crea: 'CREA-SP 123',
  tipo: 'Engenheiro',
  funcao: 'Engenheira Mecânica',
  assinatura: 'data:image/png;base64,VELHA',
  assinaturaRef: REF_RUBRICA,
} as Funcionario;

function manometro(over: Partial<DadosManometro> = {}): DadosManometro {
  return {
    id: 'cal-1',
    tag: TAG,
    tipo: 'manometro',
    nome: 'Manômetro principal',
    criadoEm: '18/09/2026',
    numeroCertificado: 'CERT-001',
    dataEmissao: '18/09/2026',
    empresa: 'Cliente ZZ',
    endereco: 'Rua A',
    instrumento: 'Manômetro principal',
    fabricante: 'Wika',
    modelo: 'M1',
    serie: 'S-1',
    referencia: '0 a 10',
    dataCalibracao: '18/09/2026',
    dataProxCalibracao: '18/09/2027',
    tempAr: '23',
    umidade: '60',
    local: 'Lab',
    padraoInst: 'P',
    padraoSerie: 'PS',
    padraoCert: 'PC',
    padraoVal: '01/01/2027',
    statusConclusao: 'aprovado',
    textoMotivo: 'ok',
    unidade: 'bar',
    origem: 'interna',
    status: 'rascunho',
    responsavel: snapshotResponsavel(ENG),
    crescente: [],
    incertezaC: '',
    coefC: '',
    decrescente: [],
    incertezaD: '',
    coefD: '',
    ...over,
  };
}

beforeEach(() => {
  banco.clear();
  bucket.clear();
  pendenteNoCofre = false;
  imagensPadrao();
  banco.set('nr13_minha_empresa', {
    razao: 'Empresa ZZ',
    logoRef: { bucket: 'inspecao', path: 'org-1/logos/l1.png', mimeType: 'image/png', tamanho: 5 },
  });
  banco.set('nr13_lista_phs', [ENG]);
});

describe('C.2 · responsável pela calibração', () => {
  it('snapshot vem do cadastro de funcionários; com referência, a dataURL sai', () => {
    const r = snapshotResponsavel(ENG);
    expect(r).toEqual({
      id: 'f1',
      nome: 'Eng. Ana Souza',
      funcao: 'Engenheira Mecânica',
      registro: 'CREA-SP 123',
      assinaturaRef: REF_RUBRICA,
    });
    expect(r).not.toHaveProperty('assinatura');
  });

  it('sem referência, congela a dataURL; sem imagem nenhuma, não inventa', () => {
    const semRef = { ...ENG, assinaturaRef: undefined } as Funcionario;
    expect(snapshotResponsavel(semRef).assinatura).toBe('data:image/png;base64,VELHA');
    const semNada = { ...ENG, assinaturaRef: undefined, assinatura: undefined } as Funcionario;
    const r = snapshotResponsavel(semNada);
    expect(r).not.toHaveProperty('assinatura');
    expect(r).not.toHaveProperty('assinaturaRef');
    expect(avisosEmissao(manometro({ responsavel: r }))[0]).toMatch(/sem a rubrica/);
  });

  it('sem responsável NÃO emite — e diz por quê', () => {
    expect(pendenciasEmissao(manometro({ responsavel: undefined }))).toContain('Escolha o responsável pela calibração.');
    expect(pendenciasEmissao(manometro())).toEqual([]);
  });

  it('os dois templates têm o bloco, leem o registro na emissão e não inventam nome', () => {
    for (const arq of ['CERTIFICADO-CAL-MANOMETRO.html', 'CERTIIFCADO-CAL-PSV.html']) {
      const html = readFileSync(`public/arquivos-inspecao/${arq}`, 'utf8');
      expect(html).toContain('RESPONSÁVEL PELA CALIBRAÇÃO');
      expect(html).toContain('id="cal-resp-assinatura"');
      expect(html).toContain("get('fonte') === 'registro'");
      expect(html).toContain('RESPONSÁVEL NÃO DEFINIDO');
      // legado (sem responsável e sem status) continua sem bloco
      expect(html).toContain("if (!box || (!r && status !== 'rascunho')) return;");
      // a rubrica só entra se for imagem de verdade
      expect(html).toContain("String(r.assinatura).indexOf('data:') === 0");
    }
  });

  it('o palco resolve a rubrica do responsável (assinaturaRef → assinatura)', () => {
    const palco = readFileSync('src/services/palco.ts', 'utf8');
    expect(palco).toContain("{ prefixo: 'nr13_calibracao_item_', de: 'assinaturaRef', para: 'assinatura' }");
  });
});

describe('C.3 · emissão imutável', () => {
  it('emite: bytes gerados = bytes arquivados = bytes reabertos, pelo SHA-256', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);

    expect(emitido.status).toBe('emitido');
    expect(emitido.emissao?.pdfRef.path).toMatch(/^org-1\/certificados-calibracao\//);
    expect(emitido.emissao?.pendente).toBe(false);
    expect(emitido.emissao?.logoRef?.path).toBe('org-1/logos/l1.png');
    expect(emitido.emissao?.assinaturaRef?.path).toBe(REF_RUBRICA.path);

    const noBucket = bucket.get(emitido.emissao!.pdfRef.path)!;
    expect(await sha256Hex(noBucket)).toBe(emitido.emissao!.sha256);
    expect(new TextDecoder().decode(noBucket.slice(0, 5))).toBe('%PDF-');

    const reaberto = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);
    expect(await sha256Hex(reaberto!)).toBe(emitido.emissao!.sha256);

    // gravado nas DUAS chaves
    expect((banco.get(`nr13_calibracao_item_${cal.id}`) as DadosManometro).status).toBe('emitido');
    expect((banco.get(`nr13_calibracoes_${TAG}`) as DadosManometro[])[0].emissao?.sha256).toBe(emitido.emissao!.sha256);
  });

  it('a emissão imprime o REGISTRO carimbado — nunca a meta de outro relatório', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    // Uma meta de relatório de OUTRO documento na mesma aba: não pode vazar.
    banco.set('nr13_relatorio_meta_atual', { empresa: { razao: 'EMPRESA DE OUTRO RELATORIO' }, certCalibracoes: { [cal.id]: { ...cal, fabricante: 'OUTRO' } } });
    const emitido = await emitirCertificado(TAG, cal);
    const texto = await textoDoPdf(bucket.get(emitido.emissao!.pdfRef.path)!);
    expect(texto).toContain('Wika');
    expect(texto).toContain('Eng. Ana Souza');
    expect(texto).not.toContain('OUTRO');
    expect(texto).not.toContain('RASCUNHO');
  });

  it('depois de emitido: editar e excluir são RECUSADOS', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    await expect(salvarCalibracao(TAG, { ...emitido, textoMotivo: 'alterado' })).rejects.toBeInstanceOf(
      CertificadoEmitidoImutavel,
    );
    await expect(excluirCalibracao(TAG, cal.id)).rejects.toBeInstanceOf(CertificadoEmitidoImutavel);
    await expect(emitirCertificado(TAG, emitido)).rejects.toBeInstanceOf(EmissaoRecusada);
    expect((banco.get(`nr13_calibracao_item_${cal.id}`) as DadosManometro).textoMotivo).toBe('ok');
  });

  it('trocar a LOGO depois não muda o certificado emitido', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    const antes = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);

    banco.set('nr13_minha_empresa', {
      razao: 'Empresa ZZ',
      logoRef: { bucket: 'inspecao', path: 'org-1/logos/NOVA.png', mimeType: 'image/png', tamanho: 5 },
    });
    imagens.set('org-1/logos/NOVA.png', pngSintetico(50, 50, 9));

    const depois = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);
    expect(await sha256Hex(depois!)).toBe(await sha256Hex(antes!));
    expect((banco.get(`nr13_calibracao_item_${cal.id}`) as DadosManometro).emissao?.logoRef?.path).toBe(
      'org-1/logos/l1.png',
    );
    expect(emitido.emissao!.sha256).toBe(await sha256Hex(depois!));
  });

  it('trocar a ASSINATURA do funcionário depois não muda o certificado emitido', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    banco.set('nr13_lista_phs', [{ ...ENG, assinaturaRef: { ...REF_RUBRICA, path: 'org-1/assinaturas/NOVA.png' } }]);
    imagens.set('org-1/assinaturas/NOVA.png', pngSintetico(50, 20, 11));

    const item = banco.get(`nr13_calibracao_item_${cal.id}`) as DadosManometro;
    expect(item.responsavel?.assinaturaRef?.path).toBe(REF_RUBRICA.path);
    expect(item.emissao?.assinaturaRef?.path).toBe(REF_RUBRICA.path);
    const bytes = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);
    expect(await sha256Hex(bytes!)).toBe(emitido.emissao!.sha256);
  });

  it('rubrica ou logo que não carregaram: NÃO emite e não grava nada', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    imagens.set('org-1/assinaturas/abc.png', 'indisponivel');
    await expect(emitirCertificado(TAG, cal)).rejects.toBeInstanceOf(EmissaoRecusada);
    imagensPadrao();
    imagens.set('org-1/logos/l1.png', 'indisponivel');
    await expect(emitirCertificado(TAG, cal)).rejects.toBeInstanceOf(EmissaoRecusada);
    expect(bucket.size).toBe(0);
    expect((banco.get(`nr13_calibracao_item_${cal.id}`) as DadosManometro).status).toBe('rascunho');
  });

  it('offline: o arquivo fica no cofre e a emissão diz que está PENDENTE (nunca finge ACK)', async () => {
    pendenteNoCofre = true;
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    expect(emitido.emissao?.pendente).toBe(true);
  });

  it('arquivo adulterado no bucket: a reabertura RECUSA em vez de servir', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    const b = bucket.get(emitido.emissao!.pdfRef.path)!;
    b[b.length - 2] ^= 0xff;
    await expect(bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`)).rejects.toThrow(/SHA-256/);
  });

  it('no relatório, o snapshot congelado da meta vence o registro vivo', async () => {
    const cal = manometro();
    await salvarCalibracao(TAG, cal);
    const emitido = await emitirCertificado(TAG, cal);
    banco.set('nr13_relatorio_meta_atual', { certCalibracoes: { [cal.id]: emitido } });
    banco.delete(`nr13_calibracao_item_${cal.id}`);
    const bytes = await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${cal.id}`);
    expect(await sha256Hex(bytes!)).toBe(emitido.emissao!.sha256);
  });

  it('legado (sem status) segue pelo template: nenhum arquivo, nada a copiar', async () => {
    const legado = manometro({ status: undefined, origem: undefined, responsavel: undefined });
    await salvarCalibracao(TAG, legado);
    expect(await bytesArquivadosDaFolha(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${legado.id}`)).toBeNull();
    expect(folhaDoRelatorio(legado)).toBe(`CERTIFICADO-CAL-MANOMETRO.html?calibId=${legado.id}`);
  });

  it('o anexo ao relatório usa os bytes arquivados antes de montar qualquer folha', () => {
    const src = readFileSync('src/features/relatorios/pdfVetorial/certificados.ts', 'utf8');
    const iArq = src.indexOf('bytesArquivadosDaFolha(documentos[i])');
    const iHost = src.indexOf('comFolhaIsolada(documentos[i]');
    expect(iArq).toBeGreaterThan(0);
    expect(iArq).toBeLessThan(iHost);
    expect(src).toContain('doc.copyPages(origem, origem.getPageIndices())');
  });
});

describe('D · calibração de terceiro', () => {
  const FORM = {
    tipo: 'termometro' as const,
    nome: 'TI-01',
    fabricante: 'Incoterm',
    modelo: 'T',
    serie: '99',
    faixa: '0 a 150',
    unidade: '°C',
    laboratorio: 'Lab Externo Ltda',
    responsavelExterno: 'Fulano',
    numeroCertificado: 'EXT-77',
    dataCalibracao: '10/09/2026',
    validade: '10/09/2027',
    statusConclusao: 'aprovado' as const,
    observacoes: 'rastreável RBC',
  };

  it('registro de terceiro: origem, laboratório, validade, PDF — e NADA nosso', () => {
    const ref = { bucket: 'inspecao', path: 'org-1/certificados-externos/1.pdf', mimeType: 'application/pdf', tamanho: 9 };
    const cal = montarTerceiro(FORM, TAG, { id: 'cal-9', componenteId: 'comp-1' }, { ref, nome: 'lab.pdf', sha256: 'ab' });
    expect(cal).toMatchObject({
      origem: 'terceiro',
      tipo: 'termometro',
      laboratorio: 'Lab Externo Ltda',
      responsavelExterno: 'Fulano',
      numeroCertificado: 'EXT-77',
      dataCalibracao: '10/09/2026',
      dataProxCalibracao: '10/09/2027',
      unidade: '°C',
      pdfExternoRef: ref,
      pdfExternoSha256: 'ab',
    });
    expect(cal).not.toHaveProperty('responsavel');
    expect(cal).not.toHaveProperty('emissao');
    expect(cal).not.toHaveProperty('status');
  });

  it('certificado interno gerado para terceiro: NÃO — sem folha, fora do relatório, emissão recusada', async () => {
    const cal = montarTerceiro(FORM, TAG, { id: 'cal-9', componenteId: 'comp-1' }, null) as DadosTerceiro;
    expect(arquivoCalibracao(cal)).toBeNull();
    expect(folhaDoRelatorio(cal)).toBeNull();
    // mesmo um terceiro de MANÔMETRO (que tem modelo interno) não vira folha nossa
    expect(folhaDoRelatorio({ ...cal, tipo: 'manometro', unidade: 'bar' })).toBeNull();
    await expect(emitirCertificado(TAG, cal)).rejects.toBeInstanceOf(EmissaoRecusada);
    expect(artefatoDaCalibracao(cal)).toBeNull(); // sem PDF anexado, não há arquivo
  });

  it('o PDF externo é servido intacto (o artefato aponta para ele, com o hash do recebido)', () => {
    const ref = { bucket: 'inspecao', path: 'org-1/certificados-externos/1.pdf', mimeType: 'application/pdf', tamanho: 9 };
    const cal = montarTerceiro(FORM, TAG, { id: 'cal-9', componenteId: 'comp-1' }, { ref, nome: 'lab.pdf', sha256: 'ab' });
    expect(artefatoDaCalibracao(cal)).toMatchObject({ pdfRef: ref, sha256: 'ab' });
  });

  it('faltas: laboratório, nº, datas e unidade compatível com o instrumento', () => {
    expect(faltasTerceiro(FORM)).toEqual([]);
    expect(faltasTerceiro({ ...FORM, unidade: 'kgf/cm²' })).toContain('unidade do instrumento');
    expect(faltasTerceiro({ ...FORM, laboratorio: '', validade: '' })).toEqual(['laboratório', 'validade']);
  });

  it('o rótulo do lote diz o que entra e o que não entra no relatório', () => {
    const t = montarTerceiro(FORM, TAG, { id: 'c2', componenteId: 'x' }, null);
    const r = manometro({ id: 'c3' });
    const e = manometro({ id: 'c4', status: undefined });
    expect(contagemParaRelatorio([t, r, e])).toBe(
      '1 manômetro, 1 de laboratório externo, citada no quadro, 1 rascunho — emita para anexar',
    );
  });
});
