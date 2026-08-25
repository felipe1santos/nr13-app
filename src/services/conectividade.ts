/**
 * Fase 9 · 9D — a resposta para "estamos online?", vinda do que REALMENTE
 * aconteceu na rede.
 *
 * ## Por que `navigator.onLine` não serve
 *
 * A promessa do navegador tem duas metades de qualidade muito diferente:
 *
 *   · `false` → **confiável**. Não há interface de rede; nada vai sair daqui.
 *   · `true`  → **quase nada**. Diz que existe uma interface ativa, não que o
 *               servidor esteja alcançável. Proxy, captive portal de hotel, DNS
 *               caído, firewall corporativo e o modo Offline do DevTools ficam
 *               todos do lado de fora dessa afirmação.
 *
 * Medido em produção em 25/08/2026, na prova offline da 9D: com a aba em
 * Offline pelo DevTools, `navigator.onLine` permaneceu `true` durante toda a
 * sessão enquanto 50 requisições reais falhavam com `TypeError: Failed to
 * fetch` — entre elas a `rpc/aplicar_mutacao_storage`, que é a fila tentando
 * subir. A topbar anunciava "Sincronizar (3)": um convite a clicar num botão
 * que não tinha como funcionar, sobre trabalho de campo parado no aparelho.
 *
 * ## A autoridade que já existia
 *
 * `errosSync.classificar` marca `categoria: 'offline'` exatamente quando o
 * fetch falhou por rede — e essa classificação é gravada em cada item da fila
 * pelo `sync.enviarItem`. Ou seja: o sistema já sabia a verdade, guardada no
 * lugar certo, e só a topbar não estava perguntando.
 *
 * Este módulo não faz sondagem própria nem inventa um "ping": ele LÊ o
 * resultado das requisições que o app já precisava fazer. Rede não é medida
 * com pergunta extra, é medida com o que se tentou de verdade.
 *
 * ## O que NÃO é queda de rede
 *
 * Pendência que falhou por permissão, sessão, cota ou conflito não é falta de
 * sinal: a rede funcionou perfeitamente e trouxe uma recusa. Chamar isso de
 * "offline" mandaria o usuário procurar sinal de celular por um problema de
 * assinatura. E pendência ainda não tentada (`erro` ausente) não é evidência de
 * nada — presumir queda ali faria o selo piscar "offline" a cada autosave.
 */
import type { ItemFila } from './sync';

export type EstadoRede = 'online' | 'offline';

export interface SinaisDeRede {
  /** `navigator.onLine` no momento da leitura. */
  navegadorOnLine: boolean;
  /** A fila sem as encerradas — `storage.listarPendentesFila()`. */
  pendentes: ItemFila[];
}

/**
 * Função PURA: os sinais entram, o estado sai. É o que a torna testável sem
 * navegador e sem rede, e o que permite ao selo da topbar e a qualquer outra
 * tela responderem a mesma coisa.
 */
export function estadoConectividade({ navegadorOnLine, pendentes }: SinaisDeRede): EstadoRede {
  // A metade confiável da promessa do navegador.
  if (!navegadorOnLine) return 'offline';

  // A metade não confiável: só aceitamos o "true" se nenhuma tentativa REAL
  // recente tiver falhado por rede.
  const falhouPorRede = pendentes.some((i) => i.erro?.categoria === 'offline');
  return falhouPorRede ? 'offline' : 'online';
}
