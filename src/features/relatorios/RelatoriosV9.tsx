/**
 * Fase 9 · 9E — `/relatorios` com busca de verdade.
 *
 * A tela que esta substitui tem **zero** campo de texto: para achar um
 * relatório de dois anos atrás, o usuário escolhe o equipamento e rola. Aqui a
 * busca é global — por TAG, equipamento, código do relatório (inteiro ou só os
 * números) e período — e acontece no SERVIDOR, sobre a projeção.
 *
 * ## A regra bloqueante: LISTAR, BUSCAR, FILTRAR e PAGINAR = zero PDF
 *
 * Nada nesta tela toca o arquivo. As linhas trazem `pdfRef`, uma referência de
 * texto; o PDF só é resolvido quando o usuário CLICA em visualizar. É o que faz
 * a busca custar o mesmo em 10 e em 10.000 relatórios — e é o motivo de existir
 * um teste de rede só para isso (`buscaRelatorios.semPdf.test.ts`), que instrumenta
 * TODAS as portas de saída do cliente Supabase e reprova se qualquer uma que não
 * seja o índice for tocada durante o ciclo da tela.
 *
 * ## O que NÃO muda
 *
 * Os PDFs arquivados e seus SHA-256 continuam intocados; nenhum histórico é
 * regenerado. Esta etapa mexe em como a lista é OBTIDA, não no que ela
 * representa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import { Icone } from '../../components/Icone';
import {
  ErroBuscaRelatorios,
  contarRelatorios,
  listarPaginaRelatorios,
  type ContagemRelatorios,
  type CursorRelatorios,
  type FiltrosRelatorios,
  type ItemRelatorio,
} from '../../services/buscaRelatorios';
import { contarLocais, relatoriosLocais } from '../../services/relatoriosLocais';
import type { TipoInspecao } from './tipos';
import '../../pages/relatorios.css';

/**
 * Data em branco, como o usuário deve vê-la.
 *
 * O `0001-01-01` é mecanismo INTERNO de ordenação (ele mantém o relatório sem
 * data dentro da paginação, no fim da lista). Ele NUNCA chega à tela: ninguém
 * emitiu relatório no ano 1, e mostrar isso seria trocar um dado ausente por um
 * dado falso.
 */
export const SEM_DATA = 'Sem data';

/** `AAAA-MM-DD` → `DD/MM/AAAA`. Vazio, nulo ou a data-sentinela viram "Sem data". */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return SEM_DATA;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return SEM_DATA;
  if (m[1] === '0001') return SEM_DATA;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Campo opcional da linha: ausente vira travessão, como na tela legada. */
function ou(v: string | null | undefined): string {
  return v && v.trim() !== '' ? v : '-';
}

/** Altura estimada de uma linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 64;

/**
 * Os tipos de inspeção que o filtro oferece.
 *
 * Declarados aqui e não importados de `Relatorios.tsx`: aquele arquivo é a tela
 * LEGADA, e a V9 não pode depender dele — o rollout termina removendo o legado,
 * e uma importação cruzada faria a remoção derrubar esta tela junto.
 */
const TIPOS_INSPECAO: TipoInspecao[] = [
  'Inspeção Inicial',
  'Inspeção Periódica',
  'Inspeção Extraordinária',
];

export interface PropsRelatoriosV9 {
  /** Abre o relatório — é AQUI, e só aqui, que o PDF é resolvido. */
  aoAbrir?: (item: ItemRelatorio) => void;
  /** Volta ao fluxo por equipamento (criar relatório novo). */
  aoEscolherEquipamento?: () => void;
}

