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
import { useNavigate, useSearchParams } from 'react-router-dom';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import * as buscaIndex from '../../services/buscaIndex';
import { rotuloInspecoes } from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import { formatarValor } from '../../calc/unidades';
import type { SistemaUnidade } from '../../calc/unidades';
import ModalNovaInspecaoContainer from './ModalNovaInspecaoContainer';
import { ensaiosDoTipo, tipoDaTag } from '../equipamento/perfilEquipamento';
import ContainerCard from './ContainerCard';
import ModalRenomearContainer from './ModalRenomearContainer';
import AjudaContainers from './AjudaContainers';
import { abrirEquipamentoParaInspecao } from './catalogoInspecoes';
import { criarContainer, listarContainers, removerContainer } from './inspecaoService';
import { Icone } from '../../components/Icone';
import { MiniaturaEquipamento, TipoEquipamento, ICONE_TIPO } from '../../components/TipoEquipamento';
import { ConteudoSubmenu } from '../../app/submenu';
import { rotaEquipamento } from '../../app/rotas';
import { itemCatalogoLocal } from '../equipamento/equipamentoService';
import type { ContainerInspecao, TipoEnsaio } from './tipos';
import './visualizador.css';
import '../../pages/relatorios.css';
import '../../pages/inspecoes.css';
import './inspecoesLista.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha (v5: 52px, com a miniatura); corrigida por medição no primeiro quadro. */
const ALT_LINHA = 52;

/** Abas da lista: o recorte por tipo que o catálogo do servidor já filtra. */
const ABAS_TIPO: { valor: string; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'vaso', rotulo: 'Vasos' },
  { valor: 'caldeira', rotulo: 'Caldeiras' },
  { valor: 'autoclave', rotulo: 'Autoclaves' },
];

