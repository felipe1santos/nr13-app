/**
 * O DOCUMENTO AVULSO DO ENSAIO É O MESMO DO RELATÓRIO (21/09/2026).
 *
 * ## O defeito
 *
 * "Inspeções → Ver documento" montava os templates HTML de
 * `public/arquivos-inspecao/` dentro de iframes (`PreviewDocumento`), enquanto o
 * relatório final desenha as MESMAS folhas pelo motor vetorial
 * (`pdfVetorial/folhas.ts`). Dois desenhos, duas leituras dos dados, duas
 * semânticas — e o técnico conferia uma coisa em campo para o relatório entregar
 * outra ao cliente. Na medição de espessura a diferença era visível a olho nu: a
 * folha antiga imprimia `0,00` onde não houve medição e rotulava colunas como
 * P1/P2/P3; a do relatório imprime travessão e os ângulos reais.
 *
 * ## A regra
 *
 * O avulso passa a ser **uma chamada do gerador do relatório com a composição
 * reduzida às folhas daquele ensaio**. Não há gerador de inspeção e gerador de
 * relatório: há um gerador e dois recortes. Se a folha 7.4 mudar, muda nos dois
 * no mesmo commit, porque é o mesmo código.
 *
 * ## A ordem das três gravações, e por que cada uma existe
 *
 * O modelo (`montarModeloRelatorio`) lê CHAVES, não parâmetros — é o desenho do
 * §2 do CLAUDE.md. Então, antes de gerar:
 *
 * 1. `gravarInspecaoOrigemAtual(container.dados)` põe os dados de campo nas duas
 *    chaves de injeção (a duplicação é obrigatória: checklist lê uma, ensaios
 *    leem a outra);
 * 2. a META vai quase vazia, mas **com `containerOrigemId`** — é ele que faz
 *    `pontosUltrassom` escolher a grade DESTE container. Sem ele, a grade de
 *    outra inspeção do mesmo equipamento venceria, que é exatamente o defeito
 *    de 10/09/2026 (documento assinado com espessuras de outra rodada);
 * 3. o resto da meta fica em branco de propósito: não há relatório, e o
 *    cabeçalho precisa dizer isso em vez de herdar o código, a data e os
 *    assinantes do último relatório aberto.
 *
 * ## O que este módulo NÃO faz
 *
 * Não emite, não arquiva, não calcula SHA oficial, não grava `pdfRef`, não toca
 * no histórico. É `modo: 'preview'` — a prévia do ensaio, pelo caminho da
 * prévia do relatório (13D).
 */
import { gerarRelatorioVetorial } from '../relatorios/pdfVetorial/gerarRelatorio';
import { gravarInspecaoOrigemAtual, gravarMetaAtual } from '../relatorios/relatoriosService';
import type { RelatorioMeta } from '../relatorios/tipos';
import { carregarContainer } from './inspecaoService';
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from './tipos';

/**
 * Os ensaios cujo documento o motor vetorial sabe desenhar.
 *
 * Fora dela ficam `manometro` e `psv` — as folhas de calibração. Elas não têm
 * equivalente vetorial por DECISÃO de arquitetura (§7-septies do CLAUDE.md): o
 * certificado é montado num host isolado e rasterizado individualmente, porque
 * não existe folha vetorial para ele. Vetorizá-las aqui seria criar o desenho
 * paralelo que esta mudança existe para acabar.
 */
export const ENSAIOS_VETORIAIS: FormularioEnsaio[] = [
  'checklist',
  'visual_externo',
  'visual_interno',
  'ultrassom',
  'th',
];

export function temDocumentoVetorial(formulario: FormularioEnsaio): boolean {
  return ENSAIOS_VETORIAIS.includes(formulario);
}

/**
 * As folhas do relatório que compõem o documento daquele ensaio.
 *
 * Sai de `DOCS_POR_FORMULARIO`, a MESMA tabela que o caminho antigo usava para
 * escolher os iframes: a composição do vetorial normaliza o nome do arquivo
 * (`arquivoDe`, maiúsculas e sem query), então os dois lados falam a mesma
 * língua sem uma segunda tabela para manter em dia.
 */
export function folhasDoEnsaio(formulario: FormularioEnsaio): string[] {
  return DOCS_POR_FORMULARIO[formulario] ?? [];
}

export interface DocumentoDoEnsaio {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
}

/**
 * Gera o documento daquele ensaio — os mesmos bytes que o relatório produziria
 * para essas folhas, com os dados deste container.
 */
export async function gerarDocumentoDoEnsaio(
  tag: string,
  containerId: string,
  formulario: FormularioEnsaio,
): Promise<DocumentoDoEnsaio> {
  const documentos = folhasDoEnsaio(formulario);
  if (documentos.length === 0) {
    throw new Error('Este ensaio não tem documento para pré-visualizar.');
  }

  const container = carregarContainer(tag, containerId);
  await gravarInspecaoOrigemAtual(container?.dados ?? {});
  await gravarMetaAtual({ containerOrigemId: containerId } as RelatorioMeta);

  const r = await gerarRelatorioVetorial(tag, {
    documentos,
    // Sem certificados: o anexo de rastreabilidade pertence ao relatório
    // inteiro, não à folha de um ensaio — e cada um deles custa uma
    // rasterização no host isolado, que a prévia de campo não precisa pagar.
    certificados: false,
    modo: 'preview',
  });

  return { bytes: r.bytes, paginas: r.paginas, ms: r.ms };
}
