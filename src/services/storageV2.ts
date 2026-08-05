/**
 * Armazenamento v2: `Map` em memória + IndexedDB + fila transacional.
 *
 * POR QUE EXISTE: até 04/08/2026 o cache era o `localStorage`, com 5 MB para a
 * origem inteira. Medido em produção, a conta `cmam.caldeiras` precisava de
 * 5.692 KB e NENHUM dos seus 38 equipamentos entrava no cache — a hidratação,
 * ordenada por nome, estourava a cota dentro de `nr13_fotos_` e nunca chegava
 * em `nr13_info_`.
 *
 * Diferença de fundo em relação à v1: **nada é apagado localmente por não ter
 * voltado do servidor**. A única causa de remoção é tombstone explícito. Era o
 * apagar-por-ausência que transformava qualquer falha de rede ou de cota em
 * sumiço de dado.
 */
import { supabase, escopoStorageAtual, TABELA_STORAGE } from './supabase';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { fecharDb } from './db';
import { bloqueadoParaEscrita, ErroBloqueado } from './gateEscrita';
import { tagDaChave } from './familiasChave';

const PAGINA = 1000;

// ---------------------------------------------------------------------------
// Leitura — SÍNCRONA, direto do Map
// ---------------------------------------------------------------------------
/**
 * Lê do `Map` já hidratado. Nunca toca no `localStorage` e nunca inicia
 * operação assíncrona: tem ~50 pontos de chamada síncronos.
 */
export function ler<T = unknown>(chave: string): T | null {
  const reg = cache.obterRegistro(chave);
  if (!reg) return null;
  try {
    return JSON.parse(reg.valor) as T;
  } catch {
    return reg.valor as unknown as T;
  }
}

export function listarChavesComPrefixo(prefixo: string): string[] {
  return cache.chavesComPrefixo(prefixo);
}

// ---------------------------------------------------------------------------
// Barreira de inicialização
// ---------------------------------------------------------------------------
let iniciado = false;

/**
 * Prepara o armazenamento ANTES de qualquer tela: organização, IndexedDB, Map,
 * fila e tombstones. Só depois disso o app pode chamar `ler()` — uma tela que
 * listasse antes veria zero equipamentos e o usuário concluiria que sumiram.
 */
export async function iniciar(): Promise<boolean> {
  const escopo = await escopoStorageAtual();
  if (!escopo) return false;

  cache.definirOrg(escopo.id);
  await cache.hidratarDoDisco();
  await sync.carregarFilaDoDisco();
  await sync.carregarTombstonesDoDisco();
  iniciado = true;
  return true;
}

export function pronto(): boolean {
  return iniciado && cache.hidratado();
}

export function aguardarPronto(): Promise<void> {
  return cache.aguardarHidratacao();
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------
/**
 * Grava dado + item de fila na MESMA transação do IndexedDB. Só retorna depois
 * do commit — a UI só pode dizer "salvo localmente" quando esta Promise
 * resolve. Bloqueio de assinatura/papel LANÇA e não persiste nada.
 */
export async function salvar(chave: string, objeto: unknown): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();

  const valor = JSON.stringify(objeto);
  const anterior = cache.obterRegistro(chave);
  const versaoServidor = anterior?.versao ?? 0;

  const registro: cache.Registro = {
    valor,
    versao: versaoServidor + 1,
    atualizadoEm: new Date().toISOString(),
    dispositivo: sync.idDispositivo(),
  };

  const item = sync.montarItem('set', chave, valor, versaoServidor);
  const antigo = sync.itemDaChave(chave);

  await cache.gravarAtomico([{ chave, registro }], [item]);
  if (antigo && antigo.mutationId !== item.mutationId) await sync.removerDaFila(antigo.mutationId);
  sync.registrarNaMemoria(item);

  await sync.drenar();
}

async function excluirUma(chave: string): Promise<void> {
  const anterior = cache.obterRegistro(chave);
  const versaoServidor = anterior?.versao ?? 0;

  const item = sync.montarItem('del', chave, undefined, versaoServidor);
  const antigo = sync.itemDaChave(chave);
  const tomb = {
    chave,
    versao: versaoServidor,
    excluidoEm: new Date().toISOString(),
    dispositivo: sync.idDispositivo(),
  };

  // Dado, fila e tombstone na mesma transação: o Map só perde a chave depois
  // do commit local.
  await cache.gravarAtomico([{ chave, remover: true }], [item], [{ chave, valor: tomb }]);
  if (antigo && antigo.mutationId !== item.mutationId) await sync.removerDaFila(antigo.mutationId);
  sync.registrarNaMemoria(item);
  await sync.registrarTombstone(chave, versaoServidor);
}

