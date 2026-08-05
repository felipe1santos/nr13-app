/**
 * Fila de sincronização durável, com chave de idempotência por mutação.
 *
 * Cada mutação carrega um `mutationId`. Reenviar o mesmo id é inofensivo: a RPC
 * `aplicar_mutacao_storage` registra o id no servidor e devolve o resultado
 * anterior em vez de reaplicar. "Tentar de novo" RETOMA o item existente e
 * nunca cria um segundo — foi para isso que o campo existe.
 *
 * A gravação do item na fila NÃO acontece aqui: quem grava é
 * `cacheLocal.gravarAtomico`, junto do dado, na MESMA transação do IndexedDB.
 * Dado sem fila nunca sobe ao servidor; fila sem dado sobe lixo.
 */
import { aplicarAtomico, listarTudo } from './db';
import { orgAtual } from './cacheLocal';
import { classificar, type ErroSync } from './errosSync';

export type EstadoItem =
  | 'salvo_local'
  | 'aguardando'
  | 'sincronizado'
  | 'falha_definitiva'
  | 'conflito';

export interface ItemFila {
  mutationId: string;
  op: 'set' | 'del';
  chave: string;
  valor?: string;
  /** Versão que o SERVIDOR tinha quando a primeira edição saiu. */
  versaoBase: number;
  dispositivo: string;
  criadoEm: string;
  tentativas: number;
  estado: EstadoItem;
  erro?: ErroSync;
}

const CHAVE_DISPOSITIVO = 'nr13_dispositivo_id';

/** mutationId -> item */
const fila = new Map<string, ItemFila>();

/**
 * Id estável deste aparelho. Vive no localStorage porque precisa sobreviver à
 * faxina de troca de conta (está na lista de chaves preservadas) e porque é
 * pequeno — não tem por que ocupar o IndexedDB.
 */
export function idDispositivo(): string {
  let id = localStorage.getItem(CHAVE_DISPOSITIVO);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CHAVE_DISPOSITIVO, id);
  }
  return id;
}

export function zerarFilaMemoria(): void {
  fila.clear();
}

export function listarFila(): ItemFila[] {
  return [...fila.values()];
}

export function itemDaChave(chave: string): ItemFila | null {
  for (const item of fila.values()) if (item.chave === chave) return item;
  return null;
}

/**
 * Monta o item que vai para a fila, condensando com o pendente da mesma chave.
 *
 * A `versaoBase` é a do SERVIDOR quando a PRIMEIRA edição saiu, e é preservada
 * em todas as condensações seguintes. Substituí-la pela versão local faria a
 * RPC recusar para sempre: enquanto a mutação não sobe, o servidor continua na
 * versão antiga, e uma expectativa avançada nunca casaria.
 *
 * `criadoEm` e `tentativas` seguem a mesma lógica. O `mutationId` só muda
 * quando o conteúdo muda — assim um autosave que dispara duas vezes com o
 * mesmo texto não vira uma mutação nova.
 */
export function montarItem(
  op: 'set' | 'del',
  chave: string,
  valor: string | undefined,
  versaoServidor: number,
): ItemFila {
  const anterior = itemDaChave(chave);
  const identico = anterior !== null && anterior.op === op && anterior.valor === valor;

  return {
    mutationId: identico ? anterior.mutationId : crypto.randomUUID(),
    op,
    chave,
    valor,
    versaoBase: anterior ? anterior.versaoBase : versaoServidor,
    dispositivo: idDispositivo(),
    criadoEm: anterior ? anterior.criadoEm : new Date().toISOString(),
    tentativas: identico ? anterior.tentativas : 0,
    estado: 'aguardando',
  };
}

/**
 * Coloca o item na memória, substituindo o pendente da mesma chave (a última
 * operação vence). Chamada DEPOIS de `gravarAtomico` confirmar o commit.
 */
export function registrarNaMemoria(item: ItemFila): void {
  const anterior = itemDaChave(item.chave);
  if (anterior && anterior.mutationId !== item.mutationId) fila.delete(anterior.mutationId);
  fila.set(item.mutationId, item);
}

async function persistir(item: ItemFila): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [
    { store: 'fila', acao: 'put', chave: item.mutationId, valor: item },
  ]);
}

export async function marcarEstado(
  mutationId: string,
  estado: EstadoItem,
  erroBruto?: unknown,
): Promise<void> {
  const item = fila.get(mutationId);
  if (!item) return;

  item.estado = estado;
  if (erroBruto !== undefined) {
    item.erro = classificar(erroBruto, {
      chave: item.chave,
      mutationId: item.mutationId,
      dispositivo: item.dispositivo,
      quando: new Date().toISOString(),
    });
  }
  await persistir(item);
}

export async function removerDaFila(mutationId: string): Promise<void> {
  fila.delete(mutationId);
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'fila', acao: 'delete', chave: mutationId }]);
}

/** Recarrega a fila do disco. É o que faz a pendência sobreviver a fechar o navegador. */
export async function carregarFilaDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  for (const { valor } of await listarTudo<ItemFila>(org, 'fila')) {
    if (valor?.mutationId) fila.set(valor.mutationId, valor);
  }
}
