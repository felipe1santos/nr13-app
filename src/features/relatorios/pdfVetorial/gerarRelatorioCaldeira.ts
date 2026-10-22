/**
 * O GERADOR DO RELATÓRIO DE CALDEIRA FLAMOTUBULAR (22/10/2026).
 *
 * Chamado por `gerarRelatorioVetorial` quando o equipamento é caldeira — o
 * caminho de vaso e autoclave não passa por aqui e não muda (o baseline de
 * hash em `naoRegressaoTipos.test.ts` confere byte a byte).
 *
 * O corpo é desenhado em DUAS passagens, como o de vaso: a 1ª conta as folhas
 * e anota onde cada seção começa; a 2ª desenha para valer, com o "Página X de
 * Y" certo. A diferença é a ORDEM DOS ANEXOS: na referência, os certificados
 * (seção 4), o prontuário de fabricação (5) e a ART (6) vêm ANTES do Livro de
 * Registro (7). Então os anexos são inseridos logo depois da folha divisória
 * de cada seção, pelo pdf-lib, páginas COPIADAS do arquivo original (nunca
 * rasterizadas) — e a numeração das folhas que vêm depois soma as páginas
 * inseridas (`Documento.numeroDaPagina`).
 *
 * Anexar NUNCA altera documento emitido: isto só roda para rascunho, prévia e
 * emissão NOVA. Relatório já emitido abre pelos bytes arquivados (§7-quater).
 */
import { PDFDocument } from 'pdf-lib';
import type { jsPDF } from 'jspdf';
import { registrarCarlito } from './carlito';
import { Documento, type CampoEditavel, type ModoDocumento, type RespiroMedido } from './documento';
import type { MapaOverrides } from '../overridesRelatorio';
import { anexarRastreabilidades } from '../rastreabilidadeService';
import { anexarFolhasDeCertificado } from './certificados';
import { incluiFolha } from './composicao';
import type { ModeloRelatorio } from './modelo';
import { montarModeloCaldeira, type ModeloCaldeira } from './modeloCaldeira';
import {
  SUMARIO_CALDEIRA,
  folhaAcessoriosCaldeira,
  folhaAcumulacaoCaldeira,
  folhaCapaCaldeira,
  folhaDivisoria,
  folhaSumarioCaldeira,
  folhasCalculosCaldeira,
  folhasMedicaoCaldeira,
  folhasProntuarioCaldeira,
  folhasRelatorioInspecaoCaldeira,
  folhasSobrepressaoCaldeira,
} from './folhasCaldeira';
import { folhasExameExterno, folhasExameInterno } from './folhas';
import { secaoLivroRegistro } from './livroRegistro';
import type { SecaoRelatorio } from './composicao';
import { ler } from '../../../services/storage';
import { baixarFoto } from '../../../services/fotos';
import { lerProntuarioFabricante } from '../../equipamento/ProntuarioFabricante';
import { listarAnexados, bytesDaEmissao } from '../../prontuarios/emissaoProntuario';
import { artefatoDe, baixarArtefato } from '../artefatoRelatorio';
import type { RelatorioMeta } from '../tipos';

/** As seções do relatório de caldeira e as folhas da composição que as acendem. */
export const FOLHAS_CALDEIRA = {
  capa: ['CAPA.HTML'],
  sumario: ['SUMARIO.HTML'],
  // O rascunho de caldeira criado ANTES deste relatório tem as folhas de vaso
  // na composição; elas acendem a seção de caldeira equivalente.
  prontuario: ['CALD-PRONTUARIO.HTML', 'PRONTUARIO.HTML', 'PLACA.HTML', 'CLASSIFICACAO-RISCO.HTML'],
  acessorios: ['CALD-ACESSORIOS.HTML', 'PRONTUARIO.HTML', 'PLACA.HTML'],
  relatorioInspecao: ['CALD-RELATORIO-INSPECAO.HTML', 'INSPECOES.HTML', 'CONCLUSAO.HTML'],
  exameExterno: ['VISUAL-EXTERNO.HTML'],
  exameInterno: ['VISUAL-INTERNO.HTML'],
  calculos: ['CALD-CALCULOS.HTML', 'RESUMO-MEMORIAL.HTML', 'MEMORIAL.HTML'],
  medicao: ['ULTRASSOM.HTML'],
  acumulacao: ['ENSAIO-ACUMULACAO.HTML'],
  th: ['TESTE-HIDROSTATICO.HTML'],
  livro: ['LIVRO-REGISTRO.HTML'],
} as const;

export type SecaoCaldeira = keyof typeof FOLHAS_CALDEIRA;

