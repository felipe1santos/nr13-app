import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { registrarCarlito } from './carlito';
import { Documento, type ModoDocumento } from './documento';
import { anexarRastreabilidades, contarPaginasRastreabilidades } from '../rastreabilidadeService';
import { anexarFolhasDeCertificado, contarFolhasDeCertificado } from './certificados';
import { secoesPresentes, type SecaoRelatorio } from './composicao';
import {
  secoesDoRelatorio,
  folhaCapa,
  folhaCategorizacao,
  folhaDadosInspecao,
  folhaDadosTecnicos,
  folhaIdentificacao,
  folhaParecer,
  folhaResumoCalculos,
  folhaSumario,
  folhaUltrassom,
  folhasChecklist,
  folhasExameExterno,
  folhasExameInterno,
  folhasFotosDocumentacao,
  folhasMemoria,
  folhasTesteHidrostatico,
} from './folhas';
import { medirFotos, montarModeloRelatorio, type ModeloRelatorio } from './modelo';
import { resolverPlacaReal } from '../placaIdentificacao';

/**
 * Fase 11 · o RELATÓRIO COMPLETO em vetor.
 *
 * ## Duas passagens, e o motivo
 *
 * "Página X de Y" precisa do Y antes da primeira folha. O `putTotalPages` do
 * jsPDF faz substituição de texto no fluxo da página, e isso não é confiável com
 * fonte CID embutida — que é exatamente o nosso caso. Então o documento é gerado
 * DUAS vezes: a primeira, descartada, só conta as folhas; a segunda vale. Custa
 * poucas dezenas de milissegundos e não tem armadilha.
 *
 * ## O que NÃO muda
 *
 * Desde 04/09/2026 este gerador é o PADRÃO das finalizações NOVAS
 * (`nr13_motor_pdf = vetorial`, gravado em produção). O raster
 * (`pdfService.gerarPdfBytes`) continua inteiro no bundle como rollback de um
 * passo. Nenhum PDF histórico é regenerado (§7-quater), e o Livro, os
 * certificados e o termo de abertura não são tocados.
 */

export interface ResultadoVetorial {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
  /** O modelo usado — a comparação campo a campo lê daqui. */
  modelo: ModeloRelatorio;
  /** Certificados que deviam entrar e não entraram — nunca somem calados. */
  falhasAnexo: string[];
}

export interface OpcoesVetorial {
  /**
   * A lista de folhas do relatório. Sem ela o documento sai sem CERTIFICADO
   * nenhum: é ela que diz quais tipos de padrão anexar e quais folhas de
   * calibração existem.
   */
  documentos?: string[];
  /** Anexar os certificados (padrão: sim quando há `documentos`). */
  certificados?: boolean;
  /**
   * 13B · **removido**. As folhas de calibração deixaram de sair da tela: cada
   * uma é montada sozinha num host isolado (`hostCertificado.ts`). O gerador não
   * lê mais `.relatorio-preview`, e por isso não há mais container a apontar.
   */
  onProgresso?: (feito: number, total: number) => void;
  /**
   * 13D · `preview` desenha o MESMO documento com os campos vazios em
   * amarelo-claro. Não arquiva, não gera SHA oficial, não cria `pdfRef`, não
   * mexe em vencimento e não escreve no Livro — quem faz isso é o "Finalizar",
   * e ele nunca passa por aqui em modo preview.
   */
  modo?: ModoDocumento;
}

/**
 * Emite as folhas na ordem da referência, **respeitando a composição**.
 *
 * `tem` diz quais seções aquele relatório contém — vem da mesma lista de folhas
 * que o visualizador monta. Sem ela, tudo é emitido (a bancada de comparação).
 *
 * Isto não é enfeite: medido no gate, um relatório de 8 folhas saía com 14
 * páginas porque o vetorial emitia ultrassom e teste hidrostático que o
 * inspetor não tinha selecionado. Paginação diferente é esperada; ENSAIO a mais
 * num documento assinado é conteúdo errado.
 */
