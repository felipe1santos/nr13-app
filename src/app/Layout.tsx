import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { isMestre, isTrial, logout, papelAtual, usuarioLogado } from '../services/auth';
import BarraTrial from '../components/BarraTrial';
import BarraAssinatura from '../components/BarraAssinatura';
import ModalAviso from '../components/ModalAviso';
import SeloSync from '../components/SeloSync';
import { listarChavesComPrefixo } from '../services/storage';
import {
  sucessoPendente,
  marcarSucessoExibido,
  statusAssinaturaLocal,
  obterUrlCheckout,
} from '../services/assinatura';
import { emitirAviso } from '../services/eventos';
import { instalarBloqueioImpressao } from '../services/bloqueioImpressao';
import { modulosDoUsuarioAtual } from '../services/permissoes';
import { ITENS_TOPO, ITENS_CADASTRAR, ITENS_BAIXO, ITEM_ACESSOS, ITEM_MEUS_DADOS, tituloDaRota } from './menu';
import type { ItemMenu } from './menu';
import MenuUsuario from './MenuUsuario';
import SyncStatus from './SyncStatus';
import ModalTrocarSenha from '../components/ModalTrocarSenha';
import ModalTermos from '../components/ModalTermos';
import './layout.css';

const ROTULO_PAPEL: Record<string, string> = {
  mestre: 'Administrador',
  gerente: 'Gerente',
  funcionario: 'Inspetor',
  cliente: 'Cliente',
  '': 'Administrador',
};

function iniciais(email: string | null): string {
  if (!email) return '·';
  const nome = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const partes = nome.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return nome.slice(0, 2).toUpperCase() || '·';
}