/** Quais seções o relatório de caldeira tem. Sem lista: tudo, menos o Livro (só explícito). */
export function secoesCaldeira(documentos?: string[]): Record<SecaoCaldeira, boolean> {
  const informada = !!documentos && documentos.length > 0;
  const saida = {} as Record<SecaoCaldeira, boolean>;
  for (const k of Object.keys(FOLHAS_CALDEIRA) as SecaoCaldeira[]) {
    saida[k] = k === 'livro' && !informada ? false : incluiFolha(documentos, ...FOLHAS_CALDEIRA[k]);
  }
  return saida;
}

/** O que foi desenhado onde — páginas DO CORPO (jsPDF), antes dos anexos. */
interface Registro {
  secoes: Map<string, number>;
  divisorias: { certificados?: number; fabricacao?: number; art?: number };
}

interface Anexos {
  certificados: Uint8Array | null;
  fabricacao: Uint8Array | null;
  art: Uint8Array | null;
  paginas: { certificados: number; fabricacao: number; art: number };
  nomesCertificados: number;
  falhas: string[];
}

async function paginasDe(b: Uint8Array | null): Promise<number> {
  if (!b) return 0;
  return (await PDFDocument.load(b)).getPageCount();
}

async function bytesDeBlob(b: Blob | null): Promise<Uint8Array | null> {
  return b ? new Uint8Array(await b.arrayBuffer()) : null;
}

