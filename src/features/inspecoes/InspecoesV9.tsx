/**
 * Fase 9 · 9F.1 — `/inspecoes` sem baixar a organização inteira.
 *
 * ## O que muda em relação à tela antiga (que continua em `pages/Inspecoes.tsx`)
 *
 *   · a lista de equipamentos vem da PROJEÇÃO, uma página de 50 por vez, e não
 *     de `listarEquipamentos()` — que começa com `await lerTudo()` e desfaz o
 *     boot leve da 9D (20 KB × 354 KB medidos) na primeira visita;
 *   · existe BUSCA. A tela antiga tem zero campo de texto: para achar um
 *     equipamento, rola-se a lista inteira;
 *   · o badge "N Inspeções" vem CONTADO do servidor. A tela antiga o escreve
 *     com `JSON.parse` de `nr13_docs_<TAG>` inteiro, **duas vezes por cartão,
 *     dentro do render** — 11,4 KB por TAG na média medida em produção em
 *     28/08/2026, 117 KB na cauda;
 *   · o equipamento só chega ao cache quando é ESCOLHIDO
 *     (`abrirEquipamentoParaInspecao`).
 *
 * ## O que NÃO muda
 *
 * O cartão do container, a rota, o modal de nova inspeção e o que acontece ao
 * clicar. O portão exige conteúdo idêntico com a flag ligada e desligada.
 *
 * ## `null` não é zero
 *
 * Numa organização cuja projeção ainda não foi refeita, `inspecoes` vem `null` —
 * e o badge SOME, em vez de escrever "0 Inspeções" sobre um equipamento que pode
 * ter dez rodadas em campo. A regra mora em `rotuloInspecoes`, no serviço, onde
 * a suíte alcança: o ambiente de teste é `node`, sem DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import FotoImg from '../../components/FotoImg';
import * as buscaIndex from '../../services/buscaIndex';
import { rotuloInspecoes } from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import { formatarValor } from '../../calc/unidades';
import type { SistemaUnidade } from '../../calc/unidades';
import ModalNovaInspecaoContainer from './ModalNovaInspecaoContainer';
import ContainerCard from './ContainerCard';
import { abrirEquipamentoParaInspecao } from './catalogoInspecoes';
import { criarContainer, listarContainers, removerContainer } from './inspecaoService';
import type { ContainerInspecao, TipoEnsaio } from './tipos';
import './visualizador.css';
import '../../pages/relatorios.css';
import '../../pages/inspecoes.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 92;

export default function InspecoesV9() {
  const [params, setParams] = useSearchParams();

  // ESTADO NA URL, como nas outras telas da fase: recarregar, voltar do
  // container e compartilhar continuam no mesmo lugar.
  const termo = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';

  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const [containers, setContainers] = useState<ContainerInspecao[]>([]);
  const [abrindo, setAbrindo] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const filtros: FiltrosBusca = useMemo(() => ({ termo }), [termo]);

  /** A resposta antiga não pode sobrescrever a nova — igual à 9C/9E. */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  const trocarParam = useCallback(
    (chave: string, valor: string) => {
      const novos = new URLSearchParams(params);
      if (valor) novos.set(chave, valor);
      else novos.delete(chave);
      setParams(novos, { replace: true });
    },
    [params, setParams],
  );

  const buscar = useCallback(async () => {
    const minha = ++geracao.current;
    abortador.current?.abort();
    const ctrl = new AbortController();
    abortador.current = ctrl;

    setCarregando(true);
    setErro(null);
    try {
      const pagina = await buscaIndex.listarPagina(filtros, null, ctrl.signal);
      if (minha !== geracao.current) return;

      void catalogo.guardar(pagina.itens);
      setOffline(false);
      setItens(pagina.itens);
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);

      void buscaIndex
        .contar(filtros, ctrl.signal)
        .then((c) => {
          if (minha === geracao.current) setContagem(c);
        })
        .catch(() => undefined); // contador é enfeite: nunca derruba a lista
    } catch (e) {
      if (minha !== geracao.current) return;
      if (ctrl.signal.aborted) return;

      // SEM REDE: responde pelo catálogo do aparelho e DIZ isso. O que não se
      // faz aqui — e o desenho (§16) proíbe — é cair em hidratação integral.
      const local = await catalogo.paginaLocal(filtros, null);
      if (local.itens.length) {
        setOffline(true);
        setItens(local.itens);
        setCursor(local.proximoCursor);
        setTemMais(local.temMais);
        setContagem({ total: await catalogo.contarLocal(filtros), exato: true });
      } else {
        setItens([]);
        setCursor(null);
        setTemMais(false);
        setContagem(null);
        setErro(
          e instanceof buscaIndex.ErroBusca
            ? 'Não foi possível carregar os equipamentos.'
            : 'Sem conexão, e este aparelho ainda não tem o catálogo baixado.',
        );
      }
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    if (tag) return; // na tela de containers a lista não é refeita
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
    return () => abortador.current?.abort();
  }, [buscar, tag]);

  /**
   * Abrir um equipamento: SEMEIA a TAG e só então lê os containers.
   *
   * Roda também quando a URL já chega com `?tag=` (link, recarga, voltar do
   * formulário). É este efeito que substitui o `lerTudo()` da tela antiga.
   */
  useEffect(() => {
    if (!tag) {
      setContainers([]);
      return;
    }
    let vivo = true;
    setAbrindo(true);
    void abrirEquipamentoParaInspecao(tag)
      .then((lista) => {
        if (vivo) setContainers(lista);
      })
      .finally(() => {
        if (vivo) setAbrindo(false);
      });
    return () => {
      vivo = false;
    };
  }, [tag]);

  const carregarMais = useCallback(async () => {
    if (!temMais || carregando || carregandoMais || !cursor) return;
    setCarregandoMais(true);
    const minha = geracao.current;
    try {
      const pagina = offline
        ? await catalogo.paginaLocal(filtros, cursor)
        : await buscaIndex.listarPagina(filtros, cursor);
      if (minha !== geracao.current) return;
      setItens((antigos) => {
        const vistos = new Set(antigos.map((i) => i.tag));
        return [...antigos, ...pagina.itens.filter((i) => !vistos.has(i.tag))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, filtros, offline]);

  async function criar(ensaios: TipoEnsaio[], nome: string) {
    await criarContainer(tag, ensaios, nome);
    setContainers(listarContainers(tag));
    setModalAberto(false);
  }

  async function excluir(id: string) {
    await removerContainer(tag, id);
    setContainers(listarContainers(tag));
  }

  // ── TELA DOS CONTAINERS ────────────────────────────────────────────────────
  if (tag) {
    return (
      <div className="inspecoes-page">
        <h1>Inspeções</h1>
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => trocarParam('tag', '')}>
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

          {abrindo ? (
            <p className="dashboard-vazio">Carregando as inspeções deste equipamento…</p>
          ) : containers.length === 0 ? (
            <p className="dashboard-vazio">Nenhum container de inspeção criado ainda para este equipamento.</p>
          ) : (
            <div className="containers-lista">
              {containers.map((c) => (
                <ContainerCard key={c.id} container={c} tag={tag} onExcluir={() => excluir(c.id)} />
              ))}
            </div>
          )}
        </div>

        {modalAberto && (
          <ModalNovaInspecaoContainer onClose={() => setModalAberto(false)} onCriar={criar} />
        )}
      </div>
    );
  }

  // ── TELA DA LISTA ──────────────────────────────────────────────────────────
  return (
    <div className="inspecoes-page">
      <h1>Inspeções</h1>

      <BuscaLista
        valor={termo}
        aoMudar={(t) => trocarParam('q', t)}
        placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
        carregando={carregando}
        contagem={contagem}
        offline={offline}
      />

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="bloco-dados">
        {!carregando && itens.length === 0 && !erro ? (
          <p className="dashboard-vazio">
            {termo ? `Nenhum equipamento encontrado para ${termo}.` : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <ListaVirtualizada
            itens={itens}
            chaveDe={(i) => i.tag}
            alturaEstimada={ALT_LINHA}
            classeGrade="lista-cards-horiz"
            // Busca nova é lista nova: a rolagem volta ao começo. Sem isto, quem
            // busca com a lista rolada fica olhando para o vazio enquanto o
            // cabeçalho anuncia resultados — medido no gate com 50.000.
            chaveDoConjunto={termo}
            aoChegarNoFim={carregarMais}
            rodape={
              carregandoMais ? (
                <div className="rel-rodape-carregando" role="status">
                  Carregando mais…
                </div>
              ) : null
            }
            desenhar={(item) => (
              <button
                type="button"
                className="card-equipamento-horiz"
                onClick={() => trocarParam('tag', item.tag)}
              >
                <div className="card-eq-img">
                  {item.fotoRef ? (
                    <FotoImg foto={{ ref: item.fotoRef }} alt={item.tag} variante="thumb" />
                  ) : (
                    <span className="card-eq-img-vazio">{item.tag.slice(0, 2)}</span>
                  )}
                </div>
                <div className="card-eq-info">
                  <div className="eq-col">
                    <span className="eq-tag">{item.tag}</span>
                    <span className="eq-tipo">{item.tipo ? ROTULO_TIPO[item.tipo] ?? item.tipo : '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">Categoria</span>
                    <span className="eq-value">{item.categoria ?? '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">PMTA</span>
                    <span className="eq-value">
                      {item.pmtaMpa !== null
                        ? formatarValor(item.pmtaMpa, (item.unidade as SistemaUnidade) ?? 'SI')
                        : '—'}
                    </span>
                  </div>
                </div>
                {/* O badge SOME quando a contagem é desconhecida. "0 Inspeções"
                    ali seria afirmar um fato que ninguém mediu. */}
                {rotuloInspecoes(item.inspecoes) && (
                  <span className={`badge-relatorios ${(item.inspecoes ?? 0) > 0 ? 'tem' : ''}`}>
                    {rotuloInspecoes(item.inspecoes)}
                  </span>
                )}
              </button>
            )}
          />
        )}
      </div>
    </div>
  );
}
