/**
 * FASE 7 · o CERTIFICADO INTERNO DE CALIBRAÇÃO em vetor (25/09/2026).
 *
 * Massa SINTÉTICA (PNG de cor lisa, nomes inventados) — nenhum dado de cliente.
 * O PDF é lido de volta com pdf.js (texto), com pdf-lib (objetos: fontes e
 * imagens embutidas) e com um espião no `addImage` (proporção desenhada).
 *
 * Letras = itens do pedido (§26): A obrigatórios, B opcionais, C texto longo,
 * D assinatura, E logo, F tabela, G paginação, H paridade com o template,
 * L unidades, M tamanho/estrutura. I (prévia só leitura), J (emitido imutável)
 * e K (externo intocado) moram em `calibracoes/__tests__/certificadoVetorialFase7.test.ts`,
 * onde o armazenamento e o bucket são dublês.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jsPDF } from 'jspdf';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import { zerarCacheFontes } from './carlito';
import { pngSintetico } from './pngSintetico.testutil';
import {
  DEFINICOES,
  EMPRESA_NAO_INFORMADA,
  MARCA_RASCUNHO,
  RESPONSAVEL_FALTA,
  ROTULO_RESPONSAVEL,
  TEXTO_CONCLUSAO_ANTES,
  TEXTO_CONCLUSAO_MEIO,
  TEXTO_PROCEDIMENTO,
  TEXTO_RASTREABILIDADE,
  TITULOS,
  camposSemanticos,
  gerarCertificadoCalibracaoPdf,
  modeloCertificado,
  type ImagensCertificado,
  type ResultadoCertificado,
} from './certificadoCalibracao';
import type { DadosManometro, DadosPSV } from '../../calibracoes/tipos';

// ── massa sintética ──────────────────────────────────────────────────────────

const LOGO = { l: 300, a: 100 };
const RUBRICA = { l: 240, a: 60 };
const SELO = { l: 96, a: 60 };
const IMG: ImagensCertificado = {
  logo: pngSintetico(LOGO.l, LOGO.a, 3),
  rubrica: pngSintetico(RUBRICA.l, RUBRICA.a, 5),
  selo: pngSintetico(SELO.l, SELO.a, 7),
};
const EMPRESA = {
  razao: 'ZZ ENGENHARIA SINTETICA LTDA',
  endereco: 'Av. Sintetica, 100',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'SP',
  cnpj: '00.000.000/0001-00',
  cep: '13000-000',
  telefone: '(19) 0000-0000',
  email: 'zz@exemplo.test',
};
const MOTIVO_OK = 'apresentou resultados dentro dos critérios de aceitação e parâmetros definidos neste documento.';

function base() {
  return {
    id: 'cal-f7',
    tag: 'ZZ-F7',
    nome: 'Manômetro sintético',
    criadoEm: '25/09/2026',
    numeroCertificado: 'CERT-1790000000001',
    dataEmissao: '25/09/2026',
    empresa: 'CLIENTE SINTETICO ZZ',
    endereco: 'Rua das Caldeiras, 7',
    instrumento: 'Manômetro sintético',
    fabricante: 'FabZZ',
    modelo: 'MZ-1',
    serie: 'SZ-001',
    referencia: '0 a 16',
    dataCalibracao: '24/09/2026',
    dataProxCalibracao: '24/09/2027',
    tempAr: '23,0',
    umidade: '55',
    local: 'Laboratorio ZZ',
    padraoInst: 'Padrao digital ZZ',
    padraoSerie: 'PDZ-9',
    padraoCert: 'RBC-ZZ-1',
    padraoVal: '01/03/2027',
    statusConclusao: 'aprovado' as const,
    textoMotivo: MOTIVO_OK,
    unidade: 'bar',
    origem: 'interna' as const,
    status: 'emitido' as const,
    responsavel: { id: 'f1', nome: 'Eng. Ana Sintetica', funcao: 'Engenheira Mecanica', registro: 'CREA-ZZ 1234' },
  };
}

function manometro(over: Partial<DadosManometro> = {}): DadosManometro {
  return {
    ...base(),
    tipo: 'manometro',
    crescente: [0, 4, 8, 12, 16].map((x) => ({ vc: `${x},00`, vi: `${x},05`, erro: '0,05' })),
    incertezaC: '0,021',
    coefC: '2,01',
    decrescente: [16, 12, 8, 4, 0].map((x) => ({ vc: `${x},00`, vi: `${x},10`, erro: '0,10' })),
    incertezaD: '0,022',
    coefD: '2,02',
    ...over,
  } as DadosManometro;
}

function psv(over: Partial<DadosPSV> = {}): DadosPSV {
  return {
    ...base(),
    tipo: 'psv',
    nome: 'PSV sintética',
    instrumento: 'PSV sintética',
    pressaoAbertura: '10,51',
    pressaoAjuste: '10,02',
    fechamento: '9,63',
    incerteza: '0,11',
    coef: '2,03',
    ...over,
  } as DadosPSV;
}

// ── leitura do PDF ───────────────────────────────────────────────────────────

async function textoDasPaginas(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}
const normal = (s: string) => s.replace(/\s+/g, ' ').trim();
/** O texto inteiro sem espaços — a quebra de linha/trecho do pdf.js não pode esconder um valor. */
const compacto = (s: string) => s.replace(/\s+/g, '');