function emitir(doc: Documento, m: ModeloRelatorio, tem: Record<SecaoRelatorio, boolean>): void {
  if (tem.capa) folhaCapa(doc, m);
  if (tem.sumario) folhaSumario(doc, m, secoesDoRelatorio(m, tem));
  if (tem.identificacao) folhaIdentificacao(doc, m);
  if (tem.categorizacao) folhaCategorizacao(doc, m);
  if (tem.dadosTecnicos) folhaDadosTecnicos(doc, m);
  if (tem.resumoCalculos) folhaResumoCalculos(doc, m);
  if (tem.memoria) folhasMemoria(doc, m);
  if (tem.dadosInspecao) folhaDadosInspecao(doc, m);
  if (tem.checklist) folhasChecklist(doc, m);
  folhasFotosDocumentacao(doc, m, {
    documentacao: tem.fotosDocumentacao,
    checklist: tem.fotosChecklist,
  });
  if (tem.exameExterno) folhasExameExterno(doc, m, tem.fotosExterno);
  if (tem.exameInterno) folhasExameInterno(doc, m, tem.fotosInterno);
  if (tem.ultrassom) folhaUltrassom(doc, m);
  if (tem.th) folhasTesteHidrostatico(doc, m, tem.fotosTh);
  if (tem.parecer) folhaParecer(doc, m);
}

/**
 * Mede as fotos ANTES de desenhar.
 *
 * O piloto assumia 4:3 e centralizava; foto em retrato ficava com sobra
 * lateral. A proporção real é lida uma vez, aqui, e viaja no modelo.
 */
async function comFotosMedidas(m: ModeloRelatorio): Promise<ModeloRelatorio> {
  const [doc, chk, ve, vi, th] = await Promise.all([
    medirFotos(m.fotosDocumentacao),
    medirFotos(m.fotosChecklist),
    medirFotos(m.visualExterno.fotos),
    medirFotos(m.visualInterno.fotos),
    medirFotos(m.th.fotos),
  ]);
  return {
    ...m,
    fotosDocumentacao: doc,
    fotosChecklist: chk,
    visualExterno: { ...m.visualExterno, fotos: ve },
    visualInterno: { ...m.visualInterno, fotos: vi },
    th: { ...m.th, fotos: th },
  };
}

/**
 * Páginas que serão acrescentadas ao fim: folhas de calibração + certificados
 * dos padrões. Zero quando o relatório não leva certificado nenhum.
 */
async function contarPaginasAnexadas(opcoes: OpcoesVetorial): Promise<number> {
  const documentos = opcoes.documentos ?? [];
  if (opcoes.certificados === false || documentos.length === 0) return 0;
  try {
    return (
      contarFolhasDeCertificado(documentos) + (await contarPaginasRastreabilidades(documentos))
    );
  } catch (e) {
    // Falhar a contagem não pode derrubar o relatório: sem ela o total volta a
    // ser só o do corpo, que é o comportamento anterior.
    console.error('Falha ao contar as páginas anexadas; o total usará só o corpo.', e);
    return 0;
  }
}