export default function InspecoesV9() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // ESTADO NA URL, como nas outras telas da fase: recarregar, voltar do
  // container e compartilhar continuam no mesmo lugar.
  const termo = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';
  const tipo = params.get('tipo') ?? '';

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
  /**
   * A TAG cuja lista de containers JÁ foi carregada. Até ela bater com a TAG da
   * URL, a tela está carregando — `abrindo` sozinho vira `true` só dentro do
   * efeito, DEPOIS da primeira pintura, e esse primeiro quadro afirmava
   * "Nenhum container de inspeção criado ainda" para um equipamento que tinha
   * três (medido em produção, Fase 2).
   */
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  // 10/09/2026 · renomear a rodada e a ajuda da sessão.
  const [renomeando, setRenomeando] = useState<ContainerInspecao | null>(null);
  const [ajudaAberta, setAjudaAberta] = useState(false);

  const filtros: FiltrosBusca = useMemo(() => ({ termo, tipo }), [termo, tipo]);

  /**
   * O cartão do equipamento na tela de containers (v5). Lido do CACHE, depois
   * que `abrirEquipamentoParaInspecao` semeou a TAG — por isso depende de
   * `carregadoPara`, e não só da TAG: antes da semeadura, num aparelho novo,
   * o cache não tem a ficha e o cartão simplesmente não aparece.
   */
  /**
   * Linhas alternadas (v5): a lista é virtualizada, então a paridade vem do
   * ÍNDICE do item na lista e não da posição no DOM — por posição, as faixas
   * trocariam de cor a cada rolagem.
   */
  const indiceDaTag = useMemo(() => new Map(itens.map((i, k) => [i.tag, k])), [itens]);

  const resumo = useMemo(
    () => (tag && carregadoPara === tag ? itemCatalogoLocal(tag) : null),
    [tag, carregadoPara],
  );

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
        if (vivo) {
          setAbrindo(false);
          setCarregadoPara(tag);
        }
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

  // ── TELA DOS CONTAINERS (v5, 25/10/2026) ──────────────────────────────────
  // UMA barra (voltar · trilha · ajuda · Nova inspeção) em vez das três linhas
  // de antes, e o cartão do equipamento com a foto: quem abre esta tela em
  // campo precisa reconhecer o equipamento antes de criar a rodada.
  if (tag) {
    const pmta =
      resumo?.pmtaMpa != null ? formatarValor(resumo.pmtaMpa, (resumo.unidade as SistemaUnidade) ?? 'SI') : '—';
    const cliente = resumo?.clienteNome
      ? `${resumo.clienteNome}${resumo.clienteCidade ? ` · ${resumo.clienteCidade}` : ''}`
      : null;
    const carregandoContainers = abrindo || carregadoPara !== tag;
    return (
      <div className="inspecoes-page iv5-equip">
        <div className="iv5-barra">
          <button
            type="button"
            className="btn-icone iv5-voltar"
            onClick={() => trocarParam('tag', '')}
            aria-label="Voltar para a lista de equipamentos"
            title="Voltar"
          >
            <Icone nome="arrowleft" tam={18} />
          </button>
          {/* A MESMA trilha de /relatorios e /prontuarios: módulo › chip da TAG. */}
          <nav className="iv5-trilha" aria-label="Trilha">
            <button type="button" onClick={() => trocarParam('tag', '')}>Inspeções</button>
            <Icone nome="chevright" tam={14} />
            <span className="crumb-tag-chip">{tag}</span>
          </nav>
          <span className="iv5-esp" />
          {/* A ajuda é conteúdo que se lê uma vez: fica num botão da barra, e
              não numa faixa fixa que empurraria o trabalho para baixo. */}
          <button
            type="button"
            className="btn-secundario iv5-btn"
            title="Como funcionam os containers de inspeção"
            onClick={() => setAjudaAberta(true)}
          >
            <Icone nome="info" tam={16} />
            <span className="iv5-rot-largo">Como funciona</span>
          </button>
          <button type="button" className="btn-primario iv5-btn" onClick={() => setModalAberto(true)}>
            <Icone nome="plus" tam={16} />
            Nova inspeção
          </button>
        </div>

        {resumo && (
          <section className="iv5-ficha" aria-label={`Equipamento ${tag}`}>
            <MiniaturaEquipamento tipo={resumo.tipo} fotoRef={resumo.fotoRef} tag={tag} className="iv5-ficha-foto" />
            <div className="iv5-ficha-txt">
              <div className="iv5-ficha-tit">
                <h2>{tag}</h2>
                <TipoEquipamento tipo={resumo.tipo} />
              </div>
              {resumo.descricao && <p className="iv5-ficha-desc">{resumo.descricao}</p>}
              <dl className="iv5-dados">
                <div>
                  <dt>Cliente</dt>
                  <dd>{cliente ?? <span className="iv5-vazio">Sem cliente</span>}</dd>
                </div>
                <div>
                  <dt>Categoria</dt>
                  <dd>{resumo.categoria ? <span className="iv5-selo-cat">Cat. {resumo.categoria}</span> : '—'}</dd>
                </div>
                <div>
                  <dt>PMTA</dt>
                  <dd className="iv4-mono">{pmta}</dd>
                </div>
              </dl>
            </div>
            <button type="button" className="btn-secundario iv5-btn" onClick={() => navigate(rotaEquipamento(tag))}>
              Abrir ficha
            </button>
          </section>
        )}

        <div className="iv5-secao-tit">
          <h3>Rodadas de inspeção</h3>
          {!carregandoContainers && (
            <span>
              {containers.length} {containers.length === 1 ? 'rodada' : 'rodadas'}
            </span>
          )}
        </div>

        {carregandoContainers ? (
          <p className="dashboard-vazio">Carregando as inspeções deste equipamento…</p>
        ) : containers.length === 0 ? (
          <p className="dashboard-vazio">Nenhum container de inspeção criado ainda para este equipamento.</p>
        ) : (
          <div className="containers-lista">
            {containers.map((c) => (
              <ContainerCard
                key={c.id}
                container={c}
                tag={tag}
                onExcluir={() => excluir(c.id)}
                onRenomear={() => setRenomeando(c)}
              />
            ))}
          </div>
        )}

        {modalAberto && (
          <ModalNovaInspecaoContainer
            onClose={() => setModalAberto(false)}
            onCriar={criar}
            ensaios={ensaiosDoTipo(tipoDaTag(tag))}
          />
        )}
        {renomeando && (
          <ModalRenomearContainer
            tag={tag}
            container={renomeando}
            aoFechar={() => setRenomeando(null)}
            // Relê do cache: `renomearContainer` já gravou, e reler é o que faz
            // o nome novo aparecer na lista sem esperar a próxima visita.
            aoRenomear={() => setContainers(listarContainers(tag))}
          />
        )}
        {ajudaAberta && <AjudaContainers aoFechar={() => setAjudaAberta(false)} />}
      </div>
    );
  }

  // ── TELA DA LISTA (v5, 25/10/2026) ─────────────────────────────────────────
  // Tabela dentro de UM cartão, com a barra de ferramentas no topo dele. O
  // filtro por TIPO mora no submenu (no celular, nas abas da barra), porque é o
  // recorte que o servidor sabe fazer (`p_tipo`). O catálogo não tem situação
  // por linha — derivar aqui seria afirmar um prazo que nenhuma regra do
  // sistema calculou.
  return (
    <div className="inspecoes-page iv4">
      <ConteudoSubmenu>
        <div className="submenu-secao">Tipo de equipamento</div>
        {ABAS_TIPO.map((a) => (
          <button
            key={a.valor || 'todos'}
            type="button"
            className={`nav-item${tipo === a.valor ? ' active' : ''}`}
            aria-pressed={tipo === a.valor}
            onClick={() => trocarParam('tipo', a.valor)}
          >
            <span className="left">
              <span className={`tipo-eq${a.valor ? ` ${a.valor}` : ''}`}>
                <Icone nome={a.valor ? ICONE_TIPO[a.valor] : 'grid'} />
              </span>
              <span className="menu-text">{a.rotulo}</span>
            </span>
            {tipo === a.valor && contagem && <span className="nav-count">{contagem.total}</span>}
          </button>
        ))}
      </ConteudoSubmenu>

      <section className="iv4-painel" aria-label="Equipamentos para inspeção">
        <div className="iv4-barra">
          <BuscaLista
            valor={termo}
            aoMudar={(t) => trocarParam('q', t)}
            placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
            carregando={carregando}
            contagem={contagem}
            offline={offline}
            compacto
          >
            <div className="iv4-seg" role="group" aria-label="Tipo de equipamento">
              {ABAS_TIPO.map((a) => (
                <button
                  key={a.valor || 'todos'}
                  type="button"
                  aria-pressed={tipo === a.valor}
                  onClick={() => trocarParam('tipo', a.valor)}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          </BuscaLista>
        </div>

        {erro && (
          <div className="rel-aviso-erro" role="status">
            {erro}
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
              Tentar de novo
            </button>
          </div>
        )}

        {!carregando && itens.length === 0 && !erro ? (
          <p className="iv4-vazio">
            {termo
              ? `Nenhum equipamento encontrado para ${termo}.`
              : tipo
                ? 'Nenhum equipamento deste tipo.'
                : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <>
            {/* Cabeçalho visual da tabela. Cada linha é um BOTÃO com o texto
                inteiro, então o leitor de tela não precisa dele. */}
            <div className="iv4-linha iv4-cab" aria-hidden="true">
              <span />
              <span>TAG</span>
              <span>Equipamento</span>
              <span>Cliente</span>
              <span>Categoria</span>
              <span className="num">PMTA</span>
              <span className="num">Inspeções</span>
              <span />
            </div>
            <ListaVirtualizada
              itens={itens}
              chaveDe={(i) => i.tag}
              alturaEstimada={ALT_LINHA}
              classeGrade="iv4-linhas"
              // Busca nova é lista nova: a rolagem volta ao começo. Sem isto, quem
              // busca com a lista rolada fica olhando para o vazio enquanto o
              // cabeçalho anuncia resultados — medido no gate com 50.000.
              chaveDoConjunto={`${termo}|${tipo}`}
              aoChegarNoFim={carregarMais}
              rodape={
                carregandoMais ? (
                  <div className="rel-rodape-carregando" role="status">
                    Carregando mais…
                  </div>
                ) : null
              }
              desenhar={(item) => {
                const rotuloTipo = item.tipo ? ROTULO_TIPO[item.tipo] ?? item.tipo : '—';
                // O número SOME quando a contagem é desconhecida: "0" ali seria
                // afirmar um fato que ninguém mediu (ver `rotuloInspecoes`).
                const qtd = rotuloInspecoes(item.inspecoes) ? String(item.inspecoes) : '—';
                return (
                  <button
                    type="button"
                    className={`iv4-linha${(indiceDaTag.get(item.tag) ?? 0) % 2 === 1 ? ' iv4-zebra' : ''}`}
                    onClick={() => trocarParam('tag', item.tag)}
                  >
                    <MiniaturaEquipamento tipo={item.tipo} fotoRef={item.fotoRef} tag={item.tag} className="iv4-mini" />
                    <span className="iv4-tag">{item.tag}</span>
                    <span className="iv4-eq">
                      <b>{item.descricao || rotuloTipo}</b>
                      <TipoEquipamento tipo={item.tipo} tam={12} />
                    </span>
                    <span className={`iv4-sub iv4-col-cli${item.clienteNome ? '' : ' iv5-vazio'}`}>
                      {item.clienteNome
                        ? `${item.clienteNome}${item.clienteCidade ? ` · ${item.clienteCidade}` : ''}`
                        : 'Sem cliente'}
                    </span>
                    <span className="iv4-col-cat">
                      {item.categoria ? (
                        <span className="iv5-selo-cat">Cat. {item.categoria}</span>
                      ) : (
                        <span className="iv5-vazio">—</span>
                      )}
                    </span>
                    <span className="num iv4-mono iv4-col-pmta">
                      <span className="iv4-rot-m">PMTA </span>
                      {item.pmtaMpa !== null
                        ? formatarValor(item.pmtaMpa, (item.unidade as SistemaUnidade) ?? 'SI')
                        : '—'}
                    </span>
                    <span className="num iv4-col-qtd" title={rotuloInspecoes(item.inspecoes) ?? undefined}>
                      <Icone nome="clipboard" tam={14} />
                      <b className="iv4-mono">{qtd}</b>
                    </span>
                    <Icone nome="chevright" tam={16} />
                  </button>
                );
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
