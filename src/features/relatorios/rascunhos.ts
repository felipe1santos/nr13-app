import { ler, salvar } from '../../services/storage';
import type { RelatorioSalvo, TipoInspecao } from './tipos';

/**
 * Fase 10B.1 · o índice dos relatórios EM RASCUNHO.
 *
 * ## Por que o rascunho não entra no índice do equipamento
 *
 * `nr13_historico_indice_<TAG>` é a origem da projeção `relatorios_index`, e
 * dela saem quatro coisas que um rascunho não pode produzir:
 *
 *  1. **o vencimento oficial** — `vencimentos_org` escolhe o relatório MAIS
 *     RECENTE de cada TAG e tira dele a próxima inspeção. Um rascunho com data
 *     de emissão viraria "o último relatório" e apagaria o prazo real do
 *     equipamento. Não é um exagero de cuidado: é o que aconteceria na primeira
 *     vez que alguém começasse um relatório e fosse almoçar;
 *  2. **o Portal do Cliente**, que lista por `listarIndice(tag)`;
 *  3. **as contagens** de relatório emitido;
 *  4. **a entrada automática no Livro**.
 *
 * Nenhuma dessas quatro precisou de um `if`: o rascunho simplesmente não chega
 * lá. Filtro esquecido é defeito; caminho que não existe, não.
 *
 * ## Então onde ele vive
 *
 *  · o CONTEÚDO, em `nr13_rel_<id>_<TAG>` — a mesma chave do relatório
 *    finalizado, com `status: 'Rascunho'`. Sincroniza entre aparelhos pela v2 e
 *    sobrevive a fechar o navegador, que é o pedido inteiro do rascunho. Ao
 *    finalizar, o registro é REESCRITO no lugar: nada é copiado, nada muda de
 *    id, e o histórico não ganha um documento fantasma;
 *  · a LISTA, aqui, em `nr13_rascunhos` — uma chave global e leve, no mesmo
 *    espírito do §7-sexies (registro pesado + índice leve). Ela é global porque
 *    a tela `/relatorios` mostra rascunhos de TODOS os equipamentos, e um
 *    índice por TAG obrigaria a varrer o parque para montar essa lista.
 *
 * O índice cresce com o número de rascunhos ABERTOS — não com o parque, não com
 * o histórico. Cada item tem ~150 bytes e some quando o relatório é finalizado.
 */
export const CHAVE_RASCUNHOS = 'nr13_rascunhos';

export interface RascunhoItem {
  /** O mesmo id do registro (`meta.codigo`). */
  id: string;
  tag: string;
  nome: string;
  tipo: TipoInspecao;
  /** `meta.codigo`, o número impresso no documento. */
  codigo: string;
  /** ISO. Serve para ordenar: o que foi mexido por último aparece primeiro. */
  atualizadoEm: string;
  criadoEm: string;
}

function lerCru(): RascunhoItem[] {
  const lista = ler<RascunhoItem[]>(CHAVE_RASCUNHOS);
  if (!Array.isArray(lista)) return [];
  return lista.filter((i) => i && typeof i.id === 'string' && typeof i.tag === 'string');
}

/** Mais recentes primeiro — a mesma ordem da lista de relatórios. */
export function listarRascunhos(): RascunhoItem[] {
  return [...lerCru()].sort((a, b) => (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? ''));
}

export function rascunhosDaTag(tag: string, lista = listarRascunhos()): RascunhoItem[] {
  return lista.filter((i) => i.tag === tag);
}

export function ehRascunhoConhecido(id: string, lista = listarRascunhos()): boolean {
  return lista.some((i) => i.id === id);
}

/** O item de índice de um registro em rascunho. Função pura, testada. */
export function resumirRascunho(r: RelatorioSalvo, agora = new Date().toISOString()): RascunhoItem {
  const anterior = lerCru().find((i) => i.id === r.id);
  return {
    id: r.id,
    tag: r.tagVaso,
    nome: r.nome,
    tipo: r.tipo,
    codigo: r.meta?.codigo ?? r.id,
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
  };
}

/**
 * O recorte que a tela aplica aos rascunhos.
 *
 * Só `termo` e `tipo` são honrados, e não é preguiça: os outros filtros de
 * `/relatorios` (período de emissão, empresa, escopo) são resolvidos pelo
 * SERVIDOR sobre a projeção, e rascunho não está na projeção. Fingir que um
 * filtro de período se aplica a um documento sem data de emissão fixada
 * responderia com uma lista que não quer dizer nada.
 *
 * Quando um desses filtros está ligado, a tela ESCONDE o bloco de rascunhos em
 * vez de mostrá-lo desfiltrado — e diz que escondeu.
 */
export function filtrarRascunhos(
  lista: RascunhoItem[],
  filtros: { termo?: string; tipo?: string },
): RascunhoItem[] {
  const termo = (filtros.termo ?? '').trim().toLowerCase();
  const tipo = (filtros.tipo ?? '').trim();
  return lista.filter((i) => {
    if (tipo && i.tipo !== tipo) return false;
    if (!termo) return true;
    return [i.tag, i.nome, i.codigo, i.id].some((c) => (c ?? '').toLowerCase().includes(termo));
  });
}

/** Grava (ou substitui) o item de índice do rascunho. */
export async function registrarRascunho(r: RelatorioSalvo): Promise<void> {
  const item = resumirRascunho(r);
  const resto = lerCru().filter((i) => i.id !== item.id);
  await salvar(CHAVE_RASCUNHOS, [item, ...resto]);
}

/**
 * Tira o id do índice de rascunhos.
 *
 * Chamado ao FINALIZAR e ao EXCLUIR. Não é "melhor esforço": um id que fica
 * aqui depois de finalizado faria a tela mostrar o mesmo relatório duas vezes —
 * uma como rascunho editável e outra como documento imutável.
 */
export async function esquecerRascunho(id: string): Promise<void> {
  const resto = lerCru().filter((i) => i.id !== id);
  if (resto.length === lerCru().length) return; // nada a fazer: não escreve à toa
  await salvar(CHAVE_RASCUNHOS, resto);
}
