import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import type { NomeIcone } from '../components/Icone';
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
import {
  ITENS_TOPO,
  ITENS_CADASTRAR,
  ITENS_BAIXO,
  ITEM_ACESSOS,
  ITEM_MEUS_DADOS,
  GRUPOS_MENU,
  itensDoGrupo,
  itensSemGrupo,
  tituloDaRota,
} from './menu';
import type { ItemMenu } from './menu';
import MenuUsuario from './MenuUsuario';
import SyncStatus from './SyncStatus';
import ModalTrocarSenha from '../components/ModalTrocarSenha';
import ModalTermos from '../components/ModalTermos';
import { SubmenuContexto } from './submenu';
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

/**
 * Preferência do MENU (shell v5): o submenu recolhido. É conveniência DESTE
 * aparelho, por isso `localStorage` direto e fora do prefixo `nr13_` — que é o
 * das chaves de dado, sincronizadas e purgadas pela v2. Leitura e escrita
 * protegidas: em aba privada ou com o armazenamento bloqueado, o menu só não
 * lembra.
 */
const CHAVE_MENU_RECOLHIDO = 'forja.menu.recolhido';

function lerPreferencia(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarPreferencia(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: o menu só não lembra na próxima visita */
  }
}

/**
 * Uma entrada do TRILHO de ícones (shell v5). Os módulos de operação são uma
 * entrada cada; Documentos, Instrumentos e Cadastros são GRUPOS, e as páginas
 * deles aparecem no submenu. Os ids de permissão são os de sempre — o trilho é
 * só outra apresentação de `ITENS_TOPO`/`ITENS_BAIXO`/`GRUPOS_MENU`.
 */
interface EntradaTrilho {
  id: string;
  rotulo: string;
  icone: NomeIcone;
  itens: ItemMenu[];
}

/** Rótulo curto no trilho (cabe em 76px, embaixo do ícone). */
const ROTULO_TRILHO: Record<string, string> = { dashboard: 'Painel' };
const ICONE_GRUPO: Record<string, NomeIcone> = { documentos: 'filetext', instrumentos: 'gauge', cadastros: 'users' };

