/**
 * Abrir a FICHA de um equipamento — 16/09/2026.
 *
 * ## O defeito que este módulo existe para consertar
 *
 * `/equipamento/:tag` lia a ficha de um lugar só: o cache local
 * (`carregarInfo` → `ler('nr13_info_<TAG>')`, SÍNCRONO). Quando não achava,
 * fazia `navigate('/equipamentos')` — dentro de um `useEffect`, sem mensagem
 * nenhuma. Na tela isso aparece como "cliquei no card, piscou e voltou".
 *
 * Isso funcionou enquanto o boot hidratava a organização inteira. Desde a 9G.3
 * o boot leve é o ÚNICO caminho (`modoHidratacao.ts`), e `nr13_info_` **não
 * está na lista de essenciais** (`essencial.ts`) — nem poderia: ela cresce com
 * o parque, e a regra de lá é que nada cresça com o número de equipamentos.
 * Ou seja: num aparelho novo o cache não tem NENHUMA ficha, e a lista (que vem
 * da projeção, não do cache) mostra 39 cartões que não abrem.
 *
 * Todas as outras telas por equipamento — inspeções, prontuários, calibrações,
 * livro, relatórios — já semeavam com `carregarEquipamento(tag)` antes de ler.
 * A ficha foi a única que ficou para trás. Aqui ela entra na mesma estratégia.
 *
 * ## O cache deixa de ser requisito, e continua sendo atalho
 *
 *   1. está no cache → abre na hora, sem rede (é também o caminho OFFLINE);
 *   2. não está      → `carregarEquipamento(tag)` traz as chaves DAQUELA TAG
 *                      (`POR_TAG`, uma consulta filtrada por organização) e a
 *                      ficha abre;
 *   3. o servidor respondeu e não há nada → `ausente`;
 *   4. o servidor NÃO respondeu           → `indisponivel`.
 *
 * Os estados 3 e 4 são separados de propósito. Dizer "equipamento não
 * encontrado" a quem está sem rede é afirmar uma exclusão que ninguém fez —
 * por isso `carregarEquipamento` devolve `{ falhou }` e por isso
 * `semearEquipamentoDetalhado` existe.
 *
 * ## O que este módulo NÃO faz
 *
 * Não hidrata a organização, não pagina, não consulta a projeção de busca e não
 * tem caminho nenhum que cresça com o tamanho da conta: a consulta é pelas
 * chaves de UMA TAG. O boot leve continua inteiro — `fichaSobDemanda.test.ts`
 * trava isso contando as chaves pedidas.
 *
 * ## RLS
 *
 * A consulta é a mesma `app_storage` de sempre, filtrada por
 * `escopoStorageAtual()` (a organização da sessão) e sob as policies do
 * Postgres. TAG de outra organização não volta — e volta como `ausente`, que é
 * a mesma resposta de uma TAG inexistente: não se confirma a existência de
 * equipamento alheio.
 */
import { carregarEquipamento, carregarInfo } from './equipamentoService';
import { normalizarTag } from './tagNormalizada';
import type { InfoEquipamento } from './tipos';

export type AberturaFicha =
  | { estado: 'carregando' }
  /** A TAG resolvida vem junto: pode diferir da digitada (ver `normalizarTag`). */
  | { estado: 'encontrado'; tag: string; info: InfoEquipamento }
  | { estado: 'ausente'; tag: string }
  | { estado: 'indisponivel'; tag: string };

/**
 * O que dá para responder SEM rede, de forma síncrona.
 *
 * Serve à inicialização do estado da tela: com a ficha em cache, ela nasce
 * pronta e não pisca um "Carregando" de um quadro. Sem ela, nasce `carregando`
 * — e nunca `ausente`, que só se afirma depois de perguntar ao servidor.
 */
export function aberturaDoCache(tag: string): AberturaFicha {
  const info = carregarInfo(tag);
  return info ? { estado: 'encontrado', tag, info } : { estado: 'carregando' };
}

/**
 * Resolve a ficha: cache, depois servidor, e só então um estado de erro.
 *
 * A SEGUNDA TENTATIVA com a TAG normalizada cobre a URL escrita/colada à mão
 * (`/equipamento/vp-01`, `/equipamento/VP-01%20` ou com espaço-duro vindo de um
 * PDF). Ela é a MESMA função que o cadastro e a importação aplicam, então a
 * variante normalizada é exatamente a chave que existe no armazenamento. A
 * tentativa EXATA vem primeiro de propósito: equipamento antigo, gravado antes
 * de `normalizarTag` existir, pode ter TAG fora dessa forma, e normalizar antes
 * de perguntar deixaria a ficha dele inalcançável.
 */
export async function abrirFicha(tag: string): Promise<AberturaFicha> {
  const doCache = aberturaDoCache(tag);
  if (doCache.estado === 'encontrado') return doCache;

  const exata = await carregarEquipamento(tag);
  const info = carregarInfo(tag);
  if (info) return { estado: 'encontrado', tag, info };

  const alternativa = normalizarTag(tag);
  if (alternativa && alternativa !== tag) {
    const outra = await carregarEquipamento(alternativa);
    const infoAlt = carregarInfo(alternativa);
    if (infoAlt) return { estado: 'encontrado', tag: alternativa, info: infoAlt };
    if (outra.falhou) return { estado: 'indisponivel', tag };
  }

  return exata.falhou ? { estado: 'indisponivel', tag } : { estado: 'ausente', tag };
}
