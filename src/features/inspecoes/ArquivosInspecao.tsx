import { useState } from 'react';
import { Link } from 'react-router-dom';
import ModalNovaInspecaoContainer from './ModalNovaInspecaoContainer';
import {
  adicionarEnsaiosContainer,
  criarContainer,
  formulariosDoContainer,
  listarContainers,
  removerContainer,
  removerFormularioContainer,
} from './inspecaoService';
import { ROTULO_FORMULARIO, type ContainerInspecao, type FormularioEnsaio, type TipoEnsaio } from './tipos';
import './arquivosInspecao.css';

export default function ArquivosInspecao({ tag }: { tag: string }) {
  const [containers, setContainers] = useState<ContainerInspecao[]>(() => listarContainers(tag));
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [containerAdicionando, setContainerAdicionando] = useState<string | null>(null);

  function recarregar() {
    setContainers(listarContainers(tag));
  }

  async function criarNovo(ensaios: TipoEnsaio[], nome: string) {
    await criarContainer(tag, ensaios, nome);
    recarregar();
    setModalNovoAberto(false);
  }

  async function adicionarAoContainer(ensaios: TipoEnsaio[]) {
    if (!containerAdicionando) return;
    await adicionarEnsaiosContainer(tag, containerAdicionando, ensaios);
    recarregar();
    setContainerAdicionando(null);
  }

  async function excluirContainer(id: string) {
    if (!window.confirm('Excluir este container de inspeção e todos os dados preenchidos nele?')) return;
    await removerContainer(tag, id);
    recarregar();
  }

  async function excluirItem(containerId: string, formulario: FormularioEnsaio) {
    await removerFormularioContainer(tag, containerId, formulario);
    recarregar();
  }

  return (
    <div className="bloco-dados">
      <h3>Arquivos de Inspeção (Coleta em Campo)</h3>

      {containers.length === 0 ? (
        <p className="dashboard-vazio">Nenhum container de inspeção criado ainda.</p>
      ) : (
        <div className="lista-containers-doc">
          {containers.map((c) => {
            const formularios = formulariosDoContainer(c);
            return (
              <div key={c.id} className="container-doc-card">
                <div className="container-doc-header">
                  <div className="container-doc-titulo">
                    <span className="container-doc-lock">🔒</span>
                    <div>
                      <strong>{c.nome || `Inspeção de ${c.criadoEm}`}</strong>
                      <span className="container-doc-meta">
                        Criado em {c.criadoEm} • {formularios.length} {formularios.length === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                  </div>
                  <div className="container-doc-acoes">
                    <button type="button" className="btn-adicionar-item" onClick={() => setContainerAdicionando(c.id)}>
                      + Adicionar
                    </button>
                    <button type="button" className="btn-excluir-base" onClick={() => excluirContainer(c.id)}>
                      Excluir Base
                    </button>
                  </div>
                </div>
                <div className="container-doc-itens">
                  {formularios.map((f) => {
                    const preenchido = c.dados[f] != null;
                    return (
                      <div key={f} className="container-doc-item">
                        <div className="container-doc-item-info">
                          <span className={`container-doc-status ${preenchido ? 'ok' : 'pendente'}`}>
                            {preenchido ? '●' : '○'}
                          </span>
                          <span>{ROTULO_FORMULARIO[f]}</span>
                        </div>
                        <div className="container-doc-item-acoes">
                          <Link to={`/inspecoes/${tag}/${c.id}/${f}?origem=equipamento`} className="btn-preencher">
                            Preencher
                          </Link>
                          <button type="button" className="btn-remover-item" onClick={() => excluirItem(c.id, f)} title="Remover item">
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="doc-add-btn" onClick={() => setModalNovoAberto(true)}>
        + Add Novo Container
      </button>

      {modalNovoAberto && <ModalNovaInspecaoContainer onClose={() => setModalNovoAberto(false)} onCriar={criarNovo} />}
      {containerAdicionando && (
        <ModalNovaInspecaoContainer onClose={() => setContainerAdicionando(null)} onCriar={adicionarAoContainer} pedirNome={false} />
      )}
    </div>
  );
}
