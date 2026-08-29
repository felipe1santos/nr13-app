/**
 * Fase 9 · 9F.2 — o que a tela nova de `/prontuarios` precisa do armazenamento.
 *
 * ## Por que existe
 *
 * A tela antiga monta a lista com `listarEquipamentos()`, que começa com
 * `await lerTudo()` — hidratação COMPLETA. Aqui a lista vem da projeção, pelo
 * servidor (`buscaIndex`), e o equipamento só chega ao cache quando é ESCOLHIDO.
 *
 * ## A ordem é o teste inteiro, e aqui ela custa mais caro que na 9F.1
 *
 * Semear primeiro, ler depois. Em `/inspecoes`, inverter abriria a lista de
 * containers vazia. Aqui abre um DOCUMENTO: o visualizador materializa o palco
 * a partir do cache, e o palco só enxerga o que `cacheLocal` indexou para a TAG.
 * Ler antes de semear — ou não semear — imprime seis folhas com "-" e **sem erro
 * nenhum**. É o risco bloqueante da etapa, e é o que
 * `palcoSemeadura.test.ts` guarda.
 *
 * **Não lança.** Sem rede, o que já está no aparelho continua valendo: é a
 * promessa do próprio `carregarEquipamento`, e derrubar a navegação por causa
 * da rede transformaria uma tela degradada numa tela quebrada.
 */
import { carregarEquipamento, montarResumoDoCache } from '../equipamento/equipamentoService';
import type { EquipamentoResumo } from '../equipamento/tipos';
import { carregarProntuario } from './prontuarioService';
import type { ProntuarioDados } from './tipos';

export interface AberturaProntuario {
  /** `null` quando a TAG não existe nem no cache nem no servidor. */
  resumo: EquipamentoResumo | null;
  /** `null` quando o equipamento ainda não tem prontuário salvo. */
  prontuario: ProntuarioDados | null;
}

/**
 * Traz do servidor as chaves desta TAG e devolve o que a tela de prontuários
 * precisa para abrir o formulário e, depois, o documento.
 */
export async function abrirEquipamentoParaProntuario(tag: string): Promise<AberturaProntuario> {
  try {
    await carregarEquipamento(tag);
  } catch {
    // Offline ou falha pontual: segue com o cache. A tela mostra o que tem.
  }
  return {
    resumo: montarResumoDoCache(tag),
    prontuario: carregarProntuario(tag),
  };
}

/**
 * A tela legada precisa hidratar a organização inteira?
 *
 * Existe como função — e não como um `if` dentro do componente — porque é a
 * decisão que define se `lerTudo()` roda: a suíte não renderiza React (ambiente
 * `node`), então regra que mora no JSX não tem teste. Com a flag ligada, ninguém
 * hidrata: a lista vem da projeção e o equipamento chega por semeadura.
 */
export function deveHidratarListaLegada(v9Ativa: boolean): boolean {
  return !v9Ativa;
}
