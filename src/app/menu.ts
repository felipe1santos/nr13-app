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

/**
 * Dados da empresa executante — logo, razão social, CNPJ, contato.
 *
 * Ficava só como um card dentro do Dashboard, sem entrada no menu: para editar
 * era preciso passar pelo painel. Agora tem porta própria, acima do Dashboard.
 * Fica atrás de `isMestre()` como o item de Acessos, porque a rota já era
 * exclusiva do mestre (ver o guarda de rota em Layout.tsx) — pôr no menu de
 * quem seria redirecionado só produziria um item que não abre.
 */
export const ITEM_MEUS_DADOS: ItemMenu = {
  id: 'meusdados',
  to: '/minha-empresa',
  label: 'Meus dados',
  icone: 'building',
};

export const ITENS_TOPO: ItemMenu[] = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', icone: 'grid' },
  // Fase 10A · a Agenda era um painel de meia largura dentro do Dashboard.
  // Serviço agendado tem empresa, endereço, responsável, telefone, horário,
  // status e valor — nada disso cabia lá dentro. Porta própria.
  { id: 'agenda', to: '/agenda', label: 'Agenda', icone: 'calendar' },
  { id: 'equipamentos', to: '/equipamentos', label: 'Equipamentos', icone: 'box' },
  { id: 'inspecoes', to: '/inspecoes', label: 'Inspeções', icone: 'clipboard' },
];

export const ITENS_CADASTRAR: ItemMenu[] = [
  { id: 'funcionarios', to: '/funcionarios', label: 'Funcionários', icone: 'users' },
  { id: 'clientes', to: '/empresas', label: 'Clientes', icone: 'briefcase' },
];

export const ITENS_BAIXO: ItemMenu[] = [
  // 09/09/2026 · era 'barchart' — gráfico de barras para a tela que lista
  // DOCUMENTOS. O ícone agora é o do arquivo que a seção produz, e é o mesmo
  // desenho que marca cada linha da lista.
  { id: 'relatorios', to: '/relatorios', label: 'Relatórios', icone: 'pdf' },
  { id: 'prontuarios', to: '/prontuarios', label: 'Prontuários', icone: 'book' },
  { id: 'calibracoes', to: '/calibracoes', label: 'Calibrações', icone: 'sliders' },
  { id: 'certificados', to: '/certificados', label: 'Certificados', icone: 'shield' },
  // A ROTA continua `/livro-registro` — links já emitidos e a memória muscular
  // de quem usa não podem quebrar por uma troca de rótulo. O nome na INTERFACE
  // é 'Registros de Segurança'.
  { id: 'livro', to: '/livro-registro', label: 'Registros de Segurança', icone: 'filetext' },
];

// Só o mestre enxerga (gestão de sub-logins).
export const ITEM_ACESSOS: ItemMenu = { id: 'acessos', to: '/acesso', label: 'Acessos', icone: 'key' };

/** Título + subtítulo da topbar por prefixo de rota. */
export const TITULOS_ROTA: { prefixo: string; titulo: string; sub: string }[] = [
  { prefixo: '/dashboard', titulo: 'Dashboard', sub: 'Visão geral da operação e indicadores-chave' },
  { prefixo: '/vencimentos', titulo: 'Vencimentos & inspeções', sub: 'Visão geral de prazos e conformidade' },
  { prefixo: '/agenda', titulo: 'Agenda', sub: 'Serviços agendados, faturamento previsto e realizado' },
  { prefixo: '/equipamento/', titulo: 'Equipamentos', sub: 'Ficha do equipamento' },
  { prefixo: '/equipamentos', titulo: 'Equipamentos', sub: 'Cadastro geral de ativos sob NR-13' },
  { prefixo: '/inspecoes', titulo: 'Inspeções', sub: 'Preenchimento em campo e containers de inspeção' },
  // 'por equipamento' descrevia a tela ANTIGA, em que se escolhia um
  // equipamento para ver o histórico dele. A lista canônica é da organização
  // inteira, e o subtítulo dizia o contrário logo acima dela.
  { prefixo: '/relatorios', titulo: 'Relatórios', sub: 'Todos os relatórios da organização' },
  { prefixo: '/prontuarios', titulo: 'Prontuários', sub: 'Prontuários e reconstituições' },
  { prefixo: '/calibracoes', titulo: 'Calibrações', sub: 'Calibrações dos equipamentos e acessórios' },
  { prefixo: '/certificados', titulo: 'Certificados', sub: 'Certificados de calibração dos padrões de medição' },
  {
    prefixo: '/livro-registro',
    titulo: 'Registros de Segurança',
    sub: 'O histórico de cada equipamento, exigido pela NR-13',
  },
  { prefixo: '/funcionarios', titulo: 'Funcionários', sub: 'Profissionais habilitados e equipe' },
  { prefixo: '/empresas', titulo: 'Clientes', sub: 'Empresas clientes cadastradas' },
  { prefixo: '/minha-empresa', titulo: 'Meus dados', sub: 'Dados da empresa executante' },
  { prefixo: '/acesso', titulo: 'Acessos', sub: 'Logins da sua equipe e permissões' },
  { prefixo: '/pendencias', titulo: 'Sincronização', sub: 'O que ainda não subiu para o servidor' },
];

export function tituloDaRota(pathname: string): { titulo: string; sub: string } {
  const hit = TITULOS_ROTA.find((t) => pathname.startsWith(t.prefixo));
  return hit ?? { titulo: 'NR-13', sub: '' };
}
