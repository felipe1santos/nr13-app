import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout, usuarioLogado } from '../services/auth';
import { useNavigate } from 'react-router-dom';
import BotaoInstalarPWA from './BotaoInstalarPWA';
import './layout.css';

const ICONE_EQUIPAMENTOS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
  </svg>
);

const ICONE_INSPECOES = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

const ICONE_RELATORIOS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
);

const ICONE_CALIBRACOES = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
    <path d="m14 9-2 2 2 2M10 13l2-2-2-2" />
  </svg>
);

const ICONE_PRONTUARIOS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
);

const ICONE_EMPRESAS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ICONE_MINHA_EMPRESA = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="12.01" />
    <path d="M8 12h.01M16 12h.01M12 16h.01M8 16h.01M16 16h.01" />
  </svg>
);

const MENU = [
  { to: '/dashboard', label: 'Equipamentos', icone: ICONE_EQUIPAMENTOS },
  { to: '/inspecoes', label: 'Inspeções', icone: ICONE_INSPECOES },
  { to: '/relatorios', label: 'Relatórios', icone: ICONE_RELATORIOS },
  { to: '/prontuarios', label: 'Prontuários', icone: ICONE_PRONTUARIOS },
  { to: '/calibracoes', label: 'Calibrações', icone: ICONE_CALIBRACOES },
  { to: '/empresas', label: 'Empresas', icone: ICONE_EMPRESAS },
];

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
          {MENU.map((item) => (
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
