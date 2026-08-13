import { useEffect, useRef, useState } from 'react';
import { Icone } from '../components/Icone';
import BotaoInstalarPWA from './BotaoInstalarPWA';

/**
 * Chip do usuário (iniciais) que abre o menu da conta.
 *
 * O sino de alertas e o botão de instalar o app moravam soltos na topbar. Em
 * tela de celular isso enfileirava quatro botões ao lado do título e sobrava
 * espaço para nada — agora vivem aqui dentro. O ponto vermelho continua no
 * chip: alerta que só aparece depois de abrir o menu não é alerta.
 */
export default function MenuUsuario({
  iniciais,
  email,
  papel,
  temAlerta,
  onNotificacoes,
}: {
  iniciais: string;
  email: string | null;
  papel: string;
  temAlerta: boolean;
  onNotificacoes: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoEsc);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoEsc);
    };
  }, [aberto]);

  return (
    <div className="menu-usuario" ref={caixa}>
      <button
        type="button"
        className={`user-chip${aberto ? ' aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        title={email ?? ''}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu da conta"
      >
        <span className="avatar">
          {iniciais}
          {temAlerta && <span className="avatar-dot" />}
        </span>
        <span className="user-chip-txt">
          <span className="name">{email ? email.split('@')[0] : '—'}</span>
          <span className="role">{papel}</span>
        </span>
        <Icone nome="chevdown" tam={14} className="user-chip-chev" />
      </button>

      {aberto && (
        <div className="menu-conta" role="menu">
          <div className="menu-conta-topo">
            <div className="menu-conta-email" title={email ?? ''}>{email ?? '—'}</div>
            <div className="menu-conta-papel">{papel}</div>
          </div>

          <button
            type="button"
            className="menu-conta-item"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              onNotificacoes();
            }}
          >
            <Icone nome="bell" tam={16} />
            <span>Notificações</span>
            <span className={`menu-conta-tag${temAlerta ? ' crit' : ''}`}>
              {temAlerta ? 'Vencidos' : 'Sem alertas'}
            </span>
          </button>

          <BotaoInstalarPWA variante="item" aoConcluir={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}
