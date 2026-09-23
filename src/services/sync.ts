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
import {
  orgAtual,
  obterRegistro,
  gravarAtomico,
  removerDaMemoria,
  type Registro,
} from './cacheLocal';
import { deveGuardarBase, esquecerBase, registrarBase } from './baseColecao';
import { classificar, type ErroSync } from './errosSync';
import { interpretarResposta, type RespostaMutacao } from './contratoRpc';
import { mergeDeConflito } from './mergeColecao';
import { PROTOCOLO_SYNC } from './protocoloSync';
import { supabase } from './supabase';
import { registrarPendencias, removerPendencia, substituirManifesto } from './manifesto';
import { colecaoDaChave, ehColecao, marcarRemovido, removido } from './colecoes';
import { configPermiteColecao, flagsSync, marcarParaRevalidar, origemConfigSync } from './flagsSync';
import { revalidarConfigSync } from './flag';
import { lerLinhaDoServidor } from './leituraDirigida';

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
  /**
   * `mutationId` da mutação que terminou em conflito e que ESTA resolve.
   *
   * Só a resolução de conflito preenche. Medido contra o banco em 16/08/2026
   * (docs/medicoes/2026-08-16-fase3-mutationid.md): a tentativa que dá conflito
   * fica registrada no servidor com esse resultado, então reenviar o mesmo id
   * devolve `repetido` com o valor do SERVIDOR — sem gravar nada. A resolução
   * precisa de id NOVO; este campo é o vínculo com o original, para auditoria.
   */
  resolveDe?: string;
  /**
   * A base desta mutação NÃO foi confirmada pelo servidor: a chave não estava
   * no cache e a leitura dirigida não teve resposta (offline). `versaoBase`
   * vale 0 aqui só por formato — não é a afirmação "a chave não existe".
   * Antes de enviar, a drenagem pergunta ao servidor (`resolverBaseDesconhecida`).
   */
  baseDesconhecida?: boolean;
  /**
   * Versão que o SERVIDOR informou ao RECUSAR por versão.
   *
   * Só a recusa preenche, e sem ela não existe reenvio possível: a exclusão
   * deixa um piso permanente em `app_storage_excluidos`, e a RPC só aceita
   * `versaoBase + 1 > piso`. Reenviar com a base antiga seria recusado de
   * novo, para sempre — o item ficaria eternamente no selo.
   */
  versaoServidor?: number;
}

/**
 * A cópia guardada quando duas versões da mesma chave divergem. UMA por chave —
 * a cópia relevante é a mais recente do servidor, e guardar uma por tentativa
 * era o vazamento que enchia o cache.
 */
export interface RegistroConflito {
  chave: string;
  /** Item da fila em conflito. `null` depois de resolvido. */
  mutationId: string | null;
  /** Versão do servidor no momento da detecção. */
  remoto: Registro | null;
  /** Versão local no momento da detecção — preservada para o usuário comparar. */
  local: Registro | null;
  detectadoEm: string;
  /**
   * Preenchido quando o usuário decide. O lado PERDEDOR continua guardado aqui
   * até ele mandar descartar: escolher um lado não pode apagar o outro em
   * silêncio, nos dois sentidos (I-05).
   */
  resolucao?: { escolha: 'local' | 'servidor'; em: string };
}

const CHAVE_DISPOSITIVO = 'nr13_dispositivo_id';

/**
 * Prefixo que a versão anterior usava para guardar a cópia do conflito DENTRO
 * da store `dados`. Só a migração o conhece; nada novo grava com ele.
 */
const PREFIXO_CONFLITO_ANTIGO = 'nr13_conflito_';

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
    // A base continua a da PRIMEIRA edição — e, com ela, o fato de não ter
    // sido confirmada.
    ...(anterior?.baseDesconhecida ? { baseDesconhecida: true } : {}),
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
    // ...e o conflito aberto daquela chave apontava para ela. Reapontar aqui é
    // o que mantém "Manter a minha" ligado a uma mutação que existe de verdade.
    const c = conflitos.get(item.chave);
    if (c && !c.resolucao && c.mutationId === anterior.mutationId) {
      conflitos.set(item.chave, { ...c, mutationId: item.mutationId });
    }
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

function recusadaSemMarca(item: ItemFila): boolean {
  return (item.erro?.detalhe?.mensagemOriginal ?? '').includes('nr13_exclusao_sem_marca');
}

/** Recarrega a fila do disco. É o que faz a pendência sobreviver a fechar o navegador. */
export async function carregarFilaDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  for (const { valor } of await listarTudo<ItemFila>(org, 'fila')) {
    if (!valor?.mutationId) continue;
    // Herança de um bundle anterior: a exclusão sem marca recusada virou
    // `falha_definitiva` (lá ela era "desconhecido") e nunca mais seria
    // tentada. Aqui ela volta à fila, e a recusa seguinte passa por
    // `recuperarExclusaoSemMarca` — que este bundle tem e aquele não tinha.
    if (valor.estado === 'falha_definitiva' && recusadaSemMarca(valor)) valor.estado = 'aguardando';
    fila.set(valor.mutationId, valor);
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

// ---------------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------------
// A cópia da versão do servidor vivia em `dados`, sob
// `nr13_conflito_<chave>__<Date.now()>`. Três defeitos num só lugar:
// `hidratarDoDisco` carrega `dados` inteira no Map (a cópia virava cache de
// leitura), nenhuma família de chave a conhecia (caía em escopo 'global', nunca
// indexada nem limpa), e cada retentativa gravava MAIS UMA, sem teto.
//
// Agora: store própria, uma entrada por chave, fora do Map.

/** chave -> cópia do conflito */
const conflitos = new Map<string, RegistroConflito>();

export function zerarConflitosMemoria(): void {
  conflitos.clear();
}

export function listarConflitos(): RegistroConflito[] {
  return [...conflitos.values()];
}

export function conflitoDaChave(chave: string): RegistroConflito | null {
  return conflitos.get(chave) ?? null;
}

/** Conflitos ainda SEM decisão — é o que a tela cobra do usuário. */
export function conflitosPendentes(): RegistroConflito[] {
  return listarConflitos().filter((c) => !c.resolucao);
}

/** Versões perdedoras guardadas, à espera de descarte explícito. */
export function conflitosResolvidos(): RegistroConflito[] {
  return listarConflitos().filter((c) => c.resolucao);
}

export async function carregarConflitosDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  for (const { valor } of await listarTudo<RegistroConflito>(org, 'conflitos')) {
    if (valor?.chave) conflitos.set(valor.chave, valor);
  }
}

