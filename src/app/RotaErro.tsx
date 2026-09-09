import { useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/**
 * Fallback amigável para qualquer erro não tratado numa rota (ver CLAUDE.md §10).
 * Sem isso, react-router mostra a tela de debug padrão (stack trace cru) pro cliente final.
 *
 * ## POR QUE ELE MOSTRA OS DETALHES (09/09/2026)
 *
 * Ele dizia só "Ocorreu um erro inesperado". Para o usuário isso basta; para
 * consertar, não basta nada: quem reproduz o defeito está no CELULAR, sem
 * console, e a única informação que chega até aqui é a frase genérica. Foi
 * exatamente o que aconteceu com o erro ao rolar a lista de equipamentos —
 * relatado, real, e sem uma linha de diagnóstico junto.
 *
 * Os detalhes ficam RECOLHIDOS: quem só quer voltar a trabalhar não é obrigado
 * a ler pilha de chamada, e quem precisa relatar tem um botão que copia tudo.
 */
export default function RotaErro() {
  const erro = useRouteError();
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  console.error('Erro não tratado na rota:', erro);

  const detalhes = descrever(erro);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(detalhes);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: o texto continua na tela para
      // ser selecionado à mão.
    }
  }

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

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: '#7A8790',
          fontSize: 12,
          textDecoration: 'underline',
          cursor: 'pointer',
          padding: 4,
        }}
      >
        {aberto ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}
      </button>

      {aberto && (
        <div style={{ width: '100%', maxWidth: 640, textAlign: 'left' }}>
          <pre
            style={{
              margin: 0,
              padding: 12,
              maxHeight: 260,
              overflow: 'auto',
              background: '#fff',
              border: '1px solid #E4E1D8',
              borderRadius: 10,
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: '"IBM Plex Mono", monospace',
              color: '#2D3339',
            }}
          >
            {detalhes}
          </pre>
          <button
            type="button"
            onClick={() => void copiar()}
            style={{
              marginTop: 8,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E4E1D8',
              background: '#fff',
              color: '#2D3339',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copiado ? 'Copiado' : 'Copiar detalhes'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * O erro em texto: mensagem, pilha e o endereço da tela.
 *
 * Exportada para ter teste — a forma dos erros do react-router (resposta de
 * rota, `Error`, ou qualquer valor lançado) é justamente o que faz um `String(e)`
 * ingênuo virar `[object Object]` na hora em que a informação mais importa.
 */
export function descrever(erro: unknown): string {
  const partes: string[] = [];

  if (isRouteErrorResponse(erro)) {
    partes.push(`Rota ${erro.status} ${erro.statusText}`);
    if (erro.data) partes.push(typeof erro.data === 'string' ? erro.data : JSON.stringify(erro.data));
  } else if (erro instanceof Error) {
    partes.push(`${erro.name}: ${erro.message}`);
    if (erro.stack) partes.push(erro.stack);
  } else if (erro && typeof erro === 'object') {
    // `String({})` daria "[object Object]" — o caso em que o texto some.
    try {
      partes.push(JSON.stringify(erro));
    } catch {
      partes.push(Object.prototype.toString.call(erro));
    }
  } else {
    partes.push(String(erro));
  }

  if (typeof window !== 'undefined') {
    partes.push(`em ${window.location.pathname}${window.location.search}`);
    partes.push(`tela ${window.innerWidth}×${window.innerHeight}`);
  }
  return partes.join('\n');
}
