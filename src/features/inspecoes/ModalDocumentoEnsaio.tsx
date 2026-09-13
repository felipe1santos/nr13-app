import { useRef } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import PreviewDocumento from './PreviewDocumento';
import { ROTULO_FORMULARIO, type FormularioEnsaio } from './tipos';

/**
 * A folha do relatório daquele ensaio, no CENTRO da tela (13/09/2026).
 *
 * ## Por que em modal
 *
 * Conferir como o ensaio vai sair no papel é uma pergunta que se faz no meio do
 * preenchimento — "já dá para fechar este container?". A resposta existia
 * (`?documento=1` em `InspecaoFormulario`), mas não havia nenhum botão que
 * levasse até ela: era rota órfã. Levar o técnico para outra página para
 * responder isso o faz perder o lugar na lista de ensaios.
 *
 * ## O que ele mostra
 *
 * O MESMO desenho que vai para o relatório — os templates de
 * `public/arquivos-inspecao/`, montados com os dados deste container. Não é o
 * documento emitido: sem número, sem assinatura, sem PDF. O rodapé diz isso,
 * porque uma folha com cabeçalho de relatório é fácil de confundir com um
 * documento pronto para entregar.
 */
export default function ModalDocumentoEnsaio({
  tag,
  containerId,
  formulario,
  onFechar,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);

  return (
    <div className="doc-overlay" onClick={onFechar}>
      <div
        ref={caixa}
        className="doc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Documento — ${ROTULO_FORMULARIO[formulario] ?? formulario}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="doc-cab">
          <div className="doc-cab-txt">
            <h3>{ROTULO_FORMULARIO[formulario] ?? formulario}</h3>
            <p>Como este ensaio sai no relatório</p>
          </div>
          <button type="button" className="doc-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="doc-corpo">
          <PreviewDocumento tag={tag} containerId={containerId} formulario={formulario} />
        </div>

        <footer className="doc-rodape">
          {/* A ressalva não é decoração: a folha tem cabeçalho de relatório e
              passa por documento emitido num olhar rápido. */}
          <span className="doc-nota">
            <Icone nome="info" tam={12} /> Prévia — não é o documento emitido.
          </span>
          <span className="doc-espaco" />
          <button type="button" className="btn-secundario" onClick={onFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