/** Objetos do PDF: imagens (com dimensões) e fontes embutidas. */
async function estrutura(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const imagens: { w: number; h: number }[] = [];
  const fontes: string[] = [];
  let arquivosDeFonte = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const subtipo = dict.get(PDFName.of('Subtype'))?.toString();
    if (subtipo === '/Image') {
      // SMask (alfa de PNG) é um par da imagem, não uma imagem a mais.
      const eMascara = [...doc.context.enumerateIndirectObjects()].some(([, o]) => {
        const d = o instanceof PDFRawStream ? o.dict : null;
        return d?.get(PDFName.of('SMask'))?.toString() === dict.context.getObjectRef(obj)?.toString();
      });
      if (!eMascara)
        imagens.push({ w: Number(dict.get(PDFName.of('Width'))?.toString()), h: Number(dict.get(PDFName.of('Height'))?.toString()) });
    }
    if (dict.get(PDFName.of('Type'))?.toString() === '/Font' && dict.get(PDFName.of('BaseFont')))
      fontes.push(dict.get(PDFName.of('BaseFont'))!.toString());
    if (dict.get(PDFName.of('FontFile2'))) arquivosDeFonte++;
  }
  return { paginas: doc.getPageCount(), imagens, fontes, arquivosDeFonte };
}

// ── o espião do addImage: largura × altura desenhadas ────────────────────────

const desenhadas: { w: number; h: number }[] = [];
let restaurar = () => {};

beforeAll(() => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
  const api = jsPDF.API as unknown as { addImage: (...a: unknown[]) => unknown };
  const original = api.addImage;
  api.addImage = function (this: unknown, ...args: unknown[]) {
    desenhadas.push({ w: Number(args[4]), h: Number(args[5]) });
    return original.apply(this, args);
  };
  restaurar = () => (api.addImage = original);
});
afterAll(() => {
  restaurar();
  vi.unstubAllGlobals();
});

async function gerar(cal: DadosManometro | DadosPSV, imagens: ImagensCertificado = IMG, empresa: object | null = EMPRESA) {
  desenhadas.length = 0;
  const r = await gerarCertificadoCalibracaoPdf(modeloCertificado(cal, empresa), imagens);
  return { r, paginas: await textoDasPaginas(r.bytes), imagens: [...desenhadas] };
}

