import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './foto-lista.css';

/**
 * Amplia uma miniatura ao passar o mouse — o mesmo gesto da foto do
 * equipamento nas listas (`FotoLista`), para qualquer conteúdo (21/11/2026).
 * Usado na logo do cliente em /empresas.
 *
 * Só mouse e decorativo (`aria-hidden`): a linha já tem o seu botão; a
 * ampliação não pode virar um segundo alvo de foco dentro dele.
 */
export default function ZoomAoPassar({
  children,
  ampliado,
  lado = 176,
}: {
  children: React.ReactNode;
  /** O que aparece no quadrado grande. */
  ampliado: React.ReactNode;
  lado?: number;
}) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const abrir = useCallback(() => {
    const r = ancora.current?.getBoundingClientRect();
    if (!r) return;
    const MARGEM = 10;
    let x = r.right + MARGEM;
    if (x + lado > window.innerWidth - 8) x = Math.max(8, r.left - MARGEM - lado);
    const y = Math.min(Math.max(8, r.top + r.height / 2 - lado / 2), window.innerHeight - lado - 8);
    setPos({ x, y });
  }, [lado]);

  return (
    <>
      <span ref={ancora} className="zap-ancora" onMouseEnter={abrir} onMouseLeave={() => setPos(null)}>
        {children}
      </span>
      {pos &&
        createPortal(
          <span className="fl-zoom zap-zoom" style={{ left: pos.x, top: pos.y, width: lado, height: lado }} aria-hidden="true">
            {ampliado}
          </span>,
          document.body,
        )}
    </>
  );
}
