// Cliente da Edge Function `org_admin` — gestão de sub-logins da org pelo MESTRE.
// (≠ da função `admin`, que é do dono da plataforma.)
import { supabase } from './supabase';

export interface SubUsuario {
  id: string;
  email: string;
  papel: 'gerente' | 'funcionario' | 'cliente';
  cliente_id: string | null;
  ativo: boolean;
  sessao_ativa: boolean;
  ultimo_acesso: string | null;
  ultima_sync: string | null;
  criado_em: string | null;
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('org_admin', { body });
  if (error) {
    // FunctionsHttpError esconde o motivo real no corpo da resposta — extrai o
    // { erro } devolvido pela função em vez do genérico "non-2xx status code".
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const corpo = await ctx.clone().json();
        if (corpo?.erro) throw new Error(String(corpo.erro));
      } catch (e) {
        if (e instanceof Error && e.message && !/json/i.test(e.message)) throw e;
      }
    }
    throw new Error(error.message || 'Falha na função org_admin');
  }
  if (data?.erro) throw new Error(String(data.erro));
  return data as T;
}

export async function listarSubUsuarios(): Promise<SubUsuario[]> {
  const r = await chamar<{ usuarios: SubUsuario[] }>({ action: 'listar_subusuarios' });
  return r.usuarios ?? [];
}

export async function criarSubUsuario(email: string, senha: string, papel: 'gerente' | 'funcionario'): Promise<void> {
  await chamar({ action: 'criar_subusuario', email, senha, papel });
}

export async function criarAcessoCliente(email: string, senha: string, clienteId: string): Promise<void> {
  await chamar({ action: 'criar_acesso_cliente', email, senha, cliente_id: clienteId });
}

export async function resetarSenhaSub(userId: string, novaSenha: string): Promise<void> {
  await chamar({ action: 'resetar_senha', user_id: userId, nova_senha: novaSenha });
}

export async function definirAtivoSub(userId: string, ativo: boolean): Promise<void> {
  await chamar({ action: 'definir_ativo', user_id: userId, ativo });
}

export async function trocarPapelSub(userId: string, papel: 'gerente' | 'funcionario'): Promise<void> {
  await chamar({ action: 'trocar_papel', user_id: userId, papel });
}

export async function excluirSub(userId: string): Promise<void> {
  await chamar({ action: 'excluir', user_id: userId });
}
