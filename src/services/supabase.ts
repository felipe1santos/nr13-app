// Client Supabase — fonte de verdade do "banco" (substitui api_storage.php / api_login.php).
// O localStorage continua sendo CACHE local (lido pelos templates HTML em iframe).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.error('Supabase ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env e reinicie o `npm run dev`.');
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const TABELA_STORAGE = 'app_storage';

// ID do usuário logado (uuid do auth.users). Lê da sessão local (sem ida ao servidor).
export async function idUsuarioAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Escopo de dados no app_storage. Após a migração de controle de acesso
// (supabase/acesso_setup.sql + login que grava nr13_org_id), os dados são
// isolados por ORGANIZAÇÃO (org_id) — sub-logins compartilham o mesmo escopo.
// Antes da migração (nr13_org_id ausente), mantém o comportamento antigo por
// user_id — o deploy do código é seguro antes do SQL.
export interface EscopoStorage {
  coluna: 'org_id' | 'user_id';
  id: string;
}

export async function escopoStorageAtual(): Promise<EscopoStorage | null> {
  const orgId = localStorage.getItem('nr13_org_id');
  if (orgId) return { coluna: 'org_id', id: orgId };
  const uid = await idUsuarioAtual();
  return uid ? { coluna: 'user_id', id: uid } : null;
}
