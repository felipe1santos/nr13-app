import type { ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import './barraDocumento.css';

/**
 * A barra ÚNICA do documento aberto (redesign Forja Compacto, 25/10/2026).
 *
 * Antes eram duas ou três faixas empilhadas — a barra de ações do Relatórios,
 * a de páginas/zoom do visualizador e, no rascunho, a da prévia —, e o PDF só
 * começava a ~190px do topo (271px no celular; 327px no rascunho). Agora é uma
 * linha de 44px: voltar, título, os controles do documento no meio e as ações
 * à direita.
 *
 * O meio não tem conteúdo próprio: é o DESTINO para onde o `VisualizadorPdf`
 * desenha a barra dele por portal (`barraEm`). Página e zoom continuam sendo
 * estado do visualizador; esta barra só lhes dá lugar. Quando não cabem, o meio
 * rola na horizontal — as ações da direita nunca saem da vista.
 */
export default function BarraDocumento({
  rotuloVoltar,
  onVoltar,
  titulo,
  detalhe,
  selos,
  acoes,
  onSlot,
}: {
  rotuloVoltar: string;
  onVoltar: () => void;
  titulo: string;
  /** TAG, tipo e data: dita ao lado do título, e inteira na dica. */
  detalhe?: string;
  /** Estado do documento (rascunho, cópia). */
  selos?: ReactNode;
  acoes?: ReactNode;
  /** Recebe o elemento do meio — passe-o ao `barraEm` do visualizador. */
  onSlot: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="barra-doc no-print" role="group" aria-label="Barra do documento">
      <button type="button" className="barra-doc-voltar" onClick={onVoltar} aria-label={rotuloVoltar} title={rotuloVoltar}>
        <Icone nome="arrowleft" tam={16} />
      </button>
      <div className="barra-doc-id" title={detalhe ? `${titulo} — ${detalhe}` : titulo}>
        <b className="barra-doc-titulo">{titulo}</b>
        {detalhe && <span className="barra-doc-detalhe">{detalhe}</span>}
      </div>
      {selos}
      <div className="barra-doc-meio" ref={onSlot} />
      {acoes && <div className="barra-doc-fim">{acoes}</div>}
    </div>
  );
}
