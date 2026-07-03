import { ler, salvar, excluirChave } from './storage';
import { isMestre, papelAtual } from './auth';

/**
 * Permissões por sub-login (checklist de módulos marcada pelo mestre na tela
 * Acessos). Guardadas em nr13_permissoes_<userId> no app_storage da org — sem
 * mudança de SQL/Edge Function: o papel no banco continua gerente|funcionario;
 * a granularidade fina é aplicada no front (menu e rotas filtrados).
 */
export const MODULOS = [
  'dashboard',
  'vencimentos',
  'equipamentos',
  'inspecoes',
  'relatorios',
  'prontuarios',
  'calibracoes',
  'livro',
  'funcionarios',
  'clientes',
] as const;
export type Modulo = (typeof MODULOS)[number];

export const ROTULO_MODULO: Record<Modulo, string> = {
  dashboard: 'Dashboard',
  vencimentos: 'Vencimentos',
  equipamentos: 'Equipamentos',
  inspecoes: 'Inspeções',
  relatorios: 'Relatórios',
  prontuarios: 'Prontuários',
  calibracoes: 'Calibrações',
  livro: 'Livro Registro',
  funcionarios: 'Cadastrar Funcionários',
  clientes: 'Cadastrar Clientes',
};

/** Pré-marcações por perfil de acesso ao criar o sub-login. */
export const PRESET_GERENTE: Modulo[] = [...MODULOS];
export const PRESET_INSPETOR: Modulo[] = ['inspecoes'];

const chave = (userId: string) => `nr13_permissoes_${userId}`;

export function carregarPermissoes(userId: string): Modulo[] | null {
  const salvo = ler<{ modulos?: string[] }>(chave(userId));
  if (!salvo || !Array.isArray(salvo.modulos)) return null; // null = sem restrição (legado)
  return salvo.modulos.filter((m): m is Modulo => (MODULOS as readonly string[]).includes(m));
}

export async function salvarPermissoes(userId: string, modulos: Modulo[]): Promise<void> {
  await salvar(chave(userId), { modulos });
}

export async function excluirPermissoes(userId: string): Promise<void> {
  await excluirChave(chave(userId));
}

/**
 * Módulos do usuário logado. null = sem restrição (mestre/gerente sem config).
 * REGRA DE SEGURANÇA: funcionário (inspetor) SEM permissões configuradas cai no
 * padrão "só inspeções" — nunca no acesso total (fail-safe se a chave de
 * permissões ainda não sincronizou até o aparelho dele).
 */
export function modulosDoUsuarioAtual(): Modulo[] | null {
  if (isMestre()) return null;
  const papel = papelAtual();
  if (papel === 'cliente') return null; // cliente tem árvore própria (/portal)
  const uid = localStorage.getItem('nr13_uid');
  const salvas = uid ? carregarPermissoes(uid) : null;
  if (salvas && salvas.length > 0) return salvas;
  if (papel === 'funcionario') return PRESET_INSPETOR;
  return null; // gerente sem config = comportamento padrão do papel (vê tudo menos áreas do mestre)
}
