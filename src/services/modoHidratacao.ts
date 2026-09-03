/**
 * Fase 9 · 9G.1 + 9G.3 — QUANTO se hidrata, decidido num lugar só.
 *
 * ## O que este módulo resolveu (9G.1)
 *
 * A Fase 9 cobriu sete telas e o boot, e deixou passar o caminho mais curto de
 * todos: `aposEntrar` (`auth.ts`) chamava `await lerTudo()` **sem condição
 * nenhuma**. Com o boot leve ligado, o boot pedia só o essencial e o login,
 * segundos antes, já havia baixado a organização inteira — o boot leve não
 * estava desligado, estava sendo desfeito.
 *
 * A causa não foi esquecimento: a decisão existia em `hidratarNoBoot`
 * (`app/bootArmazenamento.ts`), e o login tinha a sua, escrita antes de a flag
 * existir. Duas cópias da mesma regra divergem. Aqui ela tem uma implementação
 * e dois chamadores.
 *
 * ## O que mudou na remoção dos legados (9G.3, 03/09/2026)
 *
 * A flag `boot_v9` terminou o rollout ligada nas 30 organizações e foi
 * REMOVIDA. **O boot leve não foi removido — ele virou o único caminho.** Sumiu
 * a resposta `completa`, que baixava a organização inteira; ficaram as duas que
 * importam:
 *
 *   · `nenhuma` — **cliente do Portal.** A hidratação não filtra nada; quem
 *     entrega o dado dele é a Edge `portal_cliente`, que resolve pelos ativos
 *     vinculados àquele cliente (Fase 0-B, achado A-01). A policy do Postgres
 *     já recusa a leitura direta, então o custo era uma ida à rede que sempre
 *     voltava vazia — mas a regra é de escopo, não de desempenho;
 *   · `essencial` — **todo o resto.** Só o que a primeira tela precisa
 *     (`essencial.ts`); o equipamento chega por `carregarEquipamento(tag)` e as
 *     listas vêm da projeção. Com 51.000 equipamentos, a Fase 8 mediu ~4 min e
 *     1,63 GB até a primeira tela pelo caminho completo.
 *
 * `lerTudo()` continua existindo como FUNÇÃO — a chave de emergência
 * (`hidratacaoCompletaForcada`) e a importação de planilha ainda a usam. O que
 * saiu é ela ser o caminho de entrada do sistema.
 *
 * ## O que este módulo NÃO decide
 *
 * As migrações de segundo plano. Elas dependem do modo, mas a regra delas é
 * outra e continua em `bootArmazenamento.migracoesDeSegundoPlano`.
 */
import { hidratarEssencial } from './storage';
import { ehCliente } from './papelSessao';
import type { MedidaEssencial } from './essencial';

export type ModoHidratacao = 'nenhuma' | 'essencial';

/**
 * Qual hidratação esta sessão merece.
 *
 * PURA e SÍNCRONA de propósito: é ela que os testes exercitam, e uma decisão
 * que não faz E/S pode ser exercitada caso a caso sem simular rede.
 */
export function modoHidratacaoDaSessao(): ModoHidratacao {
  return ehCliente() ? 'nenhuma' : 'essencial';
}

/**
 * Executa o modo. Devolve a medida do boot leve quando houver — é o número do
 * teto que a 9D registra.
 */
export async function executarHidratacao(
  modo: ModoHidratacao,
): Promise<{ medida?: MedidaEssencial }> {
  if (modo === 'nenhuma') return {};
  return { medida: await hidratarEssencial() };
}
