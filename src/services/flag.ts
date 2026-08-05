/**
 * Feature flag do armazenamento v2 (Map + IndexedDB + palco).
 *
 * DESLIGADA por padrão. Com ela desligada o app usa exatamente o caminho v1 —
 * `localStorage` como cache e upsert direto no Supabase —, byte a byte o que
 * está em produção hoje.
 *
 * O valor é espelhado no login a partir de `org_sync.v2_ativa` (servidor), que
 * é quem manda de verdade: a RLS recusa escrita direta quando a v2 está ativa
 * para a organização. Este espelho local só decide qual caminho o bundle usa.
 */
const CHAVE = 'nr13_armazenamento_v2';

/**
 * MEMOIZADA de propósito: qual implementação está ativa é decisão de SESSÃO,
 * tomada no login. Reler o `localStorage` a cada chamada deixaria o caminho
 * trocar no meio da sessão se algo limpasse o storage — e a v2, que não guarda
 * dado lá, passaria a despachar para a v1, que mostraria a conta VAZIA. É
 * justamente o sumiço que este projeto conserta.
 */
let emMemoria: boolean | null = null;

export function armazenamentoV2Ativo(): boolean {
  if (emMemoria !== null) return emMemoria;
  try {
    emMemoria = localStorage.getItem(CHAVE) === '1';
  } catch {
    emMemoria = false; // sem localStorage, o caminho seguro é o antigo
  }
  return emMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirArmazenamentoV2(ativo: boolean): void {
  emMemoria = ativo;
  try {
    if (ativo) localStorage.setItem(CHAVE, '1');
    else localStorage.removeItem(CHAVE);
  } catch {
    // Falhar aqui só significa não persistir para a próxima sessão; a decisão
    // desta continua valendo em memória.
  }
}

/** Descarta a decisão memoizada (troca de conta, e testes). */
export function zerarFlagEmMemoria(): void {
  emMemoria = null;
}

export const CHAVE_FLAG_V2 = CHAVE;
