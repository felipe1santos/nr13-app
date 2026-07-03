import type { ReactNode } from 'react';

/**
 * Moldura do terminal do memorial (padrão design/painel_calculo_pmta_nr13.html):
 * barra com 3 pontos + nome do arquivo .log + pill de status, corpo branco mono.
 */
export type StatusTerminal = 'aguardando' | 'aprovado' | 'reprovado' | 'pendente';

const CLASSE_STATUS: Record<StatusTerminal, string> = {
  aguardando: 'idle',
  aprovado: 'pass',
  reprovado: 'fail',
  pendente: 'warn',
};

export default function TerminalMemorial({
  arquivo,
  status,
  children,
}: {
  arquivo: string;
  status: StatusTerminal;
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
      <div className="calc-terminal-section expandido">{children}</div>
    </div>
  );
}
