/**
 * Fase 9 · 9F.3.4 — a LISTA de `/calibracoes` sem baixar a organização inteira.
 *
 * ## O que muda em relação à lista antiga (que segue em `pages/Calibracoes.tsx`)
 *
 *   · os equipamentos vêm da PROJEÇÃO, 50 por vez e virtualizados, em vez de
 *     `listarEquipamentos()` — que começa com `await lerTudo()`. Medido em
 *     produção em 31/08/2026: na maior organização são 369 linhas e 780 KB
 *     baixados para desenhar uma lista que precisa de 53 KB;
 *   · existe BUSCA. A tela antiga não tem campo de texto nenhum — só dois
 *     `<select>` de tipo e proprietário, e para achar um equipamento rola-se a
 *     lista inteira;
 *   · a CONTAGEM de calibrações vem do servidor, como um inteiro. A tela antiga
 *     a escreve com `listarCalibracoes(eq.tag).length` DENTRO do `.map()` do
 *     render — um `JSON.parse` da lista inteira por cartão, a cada quadro: 2,1 KB
 *     por TAG na média medida, 8,9 KB na maior. E o proprietário sai da mesma
 *     linha da projeção, em vez de três leituras de `nr13_emp_<TAG>` por quadro.
 *
 * ## Por que um COMPONENTE, e não uma tela inteira paralela
 *
 * Mesma razão da 9F.2: o que vem DEPOIS da lista — o histórico, o formulário de
 * calibração, o visualizador do certificado — são ~900 linhas idênticas nos dois
 * caminhos, e são o documento que um engenheiro assina. Duplicá-las criaria duas
 * versões dele. O que a flag troca é a FONTE DA LISTA e o momento em que o
 * equipamento chega ao cache.
 *
 * Este arquivo não importa nada de `pages/`: quando a 9G remover o caminho
 * antigo, a remoção não leva a lista nova junto.
 *
 * ## `null` não é `0`
 *
 * Numa organização cuja projeção ainda não foi refeita, `calibracoes` vem `null`
 * — e o rótulo SOME, em vez de escrever "Nenhuma calibração" sobre um
 * equipamento que pode ter várias. Este é o `null` mais caro da fase: é o número
 * que o usuário lê para decidir que uma válvula não precisa calibrar. A regra
 * mora em `rotuloCalibracoes`, no serviço, onde a suíte alcança — o ambiente de
 * teste é `node`, sem DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuscaLista from '../../components/BuscaLista';
import { iconeDoTipo } from '../../components/listaCobalto';
import { Icone, type NomeIcone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { buscarAcessoriosPorTag, contagemDeAcessorios, type AcessoriosPorTag } from './acessoriosServidor';
import { usePainelVencimentos } from '../../services/vencimentosServidor';
import type { ItemVencimento } from '../../services/vencimentos';
import ModalFiltrosProntuarios, {
  FILTRO_PRONT_PADRAO,
  temAlgumFiltroPront,
  type ValoresFiltroPront,
} from '../prontuarios/ModalFiltrosProntuarios';
import './ilustracoes.css';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import * as buscaIndex from '../../services/buscaIndex';
import { rotuloCalibracoes, textoCliente } from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import {
  RECORTE_PADRAO,
  TETO_PAGINAS_RECORTE,
  empresasDoCatalogo,
  filtrarCatalogo,
  precisaVarrerTudo,
  type RecorteCatalogo,
} from '../../services/recorteCatalogo';

/** O que o filtro oferece como tipo — a mesma tabela, em forma de lista. */
const TIPOS_FILTRO = [
  { valor: 'vaso', rotulo: 'Vaso de Pressão' },
  { valor: 'caldeira', rotulo: 'Caldeira' },
  { valor: 'autoclave', rotulo: 'Autoclave' },
];

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 44;

