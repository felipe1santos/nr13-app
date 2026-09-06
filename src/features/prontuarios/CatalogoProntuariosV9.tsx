/**
 * Fase 9 · 9F.2.1 — a LISTA de `/prontuarios` sem baixar a organização inteira.
 *
 * ## O que muda em relação à lista antiga (que segue em `pages/Prontuarios.tsx`)
 *
 *   · os equipamentos vêm da PROJEÇÃO, 50 por vez e virtualizados, em vez de
 *     `listarEquipamentos()` — que começa com `await lerTudo()` e desfaz o boot
 *     leve da 9D (20 KB × 354 KB medidos) na primeira visita à tela;
 *   · existe BUSCA. A tela antiga não tem campo de texto nenhum: para achar um
 *     equipamento, rola-se a lista inteira;
 *   · o badge "Prontuário OK" vem do servidor, como um booleano. A tela antiga o
 *     escreve chamando `carregarProntuario(tag)` DENTRO do render, uma vez por
 *     cartão — 6,6 KB de `JSON.parse` por equipamento na média medida em
 *     produção em 29/08/2026, 25,7 KB no maior.
 *
 * ## Por que um COMPONENTE, e não uma tela inteira paralela
 *
 * Na 9F.1 a tela nova de `/inspecoes` nasceu inteira ao lado da antiga, porque
 * ali o que vinha depois da lista eram três cartões. Aqui o que vem depois é o
 * FORMULÁRIO do prontuário e o VISUALIZADOR das seis folhas — ~900 linhas que
 * são idênticas nos dois caminhos. Duplicá-las criaria duas versões do documento
 * que um engenheiro assina, e a próxima correção precisaria ser feita duas
 * vezes ou seria esquecida em uma. O que a flag troca é a FONTE DA LISTA e o
 * momento em que o equipamento chega ao cache — que é exatamente o escopo da
 * 9F.2.
 *
 * Este arquivo não importa nada de `pages/`: quando a 9G remover o caminho
 * antigo, a remoção não leva a lista nova junto.
 *
 * ## `null` não é `false`
 *
 * Numa organização cuja projeção ainda não foi refeita, `temProntuario` vem
 * `null` — e o badge SOME, em vez de escrever "Sem Prontuário" sobre um
 * equipamento que pode ter um. A regra mora em `rotuloProntuario`, no serviço,
 * onde a suíte alcança: o ambiente de teste é `node`, sem DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import FotoImg from '../../components/FotoImg';
import { Icone } from '../../components/Icone';
import * as buscaIndex from '../../services/buscaIndex';
import { rotuloProntuario } from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import { formatarValor } from '../../calc/unidades';
import type { SistemaUnidade } from '../../calc/unidades';
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

/** Altura da LINHA do histórico — compacta, no padrão de `/relatorios`. */
const ALT_LINHA_LISTA = 46;

export interface PropsCatalogoProntuarios {
  /** Termo aplicado — mora na URL, no pai. */
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Escolher um equipamento: o pai semeia a TAG e abre o formulário. */
  aoEscolher: (tag: string) => void;
  /**
   * UX · o mesmo catálogo serve a dois momentos, e eles não são a mesma tela.
   *
   * `lista` é o HISTÓRICO: os equipamentos que TÊM prontuário, em linha
   * compacta, que é o que o menu "Prontuários" abre.
   * `selecao` é a CRIAÇÃO: todos os equipamentos, para escolher um. Sem
   * recorte por documento — quem vai criar o primeiro prontuário de um
   * equipamento não pode ser filtrado para fora da própria lista.
   */
  modo?: 'lista' | 'selecao';
}

