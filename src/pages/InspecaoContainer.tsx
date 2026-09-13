import { useEffect, useState } from 'react';
import { Icone } from '../components/Icone';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { carregarContainer, formulariosDoContainer } from '../features/inspecoes/inspecaoService';
import ModalDocumentoEnsaio from '../features/inspecoes/ModalDocumentoEnsaio';
import { ROTULO_FORMULARIO } from '../features/inspecoes/tipos';
import type { FormularioEnsaio } from '../features/inspecoes/tipos';
import type { NomeIcone } from '../components/Icone';
import './inspecoes.css';
import { rotaInspecaoContainer, rotaInspecoes } from '../app/rotas';

/** Ícone por ensaio: em campo o técnico procura o item pela figura, não pelo texto. */
const ICONE_FORMULARIO: Record<FormularioEnsaio, NomeIcone> = {
  ultrassom: 'gauge',
  checklist: 'clipboard',
  visual_externo: 'eye',
  visual_interno: 'search',
  th: 'cylinder',
  manometro: 'manometro',
  psv: 'valvula-psv',
};

export default function InspecaoContainer() {
  const { tag = '', containerId = '' } = useParams<{ tag: string; containerId: string }>();
  const navigate = useNavigate();
  const container = carregarContainer(tag, containerId);
  /** Qual ensaio está com a folha aberta no modal. `null` = nenhum. */
  const [documentoAberto, setDocumentoAberto] = useState<FormularioEnsaio | null>(null);

  useEffect(() => {
    if (!container) navigate(rotaInspecoes(tag));
  }, [container, navigate, tag]);

  if (!container) return <p>Carregando...</p>;

  const formularios = formulariosDoContainer(container);
  const base = rotaInspecaoContainer(tag, containerId);

  return (
    <div className="inspecoes-page">
      <div className="meta-breadcrumb">
        <Link to={rotaInspecoes(tag)} className="btn-secundario">
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
              <li key={f} className={`item-container-row${preenchido ? ' preenchido' : ''}`}>
                <div className="item-container-info">
                  <span className={`item-form-ico ${preenchido ? 'ok' : 'pendente'}`}>
                    <Icone nome={ICONE_FORMULARIO[f]} tam={17} />
                  </span>
                  <div className="item-container-texto">
                    <strong>{ROTULO_FORMULARIO[f]}</strong>
                    <span className={`badge-tipo ${preenchido ? 'preenchido' : ''}`}>
                      {preenchido ? 'Preenchido' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <div className="item-container-acoes">
                  {preenchido && (
                    /* À ESQUERDA do "Ver preenchido" de propósito: a ordem é a
                       do que a pessoa quer saber primeiro — como fica no papel —,
                       e só depois os campos crus. Abre em modal porque a
                       pergunta se faz no meio do preenchimento, e sair da página
                       custa o lugar na lista de ensaios. */
                    <button
                      type="button"
                      className="btn-visualizar"
                      onClick={() => setDocumentoAberto(f)}
                      title="Ver como este ensaio sai no relatório"
                    >
                      <Icone nome="filetext" tam={14} /> Ver documento
                    </button>
                  )}
                  {preenchido && (
                    <button type="button" className="btn-visualizar" onClick={() => navigate(`${base}/${f}?visualizar=1`)}>
                      <Icone nome="eye" tam={14} /> Ver preenchido
                    </button>
                  )}
                  <button type="button" className="btn-primario" onClick={() => navigate(`${base}/${f}`)}>
                    <Icone nome="pencil" tam={14} /> {preenchido ? 'Editar' : 'Preencher'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {documentoAberto && (
        <ModalDocumentoEnsaio
          tag={tag}
          containerId={containerId}
          formulario={documentoAberto}
          onFechar={() => setDocumentoAberto(null)}
        />
      )}
    </div>
  );
}
