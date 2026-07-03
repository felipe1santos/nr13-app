import type { NomeIcone } from '../components/Icone';

/**
 * Menu principal do shell Forja. `id` é a unidade de permissão usada pelo
 * controle de acesso por sub-login (nr13_permissoes_<userId>).
 */
export interface ItemMenu {
  id: string;
  to: string;
  label: string;
  icone: NomeIcone;
}

export const ITENS_TOPO: ItemMenu[] = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', icone: 'grid' },
  { id: 'equipamentos', to: '/equipamentos', label: 'Equipamentos', icone: 'box' },
  { id: 'inspecoes', to: '/inspecoes', label: 'Inspeções', icone: 'clipboard' },
];

export const ITENS_CADASTRAR: ItemMenu[] = [
  { id: 'funcionarios', to: '/funcionarios', label: 'Funcionários', icone: 'users' },
  { id: 'clientes', to: '/empresas', label: 'Clientes', icone: 'briefcase' },
];

export const ITENS_BAIXO: ItemMenu[] = [
  { id: 'relatorios', to: '/relatorios', label: 'Relatórios', icone: 'barchart' },
  { id: 'prontuarios', to: '/prontuarios', label: 'Prontuários', icone: 'book' },
  { id: 'calibracoes', to: '/calibracoes', label: 'Calibrações', icone: 'sliders' },
  { id: 'livro', to: '/livro-registro', label: 'Livro Registro', icone: 'filetext' },
];

// Só o mestre enxerga (gestão de sub-logins).
export const ITEM_ACESSOS: ItemMenu = { id: 'acessos', to: '/acesso', label: 'Acessos', icone: 'key' };

/** Título + subtítulo da topbar por prefixo de rota. */
export const TITULOS_ROTA: { prefixo: string; titulo: string; sub: string }[] = [
  { prefixo: '/dashboard', titulo: 'Dashboard', sub: 'Visão geral da operação e indicadores-chave' },
  { prefixo: '/vencimentos', titulo: 'Vencimentos & inspeções', sub: 'Visão geral de prazos e conformidade' },
  { prefixo: '/equipamento/', titulo: 'Equipamentos', sub: 'Ficha do equipamento' },
  { prefixo: '/equipamentos', titulo: 'Equipamentos', sub: 'Cadastro geral de ativos sob NR-13' },
  { prefixo: '/inspecoes', titulo: 'Inspeções', sub: 'Preenchimento em campo e containers de inspeção' },
  { prefixo: '/relatorios', titulo: 'Relatórios', sub: 'Histórico de inspeções por equipamento' },
  { prefixo: '/prontuarios', titulo: 'Prontuários', sub: 'Prontuários e reconstituições' },
  { prefixo: '/calibracoes', titulo: 'Calibrações', sub: 'Certificados e rastreabilidade de instrumentos' },
  { prefixo: '/livro-registro', titulo: 'Livro Registro', sub: 'Livros de registro de segurança por equipamento' },
  { prefixo: '/funcionarios', titulo: 'Funcionários', sub: 'Profissionais habilitados e equipe' },
  { prefixo: '/empresas', titulo: 'Clientes', sub: 'Empresas clientes cadastradas' },
  { prefixo: '/minha-empresa', titulo: 'Minha Empresa', sub: 'Dados da empresa executante' },
  { prefixo: '/acesso', titulo: 'Acessos', sub: 'Logins da sua equipe e permissões' },
];

export function tituloDaRota(pathname: string): { titulo: string; sub: string } {
  const hit = TITULOS_ROTA.find((t) => pathname.startsWith(t.prefixo));
  return hit ?? { titulo: 'NR-13', sub: '' };
}
