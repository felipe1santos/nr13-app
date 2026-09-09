/**
 * A MÁQUINA DO FEEDBACK DE SALVAMENTO — 10/09/2026.
 *
 * A regra que ela existe para garantir é uma só: **o check só aparece depois do
 * sucesso real**. Nada de otimismo — se a gravação falhar, o usuário precisa ver
 * que falhou, e não um "Salvo" que mente.
 *
 * A conta dos tempos mora aqui, fora do React, porque é regra e não pintura: a
 * suíte deste projeto roda em `environment: 'node'`, sem DOM, e um piso de
 * exibição escondido dentro de um `useEffect` não teria como ser testado.
 */

export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro';

/**
 * Piso de exibição do spinner. Existe para a gravação instantânea (cache local)
 * não virar um flash de 20 ms, que o olho lê como falha.
 *
 * **Não é atraso da gravação.** A escrita começa imediatamente; o piso só
 * atrasa o DESAPARECIMENTO do aviso.
 */
export const PISO_SPINNER_MS = 400;

/** Quanto o check verde fica na tela depois do sucesso. */
export const DURACAO_CHECK_MS = 900;

/**
 * Quanto ainda falta esperar para o spinner cumprir o piso.
 *
 * `decorrido` é o tempo real da operação. Operação lenta devolve 0 — o piso
 * nunca soma tempo a quem já demorou.
 */
export function esperaRestante(decorrido: number, piso = PISO_SPINNER_MS): number {
  if (!Number.isFinite(decorrido) || decorrido < 0) return piso;
  return Math.max(0, piso - decorrido);
}

/**
 * O texto do aviso. Fica aqui, e não no JSX, porque é ele que o leitor de tela
 * anuncia — e a acessibilidade não pode depender só da cor do círculo.
 */
export function rotuloSalvamento(estado: EstadoSalvamento, erro?: string | null): string {
  switch (estado) {
    case 'salvando':
      return 'Salvando…';
    case 'salvo':
      return 'Salvo';
    case 'erro':
      return erro?.trim() || 'Não foi possível salvar';
    default:
      return '';
  }
}

/**
 * `polite` para o sucesso, `assertive` para o erro: uma falha de gravação
 * interrompe o que o leitor de tela estiver dizendo; um "Salvo" espera a vez.
 */
export function vivacidade(estado: EstadoSalvamento): 'polite' | 'assertive' {
  return estado === 'erro' ? 'assertive' : 'polite';
}

/**
 * A MENSAGEM DE ERRO que o usuário vê.
 *
 * `Error.message` de biblioteca costuma vir em inglês e sem sujeito. Quando não
 * há mensagem própria, o texto genérico é melhor do que "undefined" — mas a
 * mensagem real, quando existe, VENCE: foi ela que o §15 pediu.
 */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  return 'Não foi possível salvar. Verifique a conexão e tente novamente.';
}
