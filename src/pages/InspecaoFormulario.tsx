import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ROTULO_FORMULARIO, type FormularioEnsaio } from '../features/inspecoes/tipos';
import FormularioUltrassom from '../features/inspecoes/formularios/FormularioUltrassom';
import FormularioChecklist from '../features/inspecoes/formularios/FormularioChecklist';
import FormularioVisualExterno from '../features/inspecoes/formularios/FormularioVisualExterno';
import FormularioVisualInterno from '../features/inspecoes/formularios/FormularioVisualInterno';
import FormularioTH from '../features/inspecoes/formularios/FormularioTH';
import VisualizadorFormulario from '../features/inspecoes/VisualizadorFormulario';
import PreviewDocumento from '../features/inspecoes/PreviewDocumento';
import { carregarDadosFormulario } from '../features/inspecoes/inspecaoService';
import '../features/inspecoes/formularios.css';
import '../features/inspecoes/visualizador.css';
import './relatorios.css';
import { rotaEquipamento, rotaInspecaoContainer, rotaInspecaoFormulario } from '../app/rotas';

export default function InspecaoFormulario() {
  const { tag = '', containerId = '', formulario = '' } = useParams<{ tag: string; containerId: string; formulario: string }>();
  const [params] = useSearchParams();
  const f = formulario as FormularioEnsaio;
  const visualizar = params.get('visualizar') === '1';
  const documento = params.get('documento') === '1';
  const voltarPara =
    params.get('origem') === 'equipamento'
      ? rotaEquipamento(tag)
      : rotaInspecaoContainer(tag, containerId);

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
            to={rotaInspecaoFormulario(tag, containerId, f)}
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
