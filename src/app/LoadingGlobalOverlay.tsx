import { useLoadingGlobal } from './loadingGlobal';

// Overlay central de carregamento (usa os estilos .nr-save-overlay já definidos em tokens.css).
export default function LoadingGlobalOverlay() {
  const { ativo, mensagem } = useLoadingGlobal();
  if (!ativo) return null;
  return (
    <div className="nr-save-overlay" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{mensagem}</span>
    </div>
  );
}
