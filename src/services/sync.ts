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
import { orgAtual, obterRegistro, gravarAtomico, type Registro } from './cacheLocal';
import { classificar, type ErroSync } from './errosSync';
import { interpretarResposta } from './contratoRpc';
import { supabase } from './supabase';
import { registrarPendencias, removerPendencia, substituirManifesto } from './manifesto';

export type EstadoItem =
  | 'salvo_local'
  | 'aguardando'
  | 'sincronizado'
  | 'falha_definitiva'
  | 'conflito'
  /**
   * O servidor recusou por regra de negócio e vai recusar sempre. A mutação
   * PARA de ser tentada, mas continua na fila — encerrada não é o mesmo que
   * confirmada, e sumir daqui faria a topbar dizer "Tudo salvo" para uma
   * alteração que o servidor nunca aceitou. Sai só por `descartarEncerrada`.
   */
  | 'encerrado';

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

/**
 * A fila SEM as encerradas: é esta a resposta para "ainda tem trabalho para
 * subir?". Quem pergunta é o selo da topbar, a contagem de pendências e a
 * guarda de logout — e nenhum deles pode ficar em alerta eterno por causa de
 * uma operação que o servidor encerrou. Elas continuam em `listarFila`, que é
 * o que a tela de Pendências mostra.
 */
export function listarPendentes(): ItemFila[] {
  return [...fila.values()].filter((i) => i.estado !== 'encerrado');
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
  if (anterior && anterior.mutationId !== item.mutationId) {
    fila.delete(anterior.mutationId);
    // Condensação: a mutação anterior deixou de existir e não pode continuar
    // sendo cobrada no manifesto como se tivesse se perdido.
    removerPendencia(anterior.mutationId);
  }
  fila.set(item.mutationId, item);
  registrarPendencias([item]);
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
  removerPendencia(mutationId);
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
  // O IndexedDB é compartilhado entre as abas da organização, então o que veio
  // dele é a visão AUTORITATIVA — é o único momento em que o manifesto pode ser
  // substituído por inteiro, inclusive por lista vazia (fila confirmadamente
  // vazia). Nos demais caminhos o manifesto só recebe merge.
  substituirManifesto([...fila.values()]);
}

// ---------------------------------------------------------------------------
// Tombstones
// ---------------------------------------------------------------------------
// Exclusão é soft-delete no servidor. Aqui guardamos a marca local para que a
// hidratação NUNCA ressuscite uma chave que este aparelho excluiu depois do que
// o servidor conhece.

interface Tombstone {
  chave: string;
  versao: number;
  excluidoEm: string;
  dispositivo: string;
}

const tombstones = new Map<string, Tombstone>();

export function zerarTombstonesMemoria(): void {
  tombstones.clear();
}

export async function registrarTombstone(chave: string, versao: number): Promise<void> {
  const t: Tombstone = {
    chave,
    versao,
    excluidoEm: new Date().toISOString(),
    dispositivo: idDispositivo(),
  };
  tombstones.set(chave, t);
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'tombstones', acao: 'put', chave, valor: t }]);
}

/** A hidratação não pode trazer de volta uma chave excluída aqui depois. */
export function tombstoneMaisNovoQue(chave: string, atualizadoEm: string): boolean {
  const t = tombstones.get(chave);
  if (!t) return false;
  const tomb = new Date(t.excluidoEm).getTime();
  if (!Number.isFinite(tomb)) return false;
  const srv = new Date(atualizadoEm).getTime();
  // Data do servidor ilegível não prova que ela é mais nova que a exclusão:
  // manter excluído é a postura segura.
  if (!Number.isFinite(srv)) return true;
  return tomb > srv;
}

/**
 * Apaga a marca de exclusão de UMA chave.
 *
 * Existe para um caso só: o servidor recusou definitivamente o `del`. Mantido o
 * tombstone, a hidratação passaria a pular para sempre uma chave que existe no
 * servidor — o aparelho ficaria dizendo "excluído" sobre um registro vivo, em
 * silêncio e sem conserto. Recusada a exclusão, o servidor é a verdade.
 */
export async function removerTombstone(chave: string): Promise<void> {
  tombstones.delete(chave);
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'tombstones', acao: 'delete', chave }]);
}

export async function carregarTombstonesDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  for (const { valor } of await listarTudo<Tombstone>(org, 'tombstones')) {
    if (valor?.chave) tombstones.set(valor.chave, valor);
  }
}

// ---------------------------------------------------------------------------
// Drenagem
// ---------------------------------------------------------------------------

