import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import ModalNovaInspecaoContainer from '../features/inspecoes/ModalNovaInspecaoContainer';
import ContainerCard from '../features/inspecoes/ContainerCard';
import InspecoesV9 from '../features/inspecoes/InspecoesV9';
import { inspecoesV9Ativa } from '../services/storage';
import { criarContainer, listarContainers, removerContainer } from '../features/inspecoes/inspecaoService';
import type { ContainerInspecao, TipoEnsaio } from '../features/inspecoes/tipos';
import '../features/inspecoes/visualizador.css';
import '../pages/relatorios.css';
import './inspecoes.css';
import FotoImg from '../components/FotoImg';
import { rotaInspecoes } from '../app/rotas';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function InspecoesLegado() {
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
    navigate(rotaInspecoes(novaTag), { replace: true });
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
                      <FotoImg foto={eq.fotoCapa} alt={eq.tag} variante="thumb" />
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

/**
 * Fase 9 · 9F.1.4 — o interruptor da flag `inspecoes_v9`, por TELA.
 *
 * DESLIGADA (padrão, e é o padrão de propósito): a tela acima, byte a byte como
 * sempre foi — a lista inteira vinda de `listarEquipamentos()`, sem busca.
 * LIGADA: `InspecoesV9`, com o catálogo do servidor, busca e a contagem de
 * inspeções contada na projeção.
 *
 * ROLLBACK É DESLIGAR A FLAG. Nada precisa ser convertido de volta: a projeção é
 * derivada e `app_storage` continua sendo a verdade.
 *
 * OS DOIS CAMINHOS NÃO FICAM PARA SEMPRE. Quando o rollout terminar, o legado
 * sai — e é por isso que `InspecoesV9` não importa nada deste arquivo (o cartão
 * do container mora em `features/inspecoes/ContainerCard.tsx`, usado pelos dois).
 */
export default function Inspecoes() {
  // A flag é decisão de SESSÃO, lida uma vez no login. Alternar no meio faria a
  // lista trocar de fonte com cursores diferentes no meio da rolagem.
  const [modo] = useState<'v9' | 'legado'>(() => (inspecoesV9Ativa() ? 'v9' : 'legado'));
  return modo === 'v9' ? <InspecoesV9 /> : <InspecoesLegado />;
}