/** Nada fora do papel nem abaixo do limite do rodapé. */
function geometriaOk(r: ResultadoCertificado) {
  const g = r.geometria;
  expect(g.limiteConteudo).toBeLessThan(g.topoRodape);
  for (const [i, fundo] of g.fundoConteudo.entries()) {
    expect(fundo, `página ${i + 1}: conteúdo passou do limite do rodapé`).toBeLessThanOrEqual(g.limiteConteudo + 0.01);
  }
  if (g.responsavel) {
    expect(g.responsavel.y + g.responsavel.altura).toBeLessThanOrEqual(g.limiteConteudo + 0.01);
    for (const c of g.conclusao.filter((c) => c.pagina === g.responsavel!.pagina)) {
      // lado a lado: a coluna da conclusão termina antes da do responsável
      expect(c.x + c.largura).toBeLessThanOrEqual(g.responsavel.x + 0.01);
    }
  }
  for (const c of g.conclusao) expect(c.fim).toBeLessThanOrEqual(g.limiteConteudo + 0.01);
}

// ── A · campos obrigatórios ──────────────────────────────────────────────────

describe('A · todos os campos do registro saem no documento', () => {
  it('manômetro: cada campo semântico está no texto extraído', async () => {
    const cal = manometro();
    const { paginas, r } = await gerar(cal);
    expect(r.paginas).toBe(1);
    const texto = compacto(paginas.join(' '));
    for (const [campo, valor] of Object.entries(camposSemanticos(modeloCertificado(cal, EMPRESA)))) {
      if (valor === '') continue;
      expect(texto, `campo ${campo} = "${valor}"`).toContain(compacto(valor));
    }
  });

  it('PSV: idem, com as três pressões', async () => {
    const cal = psv();
    const { paginas } = await gerar(cal);
    const texto = compacto(paginas.join(' '));
    for (const [campo, valor] of Object.entries(camposSemanticos(modeloCertificado(cal, EMPRESA)))) {
      if (valor === '') continue;
      // A unidade da PSV vai dentro do rótulo cinza, que o template põe em
      // MAIÚSCULAS por CSS (`.bg-light-grey { text-transform: uppercase }`).
      const esperado = campo === 'resultados.unidade' ? valor.toUpperCase() : valor;
      expect(texto, `campo ${campo}`).toContain(compacto(esperado));
    }
    expect(texto).toContain(compacto(TITULOS.psv));
  });
});

// ── B · campos opcionais / ausentes ──────────────────────────────────────────

describe('B · campo vazio sai com o marcador do template, nunca inventado', () => {
  it('vazios → "----" e datas → "DD/MM/AAAA"', async () => {
    const cal = manometro({
      fabricante: '',
      modelo: '',
      tempAr: '',
      padraoVal: '',
      dataProxCalibracao: '',
      incertezaD: '',
      crescente: [],
      decrescente: [],
    });
    const m = modeloCertificado(cal, EMPRESA);
    expect(m.item.fabricante).toBe('----');
    expect(m.padrao.validade).toBe('DD/MM/AAAA');
    expect(m.item.dataProxima).toBe('DD/MM/AAAA');
    const res = m.resultados;
    if (res.tipo !== 'manometro') throw new Error('tipo');
    expect(res.crescente).toHaveLength(6);
    expect(res.crescente.every((l) => l.vc === '----' && l.vi === '----' && l.erro === '----')).toBe(true);
    const { paginas } = await gerar(cal);
    expect(paginas[0]).toContain('DD/MM/AAAA');
  });

  it('legado sem status e sem responsável: sem bloco de responsável', async () => {
    const cal = manometro({ status: undefined, responsavel: undefined });
    expect(modeloCertificado(cal, EMPRESA).responsavel).toBeNull();
    const { paginas, r } = await gerar(cal);
    expect(paginas.join(' ')).not.toContain(ROTULO_RESPONSAVEL);
    expect(r.geometria.responsavel).toBeNull();
  });

  it('rascunho sem responsável mostra a FALTA — nunca um nome inventado', async () => {
    const cal = manometro({ status: 'rascunho', responsavel: undefined });
    const { paginas } = await gerar(cal);
    expect(paginas[0]).toContain(RESPONSAVEL_FALTA);
    expect(paginas[0]).toContain('RASCUNHO');
  });

  it('sem conclusão: "--" (como o template), sem motivo', async () => {
    const m = modeloCertificado(manometro({ statusConclusao: '', textoMotivo: 'xx' }), EMPRESA);
    expect(m.conclusao).toEqual({ status: '--', motivo: '' });
  });

  it('sem cadastro da empresa: não inventa razão social nem CNPJ de exemplo', async () => {
    const { paginas } = await gerar(manometro(), { ...IMG, logo: null }, null);
    expect(paginas[0]).toContain(EMPRESA_NAO_INFORMADA);
    expect(paginas[0]).not.toContain('00.000.000/0000-00');
  });

  it('emitido não leva a marca de rascunho; rascunho leva', async () => {
    expect((await gerar(manometro())).paginas[0]).not.toContain(MARCA_RASCUNHO);
    expect(normal((await gerar(manometro({ status: 'rascunho' }))).paginas[0])).toContain(MARCA_RASCUNHO);
  });
});