export async function excluirChave(chave: string): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  await excluirUma(chave);
  await sync.drenar();
}

/**
 * Exclui o equipamento inteiro usando o ÍNDICE EXPLÍCITO por TAG.
 *
 * A v1 casava chaves por sufixo `_<TAG>`, e por isso excluir a TAG "B" alcançava
 * `nr13_info_A_B` — apagava o equipamento errado.
 */
export async function excluirVaso(tag: string): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  for (const chave of cache.chavesDaTag(tag)) {
    if (tagDaChave(chave) !== tag) continue; // cinto e suspensório
    await excluirUma(chave);
  }
  await sync.drenar();
}

export async function flushFila(): Promise<void> {
  await sync.drenar();
}

// ---------------------------------------------------------------------------
// Hidratação
// ---------------------------------------------------------------------------
/**
 * Devolve SEMPRE um snapshot do Map — online ou offline.
 *
 * Sem rede, devolve o que veio do IndexedDB; a v1 devolvia `{}`, e a tela que
 * confiasse nisso mostraria a conta vazia. Com rede, traz as linhas do
 * servidor respeitando tombstones e comparando versões: linha antiga do
 * servidor não derruba edição local mais recente.
 */
export async function lerTudo(): Promise<Record<string, string>> {
  if (!iniciado && !(await iniciar())) return cache.snapshot();

  await sync.drenar();

  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return cache.snapshot();

    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await supabase
        .from(TABELA_STORAGE)
        .select('chave, valor, versao, atualizado_em, dispositivo, deletado_em')
        .eq(escopo.coluna, escopo.id)
        .order('chave', { ascending: true })
        .range(inicio, inicio + PAGINA - 1);

      if (error) return cache.snapshot(); // offline: fica com o que veio do disco
      if (!data || data.length === 0) break;

      for (const linha of data as Array<Record<string, unknown>>) {
        const chave = String(linha.chave);
        const atualizadoEm = String(linha.atualizado_em ?? '');

        // Soft-delete propaga a exclusão feita em OUTRO aparelho.
        if (linha.deletado_em) {
          if (cache.obterRegistro(chave)) await cache.gravarAtomico([{ chave, remover: true }]);
          continue;
        }
        // Tombstone local mais novo: não ressuscita.
        if (sync.tombstoneMaisNovoQue(chave, atualizadoEm)) continue;
        // Escrita local ainda pendente vence o servidor: ela é mais nova.
        if (sync.itemDaChave(chave)) continue;
        if (linha.valor == null) continue;

        await cache.aplicarRemoto(chave, {
          valor: String(linha.valor),
          versao: Number(linha.versao ?? 1),
          atualizadoEm,
          dispositivo: linha.dispositivo ? String(linha.dispositivo) : null,
        });
      }

      if (data.length < PAGINA) break;
    }
  } catch {
    return cache.snapshot(); // offline
  }

  // NÃO existe varredura removendo chaves locais ausentes no servidor.
  return cache.snapshot();
}

/** Lê UMA chave direto do servidor (valor completo). Null offline/sem sessão. */
export async function lerRemoto(chave: string): Promise<string | null> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return null;
    const { data, error } = await supabase
      .from(TABELA_STORAGE)
      .select('valor')
      .eq(escopo.coluna, escopo.id)
      .eq('chave', chave)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { valor: string | null }).valor ?? null;
  } catch {
    return null;
  }
}

/**
 * Faxina ao trocar de conta. NÃO apaga o IndexedDB: pode haver pendência lá
 * dentro, e apagá-la em silêncio destruiria inspeção feita offline. Quem decide
 * apagar é o fluxo de logout, depois de conferir a fila.
 */
export function limparCacheDados(): void {
  cache.zerarMemoria();
  sync.zerarFilaMemoria();
  sync.zerarTombstonesMemoria();
  fecharDb();
  cache.definirOrg(null);
  iniciado = false;
}
