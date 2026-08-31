/**
 * Fase 9 · 9F.3 — o que a tela nova de `/calibracoes` precisa do armazenamento.
 *
 * ## Por que existe
 *
 * A tela antiga monta a lista com `listarEquipamentos()`, que começa com
 * `await lerTudo()` — hidratação COMPLETA. Medido em produção em 31/08/2026, na
 * maior organização isso são **369 linhas e 780 KB** baixados para desenhar uma
 * lista que precisa de **53 KB**. Aqui a lista vem da projeção, pelo servidor
 * (`buscaIndex`), e o equipamento só chega ao cache quando é ESCOLHIDO.
 *
 * ## A ordem é o teste inteiro
 *
 * Semear primeiro, ler depois. Esta tela lê QUATRO famílias de chave por
 * equipamento — a lista, os componentes, os lotes e, por id, os certificados —
 * e nenhuma delas dá erro quando falta: `listarCalibracoes` cai no `?? []`,
 * `listarComponentes` e `listarLotes` também. Ler antes de semear abre o
 * histórico VAZIO e **sem erro nenhum**, que é a forma mais cara de errar: o
 * usuário conclui que a calibração sumiu.
 *
 * É o mesmo risco bloqueante da 9F.2, e é o que
 * `semeaduraCalibracoes.test.ts` guarda.
 *
 * ## A segunda passada não é detalhe
 *
 * `carregarEquipamento` semeia `nr13_calibracoes_<TAG>`, `nr13_componentes_cal_`
 * e `nr13_lotes_cal_` pela tabela de famílias por TAG — e só DEPOIS, numa
 * segunda passada, semeia `nr13_calibracao_item_<id>` a partir dos ids que
 * acabou de ler da lista. Ou seja: o certificado de calibração só chega porque a
 * lista chegou antes. Chamar `resolverPdf` sem ter passado por aqui devolveria
 * nada, e o certificado abriria em branco.
 *
 * **Não lança.** Sem rede, o que já está no aparelho continua valendo: é a
 * promessa do próprio `carregarEquipamento`, e derrubar a navegação por causa
 * da rede transformaria uma tela degradada numa tela quebrada.
 */
import { carregarEquipamento, montarResumoDoCache } from '../equipamento/equipamentoService';
import type { EquipamentoResumo } from '../equipamento/tipos';
import { listarCalibracoes } from './calibracaoService';
import { listarComponentes, listarLotes } from './componentesService';
import type { DadosCalibracao } from './tipos';
import type { ComponenteCal, LoteCal } from './componentesService';

export interface AberturaCalibracoes {
  /** `null` quando a TAG não existe nem no cache nem no servidor. */
  resumo: EquipamentoResumo | null;
  /** Vazio quando o equipamento ainda não tem calibração nenhuma. */
  calibracoes: DadosCalibracao[];
  /** Válvulas e manômetros cadastrados. */
  componentes: ComponenteCal[];
  /** Lotes/rodadas de calibração. */
  lotes: LoteCal[];
}

/**
 * Traz do servidor as chaves desta TAG e devolve o que a tela de calibrações
 * precisa para abrir o histórico do equipamento.
 *
 * A ORDEM da devolução não importa; a ordem do `await` importa, e é ela que o
 * teste de semeadura trava.
 */
export async function abrirEquipamentoParaCalibracoes(tag: string): Promise<AberturaCalibracoes> {
  try {
    await carregarEquipamento(tag);
  } catch {
    // Offline ou falha pontual: segue com o cache. A tela mostra o que tem.
  }
  return {
    resumo: montarResumoDoCache(tag),
    calibracoes: listarCalibracoes(tag),
    componentes: listarComponentes(tag),
    lotes: listarLotes(tag),
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
