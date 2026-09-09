import { useEffect, useId, useRef, useState } from 'react';
import './menu-mais.css';

export interface AcaoMenu {
  rotulo: string;
  aoEscolher: () => void;
  /** Item desabilitado continua VISÍVEL: sumir esconde a existência da ação. */
  desabilitado?: boolean;
  /** Ação destrutiva ganha cor — o item 9 proíbe escondê-la sem identificação. */
  destrutiva?: boolean;
  icone?: React.ReactNode;
}

/**
 * O "⋯" das barras de ação — 10/09/2026.
 *
 * ## Por que existe
 *
 * A barra do editor de relatório media **140 px em três linhas** no celular
 * (388 px de viewport), somados a 49 px de topbar: 189 px de moldura antes do
 * documento, num aparelho de 841 px. Seis botões de largura inteira, todos com
 * o mesmo peso.
 *
 * As ações que se usam uma vez por documento (imprimir a prévia, baixar,
 * configurações) passam a viver aqui; as que se usam o tempo todo — voltar,
 * salvar, finalizar — continuam à vista.
 *
 * ## O que ele NÃO faz
 *
 * Não esconde ação destrutiva sem identificação: `destrutiva` pinta o item, e
 * `desabilitado` mantém o item visível em vez de removê-lo — quem procura a
 * ação precisa achá-la, mesmo quando ela não está disponível agora.
 */
export default function MenuMais({
  acoes,
  rotulo = 'Mais ações',
  className = '',
}: {
  acoes: AcaoMenu[];
  rotulo?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const visiveis = acoes.filter(Boolean);
  if (visiveis.length === 0) return null;

  return (
    <div className={`mmais ${className}`} ref={caixa}>
      <button
        type="button"
        className="btn-secundario barra-btn mmais-botao"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={rotulo}
        title={rotulo}
        onClick={() => setAberto((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {aberto && (
        <div className="mmais-lista" id={idMenu} role="menu">
          {visiveis.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              role="menuitem"
              className={`mmais-item${a.destrutiva ? ' is-destrutiva' : ''}`}
              disabled={a.desabilitado}
              onClick={() => {
                setAberto(false);
                a.aoEscolher();
              }}
            >
              {a.icone}
              <span>{a.rotulo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