/** O prontuário de fabricação: o PDF do fabricante, senão o prontuário anexado vigente. */
async function bytesFabricacao(tag: string): Promise<Uint8Array | null> {
  try {
    const fab = lerProntuarioFabricante(tag);
    if (fab?.pdfRef?.path) return await bytesDeBlob(await baixarFoto(fab.pdfRef));
    if (fab?.pdfBase64?.startsWith('data:')) {
      const bin = atob(fab.pdfBase64.slice(fab.pdfBase64.indexOf(',') + 1));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    const anexados = listarAnexados(tag);
    const ultimo = anexados[anexados.length - 1];
    if (ultimo) return await bytesDeBlob(await bytesDaEmissao(ultimo, { artefatoDe, baixarArtefato }));
  } catch (e) {
    console.error('Prontuário de fabricação indisponível para o relatório de caldeira:', e);
  }
  return null;
}

async function prepararAnexos(
  tag: string,
  documentos: string[],
  meta: RelatorioMeta | null,
  certificados: boolean,
): Promise<Anexos> {
  const falhas: string[] = [];
  let certs: Uint8Array | null = null;
  if (certificados && documentos.length > 0) {
    try {
      // `addDefaultPage: false`: sem isso o pdf-lib salva o documento vazio com
      // UMA página em branco, que viraria um "certificado" vazio no relatório.
      const vazio = await (await PDFDocument.create()).save({ addDefaultPage: false });
      const cal = await anexarFolhasDeCertificado(new Uint8Array(vazio), documentos, tag);
      falhas.push(...cal.falhas);
      const r = await anexarRastreabilidades(cal.bytes.slice().buffer as ArrayBuffer, documentos);
      falhas.push(...r.falhas);
      certs = (await paginasDe(r.bytes)) > 0 ? r.bytes : null;
    } catch (e) {
      console.error('Falha ao montar os certificados do relatório de caldeira:', e);
      falhas.push('certificados');
    }
  }
  const fabricacao = await bytesFabricacao(tag);
  let art: Uint8Array | null = null;
  const refArt = meta?.artAnexo?.ref;
  if (refArt?.path) {
    try {
      art = await bytesDeBlob(await baixarFoto(refArt));
      if (!art) falhas.push('ART');
    } catch (e) {
      console.error('ART anexada indisponível:', e);
      falhas.push('ART');
    }
  }
  return {
    certificados: certs,
    fabricacao,
    art,
    paginas: { certificados: await paginasDe(certs), fabricacao: await paginasDe(fabricacao), art: await paginasDe(art) },
    nomesCertificados: documentos.filter((d) => /calibId=|^CERTI/i.test(d)).length,
    falhas,
  };
}

/** Página do corpo → página no arquivo final (soma os anexos inseridos antes dela). */
function exibida(reg: Registro, anexos: Anexos, p: number): number {
  let n = p;
  const d = reg.divisorias;
  if (d.certificados !== undefined && p > d.certificados) n += anexos.paginas.certificados;
  if (d.fabricacao !== undefined && p > d.fabricacao) n += anexos.paginas.fabricacao;
  if (d.art !== undefined && p > d.art) n += anexos.paginas.art;
  return n;
}

function emitirCaldeira(
  doc: Documento,
  mc: ModeloCaldeira,
  tem: Record<SecaoCaldeira, boolean>,
  temBase: Record<SecaoRelatorio, boolean>,
  anexos: Anexos,
  meta: RelatorioMeta | null,
  paginasExibidas: Map<string, number>,
  reg?: Registro,
): void {
  const anotar = (numero: string) => {
    if (reg && !reg.secoes.has(numero)) reg.secoes.set(numero, doc.pdf.getNumberOfPages() + 1);
  };
  const b = mc.base;
  if (tem.capa) folhaCapaCaldeira(doc, mc);
  if (tem.sumario) folhaSumarioCaldeira(doc, paginasExibidas, SUMARIO_CALDEIRA);

  anotar('1');
  if (tem.prontuario) {
    anotar('1.1');
    folhasProntuarioCaldeira(doc, mc);
  }
  if (tem.acessorios) {
    anotar('1.2');
    folhaAcessoriosCaldeira(doc, mc);
  }
  if (tem.relatorioInspecao) {
    anotar('1.3');
    folhasRelatorioInspecaoCaldeira(doc, mc);
  }
  if (tem.exameExterno) {
    anotar('1.4');
    folhasExameExterno(doc, b, true, { banner: '1.4 EXAME VISUAL EXTERNO', fotos: '1.4.1 REGISTRO FOTOGRÁFICO — EXAME VISUAL EXTERNO' });
  }
  if (tem.exameInterno) {
    anotar('1.5');
    folhasExameInterno(doc, b, true, { banner: '1.5 EXAME VISUAL INTERNO', fotos: '1.5.1 REGISTRO FOTOGRÁFICO — EXAME VISUAL INTERNO' });
  }
  if (tem.calculos) {
    anotar('1.6');
    folhasCalculosCaldeira(doc, mc);
  }

  anotar('2');
  if (tem.medicao) {
    anotar('2.1');
    folhasMedicaoCaldeira(doc, mc);
  }
  if (tem.acumulacao && b.acumulacao) {
    anotar('2.2');
    folhaAcumulacaoCaldeira(doc, b);
  }

  if (tem.th) {
    anotar('3');
    folhasSobrepressaoCaldeira(doc, b);
  }

  // 4, 5 e 6: a folha divisória sempre existe (a referência as tem mesmo
  // vazias); o anexo entra logo depois dela, na montagem final.
  anotar('4');
  folhaDivisoria(doc, '4', 'Certificados de calibração', [
    anexos.certificados
      ? 'Os certificados de calibração dos instrumentos e dos padrões seguem anexados a partir da próxima página.'
      : 'Nenhum certificado de calibração anexado a este relatório.',
  ]);
  if (reg) reg.divisorias.certificados = doc.pdf.getNumberOfPages();

  anotar('5');
  folhaDivisoria(doc, '5', 'Prontuário de fabricação', [
    anexos.fabricacao
      ? 'O prontuário de fabricação do equipamento segue anexado a partir da próxima página.'
      : 'O equipamento não possui prontuário de fabricação anexado ao sistema.',
  ]);
  if (reg) reg.divisorias.fabricacao = doc.pdf.getNumberOfPages();

  anotar('6');
  folhaDivisoria(doc, '6', 'ART — Anotação de Responsabilidade Técnica', [
    meta?.art ? `ART nº ${meta.art}.` : 'Nº da ART não informado nas configurações do relatório.',
    anexos.art ? 'A ART segue anexada a partir da próxima página.' : 'Nenhum PDF de ART anexado a este relatório.',
  ]);
  if (reg) reg.divisorias.art = doc.pdf.getNumberOfPages();

  if (tem.livro) {
    anotar('7');
    secaoLivroRegistro(doc, b, temBase, {
      numero: '7',
      ensaiosExtras: mc.acumulacaoFeita ? [`Ensaio de acumulação (${mc.rastreavel('EA')})`] : [],
    });
  }
}

export interface ContextoCaldeira {
  tag: string;
  modelo: ModeloRelatorio;
  documentos: string[];
  meta: RelatorioMeta | null;
  injecao: Record<string, unknown>;
  certificados: boolean;
  modo: ModoDocumento;
  overrides: MapaOverrides;
  cab: ConstructorParameters<typeof Documento>[1];
  novoPdf: () => jsPDF;
  temBase: Record<SecaoRelatorio, boolean>;
}

export async function gerarCorpoCaldeira(ctx: ContextoCaldeira): Promise<{
  bytes: Uint8Array;
  paginas: number;
  falhasAnexo: string[];
  editaveis: CampoEditavel[];
  modeloCaldeira: ModeloCaldeira;
}> {
  const mc = montarModeloCaldeira(ctx.tag, ctx.modelo, ctx.meta, ctx.injecao);
  const tem = secoesCaldeira(ctx.documentos);
  const anexos = await prepararAnexos(ctx.tag, ctx.documentos, ctx.meta, ctx.certificados);
  mc.temFabricacao = anexos.fabricacao !== null;

  // 1ª passagem: contar e anotar seções e divisórias.
  const p1 = ctx.novoPdf();
  await registrarCarlito(p1);
  const respiro: RespiroMedido = {};
  const rascunho = new Documento(p1, ctx.cab, 0, ctx.modo, ctx.overrides);
  rascunho.aoFecharSecaoElastica = (m) => {
    respiro[m.chave] = { sobra: m.sobra, linhas: m.linhas, folhaFinal: m.folhaFinal };
  };
  const reg: Registro = { secoes: new Map(), divisorias: {} };
  emitirCaldeira(rascunho, mc, tem, ctx.temBase, anexos, ctx.meta, new Map(), reg);
  const anexadas = anexos.paginas.certificados + anexos.paginas.fabricacao + anexos.paginas.art;

  const desenhar = async (total: number) => {
    const p = ctx.novoPdf();
    await registrarCarlito(p);
    const d = new Documento(p, ctx.cab, total, ctx.modo, ctx.overrides, respiro);
    d.numeroDaPagina = (n) => exibida(reg, anexos, n);
    const paginasExibidas = new Map([...reg.secoes].map(([k, v]) => [k, exibida(reg, anexos, v)]));
    const reg2: Registro = { secoes: new Map(), divisorias: {} };
    emitirCaldeira(d, mc, tem, ctx.temBase, anexos, ctx.meta, paginasExibidas, reg2);
    return { d, reg2 };
  };
  let { d: doc, reg2 } = await desenhar(p1.getNumberOfPages() + anexadas);
  // O rodapé não pode mentir: se o respiro mudou uma quebra, redesenha com o total certo.
  if (doc.pdf.getNumberOfPages() !== p1.getNumberOfPages()) {
    reg.secoes = reg2.secoes;
    reg.divisorias = reg2.divisorias;
    ({ d: doc, reg2 } = await desenhar(doc.pdf.getNumberOfPages() + anexadas));
  }

  // Montagem final: o corpo, com cada anexo logo depois da sua divisória.
  const corpo = await PDFDocument.load(new Uint8Array(doc.pdf.output('arraybuffer')));
  const final = await PDFDocument.create();
  const inserirDepois = new Map<number, Uint8Array>();
  if (anexos.certificados && reg2.divisorias.certificados) inserirDepois.set(reg2.divisorias.certificados, anexos.certificados);
  if (anexos.fabricacao && reg2.divisorias.fabricacao) inserirDepois.set(reg2.divisorias.fabricacao, anexos.fabricacao);
  if (anexos.art && reg2.divisorias.art) inserirDepois.set(reg2.divisorias.art, anexos.art);
  const paginasCorpo = await final.copyPages(corpo, corpo.getPageIndices());
  for (let i = 0; i < paginasCorpo.length; i++) {
    final.addPage(paginasCorpo[i]);
    const anexo = inserirDepois.get(i + 1);
    if (anexo) {
      try {
        const src = await PDFDocument.load(anexo, { ignoreEncryption: true });
        for (const pg of await final.copyPages(src, src.getPageIndices())) final.addPage(pg);
      } catch (e) {
        console.error('Anexo ilegível no relatório de caldeira:', e);
        anexos.falhas.push(i + 1 === reg2.divisorias.art ? 'ART' : i + 1 === reg2.divisorias.fabricacao ? 'prontuário de fabricação' : 'certificados');
      }
    }
  }
  const bytes = await final.save();
  return {
    bytes,
    paginas: final.getPageCount(),
    falhasAnexo: anexos.falhas,
    // As áreas clicáveis da prévia apontam para a página DO ARQUIVO FINAL.
    editaveis: doc.editaveis.map((c) => ({ ...c, pagina: exibida(reg2, anexos, c.pagina) })),
    modeloCaldeira: mc,
  };
}

/** A meta e a injeção que o gerador usa — as entregues (avulso) ou as chaves vivas. */
export function fontesCaldeira(fontes?: { meta: RelatorioMeta | null; injecao: Record<string, unknown> }) {
  return {
    meta: fontes ? fontes.meta : ler<RelatorioMeta>('nr13_relatorio_meta_atual'),
    injecao: fontes ? fontes.injecao : (ler<Record<string, unknown>>('nr13_injecao_atual') ?? {}),
  };
}
