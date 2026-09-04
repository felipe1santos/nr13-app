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
        return json({ erro: 'Informe um e-mail e uma senha de no mínimo 6 caracteres.' }, 400);

      // Cria já confirmado (sem precisar de e-mail de confirmação).
      //
      // `user_metadata` com o papel: `handle_new_user` insere o profile sem a
      // coluna `papel`, que cai no default. Aqui o default é o certo — conta
      // nova é dona da própria organização —, mas escrever explícito impede que
      // uma mudança futura naquele default vire uma conta com papel errado, e
      // deixa a origem igual à da Edge `org_admin`. Ver
      // `src/services/perfilOrigem.ts`.
      let userId: string | null = null;
      const { data: novo, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nr13_papel: 'mestre' },
      });

      if (error) {
        // ESTADO PARCIAL: uma tentativa anterior pode ter criado o usuário no
        // Auth e falhado depois (rede, perfil, expiração). Sem este bloco, a
        // retentativa devolvia "A user with this email address has already been
        // registered" e o administrador ficava sem saída — a conta existia,
        // não funcionava, e a tela não dizia o que fazer.
        const jaExiste = /already (been )?registered|already exists/i.test(error.message);
        if (!jaExiste) return json({ erro: error.message }, 400);

        const { data: lista, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) return json({ erro: listErr.message }, 400);
        const existente = lista.users.find((u) => (u.email ?? '').toLowerCase() === email);
        if (!existente) {
          return json(
            { erro: 'Este e-mail já está registrado, mas a conta não foi encontrada. Use outro e-mail.' },
            400,
          );
        }

        // SÓ retoma conta INCOMPLETA. Uma conta que já é dona de organização com
        // dados, ou que pertence a outra organização, não é "tentativa
        // anterior" — é conta de gente, e trocar a senha dela por aqui seria
        // sequestro. Nesse caso o administrador precisa saber o motivo.
        const { data: perfilExist } = await admin
          .from('profiles')
          .select('id, org_id, papel, role, ativo')
          .eq('id', existente.id)
          .maybeSingle();

        if (perfilExist?.role === 'admin') {
          return json({ erro: 'Este e-mail pertence a um administrador da plataforma. Use outro e-mail.' }, 400);
        }

        // Sub-login de OUTRA organização não é tentativa anterior de criar
        // conta: é usuário de um cliente. Mesmo vazio, retomá-lo aqui o
        // arrancaria da organização dele e o promoveria a mestre. `criado_por`
        // preenchido, ou `org_id` de outro, denunciam esse caso.
        const ehDeOutraOrg =
          !!perfilExist &&
          ((perfilExist.org_id && perfilExist.org_id !== existente.id) ||
            perfilExist.papel !== 'mestre');
        if (ehDeOutraOrg) {
          return json(
            {
              erro:
                'Este e-mail já é um acesso interno de outra conta (sub-login ou portal de cliente). ' +
                'Use outro e-mail.',
            },
            400,
          );
        }

        const { count: linhas } = await admin
          .from('app_storage')
          .select('chave', { count: 'exact', head: true })
          .eq('org_id', perfilExist?.org_id ?? existente.id);

        if ((linhas ?? 0) > 0) {
          return json(
            {
              erro:
                'Este e-mail já possui uma conta EM USO, com dados salvos. ' +
                'Para liberar o acesso dela use "Liberar acesso"; para trocar a senha use "Resetar senha". ' +
                'Se quiser mesmo uma conta nova, use outro e-mail.',
            },
            400,
          );
        }

        // Conta vazia: é a tentativa anterior. Retoma — senha nova e confirmada.
        const { error: pwErr } = await admin.auth.admin.updateUserById(existente.id, {
          password: senha,
          email_confirm: true,
        });
        if (pwErr) return json({ erro: `A conta existia, mas não foi possível redefinir a senha: ${pwErr.message}` }, 400);
        userId = existente.id;
      } else {
        userId = novo.user?.id ?? null;
      }

      if (!userId) {
        return json({ erro: 'A conta foi criada no login, mas o identificador não voltou. Recarregue e confira a lista.' }, 500);
      }

      // O perfil: `upsert`, não `update`. O trigger normalmente já criou a
      // linha, mas se ele não existir/falhar, um `update` não acerta linha
      // nenhuma e devolve sucesso — a conta ficaria no Auth SEM perfil, sem
      // organização e sem conseguir entrar. E o erro, que antes era
      // descartado, agora é lido: perfil não gravado é conta que não funciona.
      const { error: perfilErr } = await admin
        .from('profiles')
        .upsert({ id: userId, email, ativo: liberar, org_id: userId, papel: 'mestre' }, { onConflict: 'id' });
      if (perfilErr) {
        return json(
          {
            erro:
              'O login foi criado, mas houve erro ao gravar o perfil e vinculá-lo à organização: ' +
              `${perfilErr.message}. Tente criar de novo com o MESMO e-mail — o sistema retoma esta conta em vez de duplicar.`,
            id: userId,
            parcial: true,
          },
          500,
        );
      }

      return json({ ok: true, id: userId });
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
      // Exclusão COMPLETA: o FK de app_storage/profiles/login_events tem ON DELETE
      // CASCADE, então deletar o auth user já limpa o que ELE gravou. O que a
      // cascata NÃO cobre — e é apagado aqui — são os sub-logins da organização
      // (gerentes/inspetores/portal) e as linhas de app_storage gravadas por eles
      // (user_id do sub, org_id do mestre).
      const userId = body.user_id as string;
      if (!userId) return json({ erro: 'user_id obrigatório' }, 400);
      if (userId === userData.user.id) return json({ erro: 'Não pode excluir a si mesmo' }, 400);

      const { data: alvo } = await admin
        .from('profiles')
        .select('org_id, role')
        .eq('id', userId)
        .maybeSingle();
      if (alvo?.role === 'admin') return json({ erro: 'Não pode excluir outro admin.' }, 400);

      // Mestre/dono da org (org_id === próprio id, ou perfil legado sem org):
      // derruba a organização inteira.
      const donoDaOrg = !alvo?.org_id || alvo.org_id === userId;
      if (donoDaOrg) {
        const orgId = alvo?.org_id ?? userId;
        const { data: subs, error: subsErr } = await admin
          .from('profiles')
          .select('id')
          .eq('org_id', orgId)
          .neq('id', userId);
        if (subsErr) return json({ erro: subsErr.message }, 400);
        for (const sub of subs ?? []) {
          const { error: subDelErr } = await admin.auth.admin.deleteUser(sub.id);
          if (subDelErr) return json({ erro: `Falha ao excluir sub-login ${sub.id}: ${subDelErr.message}` }, 400);
        }
        // Rede de segurança: qualquer linha restante do escopo da org.
        const { error: stErr } = await admin.from('app_storage').delete().eq('org_id', orgId);
        if (stErr) return json({ erro: stErr.message }, 400);
      }

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'enviar_email_leads') {
      // Disparo de e-mail para leads do trial, escrito pelo admin no painel.
      // Personalização: {nome} e {empresa} são substituídos por destinatário.
      const assunto = String(body.assunto ?? '').trim();
      const corpo = String(body.corpo ?? '').trim();
      const destinatarios = (Array.isArray(body.destinatarios) ? body.destinatarios : [])
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);
      if (!assunto || !corpo || destinatarios.length === 0) {
        return json({ erro: 'assunto, corpo e destinatarios são obrigatórios' }, 400);
      }
      if (destinatarios.length > 90) {
        return json({ erro: 'Máximo de 90 destinatários por disparo (limite diário do plano da Resend).' }, 400);
      }
      const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
      if (!RESEND_KEY) return json({ erro: 'RESEND_API_KEY não configurada nas Edge Functions.' }, 400);

      const { data: perfis } = await admin
        .from('profiles')
        .select('email, nome, empresa_nome')
        .in('email', destinatarios);
      const porEmail = new Map(
        (perfis ?? []).map((p) => [String(p.email).toLowerCase(), p as { nome?: string; empresa_nome?: string }]),
      );
      // Leads importados (planilha/manual) não têm conta: personalização vem da
      // tabela leads_importados. Antes de rodar leads_setup.sql a query só falha
      // em silêncio (data null) e o disparo segue sem {nome}/{empresa} para eles.
      const { data: leadsImp } = await admin
        .from('leads_importados')
        .select('email, nome, empresa')
        .in('email', destinatarios);
      for (const l of leadsImp ?? []) {
        const chave = String(l.email).toLowerCase();
        if (!porEmail.has(chave)) {
          porEmail.set(chave, { nome: l.nome as string, empresa_nome: l.empresa as string });
        }
      }

      // Logo no cabeçalho: usa config_global.app_url (a logo é servida pelo próprio app).
      const { data: cfgUrl } = await admin
        .from('config_global')
        .select('valor')
        .eq('chave', 'app_url')
        .maybeSingle();
      const appUrl = String((cfgUrl?.valor as { url?: string } | null)?.url ?? '').replace(/\/+$/, '');
      // PNG (não WebP): Outlook e clientes antigos não renderizam WebP.
      const cabecalhoLogo = appUrl
        ? `<div style="text-align:center;margin-bottom:18px;"><img src="${appUrl}/email-logo.png" width="110" alt="NR13 Sistema" style="display:inline-block;" /></div>`
        : '';

      // Formatação leve escrita no painel: **negrito**, ==marca-texto==,
      // [texto](https://link) e !img(https://url-da-imagem). HTML do autor é escapado.
      const formatar = (t: string) =>
        t
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replace(/!img\((https?:[^\s)]+)\)/g, '<img src="$1" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" />')
          .replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" style="color:#0a5a6e;font-weight:bold;">$1</a>')
          .replace(/==([^=\n]+)==/g, '<mark style="background:#fde68a;padding:0 4px;border-radius:3px;">$1</mark>')
          .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

      let enviados = 0;
      const falhas: string[] = [];
      for (const dest of destinatarios) {
        const p = porEmail.get(dest);
        const troca = (t: string) =>
          t.replaceAll('{nome}', p?.nome ?? '').replaceAll('{empresa}', p?.empresa_nome ?? '');
        const html =
          '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; ' +
          'font-size: 14px; line-height: 1.65; color: #2b3a41;">' +
          cabecalhoLogo +
          formatar(troca(corpo))
            .split('\n')
            .map((l) => `<p style="margin: 0 0 10px;">${l || '&nbsp;'}</p>`)
            .join('') +
          '<p style="color:#6b7280;font-size:12px;margin-top:24px;">NR13 Sistema</p></div>';
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: 'NR13 Sistema <acesso@auth.nr13sistema.com.br>',
              to: [dest],
              subject: troca(assunto),
              html,
            }),
          });
          if (r.ok) enviados++;
          else falhas.push(dest);
        } catch {
          falhas.push(dest);
        }
      }
      return json({ ok: true, enviados, falhas });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
