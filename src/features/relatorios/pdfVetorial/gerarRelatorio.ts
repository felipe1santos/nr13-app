import { jsPDF } from 'jspdf';
import { registrarCarlito } from './carlito';
import { Documento } from './documento';
import {
  SECOES_DO_RELATORIO,
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
 * O gerador raster (`pdfService.gerarPdfBytes`) continua sendo o de produção.
 * Este arquivo não é chamado por nenhum caminho normal do sistema: só pelo
 * painel de comparação, atrás de `?piloto=1`. Nenhum PDF histórico é regenerado
 * (§7-quater), e o Livro, os certificados e o termo de abertura não são tocados.
 */

export interface ResultadoVetorial {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
  /** O modelo usado — a comparação campo a campo lê daqui. */
  modelo: ModeloRelatorio;
}

/** Emite as folhas na ordem da referência. Usado nas duas passagens. */
function emitir(doc: Documento, m: ModeloRelatorio): void {
  folhaCapa(doc, m);
  folhaSumario(doc, m, SECOES_DO_RELATORIO);
  folhaIdentificacao(doc, m);
  folhaCategorizacao(doc, m);
  folhaDadosTecnicos(doc, m);
  folhaResumoCalculos(doc, m);
  folhasMemoria(doc, m);
  folhaDadosInspecao(doc, m);
  folhasChecklist(doc, m);
  folhasFotosDocumentacao(doc, m);
  folhasExameExterno(doc, m);
  folhasExameInterno(doc, m);
  folhaUltrassom(doc, m);
  folhasTesteHidrostatico(doc, m);
  folhaParecer(doc, m);
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

export async function gerarRelatorioVetorial(tag: string): Promise<ResultadoVetorial> {
  const inicio = performance.now();
  const modelo = await comFotosMedidas(montarModeloRelatorio(tag));

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
  const rascunho = new Documento(contagem, cab, 0);
  emitir(rascunho, modelo);
  const total = contagem.getNumberOfPages();

  // 2ª passagem: para valer, já com "Página X de Y" correto.
  const pdf = novoPdf();
  await registrarCarlito(pdf);
  const doc = new Documento(pdf, cab, total);
  emitir(doc, modelo);

  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  return { bytes, paginas: pdf.getNumberOfPages(), ms: Math.round(performance.now() - inicio), modelo };
}
