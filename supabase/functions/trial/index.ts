// Edge Function `trial` — cadastro automático de leads (teste de 48h).
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome "trial" → cola isto.
// Requer a migração supabase/trial_setup.sql aplicada (config_global + colunas trial em profiles).
//
// Ações (POST JSON { action, ... }):
//   { action: 'status' }
//     -> { permitido: boolean }   (flag global config_global.cadastro_automatico; sem auth)
//   { action: 'ativar_trial', nome?, telefone?, empresa_nome? }
//     -> { ok: true }             (com sessão; só após o e-mail confirmado)
//
// A ativação é 100% server-side: o front nunca escreve ativo/acesso_expira_em.
// Guardas do ativar_trial: flag ligada, e-mail confirmado, perfil ainda inativo,
// nunca teve trial antes (trial_fim null — impede reciclar conta expirada).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TRIAL_HORAS = 48;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function texto(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim().slice(0, max);
  return s || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  const action = body.action as string;

  async function flagLigada(): Promise<boolean> {
    const { data } = await admin
      .from('config_global')
      .select('valor')
      .eq('chave', 'cadastro_automatico')
      .maybeSingle();
    return (data?.valor as { ativo?: boolean } | null)?.ativo === true;
  }

  try {
    if (action === 'status') {
      return json({ permitido: await flagLigada() });
    }

    if (action === 'ativar_trial') {
      if (!(await flagLigada())) {
        return json({ erro: 'O cadastro automático está temporariamente indisponível.' }, 403);
      }

      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
      if (!token) return json({ erro: 'Sem token' }, 401);
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData.user) return json({ erro: 'Token inválido' }, 401);
      const user = userData.user;

      if (!user.email_confirmed_at) {
        return json({ erro: 'Confirme seu e-mail antes de ativar o teste.' }, 403);
      }

      const { data: perfil, error: perfilErr } = await admin
        .from('profiles')
        .select('ativo, trial_fim')
        .eq('id', user.id)
        .maybeSingle();
      if (perfilErr) return json({ erro: perfilErr.message }, 400);
      if (!perfil) return json({ erro: 'Perfil não encontrado. Tente entrar novamente.' }, 400);
      if (perfil.ativo) return json({ erro: 'Esta conta já está ativa.' }, 400);
      if (perfil.trial_fim) return json({ erro: 'Esta conta já usou o período de teste.' }, 403);

      const agora = new Date();
      const fim = new Date(agora.getTime() + TRIAL_HORAS * 3600_000);
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const { error: upErr } = await admin
        .from('profiles')
        .update({
          ativo: true,
          plano: 'trial',
          origem_cadastro: 'trial',
          trial_inicio: agora.toISOString(),
          trial_fim: fim.toISOString(),
          acesso_expira_em: fim.toISOString(),
          nome: texto(body.nome, 120) ?? texto(meta.nome, 120),
          telefone: texto(body.telefone, 40) ?? texto(meta.telefone, 40),
          empresa_nome: texto(body.empresa_nome, 120) ?? texto(meta.empresa_nome, 120),
        })
        .eq('id', user.id);
      if (upErr) return json({ erro: upErr.message }, 400);

      await admin.from('login_events').insert({
        user_id: user.id,
        email: user.email,
        tipo: 'trial_ativado',
      });

      return json({ ok: true, trial_fim: fim.toISOString() });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
