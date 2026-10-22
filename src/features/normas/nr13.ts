/**
 * A NR-13 QUE O SISTEMA CITA — num lugar só (22/10/2026).
 *
 * Até aqui o relatório, o livro e os templates citavam a redação de 2018
 * (portaria revogada pela de 2022) e números de item que mudaram em 2022 —
 * queixa de cliente. A redação vigente é a da Portaria MTP nº 1.846/2022,
 * alterada pela Portaria MTP nº 4.219/2022 (texto oficial em gov.br; ver
 * `docs/medicoes/2026-10-22-nr13-2022.md`, com o trecho oficial de cada item).
 *
 * Decisão do dono: SEM data de vigência em lugar nenhum.
 *
 * A próxima atualização da norma muda ESTE arquivo (e os templates HTML de
 * `public/`, que não importam TS — `nr13.test.ts` varre os dois).
 *
 * Vale só para rascunhos, prévias e emissões NOVAS. Documento emitido é arquivo
 * (§7-quater) e continua com a citação que tinha.
 */

/** A citação completa da redação vigente. */
export const NR13_REFERENCIA = 'NR-13 — Portaria MTP nº 1.846/2022, alterada pela Portaria MTP nº 4.219/2022';

/** A portaria, como se cita dentro de uma frase. */
export const NR13_PORTARIA = 'Portaria MTP nº 1.846/2022, alterada pela Portaria MTP nº 4.219/2022';

export const NR13_ORGAO = 'Ministério do Trabalho e Emprego';

/** NR-13 13.3.2 — o profissional responsável. */
export const PLH = 'Profissional Legalmente Habilitado';
export const PLH_SIGLA = 'PLH';

/** Os subitens que o sistema cita (redação de 2022). */
export const NR13_ITENS = {
  /** Profissional Legalmente Habilitado. */
  plh: '13.3.2',
  /** Instrumentos e sistemas de controle e segurança inspecionados, testados ou calibrados. */
  instrumentos: '13.3.6',
  /** Categorias de caldeira (A/B pela pressão de operação). */
  categoriaCaldeira: '13.4.1.1',
  /** Registro de segurança da caldeira. */
  registroCaldeira: '13.4.1.8',
  /** Inspeção de segurança de caldeiras. */
  inspecaoCaldeira: '13.4.4',
  /** Teste de acumulação das válvulas de caldeira, a critério técnico do PLH. */
  acumulacao: '13.4.4.9',
  /** Conteúdo mínimo do relatório de inspeção de caldeira. */
  relatorioCaldeira: '13.4.4.12',
  /** Categorias de vaso (classe, grupo, Tabela 1). */
  categoriaVaso: '13.5.1.1',
  /** Placa: categoria do vaso em local visível. */
  placaVaso: '13.5.1.4',
  /** Prontuário do vaso. */
  prontuarioVaso: '13.5.1.5',
  /** Reconstituição do prontuário do vaso. */
  reconstituicaoVaso: '13.5.1.6',
  /** Registro de segurança do vaso. */
  registroVaso: '13.5.1.7',
  /** Inspeção de segurança de vasos de pressão. */
  inspecaoVaso: '13.5.4',
  /** Conteúdo mínimo do relatório de inspeção de vaso. */
  relatorioVaso: '13.5.4.11',
} as const;

type TipoEquip = string | null | undefined;

const ehCaldeira = (tipo: TipoEquip) => tipo === 'caldeira';

/** O subitem do REGISTRO DE SEGURANÇA (livro) para o tipo do equipamento. */
export function itemRegistroSeguranca(tipo: TipoEquip): string {
  return ehCaldeira(tipo) ? NR13_ITENS.registroCaldeira : NR13_ITENS.registroVaso;
}

/** O subitem da seção de INSPEÇÃO DE SEGURANÇA para o tipo do equipamento. */
export function itemInspecaoSeguranca(tipo: TipoEquip): string {
  return ehCaldeira(tipo) ? NR13_ITENS.inspecaoCaldeira : NR13_ITENS.inspecaoVaso;
}

/** O subitem do CONTEÚDO DO RELATÓRIO (alínea n = certificado da PSV). */
export function itemConteudoRelatorio(tipo: TipoEquip): string {
  return ehCaldeira(tipo) ? NR13_ITENS.relatorioCaldeira : NR13_ITENS.relatorioVaso;
}
