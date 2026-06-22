import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DOCS_POR_FORMULARIO, ROTULO_FORMULARIO, type FormularioEnsaio } from '../features/inspecoes/tipos';
import FormularioUltrassom from '../features/inspecoes/formularios/FormularioUltrassom';
import FormularioChecklist from '../features/inspecoes/formularios/FormularioChecklist';
import FormularioVisualExterno from '../features/inspecoes/formularios/FormularioVisualExterno';
import FormularioVisualInterno from '../features/inspecoes/formularios/FormularioVisualInterno';
import FormularioTH from '../features/inspecoes/formularios/FormularioTH';
import VisualizadorFormulario from '../features/inspecoes/VisualizadorFormulario';
import { carregarContainer, carregarDadosFormulario } from '../features/inspecoes/inspecaoService';
import { gravarInspecaoOrigemAtual } from '../features/relatorios/relatoriosService';
import '../features/inspecoes/formularios.css';
import '../features/inspecoes/visualizador.css';
import './relatorios.css';

// Pré-visualização "como o documento ficará": grava os dados de campo do container nas chaves que
// os templates de public/arquivos-inspecao/ leem e renderiza os mesmos iframes do relatório.
function PreviewDocumento({ tag, containerId, formulario }: { tag: string; containerId: string; formulario: FormularioEnsaio }) {
  const [pronto, setPronto] = useState(false);
  const docs = DOCS_POR_FORMULARIO[formulario] ?? [];

  useEffect(() => {
    const container = carregarContainer(tag, containerId);
    gravarInspecaoOrigemAtual(container?.dados ?? {}).then(() => setPronto(true));
  }, [tag, containerId]);

  if (!pronto) return <p style={{ padding: 20, color: '#6b7280' }}>Montando documento...</p>;
  if (docs.length === 0) return <p style={{ padding: 20, color: '#6b7280' }}>Pré-visualização não disponível para este tipo.</p>;

  return (
    <div className="relatorio-preview">
      {docs.map((doc, i) => (
        <div key={`${doc}-${i}`} className="pagina-relatorio-a4">
          <iframe src={`/arquivos-inspecao/${doc}?tag=${tag}&page=${i + 1}`} scrolling="no" title={doc} />
        </div>
      ))}
    </div>
  );
}

export default function InspecaoFormulario() {
  const { tag = '', containerId = '', formulario = '' } = useParams<{ tag: string; containerId: string; formulario: string }>();
  const [params] = useSearchParams();
  const f = formulario as FormularioEnsaio;
  const visualizar = params.get('visualizar') === '1';
  const documento = params.get('documento') === '1';
  const voltarPara = params.get('origem') === 'equipamento' ? `/equipamento/${tag}` : `/inspecoes/${tag}/${containerId}`;

  const dadosSalvos = visualizar ? carregarDadosFormulario(tag, containerId, f) : null;

  return (
    <div className="formulario-page">
      <div className="formulario-header">
        <Link to={voltarPara} className="btn-voltar-memorial">
          ← Voltar
        </Link>
        <h1>{ROTULO_FORMULARIO[f] ?? formulario}</h1>
        {(visualizar || documento) && (
          <Link
            to={`/inspecoes/${tag}/${containerId}/${f}`}
            className="btn-secundario"
            style={{ marginLeft: 'auto', fontSize: 13 }}
          >
            Editar
          </Link>
        )}
      </div>

      <div className="formulario-corpo">
        {documento ? (
          <PreviewDocumento tag={tag} containerId={containerId} formulario={f} />
        ) : visualizar ? (
          <VisualizadorFormulario formulario={f} dados={dadosSalvos} tag={tag} />
        ) : (
          <>
            {f === 'ultrassom' && <FormularioUltrassom tag={tag} containerId={containerId} />}
            {f === 'checklist' && <FormularioChecklist tag={tag} containerId={containerId} />}
            {f === 'visual_externo' && <FormularioVisualExterno tag={tag} containerId={containerId} />}
            {f === 'visual_interno' && <FormularioVisualInterno tag={tag} containerId={containerId} />}
            {f === 'th' && <FormularioTH tag={tag} containerId={containerId} />}
          </>
        )}
      </div>
    </div>
  );
}
