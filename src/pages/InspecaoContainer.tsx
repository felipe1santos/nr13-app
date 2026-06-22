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
  const base = `/inspecoes/${tag}/${containerId}`;

  return (
    <div className="inspecoes-page">
      <div className="meta-breadcrumb">
        <Link to={`/inspecoes?tag=${tag}`} className="btn-secundario">
          ← Voltar
        </Link>
        <span className="tag-equipamento-roxa">{tag}</span>
      </div>

      <div className="bloco-dados">
        <div className="container-detalhe-titulo">
          <h3>{container.nome || `Inspeção de ${container.criadoEm}`}</h3>
          <span className="container-card-meta">
            {container.criadoEm} • {formularios.length} {formularios.length === 1 ? 'item' : 'itens'}
          </span>
        </div>

        <ul className="lista-itens-container">
          {formularios.map((f) => {
            const preenchido = container.dados[f] != null;
            return (
              <li key={f} className="item-container-row">
                <div className="item-container-info">
                  <span className={`item-status-dot ${preenchido ? 'ok' : 'pendente'}`}>{preenchido ? '●' : '○'}</span>
                  <div>
                    <strong>{ROTULO_FORMULARIO[f]}</strong>
                    <span className={`badge-tipo ${preenchido ? 'preenchido' : ''}`}>
                      {preenchido ? 'Preenchido' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <div className="item-container-acoes">
                  {preenchido && (
                    <>
                      <button type="button" className="btn-visualizar" onClick={() => navigate(`${base}/${f}?visualizar=1`)}>
                        👁 Ver preenchido
                      </button>
                      <button type="button" className="btn-visualizar btn-ver-doc" onClick={() => navigate(`${base}/${f}?documento=1`)}>
                        📄 Ver documento
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-primario" onClick={() => navigate(`${base}/${f}`)}>
                    {preenchido ? '✎ Editar' : 'Preencher'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
