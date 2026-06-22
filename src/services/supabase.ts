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
