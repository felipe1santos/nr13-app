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
 * ## As fontes vão ENTREGUES — nada é gravado (Fase 5.1, 24/09/2026)
 *
 * Até a Fase 5.1 este módulo GRAVAVA as três chaves vivas do relatório em
 * montagem (`nr13_inspecao_atual`, `nr13_injecao_atual` e
 * `nr13_relatorio_meta_atual`) para o modelo lê-las. Abrir "Ver documento"
 * apagava a meta e os dados de campo de um relatório sendo montado noutra aba —
 * e o sync levava a sobrescrita aos outros aparelhos. Agora o gerador recebe
 * `fontes` (`FontesDoModelo`) e gerar o avulso é LEITURA pura. O que as
 * gravações garantiam continua garantido pelas fontes:
 *
 * 1. os dados de campo do container vão como `inspecao` e `injecao` (a mesma
 *    duplicação das chaves: checklist lê uma, ensaios leem a outra);
 * 2. a META vai quase vazia, mas **com `containerOrigemId`** — é ele que faz
 *    `pontosUltrassom` escolher a grade DESTE container. Sem ele, a grade de
 *    outra inspeção do mesmo equipamento venceria, que é exatamente o defeito
 *    de 10/09/2026 (documento assinado com espessuras de outra rodada);
 * 3. o resto da meta fica em branco de propósito: não há relatório, e o
 *    cabeçalho precisa dizer isso em vez de herdar o código, a data e os
 *    assinantes do último relatório aberto;
 * 4. a COMPOSIÇÃO (`documentos`) é só a das folhas do ensaio — é ela, e não a
 *    meta, que impede seção de outro ensaio no avulso.
 *
 * ## O que este módulo NÃO faz
 *
 * Não emite, não arquiva, não calcula SHA oficial, não grava `pdfRef`, não toca
 * no histórico. É `modo: 'preview'` — a prévia do ensaio, pelo caminho da
 * prévia do relatório (13D).
 */
import { gerarRelatorioVetorial } from '../relatorios/pdfVetorial/gerarRelatorio';
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
  const dados = (container?.dados ?? {}) as Record<string, unknown>;

  const r = await gerarRelatorioVetorial(tag, {
    documentos,
    // Sem certificados: o anexo de rastreabilidade pertence ao relatório
    // inteiro, não à folha de um ensaio — e cada um deles custa uma
    // rasterização no host isolado, que a prévia de campo não precisa pagar.
    certificados: false,
    modo: 'preview',
    // Leitura pura: meta e dados de campo entregues, nenhuma chave viva gravada.
    fontes: { meta: { containerOrigemId: containerId } as RelatorioMeta, inspecao: dados, injecao: dados },
  });

  return { bytes: r.bytes, paginas: r.paginas, ms: r.ms };
}
