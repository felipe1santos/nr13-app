// Autenticação via Supabase Auth (multi-usuário, e-mail/senha) + perfil em public.profiles.
// Mantém as chaves localStorage usadas pela UI (nr13_usuario_logado, nr13_plano, nr13_ultimo_acesso,
// nr13_role) para leitura síncrona no render.
import { supabase } from './supabase';
import { lerTudo, limparCacheDados } from './storage';

export const VIP_USERS = [
  'perone.fs@gmail.com',
  'gabriel.borges@tempcall.com.br',
  'gabriel.dadona@gmail.com',
];

export interface LoginResultado {
  sucesso: boolean;
  plano?: string;
  papel?: PapelOrg | '';
  erro?: string;
  // signup com confirmação de e-mail ativada: conta criada, falta confirmar
  precisaConfirmarEmail?: boolean;
  // cadastro criado mas aguardando liberação do admin (aviso, não erro)
  aguardandoLiberacao?: boolean;
}

export interface VerificaAcessoResultado {
  ativo: boolean;
  plano?: string;
}

export type PapelOrg = 'mestre' | 'gerente' | 'funcionario' | 'cliente';

interface Perfil {
  plano: string;
  ativo: boolean;
  role: string;
  acessoExpiraEm: string | null;
  // Controle de acesso multi-papel (null/'' antes da migração acesso_setup.sql)
  papel: PapelOrg | '';
  orgId: string | null;
  clienteId: string | null;
  sessaoToken: string | null;
  sessaoVistoEm: string | null;
}

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

// Busca perfil; grava plano/role no cache local p/ isDemo()/isAdmin().
// Filtra pelo próprio id: a RLS de admin retorna TODOS os perfis, então sem o filtro
// o maybeSingle() quebraria (várias linhas) para o usuário admin.
const PERFIL_VAZIO: Perfil = {
  plano: '', ativo: false, role: 'user', acessoExpiraEm: null,
  papel: '', orgId: null, clienteId: null, sessaoToken: null, sessaoVistoEm: null,
};

async function carregarPerfil(): Promise<Perfil> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return { ...PERFIL_VAZIO };
  // Tenta com as colunas do controle de acesso; se a migração acesso_setup.sql
  // ainda não rodou (coluna inexistente), cai no select legado — deploy seguro.
  let data: Record<string, unknown> | null = null;
  const res = await supabase
    .from('profiles')
    .select('plano, ativo, role, acesso_expira_em, papel, org_id, cliente_id, sessao_token, sessao_visto_em')
    .eq('id', uid)
    .maybeSingle();
  if (!res.error) {
    data = res.data as Record<string, unknown> | null;
  } else {
    const legado = await supabase
      .from('profiles')
      .select('plano, ativo, role, acesso_expira_em')
      .eq('id', uid)
      .maybeSingle();
    data = legado.data as Record<string, unknown> | null;
  }
  const plano = (data?.plano as string) ?? '';
  const ativo = (data?.ativo as boolean) ?? false;
  const role = (data?.role as string) ?? 'user';
  const acessoExpiraEm = (data?.acesso_expira_em as string) ?? null;
  const papel = ((data?.papel as string) ?? '') as Perfil['papel'];
  const orgId = (data?.org_id as string) ?? null;
  const clienteId = (data?.cliente_id as string) ?? null;
  if (plano) localStorage.setItem('nr13_plano', plano);
  localStorage.setItem('nr13_role', role);
  // Persistido para o aviso de expiração no Layout (banner "faltam X dias").
  if (acessoExpiraEm) localStorage.setItem('nr13_acesso_expira_em', acessoExpiraEm);
  else localStorage.removeItem('nr13_acesso_expira_em');
  localStorage.setItem('nr13_uid', uid); // usado pelas permissões por sub-login
  if (papel) localStorage.setItem('nr13_papel', papel);
  if (orgId) localStorage.setItem('nr13_org_id', orgId);
  if (clienteId) localStorage.setItem('nr13_cliente_id', clienteId);
  else localStorage.removeItem('nr13_cliente_id');
  return {
    plano, ativo, role, acessoExpiraEm, papel, orgId, clienteId,
    sessaoToken: (data?.sessao_token as string) ?? null,
    sessaoVistoEm: (data?.sessao_visto_em as string) ?? null,
  };
}