export async function gerarRelatorioVetorial(
  tag: string,
  opcoes: OpcoesVetorial = {},
): Promise<ResultadoVetorial> {
  const inicio = performance.now();
  const modelo = await comFotosMedidas(montarModeloRelatorio(tag));
  // A placa REAL vem do cofre/bucket, então só dá para resolver aqui — o modelo
  // é montado de forma síncrona. Sem foto, `placaReal` fica `null` e a folha
  // desenha a placa reconstruída.
  modelo.placaReal = await resolverPlacaReal(tag);

  const novoPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const cab = {
    logo: modelo.empresa.logo,
    numeroRelatorio: modelo.numeroRelatorio,
    rodape: [modelo.empresa.razao, modelo.empresa.endereco, modelo.empresa.contato] as [string, string, string],
  };

  // 1ª passagem: contar. O total ainda é desconhecido, então o cabeçalho
  // escreve um número provisório que ninguém verá — este PDF é descartado.
  const contagem = novoPdf();
  await registrarCarlito(contagem);
  const rascunho = new Documento(contagem, cab, 0, opcoes.modo ?? 'final');
  const tem = secoesPresentes(opcoes.documentos);
  emitir(rascunho, modelo, tem);
  const paginasDoCorpo = contagem.getNumberOfPages();

  // O "de Y" tem que dizer o tamanho do arquivo que o usuário vai receber, e o
  // arquivo inclui os certificados anexados ao fim. Sem esta soma, a última
  // folha de um relatório com certificado dizia "22 de 22" num PDF de 27
  // páginas. Os anexos não são NUMERADOS — são documentos de terceiro e não se
  // carimbam (a própria folha CERTIFICADO-CAL esconde o número em produção) —
  // mas contam no total.
  const anexas = await contarPaginasAnexadas(opcoes);
  const total = paginasDoCorpo + anexas;

  // 2ª passagem: para valer, já com "Página X de Y" correto.
  const pdf = novoPdf();
  await registrarCarlito(pdf);
  const doc = new Documento(pdf, cab, total, opcoes.modo ?? 'final');
  emitir(doc, modelo, tem);

  let bytes = new Uint8Array(pdf.output('arraybuffer'));
  let paginas = pdf.getNumberOfPages();
  const falhasAnexo: string[] = [];

  // ── CERTIFICADOS ──────────────────────────────────────────────────────────
  // O corpo do relatório é vetor; os certificados entram DEPOIS e preservados.
  // Falha em anexar NÃO invalida o relatório — ela volta nomeada, do mesmo
  // jeito que no gerador raster, para o chamador avisar o usuário.
  const documentos = opcoes.documentos ?? [];
  if (opcoes.certificados !== false && documentos.length > 0) {
    // 1. Folhas de calibração (HTML montado): rasterizadas UMA A UMA.
    try {
      const cal = await anexarFolhasDeCertificado(bytes, documentos, tag);
      if (cal.anexadas > 0) bytes = new Uint8Array(cal.bytes);
      falhasAnexo.push(...cal.falhas);
    } catch (e) {
      console.error('Falha ao anexar as folhas de certificado de calibração:', e);
      falhasAnexo.push('folhas de calibração');
    }
    // 2. Certificados dos padrões: PÁGINAS COPIADAS do PDF original (pdf-lib),
    //    sem rasterizar — é a mesma função que o gerador raster usa.
    try {
      const r = await anexarRastreabilidades(bytes.slice().buffer as ArrayBuffer, documentos);
      if (r.anexados > 0) bytes = new Uint8Array(r.bytes);
      falhasAnexo.push(...r.falhas);
    } catch (e) {
      console.error('Falha ao anexar as rastreabilidades ao relatório vetorial:', e);
      falhasAnexo.push('certificados padrão');
    }
    paginas = (await PDFDocument.load(bytes)).getPageCount();
  }

  return { bytes, paginas, ms: Math.round(performance.now() - inicio), modelo, falhasAnexo };
}

/**
 * 13D · a PRÉVIA do relatório — o mesmo gerador, em modo `preview`.
 *
 * Existe como função própria para que o caminho seja impossível de confundir
 * com o da emissão: ela devolve **bytes e nada mais**. Não publica artefato,
 * não calcula SHA oficial, não grava `pdfRef`, não toca no histórico, no
 * vencimento nem no Livro. Quem faz tudo isso é `salvarHistorico`, que chama o
 * gerador em modo `final`.
 *
 * Os certificados ficam de FORA da prévia de propósito: cada folha de
 * calibração custa uma rasterização no host isolado, e a prévia é para revisar
 * o corpo do documento. A contagem de páginas do rodapé sai igual à do corpo —
 * e é por isso que a prévia mostra "Página X de Y" do corpo, não do arquivo
 * final com anexos.
 */
export async function gerarPreviaRelatorio(
  tag: string,
  documentos: string[],
): Promise<{ bytes: Uint8Array; paginas: number; ms: number }> {
  const r = await gerarRelatorioVetorial(tag, { documentos, certificados: false, modo: 'preview' });
  return { bytes: r.bytes, paginas: r.paginas, ms: r.ms };
}
