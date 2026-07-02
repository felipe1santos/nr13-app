import { useEffect, useRef, useState } from 'react';

// Wrapper de folha A4 dos previews (relatório/prontuário/calibração/inspeção).
// Quando o container fica mais estreito que a folha (794px ≈ 210mm), mantém o layout interno
// EXATO da folha (largura fixa) e reduz tudo por transform: scale — visualização fiel no
// celular, sem refluir/estragar o design do documento. A impressão não passa por aqui
// (usa #print-root com as folhas rasterizadas), então nada muda no papel.
const LARGURA_A4 = 794; // px @96dpi = 210mm
const ALTURA_A4 = 1123; // px @96dpi = 297mm

export default function PaginaA4({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver(() => {
      const w = el.clientWidth;
      setEscala(w > 0 && w < LARGURA_A4 ? w / LARGURA_A4 : 1);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="pagina-relatorio-a4"
      style={escala < 1 ? { width: '100%', height: ALTURA_A4 * escala, overflow: 'hidden' } : undefined}
    >
      {escala < 1 ? (
        <div
          style={{
            width: LARGURA_A4,
            height: ALTURA_A4,
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
