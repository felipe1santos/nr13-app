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
  TETO_PAGINAS_RECORTE,
  categoriasDoCatalogo,
  empresasDoCatalogo,
  filtrarCatalogo,
  precisaVarrerTudo,
  type RecorteCatalogo,
} from '../../services/recorteCatalogo';
import ModalFiltrosProntuarios, {
  FILTRO_PRONT_PADRAO,
  temAlgumFiltroPront,
  type ValoresFiltroPront,
} from './ModalFiltrosProntuarios';
import { emissaoAtual } from './emissaoProntuario';
import '../../pages/prontuarios.css';

export const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** O que o filtro oferece como tipo — a mesma tabela, em forma de lista. */
const TIPOS_FILTRO = Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => ({ valor, rotulo }));

/**
 * A SITUAÇÃO de um prontuário, e de onde cada uma sai.
 *
 * `emitido` vem de `nr13_pront_emitido_<TAG>` — a lista de emissões da Fase 12,
 * ~180 bytes por revisão, lida do cache em memória. É lida SÓ para as linhas
 * que estão na tela (a lista é virtualizada, ~15 por vez); ler o prontuário
 * inteiro por linha é o que a 9F.2 removeu daqui, e não volta.
 *
 * `salvo` e `sem` saem de `temProntuario`, que é COLUNA da projeção.
 * `null` continua sendo `null`: sem selo, porque ninguém verificou.
 */
type SituacaoPront = 'emitido' | 'salvo' | 'sem' | null;

export function situacaoDoItem(
  temProntuario: boolean | null | undefined,
  temEmissao: boolean,
): SituacaoPront {
  if (temEmissao) return 'emitido';
  if (temProntuario === null || temProntuario === undefined) return null;
  return temProntuario ? 'salvo' : 'sem';
}

const ROTULO_SITUACAO: Record<Exclude<SituacaoPront, null>, string> = {
  emitido: 'EMITIDO',
  salvo: 'SALVO',
  sem: 'SEM PRONTUÁRIO',
};

/** `AAAA-MM-DD…` ou ISO → `DD/MM/AAAA`. Vazio vira travessão. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

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
  /**
   * O que vai à DIREITA da barra — o "+ Criar prontuário" do pai.
   *
   * Vem por prop porque a barra é UMA linha: filtro, busca e ação principal no
   * mesmo conjunto. Antes o botão de criar morava num cabeçalho ACIMA da busca,
   * e a tela tinha três faixas empilhadas antes da primeira linha da lista.
   */
  acoes?: React.ReactNode;
  /** Abrir os dados do prontuário para edição (lápis da linha). */
  aoEditar?: (tag: string) => void;
  /** Excluir o prontuário daquele equipamento (lixeira da linha). */
  aoExcluir?: (tag: string) => void;
}

