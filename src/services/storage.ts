/**
 * Porta única de acesso ao "banco" do sistema.
 *
 * Despacha entre DUAS implementações, escolhidas pela feature flag:
 *
 *   v1 (`storageV1.ts`) — `localStorage` como cache + upsert direto. É o que
 *      roda em produção hoje, byte a byte. Padrão enquanto a flag estiver
 *      desligada.
 *
 *   v2 (`storageV2.ts`) — `Map` em memória + IndexedDB + fila transacional e
 *      RPC. Mata o teto de 5 MB que fazia os equipamentos sumirem.
 *
 * A API pública é IDÊNTICA nas duas: 44 arquivos importam daqui e nenhum
 * precisa saber qual caminho está ativo.
 */
import { armazenamentoV2Ativo } from './flag';
import * as v1 from './storageV1';
import * as v2 from './storageV2';

export { bloqueadoParaEscrita, ErroBloqueado } from './gateEscrita';
export { armazenamentoV2Ativo, definirArmazenamentoV2 } from './flag';

const v2Ativo = () => armazenamentoV2Ativo();

// --- Leitura (síncrona) -----------------------------------------------------
export function ler<T = unknown>(chave: string): T | null {
  return v2Ativo() ? v2.ler<T>(chave) : v1.ler<T>(chave);
}

export function listarChavesComPrefixo(prefixo: string): string[] {
  return v2Ativo() ? v2.listarChavesComPrefixo(prefixo) : v1.listarChavesComPrefixo(prefixo);
}

// --- Escrita ----------------------------------------------------------------
export function salvar(chave: string, objeto: unknown): Promise<void> {
  return v2Ativo() ? v2.salvar(chave, objeto) : v1.salvar(chave, objeto);
}

export function excluirChave(chave: string): Promise<void> {
  return v2Ativo() ? v2.excluirChave(chave) : v1.excluirChave(chave);
}

export function excluirVaso(tag: string): Promise<void> {
  return v2Ativo() ? v2.excluirVaso(tag) : v1.excluirVaso(tag);
}

// --- Sincronização ----------------------------------------------------------
export function lerTudo(): Promise<Record<string, string>> {
  return v2Ativo() ? v2.lerTudo() : v1.lerTudo();
}

export function flushFila(): Promise<void> {
  return v2Ativo() ? v2.flushFila() : v1.flushFila();
}

/**
 * Mutações ainda não enviadas ao servidor. Cada implementação tem a SUA fila —
 * a v1 no `localStorage`, a v2 no IndexedDB —, e o indicador da topbar lia só a
 * da v1: numa organização já migrada ele exibia "Sincronizado" com trabalho de
 * campo inteiro parado no aparelho.
 */
export function contarPendencias(): number {
  return v2Ativo() ? v2.contarPendencias() : v1.contarPendencias();
}

export function lerRemoto(chave: string): Promise<string | null> {
  return v2Ativo() ? v2.lerRemoto(chave) : v1.lerRemoto(chave);
}

export function limparCacheDados(): void {
  return v2Ativo() ? v2.limparCacheDados() : v1.limparCacheDados();
}

// --- Só v1: migração dos campos pesados do cache antigo ---------------------
export { aliviarCacheLocal } from './storageV1';

// --- Só v2: barreira de inicialização ---------------------------------------
/**
 * Prepara o armazenamento antes de liberar as telas. No caminho v1 é no-op —
 * lá a hidratação acontece dentro do próprio `lerTudo`.
 */
export async function iniciarArmazenamento(): Promise<boolean> {
  if (!v2Ativo()) return true;
  return v2.iniciar();
}

export function armazenamentoPronto(): boolean {
  return v2Ativo() ? v2.pronto() : true;
}

export function aguardarArmazenamento(): Promise<void> {
  return v2Ativo() ? v2.aguardarPronto() : Promise.resolve();
}
