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
import { supabase, escopoStorageAtual } from './supabase';

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

/**
 * Pergunta ao SERVIDOR qual implementação esta organização usa e grava a
 * resposta. É o elo que faltava: sem ele `org_sync.v2_ativa` podia estar ligada
 * no banco e o bundle continuar despachando para a v1 — foi exatamente o estado
 * da conta `cmam.caldeiras` entre 05/08 e 10/08/2026. Nesse estado a guarda
 * `trg_guardar_app_storage` recusa TODA escrita direta (`nr13_escrita_direta_
 * bloqueada`), a v1 empilha tudo em `nr13_fila_sync` e o usuário vê o sistema
 * "salvando" sem que nada chegue ao banco.
 *
 * Chamar SEMPRE antes do primeiro acesso ao armazenamento (é o que
 * `carregarPerfil` faz, logo após gravar `nr13_org_id`).
 *
 * Falha de rede NÃO troca de caminho: mantém o que já valia. Rebaixar para a v1
 * porque a consulta não respondeu levaria a tela a ler o `localStorage` vazio da
 * v2 e concluir "conta sem equipamentos" — o sumiço que este código combate.
 */
export async function sincronizarFlagDoServidor(): Promise<boolean> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return armazenamentoV2Ativo();
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa')
      .eq('org_id', escopo.id)
      .maybeSingle();
    // Erro pode ser offline OU banco sem a migração armazenamento_v2.sql. Nos
    // dois casos o valor conhecido continua valendo.
    if (error) return armazenamentoV2Ativo();
    definirArmazenamentoV2((data as { v2_ativa?: boolean } | null)?.v2_ativa === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

export const CHAVE_FLAG_V2 = CHAVE;
