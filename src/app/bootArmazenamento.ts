/**
 * Fase 9 · 9D.4 — o que a barreira do boot espera, e por quê.
 *
 * A barreira do `RotaProtegida` existe porque `ler()` é SÍNCRONO: uma tela que
 * rodasse antes da hidratação veria o `Map` vazio e concluiria "conta vazia" —
 * o sumiço de dado que a v2 existe para consertar. Ela não é o defeito. O
 * defeito é ela esperar a ORGANIZAÇÃO INTEIRA: com 51.000 equipamentos, a Fase
 * 8 mediu ~4 min e 1,63 GB até a primeira tela.
 *
 * Sob `boot_v9`, a espera passa a ser só pelo ESSENCIAL (`essencial.ts`), e o
 * resto chega quando for preciso: `carregarEquipamento(tag)` para um
 * equipamento, a projeção de busca para a lista.
 *
 * Está num módulo próprio, e não dentro do componente, porque é uma DECISÃO com
 * três respostas e um incidente atrás de cada uma — decisão assim se testa.
 */
import { iniciarArmazenamento, lerTudo, hidratarEssencial } from '../services/storage';
import { bootV9Ativo } from '../services/flag';
import { ehCliente } from '../services/papelSessao';
import type { MedidaEssencial } from '../services/essencial';
import { migrarHistoricoEmSegundoPlano } from '../features/relatorios/historicoRelatorios';
import { migrarRubricasEmSegundoPlano } from '../features/relatorios/livroAssinatura';
import { recuperarArquivosEmSegundoPlano } from '../services/recuperacaoArquivos';

export interface ResultadoBoot {
  /** `nenhuma` = Portal; `completa` = caminho de hoje; `essencial` = boot leve. */
  modo: 'nenhuma' | 'completa' | 'essencial';
  /** O que o boot leve trouxe. É o número do teto — só no modo `essencial`. */
  medida?: MedidaEssencial;
  /** A hidratação falhou; o app abre com o que o aparelho já tinha. */
  falhou?: boolean;
}

/**
 * As três migrações/reparos que rodam depois do boot, em segundo plano.
 *
 * TODAS VARREM O CACHE POR PREFIXO — histórico legado, rubricas do livro,
 * anexos que caíram no fallback base64. No boot leve o cache não tem a
 * organização, então rodá-las ali seria pior do que não rodar:
 *
 *   · não achariam nada e marcariam a sessão como já processada;
 *   · a do histórico é a mais grave: o teste de "já migrado?" também lê do
 *     cache, então ela reconverteria relatório JÁ migrado, reescrevendo o
 *     registro do servidor com a cópia do array legado.
 *
 * Por isso o boot leve NÃO as dispara, e isto é pré-condição de rollout: só se
 * liga `boot_v9` para uma organização cujas migrações já concluíram — o que se
 * confere no servidor, não no aparelho.
 */
export function migracoesDeSegundoPlano(modo: ResultadoBoot['modo']): void {
  if (modo === 'essencial') return;
  // Converte o array único `nr13_historico_relatorios` em um registro por
  // relatório (§7-sexies). Sem apagar nada: falhar aqui só significa que as
  // telas seguem lendo pelo legado.
  migrarHistoricoEmSegundoPlano();
  // Rubricas do Livro de Registro: base64 embutido em cada entrada vira
  // referência de conteúdo. Entradas lacradas ficam.
  migrarRubricasEmSegundoPlano();
  // Segunda chance dos anexos que caíram no fallback base64 porque o upload
  // falhou no campo (A-10). Teto de 3 por sessão.
  recuperarArquivosEmSegundoPlano();
}

export async function hidratarNoBoot(): Promise<ResultadoBoot> {
  // Prepara organização, IndexedDB e `Map` — sem tocar na rede. Vale para os
  // três modos, inclusive o do Portal.
  await iniciarArmazenamento();

  // CLIENTE DO PORTAL NÃO HIDRATA (Fase 0-B, achado A-01). A hidratação roda
  // antes da Edge `portal_cliente` e não filtra nada: o cliente recebia no
  // aparelho os dados de todos os ativos da organização. O que ele precisa ver
  // é depositado por `carregarDadosPortal` → `semearCachePortal`.
  if (ehCliente()) return { modo: 'nenhuma' };

  try {
    if (bootV9Ativo()) {
      return { modo: 'essencial', medida: await hidratarEssencial() };
    }
    await lerTudo();
    return { modo: 'completa' };
  } catch {
    // `lerTudo` já devolve o snapshot do disco quando o servidor falha; uma
    // exceção inesperada aqui deixaria o app preso em "Carregando…" para
    // sempre — pior do que abrir com o que o aparelho tem.
    return { modo: bootV9Ativo() ? 'essencial' : 'completa', falhou: true };
  }
}
