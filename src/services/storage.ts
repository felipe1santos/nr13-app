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
import type { MedidaEssencial } from './essencial';
import type { ItemFila } from './sync';

export { bloqueadoParaEscrita, ErroBloqueado } from './gateEscrita';
export { armazenamentoV2Ativo, definirArmazenamentoV2 } from './flag';
export { buscaV9Ativa, definirBuscaV9 } from './flag';
export { bootV9Ativo, definirBootV9 } from './flag';

const v2Ativo = () => armazenamentoV2Ativo();

// --- Leitura (síncrona) -----------------------------------------------------
export function ler<T = unknown>(chave: string): T | null {
  return v2Ativo() ? v2.ler<T>(chave) : v1.ler<T>(chave);
}

export function listarChavesComPrefixo(prefixo: string): string[] {
  return v2Ativo() ? v2.listarChavesComPrefixo(prefixo) : v1.listarChavesComPrefixo(prefixo);
}

/**
 * O valor BRUTO da chave, sem `JSON.parse`.
 *
 * Existe para quem precisa saber se um valor MUDOU sem pagar o parse: o cache do
 * histórico legado (`historicoRelatorios.legado()`) memoriza um array de vários
 * MB e usa esta string como identidade. Na v2 o `Map` devolve sempre a MESMA
 * instância enquanto o valor não muda, então a comparação é O(1); um memo preso a
 * outro critério (sessão, evento) mostraria o histórico da conta anterior depois
 * de uma troca de organização.
 */
export function lerCru(chave: string): string | null {
  return v2Ativo() ? v2.lerCru(chave) : v1.lerCru(chave);
}

/**
 * Chaves de UM equipamento, sem varrer o cache inteiro.
 *
 * A v2 tem índice explícito por TAG (`cacheLocal.porTag`), então isto é O(chaves
 * daquele equipamento) — dezenas — em vez de O(cache inteiro). Existe porque o
 * histórico de relatórios precisa conferir "há registro sem entrada no índice?"
 * a cada listagem: com varredura de prefixo isso custaria uma passada por todas
 * as chaves da organização a cada render.
 *
 * A v1 não tem esse índice; cai na varredura por prefixo, que é o que ela sempre
 * fez. Nenhuma organização nova nasce em v1 (§2-ter).
 */
export function listarChavesDaTag(tag: string): string[] {
  return v2Ativo() ? v2.listarChavesDaTag(tag) : v1.listarChavesDaTag(tag);
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

/**
 * As pendências em si — para quem precisa saber POR QUE elas não subiram.
 *
 * O selo da topbar usa isto em `conectividade.estadoConectividade`: uma
 * pendência cujo último erro foi de rede prova queda de conexão melhor do que
 * `navigator.onLine`, que em 25/08/2026 permaneceu `true` durante uma sessão
 * inteira com a rede bloqueada.
 *
 * A v1 guarda a fila como uma lista de operações sem erro classificado —
 * devolve vazio, e o selo cai no comportamento antigo (só `navigator.onLine`).
 * Organizações na v1 estão em extinção; investir na fila velha seria construir
 * sobre o que já foi substituído.
 */
export function listarPendentesFila(): ItemFila[] {
  return v2Ativo() ? v2.listarPendentesFila() : [];
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

// --- Só v2: semeadura do Portal do Cliente (Fase 0-B) -----------------------
/**
 * Deposita no cache chaves que vieram JÁ FILTRADAS pelo servidor (a Edge
 * `portal_cliente`). Ver `storageV2.semearCache`.
 *
 * No caminho v1 é no-op: lá o cache É o `localStorage`, e o `portalService` já
 * escreve nele — semear seria gravar a mesma coisa duas vezes.
 */
export async function semearCachePortal(chaves: Record<string, string>): Promise<number> {
  if (!v2Ativo()) return 0;
  return v2.semearCache(chaves);
}

/**
 * Fase 9 · semeia no cache as chaves de UMA TAG (carregamento sob demanda).
 *
 * No caminho v1 é no-op: lá o cache É o `localStorage`, e o v1 já carrega tudo
 * que cabe. A Fase 9 só existe para a v2.
 */
export async function semearEquipamento(chaves: string[]): Promise<number> {
  if (!v2Ativo()) return 0;
  return v2.semearEquipamento(chaves);
}

/**
 * Fase 9 · 9D — o boot baixa só o essencial (ver `essencial.ts`).
 *
 * No caminho v1 é no-op, e por isso `bootV9Ativo()` já exige a v2: lá o cache
 * É o `localStorage`, não existe semeadura por TAG, e um boot leve deixaria a
 * primeira tela lendo um cache vazio. Quem chama isto é `hidratarNoBoot()`,
 * que só o faz com a flag ligada.
 */
export async function hidratarEssencial(): Promise<MedidaEssencial> {
  if (!v2Ativo()) return { chaves: 0, bytes: 0, porFamilia: {} };
  return v2.hidratarEssencial();
}
