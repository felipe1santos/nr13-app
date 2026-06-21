import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { carregarContainer, formulariosDoContainer } from '../features/inspecoes/inspecaoService';
import { ROTULO_FORMULARIO } from '../features/inspecoes/tipos';
import './inspecoes.css';

export default function InspecaoContainer() {
  const { tag = '', containerId = '' } = useParams<{ tag: string; containerId: string }>();
  const navigate = useNavigate();
  const container = carregarContainer(tag, containerId);

  useEffect(() => {
    if (!container) navigate(`/inspecoes?tag=${tag}`);
  }, [container, navigate, tag]);

  if (!container) return <p>Carregando...</p>;

  const formularios = formulariosDoContainer(container);

  return (
    <div className="inspecoes-page">
      <div className="meta-breadcrumb">
        <Link to={`/inspecoes?tag=${tag}`} className="btn-secundario">
          ← Voltar
        </Link>
        <strong>
          {tag} — Container de {container.criadoEm}
        </strong>
      </div>

      <div className="bloco-dados">
        <h3>Formulários deste Container</h3>
        <ul className="lista-containers">
          {formularios.map((f) => {
            const preenchido = container.dados[f] != null;
            return (
              <li key={f} className="container-item">
                <div>
                  <strong>{ROTULO_FORMULARIO[f]}</strong>
                  <div className="container-ensaios">
                    <span className={`badge-tipo ${preenchido ? 'preenchido' : ''}`}>
                      {preenchido ? 'Preenchido' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-primario" onClick={() => navigate(`/inspecoes/${tag}/${containerId}/${f}`)}>
                  Abrir
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
