/**
 * Quantos ACESSÓRIOS cada equipamento tem — a mesma definição na lista e no
 * painel do equipamento (21/11/2026).
 *
 * ## O defeito que isto conserta
 *
 * `ZZ-TESTE-P2`: a lista de `/calibracoes` dizia 3 acessórios e o painel do
 * equipamento dizia 5. Não era arredondamento nem cache velho — eram DUAS
 * perguntas sob o mesmo rótulo:
 *
 *   · o painel contava o CADASTRO (`nr13_componentes_cal_<TAG>`, sem os itens
 *     com `removidoEm`);
 *   · a lista contava as linhas de CALIBRAÇÃO do agregado `vencimentos_org`
 *     (uma por `componente_id` com calibração oficial E data de próxima). Quem
 *     nunca foi calibrado, só tem rascunho ou não tem "próxima" sumia; quem foi
 *     excluído do cadastro mas deixou calibração ficava; e o agregado corta em
 *     500 itens da organização.
 *
 * ## A definição
 *
 * ACESSÓRIO = componente cadastrado e não removido. É o cartão que o painel
 * desenha, é o que se calibra, e existe antes da primeira calibração — que é
 * justamente o acessório que mais importa ver ("Requer calibração").
 *
 * ## De onde vem o número na lista
 *
 * 1. o que ESTE aparelho já leu do cadastro (a página passa, por TAG, o
 *    `listarComponentes(tag).length` de cada equipamento que abriu);
 * 2. senão, `acessorios_org()` (`supabase/calibracoes_acessorios.sql`) — só
 *    inteiros, a organização inteira numa ida;
 * 3. senão, `null`: a tela escreve "—". NUNCA cai no número do agregado de
 *    vencimentos — seria voltar ao defeito.
 *
 * A lista não lê `nr13_componentes_cal_` por cartão (`listaSemParse.test.ts`):
 * o cadastro de um equipamento chegou a ter 2,5 MB de base64 legado.
 */
import { supabase } from '../../services/supabase';

/** `{ TAG: n }` — só TAGs que têm a chave de cadastro. */
export type AcessoriosPorTag = Record<string, number>;

/** Quanto tempo a resposta vale na sessão antes de perguntar de novo. */
const VALIDADE_MS = 60_000;

let emCache: { em: number; promessa: Promise<AcessoriosPorTag | null> } | null = null;

/** Converte a resposta da RPC; qualquer formato inesperado vira `null`. */
export function lerRespostaAcessorios(data: unknown): AcessoriosPorTag | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: AcessoriosPorTag = {};
  for (const [tag, v] of Object.entries(data as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 0) out[tag] = Math.trunc(n);
  }
  return out;
}

/**
 * Uma ida ao servidor por minuto, no máximo, compartilhada entre a lista e o
 * seletor da Nova calibração. Falha (RPC ainda não aplicada, sem rede) devolve
 * `null` e NÃO fica em cache — a próxima abertura tenta de novo.
 */
export function buscarAcessoriosPorTag(agora: number = Date.now()): Promise<AcessoriosPorTag | null> {
  if (emCache && agora - emCache.em < VALIDADE_MS) return emCache.promessa;
  const promessa = (async () => {
    try {
      const { data, error } = await supabase.rpc('acessorios_org');
      if (error) return null;
      return lerRespostaAcessorios(data);
    } catch {
      return null;
    }
  })();
  emCache = { em: agora, promessa };
  void promessa.then((r) => {
    if (r === null && emCache?.promessa === promessa) emCache = null;
  });
  return promessa;
}

/** Só para teste. */
export function __limparCacheAcessorios(): void {
  emCache = null;
}

/**
 * O número da coluna "Acessórios". `null` = ninguém contou — a tela escreve
 * "—", nunca 0 inventado. TAG ausente numa resposta do servidor que VEIO é 0:
 * a chave de cadastro não existe, então não há acessório cadastrado.
 */
export function contagemDeAcessorios(
  tag: string,
  servidor: AcessoriosPorTag | null,
  locais?: Record<string, number>,
): number | null {
  if (locais && locais[tag] !== undefined) return locais[tag];
  if (!servidor) return null;
  return servidor[tag] ?? 0;
}
