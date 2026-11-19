/**
 * Achado #1 da auditoria de 25/10/2026 — o auto-cadastro escolhia o próprio
 * papel e a própria organização.
 *
 * `handle_new_user` lia `nr13_papel` / `nr13_org_id` de `raw_user_meta_data`.
 * Esse campo é o `options.data` do `supabase.auth.signUp`, que é PÚBLICO: quem
 * se cadastra escreve o que quiser nele. Uma conta nova podia nascer `gerente`
 * da organização de outro cliente e ler/gravar o `app_storage` dela.
 *
 * A regra provada aqui:
 *   1. auto-cadastro com `nr13_*` forjado nasce MESTRE da PRÓPRIA org e não lê
 *      nada da org-alvo;
 *   2. auto-cadastro sem metadata continua nascendo mestre da própria org;
 *   3. papel e org de sub-login só entram pelo upsert do `service_role` (o
 *      passo que o `org_admin` já faz); o trigger não lê metadata nenhuma.
 *
 * SÓ LABORATÓRIO (CLAUDE.md §12). Roda contra o Supabase local do nr13-app
 * (`supabase_kong_nr13-app`, porta 55321) e recusa qualquer outro alvo — a
 * 54321 desta máquina é o laboratório de OUTRO projeto. Usuários nascem em
 * `@example.invalid` e são removidos no fim.
 *
 * COMO RODAR (chaves do `npx supabase status -o env`, nunca em arquivo):
 *   NR13_LAB_ANON_KEY=... NR13_LAB_SERVICE_ROLE_KEY=... \
 *     node --test scripts/lab/cadastroPapel.lab.test.mjs
 *
 * Fora do `npm test` de propósito: o vitest só cobre `src/**` e não tem banco.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ehProducaoProibida } from '../massa-escala/seguranca.mjs';

const URL_LAB = process.env.NR13_LAB_URL ?? 'http://127.0.0.1:55321';
const ANON = process.env.NR13_LAB_ANON_KEY;
const SERVICE = process.env.NR13_LAB_SERVICE_ROLE_KEY;

/** Só o laboratório deste projeto. Fail-closed: qualquer dúvida recusa. */
function alvoLiberado(url) {
  if (ehProducaoProibida(url)) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return ['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '55321';
}

const SEM_SESSAO = { auth: { persistSession: false, autoRefreshToken: false } };
const criados = [];
let admin;
let vitima;

function emailDescartavel(papel) {
  return `nr13-lab-cadastro-${papel}-${randomUUID().slice(0, 8)}@example.invalid`;
}

async function perfilDe(id) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, papel, org_id, cliente_id')
    .eq('id', id)
    .single();
  if (error) throw new Error(`perfil ${id}: ${error.message}`);
  return data;
}

async function cadastroPublico(dados) {
  const anon = createClient(URL_LAB, ANON, SEM_SESSAO);
  const email = emailDescartavel('auto');
  const { data, error } = await anon.auth.signUp({
    email,
    password: `S${randomUUID()}!aA9`,
    options: dados ? { data: dados } : undefined,
  });
  if (error || !data.user) throw new Error(`signUp: ${error?.message}`);
  criados.push(data.user.id);
  return { anon, user: data.user, session: data.session };
}

before(async () => {
  if (!alvoLiberado(URL_LAB)) throw new Error(`alvo recusado: ${URL_LAB} (só o laboratório na 55321)`);
  if (!ANON || !SERVICE) throw new Error('faltam NR13_LAB_ANON_KEY / NR13_LAB_SERVICE_ROLE_KEY');
  admin = createClient(URL_LAB, SERVICE, SEM_SESSAO);

  // A org-alvo: um mestre com assinatura em dia e um equipamento gravado pelo
  // caminho real de escrita (a RPC), como qualquer cliente pagante.
  const email = emailDescartavel('vitima');
  const senha = `S${randomUUID()}!aA9`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) throw new Error(`vítima: ${error?.message}`);
  criados.push(data.user.id);
  const { error: eUp } = await admin
    .from('profiles')
    .update({ ativo: true, plano: 'completo', assinatura_status: 'ativa', assinatura_ate: null, acesso_expira_em: null })
    .eq('id', data.user.id);
  if (eUp) throw new Error(`vítima perfil: ${eUp.message}`);

  const cli = createClient(URL_LAB, ANON, SEM_SESSAO);
  const { error: eLogin } = await cli.auth.signInWithPassword({ email, password: senha });
  if (eLogin) throw new Error(`vítima login: ${eLogin.message}`);
  const chave = `nr13_info_ZZLAB-${randomUUID().slice(0, 6)}`;
  const { error: eRpc } = await cli.rpc('aplicar_mutacao_storage', {
    p_chave: chave,
    p_mutation_id: randomUUID(),
    p_op: 'set',
    p_valor: JSON.stringify({ tag: 'ZZLAB', segredo: 'dado da vítima' }),
    p_versao_esperada: 0, // chave nova: base 0, como a fila do app (sync.ts)
    p_dispositivo: 'lab-cadastro-papel',
    p_mutado_em: new Date().toISOString(),
  });
  if (eRpc) throw new Error(`vítima RPC: ${eRpc.message}`);
  vitima = { id: data.user.id, chave };
});

