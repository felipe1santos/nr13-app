import { emitirAviso } from '../../services/eventos';

/**
 * Os avisos de validação do memorial — sem diálogo nativo.
 *
 * ## O que motivou (07/09/2026)
 *
 * As três telas de memorial (vaso, caldeira, autoclave) barravam o salvamento
 * com `alert()`. Um `alert()` **para o renderer**: enquanto a caixa está
 * aberta, o React não pinta, nada responde, e a aba inteira parece travada. No
 * E2E de 07/09/2026 isso custou três tentativas de salvar o memorial, e o
 * sintoma que chega ao inspetor em campo é "o sistema travou" — não "faltou
 * preencher a temperatura do casco".
 *
 * O `window.confirm` que vinha logo depois ("Salvar o cálculo do memorial?")
 * saiu junto, pelo mesmo motivo e por mais um: ele pedia confirmação de uma
 * ação que o usuário acabara de pedir clicando em **Salvar**, e cujo resultado
 * já é anunciado por um aviso de sucesso.
 *
 * ## O que NÃO muda
 *
 * A validação continua **impedindo** o salvamento, e a mensagem continua
 * dizendo exatamente quais campos faltam. Só o veículo mudou: o mesmo
 * `emitirAviso` → `ModalAviso` que essas telas já usavam para o sucesso e para
 * o erro de gravação. Um caminho só para falar com o usuário.
 *
 * Mora em módulo próprio porque as três telas repetiam o mesmo par de
 * mensagens — e mensagem duplicada é mensagem que sai de sincronia.
 */

/** Pediram para salvar sem ter gerado o cálculo. */
export function avisarGereOCalculo(): void {
  emitirAviso({
    variante: 'alerta',
    titulo: 'Gere o cálculo antes de salvar',
    texto: 'O memorial ainda não foi calculado. Clique em "Gerar Cálculo" e depois salve.',
  });
}

/**
 * Campos obrigatórios faltando.
 *
 * A LISTA é o conteúdo útil do aviso: sem ela o usuário sabe que falta alguma
 * coisa e não sabe o quê — e os campos ficam espalhados por três etapas da
 * calculadora, então "procure o que falta" não é uma resposta.
 */
export function avisarCamposFaltando(erros: string[]): void {
  emitirAviso({
    variante: 'alerta',
    titulo: 'Preencha os seguintes campos antes de salvar',
    texto: erros.join(' · '),
  });
}
