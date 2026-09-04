import type { LivroEntrada } from '../relatorios/livroLacre';

/**
 * Fase 10B.2 · o que se confere antes de TRANCAR um registro do Livro.
 *
 * Mesma disciplina da finalização do relatório (10B.1), pelo mesmo motivo:
 * trancar é irreversível, e o que bloqueia precisa ser diferente do que só
 * avisa.
 *
 *  · **obrigatório** é o que faz o registro ser um registro: sem data não há
 *    quando, sem tipo não há o quê, sem descrição não há registro nenhum — e um
 *    livro de segurança com uma linha em branco lacrada é pior do que uma linha
 *    a menos, porque a linha em branco não pode mais ser corrigida;
 *  · **opcional** é o que a norma não exige em toda ocorrência: quem executou, o
 *    responsável que assina, o relatório de origem.
 *
 * Função pura: a suíte roda em `node`, sem DOM.
 */
export interface PendenciaRegistro {
  campo: string;
  texto: string;
}

export interface ResultadoValidacaoRegistro {
  obrigatorios: PendenciaRegistro[];
  opcionais: PendenciaRegistro[];
  podeTrancar: boolean;
}

function vazio(v: unknown): boolean {
  return typeof v !== 'string' || v.trim() === '';
}

export function validarRegistroLivro(
  entrada: Partial<LivroEntrada> | null | undefined,
): ResultadoValidacaoRegistro {
  const obrigatorios: PendenciaRegistro[] = [];
  const opcionais: PendenciaRegistro[] = [];

  if (!entrada) {
    return {
      obrigatorios: [{ campo: 'registro', texto: 'Registro não encontrado' }],
      opcionais: [],
      podeTrancar: false,
    };
  }

  if (vazio(entrada.data)) {
    obrigatorios.push({ campo: 'data', texto: 'Data da ocorrência não informada' });
  }
  if (vazio(entrada.tipo)) {
    obrigatorios.push({ campo: 'tipo', texto: 'Tipo de ocorrência não informado' });
  }
  if (vazio(entrada.descricao)) {
    obrigatorios.push({ campo: 'descricao', texto: 'Descrição do que foi feito não informada' });
  }

  if (vazio(entrada.quemRealizou)) {
    opcionais.push({ campo: 'quemRealizou', texto: 'Quem realizou não informado' });
  }
  if (vazio(entrada.phNome)) {
    opcionais.push({ campo: 'phNome', texto: 'Responsável que assina o registro não selecionado' });
  }
  if (vazio(entrada.relatorioCodigo)) {
    opcionais.push({ campo: 'relatorioCodigo', texto: 'Registro não está vinculado a um relatório' });
  }

  return { obrigatorios, opcionais, podeTrancar: obrigatorios.length === 0 };
}
