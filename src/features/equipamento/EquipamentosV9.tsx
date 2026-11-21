/**
 * Fase 9 · `/equipamentos` lendo da PROJEÇÃO — o piloto, sob a flag `busca_v9`.
 *
 * O QUE MUDA EM RELAÇÃO À TELA ANTIGA (que continua inteira em `Equipamentos.tsx`):
 *
 *   · a lista NÃO depende da organização hidratada. Pede uma página de 50;
 *   · a busca acontece no SERVIDOR. Fabricante, nº de série, cliente e
 *     localização passam a ser pesquisáveis — a Fase 8 mediu que fabricante
 *     existia no cadastro e devolvia zero resultado;
 *   · o DOM é proporcional ao que se vê, não ao que a organização tem;
 *   · sem rede, a mesma busca responde pelo catálogo do aparelho, com selo.
 *
 * O QUE NÃO MUDA: o cartão, a rota, os modais de criar e importar, e o que
 * acontece ao clicar. O portão P9.2 exige conteúdo idêntico com a flag ligada e
 * desligada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CardCatalogo from './CardCatalogo';
import ModalCriarEquipamento from './ModalCriarEquipamento';
import { equipamentosPendentesLocais } from './equipamentoService';
import BuscaLista from '../../components/BuscaLista';
import SeletorTipo from '../../components/SeletorTipo';
import ModalFiltrosEquipamentos, {
  temAlgumFiltroEquip,
  type ValoresFiltroEquip,
} from './ModalFiltrosEquipamentos';
import {
  TETO_PAGINAS_RECORTE,
  empresasDoCatalogo,
  fabricantesDoCatalogo,
  filtrarCatalogo,
  precisaVarrerTudo,
} from '../../services/recorteCatalogo';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import { classeCategoria, iconeDoTipo } from '../../components/listaCobalto';
import { vidaDaBarra } from './barraVida';
import { Icone } from '../../components/Icone';
import * as buscaIndex from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo, OrdemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import { formatarValor, unidadeValida } from '../../calc/unidades';
import { rotaEquipamento } from '../../app/rotas';
import './equipamento.css';
import '../../pages/dashboard.css';
import '../../pages/relatorios.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha, em px. Corrigida por medição no 1º quadro. */
const ALT_GRADE = 430;
const ALT_LISTA = 52; // Cobalto: linha de tabela (medida real corrige)

/**
 * Ordem da lista: MAIS NOVOS NO TOPO (pedido do dono, 21/11/2026). As outras
 * telas do catálogo seguem por TAG. Servidor sem `buscar_equipamentos_recentes`
 * responde por TAG e a tela segue funcionando (ver `listarPagina`).
 */
const ORDEM: OrdemCatalogo = 'criacao';

