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
import ListaVirtualizada from '../../components/ListaVirtualizada';
import FotoImg from '../../components/FotoImg';
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

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 92;

export interface PropsCatalogoCalibracoes {
  /** Termo aplicado — mora na URL, no pai. */
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Escolher um equipamento: o pai semeia a TAG e abre o histórico. */
  aoEscolher: (tag: string) => void;
}

export default function CatalogoCalibracoesV9({
  termo,
  aoMudarTermo,
  aoEscolher,
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
  const [recorte, setRecorte] = useState<RecorteCatalogo>(RECORTE_PADRAO);
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
    () => filtrarCatalogo(itens, recorte, (i) => i.calibracoes),
    [itens, recorte],
  );
  const contagemNaTela: Contagem | null = precisaVarrerTudo(recorte)
    ? { total: visiveis.length, exato: !temMais }
    : contagem;

  return (
    <>
      <BuscaLista
        valor={termo}
        aoMudar={aoMudarTermo}
        placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
        carregando={carregando || varrendo}
        contagem={contagemNaTela}
        offline={offline}
      />

      <div className="rel-filtros-painel cal-filtros">
        <label>
          Tipo
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proprietário
          <select
            value={recorte.empresa}
            onChange={(e) => setRecorte((r) => ({ ...r, empresa: e.target.value }))}
          >
            <option value="">Todos</option>
            {empresas.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {/* O padrão é a tela de QUEM TEM calibração. Cadastrar a primeira de um
            equipamento continua possível — basta desmarcar. */}
        <label className="rel-filtro-check">
          <input
            type="checkbox"
            checked={recorte.soComDocumento}
            onChange={(e) => setRecorte((r) => ({ ...r, soComDocumento: e.target.checked }))}
          />
          Só equipamentos com calibração
        </label>
        {(fTipo || recorte.empresa || !recorte.soComDocumento) && (
          <button
            type="button"
            className="fj-btn fj-btn-ghost"
            onClick={() => {
              setFTipo('');
              setRecorte(RECORTE_PADRAO);
            }}
          >
            Limpar filtros
          </button>
        )}
        {varreduraIncompleta && (
          <p className="rel-filtro-nota">
            O parque é grande demais para varrer inteiro de uma vez: podem faltar equipamentos
            nesta lista. Use a busca por TAG ou o filtro de tipo para estreitar.
          </p>
        )}
      </div>

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="bloco-dados">
        {!carregando && !varrendo && visiveis.length === 0 && !erro ? (
          <p className="dashboard-vazio">
            {termo
              ? `Nenhum equipamento encontrado para ${termo}.`
              : recorte.soComDocumento
                ? 'Nenhum equipamento com calibração registrada. Desmarque "Só equipamentos com calibração" para cadastrar a primeira.'
                : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <ListaVirtualizada
            itens={visiveis}
            chaveDe={(i) => i.tag}
            alturaEstimada={ALT_LINHA}
            classeGrade="lista-cards-horiz"
            // Busca nova é lista nova: a rolagem volta ao começo. Sem isto, quem
            // busca com a lista rolada fica olhando para o vazio enquanto o
            // cabeçalho anuncia resultados — o defeito que o gate da 9F.1 pegou.
            chaveDoConjunto={`${termo}|${fTipo}|${recorte.empresa}|${recorte.soComDocumento}`}
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
                onClick={() => aoEscolher(item.tag)}
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
                    <span className="eq-tipo">
                      {item.tipo ? (ROTULO_TIPO[item.tipo] ?? item.tipo) : '—'}
                    </span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">Proprietário</span>
                    {/* Vem da MESMA linha da projeção. Na tela antiga isto era
                        `ler('nr13_emp_' + tag)` — três vezes por quadro. */}
                    <span className="eq-value">{textoCliente(item) || '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">Categoria</span>
                    <span className="eq-value">{item.categoria ?? '—'}</span>
                  </div>
                </div>
                {/* O rótulo SOME quando ninguém contou. "Nenhuma calibração" ali
                    seria afirmar uma ausência que não foi medida — e é o número
                    que decide se uma válvula vai para a bancada. */}
                {rotuloCalibracoes(item.calibracoes) && (
                  <span className={`badge-relatorios ${item.calibracoes ? 'tem' : ''}`}>
                    {rotuloCalibracoes(item.calibracoes)}
                  </span>
                )}
              </button>
            )}
          />
        )}
      </div>
    </>
  );
}
