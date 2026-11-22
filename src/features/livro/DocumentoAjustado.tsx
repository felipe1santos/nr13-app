/**
 * A área de leitura do "Ver livro completo" (22/11/2026).
 *
 * As folhas do livro são iframes de 794px (A4 a 96 dpi). Antes, no celular,
 * elas ficavam no tamanho real dentro de uma caixa que rolava nas DUAS
 * direções — e a caixa do modal rolava também: rolagem dupla. Agora esta área
 * é a ÚNICA que rola (vertical), e o documento é reduzido por `zoom` até caber
 * na largura disponível. Nunca amplia além do tamanho real.
 *
 * Só visual: a exportação do PDF monta as folhas pelas URLs
 * (`exportarPdfLivroCompleto`), não por este DOM.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { escalaParaCaber } from './escalaDocumento';


export default function DocumentoAjustado({
  children,
  antes,
}: {
  children: ReactNode;
  /** Conteúdo acima do documento, fora da escala (avisos). */
  antes?: ReactNode;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => {
      const cs = getComputedStyle(el);
      const util = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setEscala(escalaParaCaber(util));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="livro-completo-corpo" ref={area}>
      {antes}
      <div className="livro-completo-doc" style={{ zoom: escala }}>
        {children}
      </div>
    </div>
  );
}
