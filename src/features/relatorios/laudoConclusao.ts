import { ler, salvar } from '../../services/storage';

/**
 * Fase 13C · o LAUDO da conclusão, fora do template.
 *
 * ## O que a folha faz hoje, e o que este módulo faz igual
 *
 * `CONCLUSAO.html` tem sete campos editáveis e grava **um**: o APTO/INAPTO, no
 * clique do SIM/NÃO. É o segundo — e último — ponto de escrita do relatório
 * (13A). Os outros seis são texto que some no F5; não são portados porque não
 * existem como dado.
 *
 * O formato é o do template, campo a campo:
 *
 * ```json
 * { "apto": true, "relatorioCodigo": "REL-…", "atualizadoEm": "2026-…" }
 * ```
 *
 * ## `null` não é "inapto"
 *
 * A ausência de resposta é um terceiro estado, e o sistema inteiro depende
 * disso: `rotuloLaudo(null)` devolve travessão, e `validacaoFinalizacao` avisa
 * que o laudo não foi marcado. Tratar não-marcado como reprovado faria o
 * documento afirmar que o equipamento está inapto porque alguém esqueceu de
 * clicar.
 */

export interface Laudo {
  apto: boolean | null;
  relatorioCodigo?: string;
  atualizadoEm?: string;
}

export const chaveLaudo = (tag: string) => `nr13_laudo_${tag}`;

/** O laudo gravado. `apto: null` quando ninguém marcou. */
export function carregarLaudo(tag: string): Laudo {
  const bruto = ler<{ apto?: boolean | null; relatorioCodigo?: string; atualizadoEm?: string }>(chaveLaudo(tag));
  return {
    apto: bruto?.apto === true ? true : bruto?.apto === false ? false : null,
    relatorioCodigo: bruto?.relatorioCodigo,
    atualizadoEm: bruto?.atualizadoEm,
  };
}

/**
 * Grava o APTO/INAPTO com o código do relatório em montagem — exatamente o que
 * a folha grava, inclusive o `atualizadoEm`.
 *
 * Passa por `salvar`: fila durável, RPC, versionamento. É esse caminho que faz
 * a marcação sobreviver ao offline e um conflito virar conflito em vez de
 * sobrescrita silenciosa.
 */
export async function salvarLaudo(tag: string, apto: boolean, relatorioCodigo: string): Promise<Laudo> {
  const registro: Laudo = { apto, relatorioCodigo, atualizadoEm: new Date().toISOString() };
  await salvar(chaveLaudo(tag), registro);
  return registro;
}
