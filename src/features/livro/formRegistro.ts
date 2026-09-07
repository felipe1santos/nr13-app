/**
 * O formulário de um registro do livro — o tipo, os tipos de ocorrência e o
 * estado vazio.
 *
 * Saiu de `pages/LivroRegistro.tsx` quando o modal virou componente próprio: a
 * página continua dona do ESTADO (é ela que grava o rascunho), e as duas peças
 * passaram a falar do mesmo tipo em vez de cada uma redeclarar o seu.
 *
 * Nada de regra nova aqui. `salvarOcorrencia` e `montarEntradaLivroManual`
 * continuam onde estavam.
 */

/** Os tipos de ocorrência oferecidos no modal. */
export const TIPOS_OCORRENCIA = [
  'Manutenção corretiva',
  'Manutenção preventiva',
  'Reparo',
  'Substituição de dispositivo',
  'Ajuste/Calibração',
  'Outra ocorrência',
];

export interface FormOcorrencia {
  data: string;
  tipoOcorrencia: string;
  oQueFoiFeito: string;
  descricao: string;
  quemRealizou: string;
  phId: string;
  /** Preenchido quando este registro RETIFICA outro já lacrado. */
  retificaDe: string;
  /**
   * O TERMO que sai impresso no livro.
   *
   * ## `null` e `''` são coisas DIFERENTES (07/09/2026)
   *
   * - **`null`** — o usuário ainda não tocou no campo. A sugestão manda, e ela
   *   acompanha data, tipo e descrição enquanto ninguém escrever;
   * - **`''`** — ele apagou tudo, de propósito. Fica vazio;
   * - **texto** — é dele, e nada o sobrescreve.
   *
   * Este campo já foi `string`, com a regra "vazio = use a sugestão". O efeito
   * era um defeito relatado: apagar a última letra (ou dar Ctrl+A e Delete)
   * fazia a sugestão inteira reaparecer, e o campo não podia ficar vazio. Um
   * `||` sobre string trata "apagado" e "nunca preenchido" como o mesmo estado
   * — e num campo que vai impresso num livro legal eles não são.
   */
  termoTexto: string | null;
  /** Código do relatório de origem, quando veio do pré-preenchimento. */
  relatorioCodigo?: string;
  /** Laudo APTO/INAPTO herdado do relatório; `null`/ausente = não marcado. */
  apto?: boolean | null;
}

export const FORM_OCORRENCIA_VAZIO: FormOcorrencia = {
  data: '',
  tipoOcorrencia: '',
  oQueFoiFeito: '',
  descricao: '',
  quemRealizou: '',
  phId: '',
  retificaDe: '',
  // `null`, e nao `''`: o campo nasce INTOCADO, e a sugestao manda ate a
  // primeira tecla.
  termoTexto: null,
};
