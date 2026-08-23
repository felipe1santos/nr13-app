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
import ModalImportarPlanilha from './ModalImportarPlanilha';
import { extensaoAceita } from './importarPlanilhaService';
import { equipamentosPendentesLocais } from './equipamentoService';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import * as buscaIndex from '../../services/buscaIndex';
import type { Contagem, FiltrosBusca, ItemCatalogo } from '../../services/buscaIndex';
import * as catalogo from '../../services/catalogoLocal';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_IMPORTACAO } from '../../services/trial';
import { emitirAviso } from '../../services/eventos';
import { formatarValor } from '../../calc/unidades';
import { rotaEquipamento } from '../../app/rotas';
import type { SistemaUnidade } from '../../calc/unidades';
import './equipamento.css';
import './importar.css';
import '../../pages/dashboard.css';
import '../../pages/relatorios.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** Altura estimada de uma linha, em px. Corrigida por medição no 1º quadro. */
const ALT_GRADE = 430;
const ALT_LISTA = 92;

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
  const [visao, setVisao] = useState<'grade' | 'lista'>('grade');
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [arquivoSolto, setArquivoSolto] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erroArrasto, setErroArrasto] = useState<string | null>(null);

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
      const pagina = await buscaIndex.listarPagina(filtros, null, ctrl.signal);
      if (minha !== geracao.current) return; // chegou tarde: descarta

      // O catálogo se enche com o que já veio. Custo de rede: zero.
      void catalogo.guardar(pagina.itens);

      setOffline(false);
      setItens(buscaIndex.fundirLocais(pagina.itens, pendentesQueCasam(filtros), null));
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
        : await buscaIndex.listarPagina(filtros, cursor);
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
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, offline, filtros]);

  const temFiltro = !!(termo || fTipo || fCategoria);

  function limparFiltros() {
    setParams(new URLSearchParams(), { replace: true });
  }

  function abrirImportacao() {
    if (isTrial()) {
      emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_IMPORTACAO });
      return;
    }
    setArquivoSolto(null);
    setErroArrasto(null);
    setImportAberto(true);
  }

  function aoArrastarSobre(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setArrastando(true);
  }
  function aoSairDoArrasto(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setArrastando(false);
  }
  function aoSoltar(e: React.DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (isTrial()) {
      setErroArrasto(MSG_BLOQUEIO_IMPORTACAO);
      return;
    }
    const arquivo = e.dataTransfer.files?.[0];
    if (!arquivo) return;
    if (!extensaoAceita(arquivo.name)) {
      setErroArrasto(`"${arquivo.name}" não é uma planilha. Use .xlsx, .xls, .ods ou .csv.`);
      return;
    }
    setErroArrasto(null);
    setArquivoSolto(arquivo);
    setImportAberto(true);
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
      <div className="fj-page-head equip-head">
        <div className="equip-head-esq">
          <div className="sub">Equipamentos</div>
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
        </div>
        <div className="equip-head-acoes">
          {!isTrial() && (
            <button type="button" className="fj-btn fj-btn-ghost" onClick={abrirImportacao}>
              <Icone nome="planilha" tam={14} /> Importar planilha
            </button>
          )}
          <button type="button" className="fj-btn fj-btn-primary" onClick={() => setModalAberto(true)}>
            <Icone nome="plus" tam={14} /> Criar equipamento
          </button>
        </div>
      </div>

      {/* A BUSCA FICA VISÍVEL. Era o achado da Fase 8: o campo existia atrás do
          botão "Filtrar", e não pesquisava fabricante nem nº de série. */}
      <BuscaLista
        valor={termo}
        aoMudar={(t) => trocarParam('q', t)}
        placeholder="Buscar por TAG, descrição, fabricante, nº de série, cliente…"
        carregando={carregando}
        contagem={contagem}
        offline={offline}
      >
        <select className="fj-fselect" value={fTipo} onChange={(e) => trocarParam('tipo', e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo · Todos</option>
          <option value="vaso">Vaso de Pressão</option>
          <option value="caldeira">Caldeira</option>
          <option value="autoclave">Autoclave</option>
        </select>
        <select
          className="fj-fselect"
          value={fCategoria}
          onChange={(e) => trocarParam('categoria', e.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="">Categoria · Todas</option>
          {['I', 'II', 'III', 'IV', 'V'].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {temFiltro && (
          <button type="button" className="fj-link" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </BuscaLista>

      {erroArrasto && <p className="erro-form" style={{ marginBottom: 12 }}>{erroArrasto}</p>}

      <div className="equip-dropzone" onDragOver={aoArrastarSobre} onDragEnter={aoArrastarSobre} onDragLeave={aoSairDoArrasto} onDrop={aoSoltar}>
        {arrastando && (
          <div className="equip-drop-overlay">
            <Icone nome="planilha" tam={26} />
            Solte a planilha para importar os equipamentos
          </div>
        )}

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
        ) : itens.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome={temFiltro ? 'search' : 'box'} tam={22} /></div>
            <div className="fj-empty-title">
              {temFiltro ? `Nenhum equipamento para "${termo || 'os filtros atuais'}"` : 'Nenhum equipamento cadastrado ainda'}
            </div>
            {temFiltro ? (
              <button type="button" className="fj-link" onClick={limparFiltros}>Limpar a busca e os filtros</button>
            ) : (
              <>Clique em "Criar equipamento" para começar — ou arraste uma planilha aqui para importar vários de uma vez.</>
            )}
          </div>
        ) : (
          <ListaVirtualizada
            itens={itens}
            chaveDe={(i) => i.tag}
            alturaEstimada={visao === 'lista' ? ALT_LISTA : ALT_GRADE}
            classeGrade={visao === 'lista' ? 'lista-cards-horiz equip-lista' : 'vasos-grid'}
            aoChegarNoFim={carregarMais}
            rodape={rodape}
            desenhar={(item) =>
              visao === 'lista' ? (
                <LinhaCatalogo item={item} aoAbrir={() => navigate(rotaEquipamento(item.tag))} />
              ) : (
                <CardCatalogo item={item} />
              )
            }
          />
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
      {importAberto && (
        <ModalImportarPlanilha
          arquivoInicial={arquivoSolto}
          onClose={() => {
            setImportAberto(false);
            setArquivoSolto(null);
          }}
          onImportado={async () => {
            setImportAberto(false);
            setArquivoSolto(null);
            await buscar();
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

/** A linha do modo lista — mesmas colunas da tela antiga. */
function LinhaCatalogo({ item, aoAbrir }: { item: ItemCatalogo; aoAbrir: () => void }) {
  const unidade = (item.unidade as SistemaUnidade) || 'SI';
  return (
    <button type="button" className="card-equipamento-horiz" onClick={aoAbrir}>
      <div className="card-eq-img">
        {item.fotoRef ? (
          <FotoImg foto={{ ref: item.fotoRef }} alt={`Foto do equipamento ${item.tag}`} variante="thumb" />
        ) : (
          <span className="card-eq-img-vazio">{item.tag.slice(0, 2)}</span>
        )}
      </div>
      <div className="card-eq-info">
        <div className="eq-col">
          <span className="eq-tag">{item.tag}</span>
          <span className="eq-tipo">{ROTULO_TIPO[item.tipo ?? ''] ?? item.tipo ?? '—'}</span>
        </div>
        <div className="eq-col">
          <span className="eq-label">Categoria</span>
          <span className="eq-value">{item.categoria ?? '—'}</span>
        </div>
        <div className="eq-col">
          <span className="eq-label">PMTA</span>
          <span className="eq-value">{item.pmtaMpa != null ? formatarValor(item.pmtaMpa, unidade) : '—'}</span>
        </div>
        <div className="eq-col eq-col-empresa">
          <span className="eq-label">Empresa</span>
          <span className="eq-value">{buscaIndex.textoCliente(item) || '—'}</span>
        </div>
      </div>
    </button>
  );
}
