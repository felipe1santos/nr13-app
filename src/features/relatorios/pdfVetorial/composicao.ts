/**
 * Fase 11 · A COMPOSIÇÃO do relatório — quais seções aquele documento tem.
 *
 * ## O defeito que este arquivo conserta
 *
 * O gerador vetorial emitia SEMPRE as 21 seções. Medido no gate: um relatório
 * simples, montado com 8 folhas, saía do vetorial com 14 páginas — porque
 * ultrassom, teste hidrostático e exames visuais eram emitidos mesmo sem
 * estarem no relatório, cada um com uma folha inteira de travessões.
 *
 * Paginação diferente entre os dois motores é esperada e está autorizada. Uma
 * SEÇÃO A MAIS não é paginação: é o documento afirmando que houve um ensaio que
 * o inspetor não selecionou. Num relatório assinado, isso é conteúdo errado.
 *
 * A lista de folhas (`documentos`) é a mesma que o visualizador monta e que o
 * gerador raster rasteriza — a composição passa a ter uma fonte só.
 *
 * ## A regra do vazio
 *
 * `documentos` ausente ou vazio significa "não informado", e aí tudo é emitido.
 * É o que a bancada de comparação usa quando quer ver o layout inteiro, e é o
 * comportamento que o piloto sempre teve.
 */

/** O nome do arquivo, sem a query (`CERTIFICADO-CAL-X.html?calibId=1`). */
export function arquivoDe(documento: string): string {
  return documento.split('?')[0].trim().toUpperCase();
}

/**
 * A folha está no relatório?
 *
 * Aceita várias folhas-pai: o checklist do sistema é três templates, e a seção
 * existe se qualquer um deles foi selecionado.
 */
export function incluiFolha(documentos: string[] | undefined, ...arquivos: string[]): boolean {
  if (!documentos || documentos.length === 0) return true;
  const presentes = new Set(documentos.map(arquivoDe));
  return arquivos.some((a) => presentes.has(a.toUpperCase()));
}

/**
 * As seções do relatório vetorial e a folha do sistema que manda em cada uma.
 *
 * Serve de documentação executável: se um dia uma folha for renomeada, é aqui
 * que a correspondência quebra, num lugar só.
 */
export const FOLHA_DA_SECAO = {
  capa: ['CAPA.HTML'],
  sumario: ['SUMARIO.HTML'],
  identificacao: ['PLACA.HTML'],
  categorizacao: ['CLASSIFICACAO-RISCO.HTML'],
  dadosTecnicos: ['PRONTUARIO.HTML'],
  resumoCalculos: ['RESUMO-MEMORIAL.HTML'],
  memoria: ['MEMORIAL.HTML'],
  dadosInspecao: ['INSPECOES.HTML'],
  checklist: ['VERIFICACAO-DOCUMENTACAO.HTML', 'CHECKLIST1.HTML', 'CHECKLIST2.HTML', 'CHECKLIST3.HTML'],
  fotosDocumentacao: ['FOTOS-DOCUMENTACAO.HTML'],
  fotosChecklist: ['CHECKLIST-FOTOS.HTML'],
  exameExterno: ['VISUAL-EXTERNO.HTML'],
  fotosExterno: ['VISUAL-EXTERNO-FOTOS.HTML'],
  exameInterno: ['VISUAL-INTERNO.HTML'],
  fotosInterno: ['VISUAL-INTERNO-FOTOS.HTML'],
  ultrassom: ['ULTRASSOM.HTML'],
  th: ['TESTE-HIDROSTATICO.HTML'],
  fotosTh: ['TESTE-HIDROSTATICO-FOTOS.HTML'],
  parecer: ['CONCLUSAO.HTML'],
} as const;

export type SecaoRelatorio = keyof typeof FOLHA_DA_SECAO;

/** Quais seções aquele relatório tem. */
export function secoesPresentes(documentos?: string[]): Record<SecaoRelatorio, boolean> {
  const saida = {} as Record<SecaoRelatorio, boolean>;
  for (const chave of Object.keys(FOLHA_DA_SECAO) as SecaoRelatorio[]) {
    saida[chave] = incluiFolha(documentos, ...FOLHA_DA_SECAO[chave]);
  }
  return saida;
}
