/**
 * Fase 9 · 9F.6 — o CATÁLOGO de `/relatorios` sem baixar a organização.
 *
 * ## O que muda em relação ao catálogo antigo (que segue em `pages/Relatorios.tsx`)
 *
 *   · os equipamentos vêm da PROJEÇÃO, 50 por vez, em vez de
 *     `listarEquipamentos()` — que começa com `await lerTudo()`, a hidratação
 *     INTEGRAL. Esta era a ÚLTIMA lista do sistema sem flag;
 *   · o cartão deixa de custar CINCO leituras por equipamento. `montarResumo`
 *     lia `nr13_info_`, `nr13_cat_`, `nr13_calc_`, `nr13_pref_unidade_` e
 *     **`nr13_fotos_`** — a família mais pesada do sistema, 92 KB numa TAG
 *     medida. Aqui categoria, PMTA e tipo vêm como COLUNAS, e a capa vem como
 *     `fotoRef` (referência do bucket, nunca a imagem);
 *   · a contagem de relatórios vem do servidor, UMA chamada para as 50 TAGs da
 *     página, sobre `relatorios_index`. A tela antiga fazia
 *     `listarIndice(tag).length` por cartão;
 *   · existe BUSCA. O catálogo antigo não tem campo de texto: para achar um
 *     equipamento, rola-se a lista inteira.
 *
 * ## O que esta tela NÃO toca
 *
 * O PDF, a geração do relatório e o histórico. Ela é o SELETOR: escolhe uma TAG
 * e devolve. Tudo o que vem depois do clique é o código de sempre — e é por isso
 * que ela é um COMPONENTE dentro de `Relatorios.tsx`, e não uma tela paralela.
 * Duplicar as ~1.400 linhas do visualizador criaria duas versões do documento
 * que a fiscalização lê.
 *
 * ## `null` não é zero
 *
 * A contagem por TAG vem de `contagensPorTag`, que devolve `null` quando a
 * consulta FALHA. Nesse caso o cartão escreve "—", não "0 Relatórios": dizer
 * zero sobre um equipamento que tem doze é a mesma mentira que o painel de
 * vencimentos aprendeu a não contar em 25/08/2026.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuscaLista from '../../components/BuscaLista';
import FotoImg from '../../components/FotoImg';
import * as buscaIndex from '../../services/buscaIndex';
import type { ItemCatalogo } from '../../services/buscaIndex';
import { contagensPorTag } from './catalogoRelatorios';
import { formatarValor } from '../../calc/unidades';
import type { SistemaUnidade } from '../../calc/unidades';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

export interface PropsCatalogoRelatorios {
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Escolher um equipamento: o pai semeia a TAG e abre o histórico. */
  aoEscolher: (tag: string) => void;
}

