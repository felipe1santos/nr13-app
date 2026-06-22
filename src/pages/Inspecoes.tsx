import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import ModalNovaInspecaoContainer from '../features/inspecoes/ModalNovaInspecaoContainer';
import { criarContainer, formulariosDoContainer, listarContainers, removerContainer } from '../features/inspecoes/inspecaoService';
import { ENSAIOS_DISPONIVEIS, type ContainerInspecao, type TipoEnsaio } from '../features/inspecoes/tipos';
import '../features/inspecoes/visualizador.css';
import '../pages/relatorios.css';
import './inspecoes.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function ContainerCard({
  container,
  tag,
  onExcluir,
}: {
  container: ContainerInspecao;
  tag: string;
  onExcluir: () => void;
}) {
  const navigate = useNavigate();
  const formularios = formulariosDoContainer(container);
  const [confirmando, setConfirmando] = useState(false);

  function handleExcluir(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirmando) { setConfirmando(true); return; }
    onExcluir();
  }

  function abrir() {
    navigate(`/inspecoes/${tag}/${container.id}`);
  }

  return (
    <div
      className="container-card container-card-clicavel"
      onClick={abrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') abrir(); }}
    >
      <div className="container-card-header">
        <div>
          <div className="container-card-titulo">{container.nome || `Inspeção de ${container.criadoEm}`}</div>
          <div className="container-card-meta">
            {container.criadoEm} • {formularios.length} {formularios.length === 1 ? 'item' : 'itens'}
          </div>
          <div className="container-card-badges">
            {container.ensaios.map((e) => (
              <span key={e} className="badge-item-ensaio">
                {ENSAIOS_DISPONIVEIS.find((d) => d.value === e)?.label ?? e}
              </span>
            ))}
          </div>
        </div>
        <div className="container-card-acoes" onClick={(e) => e.stopPropagation()}>
          {confirmando ? (
            <>
              <button type="button" className="btn-remover" onClick={handleExcluir}>
                Confirmar
              </button>
              <button type="button" className="btn-secundario" onClick={(e) => { e.stopPropagation(); setConfirmando(false); }}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="btn-remover" onClick={handleExcluir}>
              Excluir
            </button>
          )}
          <span className="container-card-seta" aria-hidden>›</span>
        </div>
      </div>
    </div>
  );
}

export default function Inspecoes() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tagInicial = params.get('tag') || '';
  const [tela, setTela] = useState<'equipamentos' | 'containers'>(tagInicial ? 'containers' : 'equipamentos');
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [tag, setTag] = useState(tagInicial);
  const [containers, setContainers] = useState<ContainerInspecao[]>(() => (tagInicial ? listarContainers(tagInicial) : []));
  const [modalAberto, setModalAberto] = useState(false);

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    carregarEquipamentos();
  }, [carregarEquipamentos]);

  function abrirEquipamento(novaTag: string) {
    setTag(novaTag);
    setContainers(listarContainers(novaTag));
    setTela('containers');
    navigate(`/inspecoes?tag=${novaTag}`, { replace: true });
  }

  function voltarParaEquipamentos() {
    setTela('equipamentos');
    navigate('/inspecoes', { replace: true });
  }

  async function criar(ensaios: TipoEnsaio[], nome: string) {
    await criarContainer(tag, ensaios, nome);
    setContainers(listarContainers(tag));
    setModalAberto(false);
  }

  async function excluir(id: string) {
    await removerContainer(tag, id);
    setContainers(listarContainers(tag));
  }

  return (
    <div className="inspecoes-page">
      <h1>Inspeções</h1>

      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <h3>Equipamentos Cadastrados</h3>
          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentos.map((eq) => (
                <button
                  type="button"
                  key={eq.tag}
                  className="card-equipamento-horiz"
                  onClick={() => abrirEquipamento(eq.tag)}
                >
                  <div className="card-eq-img">
                    {eq.fotoCapa ? (
                      <img src={eq.fotoCapa} alt={eq.tag} />
                    ) : (
                      <span className="card-eq-img-vazio">{eq.tag.slice(0, 2)}</span>
                    )}
                  </div>
                  <div className="card-eq-info">
                    <div className="eq-col">
                      <span className="eq-tag">{eq.tag}</span>
                      <span className="eq-tipo">{ROTULO_TIPO[eq.info.tipo]}</span>
                    </div>
                    <div className="eq-col">
                      <span className="eq-label">Categoria</span>
                      <span className="eq-value">{eq.categoria?.catFinal ?? '—'}</span>
                    </div>
                    <div className="eq-col">
                      <span className="eq-label">PMTA</span>
                      <span className="eq-value">{eq.calculo ? formatarValor(parseFloat(eq.calculo.pmta), eq.unidade) : '—'}</span>
                    </div>
                  </div>
                  <span className={`badge-relatorios ${listarContainers(eq.tag).length > 0 ? 'tem' : ''}`}>
                    {listarContainers(eq.tag).length} Inspeções
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tela === 'containers' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={voltarParaEquipamentos}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header">
            <h3>
              Containers de Inspeção <span className="tag-equipamento-roxa">{tag}</span>
            </h3>
            <button type="button" className="btn-primario" onClick={() => setModalAberto(true)}>
              + Nova Inspeção
            </button>
          </div>

          {containers.length === 0 ? (
            <p className="dashboard-vazio">Nenhum container de inspeção criado ainda para este equipamento.</p>
          ) : (
            <div className="containers-lista">
              {containers.map((c) => (
                <ContainerCard
                  key={c.id}
                  container={c}
                  tag={tag}
                  onExcluir={() => excluir(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {modalAberto && <ModalNovaInspecaoContainer onClose={() => setModalAberto(false)} onCriar={criar} />}
    </div>
  );
}
