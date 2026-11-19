import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone, type NomeIcone } from '../components/Icone';
import BotaoInstalarPWA from './BotaoInstalarPWA';

/** Atalho do painel da conta: só aparece se o usuário tem a tela. */
export interface AtalhoConta {
  to: string;
  rotulo: string;
  icone: NomeIcone;
  /** Cor do ícone (tile): cada atalho tem a sua, como no protótipo Cobalto. */
  cor: string;
  fundo: string;
}

/**
 * Chip do usuário no topo e o painel da conta (redesign Cobalto, 18/11/2026).
 *
 * Painel no padrão SimplesDental: cabeçalho no azul de destaque com nome,
 * e-mail e papel; informações da sessão; acesso rápido (Meus dados, Acessos,
 * Equipe, Trocar senha); e SAIR no rodapé, em vermelho. Trocar senha e Sair
 * saíram do rodapé da sidebar e moram aqui. Notificações e "Instalar app"
 * continuam no painel — nada que existia sumiu.
 */
export default function MenuUsuario({
  iniciais,
  email,
  papel,
  temAlerta,
  ultimoLogin,
  atalhos,
  onNotificacoes,
  onTrocarSenha,
  onSair,
}: {
  iniciais: string;
  email: string | null;
  papel: string;
  temAlerta: boolean;
  ultimoLogin?: string | null;
  atalhos: AtalhoConta[];
  onNotificacoes: () => void;
  onTrocarSenha: () => void;
  onSair: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const nome = email ? email.split('@')[0] : '—';

  useEffect(() => {
    if (!aberto) return;
    painel.current?.focus({ preventScroll: true });
    const aoClicarFora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoEsc);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoEsc);
    };
  }, [aberto]);

  const fecharE = (fn: () => void) => () => {
    setAberto(false);
    fn();
  };

  return (
    <div className="menu-usuario" ref={caixa}>
      <button
        ref={botao}
        type="button"
        className={`user-chip${aberto ? ' aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        title={email ?? ''}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label="Sua conta"
      >
        <span className="avatar">
          {iniciais}
          {temAlerta && <span className="avatar-dot" />}
        </span>
        <span className="user-chip-txt">
          <span className="name">{nome}</span>
        </span>
        <Icone nome="chevdown" tam={14} className="user-chip-chev" />
      </button>

      {aberto && (
        <div className="um" role="dialog" aria-label="Sua conta" tabIndex={-1} ref={painel}>
          <div className="um-h">
            <span className="avatar um-av">{iniciais}</span>
            <div className="um-id">
              <b>{nome}</b>
              <small title={email ?? ''}>{email ?? '—'}</small>
              <span className="um-papel">{papel}</span>
            </div>
          </div>

          <dl className="um-dl">
            {ultimoLogin && (
              <div>
                <dt>Último acesso</dt>
                <dd>{ultimoLogin}</dd>
              </div>
            )}
            <div>
              <dt>Sessão</dt>
              <dd className="um-ok">
                <i />
                Ativa neste aparelho
              </dd>
            </div>
          </dl>

          <div className="um-q" role="group" aria-label="Acesso rápido">
            <span className="um-rot">Acesso rápido</span>
            {atalhos.map((a) => (
              <button key={a.to} type="button" className="um-it" onClick={fecharE(() => navigate(a.to))}>
                <span className="um-ci" style={{ color: a.cor, background: a.fundo }}>
                  <Icone nome={a.icone} tam={17} />
                </span>
                {a.rotulo}
              </button>
            ))}
            <button type="button" className="um-it" onClick={fecharE(onTrocarSenha)}>
              <span className="um-ci" style={{ color: '#A15C00', background: '#FFF4E0' }}>
                <Icone nome="key" tam={17} />
              </span>
              Trocar senha
            </button>
            <button type="button" className="um-it" onClick={fecharE(onNotificacoes)}>
              <span className="um-ci" style={{ color: '#B42318', background: '#FEE4E2' }}>
                <Icone nome="bell" tam={17} />
              </span>
              Notificações
              <span className={`menu-conta-tag${temAlerta ? ' crit' : ''}`}>{temAlerta ? 'Vencidos' : 'Sem alertas'}</span>
            </button>
            <BotaoInstalarPWA variante="item" aoConcluir={() => setAberto(false)} />
          </div>

          <footer className="um-f">
            <button type="button" className="um-sair" onClick={fecharE(onSair)}>
              <Icone nome="logout" tam={17} />
              Sair
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
