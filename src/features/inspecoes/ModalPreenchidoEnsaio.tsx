import { useRef } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import VisualizadorFormulario from './VisualizadorFormulario';
import { carregarDadosFormulario } from './inspecaoService';
import { ROTULO_FORMULARIO, type FormularioEnsaio } from './tipos';
import '../../pages/inspecoes.css';
import './visualizador.css';

/**
 * "Ver preenchido" no CENTRO da tela (22/11/2026), como o "Ver documento".
 *
 * Mostra o que foi respondido no ensaio, só leitura — o mesmo
 * `VisualizadorFormulario` da rota `?visualizar=1`, que segue existindo para
 * links antigos. Em modal pelo mesmo motivo do documento: conferir não pode
 * custar o lugar na lista de ensaios.
 */
export default function ModalPreenchidoEnsaio({
  tag,
  containerId,
  formulario,
  onEditar,
  onFechar,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);
  const dados = carregarDadosFormulario(tag, containerId, formulario);
  const rotulo = ROTULO_FORMULARIO[formulario] ?? formulario;

  return (
    <div className="doc-overlay" onClick={onFechar}>
      <div
        ref={caixa}
        className="doc-modal doc-modal-preenchido"
        role="dialog"
        aria-modal="true"
        aria-label={`Preenchido — ${rotulo}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="doc-cab">
          <div className="doc-cab-txt">
            <h3>{rotulo}</h3>
            <p>O que foi preenchido neste ensaio</p>
          </div>
          <button type="button" className="doc-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="doc-corpo doc-corpo-preenchido">
          <VisualizadorFormulario formulario={formulario} dados={dados} tag={tag} />
        </div>

        <footer className="doc-rodape">
          <span className="doc-nota">
            <Icone nome="info" tam={12} /> Somente leitura — para mudar, use Editar.
          </span>
          <span className="doc-espaco" />
          <button type="button" className="btn-secundario" onClick={onFechar}>
            Fechar
          </button>
          <button type="button" className="btn-primario" onClick={onEditar}>
            <Icone nome="pencil" tam={14} /> Editar
          </button>
        </footer>
      </div>
    </div>
  );
}
