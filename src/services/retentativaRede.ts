/**
 * Fase 9 · 9D — rede de segurança da drenagem, para quando NENHUM evento chega.
 *
 * A v2 acorda a fila em `online` e `visibilitychange`. Os dois pressupõem que o
 * navegador PERCEBA a mudança — e medimos em 25/08/2026, na prova offline da
 * 9D, o caso em que ele não percebe: `navigator.onLine` ficou `true` durante
 * toda a queda, então a volta da rede não disparou `online`; e a aba já estava
 * visível, então também não houve `visibilitychange`. A fila ficou parada em 3
 * pendências com a internet de volta, até alguém clicar no botão da topbar.
 *
 * Em campo não existe esse alguém: o inspetor fecha o app achando que subiu.
 *
 * ## Por que não é um "ping" periódico
 *
 * Duas restrições fizeram a regra:
 *
 *   1. **Só com evidência de queda.** Retentar exige alguma pendência cujo
 *      último erro foi de rede (`erro.categoria === 'offline'`). Sem isso, uma
 *      conta ociosa geraria requisição para sempre — contra a mesma cota de
 *      egresso que a Fase 9 existe para proteger.
 *   2. **Só o que já ia sair.** A retentativa não inventa requisição: ela drena
 *      a fila, que é trabalho que o app já precisava entregar. O sucesso da
 *      própria drenagem é a prova de que a rede voltou; falha mantém tudo onde
 *      está.
 *
 * Pendência parada por permissão, sessão, cota ou conflito não conta: a rede
 * funcionou e trouxe uma recusa. Retentá-la em laço é o defeito que a fila já
 * aprendeu a não cometer (ver `falha_definitiva` em `sync.ts`).
 */
import type { ItemFila } from './sync';

/**
 * Janela mínima entre duas retentativas automáticas.
 *
 * 45 s: curto o bastante para o usuário em campo não fechar o app antes de a
 * fila subir, longo o bastante para não virar rajada. O tick do selo é de 4 s,
 * e sem esta janela cada tick viraria uma tentativa de rede.
 */
export const INTERVALO_RETENTATIVA_MS = 45_000;

export interface SinaisRetentativa {
  /** A fila sem as encerradas. */
  pendentes: ItemFila[];
  /** Milissegundos desde a última retentativa automática. */
  desdeUltima: number;
}

/** Função PURA: decide se vale a pena tentar drenar agora. */
export function deveRetentar({ pendentes, desdeUltima }: SinaisRetentativa): boolean {
  if (desdeUltima < INTERVALO_RETENTATIVA_MS) return false;
  return pendentes.some((i) => i.erro?.categoria === 'offline');
}