// Dias até o acesso do usuário expirar (nr13_acesso_expira_em gravada no login).
// null = sem expiração cadastrada.
function diasParaExpirar(): number | null {
  const raw = localStorage.getItem('nr13_acesso_expira_em');
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function ultimoLoginTexto(): string | null {
  const raw = localStorage.getItem('nr13_ultimo_login');
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  const mesmaData = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmaData ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR')} às ${hora}`;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(
    () => location.pathname.startsWith('/funcionarios') || location.pathname.startsWith('/empresas'),
  );
  const [temAlerta, setTemAlerta] = useState(false);
  const [modalSenha, setModalSenha] = useState(false);
  const email = usuarioLogado();
  const papel = ROTULO_PAPEL[papelAtual()] ?? 'Administrador';
  const nEquip = listarChavesComPrefixo('nr13_info_').length;
  const { titulo, sub } = tituloDaRota(location.pathname);

  // Permissões por sub-login (tela Acessos): null = sem restrição (mestre/legado).
  const modulosPermitidos = useMemo(() => modulosDoUsuarioAtual(), []);
  const permitido = (id: string) => modulosPermitidos === null || modulosPermitidos.includes(id as never);
  const itensTopo = ITENS_TOPO.filter((i) => permitido(i.id));
  const itensCadastrar = ITENS_CADASTRAR.filter((i) => permitido(i.id));
  const itensBaixo = ITENS_BAIXO.filter((i) => permitido(i.id));

  // Guard leve de rota: usuário com permissões restritas que cair numa rota
  // não permitida é levado ao primeiro módulo permitido.
  useEffect(() => {
    if (modulosPermitidos === null) return;
    const mapa: [string, string][] = [
      ['/dashboard', 'dashboard'],
      ['/vencimentos', 'vencimentos'],
      ['/equipamento', 'equipamentos'],
      ['/inspecoes', 'inspecoes'],
      ['/relatorios', 'relatorios'],
      ['/prontuarios', 'prontuarios'],
      ['/calibracoes', 'calibracoes'],
      ['/certificados', 'certificados'],
      ['/livro-registro', 'livro'],
      ['/funcionarios', 'funcionarios'],
      ['/empresas', 'clientes'],
      ['/minha-empresa', '__mestre__'],
      ['/acesso', '__mestre__'],
    ];
    const hit = mapa.find(([prefixo]) => location.pathname.startsWith(prefixo));
    if (!hit) return;
    const ok = hit[1] !== '__mestre__' && modulosPermitidos.includes(hit[1] as never);
    if (!ok) {
      const destinos: Record<string, string> = {
        dashboard: '/dashboard', vencimentos: '/vencimentos', equipamentos: '/equipamentos',
        inspecoes: '/inspecoes', relatorios: '/relatorios', prontuarios: '/prontuarios',
        calibracoes: '/calibracoes', certificados: '/certificados',
        livro: '/livro-registro', funcionarios: '/funcionarios',
        clientes: '/empresas',
      };
      const primeiro = modulosPermitidos[0];
      navigate(primeiro ? destinos[primeiro] : '/inspecoes', { replace: true });
    }
  }, [location.pathname, modulosPermitidos, navigate]);

  useEffect(() => {
    // Sino: acende quando o motor de vencimentos encontra item vencido. Recalcula quando os
    // DADOS mudam (assinarDadosAlterados), não a cada navegação — listarVencimentos varre e
    // parseia todos os equipamentos e rodava em toda troca de rota, travando o clique no menu.
    let vivo = true;
    let cancelarAssinatura = () => {};
    Promise.all([import('../services/vencimentos'), import('../services/eventos')])
      .then(([venc, eventos]) => {
        if (!vivo) return;
        const atualizar = () => setTemAlerta(venc.listarVencimentos().some((i) => i.status === 'crit'));
        atualizar();
        cancelarAssinatura = eventos.assinarDadosAlterados(atualizar);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      cancelarAssinatura();
    };
  }, []);

  // Aviso de sucesso para quem fechou a aba do checkout (ou o app) antes do polling do
  // ModalAssinatura terminar e voltou depois: o webhook já gravou "ativa" no servidor e
  // o login/carregarPerfil já espelhou isso no localStorage antes deste Layout montar —
  // só falta mostrar o aviso UMA vez (marcarSucessoExibido evita repetir a cada navegação).
  // Aquece o cache do link do checkout: os botões "Regularizar" dos bloqueios (ModalAviso,
  // emitido por serviços) abrem a aba SEM await, para não morrer no bloqueador de popup.
  useEffect(() => {
    void obterUrlCheckout();
  }, []);

  // Bloqueio de impressão (trial/assinatura suspensa): Ctrl+P + classe no <html> consumida
  // pela regra @media print (styles/forja.css). Instala uma vez para o app inteiro — o Layout
  // é o único ponto montado em toda rota autenticada (ver BarraTrial/BarraAssinatura/ModalAviso
  // logo abaixo, mesmo padrão de "serviço global montado aqui").
  useEffect(() => instalarBloqueioImpressao(), []);

  useEffect(() => {
    if (!sucessoPendente()) return;
    if (statusAssinaturaLocal() !== 'ativa') return;
    marcarSucessoExibido();
    emitirAviso({
      variante: 'sucesso',
      titulo: 'Assinatura confirmada!',
      texto: 'Pagamento aprovado. Salvar, imprimir e gerar documentos já estão liberados.',
    });
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function fecharDrawer() {
    setMenuAberto(false);
  }

  function NavItem({ item, sub: isSub }: { item: ItemMenu; sub?: boolean }) {
    return (
      <NavLink
        to={item.to}
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${isSub ? ' subitem' : ''}`}
        onClick={fecharDrawer}
      >
        <span className="left">
          <Icone nome={item.icone} />
          <span className="menu-text">{item.label}</span>
        </span>
        {item.id === 'equipamentos' && nEquip > 0 && <span className="nav-count">{nEquip}</span>}
      </NavLink>
    );
  }

  return (
    <div className="app-layout">
      <div className="shell">
        {menuAberto && <div className="sidebar-backdrop" onClick={fecharDrawer} />}

        {/* ===== SIDEBAR (escura, Forja) ===== */}
        <aside className={`sidebar${menuAberto ? ' aberta' : ''}`}>
          <div className="brand">
            <img className="brand-logo" src="/logo-marca.png" alt="" aria-hidden="true" />
            <div>
              <div className="brand-name">NR13</div>
              <div className="brand-sub">Engenharia &amp; Ativos</div>
            </div>
          </div>

          <nav className="nav-list">
            {isMestre() && <NavItem item={ITEM_MEUS_DADOS} />}
            {itensTopo.map((item) => (
              <NavItem key={item.id} item={item} />
            ))}

            {itensCadastrar.length > 0 && (
              <>
                <button
                  type="button"
                  className={`nav-item nav-toggle${cadastrarAberto ? ' expanded' : ''}`}
                  onClick={() => setCadastrarAberto((a) => !a)}
                >
                  <span className="left">
                    <Icone nome="userplus" />
                    <span className="menu-text">Cadastrar</span>
                  </span>
                  <Icone nome="chevdown" className="chev" tam={15} />
                </button>
                <div className={`subnav${cadastrarAberto ? ' open' : ''}`}>
                  {itensCadastrar.map((item) => (
                    <NavItem key={item.id} item={item} sub />
                  ))}
                </div>
              </>
            )}

            {itensBaixo.map((item) => (
              <NavItem key={item.id} item={item} />
            ))}
            {isMestre() && <NavItem item={ITEM_ACESSOS} />}
          </nav>

          <div className="nav-spacer" />
          <div className="nav-divider" />
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setModalSenha(true);
              fecharDrawer();
            }}
          >
            <span className="left">
              <Icone nome="key" />
              <span className="menu-text">Trocar Senha</span>
            </span>
          </button>
          <button type="button" className="nav-item danger" onClick={handleLogout}>
            <span className="left">
              <Icone nome="logout" />
              <span className="menu-text">Sair</span>
            </span>
          </button>

          <div className="sidebar-foot">
            <div className="avatar">{iniciais(email)}</div>
            <div className="foot-info">
              <div className="foot-name" title={email ?? ''}>{email ?? '—'}</div>
              <div className="foot-role">{papel}</div>
            </div>
          </div>
        </aside>

        {/* ===== MAIN ===== */}
        <div className="main">
          <BarraTrial />
          <BarraAssinatura />
          <ModalAviso />
          <header className="topbar">
            <div className="topbar-left">
              <button
                type="button"
                className="btn-hamburguer"
                onClick={() => setMenuAberto((a) => !a)}
                aria-label="Abrir menu"
                aria-expanded={menuAberto}
              >
                <span /><span /><span />
              </button>
              <div>
                <h1>{titulo}</h1>
                {sub && <div className="path">{sub}</div>}
              </div>
            </div>

            <div className="top-status">
              <SyncStatus />
              <SeloSync />
              {ultimoLoginTexto() && (
                <span className="login-info">
                  <Icone nome="clock" tam={14} />
                  Último login: {ultimoLoginTexto()}
                </span>
              )}
              <span className="divider-v" />
              <MenuUsuario
                iniciais={iniciais(email)}
                email={email}
                papel={papel}
                temAlerta={temAlerta}
                onNotificacoes={() => navigate('/dashboard')}
              />
            </div>
          </header>

          <main className="main-content">
            {(() => {
              // Conta trial: a BarraTrial acima substitui este aviso.
              if (isTrial()) return null;
              const dias = diasParaExpirar();
              if (dias === null || dias > 30 || dias < 0) return null;
              return (
                <div className="aviso-expiracao" role="alert">
                  <Icone nome="alerttri" tam={16} />
                  {dias === 0
                    ? 'Seu acesso ao sistema vence HOJE. Contate o administrador para renovar.'
                    : `Faltam ${dias} dia${dias === 1 ? '' : 's'} para o seu acesso ao sistema vencer. Contate o administrador para renovar.`}
                </div>
              );
            })()}
            <div key={location.pathname} className="nr-anim-in route-wrapper">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {modalSenha && email && <ModalTrocarSenha email={email} onClose={() => setModalSenha(false)} />}
      {/* Boas-vindas + termos de uso: obrigatório no 1º acesso do período de teste */}
      {isTrial() && <ModalTermos />}
    </div>
  );
}