export default function EquipamentosV9() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // ESTADO NA URL: recarregar, voltar do detalhe, compartilhar e o histórico do
  // navegador passam a funcionar (§13 do desenho).
  const termo = params.get('q') ?? '';
  const fTipo = params.get('tipo') ?? '';
  const fCategoria = params.get('categoria') ?? '';

  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Cobalto · chips de tipo com contagem (Todos / Vasos / Caldeiras / Autoclaves).
  // Contagens do SERVIDOR, com o termo e a categoria aplicados; sem resposta, o
  // número some (nunca "0" inventado).
  const [porTipo, setPorTipo] = useState<Record<string, number | null>>({});
  // Cobalto: a TABELA é a visão de abertura (protótipo); a grade de cartões
  // continua a um clique. A escolha fica neste aparelho.
  const [visao, setVisao] = useState<'grade' | 'lista'>(() => {
    try {
      return localStorage.getItem('cobalto.equip.visao') === 'grade' ? 'grade' : 'lista';
    } catch {
      return 'lista';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cobalto.equip.visao', visao);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }, [visao]);
  const [modalAberto, setModalAberto] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  /*
   * O filtro da barra: `tipo` e `categoria` continuam na URL (são parâmetros
   * da RPC e sobrevivem ao F5); `empresa` e `fabricante` são recorte do
   * cliente, e por isso vivem em estado — a URL guardaria um filtro que a
   * consulta não sabe aplicar.
   */
  const [recorte, setRecorte] = useState({ empresa: '', fabricante: '' });
  const [paginas, setPaginas] = useState(1);

  const filtroUi: ValoresFiltroEquip = useMemo(
    () => ({ tipo: fTipo, categoria: fCategoria, ...recorte }),
    [fTipo, fCategoria, recorte],
  );

  const filtros: FiltrosBusca = useMemo(
    () => ({ termo, tipo: fTipo, categoria: fCategoria }),
    [termo, fTipo, fCategoria],
  );

  /**
   * A RESPOSTA ANTIGA NÃO PODE SOBRESCREVER A NOVA.
   *
   * Duas defesas, e as duas são necessárias: o `AbortController` cancela a
   * requisição em voo, e o contador descarta o que chegar fora de ordem — uma
   * resposta já em trânsito quando o abort dispara ainda pode resolver. Sem
   * isso, a busca lenta de "vas" chega depois e apaga a de "vaso".
   */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  const trocarParam = useCallback(
    (chave: string, valor: string) => {
      const novos = new URLSearchParams(params);
      if (valor) novos.set(chave, valor);
      else novos.delete(chave);
      // `replace`: digitar na busca não pode encher o histórico do navegador de
      // um estado por tecla.
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
      const pagina = await buscaIndex.listarPagina(filtros, null, ctrl.signal, ORDEM);
      if (minha !== geracao.current) return; // chegou tarde: descarta

      // O catálogo se enche com o que já veio. Custo de rede: zero.
      void catalogo.guardar(pagina.itens);

      setOffline(false);
      // A ordem que o servidor APLICOU (pode ter caído para TAG) decide onde o
      // pendente entra: na ordem por criação, o recém-criado vai para o topo.
      setItens(
        buscaIndex.fundirLocais(
          pagina.itens,
          pendentesQueCasam(filtros),
          null,
          undefined,
          pagina.ordem ?? 'tag',
        ),
      );
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

      // SEM REDE: responde pelo catálogo do aparelho e DIZ isso.
      //
      // O que NÃO se faz aqui, e o desenho (§16) proíbe: cair em hidratação
      // integral. Trocar uma falha de rede por "baixar a organização inteira" é
      // o defeito, não o remédio.
      const local = await catalogo.paginaLocal(filtros, null);
      if (local.itens.length) {
        setOffline(true);
        setItens(buscaIndex.fundirLocais(local.itens, pendentesQueCasam(filtros), null));
        setCursor(local.proximoCursor);
        setTemMais(local.temMais);
        setContagem({ total: await catalogo.contarLocal(filtros), exato: true });
      } else {
        const pendentes = pendentesQueCasam(filtros);
        setItens(pendentes);
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
        : await buscaIndex.listarPagina(filtros, cursor, undefined, ORDEM);
      if (minha !== geracao.current) return;
      if (!offline) void catalogo.guardar(pagina.itens);
      setItens((antigos) => {
        // Dedupe por TAG: se uma escrita concorrente empurrar um item para
        // dentro da página que já veio, ele não pode aparecer duas vezes.
        const vistas = new Set(antigos.map((i) => i.tag));
        return [...antigos, ...pagina.itens.filter((i) => !vistas.has(i.tag))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
      // Conta as páginas para o teto da varredura do recorte do cliente.
      setPaginas((n) => n + 1);
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, offline, filtros]);

  useEffect(() => {
    const ctrl = new AbortController();
    const tipos = ['', 'vaso', 'caldeira', 'autoclave'];
    void Promise.all(
      tipos.map((t) =>
        buscaIndex
          .contar({ termo, tipo: t, categoria: fCategoria }, ctrl.signal)
          .then((c) => [t, c.total] as const)
          .catch(() => [t, null] as const),
      ),
    ).then((pares) => {
      if (!ctrl.signal.aborted) setPorTipo(Object.fromEntries(pares));
    });
    return () => ctrl.abort();
  }, [termo, fCategoria]);

  const temFiltro = !!(termo || fTipo || fCategoria || recorte.empresa || recorte.fabricante);

  /*
   * O recorte do cliente (empresa/fabricante) só pode ser lido como resposta
   * com a lista inteira em mãos: recortar a primeira página anunciaria "3
   * equipamentos da Petrobras" a quem tem 30. O teto existe para o parque
   * grande não virar varredura infinita — e o modal diz quando ele é atingido.
   */
  const recorteAtivo = { soComDocumento: false, ...recorte };
  const varrendo =
    precisaVarrerTudo(recorteAtivo) && temMais && !!cursor && paginas < TETO_PAGINAS_RECORTE;
  useEffect(() => {
    if (!varrendo || carregando || carregandoMais) return;
    void carregarMais();
  }, [varrendo, carregando, carregandoMais, carregarMais]);

  const varreduraIncompleta =
    precisaVarrerTudo(recorteAtivo) && temMais && paginas >= TETO_PAGINAS_RECORTE;

  const empresas = useMemo(() => empresasDoCatalogo(itens), [itens]);
  const fabricantes = useMemo(() => fabricantesDoCatalogo(itens), [itens]);
  const visiveis = useMemo(
    // `() => true`: aqui não há recorte por documento — esta é a lista de
    // equipamentos, e todos entram. O filtro que resta é empresa/fabricante.
    () => filtrarCatalogo(itens, recorteAtivo, () => true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itens, recorte.empresa, recorte.fabricante],
  );
  const contagemNaTela: Contagem | null = precisaVarrerTudo(recorteAtivo)
    ? { total: visiveis.length, exato: !temMais }
    : contagem;
  // Cobalto: zebra pelo índice (lista virtualizada).
  const posicao = useMemo(() => new Map(visiveis.map((it, n) => [it.tag, n])), [visiveis]);

  function limparFiltros() {
    setParams(new URLSearchParams(), { replace: true });
    setRecorte({ empresa: '', fabricante: '' });
  }

  const rodape = carregandoMais
    ? 'Carregando mais…'
    : temMais
      ? ''
      : itens.length > 0
        ? 'Fim da lista'
        : '';

  return (
    <div className="dashboard-page">
      {/*
        BARRA ÚNICA (07/09/2026).

        Eram DUAS faixas: um cabeçalho com "Equipamentos", a alternância de
        visualização, "Importar planilha" e "Criar equipamento"; e, abaixo, a
        busca com dois `<select>` sempre abertos e um "Limpar filtros". Sete
        controles em duas linhas para uma tela cuja ação é procurar um
        equipamento. Agora: contexto e visualização à esquerda, busca no meio,
        funil e criar à direita — o mesmo arranjo de /relatorios e /prontuarios.
      */}
      {/* `equip-topo`: escopo do layout de celular desta tela (tudo numa linha).
          O CSS da busca é compartilhado com /relatorios, /inspecoes etc. */}
      <div className="equip-topo">
      <BuscaLista
        valor={termo}
        aoMudar={(t) => trocarParam('q', t)}
        placeholder="Buscar por TAG, descrição, fabricante, nº de série, cliente…"
        carregando={carregando || varrendo}
        contagem={contagemNaTela}
        offline={offline}
        compacto
        antes={
          <div className="equip-barra-esq">
            {/* 21/11/2026: os quatro chips viraram UM seletor com caixinha —
                a barra inteira cabe numa linha, com o "Criar" dentro. */}
            <SeletorTipo valor={fTipo} aoMudar={(v) => trocarParam('tipo', v)} contagens={porTipo} />
          </div>
        }
      >
        {/* O funil no lugar dos selects: os filtros abrem num modal central. */}
        <button
          type="button"
          className={`fj-btn fj-btn-ghost equip-btn-filtro${temAlgumFiltroEquip(filtroUi) ? ' filtro-ativo' : ''}`}
          aria-haspopup="dialog"
          onClick={() => setFiltroAberto(true)}
        >
          <Icone nome="filter" tam={14} /> <span className="equip-btn-rotulo">Filtrar</span>
        </button>
            <div className="equip-visao" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={`equip-visao-btn${visao === 'grade' ? ' ativo' : ''}`}
                onClick={() => setVisao('grade')}
                aria-pressed={visao === 'grade'}
                title="Ver em grade"
              >
                <Icone nome="grid" tam={15} />
              </button>
              <button
                type="button"
                className={`equip-visao-btn${visao === 'lista' ? ' ativo' : ''}`}
                onClick={() => setVisao('lista')}
                aria-pressed={visao === 'lista'}
                title="Ver em lista"
              >
                <Icone nome="filetext" tam={15} />
              </button>
            </div>
        <button type="button" className="fj-btn fj-btn-primary equip-btn-criar" onClick={() => setModalAberto(true)}>
          <Icone nome="plus" tam={14} /> <span className="equip-btn-rotulo">Criar equipamento</span>
        </button>
      </BuscaLista>
      </div>

      {filtroAberto && (
        <ModalFiltrosEquipamentos
          valores={filtroUi}
          empresas={empresas}
          fabricantes={fabricantes}
          varreduraIncompleta={varreduraIncompleta}
          aoAplicar={(v) => {
            // Tipo e categoria vão para a URL (a consulta os aplica); empresa e
            // fabricante ficam no recorte do cliente.
            const novos = new URLSearchParams(params);
            if (v.tipo) novos.set('tipo', v.tipo); else novos.delete('tipo');
            if (v.categoria) novos.set('categoria', v.categoria); else novos.delete('categoria');
            setParams(novos, { replace: true });
            setRecorte({ empresa: v.empresa, fabricante: v.fabricante });
            setFiltroAberto(false);
          }}
          aoFechar={() => setFiltroAberto(false)}
        />
      )}

      <div className="equip-dropzone">
        {erro ? (
          // ERRO COM REPETIR — e nunca hidratação integral como plano B.
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="cloudoff" tam={22} /></div>
            <div className="fj-empty-title">{erro}</div>
            <button type="button" className="fj-btn fj-btn-ghost" style={{ marginTop: 10 }} onClick={() => void buscar()}>
              <Icone nome="refresh" tam={14} /> Tentar de novo
            </button>
          </div>
        ) : carregando && itens.length === 0 ? (
          <div className={visao === 'lista' ? 'lista-cards-horiz equip-lista' : 'vasos-grid'}>
            {/* Esqueleto, não spinner: a lista não salta quando os dados chegam. */}
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={visao === 'lista' ? 'card-equipamento-horiz esqueleto' : 'plate-card esqueleto'} />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome={temFiltro ? 'search' : 'box'} tam={22} /></div>
            <div className="fj-empty-title">
              {temFiltro ? `Nenhum equipamento para "${termo || 'os filtros atuais'}"` : 'Nenhum equipamento cadastrado ainda'}
            </div>
            {temFiltro ? (
              <button type="button" className="fj-link" onClick={limparFiltros}>Limpar a busca e os filtros</button>
            ) : (
              <>Clique em "Criar equipamento" para começar.</>
            )}
          </div>
        ) : (
          <>
          {visao === 'lista' && (
            <div className="eq2-linha lc-cab eq2-cab" aria-hidden="true">
              <span />
              <span>TAG</span>
              <span>Equipamento</span>
              <span>Cliente</span>
              <span>Categoria</span>
              <span className="eq2-num">PMTA</span>
              <span className="eq2-num">PTH</span>
              <span>Vida remanescente</span>
              <span>Resultado</span>
              <span />
            </div>
          )}
          <ListaVirtualizada
            key={visao}
            // `visiveis`, não `itens`: é aqui que o recorte por cliente e
            // fabricante aparece. Com `itens`, o contador dizia "1 resultado" e
            // a grade continuava com os cinco — visto em produção em
            // 07/09/2026.
            itens={visiveis}
            chaveDe={(i) => i.tag}
            alturaEstimada={visao === 'lista' ? ALT_LISTA : ALT_GRADE}
            classeGrade={visao === 'lista' ? 'equip-lista eq2-lista' : 'vasos-grid'}
            // Conjunto novo, rolagem no começo: filtrar com a lista rolada
            // deixaria o usuário olhando para o vazio enquanto o cabeçalho
            // anuncia resultados.
            chaveDoConjunto={`${termo}|${fTipo}|${fCategoria}|${recorte.empresa}|${recorte.fabricante}`}
            aoChegarNoFim={carregarMais}
            rodape={rodape}
            desenhar={(item) =>
              visao === 'lista' ? (
                <LinhaCatalogo
                  item={item}
                  zebra={(posicao.get(item.tag) ?? 0) % 2 === 1}
                  aoAbrir={() => navigate(rotaEquipamento(item.tag))}
                />
              ) : (
                <CardCatalogo item={item} />
              )
            }
          />
          </>
        )}
      </div>

      {modalAberto && (
        <ModalCriarEquipamento
          onClose={() => setModalAberto(false)}
          onCriado={(tag) => {
            setModalAberto(false);
            navigate(rotaEquipamento(tag));
          }}
        />
      )}
    </div>
  );
}

/** Os itens desta gaveta que este aparelho gravou e o servidor ainda não viu. */
function pendentesQueCasam(filtros: FiltrosBusca): ItemCatalogo[] {
  return equipamentosPendentesLocais()
    .filter((i) => !filtros.tipo || i.tipo === filtros.tipo)
    .filter((i) => !filtros.categoria || i.categoria === filtros.categoria)
    .filter((i) => catalogo.casaTermo(i, filtros.termo ?? ''));
}

/**
 * A linha do modo lista — redesign Cobalto (18/11/2026): a tabela do protótipo,
 * com cabeçalho de colunas. Mesmas fontes do cartão da grade (`CardCatalogo`):
 * PMTA e PTH ADOTADAS (§3-bis — sem adoção, "—", nunca a calculada), vida pela
 * mesma régua (`vidaDaBarra`) e o resultado do memorial.
 */
function LinhaCatalogo({ item, zebra, aoAbrir }: { item: ItemCatalogo; zebra?: boolean; aoAbrir: () => void }) {
  const unidade = unidadeValida(item.unidade);
  const vida = vidaDaBarra(item.vidaAnos);
  const tipo = item.tipo ?? 'outro';
  return (
    <button type="button" className="eq2-linha lc-linha" onClick={aoAbrir} data-z={zebra || undefined}>
      <span className={`lc-ico ${tipo}`} aria-hidden="true">
        <Icone nome={iconeDoTipo(item.tipo)} tam={18} />
      </span>
      <span className="lc-tag">{item.tag}</span>
      <span className="lc-nome">{item.descricao?.trim() || (ROTULO_TIPO[item.tipo ?? ''] ?? item.tipo ?? '—')}</span>
      <span className="lc-cli">{buscaIndex.textoCliente(item) || '—'}</span>
      <span>
        {item.categoria ? <span className={`lc-cat ${classeCategoria(item.categoria)}`}>Cat. {item.categoria}</span> : '—'}
      </span>
      <span className="lc-pressao eq2-num">{item.pmtaAdotadaMpa != null ? formatarValor(item.pmtaAdotadaMpa, unidade) : '—'}</span>
      <span className="lc-pressao eq2-num">{item.pthAdotadaMpa != null ? formatarValor(item.pthAdotadaMpa, unidade) : '—'}</span>
      <span className="eq2-vida">
        {vida ? (
          <>
            <span className="trk"><i style={{ width: `${vida.pct}%`, background: vida.cor }} /></span>
            <b style={{ color: vida.cor }}>{vida.texto}</b>
          </>
        ) : (
          <span className="sem">Não calculada</span>
        )}
      </span>
      <span>
        {item.resultado === 'APROVADO' ? (
          <span className="lc-selo ok">Aprovado</span>
        ) : item.resultado === 'REPROVADO' ? (
          <span className="lc-selo crit">Reprovado</span>
        ) : (
          <span className="lc-selo off">Pendente</span>
        )}
      </span>
      <Icone nome="chevright" tam={16} className="lc-seta" />
    </button>
  );
}
