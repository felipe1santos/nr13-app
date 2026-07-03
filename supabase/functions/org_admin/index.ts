// Edge Function `org_admin` — gestão de sub-logins DA PRÓPRIA ORG pelo mestre.
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome "org_admin" → cola isto.
// Secrets SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente.
//
// Diferença para a função `admin`: aqui o chamador NÃO é o admin da plataforma — é o
// MESTRE de uma organização (profiles.papel = 'mestre'), e só pode agir dentro da própria
// org (org_id). Requer a migração supabase/acesso_setup.sql aplicada.
//
// Ações (POST JSON { action, ... }):
//   { action: 'listar_subusuarios' }
//     -> { usuarios: [{ id, email, papel, cliente_id, ativo, sessao_ativa, criado_em }] }
//   { action: 'criar_subusuario', email, senha, papel }            papel: 'gerente'|'funcionario'
//   { action: 'criar_acesso_cliente', email, senha, cliente_id }   cria papel='cliente'
//   { action: 'resetar_senha', user_id, nova_senha }
//   { action: 'definir_ativo', user_id, ativo }
//   { action: 'trocar_papel', user_id, papel }                     'gerente'|'funcionario'
//   { action: 'excluir', user_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SESSAO_LIMITE_MS = 90_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Autentica o chamador.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return json({ erro: 'Sem token' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ erro: 'Token inválido' }, 401);

  // 2. Chamador precisa ser MESTRE de uma org.
  const { data: perfil } = await admin
    .from('profiles')
    .select('papel, org_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  const orgId = perfil?.org_id as string | null;
  if (perfil?.papel !== 'mestre' || !orgId) {
    return json({ erro: 'Acesso negado (apenas o mestre da organização)' }, 403);
  }

  // Alvo de qualquer ação precisa pertencer à MESMA org (nunca mexe fora dela).
  async function alvoDaOrg(userId: string): Promise<boolean> {
    if (!userId || userId === userData.user!.id) return false;
    const { data } = await admin.from('profiles').select('org_id').eq('id', userId).maybeSingle();
    return data?.org_id === orgId;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  const action = body.action as string;

  try {
    if (action === 'listar_subusuarios') {
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, papel, cliente_id, ativo, sessao_token, sessao_visto_em, created_at')
        .eq('org_id', orgId)
        .neq('id', userData.user.id);
      if (error) return json({ erro: error.message }, 400);
      const agora = Date.now();
      const usuarios = (data ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        papel: p.papel,
        cliente_id: p.cliente_id,
        ativo: p.ativo,
        sessao_ativa:
          !!p.sessao_token && !!p.sessao_visto_em && agora - new Date(p.sessao_visto_em).getTime() < SESSAO_LIMITE_MS,
        ultimo_acesso: p.sessao_visto_em ?? null,
        criado_em: p.created_at ?? null,
      }));
      return json({ usuarios });
    }

    if (action === 'criar_subusuario' || action === 'criar_acesso_cliente') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const senha = String(body.senha ?? '');
      const papel = action === 'criar_acesso_cliente' ? 'cliente' : String(body.papel ?? '');
      const clienteId = action === 'criar_acesso_cliente' ? String(body.cliente_id ?? '') : null;
      if (!email || senha.length < 6) return json({ erro: 'email e senha (mín. 6) obrigatórios' }, 400);
      if (!['gerente', 'funcionario', 'cliente'].includes(papel)) return json({ erro: 'papel inválido' }, 400);
      if (papel === 'cliente' && !clienteId) return json({ erro: 'cliente_id obrigatório' }, 400);

      let userId: string | null = null;
      const { data: novo, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });
      if (error) {
        // Caso comum: tentativa anterior criou o usuário no Auth mas falhou no perfil
        // ("A user with this email address has already been registered"). Recupera o
        // usuário existente — mas SÓ adota se for órfão ou já da própria org (nunca
        // sequestra conta de outra organização).
        const jaExiste = /already (been )?registered|already exists/i.test(error.message);
        if (!jaExiste) return json({ erro: error.message }, 400);
        const { data: lista, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) return json({ erro: listErr.message }, 400);
        const existente = lista.users.find((u) => (u.email ?? '').toLowerCase() === email);
        if (!existente) return json({ erro: 'E-mail já registrado, mas usuário não encontrado. Tente outro e-mail.' }, 400);
        const { data: perfilExist } = await admin
          .from('profiles')
          .select('org_id, criado_por, papel')
          .eq('id', existente.id)
          .maybeSingle();
        const adotavel =
          !perfilExist ||
          perfilExist.org_id === orgId ||
          (perfilExist.criado_por === null && perfilExist.org_id === existente.id && perfilExist.papel === 'mestre');
        if (!adotavel) return json({ erro: 'Este e-mail já pertence a outra conta. Use outro e-mail.' }, 400);
        const { error: pwErr } = await admin.auth.admin.updateUserById(existente.id, { password: senha, email_confirm: true });
        if (pwErr) return json({ erro: pwErr.message }, 400);
        userId = existente.id;
      } else {
        userId = novo.user?.id ?? null;
      }

      if (userId) {
        // upsert: o trigger handle_new_user pode já ter criado a linha do profile.
        const linha: Record<string, unknown> = {
          id: userId,
          email,
          ativo: true,
          org_id: orgId,
          papel,
          cliente_id: clienteId,
          criado_por: userData.user.id,
        };
        let { error: upErr } = await admin.from('profiles').upsert(linha, { onConflict: 'id' });
        if (upErr && /email/i.test(upErr.message)) {
          // instalações sem coluna email em profiles: regrava sem ela
          delete linha.email;
          ({ error: upErr } = await admin.from('profiles').upsert(linha, { onConflict: 'id' }));
        }
        if (upErr) return json({ erro: upErr.message }, 400);
      }
      return json({ ok: true, id: userId });
    }

    if (action === 'resetar_senha') {
      const userId = String(body.user_id ?? '');
      const novaSenha = String(body.nova_senha ?? '');
      if (novaSenha.length < 6) return json({ erro: 'nova_senha (mín. 6) obrigatória' }, 400);
      if (!(await alvoDaOrg(userId))) return json({ erro: 'Usuário fora da sua organização' }, 403);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'definir_ativo') {
      const userId = String(body.user_id ?? '');
      const ativo = body.ativo === true;
      if (!(await alvoDaOrg(userId))) return json({ erro: 'Usuário fora da sua organização' }, 403);
      const { error } = await admin.from('profiles').update({ ativo }).eq('id', userId);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'trocar_papel') {
      const userId = String(body.user_id ?? '');
      const papel = String(body.papel ?? '');
      if (!['gerente', 'funcionario'].includes(papel)) return json({ erro: 'papel inválido' }, 400);
      if (!(await alvoDaOrg(userId))) return json({ erro: 'Usuário fora da sua organização' }, 403);
      const { error } = await admin.from('profiles').update({ papel }).eq('id', userId);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'excluir') {
      const userId = String(body.user_id ?? '');
      if (!(await alvoDaOrg(userId))) return json({ erro: 'Usuário fora da sua organização' }, 403);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