/** A ficha (`/equipamento/X`) e os vencimentos pertencem a um módulo sem ter a rota dele. */
function rotaPertence(pathname: string, item: ItemMenu): boolean {
  if (pathname.startsWith(item.to)) return true;
  if (item.id === 'equipamentos') return pathname.startsWith('/equipamento/');
  if (item.id === 'dashboard') return pathname.startsWith('/vencimentos');
  return false;
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
  const [temAlerta, setTemAlerta] = useState(false);
  const [modalSenha, setModalSenha] = useState(false);
  const [recolhida, setRecolhida] = useState(() => lerPreferencia(CHAVE_MENU_RECOLHIDO) === '1');
  // Submenu: o nó do portal e quantas telas estão pondo conteúdo nele.
  const [alvoSubmenu, setAlvoSubmenu] = useState<HTMLElement | null>(null);
  const [nConteudoSubmenu, setNConteudoSubmenu] = useState(0);
  const registrarSubmenu = useCallback(() => {
    setNConteudoSubmenu((n) => n + 1);
    return () => setNConteudoSubmenu((n) => n - 1);
  }, []);
  const contextoSubmenu = useMemo(
    () => ({ alvo: alvoSubmenu, registrar: registrarSubmenu }),
    [alvoSubmenu, registrarSubmenu],
  );
  const email = usuarioLogado();
  const papel = ROTULO_PAPEL[papelAtual()] ?? 'Administrador';
  // Contagem do selo do menu. Nasce da contagem local (instantânea, e correta
  // no caminho de sempre) e é substituída pelo total do painel assim que ele
  // responde — sob `boot_v9` o cache não tem a organização e a local daria zero.
  const [nEquip, setNEquip] = useState(() => listarChavesComPrefixo('nr13_info_').length);
  const { titulo, sub } = tituloDaRota(location.pathname);

  // Permissões por sub-login (tela Acessos): null = sem restrição (mestre/legado).
  const modulosPermitidos = useMemo(() => modulosDoUsuarioAtual(), []);
  const permitido = (id: string) => modulosPermitidos === null || modulosPermitidos.includes(id as never);
  const itensTopo = ITENS_TOPO.filter((i) => permitido(i.id));
  const itensCadastrar = ITENS_CADASTRAR.filter((i) => permitido(i.id));
  // `info` é a exceção: a central de ajuda não é um módulo de operação e não
  // se esconde de ninguém. Ver o comentário em `menu.ts`.
  const itensBaixo = ITENS_BAIXO.filter((i) => i.id === 'info' || permitido(i.id));

  // Guard leve de rota: usuário com permissões restritas que cair numa rota
  // não permitida é levado ao primeiro módulo permitido.
  useEffect(() => {
    if (modulosPermitidos === null) return;
    const mapa: [string, string][] = [
      ['/dashboard', 'dashboard'],
      ['/agenda', 'agenda'],
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
        dashboard: '/dashboard', agenda: '/agenda', vencimentos: '/vencimentos', equipamentos: '/equipamentos',
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
    //
    // Fase 9 · passou por `carregarPainel`, que escolhe a fonte: cache local, ou o agregado
    // do servidor sob `boot_v9`. Com o boot leve, contar no cache daria zero e o sino nunca
    // acenderia — a conta com equipamento vencido não receberia aviso nenhum. E é do
    // CONTADOR da organização que ele decide, não da lista, que vem truncada.
    let vivo = true;
    let cancelarAssinatura = () => {};
    Promise.all([import('../services/vencimentosServidor'), import('../services/eventos')])
      .then(([painel, eventos]) => {
        if (!vivo) return;
        // 9F.5.3 · a montagem não força: `Layout` e a página pedem o mesmo
        // agregado com milissegundos de diferença, e era daí que saía a SEGUNDA
        // chamada de `vencimentos_org` por boot. A recarga por dado alterado
        // força, porque aí o número de antes está errado por definição.
        const atualizar = (forcar = false) => {
          void painel.carregarPainel(new Date(), { forcar }).then((p) => {
            if (!vivo) return;
            // Contador INDEFINIDO = o servidor não respondeu (25/08/2026).
            // Aqui, diferente dos KPIs do painel, existe uma fonte local
            // legítima: o valor que já está na tela, semeado das chaves do
            // cache. Sobrescrevê-lo com zero apagaria o "4" do menu lateral
            // numa queda de rede — e o menu vazio é a cara do sumiço de dados.
            // Não saber é motivo para NÃO mexer, não para zerar.
            if (p.kpis.vencidos !== undefined) setTemAlerta(p.kpis.vencidos > 0);
            if (p.kpis.total !== undefined) setNEquip(p.kpis.total);
          });
        };
        atualizar();
        cancelarAssinatura = eventos.assinarDadosAlterados(() => atualizar(true));
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

  function alternarRecolhida() {
    setRecolhida((r) => {
      gravarPreferencia(CHAVE_MENU_RECOLHIDO, r ? '0' : '1');
      return !r;
    });
  }

  const itensPermitidos = [...itensTopo, ...itensBaixo];
  const soltos = itensSemGrupo(itensPermitidos);
  const itensAjuda = itensBaixo.filter((i) => i.id === 'info');

  // ── O trilho ──────────────────────────────────────────────────────────────
  const entradas: EntradaTrilho[] = [
    ...itensTopo.map((i) => ({ id: i.id, rotulo: ROTULO_TRILHO[i.id] ?? i.label, icone: i.icone, itens: [i] })),
    ...GRUPOS_MENU.filter((g) => g.id !== 'operacao').flatMap((g) => {
      const itens = itensDoGrupo(g, itensPermitidos);
      return itens.length ? [{ id: g.id, rotulo: g.rotulo, icone: ICONE_GRUPO[g.id] ?? 'grid', itens }] : [];
    }),
    ...soltos.map((i) => ({ id: i.id, rotulo: i.label, icone: i.icone, itens: [i] })),
  ];
  // Cadastros: "Meus dados" e Acessos são do mestre e não passam pelo filtro de
  // permissão. O grupo abre também para o mestre que só tem Acessos.
  const itensDeCadastro: ItemMenu[] = [
    ...(isMestre() ? [ITEM_MEUS_DADOS] : []),
    ...itensCadastrar,
    ...(isMestre() ? [ITEM_ACESSOS] : []),
  ];
  if (itensCadastrar.length > 0 || isMestre()) {
    entradas.push({ id: 'cadastros', rotulo: 'Cadastros', icone: ICONE_GRUPO.cadastros, itens: itensDeCadastro });
  }
  const entradaAtiva = entradas.find((e) => e.itens.some((i) => rotaPertence(location.pathname, i)));
  const grupoAtivo = entradaAtiva && entradaAtiva.itens.length > 1 ? entradaAtiva : null;
  const submenuVisivel = !recolhida && (grupoAtivo !== null || nConteudoSubmenu > 0);
  // Barra inferior do celular: os quatro primeiros módulos + "Menu" (a gaveta).
  const entradasBarra = entradas.slice(0, 4);

  function EntradaDoTrilho({ e }: { e: EntradaTrilho }) {
    const ativa = entradaAtiva?.id === e.id;
    return (
      <NavLink
        to={e.itens[0].to}
        className={`trilho-item${ativa ? ' active' : ''}`}
        aria-current={ativa ? 'page' : undefined}
        onClick={() => {
          fecharDrawer();
          // Clicar no módulo aberto com o submenu recolhido o reabre.
          if (ativa && recolhida) alternarRecolhida();
        }}
      >
        <span className="trilho-ico">
          <Icone nome={e.icone} />
          {e.id === 'dashboard' && temAlerta && <span className="trilho-alerta" aria-label="Há vencidos" />}
        </span>
        <span className="trilho-rot">{e.rotulo}</span>
      </NavLink>
    );
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
    <SubmenuContexto.Provider value={contextoSubmenu}>
    <div className="app-layout">
      {/* ===== TOPO escuro (shell v5): marca, título da rota, sincronização e
          conta, numa linha de 48px. O subtítulo da rota é a dica do título. */}
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
          <div className="brand">
            <img className="brand-logo" src="/logo-marca.png" alt="" aria-hidden="true" />
            <div className="brand-txt">
              <div className="brand-name">NR13</div>
              <div className="brand-sub">Engenharia &amp; Ativos</div>
            </div>
          </div>
          <span className="topbar-sep" aria-hidden="true" />
          <h1 title={sub || undefined}>{titulo}</h1>
        </div>

        <div className="top-status">
          <SyncStatus />
          <SeloSync />
          <MenuUsuario
            iniciais={iniciais(email)}
            email={email}
            papel={papel}
            temAlerta={temAlerta}
            ultimoLogin={ultimoLoginTexto()}
            onNotificacoes={() => navigate('/dashboard')}
            onTrocarSenha={() => setModalSenha(true)}
            onSair={handleLogout}
          />
        </div>
      </header>

      <div className={`shell${recolhida ? ' menu-recolhido' : ''}`}>
        {menuAberto && <div className="sidebar-backdrop" onClick={fecharDrawer} />}

        {/* ===== MENU (shell v5): trilho de ícones + submenu do módulo =====
            No celular os dois viram a gaveta, aberta pelo hambúrguer ou pelo
            "Menu" da barra inferior. */}
        <aside className={`sidebar${menuAberto ? ' aberta' : ''}`} aria-label="Navegação principal">
          <nav className="trilho" aria-label="Módulos">
            {entradas.map((e) => (
              <EntradaDoTrilho key={e.id} e={e} />
            ))}
            <span className="trilho-espaco" />
            {itensAjuda.map((item) => (
              <EntradaDoTrilho key={item.id} e={{ id: item.id, rotulo: 'Ajuda', icone: item.icone, itens: [item] }} />
            ))}
          </nav>

          <div className={`submenu${submenuVisivel ? '' : ' submenu-oculto'}`}>
            <div className="submenu-topo">
              <h2>{entradaAtiva?.rotulo === 'Painel' ? 'Painel' : entradaAtiva?.rotulo ?? titulo}</h2>
              <button
                type="button"
                className="btn-recolher"
                onClick={alternarRecolhida}
                aria-label="Recolher menu"
                title="Recolher menu"
              >
                <Icone nome="chevleft" tam={16} />
              </button>
            </div>

            {grupoAtivo && grupoAtivo.id !== 'cadastros' && (
              <nav className="nav-list" aria-label={grupoAtivo.rotulo}>
                {grupoAtivo.itens.map((item) => (
                  <NavItem key={item.id} item={item} />
                ))}
              </nav>
            )}

            {/* Cadastros: "Meus dados" (a empresa executante), Funcionários,
                Clientes e Acessos — os logins da equipe são cadastro da mesma
                natureza, e é aqui que se procura "criar um login para o meu
                técnico". */}
            {grupoAtivo?.id === 'cadastros' && (itensCadastrar.length > 0 || isMestre()) && (
              <nav className={`subnav nav-list`} aria-label="Cadastros">
                {isMestre() && <NavItem item={ITEM_MEUS_DADOS} sub />}
                {itensCadastrar.map((item) => (
                  <NavItem key={item.id} item={item} sub />
                ))}
                {isMestre() && <NavItem item={ITEM_ACESSOS} sub />}
              </nav>
            )}

            {/* Conteúdo da tela aberta (ConteudoSubmenu), por portal. */}
            <div className="submenu-slot" ref={setAlvoSubmenu} />
          </div>
        </aside>

        {/* ===== MAIN ===== */}
        <div className="main">
          <BarraTrial />
          <BarraAssinatura />
          <ModalAviso />
          <main className="main-content">
            {(() => {
              // Conta trial: a BarraTrial acima substitui este aviso.
              if (isTrial()) return null;
              const dias = diasParaExpirar();
              if (dias === null || dias > 30 || dias < 0) return null;
              return (
                /* 10/09/2026 · a frase virou DUAS: o fato e a instrução. No
                   celular medi 62 px e três linhas para um aviso — a instrução
                   sai e sobra a barra de uma linha, com o fato inteiro. Em
                   tela larga as duas continuam juntas. */
                <div className="aviso-expiracao" role="alert">
                  <Icone nome="alerttri" tam={16} />
                  <span className="aviso-expiracao-fato">
                    {dias === 0
                      ? 'Seu acesso vence HOJE'
                      : `Faltam ${dias} dia${dias === 1 ? '' : 's'} para o seu acesso vencer`}
                  </span>
                  <span className="aviso-expiracao-instrucao">
                    Contate o administrador para renovar.
                  </span>
                </div>
              );
            })()}
            <div key={location.pathname} className="nr-anim-in route-wrapper">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* ===== Barra inferior (só no celular): módulos de campo + a gaveta ===== */}
      <nav className="barra-inferior" aria-label="Módulos">
        {entradasBarra.map((e) => (
          <EntradaDoTrilho key={e.id} e={e} />
        ))}
        <button
          type="button"
          className={`trilho-item${menuAberto ? ' active' : ''}`}
          onClick={() => setMenuAberto((a) => !a)}
          aria-expanded={menuAberto}
        >
          <span className="trilho-ico"><Icone nome="menu" /></span>
          <span className="trilho-rot">Menu</span>
        </button>
      </nav>

      {modalSenha && email && <ModalTrocarSenha email={email} onClose={() => setModalSenha(false)} />}
      {/* Boas-vindas + termos de uso: obrigatório no 1º acesso do período de teste */}
      {isTrial() && <ModalTermos />}
    </div>
    </SubmenuContexto.Provider>
  );
}
