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
   * Vazio = "use a sugestão": o texto acompanha os campos enquanto o usuário
   * não escreve o dele. Assim que ele escreve, este campo vence e nada mais o
   * sobrescreve — é o mesmo contrato que a folha já respeita para o termo
   * congelado das entradas automáticas.
   */
  termoTexto: string;
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
  termoTexto: '',
};
