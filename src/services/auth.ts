// Autenticação via Supabase Auth (multi-usuário, e-mail/senha) + perfil em public.profiles.
// Mantém as chaves localStorage usadas pela UI (nr13_usuario_logado, nr13_plano, nr13_ultimo_acesso)
// para leitura síncrona no render.
import { supabase } from './supabase';
import { lerTudo } from './storage';

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
}

export interface VerificaAcessoResultado {
  ativo: boolean;
  plano?: string;
}

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

// Busca plano/ativo do perfil; grava plano no cache local p/ isDemo().
async function carregarPerfil(): Promise<{ plano: string; ativo: boolean }> {
  const { data } = await supabase
    .from('profiles')
    .select('plano, ativo')
    .maybeSingle();
  const plano = data?.plano ?? '';
  const ativo = data?.ativo ?? true;
  if (plano) localStorage.setItem('nr13_plano', plano);
  return { plano, ativo };
}

async function aposEntrar(email: string): Promise<string> {
  localStorage.setItem('nr13_usuario_logado', normalizar(email));
  localStorage.setItem('nr13_ultimo_acesso', new Date().toLocaleString('pt-BR'));
  const { plano } = await carregarPerfil();
  await lerTudo(); // hidrata o cache local (iframes leem do localStorage)
  return plano;
}

export async function login(email: string, senha: string): Promise<LoginResultado> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizar(email),
    password: senha,
  });
  if (error) {
    return { sucesso: false, erro: traduzErro(error.message) };
  }
  const plano = await aposEntrar(email);
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
  const plano = await aposEntrar(email);
  return { sucesso: true, plano };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  localStorage.removeItem('nr13_usuario_logado');
  localStorage.removeItem('nr13_plano');
}

export function usuarioLogado(): string | null {
  return localStorage.getItem('nr13_usuario_logado');
}

export function isVip(email: string | null): boolean {
  return !!email && VIP_USERS.includes(email.toLowerCase());
}

export function isDemo(): boolean {
  return (localStorage.getItem('nr13_plano') || '').toLowerCase().includes('demonstra');
}

// Confirma no Supabase se a sessão segue válida e o perfil ativo. Limpa sessão se revogado.
export async function verificarAcesso(): Promise<VerificaAcessoResultado> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      await logout();
      return { ativo: false };
    }
    const { plano, ativo } = await carregarPerfil();
    if (!ativo) {
      await logout();
      return { ativo: false };
    }
    return { ativo: true, plano };
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