export default function CatalogoProntuariosV9({
  termo,
  aoMudarTermo,
  aoEscolher,
  modo = 'lista',
  acoes,
  aoEditar,
  aoExcluir,
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
  /**
   * O recorte inteiro, num objeto — é o que o modal edita como rascunho.
   *
   * Na SELEÇÃO ele nasce sem recorte nenhum: a lista ali é de equipamentos,
   * para escolher um, e quem vai criar o PRIMEIRO prontuário de um equipamento
   * não pode ser filtrado para fora da própria lista.
   */
  const [f, setF] = useState<ValoresFiltroPront>(
    modo === 'selecao' ? { tipo: '', empresa: '', categoria: '', situacao: '' } : FILTRO_PRONT_PADRAO,
  );
  const [filtroAberto, setFiltroAberto] = useState(false);
  const fTipo = f.tipo;
  /** O recorte do CLIENTE, derivado do filtro — `tipo` vai na consulta. */
  const filtro: RecorteCatalogo = {
    soComDocumento: f.situacao === 'com',
    soSemDocumento: f.situacao === 'sem',
    empresa: f.empresa,
    categoria: f.categoria,
  };
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
  const categorias = useMemo(() => categoriasDoCatalogo(itens), [itens]);
  const visiveis = useMemo(() => filtrarCatalogo(itens, filtro, (i) => i.temProntuario), [itens, filtro]);
  /** Com recorte do cliente, quem conta é a tela — a contagem do servidor fala
      do conjunto sem filtro, e os dois números na mesma linha se contradizem. */
  const contagemNaTela: Contagem | null = precisaVarrerTudo(filtro)
    ? { total: visiveis.length, exato: !temMais }
    : contagem;

  return (
    <>
      {/* BARRA · filtro à esquerda, busca ocupando o vão, criar à direita —
          o mesmo conjunto de trabalho de `/relatorios`. Na SELEÇÃO a barra é só
          o campo: dentro do modal não há o que filtrar nem o que criar. */}
      <BuscaLista
        valor={termo}
        aoMudar={aoMudarTermo}
        placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
        carregando={carregando || varrendo}
        contagem={contagemNaTela}
        offline={offline}
        compacto={modo === 'lista'}
        antes={
          modo === 'lista' ? (
            <button
              type="button"
              className={`fj-btn fj-btn-ghost pront-btn-filtro${temAlgumFiltroPront(f) ? ' filtro-ativo' : ''}`}
              aria-haspopup="dialog"
              onClick={() => setFiltroAberto(true)}
            >
              <Icone nome="filter" tam={14} /> <span className="pront-btn-rotulo">Filtrar</span>
            </button>
          ) : undefined
        }
      >
        {modo === 'lista' ? acoes : null}
      </BuscaLista>

      {filtroAberto && (
        <ModalFiltrosProntuarios
          valores={f}
          tipos={TIPOS_FILTRO}
          empresas={empresas}
          categorias={categorias}
          varreduraIncompleta={varreduraIncompleta}
          aoAplicar={(v) => {
            setF(v);
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

      <div className="bloco-dados">
        {!carregando && !varrendo && visiveis.length === 0 && !erro ? (
          <p className="dashboard-vazio">
            {termo
              ? `Nenhum equipamento encontrado para ${termo}.`
              : filtro.soComDocumento
                ? 'Nenhum prontuário salvo ainda. Use "+ Criar prontuário" para fazer o primeiro.'
                : filtro.soSemDocumento
                  ? 'Todos os equipamentos já têm prontuário.'
                  : 'Nenhum equipamento cadastrado ainda.'}
          </p>
        ) : (
          <>
          {/* CABEÇALHO DA LISTA. Sem ele, cinco valores em sequência não dizem
              qual é o quê — e no modo seleção ele não existe, porque lá a lista
              é de escolha, não de leitura. */}
          {modo === 'lista' && (
            <div className="pront-linha pront-linha-cabecalho" role="row" aria-hidden>
              <span />
              <span>Equipamento</span>
              <span>Tipo</span>
              <span>Empresa / cliente</span>
              <span>Categoria</span>
              <span>Emitido em</span>
              <span>Situação</span>
              <span className="pront-col-acoes">Ações</span>
            </div>
          )}
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
                <LinhaProntuario
                  item={item}
                  aoAbrir={aoEscolher}
                  aoEditar={aoEditar}
                  aoExcluir={aoExcluir}
                />
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
          </>
        )}
      </div>
    </>
  );
}

/**
 * Uma linha do histórico de prontuários.
 *
 * Componente à parte porque ela LÊ a emissão vigente daquele equipamento, e
 * isso precisa acontecer uma vez por linha RENDERIZADA — a lista é virtualizada,
 * então são ~15, não o parque inteiro. `emissaoAtual` lê um array de ~180 bytes
 * por revisão do cache em memória; o que a 9F.2 tirou daqui foi
 * `carregarProntuario(tag)` no render, que eram 6,6 KB de `JSON.parse` por
 * cartão, e isso não volta.
 */
function LinhaProntuario({
  item,
  aoAbrir,
  aoEditar,
  aoExcluir,
}: {
  item: ItemCatalogo;
  aoAbrir: (tag: string) => void;
  aoEditar?: (tag: string) => void;
  aoExcluir?: (tag: string) => void;
}) {
  const emissao = useMemo(() => emissaoAtual(item.tag), [item.tag]);
  const situacao = situacaoDoItem(item.temProntuario, !!emissao);
  const nome = item.descricao?.trim() || item.tag;
  return (
    <div className={`pront-linha${situacao ? ` pront-linha-${situacao}` : ''}`} role="row">
      <span className="pront-linha-icone" aria-hidden>
        <Icone nome="book" tam={15} />
      </span>
      {/* O nome do equipamento é o título; a TAG, a identificação embaixo — e
          ela não some quando a descrição existe, porque é por TAG que este
          sistema conversa. */}
      <span className="pront-linha-nome" title={nome}>
        <strong>{nome}</strong>
        <span className="pront-linha-sub">{item.tag}</span>
      </span>
      <span className="pront-linha-col">{item.tipo ? (ROTULO_TIPO[item.tipo] ?? item.tipo) : '—'}</span>
      <span className="pront-linha-col" title={item.clienteNome ?? ''}>{item.clienteNome ?? '—'}</span>
      <span className="pront-linha-col">{item.categoria ?? '—'}</span>
      {/* A data é a da EMISSÃO arquivada. Prontuário salvo e não emitido não
          tem data de documento — travessão, e não a data de hoje. */}
      <span className="pront-linha-col pront-linha-data">{dataCurta(emissao?.geradoEm)}</span>
      <span className="pront-linha-situacao">
        {situacao ? (
          <span className={`pront-selo pront-selo-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
        ) : (
          /* `null` não é `false`: sem selo, porque ninguém verificou. */
          <span className="fj-dash">—</span>
        )}
      </span>
      <span className="pront-linha-acoes">
        <button
          type="button"
          className="btn-icone cor-azul"
          title={situacao === 'sem' || situacao === null ? 'Criar o prontuário deste equipamento' : 'Abrir o prontuário'}
          aria-label={`Abrir o prontuário de ${item.tag}`}
          onClick={() => aoAbrir(item.tag)}
        >
          <Icone nome="eye" tam={14} />
        </button>
        {aoEditar && (
          <button
            type="button"
            className="btn-icone"
            title="Editar os dados do prontuário"
            aria-label={`Editar os dados do prontuário de ${item.tag}`}
            onClick={() => aoEditar(item.tag)}
          >
            <Icone nome="pencil" tam={14} />
          </button>
        )}
        {aoExcluir && situacao !== 'sem' && situacao !== null && (
          <button
            type="button"
            className="btn-icone cor-vermelho"
            title="Excluir o prontuário deste equipamento"
            aria-label={`Excluir o prontuário de ${item.tag}`}
            onClick={() => aoExcluir(item.tag)}
          >
            <Icone nome="trash" tam={14} />
          </button>
        )}
      </span>
    </div>
  );
}
