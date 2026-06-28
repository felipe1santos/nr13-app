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

interface Perfil {
  plano: string;
  ativo: boolean;
  role: string;
  acessoExpiraEm: string | null;
}

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

// Busca perfil; grava plano/role no cache local p/ isDemo()/isAdmin().
// Filtra pelo próprio id: a RLS de admin retorna TODOS os perfis, então sem o filtro
// o maybeSingle() quebraria (várias linhas) para o usuário admin.
async function carregarPerfil(): Promise<Perfil> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return { plano: '', ativo: false, role: 'user', acessoExpiraEm: null };
  const { data } = await supabase
    .from('profiles')
    .select('plano, ativo, role, acesso_expira_em')
    .eq('id', uid)
    .maybeSingle();
  const plano = data?.plano ?? '';
  const ativo = data?.ativo ?? false;
  const role = data?.role ?? 'user';
  const acessoExpiraEm = data?.acesso_expira_em ?? null;
  if (plano) localStorage.setItem('nr13_plano', plano);
  localStorage.setItem('nr13_role', role);
  return { plano, ativo, role, acessoExpiraEm };
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
  // Nova sessão de uso → novo sessao_id.
  localStorage.removeItem('nr13_sessao_id');
  const plano = await aposEntrar(email);
  await registrarEvento('login');
  return { sucesso: true, plano };
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
  // Zera os dados em cache para não vazarem ao próximo login (mesmo navegador).
  limparCacheDados();
}

export async function logout(): Promise<void> {
  await registrarEvento('logout');
  await supabase.auth.signOut();
  encerrarSessaoLocal();
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
  return msg;
}
