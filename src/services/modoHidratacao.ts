/**
 * Fase 9 · 9G.1 — QUANTO se hidrata, decidido num lugar só.
 *
 * ## O defeito que motivou o módulo
 *
 * A Fase 9 cobriu sete telas e o boot, e deixou passar o caminho mais curto de
 * todos: `aposEntrar` (`auth.ts`) chamava `await lerTudo()` **sem condição
 * nenhuma**. Com `boot_v9` ligada, o boot pedia só o essencial e o login,
 * segundos antes, já havia baixado a organização inteira — o boot leve não
 * estava desligado, estava sendo desfeito.
 *
 * A causa não foi esquecimento: a decisão existia em `hidratarNoBoot`
 * (`app/bootArmazenamento.ts`), e o login tinha a sua, escrita antes da flag
 * existir. Duas cópias da mesma regra divergem — foi o que aconteceu com as
 * flags na purga da v1, e é o que este módulo impede: **a regra passa a ter uma
 * implementação, e os dois chamadores a consomem.**
 *
 * ## As três respostas, e o incidente atrás de cada uma
 *
 *   · `nenhuma` — **cliente do Portal.** A hidratação não filtra nada; quem
 *     entrega o dado dele é a Edge `portal_cliente`, que resolve pelos ativos
 *     vinculados àquele cliente (Fase 0-B, achado A-01). Hoje a policy do
 *     Postgres já recusa a leitura direta, então o custo era uma ida à rede que
 *     sempre voltava vazia — mas a regra é de escopo, não de desempenho;
 *   · `essencial` — **`boot_v9` ligada.** Só o que a primeira tela precisa
 *     (`essencial.ts`); o resto chega por `carregarEquipamento(tag)` e pela
 *     projeção de busca. Com 51.000 equipamentos, a Fase 8 mediu ~4 min e
 *     1,63 GB até a primeira tela pelo caminho completo;
 *   · `completa` — **sem a flag.** `lerTudo()`, exatamente como sempre foi.
 *
 * ## O que este módulo NÃO decide
 *
 * As migrações de segundo plano. Elas dependem do modo, mas a regra delas é
 * outra (varrem o cache por prefixo e não podem rodar no boot leve) e continua
 * em `bootArmazenamento.migracoesDeSegundoPlano`.
 */
import { lerTudo, hidratarEssencial } from './storage';
import { bootV9Ativo } from './flag';
import { ehCliente } from './papelSessao';
import type { MedidaEssencial } from './essencial';

export type ModoHidratacao = 'nenhuma' | 'essencial' | 'completa';

/**
 * Qual hidratação esta sessão merece.
 *
 * PURA e SÍNCRONA de propósito: é ela que os testes exercitam, e uma decisão
 * que não faz E/S pode ser exercitada caso a caso sem simular rede.
 *
 * A ORDEM IMPORTA: o cliente do Portal vem primeiro. Uma organização de Portal
 * com `boot_v9` ligada cairia no `essencial` — que também lê `app_storage` — se
 * a flag fosse consultada antes do papel.
 */
export function modoHidratacaoDaSessao(): ModoHidratacao {
  if (ehCliente()) return 'nenhuma';
  return bootV9Ativo() ? 'essencial' : 'completa';
}

/**
 * Executa o modo. Devolve a medida do boot leve quando houver — é o número do
 * teto que a 9D registra, e só o modo `essencial` o produz.
 */
export async function executarHidratacao(
  modo: ModoHidratacao,
): Promise<{ medida?: MedidaEssencial }> {
  if (modo === 'nenhuma') return {};
  if (modo === 'essencial') return { medida: await hidratarEssencial() };
  await lerTudo();
  return {};
}