// ── C · texto longo ──────────────────────────────────────────────────────────

describe('C · texto longo quebra linha e página sem cortar nem sobrepor', () => {
  const LONGO = Array.from({ length: 45 }, (_, i) => `observação técnica número ${i + 1} registrada pelo responsável;`).join(' ');

  it('conclusão longa: várias páginas, cada palavra presente, nada abaixo do rodapé', async () => {
    const { r, paginas } = await gerar(manometro({ textoMotivo: LONGO }));
    expect(r.paginas).toBeGreaterThan(1);
    geometriaOk(r);
    const tudo = compacto(paginas.join(' '));
    for (let i = 1; i <= 45; i++) expect(tudo).toContain(compacto(`observação técnica número ${i} registrada`));
    // o responsável aparece UMA vez, depois do começo da conclusão
    expect(paginas.join(' ').split(ROTULO_RESPONSAVEL)).toHaveLength(2);
  });

  it('campos longos e palavra sem espaço não passam da célula', async () => {
    const serie = 'SERIE' + 'X'.repeat(60);
    const { r, paginas } = await gerar(
      manometro({ endereco: 'Rua '.repeat(40) + 'fim', local: 'Laboratório '.repeat(12), serie }),
    );
    geometriaOk(r);
    expect(compacto(paginas.join(''))).toContain(serie);
  });

  it('conclusão curta fica inteira na folha do título, com o responsável ao lado', async () => {
    const { r } = await gerar(manometro());
    geometriaOk(r);
    expect(r.geometria.conclusao).toHaveLength(1);
    expect(r.geometria.responsavel?.pagina).toBe(r.geometria.conclusao[0].pagina);
  });
});

// ── D · assinatura ───────────────────────────────────────────────────────────

describe('D · rubrica raster, sem esticar, uma vez só', () => {
  it('desenhada na proporção dos bytes; sem imagem, sai nome e registro', async () => {
    const com = await gerar(manometro());
    const rub = com.imagens.find((d) => Math.abs(d.w / d.h - RUBRICA.l / RUBRICA.a) < 0.02);
    expect(rub, 'rubrica desenhada com a proporção original').toBeTruthy();
    const sem = await gerar(manometro(), { ...IMG, rubrica: null });
    expect(sem.imagens).toHaveLength(com.imagens.length - 1);
    expect(sem.paginas[0]).toContain('Eng. Ana Sintetica');
    expect(sem.paginas[0]).toContain('Registro profissional: CREA-ZZ 1234');
  });

  it('responsável sem nome: não desenha rubrica nenhuma', async () => {
    const { imagens } = await gerar(manometro({ status: 'rascunho', responsavel: undefined }));
    expect(imagens.some((d) => Math.abs(d.w / d.h - RUBRICA.l / RUBRICA.a) < 0.02)).toBe(false);
  });
});

// ── E · logo ─────────────────────────────────────────────────────────────────