export default function CatalogoProntuariosV9({
  termo,
  aoMudarTermo,
  aoEscolher,
  modo = 'lista',
}: PropsCatalogoProntuarios) {
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // ── Fase 10A ───────────────────────────────────────────────────────────────
  // `tipo` viaja na consulta (a RPC tem o parâmetro); prontuário e empresa são
  // recorte do cliente — ver `filtroProntuarios.ts`.
  const [fTipo, setFTipo] = useState('');
  // Na seleção o recorte nasce DESLIGADO: a lista é de equipamentos, não de
  // prontuários existentes.
  const [filtro, setFiltro] = useState<RecorteCatalogo>(
    modo === 'selecao' ? { ...RECORTE_PADRAO, soComDocumento: false } : RECORTE_PADRAO,
  );
  /** Quantas páginas já vieram — o teto da varredura automática. */
  const [paginas, setPaginas] = useState(1);

  const filtros: FiltrosBusca = useMemo(() => ({ termo, tipo: fTipo }), [termo, fTipo]);

  /** A resposta antiga não pode sobrescrever a nova — igual à 9C/9E/9F.1. */
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
   * O recorte é do cliente, então a lista precisa estar INTEIRA antes de ele
   * poder ser lido como resposta: filtrar só a primeira página anunciaria "2
   * prontuários" a quem tem 30. Enquanto houver filtro ligado e páginas por
   * vir, a tela continua puxando — até o teto, que existe para o parque grande
   * não virar uma varredura infinita.
   */
  const varrendo = precisaVarrerTudo(filtro) && temMais && !!cursor && paginas < TETO_PAGINAS_RECORTE;
  useEffect(() => {
    if (!varrendo || carregando || carregandoMais) return;
    void carregarMais();
  }, [varrendo, carregando, carregandoMais, carregarMais]);

  /** A varredura parou no teto: a tela precisa DIZER que pode faltar coisa. */
  const varreduraIncompleta = precisaVarrerTudo(filtro) && temMais && paginas >= TETO_PAGINAS_RECORTE;

  const empresas = useMemo(() => empresasDoCatalogo(itens), [itens]);
  const visiveis = useMemo(() => filtrarCatalogo(itens, filtro, (i) => i.temProntuario), [itens, filtro]);
  /** Com recorte do cliente, quem conta é a tela — a contagem do servidor fala
      do conjunto sem filtro, e os dois números na mesma linha se contradizem. */
  const contagemNaTela: Contagem | null = precisaVarrerTudo(filtro)
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

      <div className="rel-filtros-painel pront-filtros">
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
          Empresa / cliente
          <select
            value={filtro.empresa}
            onChange={(e) => setFiltro((f) => ({ ...f, empresa: e.target.value }))}
          >
            <option value="">Todas</option>
            {empresas.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {/* O padrão é a tela DOS PRONTUÁRIOS. Quem quiser criar um para um
            equipamento que ainda não tem desliga o recorte aqui — o caminho
            continua existindo, só deixou de ser o barulho da lista. */}
        <label className="rel-filtro-check">
          <input
            type="checkbox"
            checked={filtro.soComDocumento}
            onChange={(e) => setFiltro((f) => ({ ...f, soComDocumento: e.target.checked }))}
          />
          Só equipamentos com prontuário
        </label>
        {(fTipo || filtro.empresa || !filtro.soComDocumento) && (
          <button
            type="button"
            className="fj-btn fj-btn-ghost"
            onClick={() => {
              setFTipo('');
              setFiltro(RECORTE_PADRAO);
            }}
          >
            Limpar filtros
          </button>
        )}
        {varreduraIncompleta && (
          <p className="rel-filtro-nota">
            O parque é grande demais para varrer inteiro de uma vez: podem faltar prontuários
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
              : filtro.soComDocumento
                ? 'Nenhum prontuário salvo ainda. Desmarque "Só equipamentos com prontuário" para criar o primeiro.'
                : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <ListaVirtualizada
            itens={visiveis}
            chaveDe={(i) => i.tag}
            alturaEstimada={modo === 'lista' ? ALT_LINHA_LISTA : ALT_LINHA}
            classeGrade={modo === 'lista' ? 'pront-lista' : 'lista-cards-horiz'}
            // Busca nova é lista nova: a rolagem volta ao começo. Sem isto, quem
            // busca com a lista rolada fica olhando para o vazio enquanto o
            // cabeçalho anuncia resultados — o defeito que o gate da 9F.1 pegou.
            chaveDoConjunto={`${termo}|${fTipo}|${filtro.empresa}|${filtro.soComDocumento}`}
            aoChegarNoFim={carregarMais}
            rodape={
              carregandoMais ? (
                <div className="rel-rodape-carregando" role="status">
                  Carregando mais…
                </div>
              ) : null
            }
            desenhar={(item) =>
              modo === 'lista' ? (
                <button type="button" className="pront-linha" onClick={() => aoEscolher(item.tag)}>
                  <span className="pront-linha-icone" aria-hidden>
                    <Icone nome="book" tam={16} />
                  </span>
                  <span className="pront-linha-nome">
                    <strong>{item.tag}</strong>
                    <span className="pront-linha-sub">{item.descricao ?? '—'}</span>
                  </span>
                  <span className="pront-linha-col">{item.tipo ? (ROTULO_TIPO[item.tipo] ?? item.tipo) : '—'}</span>
                  <span className="pront-linha-col">{item.clienteNome ?? '—'}</span>
                  <span className="pront-linha-col">{item.categoria ? `Categoria ${item.categoria}` : '—'}</span>
                  {rotuloProntuario(item.temProntuario) && (
                    <span className={`badge-relatorios ${item.temProntuario ? 'tem' : ''}`}>
                      {rotuloProntuario(item.temProntuario)}
                    </span>
                  )}
                </button>
              ) : (
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
                {/* O badge SOME quando ninguém verificou. "Sem Prontuário" ali
                    seria afirmar uma ausência que não foi medida. */}
                {rotuloProntuario(item.temProntuario) && (
                  <span className={`badge-relatorios ${item.temProntuario ? 'tem' : ''}`}>
                    {rotuloProntuario(item.temProntuario)}
                  </span>
                )}
              </button>
              )
            }
          />
        )}
      </div>
    </>
  );
}