/**
 * Guarda o lado perdedor de um conflito. Nenhuma versão é descartada sem
 * alguém escolher — dado de inspeção em campo não se refaz.
 */
export async function guardarConflito(chave: string, perdedor: Registro): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [
    { store: 'dados', acao: 'put', chave: `nr13_conflito_${chave}__${Date.now()}`, valor: perdedor },
  ]);
}

/**
 * Categorias que não se resolvem sozinhas com uma nova tentativa automática.
 * O item fica na fila, marcado, e só sai por ação do usuário (`tentarNovamente`).
 */
const DEFINITIVAS = new Set(['permissao', 'cota', 'sessao', 'desconhecido']);

/**
 * Recusa por REGRA DE NEGÓCIO: não existe estado futuro em que a operação passe,
 * então ela sai da fila em vez de virar pendência eterna.
 *
 * Medido em 14/08/2026: excluir um equipamento tenta apagar `nr13_livro_<TAG>`,
 * a trava de imutabilidade do banco recusa (com razão — livro emitido é registro
 * legal), e a fila retentava sem parar exibindo "⚠ 1 falha" na topbar para
 * sempre. A proteção do banco está certa; quem precisava aprender a ler a
 * recusa era o cliente.
 */
const RECUSAS_DEFINITIVAS = new Set(['recusa_definitiva']);

/**
 * Envia UM item. Só remove da fila depois que a RPC confirma — 'aplicado' ou
 * 'repetido'. Qualquer outra coisa mantém a pendência.
 */
async function enviarItem(item: ItemFila): Promise<boolean> {
  item.tentativas += 1;

  let bruto: unknown;
  try {
    const { data, error } = await supabase.rpc('aplicar_mutacao_storage', {
      p_chave: item.chave,
      p_mutation_id: item.mutationId,
      p_op: item.op,
      p_valor: item.valor ?? null,
      p_versao_esperada: item.versaoBase,
      p_dispositivo: item.dispositivo,
      p_mutado_em: item.criadoEm,
    });
    if (error) throw error;
    bruto = data;
  } catch (erro) {
    // Rede, sessão, permissão: nada sai da fila.
    await marcarEstado(item.mutationId, 'aguardando', erro);
    const cat = fila.get(item.mutationId)?.erro?.categoria;
    if (cat && RECUSAS_DEFINITIVAS.has(cat)) {
      // Encerrada: o servidor nunca vai aceitar. PARA de ser tentada, mas
      // continua na fila — até 16/08/2026 ela era removida aqui com um
      // `console.warn`, e a única falha de sync do sistema capaz de apagar uma
      // mutação sem o usuário saber era esta. Quem tira é `descartarEncerrada`.
      console.warn(
        `[sync] operação encerrada — o servidor recusou definitivamente ${item.op} de "${item.chave}".`,
        fila.get(item.mutationId)?.erro?.detalhe?.mensagemOriginal ?? '',
      );
      await marcarEstado(item.mutationId, 'encerrado');
      // Exclusão recusada: o registro continua vivo no servidor, então a marca
      // local de exclusão precisa sair para a hidratação repô-lo.
      if (item.op === 'del') await removerTombstone(item.chave);
      return false;
    }
    if (cat && DEFINITIVAS.has(cat)) await marcarEstado(item.mutationId, 'falha_definitiva');
    return false;
  }

  const r = interpretarResposta(bruto);

  if (r.status === 'aplicado' || r.status === 'repetido') {
    // Alinha a versão local à do servidor ANTES de soltar a pendência.
    const local = obterRegistro(item.chave);
    if (local) await gravarAtomico([{ chave: item.chave, registro: { ...local, versao: r.versao } }]);
    await removerDaFila(item.mutationId);
    return true;
  }

  if (r.status === 'conflito') {
    // As DUAS sobrevivem: a do servidor vira nr13_conflito_*, a local segue na
    // fila marcada, e o usuário escolhe em /pendencias.
    if (r.valor !== null) {
      await guardarConflito(item.chave, {
        valor: r.valor,
        versao: r.versao,
        atualizadoEm: r.atualizadoEm,
        dispositivo: r.dispositivo,
      });
    }
    await marcarEstado(item.mutationId, 'conflito', {
      code: 'nr13_conflito',
      message: 'versão divergente',
    });
    return false;
  }

  // Recusado. O motivo decide se é decisão do usuário ou falha definitiva.
  // Checado por igualdade explícita (e não por exclusão) porque a variante
  // 'aplicado' | 'repetido' carrega dois literais no mesmo campo e por isso não
  // funciona como discriminante da união.
  if (r.status === 'recusado') {
    // Os TRÊS motivos ligados a versão preservam a alteração e exigem decisão:
    // o aparelho ficou para trás, mas o que o usuário digitou continua valendo
    // e não pode virar "falhou, tente de novo" — tentar de novo daria no mesmo.
    if (
      r.motivo === 'versao_obsoleta' ||
      r.motivo === 'tombstone_mais_novo' ||
      r.motivo === 'anterior_ao_corte'
    ) {
      await marcarEstado(item.mutationId, 'conflito', {
        code: 'P0001',
        message: `nr13_versao_obsoleta: ${r.motivo}`,
      });
    } else {
      await marcarEstado(item.mutationId, 'falha_definitiva', {
        code: '42501',
        message: `row-level security / ${r.motivo}`,
      });
    }
  }
  return false;
}