describe('E · logo raster no cabeçalho, sem esticar e sem repetir bytes', () => {
  it('proporção preservada; 3 páginas = 3 desenhos e UM objeto de imagem', async () => {
    const LONGO = 'texto longo da conclusão. '.repeat(260);
    const { r, imagens } = await gerar(manometro({ textoMotivo: LONGO }));
    expect(r.paginas).toBeGreaterThanOrEqual(3);
    const logos = imagens.filter((d) => Math.abs(d.w / d.h - LOGO.l / LOGO.a) < 0.02);
    expect(logos).toHaveLength(r.paginas);
    const est = await estrutura(r.bytes);
    // logo + rubrica + selo, cada um uma vez no arquivo
    expect(est.imagens.filter((i) => i.w === LOGO.l && i.h === LOGO.a)).toHaveLength(1);
    expect(est.imagens).toHaveLength(3);
  });

  it('sem logo: nenhum quadro vazio desenhado no lugar', async () => {
    const { imagens } = await gerar(manometro(), { ...IMG, logo: null });
    expect(imagens.some((d) => Math.abs(d.w / d.h - LOGO.l / LOGO.a) < 0.02)).toBe(false);
  });
});

// ── F · tabela ───────────────────────────────────────────────────────────────

describe('F · tabelas em vetor: texto na ordem das linhas', () => {
  it('as duas tabelas de resultados saem linha a linha, lado a lado', async () => {
    const { paginas } = await gerar(manometro());
    const t = normal(paginas[0]);
    expect(t).toContain('SENTIDO CRESCENTE (bar) SENTIDO DECRESCENTE (bar)');
    expect(t).toContain('VALOR CONVENCIONAL VALOR NOMINAL ERRO VALOR CONVENCIONAL VALOR NOMINAL ERRO');
    expect(t).toContain('0,00 0,05 0,05 16,00 16,10 0,10');
    expect(t).toContain('16,00 16,05 0,05 0,00 0,10 0,10');
    expect(t).toContain('Incerteza de Medição: 0,021 | Coeficiente k: 2,01');
  });

  it('mais de seis pontos não são descartados (o template perdia o 7º)', async () => {
    const pontos = Array.from({ length: 9 }, (_, i) => ({ vc: `${i},00`, vi: `${i},01`, erro: '0,01' }));
    const { paginas } = await gerar(manometro({ crescente: pontos }));
    expect(normal(paginas.join(' '))).toContain('8,00 8,01 0,01');
  });

  it('a única coisa raster na página é logo, rubrica e selo', async () => {
    const { imagens, r } = await gerar(manometro());
    expect(imagens).toHaveLength(3);
    for (const d of imagens) {
      expect(d.w).toBeLessThan(80); // mm — nenhuma imagem do tamanho da página
      expect(d.h).toBeLessThan(25);
    }
    expect(r.paginas).toBe(1);
  });
});

// ── G · paginação ────────────────────────────────────────────────────────────

