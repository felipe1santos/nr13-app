/**
 * Fase 9 · 9F.4 — o que a tela nova de `/livro-registro` precisa do armazenamento.
 *
 * ## Por que existe
 *
 * `/livro-registro` era a **ÚLTIMA tela do sistema que ainda chamava
 * `lerTudo()`** — a hidratação integral da organização. Ela fazia isso porque
 * cruza `nr13_info_` com `nr13_livro_<TAG>` de cada equipamento, e o livro não
 * tinha nenhuma projeção que dissesse "quem tem livro".
 *
 * Medido em produção em 02/09/2026: a organização de 39 equipamentos com UM
 * livro baixava **780 KB** para desenhar UMA linha de tabela cujo livro pesa
 * 7,2 KB — 95,7 % de desperdício. O pior caso proporcional gastava 308 KB para
 * 553 bytes (99,4 %). E **só 6 das 30 organizações têm livro**: as outras 24
 * pagavam a hidratação inteira para chegar a uma tela vazia.
 *
 * ## O QUE A PROJEÇÃO É, E O QUE ELA NÃO É
 *
 * `livro_entradas` e `livro_ultima` são **catálogo**: existem para a LISTA saber
 * quem tem livro sem baixar a organização. Elas **não são autoridade** sobre o
 * Livro de Registro.
 *
 * A verdade continua sendo `nr13_livro_<TAG>` em `app_storage`, e é dela que
 * saem — sempre, nos dois lados da flag — o conteúdo das entradas, o lacre
 * (`sha256`, `shaAnterior`, `lacradaEm`), a verificação da cadeia, o termo de
 * abertura, os assinantes e o PDF. Nada disso passa por aqui, e não é descuido:
 * conferir o lacre no servidor com o dado que o próprio servidor projetou seria
 * o servidor atestando a si mesmo.
 *
 * ## A ordem é o teste inteiro
 *
 * Semear primeiro, ler depois. Esta tela lê o livro, a configuração da folha e o
 * termo de abertura — e **nenhum dos três reclama quando falta**: `ler()` devolve
 * `null` e o código cai no `?? []` ou no `?? {}`. Ler antes de semear abre o
 * livro VAZIO e **sem erro nenhum**, que é a forma mais cara de errar: o usuário
 * conclui que o livro de registro do equipamento sumiu — e o livro é o documento
 * que a fiscalização pede.
 *
 * É o mesmo risco bloqueante da 9F.2 e da 9F.3, e é o que
 * `semeaduraLivro.test.ts` guarda.
 *
 * **Não lança.** Sem rede, o que já está no aparelho continua valendo: é a
 * promessa do próprio `carregarEquipamento`, e derrubar a navegação por causa da
 * rede transformaria uma tela degradada numa tela quebrada.
 */
import { carregarEquipamento } from '../equipamento/equipamentoService';
import { ler } from '../../services/storage';
import type { LivroEntrada } from '../relatorios/livroLacre';

export interface AberturaLivro {
  tag: string;
  /** As entradas lacradas, lidas da VERDADE. Vazio = livro sem registro. */
  entradas: LivroEntrada[];
  /** Configuração da folha (número do livro etc.). `null` quando não há. */
  config: unknown;
  /** O termo de abertura, quando existe. */
  termo: unknown;
}

/**
 * Traz do servidor as chaves desta TAG e devolve o que a tela do livro precisa
 * para abrir o documento do equipamento.
 *
 * A ORDEM da devolução não importa; a ordem do `await` importa, e é ela que o
 * teste de semeadura trava.
 */
export async function abrirEquipamentoParaLivro(tag: string): Promise<AberturaLivro> {
  try {
    await carregarEquipamento(tag);
  } catch {
    // Offline ou falha pontual: segue com o cache. A tela mostra o que tem.
  }
  return {
    tag,
    entradas: ler<LivroEntrada[]>(`nr13_livro_${tag}`) ?? [],
    config: ler<unknown>(`nr13_livro_config_${tag}`) ?? null,
    termo: ler<unknown>(`nr13_termo_livro_${tag}`) ?? null,
  };
}

/**
 * A tela legada precisa hidratar a organização inteira?
 *
 * Existe como função — e não como um `if` dentro do componente — porque é a
 * decisão que define se `lerTudo()` roda: a suíte não renderiza React (ambiente
 * `node`), então regra que mora no JSX não tem teste. Com a flag ligada, ninguém
 * hidrata: a lista vem da projeção e o livro chega por semeadura.
 */
export function deveHidratarListaLegada(v9Ativa: boolean): boolean {
  return !v9Ativa;
}

/**
 * Este equipamento entra na lista do Livro de Registro?
 *
 * A tela lista quem TEM livro. Com o catálogo, isso é `livroEntradas > 0` — mas
 * o `null` **não pode** ser tratado como "não tem": numa organização cuja
 * projeção ainda não foi refeita, todas as linhas vêm `null`, e um
 * `(item.livroEntradas ?? 0) > 0` esvaziaria a tela inteira com a frase "Nenhum
 * livro de registro gerado ainda" — a tela mentindo com a cara mais limpa
 * possível sobre o documento que a fiscalização pede.
 *
 * Por isso `null` **entra na lista**: é melhor mostrar um equipamento cujo livro
 * talvez esteja vazio (e o usuário descobre ao abrir, com a verdade na mão) do
 * que esconder um livro que existe.
 */
export function entraNaListaDoLivro(livroEntradas: number | null): boolean {
  if (livroEntradas === null) return true;
  return livroEntradas > 0;
}

/**
 * O rótulo da contagem, com os três estados separados.
 *
 * `null` não vira "0 registros" nem some: vira vazio, e a coluna fica em branco
 * — a tela não afirma o que não contou.
 */
export function rotuloRegistros(livroEntradas: number | null): string {
  if (livroEntradas === null) return '';
  if (livroEntradas === 0) return 'Sem registro';
  return `${livroEntradas} registro${livroEntradas === 1 ? '' : 's'}`;
}