after(async () => {
  if (!admin) return;
  const sobras = [];
  for (const id of criados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) sobras.push(`${id} (${error.message})`);
  }
  // Excluir usuário com linhas em app_storage esbarra na guarda da v2 (achado
  // #16 da auditoria). Sobra de laboratório, em @example.invalid: só avisa.
  if (sobras.length) console.warn(`lab: usuários não removidos: ${sobras.join(', ')}`);
});

test('auto-cadastro com nr13_papel/nr13_org_id forjados nasce mestre da PRÓPRIA org', async () => {
  const { user } = await cadastroPublico({
    nr13_papel: 'gerente',
    nr13_org_id: vitima.id,
    nr13_cliente_id: 'cli-forjado',
  });
  const p = await perfilDe(user.id);
  assert.equal(p.org_id, user.id, 'org_id veio da metadata forjada');
  assert.equal(p.papel, 'mestre', 'papel veio da metadata forjada');
  assert.equal(p.cliente_id, null);
});

test('auto-cadastro forjado não lê o app_storage da org-alvo', async () => {
  const { anon, session } = await cadastroPublico({ nr13_papel: 'gerente', nr13_org_id: vitima.id });
  assert.ok(session, 'laboratório deveria devolver sessão (enable_confirmations = false)');
  const { data, error } = await anon.from('app_storage').select('chave').eq('org_id', vitima.id);
  assert.equal(error, null);
  assert.deepEqual(data, [], 'conta forjada leu dado da organização de outro cliente');
});

test('auto-cadastro sem metadata nasce mestre da própria org', async () => {
  const { user } = await cadastroPublico(null);
  const p = await perfilDe(user.id);
  assert.equal(p.org_id, user.id);
  assert.equal(p.papel, 'mestre');
});

test('sub-login: o trigger dá org própria; só o upsert do service_role (passo do org_admin) põe papel e org', async () => {
  // Os dois passos de `org_admin` criar_subusuario, replicados aqui porque o
  // edge runtime do laboratório está parado: createUser → upsert do perfil.
  //
  // Medido em 25/10/2026 (GoTrue v2.197): o app_metadata NÃO está na linha no
  // momento do AFTER INSERT — o GoTrue o grava num UPDATE depois. Por isso o
  // trigger não lê metadata nenhuma e quem atribui papel/org é o upsert.
  const { data, error } = await admin.auth.admin.createUser({
    email: emailDescartavel('sub'),
    password: `S${randomUUID()}!aA9`,
    email_confirm: true,
    app_metadata: { nr13_papel: 'funcionario', nr13_org_id: vitima.id },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  criados.push(data.user.id);

  const antes = await perfilDe(data.user.id);
  assert.equal(antes.org_id, data.user.id, 'antes do upsert o sub-login precisa estar na PRÓPRIA org (vazia)');
  assert.equal(antes.papel, 'mestre');

  const { error: eUp } = await admin
    .from('profiles')
    .upsert({ id: data.user.id, ativo: true, org_id: vitima.id, papel: 'funcionario', cliente_id: null }, { onConflict: 'id' });
  assert.equal(eUp, null);
  const depois = await perfilDe(data.user.id);
  assert.equal(depois.org_id, vitima.id);
  assert.equal(depois.papel, 'funcionario');
});