function expirado(acessoExpiraEm: string | null): boolean {
  if (!acessoExpiraEm) return false;
  return new Date(acessoExpiraEm).getTime() < Date.now();
}

async function aposEntrar(email: string): Promise<string> {
  localStorage.setItem('nr13_usuario_logado', normalizar(email));
  localStorage.setItem('nr13_ultimo_acesso', new Date().toLocaleString('pt-BR'));
  const { plano } = await carregarPerfil();
  await lerTudo(); // hidrata o cache local (iframes leem do localStorage)
  return plano;
}

// ---- Eventos de uso (login/logout) p/ métricas do painel admin ----
function obterSessaoId(): string {
  let id = localStorage.getItem('nr13_sessao_id');
  if (!id) {
    id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2));
    localStorage.setItem('nr13_sessao_id', id);
  }
  return id;
}

async function registrarEvento(tipo: 'login' | 'logout'): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    await supabase.from('login_events').insert({
      user_id: user.id,
      email: user.email ?? null,
      tipo,
      sessao_id: obterSessaoId(),
    });
  } catch {
    // métricas são best-effort; nunca bloqueiam o fluxo
  }
}

export async function login(email: string, senha: string): Promise<LoginResultado> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizar(email),
    password: senha,
  });
  if (error) {
    return { sucesso: false, erro: traduzErro(error.message) };
  }
  // Gate de liberação/expiração: lê o perfil antes de liberar a entrada.
  const perfil = await carregarPerfil();
  if (!perfil.ativo) {
    await supabase.auth.signOut();
    return { sucesso: false, erro: 'Acesso ainda não liberado pelo administrador.' };
  }
  if (expirado(perfil.acessoExpiraEm)) {
    await supabase.auth.signOut();
    return { sucesso: false, erro: 'Seu acesso expirou. Contate o administrador.' };
  }
  // ── Sessão única (todos os papéis, inclusive o mestre): se a conta tem uma
  // sessão viva (heartbeat < LIMITE), bloqueia o segundo login. Heartbeat velho
  // = sessão abandonada e o lock é assumido. Antes da migração SQL, campos nulos.
  const bloqueio = await assumirSessaoUnica(perfil);
  if (!bloqueio.ok) {
    await supabase.auth.signOut();
    return { sucesso: false, erro: 'Esta conta já está em uso em outro dispositivo. Saia lá ou aguarde ~2 minutos.' };
  }
  // Nova sessão de uso → novo sessao_id.
  localStorage.removeItem('nr13_sessao_id');
  // Registro local do último login (exibido na topbar) — não sincroniza.
  localStorage.setItem('nr13_ultimo_login', new Date().toISOString());
  const plano = await aposEntrar(email);
  await registrarEvento('login');
  return { sucesso: true, plano, papel: perfil.papel };
}

// ── Sessão única: lock por heartbeat em profiles (ver PLANO-CONTROLE-DE-ACESSO §7) ──
export const SESSAO_LIMITE_MS = 90_000; // heartbeat mais velho que isso = sessão abandonada
export const SESSAO_HEARTBEAT_MS = 30_000;

async function assumirSessaoUnica(perfil: Perfil): Promise<{ ok: boolean }> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return { ok: false };
    const vivo =
      !!perfil.sessaoToken &&
      !!perfil.sessaoVistoEm &&
      Date.now() - new Date(perfil.sessaoVistoEm).getTime() < SESSAO_LIMITE_MS;
    if (vivo) return { ok: false };
    const meuToken = crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);
    const { error } = await supabase
      .from('profiles')
      .update({ sessao_token: meuToken, sessao_visto_em: new Date().toISOString() })
      .eq('id', uid);
    if (error) return { ok: true }; // migração ainda não rodou: não bloqueia o login
    localStorage.setItem('nr13_sessao_token', meuToken);
    return { ok: true };
  } catch {
    return { ok: true }; // best-effort: falha de rede não pode trancar o login
  }
}

