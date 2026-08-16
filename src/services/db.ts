/**
 * Acesso cru ao IndexedDB, com um banco POR ORGANIZAÇÃO (`nr13_dados_<org_id>`).
 *
 * DURABILIDADE: toda escrita resolve em `tx.oncomplete`, nunca em
 * `request.onsuccess`. O `onsuccess` do request dispara ANTES do commit — quem
 * resolvesse ali diria "salvo" para um dado que some se o navegador fechar no
 * instante seguinte. É a diferença entre a fila de sincronização ser confiável
 * e não ser.
 *
 * ATOMICIDADE: `aplicarAtomico` recebe operações de várias stores e as aplica
 * numa transação só. É o que garante que dado e item de fila nasçam juntos:
 * dado sem fila nunca sobe ao servidor, fila sem dado sobe lixo.
 *
 * O namespace por organização é o que substitui o antigo `reconcile` do
 * storage.ts como mecanismo de isolamento entre contas — sem o efeito colateral
 * que causou o bug original (apagar dado local por ele "não ter voltado do
 * servidor").
 *
 * Este módulo não conhece regra de negócio: quem decide o que guardar é o
 * cacheLocal.ts (dados) e o sync.ts (fila/tombstones).
 */
export type NomeStore = 'dados' | 'fila' | 'tombstones' | 'meta' | 'conflitos';

const STORES: NomeStore[] = ['dados', 'fila', 'tombstones', 'meta', 'conflitos'];

/**
 * v2 (16/08/2026): store `conflitos`.
 *
 * A cópia da versão do servidor num conflito morava em `dados`, sob a chave
 * `nr13_conflito_<chave>__<timestamp>` — e `hidratarDoDisco` carrega `dados`
 * INTEIRA no `Map`. As cópias entravam no cache de leitura, apareciam em
 * `chavesComPrefixo`, não eram indexadas por TAG (nenhuma família as conhecia)
 * e nunca eram limpas. Pior: cada retentativa gravava mais uma.
 *
 * O upgrade é PURAMENTE ADITIVO, e isso não é estilo: `indexedDB.open` com
 * versão MENOR falha, então um aparelho que subiu para v2 não volta para v1.
 * A segurança do rollback vem de o código antigo continuar funcionando com o
 * schema novo — ele só não conhece a store a mais, e ignorá-la é inofensivo.
 * Nunca apagar nem recriar store existente aqui.
 */
const VERSAO_SCHEMA = 2;

export interface Operacao {
  store: NomeStore;
  acao: 'put' | 'delete';
  chave: string;
  valor?: unknown;
}

const nomeDb = (orgId: string) => `nr13_dados_${orgId}`;

let conexao: { orgId: string; db: Promise<IDBDatabase> } | null = null;

export function fecharDb(): void {
  if (!conexao) return;
  const anterior = conexao;
  conexao = null;
  void anterior.db.then((db) => db.close()).catch(() => undefined);
}

export function abrirDb(orgId: string): Promise<IDBDatabase> {
  if (conexao && conexao.orgId === orgId) return conexao.db;
  fecharDb(); // trocou de org: nunca reaproveitar a conexão da conta anterior
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(nomeDb(orgId), VERSAO_SCHEMA);
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
  conexao = { orgId, db };
  // Falha na abertura não pode "grudar": zera para a próxima chamada tentar de novo.
  db.catch(() => {
    if (conexao?.db === db) conexao = null;
  });
  return db;
}

/** Aplica todas as operações numa ÚNICA transação. Resolve só no commit. */
export async function aplicarAtomico(orgId: string, ops: Operacao[]): Promise<void> {
  if (ops.length === 0) return;
  const db = await abrirDb(orgId);
  const stores = [...new Set(ops.map((o) => o.store))];
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve(); // <- durabilidade confirmada, e só aqui
    tx.onerror = () => reject(tx.error ?? new Error('transação falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('transação abortada'));
    try {
      for (const op of ops) {
        const s = tx.objectStore(op.store);
        if (op.acao === 'put') s.put(op.valor, op.chave);
        else s.delete(op.chave);
      }
    } catch (erro) {
      // Valor não-clonável (ex.: função) faz o put lançar de forma síncrona.
      // Abortar explicitamente garante que nada da transação persista.
      try {
        tx.abort();
      } catch {
        // já abortada pelo próprio erro: nada a fazer, o reject abaixo responde
      }
      reject(erro);
    }
  });
}

export async function obter<T>(orgId: string, store: NomeStore, chave: string): Promise<T | null> {
  const db = await abrirDb(orgId);
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(chave);
    tx.oncomplete = () => resolve((req.result as T) ?? null);
    tx.onerror = () => reject(tx.error ?? new Error('leitura falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('leitura abortada'));
  });
}

/**
 * Percorre a store com cursor, numa transação só.
 *
 * `getAllKeys()` + `getAll()` em transações separadas podia devolver chave e
 * valor DESALINHADOS se algo gravasse entre as duas leituras — hidratar o cache
 * com valor trocado de chave é pior que não hidratar.
 */
export async function listarTudo<T>(
  orgId: string,
  store: NomeStore,
): Promise<Array<{ chave: string; valor: T }>> {
  const db = await abrirDb(orgId);
  return new Promise((resolve, reject) => {
    const linhas: Array<{ chave: string; valor: T }> = [];
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        linhas.push({ chave: String(cursor.key), valor: cursor.value as T });
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(linhas);
    tx.onerror = () => reject(tx.error ?? new Error('varredura falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('varredura abortada'));
  });
}

export function apagarDb(orgId: string): Promise<void> {
  fecharDb();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(nomeDb(orgId));
    // Best-effort nos três casos: falhar ao apagar não pode travar logout nem
    // troca de conta. O que não pode acontecer é apagar com pendência dentro —
    // isso é decidido antes, por quem chama (ver podeSairSemPerder, Task 12).
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
