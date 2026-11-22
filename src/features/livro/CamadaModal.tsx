/**
 * Uma CAMADA por cima do modal "Novo registro" (22/11/2026).
 *
 * A prévia e o "Como funciona" saíram da coluna da direita do formulário: elas
 * disputavam largura com o que se digita, e a coluna crescia com o texto da
 * prévia (ver o bug da largura em `modalNovoRegistro.css`). Agora cada uma abre
 * aqui, por cima, e volta ao formulário intacto.
 *
 * Diferente do modal de baixo, ESTA camada é só leitura — então o clique no
 * fundo e o ESC fecham (o ESC para aqui, na captura, para não chegar a quem
 * está embaixo). Foco preso dentro dela enquanto aberta; ao fechar, o foco
 * volta para quem a abriu.
 *
 * Vai para o `document.body` por portal: a camada não pode depender de nenhum
 * ancestral sem `transform`/`overflow` para ficar presa à tela.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '../../components/Icone';

export default function CamadaModal({
  eyebrow,
  titulo,
  aoFechar,
  rodape,
  className,
  children,
}: {
  eyebrow?: string;
  titulo: string;
  aoFechar: () => void;
  rodape?: ReactNode;
  /** Classe extra da caixa (largura própria de cada camada). */
  className?: string;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();
  // A ref garante que o efeito (montado uma vez) chame sempre o `aoFechar` atual.
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        aoFecharRef.current();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('keydown', tecla, true);
      anterior?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="reg-camada-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div
        ref={caixa}
        className={`reg-camada${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <header className="reg-camada-head">
          <div className="reg-camada-titulos">
            {eyebrow && <span className="reg-camada-eyebrow">{eyebrow}</span>}
            <h2 id={idTitulo}>{titulo}</h2>
          </div>
          <button ref={fechar} type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </header>
        <div className="reg-camada-corpo">{children}</div>
        {rodape && <footer className="reg-camada-rodape">{rodape}</footer>}
      </div>
    </div>,
    document.body,
  );
}