export interface PropsCatalogoCalibracoes {
  /** Termo aplicado — mora na URL, no pai. */
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Escolher um equipamento: o pai semeia a TAG e abre o histórico. */
  aoEscolher: (tag: string) => void;
  /** O que vai à DIREITA da barra — o [i] Informações da sessão. */
  acoes?: React.ReactNode;
  /**
   * `selecao` = escolher o equipamento de uma NOVA calibração. Sem o recorte
   * "só com calibração": o equipamento que ainda não tem nenhuma é exatamente
   * o que precisa da primeira.
   */
  modo?: 'lista' | 'selecao';
  /**
   * Rodada final (19/09/2026) · contagem que ESTE aparelho já conhece, por TAG.
   * A projeção do servidor só muda quando a fila drena — sem isto, salvar uma
   * calibração deixava "Nenhuma calibração" no cartão até um F5. Só as TAGs
   * tocadas nesta sessão entram; o resto segue a projeção.
   */
  contagensLocais?: Record<string, number>;
  /**
   * 21/11/2026 · quantos ACESSÓRIOS (componentes cadastrados, sem os
   * removidos) cada TAG tem, pelo cadastro que ESTE aparelho já leu. Vence a
   * resposta do servidor — ver `acessoriosServidor.ts`.
   */
  acessoriosLocais?: Record<string, number>;
}