// Heartbeat periódico + detecção de tomada de sessão. Chamar 1x no boot do app logado.
// onKick é chamado quando OUTRO dispositivo assumiu a conta.
export function iniciarHeartbeatSessao(onKick: () => void): () => void {
  let parado = false;
  async function bater() {
    if (parado) return;
    const meuToken = localStorage.getItem('nr13_sessao_token');
    if (!meuToken) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      // update condicionado ao MEU token: se outro assumiu, atualiza 0 linhas.
      await supabase
        .from('profiles')
        .update({ sessao_visto_em: new Date().toISOString() })
        .eq('id', uid)
        .eq('sessao_token', meuToken);
      const { data } = await supabase.from('profiles').select('sessao_token').eq('id', uid).maybeSingle();
      const tokenServidor = (data as { sessao_token?: string } | null)?.sessao_token ?? null;
      if (tokenServidor && tokenServidor !== meuToken) {
        parado = true;
        onKick();
      }
    } catch {
      // offline: tenta no próximo tick
    }
  }
  const timer = window.setInterval(bater, SESSAO_HEARTBEAT_MS);
  void bater();
  return () => {
    parado = true;
    window.clearInterval(timer);
  };
}

async function liberarSessaoUnica(): Promise<void> {
  try {
    const meuToken = localStorage.getItem('nr13_sessao_token');
    if (!meuToken) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase
      .from('profiles')
      .update({ sessao_token: null, sessao_visto_em: null })
      .eq('id', uid)
      .eq('sessao_token', meuToken);
  } catch {
    // best-effort
  }
}

export async function cadastrar(email: string, senha: string): Promise<LoginResultado> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizar(email),
    password: senha,
  });
  if (error) {
    return { sucesso: false, erro: traduzErro(error.message) };
  }
  // Sem sessão = confirmação de e-mail ativada no painel Supabase.
  if (!data.session) {
    return { sucesso: false, precisaConfirmarEmail: true };
  }
  // Conta criada com sessão, mas o acesso depende de liberação do admin (perfil nasce ativo=false).
  // Encerra a sessão: usuário só entra após o admin liberar.
  await supabase.auth.signOut();
  localStorage.removeItem('nr13_usuario_logado');
  localStorage.removeItem('nr13_plano');
  localStorage.removeItem('nr13_role');
  return { sucesso: false, aguardandoLiberacao: true };
}

// Faxina LOCAL da sessão (chaves de sessão + cache de dados), SEM ida à rede. Compartilhada
// entre o logout() normal e o listener de onAuthStateChange (BUG #8a): quando a sessão é
// perdida no meio do uso, a sessão do Supabase já caiu — não há signOut a fazer, só limpeza.
export function encerrarSessaoLocal(): void {
  localStorage.removeItem('nr13_usuario_logado');
  localStorage.removeItem('nr13_plano');
  localStorage.removeItem('nr13_role');
  localStorage.removeItem('nr13_sessao_id');
  localStorage.removeItem('nr13_cache_owner');
  localStorage.removeItem('nr13_papel');
  localStorage.removeItem('nr13_org_id');
  localStorage.removeItem('nr13_cliente_id');
  localStorage.removeItem('nr13_sessao_token');
  localStorage.removeItem('nr13_acesso_expira_em');
  // Zera os dados em cache para não vazarem ao próximo login (mesmo navegador).
  limparCacheDados();
}

export async function logout(): Promise<void> {
  await registrarEvento('logout');
  await liberarSessaoUnica();
  await supabase.auth.signOut();
  encerrarSessaoLocal();
}

// ── Troca de senha pelo próprio usuário ──────────────────────────────────────
// Fluxo com código por e-mail (Supabase recovery OTP):
//   1. enviarCodigoTrocaSenha(email)  → Supabase envia e-mail do template "Reset Password"
//      (o template PRECISA conter {{ .Token }} — ver CLAUDE.md §9, pendência de deploy).
//   2. trocarSenhaComCodigo(email, codigo, novaSenha) → verifyOtp(type 'recovery') valida o
//      código e cria sessão; updateUser grava a nova senha.
// Fluxo alternativo (logado, sem depender de e-mail): trocarSenhaComSenhaAtual().

export interface TrocaSenhaResultado {
  sucesso: boolean;
  erro?: string;
}

export async function enviarCodigoTrocaSenha(email: string): Promise<TrocaSenhaResultado> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizar(email));
  if (error) return { sucesso: false, erro: traduzErro(error.message) };
  return { sucesso: true };
}

