// "Banco" do sistema = tabela key-value `app_storage` no Supabase, isolada por usuário (RLS).
// REGRA: toda gravação grava no localStorage (cache lido pelos templates HTML em iframe) E no
// Supabase. Toda leitura sai do cache local (já hidratado por lerTudo). Offline = cai no cache.
import { supabase, idUsuarioAtual, TABELA_STORAGE } from './supabase';

// Puxa todas as chaves do usuário logado e hidrata o localStorage (cache p/ os iframes).
// Chamar no login e ao abrir o app. Sem sessão, devolve vazio (mantém o que houver em cache).
export async function lerTudo(): Promise<Record<string, string>> {
  const userId = await idUsuarioAtual();
  if (!userId) return {};
  try {
    const { data, error } = await supabase
      .from(TABELA_STORAGE)
      .select('chave, valor')
      .eq('user_id', userId);
    if (error || !data) return {};
    const dados: Record<string, string> = {};
    for (const row of data as { chave: string; valor: string | null }[]) {
      if (row.valor != null) {
        dados[row.chave] = row.valor;
        localStorage.setItem(row.chave, row.valor);
      }
    }
    return dados;
  } catch {
    // offline: usa o cache local já existente
    return {};
  }
}

export async function salvar(chave: string, objeto: unknown): Promise<void> {
  const valor = JSON.stringify(objeto);
  localStorage.setItem(chave, valor); // cache imediato (iframe lê na hora)
  const userId = await idUsuarioAtual();
  if (!userId) return;
  try {
    await supabase
      .from(TABELA_STORAGE)
      .upsert({ user_id: userId, chave, valor }, { onConflict: 'user_id,chave' });
  } catch {
    // offline: já está no cache local, sincroniza na próxima gravação online
  }
}

// Remove UMA chave do Supabase e do cache local.
export async function excluirChave(chave: string): Promise<void> {
  localStorage.removeItem(chave);
  const userId = await idUsuarioAtual();
  if (!userId) return;
  try {
    await supabase.from(TABELA_STORAGE).delete().eq('user_id', userId).eq('chave', chave);
  } catch {
    // offline: já removido do cache, ressincroniza depois
  }
}

export function ler<T = unknown>(chave: string): T | null {
  const raw = localStorage.getItem(chave);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

// Varre o cache local (já sincronizado por lerTudo) por chaves com um prefixo, ex.: "nr13_info_".
export function listarChavesComPrefixo(prefixo: string): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith(prefixo)) chaves.push(chave);
  }
  return chaves;
}

export async function excluirVaso(tag: string): Promise<void> {
  // coleta no cache local todas as chaves que terminam em "_<TAG>"
  const chavesDoVaso: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.endsWith(`_${tag}`)) chavesDoVaso.push(chave);
  }

  const userId = await idUsuarioAtual();
  if (userId && chavesDoVaso.length > 0) {
    try {
      await supabase
        .from(TABELA_STORAGE)
        .delete()
        .eq('user_id', userId)
        .in('chave', chavesDoVaso);
    } catch {
      // offline: remove do cache local mesmo assim, ressincroniza depois
    }
  }

  for (const chave of chavesDoVaso) localStorage.removeItem(chave);
}
