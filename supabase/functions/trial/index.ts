// Edge Function `trial` — cadastro automático de leads (teste de 48h).
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome "trial" → cola isto.
// Requer a migração supabase/trial_setup.sql aplicada (config_global + colunas trial em profiles).
//
// Ações (POST JSON { action, ... }):
//   { action: 'status' }
//     -> { permitido: boolean }   (flag global config_global.cadastro_automatico; sem auth)
//   { action: 'ativar_trial', nome?, telefone?, empresa_nome? }
//     -> { ok: true }             (com sessão; só após o e-mail confirmado)
//   { action: 'enviar_lembretes' }
//     -> { ok, lembretes, vencidos }  (pg_cron de hora em hora — trial_emails_setup.sql;
//        boas-vindas/lembrete 6h antes/vencido via Resend API; requer secret RESEND_API_KEY)
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
// Secret opcional (Dashboard → Edge Functions → Secrets). Sem ele, os e-mails de
// boas-vindas/lembrete/vencido são silenciosamente pulados — o fluxo não quebra.
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const TRIAL_HORAS = 48;
const REMETENTE = 'NR13 Sistema <acesso@auth.nr13sistema.com.br>';

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

function dataBR(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Envio transacional via Resend API. Best-effort: falha nunca derruba o fluxo.
async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  if (!RESEND_KEY || !para) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function moldura(titulo: string, corpo: string): string {
  return (
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">' +
    `<h2 style="color: #1f2937;">${titulo}</h2>` +
    corpo +
    '<p style="color:#6b7280;font-size:12px;margin-top:28px;">NR13 Sistema — se você não fez este cadastro, ignore este e-mail.</p>' +
    '</div>'
  );
}

function botaoAssinar(url: string): string {
  if (!url) return '<p>Para contratar, acesse o sistema e clique em <b>Assinar agora</b>.</p>';
  return (
    `<p style="margin:24px 0;"><a href="${url}" style="background:#B45309;color:#fff;` +
    'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Assinar agora</a></p>'
  );
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

      // Boas-vindas (best-effort; requer secret RESEND_API_KEY).
      if (user.email) {
        const enviado = await enviarEmail(
          user.email,
          'Seu teste gratuito começou — NR13 Sistema',
          moldura(
            'Bem-vindo ao NR13 Sistema!',
            '<p>Seu período de teste de <b>48 horas</b> está ativo.</p>' +
              `<p>Ele termina em <b>${dataBR(fim)}</b> (horário de Brasília).</p>` +
              '<p>Já deixamos equipamentos de demonstração na sua conta para você explorar ' +
              'memorial de cálculo, categoria NR-13, inspeções e vencimentos.</p>' +
              '<p>Download e impressão de documentos ficam disponíveis após a contratação.</p>',
          ),
        );
        if (enviado) {
          await admin.from('profiles').update({ email_bemvindo_em: new Date().toISOString() }).eq('id', user.id);
        }
      }

      return json({ ok: true, trial_fim: fim.toISOString() });
    }

    if (action === 'enviar_lembretes') {
      // Chamada pelo pg_cron de hora em hora (trial_emails_setup.sql). Idempotente:
      // cada e-mail é marcado no perfil e nunca repete. Sem RESEND_API_KEY, no-op.
      if (!RESEND_KEY) return json({ ok: false, motivo: 'RESEND_API_KEY não configurada' });

      const agora = new Date();
      const em6h = new Date(agora.getTime() + 6 * 3600_000);
      const ha7dias = new Date(agora.getTime() - 7 * 24 * 3600_000);
      const { data: cfg } = await admin
        .from('config_global')
        .select('valor')
        .eq('chave', 'app_url')
        .maybeSingle();
      const url = String((cfg?.valor as { url?: string } | null)?.url ?? '');

      let lembretes = 0;
      let vencidos = 0;

      // Lembrete: trial ativo terminando nas próximas 6h.
      const { data: terminando } = await admin
        .from('profiles')
        .select('id, email, trial_fim')
        .eq('plano', 'trial')
        .is('email_lembrete_em', null)
        .gt('trial_fim', agora.toISOString())
        .lt('trial_fim', em6h.toISOString());
      for (const p of terminando ?? []) {
        if (!p.email) continue;
        const ok = await enviarEmail(
          p.email,
          'Seu teste termina em breve — NR13 Sistema',
          moldura(
            'Seu período de teste está acabando',
            `<p>Seu acesso de teste termina em <b>${dataBR(p.trial_fim)}</b> (horário de Brasília).</p>` +
              '<p>Para continuar usando o NR13 Sistema sem perder o que você viu, contrate agora:</p>' +
              botaoAssinar(url),
          ),
        );
        if (ok) {
          await admin.from('profiles').update({ email_lembrete_em: agora.toISOString() }).eq('id', p.id);
          lembretes++;
        }
      }

      // Vencido: terminou nos últimos 7 dias (não ressuscita trial antigo).
      const { data: expirados } = await admin
        .from('profiles')
        .select('id, email, trial_fim')
        .eq('plano', 'trial')
        .is('email_vencido_em', null)
        .lt('trial_fim', agora.toISOString())
        .gt('trial_fim', ha7dias.toISOString());
      for (const p of expirados ?? []) {
        if (!p.email) continue;
        const ok = await enviarEmail(
          p.email,
          'Seu período de teste terminou — NR13 Sistema',
          moldura(
            'Seu período de teste terminou',
            '<p>As 48 horas de teste do NR13 Sistema chegaram ao fim.</p>' +
              '<p>Gostou? Assine para liberar o acesso completo, incluindo download e impressão ' +
              'de relatórios e prontuários.</p>' +
              botaoAssinar(url),
          ),
        );
        if (ok) {
          await admin.from('profiles').update({ email_vencido_em: agora.toISOString() }).eq('id', p.id);
          vencidos++;
        }
      }

      return json({ ok: true, lembretes, vencidos });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
