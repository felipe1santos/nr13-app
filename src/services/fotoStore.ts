/**
 * Cofre local das fotos (IndexedDB), separado do banco de dados da organização.
 *
 * Guarda o BLOB da imagem — nunca base64. Duas funções, e as duas importam:
 *
 *  1. **Fila de upload.** Foto tirada em campo, sem rede, existe só aqui. É a
 *     ÚNICA cópia até o upload confirmar, e por isso nada a apaga antes disso.
 *  2. **Cache de leitura.** Depois de enviada, o blob fica. Sem ele, abrir a
 *     inspeção offline mostraria moldura vazia — e o inspetor precisa rever a
 *     foto que acabou de tirar mesmo dentro da caldeira, sem sinal.
 *
 * Banco próprio (`nr13_fotos`) em vez de uma store dentro do banco por
 * organização: a foto pendente precisa sobreviver à troca de conta e ao
 * `apagarBancoLocal()`. Perder trabalho de campo porque alguém trocou de login
 * seria o mesmo tipo de bug que o resto deste projeto existe para eliminar.
 */
const NOME_DB = 'nr13_fotos';
const STORE = 'fotos';
const VERSAO = 1;

export interface FotoLocal {
  /** Caminho DEFINITIVO no bucket. É a identidade da foto desde a captura. */
  path: string;
  blob: Blob;
  mimeType: string;
  /** true = ainda não confirmada no servidor. */
  pendente: boolean;
  criadoEm: string;
  tentativas: number;
  /** Última falha de upload, para a tela de pendências. */
  erro?: string;
}

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(NOME_DB, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'path' });
        store.createIndex('pendente', 'pendente', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('falha ao abrir o cofre de fotos'));
  });
  return conexao;
}

function transacao<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const req = fn(tx.objectStore(STORE));
        // Resolve no COMMIT, não no sucesso do request: só o commit garante que
        // o blob sobreviveu ao fechamento da aba.
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('transação de foto falhou'));
        tx.onabort = () => reject(tx.error ?? new Error('transação de foto abortada'));
      }),
  );
}

/** Grava o blob. `pendente: true` enquanto o upload não confirmar. */
export async function guardar(foto: FotoLocal): Promise<void> {
  await transacao('readwrite', (s) => s.put(foto));
}

export async function obter(path: string): Promise<FotoLocal | null> {
  const r = await transacao<FotoLocal | undefined>('readonly', (s) => s.get(path));
  return r ?? null;
}

export async function listarPendentes(): Promise<FotoLocal[]> {
  const todas = await transacao<FotoLocal[]>('readonly', (s) => s.getAll());
  return (todas ?? []).filter((f) => f.pendente);
}

/**
 * Marca como enviada, PRESERVANDO o blob: ele vira cache de leitura offline.
 * Apagar aqui economizaria disco e custaria a foto na tela de quem está sem
 * sinal — troca ruim, num app cujo uso principal é em campo.
 */
export async function marcarEnviada(path: string): Promise<void> {
  const atual = await obter(path);
  if (!atual) return;
  await guardar({ ...atual, pendente: false, erro: undefined });
}

export async function registrarFalha(path: string, erro: string): Promise<void> {
  const atual = await obter(path);
  if (!atual) return;
  await guardar({ ...atual, tentativas: atual.tentativas + 1, erro });
}

/**
 * Remove a cópia local. Só para foto que o usuário excluiu de verdade — nunca
 * como faxina automática de foto pendente.
 */
export async function remover(path: string): Promise<void> {
  await transacao('readwrite', (s) => s.delete(path));
}

/** Fecha a conexão (testes e troca de conta). */
export function fechar(): void {
  if (!conexao) return;
  const c = conexao;
  conexao = null;
  void c.then((db) => db.close()).catch(() => {});
}
