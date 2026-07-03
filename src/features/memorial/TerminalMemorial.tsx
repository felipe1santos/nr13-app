import type { ReactNode } from 'react';

/**
 * Moldura do terminal do memorial (padrão design/painel_pmta.html):
 * barra com 3 pontos coloridos + nome do arquivo .log + pill de status, corpo
 * branco mono. `filtros` opcional adiciona o alternador de visão (Completo /
 * por componente) no topo do corpo.
 */
export type StatusTerminal = 'aguardando' | 'aprovado' | 'reprovado' | 'pendente';

const CLASSE_STATUS: Record<StatusTerminal, string> = {
  aguardando: 'idle',
  aprovado: 'pass',
  reprovado: 'fail',
  pendente: 'warn',
};

export interface FiltroTerminal {
  id: string;
  label: string;
}

export default function TerminalMemorial({
  arquivo,
  status,
  filtros,
  filtroAtivo,
  onFiltro,
  children,
}: {
  arquivo: string;
  status: StatusTerminal;
  filtros?: FiltroTerminal[];
  filtroAtivo?: string;
  onFiltro?: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="term-wrap">
      <div className="term-topbar">
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-filename">{arquivo}</span>
        <span className={`term-status ${CLASSE_STATUS[status]}`}>{status}</span>
      </div>
      {filtros && filtros.length > 0 && onFiltro && (
        <div className="term-toolbar">
          <span className="term-tl-label">MEMORIAL</span>
          <div className="term-view-toggle">
            {filtros.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`term-vt ${filtroAtivo === f.id ? 'active' : ''}`}
                onClick={() => onFiltro(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="calc-terminal-section expandido">{children}</div>
    </div>
  );
}