async function persistirConflito(c: RegistroConflito): Promise<void> {
  conflitos.set(c.chave, c);
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'conflitos', acao: 'put', chave: c.chave, valor: c }]);
}

/**
 * Guarda AS DUAS versões de um conflito. Nenhuma é descartada sem alguém
 * escolher — dado de inspeção em campo não se refaz.
 *
 * Sobrescreve a cópia anterior da mesma chave de propósito: o que o usuário
 * precisa comparar é a versão vigente no servidor, não o histórico de
 * tentativas fracassadas.
 */
export async function guardarConflito(
  chave: string,
  remoto: Registro | null,
  mutationId: string,
): Promise<void> {
  await persistirConflito({
    chave,
    mutationId,
    remoto,
    local: obterRegistro(chave),
    detectadoEm: new Date().toISOString(),
  });
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

/** Regrava no cache local o valor VIGENTE do servidor para uma chave. Falha de rede: fica como está. */
async function restaurarDoServidor(chave: string): Promise<void> {
  try {
    const org = orgAtual();
    if (!org) return;
    const { data, error } = await supabase
      .from('app_storage')
      .select('valor, versao, atualizado_em, dispositivo, deletado_em')
      .eq('org_id', org)
      .eq('chave', chave)
      .maybeSingle();
    if (error) return; // sem resposta: nada decidido, a cópia local fica
    // O servidor diz que a chave NÃO existe (excluída ou nunca criada): a cópia
    // local sai também. Até 23/09/2026 este ramo não fazia nada e deixava a
    // leitura para "a hidratação seguinte" — que é incremental e nunca traz de
    // volta uma exclusão antiga. Resultado medido: depois de "Descartar a
    // minha", o valor que o servidor excluíra continuava no aparelho, sobrevivia
    // ao F5 e voltava a dar conflito na próxima edição.
    if (!data || data.deletado_em || typeof data.valor !== 'string') {
      if (obterRegistro(chave)) await gravarAtomico([{ chave, remover: true }]);
      return;
    }
    await gravarAtomico([
      {
        chave,
        registro: { valor: data.valor, versao: data.versao, atualizadoEm: data.atualizado_em, dispositivo: data.dispositivo },
      },
    ]);
  } catch {
    // sem rede: a próxima hidratação alinha
  }
}

/**
 * Troca a mutação em conflito pelo MERGE das duas versões — quando dá.
 *
 * Devolve `true` se resolveu. `false` significa "isto é do usuário", e o
 * chamador segue para `guardarConflito` como sempre fez.
 *
 * A troca vai numa transação só (I-01): remover a original e depois criar a
 * mesclada deixaria uma janela em que a alteração do usuário não está em fila
 * nenhuma — fechar o navegador ali a perderia. É a mesma transação de
 * `resolverMantendoLocal`, pelo mesmo motivo.
 *
 * `versaoBase` é a do SERVIDOR: o merge foi calculado EM CIMA dela, e mandar a
 * base antiga seria recusado para sempre.
 *
 * A base NÃO avança aqui. O merge é uma proposta deste aparelho até o servidor
 * confirmá-la; avançar agora afirmaria um estado que ninguém confirmou.
 */
async function resolverColecaoAutomaticamente(
  item: ItemFila,
  r: Extract<RespostaMutacao, { status: 'conflito' }>,
): Promise<boolean> {
  // Exclusão de CHAVE inteira não é merge de lista: quem apagou a chave não
  // está propondo itens, e unir aqui recriaria o que o usuário mandou sumir.
  if (item.op !== 'set') return false;

  const local = obterRegistro(item.chave);
  const auto = await mergeDeConflito(item.chave, item.valor ?? local?.valor, r.valor);
  if (!auto) return false;

  const novo: ItemFila = {
    mutationId: crypto.randomUUID(),
    resolveDe: item.mutationId,
    op: 'set',
    chave: item.chave,
    valor: auto.valor,
    versaoBase: r.versao,
    dispositivo: idDispositivo(),
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    estado: 'aguardando',
  };

  await gravarAtomico(
    [
      {
        chave: item.chave,
        registro: {
          valor: auto.valor,
          // A versão do SERVIDOR: é o que este aparelho passou a conhecer. A
          // versão da mutação mesclada só existirá quando ela for aplicada.
          versao: r.versao,
          atualizadoEm: r.atualizadoEm,
          dispositivo: r.dispositivo,
        },
      },
    ],
    [novo],
    [],
    [{ store: 'fila', acao: 'delete', chave: item.mutationId }],
  );

  fila.delete(item.mutationId);
  removerPendencia(item.mutationId);
  fila.set(novo.mutationId, novo);
  registrarPendencias([novo]);

  console.info(
    `[sync] conflito de coleção resolvido sozinho em "${item.chave}": ` +
      `+${auto.merge.adicionados.length} item(ns), ${auto.merge.removidos.length} excluído(s).`,
  );
  return true;
}

/**
 * Envia UM item. Só remove da fila depois que a RPC confirma — 'aplicado' ou
 * 'repetido'. Qualquer outra coisa mantém a pendência.
 */
/**
 * Base DESCONHECIDA: a escrita aconteceu com a chave fora do cache e sem
 * resposta do servidor (offline). Antes de enviar, pergunta — e só então
 * decide. Nunca manda `versaoBase: 0` como se o servidor tivesse confirmado a
 * ausência, e nunca sobrescreve em silêncio o que o servidor tem.
 *
 * | servidor | decisão |
 * |---|---|
 * | sem resposta | espera (item fica na fila, marcado como rede) |
 * | confirmou ausência | base 0 é verdade: envia |
 * | tem o MESMO valor | a escrita já está lá: adota a versão, sai da fila |
 * | tem outro valor | conflito — merge para coleção, decisão manual para o resto |
 * | excluiu a chave | "excluído em outro aparelho": recriar ou descartar é do usuário |
 */
async function resolverBaseDesconhecida(item: ItemFila): Promise<'enviar' | 'resolvido' | 'esperar'> {
  const r = await lerLinhaDoServidor(item.chave);
  if (r.estado === 'indisponivel') {
    await marcarEstado(item.mutationId, 'aguardando', new TypeError('Failed to fetch'));
    return 'esperar';
  }
  if (r.estado === 'ausente') {
    item.baseDesconhecida = false;
    item.versaoBase = 0;
    await persistir(item);
    return 'enviar';
  }

  const { linha } = r;
  const mesmoValor =
    (item.op === 'set' && !linha.excluida && linha.valor === (item.valor ?? null)) ||
    (item.op === 'del' && linha.excluida);
  if (mesmoValor) {
    const local = obterRegistro(item.chave);
    if (local && item.op === 'set') await gravarAtomico([{ chave: item.chave, registro: { ...local, versao: linha.versao } }]);
    await removerDaFila(item.mutationId);
    return 'resolvido';
  }

  if (linha.excluida) {
    item.versaoServidor = linha.versao;
    await marcarEstado(item.mutationId, 'conflito', {
      code: 'P0001',
      message: 'nr13_versao_obsoleta: base desconhecida e a chave foi excluída no servidor',
    });
    return 'esperar';
  }

  const conflito: Extract<RespostaMutacao, { status: 'conflito' }> = {
    status: 'conflito',
    versao: linha.versao,
    valor: linha.valor,
    atualizadoEm: linha.atualizadoEm,
    dispositivo: linha.dispositivo,
  };
  if (await resolverColecaoAutomaticamente(item, conflito)) return 'resolvido';
  await guardarConflito(
    item.chave,
    { valor: linha.valor ?? '', versao: linha.versao, atualizadoEm: linha.atualizadoEm, dispositivo: linha.dispositivo },
    item.mutationId,
  );
  await marcarEstado(item.mutationId, 'conflito', { code: 'nr13_conflito', message: 'base desconhecida e valor divergente' });
  return 'esperar';
}

async function enviarItem(item: ItemFila): Promise<boolean> {
  if (item.baseDesconhecida) {
    const decisao = await resolverBaseDesconhecida(item);
    if (decisao === 'resolvido') return true;
    if (decisao === 'esperar') return false;
  }
  if (item.tentativas === 0) await semMarcasParaEnvio(item);
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
      // Alteração OU exclusão recusada: o valor local (a versão que o servidor
      // nunca vai aceitar — ex.: certificado emitido editado num aparelho
      // atrasado, ou relatório finalizado apagado) volta a ser o do servidor.
      // Sem isto, o aparelho mostraria um documento que não existe em lugar
      // nenhum além dele — ou esconderia, até a próxima hidratação, um que existe.
      await restaurarDoServidor(item.chave);
      return false;
    }
    if (cat && DEFINITIVAS.has(cat)) await marcarEstado(item.mutationId, 'falha_definitiva');
    if (cat === 'app_desatualizado') await recuperarExclusaoSemMarca(item);
    return false;
  }

  const r = interpretarResposta(bruto);

  if (r.status === 'aplicado' || r.status === 'repetido') {
    // Alinha a versão local à do servidor ANTES de soltar a pendência.
    const local = obterRegistro(item.chave);
    if (local) await gravarAtomico([{ chave: item.chave, registro: { ...local, versao: r.versao } }]);
    // A BASE CONFIRMADA, e este é o ÚNICO lugar do produto que a avança por
    // ACK. A ordem importa e é a do contrato: versão alinhada → base gravada →
    // só então a mutação sai da fila. Se o processo morrer entre a base e a
    // remoção, o reenvio do mesmo `mutationId` volta `repetido` e regrava a
    // MESMA base — idempotente. Se a ordem fosse inversa, morrer no meio
    // deixaria uma mutação confirmada sem base nenhuma, e o próximo merge
    // devolveria ao usuário uma decisão que o servidor já tinha tomado.
    //
    // `repetido` aqui é o genuíno: `interpretarResposta` desmascara o
    // `repetido` que carrega conflito ou recusa guardada. Conflito, recusa,
    // timeout e erro de rede não passam por este ramo — nenhum deles avança a
    // base, que é o requisito.
    if (deveGuardarBase(item.chave)) {
      if (item.op === 'set') await registrarBase(item.chave, { versao: r.versao, valor: item.valor ?? '' });
      else await esquecerBase(item.chave);
    }
    await removerDaFila(item.mutationId);
    // O valor deste aparelho é agora o do servidor: um conflito ainda aberto
    // nesta chave virou pergunta sem resposta possível.
    await encerrarConflitoVencidoPelaFila(item.chave);
    return true;
  }

  if (r.status === 'conflito') {
    // MERGE AUTOMÁTICO DE COLEÇÃO — desligado em produção (`flagsSync`).
    //
    // Quando ligado, a lista das duas versões é unida por item ANTES de o
    // conflito existir para o usuário: criação offline dos dois lados, itens
    // diferentes alterados, subconjunto estrito e exclusão deixam de ser
    // pergunta. Só divergência no MESMO item continua descendo para a tela.
    //
    // Não é atalho e não pula etapa: o resultado sobe como mutação NOVA, com
    // `versaoBase` = a versão que o servidor acabou de informar, e passa pelo
    // mesmo ACK de todas as outras — é lá, e só lá, que a base avança.
    if (await resolverColecaoAutomaticamente(item, r)) return false;

    // As DUAS sobrevivem: a do servidor vai para a store `conflitos`, a local
    // segue na fila marcada, e o usuário escolhe em /pendencias.
    await guardarConflito(
      item.chave,
      r.valor === null
        ? null
        : {
            valor: r.valor,
            versao: r.versao,
            atualizadoEm: r.atualizadoEm,
            dispositivo: r.dispositivo,
          },
      item.mutationId,
    );
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
      // A versão do servidor entra ANTES do estado: `marcarEstado` persiste o
      // item, e um reenvio sem essa base seria recusado para sempre.
      const emFila = fila.get(item.mutationId);
      if (emFila) emFila.versaoServidor = r.versao;
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

function temColecaoAEnviar(): boolean {
  for (const i of fila.values()) {
    if (ehColecao(i.chave) && i.estado !== 'conflito' && i.estado !== 'encerrado') return true;
  }
  return false;
}

/**
 * O servidor confirmou, NESTA conexão, que a organização NÃO usa tombstone:
 * as marcas saem da lista antes do primeiro envio e a exclusão vira a de
 * sempre.
 *
 * É o outro lado de `colecoes.deveMarcarExclusao`: quem excluiu sem saber a
 * configuração (boot offline sem recibo) ou com um recibo que o administrador
 * já desfez MARCOU; aqui, com a resposta do servidor na mão, a marca vira a
 * remoção que aquela organização espera. Nada é excluído a mais — o item
 * marcado já estava fora de todas as telas.
 *
 * Só na PRIMEIRA tentativa: um reenvio do mesmo `mutationId` precisa levar o
 * MESMO conteúdo, senão um ACK perdido registraria como base algo diferente do
 * que o servidor guardou. O valor local é reescrito junto, para que aparelho e
 * servidor fiquem iguais depois do ACK.
 */
async function semMarcasParaEnvio(item: ItemFila): Promise<void> {
  if (item.op !== 'set' || !item.valor) return;
  if (origemConfigSync() !== 'servidor' || flagsSync().tombstone) return;
  if (!ehColecao(item.chave)) return;
  let lista: unknown;
  try {
    lista = JSON.parse(item.valor);
  } catch {
    return;
  }
  const marcado = (i: unknown) => !!i && typeof i === 'object' && removido(i as object);
  if (!Array.isArray(lista) || !lista.some(marcado)) return;

  const valor = JSON.stringify(lista.filter((i) => !marcado(i)));
  item.valor = valor;
  const local = obterRegistro(item.chave);
  if (local) {
    await gravarAtomico([{ chave: item.chave, registro: { ...local, valor } }], [item]);
  } else {
    await persistir(item);
  }
}

/**
 * `nr13_exclusao_sem_marca` num aparelho que JÁ fala o protocolo 2.
 *
 * Acontece quando a exclusão foi gravada antes de o aparelho saber que a
 * organização passou a marcar — recibo velho, ou fila herdada de um bundle
 * anterior. Até o canário, o item ficava "aguardando" para sempre: cada
 * drenagem era recusada, a hidratação pulava a chave por haver pendência, e o
 * usuário não conseguia nem ver o item para refazer a exclusão.
 *
 * O conserto usa uma PROVA, não uma suposição: a guarda só roda quando a
 * versão confere (`aplicar_mutacao_storage` compara versões ANTES do UPDATE).
 * Então, se o servidor ainda está em `item.versaoBase`, a lista dele é
 * exatamente a lista que este aparelho editou — e todo id que está lá e não
 * está aqui foi excluído AQUI. Esses voltam à lista com `removidoEm`, a
 * mutação sai de novo e passa.
 *
 * Se a versão do servidor já é outra, "ausente aqui" deixa de ser prova (pode
 * ser item criado por outro aparelho). Aí a decisão é do usuário: o item vai
 * para `conflito`, sai da drenagem e aparece em Pendências com a ação
 * "Usar a versão do servidor" (`descartarERestaurar`).
 */
async function recuperarExclusaoSemMarca(item: ItemFila): Promise<void> {
  const def = colecaoDaChave(item.chave);
  const org = orgAtual();
  if (!def || !org || item.op !== 'set' || !item.valor) {
    await marcarEstado(item.mutationId, 'conflito');
    return;
  }

  // O servidor evidentemente marca: esta sessão precisa saber disso já.
  marcarParaRevalidar();
  try {
    await revalidarConfigSync();
  } catch {
    // sem resposta: segue com a prova abaixo, que não depende dela
  }

  type LinhaServidor = { valor: string | null; versao: number; deletado_em: string | null };
  let servidor: LinhaServidor | null;
  try {
    const { data, error } = await supabase
      .from('app_storage')
      .select('valor, versao, deletado_em')
      .eq('org_id', org)
      .eq('chave', item.chave)
      .maybeSingle();
    if (error) return; // sem leitura: tenta na próxima drenagem, nada decidido
    servidor = (data ?? null) as LinhaServidor | null;
  } catch {
    return;
  }

  const paraUsuario = () => marcarEstado(item.mutationId, 'conflito');
  // A lista mudou no servidor entre a recusa e esta leitura: a prova não vale
  // mais, mas também não há o que decidir aqui. O próximo envio volta como
  // CONFLITO de versão (não mais como recusa), e o merge — que marca as
  // exclusões clássicas pela base (`mergeColecao`) — resolve; com o merge
  // desligado, vira a tela de conflito com as duas versões.
  if (servidor && !servidor.deletado_em && servidor.versao !== item.versaoBase) return;
  if (!servidor || servidor.deletado_em || typeof servidor.valor !== 'string') {
    await paraUsuario();
    return;
  }

  let local: unknown;
  let doServidor: unknown;
  try {
    local = JSON.parse(item.valor);
    doServidor = JSON.parse(servidor.valor);
  } catch {
    await paraUsuario();
    return;
  }
  if (!Array.isArray(local) || !Array.isArray(doServidor)) {
    await paraUsuario();
    return;
  }

  const aqui = new Set(
    (local as object[]).map((i) => def.id(i)).filter((x): x is string => x !== null),
  );
  const excluidosAqui = (doServidor as object[]).filter((i) => {
    const id = def.id(i);
    return id !== null && !aqui.has(id) && !removido(i);
  });
  if (excluidosAqui.length === 0) {
    await paraUsuario();
    return;
  }

  const quando = new Date().toISOString();
  const valor = JSON.stringify([...(local as object[]), ...excluidosAqui.map((i) => marcarRemovido(i, quando))]);
  const novo: ItemFila = {
    mutationId: crypto.randomUUID(),
    resolveDe: item.mutationId,
    op: 'set',
    chave: item.chave,
    valor,
    versaoBase: item.versaoBase,
    dispositivo: idDispositivo(),
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    estado: 'aguardando',
  };

  // Dado e fila na MESMA transação: sair da fila a original e entrar a nova
  // em dois passos abriria uma janela sem a exclusão em fila nenhuma.
  const reg = obterRegistro(item.chave);
  await gravarAtomico(reg ? [{ chave: item.chave, registro: { ...reg, valor } }] : [], [novo]);
  await removerDaFila(item.mutationId);
  fila.set(novo.mutationId, novo);
  registrarPendencias([novo]);
}

/**
 * "Usar a versão do servidor" para uma exclusão sem marca que não pôde ser
 * refeita sozinha. Tira a pendência e regrava o valor do servidor no cache —
 * sem isso a hidratação incremental não traria a chave de volta (ela não mudou
 * no servidor), e o usuário continuaria sem ver o item para excluí-lo de novo.
 */
export async function descartarERestaurar(mutationId: string): Promise<void> {
  const item = fila.get(mutationId);
  if (!item || item.estado !== 'conflito') return;
  await removerDaFila(mutationId);
  await restaurarDoServidor(item.chave);
}

/**
 * Drena a fila. Uma falha NÃO interrompe as demais: cada item é independente, e
 * travar a fila inteira por causa de um item sem permissão seguraria dados de
 * campo que subiriam sem dificuldade nenhuma.
 */
export async function drenar(): Promise<{ enviados: number; falhas: number }> {
  let enviados = 0;
  let falhas = 0;

  // COLEÇÃO SÓ SOBE COM A CONFIGURAÇÃO CONFIRMADA NESTA CONEXÃO (23/09/2026).
  //
  // Subir uma lista decide duas coisas que dependem da configuração da
  // organização: se as marcas de exclusão viajam ou saem (`semMarcasParaEnvio`)
  // e se um conflito se resolve sozinho (`mergeDeConflito`). Com um recibo de
  // disco — boot offline, ou reconexão ainda não revalidada — nenhuma das duas
  // pode ser tomada: o administrador pode ter mudado a configuração enquanto o
  // aparelho estava fora. Então a drenagem PERGUNTA primeiro e, sem resposta,
  // a coleção espera na fila. Esperar não é falha: nada sai da fila, e a
  // próxima drenagem tenta de novo.
  if (!configPermiteColecao() && temColecaoAEnviar()) {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        await revalidarConfigSync();
      } catch {
        // sem resposta: a coleção espera
      }
    }
  }

  // PASSADAS (canário ZZ, 23/09/2026): o merge automático e a exclusão
  // refeita com marca criam uma mutação NOVA durante a drenagem. Iterando só
  // a foto da fila tirada no início, essa mutação ficava parada até o
  // próximo gatilho — medido: 90 s sem envio, e nem o reload a subia (o boot
  // leve não drena, e a retentativa periódica só pega item com erro de rede).
  // Cada passada envia só o que a anterior ainda não viu; o teto impede que
  // uma cadeia inesperada vire laço.
  const vistos = new Set<string>();
  for (let passada = 0; passada < 3; passada++) {
    const lote = [...fila.values()].filter((i) => !vistos.has(i.mutationId));
    if (lote.length === 0) break;
    for (const item of lote) {
      vistos.add(item.mutationId);
      if (item.estado === 'conflito') continue; // aguarda decisão do usuário
      if (ehColecao(item.chave) && !configPermiteColecao()) continue; // espera a confirmação
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
      // QUAL PROTOCOLO ESTE APARELHO FALA.
      //
      // Pega carona no mesmo throttle e na mesma condição do `ultima_sync`:
      // "este aparelho conseguiu ENTREGAR alguma coisa". É o que torna a leitura
      // confiável — um aparelho que só abriu a tela e não escreveu nada não
      // precisa entrar na conta de prontidão da organização.
      //
      // O bundle ANTIGO não chama isto, e é justamente essa ausência que o
      // torna visível: `sync_v2_prontidao` cruza quem ESCREVEU (a coluna
      // `app_storage.dispositivo`, que ele alimenta sem saber) com quem se
      // REGISTROU aqui. A diferença são os aparelhos presumidos antigos.
      //
      // Best-effort como o resto desta função: falha (banco sem
      // `sync_v2_por_org.sql`, offline) não pode derrubar uma drenagem que deu
      // certo. Isto é telemetria; a SEGURANÇA é a trava do servidor.
      await supabase.rpc('registrar_dispositivo_sync', {
        p_dispositivo: idDispositivo(),
        p_protocolo: PROTOCOLO_SYNC,
      });
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
  // CONFLITO NÃO SE RESOLVE RETENTANDO — e retentar aqui DESTRÓI a edição.
  //
  // Medido contra o banco em 16/08/2026: a tentativa que deu conflito fica
  // registrada no servidor, então o mesmo `mutationId` volta como `repetido`
  // carregando o valor do SERVIDOR. `enviarItem` trata `repetido` como sucesso:
  // carimba a versão do servidor no registro local (que ainda tem o valor do
  // usuário) e remove o item da fila. A edição fica só no aparelho, com versão
  // alta demais para `aplicarRemoto` corrigir — divergência permanente, sem
  // pendência, sem erro. Quem resolve conflito é o usuário, em /pendencias.
  if (item.estado === 'conflito') return;
  await enviarItem(item);
}

/**
 * Tira da fila uma mutação ENCERRADA. É a única saída dela, e é ação explícita
 * do usuário na tela de Pendências — que é a diferença entre "o usuário
 * dispensou" e "o app apagou sem avisar". Item em qualquer outro estado é
 * ignorado: aí ainda existe trabalho a subir.
 */
// ---------------------------------------------------------------------------
// Resolução de conflito
// ---------------------------------------------------------------------------

/**
 * "Manter a minha": manda o valor LOCAL para o servidor, por cima da versão
 * dele.
 *
 * Cria mutação NOVA, e isso foi decidido por medição, não por gosto
 * (docs/medicoes/2026-08-16-fase3-mutationid.md): a tentativa que deu conflito
 * fica registrada no servidor com `resultado.status = 'conflito'`, então
 * reenviar o MESMO `mutationId` cai no caminho rápido de idempotência e devolve
 * `repetido` — carregando o valor do SERVIDOR, sem gravar nada. Como
 * `enviarItem` trata `repetido` como sucesso, reusar o id apagaria a edição do
 * usuário em silêncio.
 *
 * Não é violação de I-03: a idempotência protege contra reenviar A MESMA
 * mutação. Esta é outra — mesma intenção de valor, base diferente, decisão
 * humana no meio. `resolveDe` guarda o vínculo.
 *
 * A troca vai numa transação só (I-01): remover o original e depois criar o
 * novo deixaria uma janela em que a alteração do usuário não está em fila
 * nenhuma — fechar o navegador ali a perderia.
 */
export async function resolverMantendoLocal(chave: string): Promise<void> {
  const c = conflitos.get(chave);
  if (!c || c.resolucao) return;

  // "A minha" é o que ESTE aparelho tem AGORA, não a fotografia do instante em
  // que o conflito foi detectado. Enquanto o conflito espera decisão o usuário
  // continua trabalhando: o autosave regrava a chave e `registrarNaMemoria`
  // CONDENSA, apagando da fila justamente o item que o conflito aponta.
  //
  // Medido em produção em 10/09/2026, com o container "Inspeção da IA" já
  // preenchido: `nr13_docs_ZZ-FASE3` em conflito, `mutationId` apontando para
  // um item inexistente e o botão "Manter a minha" fazendo NADA — sem erro, sem
  // aviso, sem mudança na tela. Um botão que não faz nada é pior do que um que
  // falha: o usuário acredita que decidiu.
  const original = c.mutationId ? (fila.get(c.mutationId) ?? null) : null;
  const atual = original ?? itemDaChave(chave);
  const registroLocal = obterRegistro(chave);

  const novo: ItemFila | null =
    atual || registroLocal
      ? {
          mutationId: crypto.randomUUID(),
          ...(atual ? { resolveDe: atual.mutationId } : {}),
          op: atual?.op ?? 'set',
          chave,
          valor: atual ? atual.valor : registroLocal?.valor,
          // A base é a versão do SERVIDOR. Sem isso a RPC recusaria para sempre: o
          // servidor está numa versão que o aparelho nunca esperou.
          versaoBase: c.remoto?.versao ?? atual?.versaoBase ?? registroLocal?.versao ?? 0,
          dispositivo: idDispositivo(),
          criadoEm: new Date().toISOString(),
          tentativas: 0,
          estado: 'aguardando',
        }
      : // Sem item na fila e sem registro local não sobrou nada para enviar: a
        // decisão vira apenas encerrar a cobrança. O lado do servidor continua
        // guardado em `remoto`.
        null;

  const resolvido: RegistroConflito = {
    ...c,
    mutationId: null,
    resolucao: { escolha: 'local', em: new Date().toISOString() },
  };

  const org = orgAtual();
  if (org) {
    const ops: Parameters<typeof aplicarAtomico>[1] = [];
    if (novo) ops.push({ store: 'fila', acao: 'put', chave: novo.mutationId, valor: novo });
    if (atual) ops.push({ store: 'fila', acao: 'delete', chave: atual.mutationId });
    ops.push({ store: 'conflitos', acao: 'put', chave, valor: resolvido });
    await aplicarAtomico(org, ops);
  }

  if (atual) {
    fila.delete(atual.mutationId);
    removerPendencia(atual.mutationId);
  }
  if (novo) {
    fila.set(novo.mutationId, novo);
    registrarPendencias([novo]);
  }
  conflitos.set(chave, resolvido);
}

/**
 * Encerra o conflito que a própria fila já resolveu.
 *
 * Quando uma escrita POSTERIOR da mesma chave sobe com sucesso, o valor deste
 * aparelho passou a ser o do servidor — não existe mais decisão a tomar. Sem
 * isto o registro do conflito sobrevivia à vitória, apontando para um item que
 * já saiu da fila, e a tela cobrava para sempre uma escolha que nada mudaria.
 *
 * Marca como resolvido em vez de apagar: o lado perdedor continua guardado até
 * o descarte explícito, como em toda decisão de conflito.
 */
export async function encerrarConflitoVencidoPelaFila(chave: string): Promise<void> {
  const c = conflitos.get(chave);
  if (!c || c.resolucao) return;
  await persistirConflito({
    ...c,
    mutationId: null,
    resolucao: { escolha: 'local', em: new Date().toISOString() },
  });
}

/**
 * "Usar a do servidor": aplica o valor remoto no cache e encerra a pendência.
 *
 * Não toca na rede — o servidor já tem esse valor. Funciona 100% offline, que é
 * o caso de uso real: conflito nasce de trabalho offline.
 *
 * O valor LOCAL não é apagado: ele fica em `local`, marcado como substituído,
 * até o usuário mandar descartar. O plano macro previa apagar a cópia aqui, o
 * que descartaria a versão do usuário sem ela existir em lugar nenhum — o
 * espelho exato do problema que esta fase conserta.
 */
export async function resolverUsandoServidor(chave: string): Promise<void> {
  const c = conflitos.get(chave);
  if (!c || c.resolucao) return;

  const resolvido: RegistroConflito = {
    ...c,
    mutationId: null,
    resolucao: { escolha: 'servidor', em: new Date().toISOString() },
  };

  const extras: Parameters<typeof gravarAtomico>[3] = [
    { store: 'conflitos', acao: 'put', chave, valor: resolvido },
  ];
  if (c.mutationId) extras.push({ store: 'fila', acao: 'delete', chave: c.mutationId });

  // Dado + fila + conflito na mesma transação: o Map só perde a versão local
  // depois de o commit confirmar.
  await gravarAtomico(c.remoto ? [{ chave, registro: c.remoto }] : [{ chave, remover: true }], [], [], extras);

  if (c.mutationId) {
    fila.delete(c.mutationId);
    removerPendencia(c.mutationId);
  }
  conflitos.set(chave, resolvido);
}

/**
 * Descarta a versão perdedora de um conflito JÁ RESOLVIDO. Ação explícita do
 * usuário — conflito sem decisão nunca é apagado por aqui.
 */
export async function descartarSubstituida(chave: string): Promise<void> {
  const c = conflitos.get(chave);
  if (!c?.resolucao) return;
  conflitos.delete(chave);
  const org = orgAtual();
  if (!org) return;
  await aplicarAtomico(org, [{ store: 'conflitos', acao: 'delete', chave }]);
}

/**
 * Traz para a store `conflitos` as cópias que a versão antiga deixou em
 * `dados`, sob `nr13_conflito_<chave>__<timestamp>`.
 *
 * Fica a MAIS RECENTE por chave (o timestamp está no nome). Grava o destino
 * ANTES de remover a origem, e não sobrescreve conflito novo já existente para
 * a mesma chave — o novo tem mais informação (as duas versões, o mutationId).
 * Idempotente: sem cópia antiga nenhuma, não faz nada.
 */
export async function migrarConflitosAntigos(): Promise<number> {
  const org = orgAtual();
  if (!org) return 0;

  const antigas = (await listarTudo<Registro>(org, 'dados')).filter((d) =>
    d.chave.startsWith(PREFIXO_CONFLITO_ANTIGO),
  );
  if (antigas.length === 0) return 0;

  /** `nr13_conflito_<chave>__<ts>` -> { chave, ts } */
  const maisRecente = new Map<string, { ts: number; valor: Registro }>();
  for (const { chave, valor } of antigas) {
    const resto = chave.slice(PREFIXO_CONFLITO_ANTIGO.length);
    const corte = resto.lastIndexOf('__');
    if (corte <= 0) continue;
    const original = resto.slice(0, corte);
    const ts = Number(resto.slice(corte + 2)) || 0;
    const atual = maisRecente.get(original);
    if (!atual || ts > atual.ts) maisRecente.set(original, { ts, valor });
  }

  const ops: Array<{ store: 'dados' | 'conflitos'; acao: 'put' | 'delete'; chave: string; valor?: unknown }> = [];
  for (const [chave, { valor }] of maisRecente) {
    if (conflitos.has(chave)) continue; // conflito novo vence: sabe mais
    const registro: RegistroConflito = {
      chave,
      mutationId: itemDaChave(chave)?.mutationId ?? null,
      remoto: valor,
      local: obterRegistro(chave),
      detectadoEm: valor.atualizadoEm ?? new Date().toISOString(),
    };
    conflitos.set(chave, registro);
    ops.push({ store: 'conflitos', acao: 'put', chave, valor: registro });
  }
  // A remoção da origem entra na MESMA transação da gravação do destino: nunca
  // apagar o que ainda não foi guardado.
  for (const { chave } of antigas) ops.push({ store: 'dados', acao: 'delete', chave });

  await aplicarAtomico(org, ops);
  for (const { chave } of antigas) removerDaMemoria(chave);
  return maisRecente.size;
}

export async function descartarEncerrada(mutationId: string): Promise<void> {
  if (fila.get(mutationId)?.estado !== 'encerrado') return;
  await removerDaFila(mutationId);
}

// ---------------------------------------------------------------------------
// Recusa por versão SEM lado do servidor (item excluído em outro aparelho)
// ---------------------------------------------------------------------------
// `versao_obsoleta`, `tombstone_mais_novo` e `anterior_ao_corte` marcam o item
// como `conflito`, mas a RPC não devolve valor: do lado do servidor o registro
// foi EXCLUÍDO. Não há duas versões para comparar, então `guardarConflito` não
// é chamado e a tela — que lista `conflitosPendentes()` — não tinha o que
// desenhar. O item ficava contado no selo e invisível na página.
//
// E o dano passava do ruído: enquanto a pendência existe, `lerTudo` PULA a
// chave (`itemDaChave`), então o `deletado_em` do servidor nunca é aplicado
// aqui. O equipamento apagado no celular seguia aparecendo no computador.

/**
 * Pendências em conflito que NÃO têm as duas versões guardadas — as que a tela
 * de Pendências precisa desenhar com card próprio.
 */
export function pendenciasSemComparacao(): ItemFila[] {
  return listarFila().filter(
    (i) => i.estado === 'conflito' && !conflitos.has(i.chave) && i.erro?.categoria !== 'app_desatualizado',
  );
}

/**
 * Exclusões sem marca que `recuperarExclusaoSemMarca` não conseguiu refazer
 * sozinha — a decisão é do usuário, com a ação "Usar a versão do servidor"
 * (`descartarERestaurar`). Separadas de `pendenciasSemComparacao` porque lá o
 * texto é "excluído em outro aparelho", que aqui seria falso.
 */
export function exclusoesSemMarca(): ItemFila[] {
  return listarFila().filter((i) => i.estado === 'conflito' && i.erro?.categoria === 'app_desatualizado');
}

/**
 * "Descartar a minha alteração": tira a pendência da fila.
 *
 * O dado local é alinhado ao servidor LENDO o servidor (`restaurarDoServidor`),
 * nunca por suposição: excluída ou inexistente lá, a cópia local sai; viva lá,
 * a cópia local vira a do servidor; sem resposta, fica como está. Até 23/09/2026
 * este passo era deixado para "a hidratação seguinte", que é incremental e não
 * traz de volta uma exclusão antiga — a cópia descartada ficava para sempre.
 */
export async function descartarPendencia(mutationId: string): Promise<void> {
  const item = fila.get(mutationId);
  if (item?.estado !== 'conflito') return;
  await removerDaFila(mutationId);
  // "Descartar a minha" = ficar com o que o SERVIDOR tem. Sem a chave na fila,
  // o aparelho lê o servidor e se alinha — inclusive quando ele diz "excluída".
  await restaurarDoServidor(item.chave);
}

/**
 * "Recriar no servidor": reenvia o valor local por cima do estado atual.
 *
 * Mutação NOVA, pelo mesmo motivo de `resolverMantendoLocal`: reenviar o
 * mesmo `mutationId` devolveria `repetido` e apagaria a edição em silêncio.
 * A base é a versão que o servidor informou na recusa — é ela que passa do
 * piso deixado pela exclusão.
 */
export async function recriarNoServidor(mutationId: string): Promise<void> {
  const original = fila.get(mutationId);
  if (!original || original.estado !== 'conflito') return;
  if (original.versaoServidor === undefined) return;

  const novo: ItemFila = {
    mutationId: crypto.randomUUID(),
    resolveDe: original.mutationId,
    op: original.op,
    chave: original.chave,
    valor: original.valor,
    versaoBase: original.versaoServidor,
    dispositivo: idDispositivo(),
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    estado: 'aguardando',
  };

  const org = orgAtual();
  if (org) {
    await aplicarAtomico(org, [
      { store: 'fila', acao: 'put', chave: novo.mutationId, valor: novo },
      { store: 'fila', acao: 'delete', chave: original.mutationId },
    ]);
  }

  fila.delete(original.mutationId);
  removerPendencia(original.mutationId);
  fila.set(novo.mutationId, novo);
  registrarPendencias([novo]);
}
