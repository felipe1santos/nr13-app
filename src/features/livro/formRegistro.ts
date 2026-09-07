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
}

export const FORM_OCORRENCIA_VAZIO: FormOcorrencia = {
  data: '',
  tipoOcorrencia: '',
  oQueFoiFeito: '',
  descricao: '',
  quemRealizou: '',
  phId: '',
  retificaDe: '',
};