/**
 * Drena a fila. Uma falha NÃO interrompe as demais: cada item é independente, e
 * travar a fila inteira por causa de um item sem permissão seguraria dados de
 * campo que subiriam sem dificuldade nenhuma.
 */
export async function drenar(): Promise<{ enviados: number; falhas: number }> {
  let enviados = 0;
  let falhas = 0;

  for (const item of [...fila.values()]) {
    if (item.estado === 'conflito') continue; // aguarda decisão do usuário
    // Encerrada pelo servidor: não existe tentativa que passe, e ela também não
    // é falha a corrigir. Fica listada, fora da contagem e fora da rede.
    if (item.estado === 'encerrado') continue;
    // Já sabemos que não passa sozinha: retentar a cada drenagem só gasta
    // requisição e mantém o selo em falha. Sai daqui por `tentarNovamente`,
    // que é ação explícita do usuário.
    if (item.estado === 'falha_definitiva') {
      falhas += 1;
      continue;
    }
    if (await enviarItem(item)) enviados += 1;
    else falhas += 1;
  }

  if (enviados > 0) registrarSync();

  return { enviados, falhas };
}

// ---------------------------------------------------------------------------
// profiles.ultima_sync
// ---------------------------------------------------------------------------
// Marca no perfil quando este aparelho conseguiu ENTREGAR alguma coisa ao
// servidor. É o que a tela Acessos mostra como "última sincronização".
//
// Quem gravava era o `registrarSync()` da v1; a v2 nasceu sem equivalente, e o
// resultado é uma coluna congelada na data em que a organização saiu da v1 —
// `cmam.caldeiras` marcava 05/08/2026 mesmo sincronizando normalmente. Nenhum
// dado se perde por isso, mas quem abre a tela para conferir se um aparelho
// está sincronizando lê o contrário do que está acontecendo.
//
// Best-effort de propósito: falha (offline, RLS, coluna ausente antes do
// acesso_setup.sql) é ignorada — isto é telemetria, não pode derrubar uma
// drenagem que deu certo. Throttle de 60 s em memória para não dobrar as
// requisições numa rajada de autosaves.
const SYNC_THROTTLE_MS = 60_000;
let ultimaSyncRegistradaEm = 0;

function registrarSync(): void {
  const agora = Date.now();
  if (agora - ultimaSyncRegistradaEm < SYNC_THROTTLE_MS) return;
  ultimaSyncRegistradaEm = agora;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      await supabase.from('profiles').update({ ultima_sync: new Date().toISOString() }).eq('id', uid);
    } catch {
      ultimaSyncRegistradaEm = 0; // sem marcar: tenta de novo na próxima drenagem
    }
  })();
}

/** Só para teste: zera o throttle do registrarSync. */
export function zerarThrottleSync(): void {
  ultimaSyncRegistradaEm = 0;
}

/**
 * Retoma um item existente pelo `mutationId`. NUNCA cria um segundo: a RPC é
 * idempotente por esse id, então reenviar é seguro e reenfileirar não seria.
 */
export async function tentarNovamente(mutationId: string): Promise<void> {
  const item = fila.get(mutationId);
  if (!item) return;
  if (item.estado === 'encerrado') return; // gastaria requisição para a mesma recusa
  await enviarItem(item);
}

/**
 * Tira da fila uma mutação ENCERRADA. É a única saída dela, e é ação explícita
 * do usuário na tela de Pendências — que é a diferença entre "o usuário
 * dispensou" e "o app apagou sem avisar". Item em qualquer outro estado é
 * ignorado: aí ainda existe trabalho a subir.
 */
export async function descartarEncerrada(mutationId: string): Promise<void> {
  if (fila.get(mutationId)?.estado !== 'encerrado') return;
  await removerDaFila(mutationId);
}
