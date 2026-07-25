import { useRouteError } from 'react-router-dom';

// Fallback amigável para qualquer erro não tratado numa rota (ver CLAUDE.md §10).
// Sem isso, react-router mostra a tela de debug padrão (stack trace cru) pro cliente final.
export default function RotaErro() {
  const erro = useRouteError();
  console.error('Erro não tratado na rota:', erro);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: '#F6F5F2',
        color: '#2D3339',
        fontFamily: '"IBM Plex Sans", sans-serif',
      }}
    >
      <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, margin: 0 }}>
        Ocorreu um erro inesperado
      </h1>
      <p style={{ color: '#7A8790', maxWidth: 420, margin: 0 }}>
        Algo deu errado ao carregar esta página. Recarregue para tentar novamente — se o problema
        continuar, entre em contato com o suporte.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 20px',
          borderRadius: 10,
          border: 'none',
          background: '#FF7A1A',
          color: '#241505',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Recarregar página
      </button>
    </div>
  );
}