export default function CatalogoCalibracoesV9({
  termo,
  aoMudarTermo,
  aoEscolher,
  acoes,
  modo = 'lista',
  contagensLocais,
  acessoriosLocais,
}: PropsCatalogoCalibracoes) {
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // ── Fase 10A ───────────────────────────────────────────────────────────────
  // `tipo` viaja na consulta (a RPC tem o parâmetro); calibração e empresa são
  // recorte do cliente — ver `recorteCatalogo.ts`. O padrão esconde quem tem
  // **0 calibrações**; quem tem `null` (ninguém contou) continua na lista.
  const [fTipo, setFTipo] = useState('');
  /** O que o modal edita — traduzido para `fTipo` + `recorte` no Aplicar. */
  const [filtroUi, setFiltroUi] = useState<ValoresFiltroPront>(
    modo === 'selecao' ? { ...FILTRO_PRONT_PADRAO, situacao: '' } : FILTRO_PRONT_PADRAO,
  );
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [recorte, setRecorte] = useState<RecorteCatalogo>(
    modo === 'selecao' ? { ...RECORTE_PADRAO, soComDocumento: false } : RECORTE_PADRAO,
  );
  /** Quantas páginas já vieram — o teto da varredura automática. */
  const [paginas, setPaginas] = useState(1);

  const filtros: FiltrosBusca = useMemo(() => ({ termo, tipo: fTipo }), [termo, fTipo]);

  /** A resposta antiga não pode sobrescrever a nova — igual à 9C/9E/9F.1/9F.2. */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

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
      setPaginas(1);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
    return () => abortador.current?.abort();
  }, [buscar]);

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
      setPaginas((n) => n + 1);
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, filtros, offline]);

  /**
   * Com recorte ligado a lista precisa estar INTEIRA antes de ele poder ser
   * lido como resposta: recortar só a primeira página anunciaria "4
   * equipamentos com calibração" a quem tem 30. O teto existe para o parque
   * grande não virar varredura infinita — e quando ele é atingido, a tela diz.
   */
  const varrendo = precisaVarrerTudo(recorte) && temMais && !!cursor && paginas < TETO_PAGINAS_RECORTE;
  useEffect(() => {
    if (!varrendo || carregando || carregandoMais) return;
    void carregarMais();
  }, [varrendo, carregando, carregandoMais, carregarMais]);

  const varreduraIncompleta = precisaVarrerTudo(recorte) && temMais && paginas >= TETO_PAGINAS_RECORTE;

  const empresas = useMemo(() => empresasDoCatalogo(itens), [itens]);
  const visiveis = useMemo(
    () =>
      filtrarCatalogo(
        contagensLocais
          ? itens.map((i) => (contagensLocais[i.tag] !== undefined ? { ...i, calibracoes: contagensLocais[i.tag] } : i))
          : itens,
        recorte,
        (i) => i.calibracoes,
      ),
    [itens, recorte, contagensLocais],
  );
  /**
   * Revisão do engenheiro, fase 2 · o "bug do ZZ-UNID-BAR". Equipamento com 0
   * calibrações existe, a busca o encontra, e o recorte PADRÃO ("só com
   * calibração") o esconde — a tela dizia "Nenhum equipamento encontrado",
   * que é falso, e é exatamente o equipamento em que se registra a PRIMEIRA
   * calibração (interna ou de laboratório). Agora a tela diz quantos o filtro
   * escondeu e mostra-os com um toque.
   */
  const escondidosPeloFiltro = recorte.soComDocumento ? itens.length - visiveis.length : 0;
  const contagemNaTela: Contagem | null = precisaVarrerTudo(recorte)
    ? { total: visiveis.length, exato: !temMais }
    : contagem;

  // ── Cobalto · a lista do protótipo ──────────────────────────────────────
  // Acessórios, próximo vencimento e prazo vêm do AGREGADO do servidor
  // (`vencimentos_org`, o mesmo do Dashboard): uma linha por acessório com a
  // calibração oficial mais recente. Nada é lido do cache por TAG e nada é
  // inventado — equipamento sem acessório com prazo mostra "—".
  const painel = usePainelVencimentos();
  /**
   * A CONTAGEM de acessórios NÃO sai do agregado de vencimentos: ele só tem
   * os acessórios que já têm calibração oficial com prazo, e por isso a lista
   * dizia 3 onde o painel do equipamento dizia 5. Sai do cadastro
   * (`acessoriosServidor.ts`). Uma ida por montagem, sem depender de nada.
   */
  const [acessoriosServidor, setAcessoriosServidor] = useState<AcessoriosPorTag | null>(null);
  useEffect(() => {
    let vivo = true;
    void buscarAcessoriosPorTag().then((r) => {
      if (vivo) setAcessoriosServidor(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const acessoriosPorTag = useMemo(() => {
    const m = new Map<string, ItemVencimento[]>();
    for (const it of painel.itens) {
      if (it.origem !== 'calibracao' || !it.pertenceA || it.dias === undefined) continue;
      const l = m.get(it.pertenceA) ?? [];
      l.push(it);
      m.set(it.pertenceA, l);
    }
    for (const l of m.values()) l.sort((x, y) => (x.dias ?? 0) - (y.dias ?? 0));
    return m;
  }, [painel.itens]);
  const situacaoDe = useCallback(
    (tag: string): SituacaoCal => {
      const s = acessoriosPorTag.get(tag)?.[0]?.status;
      return s === 'ok' || s === 'warn' || s === 'crit' ? s : '';
    },
    [acessoriosPorTag],
  );
  const [fSit, setFSit] = useState<SituacaoCal>('');
  const naTela = useMemo(
    () => (fSit ? visiveis.filter((i) => situacaoDe(i.tag) === fSit) : visiveis),
    [visiveis, fSit, situacaoDe],
  );
  const zebra = useMemo(() => new Map(naTela.map((it, n) => [it.tag, n])), [naTela]);
  const contarSit = (v: SituacaoCal) => (v ? visiveis.filter((i) => situacaoDe(i.tag) === v).length : visiveis.length);

  return (
    <>
      {/* BARRA ÚNICA (protótipo): situação · filtro · busca · contagem · ações. */}
      <BuscaLista
        valor={termo}
        aoMudar={aoMudarTermo}
        placeholder="Buscar TAG, equipamento, fabricante ou cliente"
        carregando={carregando || varrendo}
        contagem={fSit ? { total: naTela.length, exato: !temMais } : contagemNaTela}
        offline={offline}
        compacto
        antes={
          <>
            {modo === 'lista' && (
              <div className="rel-chips cal3-chips" role="group" aria-label="Situação das calibrações">
                {SITUACOES.map(([v, r]) => (
                  <button key={v || 'todos'} type="button" className={v ? `s-${v}` : ''} aria-pressed={fSit === v} onClick={() => setFSit(v)}>
                    {r} <i>{contarSit(v)}</i>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`fj-btn fj-btn-ghost pront-btn-filtro${temAlgumFiltroPront(filtroUi) ? ' filtro-ativo' : ''}`}
              aria-haspopup="dialog"
              title="Filtrar por tipo, cliente e situação"
              onClick={() => setFiltroAberto(true)}
            >
              <Icone nome="filter" tam={14} /> <span className="pront-btn-rotulo">Filtrar</span>
            </button>
          </>
        }
      >
        {acoes}
      </BuscaLista>

      {filtroAberto && (
        <ModalFiltrosProntuarios
          valores={filtroUi}
          modo="equipamentos"
          // O modal é o mesmo de Prontuários; sem isto ele abria escrito
          // "Filtrar prontuários" numa tela de calibrações, e a opção
          // "Com prontuário" filtrava, na verdade, quem tem calibração.
          assunto={{ titulo: 'Calibrações', singular: 'calibração', plural: 'calibrações' }}
          tipos={TIPOS_FILTRO}
          empresas={empresas}
          categorias={[]}
          varreduraIncompleta={varreduraIncompleta}
          aoAplicar={(v) => {
            setFiltroUi(v);
            setFTipo(v.tipo);
            setRecorte({ soComDocumento: v.situacao === 'com', soSemDocumento: v.situacao === 'sem', empresa: v.empresa });
            setFiltroAberto(false);
          }}
          aoFechar={() => setFiltroAberto(false)}
        />
      )}

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="bloco-dados cal3">
        {!carregando && !varrendo && naTela.length === 0 && !erro ? (
          <p className="dashboard-vazio">
            {escondidosPeloFiltro > 0 ? (
              <>
                {escondidosPeloFiltro === 1
                  ? '1 equipamento encontrado ainda não tem calibração e está escondido pelo filtro “Com calibração”. '
                  : `${escondidosPeloFiltro} equipamentos encontrados ainda não têm calibração e estão escondidos pelo filtro “Com calibração”. `}
                <button
                  type="button"
                  className="fj-btn fj-btn-ghost"
                  onClick={() => {
                    setFiltroUi((v) => ({ ...v, situacao: '' }));
                    setRecorte((r) => ({ ...r, soComDocumento: false, soSemDocumento: false }));
                  }}
                >
                  Mostrar
                </button>
              </>
            ) : fSit
              ? 'Nenhum equipamento nesta situação.'
              : termo
                ? `Nenhum equipamento encontrado para ${termo}.`
                : recorte.soComDocumento
                  ? 'Nenhum equipamento com calibração registrada. Desmarque "Só equipamentos com calibração" para cadastrar a primeira.'
                  : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <>
          <div className="cal3-cab" aria-hidden="true">
            <span />
            <span>TAG</span>
            <span>Equipamento</span>
            <span className="c-num">Calibrações</span>
            <span className="c-cli">Cliente</span>
            <span>Acessórios</span>
            <span>Próximo vencimento</span>
            <span>Prazo</span>
            <span />
          </div>
          <ListaVirtualizada
            itens={naTela}
            chaveDe={(i) => i.tag}
            alturaEstimada={ALT_LINHA}
            classeGrade="cal3-lista"
            // Busca nova é lista nova: a rolagem volta ao começo.
            chaveDoConjunto={`${termo}|${fTipo}|${recorte.empresa}|${recorte.soComDocumento}|${fSit}`}
            aoChegarNoFim={carregarMais}
            rodape={
              carregandoMais ? (
                <div className="rel-rodape-carregando" role="status">
                  Carregando mais…
                </div>
              ) : null
            }
            desenhar={(item) => {
              const acs = acessoriosPorTag.get(item.tag) ?? [];
              const prox = acs[0];
              const nAcessorios = contagemDeAcessorios(item.tag, acessoriosServidor, acessoriosLocais);
              const cli = [item.clienteNome?.trim(), item.clienteCidade?.trim()].filter(Boolean);
              return (
                <button
                  type="button"
                  className="cal3-linha"
                  onClick={() => aoEscolher(item.tag)}
                  data-z={(zebra.get(item.tag) ?? 0) % 2 === 1 || undefined}
                >
                  {/* A FOTO do equipamento, pela referência da projeção e na
                      miniatura de 400px (a mesma da lista de Equipamentos).
                      Sem foto, o ícone do tipo. */}
                  <span className={`lc-ico cal3-foto ${item.tipo ?? 'outro'}`} aria-hidden>
                    {item.fotoRef ? (
                      <FotoImg foto={{ ref: item.fotoRef }} alt="" placeholder="" variante="thumb" className="cal3-foto-img" />
                    ) : (
                      <Icone nome={iconeDoTipo(item.tipo)} tam={18} />
                    )}
                  </span>
                  <span className="cal3-tag">{item.tag}</span>
                  <span className="cal3-eq">{item.descricao?.trim() || (item.tipo ? (ROTULO_TIPO[item.tipo] ?? item.tipo) : '—')}</span>
                  {/* `null` = a projeção ainda não contou: "—", nunca 0.
                      `item` já vem de `visiveis`, com a contagem local (só
                      oficiais) sobreposta à da projeção. */}
                  <span
                    className={`cal3-ncal c-num${item.calibracoes ? '' : ' vazio'}`}
                    title={rotuloCalibracoes(item.calibracoes) || '—'}
                  >
                    {item.calibracoes ?? '—'}
                  </span>
                  <span className="cal3-cli c-cli">
                    {cli.length ? (
                      <>
                        <b>{cli[0]}</b>
                        {cli[1] ? ` · ${cli[1]}` : ''}
                      </>
                    ) : (
                      textoCliente(item) || '—'
                    )}
                  </span>
                  {/* Ícones = acessórios com prazo (o agregado); NÚMERO = os
                      acessórios cadastrados, a mesma conta do painel. */}
                  <span
                    className="cal3-acs"
                    title={
                      nAcessorios == null
                        ? 'Contagem de acessórios ainda não disponível'
                        : `${nAcessorios} acessório${nAcessorios === 1 ? '' : 's'} cadastrado${nAcessorios === 1 ? '' : 's'}`
                    }
                  >
                    {acs.slice(0, 4).map((a, n) => (
                      <span key={n} className={`cal3-mini ${classeInstrumento(a.tipoEquip)}`}>
                        <Icone nome={iconeInstrumento(a.tipoEquip)} tam={14} />
                      </span>
                    ))}
                    {nAcessorios == null ? <small>—</small> : <b>{nAcessorios}</b>}
                  </span>
                  <span className="cal3-venc">
                    {prox?.vencimento ? (
                      <>
                        <b>{prox.vencimento.toLocaleDateString('pt-BR')}</b>
                        <small>
                          {prox.tag} · {prox.tipoEquip}
                        </small>
                      </>
                    ) : (
                      <b className="vazio">—</b>
                    )}
                  </span>
                  <span>
                    {prox && prox.dias !== undefined ? (
                      <span className={`cal3-prazo ${prox.dias < 0 ? 'crit' : prox.dias <= 30 ? 'warn' : prox.dias > 60 ? 'folgado' : 'ok'}`}>
                        <Icone nome={prox.dias < 0 ? 'alerttri' : prox.dias <= 30 ? 'clock' : 'check'} tam={13} />
                        {prazoCurto(prox.dias)}
                      </span>
                    ) : null}
                  </span>
                  <Icone nome="chevright" tam={16} className="cal3-seta" />
                </button>
              );
            }}
          />
          </>
        )}
      </div>
    </>
  );
}

type SituacaoCal = '' | 'ok' | 'warn' | 'crit';
const SITUACOES: ReadonlyArray<readonly [SituacaoCal, string]> = [
  ['', 'Todos'],
  ['ok', 'Em dia'],
  ['warn', 'A vencer'],
  ['crit', 'Vencidas'],
];

function prazoCurto(dias: number): string {
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoje';
  return `Em ${dias} dia${dias === 1 ? '' : 's'}`;
}

/** Cor do instrumento (mesma família do protótipo), pelo rótulo do painel. */
function classeInstrumento(rotulo: string): string {
  const r = rotulo.toLowerCase();
  if (r.startsWith('manôm') || r.startsWith('manom')) return 'i-man';
  if (r.startsWith('válv') || r.startsWith('valv') || r.includes('psv')) return 'i-psv';
  if (r.startsWith('term')) return 'i-ter';
  if (r.startsWith('vacu')) return 'i-vac';
  if (r.startsWith('press')) return 'i-prs';
  if (r.startsWith('trans')) return 'i-tra';
  return 'i-man';
}

function iconeInstrumento(rotulo: string): NomeIcone {
  const c = classeInstrumento(rotulo);
  if (c === 'i-psv') return 'valvula-psv';
  if (c === 'i-man') return 'manometro';
  return 'gauge';
}
