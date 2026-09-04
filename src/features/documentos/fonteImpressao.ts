/**
 * Fase 12 · DE ONDE SAI O PAPEL.
 *
 * ## A pergunta que esta função responde
 *
 * Quando o usuário clica em **Imprimir**, o sistema tem dois caminhos possíveis:
 * rasterizar o que está montado na tela (html2canvas sobre os iframes) ou servir
 * o ARQUIVO que já foi emitido. A regra é uma só, e vale para relatório e para
 * prontuário:
 *
 * > **Documento com `pdfRef` imprime o ARQUIVO. Sempre.**
 *
 * ## Por que isso não é preferência de qualidade
 *
 * Rasterizar a tela de um documento já emitido produz papel feito com os dados
 * de HOJE: a folha sai com o cadastro atual do cliente, a logo atual da empresa
 * e a rubrica atual do engenheiro, mesmo que o documento tenha sido assinado
 * meses atrás. E como o conteúdo dos templates é DOM, uma alteração pelo
 * DevTools sairia impressa como se fosse o documento oficial — o mesmo buraco
 * que o §7-quater fechou no Portal do Cliente.
 *
 * Visualizar, baixar e imprimir precisam ser o MESMO arquivo, byte a byte. Se
 * um dos três se separa dos outros, o hash registrado na emissão deixa de
 * provar o que está no papel.
 *
 * ## `previa` não é o caminho degradado — é outro documento
 *
 * Um relatório ainda não finalizado, ou um prontuário ainda não emitido, não tem
 * arquivo: não há `pdfRef` para servir. Imprimir aí é **pré-visualização**, e a
 * tela precisa dizer isso com essas palavras. Não arquiva, não cria emissão, não
 * produz efeito oficial nenhum.
 *
 * ## O que decide é o `pdfRef`, não o motor
 *
 * Um documento arquivado pelo gerador RASTER (antes de 04/09/2026) imprime os
 * próprios bytes históricos por este mesmo caminho. O motor de rollback
 * (`nr13_motor_pdf = 'raster'`) escolhe como uma emissão NOVA é desenhada; ele
 * nunca é consultado para imprimir algo que já existe.
 */

/** `arquivo` = servir o `pdfRef`. `previa` = rasterizar a tela, sem efeito oficial. */
export type FonteImpressao = 'arquivo' | 'previa';

/**
 * De onde deve sair o papel deste documento.
 *
 * Aceita tanto um `RelatorioSalvo` quanto uma `EmissaoProntuario`: o que importa
 * é existir um `pdfRef` com caminho. Registro sem `pdfRef` é legado ou rascunho —
 * nos dois casos não há arquivo a servir.
 */
export function fonteDeImpressao(
  doc: { pdfRef?: { path?: string } | null } | null | undefined,
): FonteImpressao {
  return doc?.pdfRef?.path ? 'arquivo' : 'previa';
}

/** O rótulo do botão. A prévia precisa se anunciar como prévia. */
export function rotuloImpressao(fonte: FonteImpressao): string {
  return fonte === 'arquivo' ? 'Imprimir' : 'Imprimir pré-visualização';
}