describe('G · "Página X de Y" só quando há mais de uma', () => {
  it('uma página: sem número (como sempre foi)', async () => {
    const { paginas } = await gerar(manometro());
    expect(paginas[0]).not.toMatch(/Página \d+ de \d+/);
  });

  it('várias: X de Y em todas, cabeçalho e rodapé repetidos', async () => {
    const { r, paginas } = await gerar(manometro({ textoMotivo: 'linha extensa de observação. '.repeat(200) }));
    const n = r.paginas;
    expect(n).toBeGreaterThan(1);
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${n}`);
      expect(p).toContain(TITULOS.manometro);
      expect(p).toContain('CERT-1790000000001');
      expect(p).toContain('ZZ ENGENHARIA SINTETICA LTDA');
    });
    geometriaOk(r);
  });
});

// ── H · paridade com o template antigo ───────────────────────────────────────

const TEMPLATES = {
  manometro: 'public/arquivos-inspecao/CERTIFICADO-CAL-MANOMETRO.html',
  psv: 'public/arquivos-inspecao/CERTIIFCADO-CAL-PSV.html',
} as const;

/** Os campos do REGISTRO que o script `calibId` do template lê (`c.xxx`). */
function camposLidosPeloTemplate(arquivo: string): string[] {
  const html = readFileSync(arquivo, 'utf8');
  const ini = html.indexOf("var calibId = new URLSearchParams(window.location.search).get('calibId');");
  const fim = html.indexOf('} catch(e) {}', html.indexOf('var c = JSON.parse(rawCal);'));
  const bloco = html.slice(ini, fim);
  return [...new Set([...bloco.matchAll(/\bc\.([a-zA-Z]+)/g)].map((m) => m[1]))].sort();
}

describe('H · paridade semântica com o template (mesma massa)', () => {
  it('cada campo que o template lê chega ao documento com o valor do registro', async () => {
    for (const tipo of ['manometro', 'psv'] as const) {
      const lidos = camposLidosPeloTemplate(TEMPLATES[tipo]);
      expect(lidos.length).toBeGreaterThan(15);
      // Um valor ÚNICO por campo: se algum sumir, o teste diz qual.
      const cal = (tipo === 'psv' ? psv() : manometro()) as unknown as Record<string, unknown>;
      const sentinela = (campo: string) => `V${campo.toUpperCase()}Z`;
      const ESPECIAIS = new Set(['status', 'statusConclusao', 'responsavel', 'crescente', 'decrescente', 'nome']);
      for (const campo of lidos) if (!ESPECIAIS.has(campo)) cal[campo] = sentinela(campo);
      // `instrumento || nome`: o nome só aparece sem instrumento.
      const { paginas } = await gerar(cal as unknown as DadosManometro);
      const texto = compacto(paginas.join(' '));
      for (const campo of lidos) {
        if (ESPECIAIS.has(campo)) continue;
        expect(texto, `${tipo}: campo "${campo}" lido pelo template sumiu do vetorial`).toContain(sentinela(campo));
      }
      if (tipo === 'manometro') {
        expect(lidos).toEqual(expect.arrayContaining(['crescente', 'decrescente', 'incertezaC', 'coefD', 'unidade']));
      } else {
        expect(lidos).toEqual(expect.arrayContaining(['pressaoAbertura', 'pressaoAjuste', 'fechamento', 'incerteza', 'coef']));
      }
    }
  });

  it('os textos FIXOS são cópias do template, e estão no PDF', async () => {
    const fixos = [
      TEXTO_PROCEDIMENTO,
      TEXTO_RASTREABILIDADE,
      TEXTO_CONCLUSAO_ANTES,
      TEXTO_CONCLUSAO_MEIO.replace(/^, /, ''),
      ROTULO_RESPONSAVEL,
      RESPONSAVEL_FALTA,
      '1. DADOS DO CLIENTE / SOLICITANTE',
      '2. DADOS DO ITEM CALIBRADO',
      '3. PROCEDIMENTO DE CALIBRAÇÃO',
      '4. CONDIÇÕES AMBIENTAIS',
      '5. PADRÕES UTILIZADOS E RASTREABILIDADE METROLÓGICA',
      '6. RESULTADOS OBTIDOS',
      '7. DEFINIÇÕES GERAIS',
      '8. CONCLUSÃO TÉCNICA',
      'DATA DA PRÓXIMA CALIBRAÇÃO',
      'LOTE / SÉRIE',
      'TEMPERATURA DO AR',
      'UMIDADE RELATIVA',
      'INSTRUMENTO PADRÃO',
      'Nº CERTIFICADO',
      'Incerteza de Medição:',
      'Coeficiente k:',
      ...DEFINICOES.flatMap((d) => [d.termo, d.texto]),
    ];
    for (const tipo of ['manometro', 'psv'] as const) {
      const html = normal(readFileSync(TEMPLATES[tipo], 'utf8').replace(/<[^>]+>/g, ' '));
      const { paginas } = await gerar(tipo === 'psv' ? psv() : manometro());
      const pdf = compacto(paginas.join(' '));
      for (const f of fixos) {
        if (f === RESPONSAVEL_FALTA) {
          expect(html).toContain(f);
          continue;
        }
        expect(html, `template ${tipo} não tem "${f}"`).toContain(normal(f));
        expect(pdf, `PDF ${tipo} não tem "${f}"`).toContain(compacto(f));
      }
      expect(pdf).toContain(compacto(tipo === 'psv' ? TITULOS.psv : TITULOS.manometro));
      expect(html).toContain(tipo === 'psv' ? TITULOS.psv : TITULOS.manometro);
    }
  });

  it('o rodapé segue a montagem do template (razão • endereço… / telefone • e-mail)', () => {
    const m = modeloCertificado(manometro(), EMPRESA);
    expect(m.rodape).toEqual([
      'ZZ ENGENHARIA SINTETICA LTDA',
      'Av. Sintetica, 100 • Centro • Campinas/SP • CNPJ: 00.000.000/0001-00 • CEP: 13000-000',
      'Telef: (19) 0000-0000 • E-mail: zz@exemplo.test',
    ]);
    const html = readFileSync(TEMPLATES.manometro, 'utf8');
    expect(html).toContain("if(dados.cnpj) linha2.push(`CNPJ: ${dados.cnpj}`);");
    expect(html).toContain("if(dados.telefone) linha3.push(`Telef: ${dados.telefone}`);");
  });
});

// ── L · unidades ─────────────────────────────────────────────────────────────

describe('L · unidade é do instrumento, impressa como gravada, nunca convertida', () => {
  it('manômetro em psi / kgf/cm² / sem unidade (legado → Kgf/cm² do template)', async () => {
    for (const [u, esperado] of [
      ['psi', 'SENTIDO CRESCENTE (psi)'],
      ['kgf/cm²', 'SENTIDO CRESCENTE (kgf/cm²)'],
      [undefined, 'SENTIDO CRESCENTE (Kgf/cm²)'],
    ] as const) {
      const { paginas } = await gerar(manometro({ unidade: u }));
      expect(normal(paginas[0])).toContain(esperado);
      expect(normal(paginas[0])).toContain('12,00 12,05 0,05'); // valores intactos
    }
  });

  it('PSV: com unidade, nos três rótulos (maiúsculas, como o CSS do template); sem, sem parênteses', async () => {
    const com = normal((await gerar(psv({ unidade: 'kgf/cm²' }))).paginas[0]);
    expect(com).toContain('PRESSÃO DE ABERTURA (KGF/CM²)');
    expect(com).toContain('FECHAMENTO (KGF/CM²)');
    expect(com).toContain('10,51 10,02 9,63');
    const sem = normal((await gerar(psv({ unidade: undefined }))).paginas[0]);
    expect(sem).toContain('PRESSÃO DE ABERTURA PRESSÃO DE AJUSTE FECHAMENTO');
  });
});

// ── M · tamanho e estrutura ──────────────────────────────────────────────────

describe('M · o PDF é vetorial: texto, fontes embutidas, imagens só onde são raster', () => {
  it('texto extraível, Carlito embutida em subconjunto, 3 imagens pequenas, < 80 KB', async () => {
    const { r, paginas } = await gerar(manometro());
    expect(paginas[0].length).toBeGreaterThan(1500);
    const est = await estrutura(r.bytes);
    expect(est.fontes.some((f) => /Carlito/i.test(f))).toBe(true);
    expect(est.arquivosDeFonte).toBeGreaterThanOrEqual(2); // regular + negrito
    expect(est.imagens).toHaveLength(3);
    for (const i of est.imagens) expect(i.w * i.h).toBeLessThan(400 * 400);
    expect(r.bytes.length).toBeLessThan(80 * 1024);
  });

  it('determinístico: a mesma massa dá os mesmos bytes', async () => {
    const a = await gerar(manometro());
    const b = await gerar(manometro());
    expect(Buffer.from(a.r.bytes).equals(Buffer.from(b.r.bytes))).toBe(true);
  });
});