export default function CatalogoRelatoriosV9({
  termo,
  aoMudarTermo,
  aoEscolher,
}: PropsCatalogoRelatorios) {
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<buscaIndex.Contagem | null>(null);
  const [porTag, setPorTag] = useState<Map<string, number> | null>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  const filtros = useMemo<buscaIndex.FiltrosBusca>(() => ({ termo }), [termo]);

  /** A resposta antiga não pode sobrescrever a nova — igual às etapas anteriores. */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  /**
   * As contagens da PÁGINA, numa chamada só.
   *
   * Nunca derruba a lista: falhar aqui deixa o mapa `null` e o cartão escreve
   * "—". Um catálogo que sumisse porque o contador não respondeu seria trocar
   * uma informação a menos por uma tela a menos.
   */
  const contarDaPagina = useCallback(async (tags: string[], minha: number) => {
    const mapa = await contagensPorTag(tags);
    if (minha !== geracao.current) return;
    setPorTag((antigo) => {
      if (mapa === null) return null;
      const juntos = new Map(antigo ?? []);
      for (const [t, n] of mapa) juntos.set(t, n);
      // TAG que veio na página e não voltou do servidor tem ZERO — a consulta
      // respondeu, então a ausência é informação, não desconhecimento.
      for (const t of tags) if (!juntos.has(t)) juntos.set(t, 0);
      return juntos;
    });
  }, []);

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

      setItens(pagina.itens);
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
      setPorTag(new Map());
      void contarDaPagina(
        pagina.itens.map((i) => i.tag),
        minha,
      );

      void buscaIndex
        .contar(filtros, ctrl.signal)
        .then((c) => {
          if (minha === geracao.current) setContagem(c);
        })
        .catch(() => undefined); // contador é enfeite: nunca derruba a lista
    } catch (e) {
      if (minha !== geracao.current) return;
      if (ctrl.signal.aborted) return;
      setItens([]);
      setCursor(null);
      setTemMais(false);
      setContagem(null);
      // O que NÃO se faz aqui — e o desenho §16 proíbe — é cair na hidratação
      // integral. Trocar uma falha de rede por "baixar a organização inteira" é
      // o defeito, não o remédio.
      setErro(
        e instanceof buscaIndex.ErroBusca
          ? 'Não foi possível carregar os equipamentos.'
          : 'Sem conexão. Os equipamentos aparecem quando a internet voltar.',
      );
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, [filtros, contarDaPagina]);

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
      const pagina = await buscaIndex.listarPagina(filtros, cursor);
      if (minha !== geracao.current) return;
      setItens((antigos) => {
        const vistos = new Set(antigos.map((i) => i.tag));
        return [...antigos, ...pagina.itens.filter((i) => !vistos.has(i.tag))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
      void contarDaPagina(
        pagina.itens.map((i) => i.tag),
        minha,
      );
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, filtros, contarDaPagina]);

  function rotuloContagem(tag: string): string {
    if (porTag === null) return '— Relatórios';
    const n = porTag.get(tag);
    if (n === undefined) return '— Relatórios';
    return `${n} Relatórios`;
  }

  return (
    <>
      <BuscaLista
        valor={termo}
        aoMudar={aoMudarTermo}
        placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
        carregando={carregando}
        contagem={contagem}
        offline={false}
      />

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && itens.length === 0 && !erro ? (
        <p className="dashboard-vazio">
          {termo ? `Nenhum equipamento encontrado para ${termo}.` : 'Nenhum equipamento cadastrado ainda.'}
        </p>
      ) : (
        <>
          <div className="lista-cards-horiz">
            {itens.map((eq) => (
              <button
                type="button"
                key={eq.tag}
                className="card-equipamento-horiz"
                onClick={() => aoEscolher(eq.tag)}
              >
                <div className="card-eq-img">
                  {eq.fotoRef ? (
                    <FotoImg foto={{ ref: eq.fotoRef }} alt={eq.tag} variante="thumb" />
                  ) : (
                    <span className="card-eq-img-vazio">{eq.tag.slice(0, 2)}</span>
                  )}
                </div>
                <div className="card-eq-info">
                  <div className="eq-col">
                    <span className="eq-tag">{eq.tag}</span>
                    <span className="eq-tipo">{ROTULO_TIPO[eq.tipo ?? ''] ?? eq.tipo ?? '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">Categoria</span>
                    <span className="eq-value">{eq.categoria ?? '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">PMTA</span>
                    <span className="eq-value">
                      {eq.pmtaMpa !== null
                        ? formatarValor(eq.pmtaMpa, (eq.unidade as SistemaUnidade) ?? 'SI')
                        : '—'}
                    </span>
                  </div>
                </div>
                <span
                  className={`badge-relatorios ${(porTag?.get(eq.tag) ?? 0) > 0 ? 'tem' : ''}`}
                >
                  {rotuloContagem(eq.tag)}
                </span>
              </button>
            ))}
          </div>

          {temMais && (
            <div className="fj-mais">
              <button
                type="button"
                className="fj-btn fj-btn-ghost"
                onClick={() => void carregarMais()}
                disabled={carregandoMais}
              >
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
