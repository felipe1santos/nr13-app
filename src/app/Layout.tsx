import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileText,
  Gauge,
  BookOpenText,
  KeyRound,
  Users,
} from 'lucide-react';
import { isMestre, logout, usuarioLogado } from '../services/auth';
import { useNavigate } from 'react-router-dom';
import BotaoInstalarPWA from './BotaoInstalarPWA';
import SyncStatus from './SyncStatus';
import './layout.css';

// Ícones profissionais (lucide-react) — traço 1.9 casa com a estética Firecrawl.
const TAM_ICONE = 19;

const ICONE_MINHA_EMPRESA = <Briefcase size={TAM_ICONE} strokeWidth={1.9} />;

const MENU = [
  { to: '/dashboard', label: 'Equipamentos', icone: <Boxes size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/inspecoes', label: 'Inspeções', icone: <ClipboardCheck size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/relatorios', label: 'Relatórios', icone: <FileText size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/prontuarios', label: 'Prontuários', icone: <BookOpenText size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/calibracoes', label: 'Calibrações', icone: <Gauge size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/empresas', label: 'Empresas', icone: <Building2 size={TAM_ICONE} strokeWidth={1.9} /> },
  { to: '/funcionarios', label: 'Funcionários', icone: <Users size={TAM_ICONE} strokeWidth={1.9} /> },
];

// "Acesso" (gestão de sub-logins): só a conta principal (mestre) enxerga.
const ITEM_ACESSO = { to: '/acesso', label: 'Acesso', icone: <KeyRound size={TAM_ICONE} strokeWidth={1.9} /> };

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [colapsada, setColapsada] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const email = usuarioLogado();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      <header className="top-bar-system">
        <div className="top-bar-left">
          <button
            type="button"
            className="btn-hamburguer"
            onClick={() => setMenuAberto((a) => !a)}
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
          >
            <span /><span /><span />
          </button>
          <span className="logo">NR-13</span>
        </div>
        <div className="top-bar-right">
          <SyncStatus />
          {email && (
            <span className="user-info-top">
              <span className="user-email">{email}</span>
            </span>
          )}
          <BotaoInstalarPWA />
          <button type="button" className="btn-logout" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>
      <div className="app-body">
        {menuAberto && <div className="sidebar-backdrop" onClick={() => setMenuAberto(false)} />}
        <nav className={`sidebar ${colapsada ? 'collapsed' : ''} ${menuAberto ? 'aberta' : ''}`}>
          <NavLink
            to="/minha-empresa"
            className={({ isActive }) => `sidebar-minha-empresa${isActive ? ' active' : ''}`}
            title="Minha Empresa"
            onClick={() => setMenuAberto(false)}
          >
            <span className="menu-icon">{ICONE_MINHA_EMPRESA}</span>
            <span className="menu-text">Minha Empresa</span>
          </NavLink>
          <div className="sidebar-divider" />
          {(isMestre() ? [...MENU, ITEM_ACESSO] : MENU).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
              onClick={() => setMenuAberto(false)}
            >
              <span className="menu-icon">{item.icone}</span>
              <span className="menu-text">{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="btn-collapse-sidebar"
            onClick={() => setColapsada((c) => !c)}
            aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
          >
            {colapsada ? '›' : '‹'}
          </button>
        </nav>
        <main className="main-content">
          <div key={location.pathname} className="nr-anim-in route-wrapper">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
