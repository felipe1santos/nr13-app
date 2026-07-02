import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { logout, usuarioLogado } from '../../services/auth';
import { carregarDadosPortal } from '../../features/portal/portalService';
import { ler } from '../../services/storage';
import './portal.css';

export interface ContextoPortal {
  tags: string[];
}

// Layout do Portal do Cliente: topo enxuto (logo da executante + sair), sem a
// sidebar de ferramentas internas. Somente leitura por construção (RLS + Edge).
export default function PortalLayout() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const email = usuarioLogado();

  useEffect(() => {
    carregarDadosPortal()
      .then((r) => setTags(r.tags))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  async function sair() {
    await logout();
    navigate('/login');
  }

  const minhaEmpresa = ler<{ logo?: string; razaoSocial?: string }>('nr13_minha_empresa');

  return (
    <div className="portal-layout">
      <header className="portal-topbar">
        <div className="portal-topbar-marca">
          {minhaEmpresa?.logo ? (
            <img src={minhaEmpresa.logo} alt="Logo" className="portal-logo" />
          ) : (
            <span className="portal-logo-fallback" />
          )}
          <div>
            <span className="portal-titulo">Portal do Cliente</span>
            <span className="portal-subtitulo">{minhaEmpresa?.razaoSocial ?? 'Documentação NR-13'}</span>
          </div>
        </div>
        <div className="portal-topbar-acoes">
          {email && <span className="portal-email">{email}</span>}
          <button type="button" className="btn-logout" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <main className="portal-main">
        {erro ? (
          <p className="erro-form" style={{ margin: 24 }}>{erro}</p>
        ) : tags === null ? (
          <div className="portal-carregando">
            <span className="spinner" /> Carregando seus equipamentos...
          </div>
        ) : (
          <Outlet context={{ tags } satisfies ContextoPortal} />
        )}
      </main>
    </div>
  );
}