// encerrarSessao=true: usado no fluxo "esqueci minha senha" da tela de login — o verifyOtp
// cria sessão SEM passar pelos gates de login (ativo/expiração/sessão única), então
// derrubamos a sessão e obrigamos o login normal com a senha nova.
export async function trocarSenhaComCodigo(
  email: string,
  codigo: string,
  novaSenha: string,
  encerrarSessao = false,
): Promise<TrocaSenhaResultado> {
  const { error: otpErr } = await supabase.auth.verifyOtp({
    email: normalizar(email),
    token: codigo.trim(),
    type: 'recovery',
  });
  if (otpErr) return { sucesso: false, erro: traduzErro(otpErr.message) };
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    if (encerrarSessao) await supabase.auth.signOut();
    return { sucesso: false, erro: traduzErro(error.message) };
  }
  if (encerrarSessao) await supabase.auth.signOut();
  return { sucesso: true };
}

export async function trocarSenhaComSenhaAtual(
  senhaAtual: string,
  novaSenha: string,
): Promise<TrocaSenhaResultado> {
  const email = usuarioLogado();
  if (!email) return { sucesso: false, erro: 'Sessão expirada. Entre novamente.' };
  // Reautentica para confirmar a senha atual (mesmo usuário: não afeta a sessão única).
  const { error: confErr } = await supabase.auth.signInWithPassword({
    email: normalizar(email),
    password: senhaAtual,
  });
  if (confErr) return { sucesso: false, erro: 'Senha atual incorreta.' };
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) return { sucesso: false, erro: traduzErro(error.message) };
  return { sucesso: true };
}

// ── Papéis da organização (≠ role admin da plataforma) ──
export function papelAtual(): PapelOrg | '' {
  return (localStorage.getItem('nr13_papel') || '') as PapelOrg | '';
}
export function isMestre(): boolean {
  // Contas antigas (pré-migração) não têm papel gravado: tratadas como mestre (dona da org).
  const p = papelAtual();
  return p === 'mestre' || p === '';
}
export function isGerente(): boolean { return papelAtual() === 'gerente'; }
export function isFuncionario(): boolean { return papelAtual() === 'funcionario'; }
export function isCliente(): boolean { return papelAtual() === 'cliente'; }
export function clienteIdAtual(): string | null { return localStorage.getItem('nr13_cliente_id'); }

// Matriz de escrita por papel e prefixo de chave (PLANO §8). RLS dá o piso
// (org + não-cliente); aqui refinamos gerente/funcionário na aplicação.
export function podeEscrever(chave: string): boolean {
  const p = papelAtual();
  if (p === '' || p === 'mestre') return true;
  if (p === 'cliente') return false;
  if (p === 'gerente') return !chave.startsWith('nr13_minha_empresa');
  // funcionário: só dados de campo (inspeções e formulários dos containers)
  return chave.startsWith('nr13_docs_') || chave.startsWith('nr13_inspecao') || chave.startsWith('nr13_injecao');
}

export function usuarioLogado(): string | null {
  return localStorage.getItem('nr13_usuario_logado');
}

export function isVip(email: string | null): boolean {
  return !!email && VIP_USERS.includes(email.toLowerCase());
}

export function isAdmin(): boolean {
  return (localStorage.getItem('nr13_role') || '').toLowerCase() === 'admin';
}

export function isDemo(): boolean {
  return (localStorage.getItem('nr13_plano') || '').toLowerCase().includes('demonstra');
}

// Confirma no Supabase se a sessão segue válida e o perfil ativo/não expirado. Limpa sessão se revogado.
export async function verificarAcesso(): Promise<VerificaAcessoResultado> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      await logout();
      return { ativo: false };
    }
    const perfil = await carregarPerfil();
    if (!perfil.ativo || expirado(perfil.acessoExpiraEm)) {
      await logout();
      return { ativo: false };
    }
    return { ativo: true, plano: perfil.plano };
  } catch {
    // offline: mantém sessão local, não força logout
    return { ativo: true };
  }
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Este e-mail já possui cadastro.';
  if (m.includes('password should be')) return 'A senha é muito curta (mínimo 6 caracteres).';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('token has expired') || m.includes('otp_expired') || (m.includes('invalid') && m.includes('token')))
    return 'Código inválido ou expirado. Solicite um novo código.';
  if (m.includes('security purposes') || m.includes('rate limit') || m.includes('too many requests'))
    return 'Muitas tentativas. Aguarde um minuto e tente novamente.';
  if (m.includes('should be different') || m.includes('same_password') || m.includes('different from the old'))
    return 'A nova senha precisa ser diferente da senha atual.';
  return msg;
}
