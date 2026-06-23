// Edge Function `admin` — poderes que exigem service_role (nunca expor no frontend).
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome "admin" → cola isto.
// Secrets SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente.
//
// Ações (POST JSON { action, ... }):
//   { action: 'auth_meta' }                          -> [{ id, last_sign_in_at, email_confirmed_at }]
//   { action: 'reset_password', user_id, nova_senha }-> troca senha de qualquer usuário
//   { action: 'delete_user', user_id }               -> remove usuário (cascata limpa profile/events)
//
// Segurança: só executa se o chamador (Bearer token) for admin em public.profiles.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  // service_role: ignora RLS para operações admin.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Autentica o chamador pelo Bearer token.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ erro: 'Sem token' }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ erro: 'Token inválido' }, 401);

  // 2. Confere se o chamador é admin.
  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (perfil?.role !== 'admin') return json({ erro: 'Acesso negado (não é admin)' }, 403);

  // 3. Executa a ação.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  const action = body.action as string;

  try {
    if (action === 'auth_meta') {
      // Pagina todos os usuários do Auth e devolve só os metadados úteis.
      const metas: Array<{ id: string; last_sign_in_at: string | null; email_confirmed_at: string | null }> = [];
      let page = 1;
      // perPage máx 1000; pagina até esvaziar.
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ erro: error.message }, 400);
        for (const u of data.users) {
          metas.push({
            id: u.id,
            last_sign_in_at: u.last_sign_in_at ?? null,
            email_confirmed_at: u.email_confirmed_at ?? null,
          });
        }
        if (data.users.length < 1000) break;
        page++;
      }
      return json({ metas });
    }

    if (action === 'create_user') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const senha = String(body.senha ?? '');
      const liberar = body.liberar !== false; // default: já liberado
      if (!email || senha.length < 6)
        return json({ erro: 'email e senha (mín. 6) obrigatórios' }, 400);
      // Cria já confirmado (sem precisar de e-mail de confirmação).
      const { data: novo, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });
      if (error) return json({ erro: error.message }, 400);
      // Garante o perfil liberado (o trigger cria com ativo=false; aqui liberamos).
      if (novo.user) {
        await admin
          .from('profiles')
          .update({ ativo: liberar, email })
          .eq('id', novo.user.id);
      }
      return json({ ok: true, id: novo.user?.id });
    }

    if (action === 'reset_password') {
      const userId = body.user_id as string;
      const novaSenha = body.nova_senha as string;
      if (!userId || !novaSenha || novaSenha.length < 6)
        return json({ erro: 'user_id e nova_senha (mín. 6) obrigatórios' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete_user') {
      const userId = body.user_id as string;
      if (!userId) return json({ erro: 'user_id obrigatório' }, 400);
      if (userId === userData.user.id) return json({ erro: 'Não pode excluir a si mesmo' }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
