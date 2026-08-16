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
  const original = c.mutationId ? fila.get(c.mutationId) : null;
  if (!original) return;

  const novo: ItemFila = {
    mutationId: crypto.randomUUID(),
    resolveDe: original.mutationId,
    op: original.op,
    chave: original.chave,
    valor: original.valor,
    // A base é a versão do SERVIDOR. Sem isso a RPC recusaria para sempre: o
    // servidor está numa versão que o aparelho nunca esperou.
    versaoBase: c.remoto?.versao ?? original.versaoBase,
    dispositivo: idDispositivo(),
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    estado: 'aguardando',
  };

  const resolvido: RegistroConflito = {
    ...c,
    mutationId: null,
    resolucao: { escolha: 'local', em: new Date().toISOString() },
  };

  const org = orgAtual();
  if (org) {
    await aplicarAtomico(org, [
      { store: 'fila', acao: 'put', chave: novo.mutationId, valor: novo },
      { store: 'fila', acao: 'delete', chave: original.mutationId },
      { store: 'conflitos', acao: 'put', chave, valor: resolvido },
    ]);
  }

  fila.delete(original.mutationId);
  removerPendencia(original.mutationId);
  fila.set(novo.mutationId, novo);
  registrarPendencias([novo]);
  conflitos.set(chave, resolvido);
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