export default function RelatoriosV9({ aoAbrir, aoEscolherEquipamento }: PropsRelatoriosV9) {
  const [params, setParams] = useSearchParams();

  // ESTADO NA URL: recarregar, voltar do relatório e compartilhar preservam a
  // busca (§13 do desenho).
  const termo = params.get('q') ?? '';
  const fTipo = params.get('tipo') ?? '';
  const fDe = params.get('de') ?? '';
  const fAte = params.get('ate') ?? '';

  const [itens, setItens] = useState<ItemRelatorio[]>([]);
  const [cursor, setCursor] = useState<CursorRelatorios | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<ContagemRelatorios | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Respondendo pelo catálogo do aparelho — a tela precisa DIZER isso. */
  const [offline, setOffline] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);

  const filtros: FiltrosRelatorios = useMemo(
    () => ({ termo, tipo: fTipo, de: fDe, ate: fAte }),
    [termo, fTipo, fDe, fAte],
  );

  /**
   * A RESPOSTA ANTIGA NÃO PODE SOBRESCREVER A NOVA.
   *
   * Duas defesas, e as duas são necessárias: o `AbortController` cancela a
   * requisição em voo, e o contador de geração descarta o que chegar fora de
   * ordem — uma resposta já em trânsito quando o abort dispara ainda resolve.
   * Sem isso, a busca lenta de "vas" chega depois e apaga a de "vaso".
   */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  const trocarParam = useCallback(
    (chave: string, valor: string) => {
      const novos = new URLSearchParams(params);
      if (valor) novos.set(chave, valor);
      else novos.delete(chave);
      // `replace`: digitar não pode encher o histórico do navegador com um
      // estado por tecla.
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
      const pagina = await listarPaginaRelatorios(filtros, null, ctrl.signal);
      if (minha !== geracao.current) return; // chegou tarde: descarta

      setOffline(false);
      setItens(pagina.itens);
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);

      // O contador é enfeite: nunca derruba a lista, e a lista não o espera.
      void contarRelatorios(filtros, ctrl.signal)
        .then((c) => {
          if (minha === geracao.current) setContagem(c);
        })
        .catch(() => undefined);
    } catch (e) {
      if (minha !== geracao.current) return;
      if (ctrl.signal.aborted) return;

      // SEM RESPOSTA: responde pelo que o APARELHO já tem, e DIZ que é isso.
      //
      // O que NÃO se faz aqui, e o desenho (§16) proíbe: cair em hidratação
      // integral — trocar uma falha de rede por "baixe o acervo inteiro" é o
      // defeito, não o remédio. E o que também não se faz (lição da 9D):
      // mostrar lista vazia como se a organização não tivesse relatórios.
      // Vazio é uma AFIRMAÇÃO, e é a mesma frase que o sumiço de dado diz.
      const locais = relatoriosLocais(filtros);
      setCursor(null);
      setTemMais(false);
      if (locais.length > 0) {
        setOffline(true);
        setItens(locais);
        setContagem({ total: contarLocais(filtros), exato: true });
        setErro(null);
      } else {
        setOffline(false);
        setItens([]);
        setContagem(null);
        setErro(
          e instanceof ErroBuscaRelatorios
            ? 'Não foi possível consultar os relatórios. Eles continuam salvos — apenas não deu para listá-los agora.'
            : 'Sem conexão, e este aparelho ainda não tem o histórico baixado. Os relatórios continuam no servidor.',
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
      const pagina = await listarPaginaRelatorios(filtros, cursor);
      if (minha !== geracao.current) return;
      setItens((antigos) => {
        // Dedupe por id: uma escrita concorrente pode empurrar um item para
        // dentro da página que já veio, e ele não pode aparecer duas vezes.
        const vistos = new Set(antigos.map((i) => i.relatorioId));
        return [...antigos, ...pagina.itens.filter((i) => !vistos.has(i.relatorioId))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, filtros]);

  const temFiltro = !!(termo || fTipo || fDe || fAte);

  function limparTudo() {
    setParams(new URLSearchParams(), { replace: true });
  }

  return (
    <div className="rel-page">
      <div className="rel-cabecalho-busca">
        <BuscaLista
          valor={termo}
          aoMudar={(t) => trocarParam('q', t)}
          placeholder="Buscar por TAG, equipamento ou nº do relatório…"
          carregando={carregando}
          contagem={contagem}
          offline={offline}
        >
          <button
            type="button"
            className={`fj-btn fj-btn-ghost${temFiltro ? ' ativo' : ''}`}
            aria-expanded={painelAberto}
            onClick={() => setPainelAberto((v) => !v)}
          >
            <Icone nome="filter" tam={14} /> Período e tipo
          </button>
          {aoEscolherEquipamento && (
            <button type="button" className="fj-btn fj-btn-primario" onClick={aoEscolherEquipamento}>
              + Criar relatório
            </button>
          )}
        </BuscaLista>

        {painelAberto && (
          <div className="rel-filtros-painel">
            {/* Só filtros com suporte REAL na consulta: período e tipo. Status e
                profissional existem na projeção mas ainda não têm índice — o
                gate 9E-b4 exige benchmark antes, e filtro sem índice numa
                organização grande é uma varredura disfarçada de recurso. */}
            <label>
              De
              <input type="date" value={fDe} onChange={(e) => trocarParam('de', e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={fAte} onChange={(e) => trocarParam('ate', e.target.value)} />
            </label>
            <label>
              Tipo
              <select value={fTipo} onChange={(e) => trocarParam('tipo', e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_INSPECAO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {temFiltro && (
              <button type="button" className="fj-btn fj-btn-ghost" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </div>
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

      {!erro && !carregando && itens.length === 0 && (
        <div className="rel-vazio" role="status">
          {temFiltro ? (
            <>
              <p>
                Nenhum relatório encontrado
                {termo ? (
                  <>
                    {' '}
                    para <b>{termo}</b>
                  </>
                ) : null}
                .
              </p>
              <button type="button" className="fj-btn fj-btn-ghost" onClick={limparTudo}>
                Limpar busca
              </button>
            </>
          ) : (
            <p>Nenhum relatório salvo ainda.</p>
          )}
        </div>
      )}

      {itens.length > 0 && (
        <div className="rel-tabela-v9" role="table" aria-label="Relatórios">
          <div className="rel-linha rel-linha-cabecalho" role="row">
            <span role="columnheader">Relatório</span>
            <span role="columnheader">TAG</span>
            <span role="columnheader">Tipo</span>
            <span role="columnheader">Criação</span>
            <span role="columnheader">Validade</span>
            <span role="columnheader">Ações</span>
          </div>

          {/* Virtualizada: o DOM passa a ser proporcional ao que se VÊ, não ao
              que a organização tem. "Carregar mais" acumula itens no estado, e
              sem isto 20 páginas seriam 1.000 linhas no DOM. */}
          <ListaVirtualizada
            itens={itens}
            chaveDe={(r) => r.relatorioId}
            alturaEstimada={ALT_LINHA}
            classeGrade="rel-corpo-v9"
            aoChegarNoFim={carregarMais}
            rodape={
              carregandoMais ? (
                <div className="rel-rodape-carregando" role="status">
                  Carregando mais…
                </div>
              ) : null
            }
            desenhar={(r) => (
              <div className="rel-linha" role="row">
                <span role="cell" className="rel-cel-nome" title={r.nome ?? r.codigo ?? ''}>
                  {ou(r.nome ?? r.codigo)}
                </span>
                <span role="cell">{r.tag}</span>
                <span role="cell">
                  <span className="badge-tipo-inspecao">{ou(r.tipo)}</span>
                </span>
                <span role="cell">{dataBr(r.emissao)}</span>
                <span role="cell">{dataBr(r.validade)}</span>
                <span role="cell" className="rel-cel-acoes">
                  <button
                    type="button"
                    className="btn-icone cor-azul"
                    title="Visualizar"
                    /* O ÚNICO ponto desta tela que toca o PDF. */
                    onClick={() => aoAbrir?.(r)}
                  >
                    <Icone nome="eye" tam={15} />
                  </button>
                </span>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
