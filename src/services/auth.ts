// Porte de auth.js — mesmo contrato com api_login.php / api_verifica_acesso.php,
// mesmas chaves localStorage (nr13_usuario_logado, nr13_plano, nr13_ultimo_acesso).

const API_BASE = '';

export const VIP_USERS = [
  'perone.fs@gmail.com',
  'gabriel.borges@tempcall.com.br',
  'gabriel.dadona@gmail.com',
];

export interface LoginResultado {
  sucesso: boolean;
  plano?: string;
  erro?: string;
}

export interface VerificaAcessoResultado {
  ativo: boolean;
  plano?: string;
}

export async function login(email: string, senha: string): Promise<LoginResultado> {
  const resp = await fetch(`${API_BASE}/api_login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const resultado: LoginResultado = await resp.json();
  if (resultado.sucesso) {
    localStorage.setItem('nr13_usuario_logado', email.trim().toLowerCase());
    if (resultado.plano) localStorage.setItem('nr13_plano', resultado.plano);
    localStorage.setItem('nr13_ultimo_acesso', new Date().toLocaleString('pt-BR'));
  }
  return resultado;
}

export function logout(): void {
  localStorage.removeItem('nr13_usuario_logado');
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

// Confirma no servidor se a sessão ainda está ativa (admin pode cancelar/expirar em tempo real).
// Retorna false e limpa a sessão local se o acesso foi revogado.
export async function verificarAcesso(): Promise<VerificaAcessoResultado> {
  const email = usuarioLogado();
  if (!email) return { ativo: false };
  try {
    const resp = await fetch(`${API_BASE}/api_verifica_acesso.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const resultado: VerificaAcessoResultado = await resp.json();
    if (!resultado.ativo) {
      logout();
    } else if (resultado.plano) {
      localStorage.setItem('nr13_plano', resultado.plano);
    }
    return resultado;
  } catch {
    // offline: mantém sessão local, não força logout
    return { ativo: true };
  }
}
