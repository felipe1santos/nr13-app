/**
 * Armazenamento local dos PDFs pesados (certificados dos padrões), em IndexedDB.
 *
 * POR QUE ISSO EXISTE: o "banco" do app é o par localStorage (cache lido pelos
 * templates em iframe) + Supabase. O localStorage tem cota de ~5 MB para a
 * origem INTEIRA, dividida com todas as fotos de inspeção. Um certificado
 * escaneado (200–800 KB, ~37% maior em base64) ocupa uma fatia enorme dela, e
 * a imutabilidade por soft-replace guardava também as versões substituídas —
 * medido em conta real: 1479 KB só de `nr13_rastreab_`, dos quais 739 KB eram
 * versões aposentadas. Resultado: storage a 96% e PDF nenhum acima de ~144 KB
 * conseguia ser salvo.
 *
 * A separação é segura porque NENHUM template HTML lê o PDF: as folhas em
 * iframe (ULTRASSOM, TESTE-HIDROSTATICO, PRONT-ULTRASSOM) leem apenas os campos
 * do registro — aparelho, nº de série, validade. O `pdfBase64` só é consumido
 * por código React (anexarRastreabilidades via pdf-lib e a rasterização do
 * printService), que já é assíncrono. Então: metadados leves seguem no
 * localStorage, o PDF vai para o IndexedDB (cota na casa das centenas de MB) e
 * o Supabase continua guardando o registro COMPLETO — é ele que sincroniza o
 * PDF entre os aparelhos.
 */

const DB = 'nr13_pdfs';
const STORE = 'pdfs';
const VERSAO = 1;

// Fallback em memória para ambientes sem IndexedDB (vitest em node, navegador
// em modo restrito). Mantém a API funcionando; só não persiste entre sessões —
// o PDF continua recuperável pelo Supabase.
const memoria = new Map<string, string>();

const temIndexedDB = (): boolean =>
  typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined';

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Falha na abertura não pode "grudar": zera para a próxima chamada tentar de novo.
  conexao.catch(() => {
    conexao = null;
  });
  return conexao;
}

function transacao<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function guardarPdf(chave: string, dataUrl: string): Promise<void> {
  memoria.set(chave, dataUrl);
  if (!temIndexedDB()) return;
  try {
    await transacao('readwrite', (s) => s.put(dataUrl, chave));
  } catch {
    // IndexedDB indisponível/cheio: segue só com o cache em memória desta sessão.
    // O PDF continua no Supabase, então nada é perdido de verdade.
  }
}

export async function lerPdf(chave: string): Promise<string | null> {
  const emMemoria = memoria.get(chave);
  if (emMemoria) return emMemoria;
  if (!temIndexedDB()) return null;
  try {
    const valor = await transacao<string | undefined>('readonly', (s) => s.get(chave));
    if (valor) memoria.set(chave, valor);
    return valor ?? null;
  } catch {
    return null;
  }
}

export async function removerPdf(chave: string): Promise<void> {
  memoria.delete(chave);
  if (!temIndexedDB()) return;
  try {
    await transacao('readwrite', (s) => s.delete(chave));
  } catch {
    /* best-effort */
  }
}
