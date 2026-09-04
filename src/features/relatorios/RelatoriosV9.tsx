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
  rotuloHistoricos,
  type ContagemRelatorios,
  type CursorRelatorios,
  type EscopoRelatorios,
  type FiltrosRelatorios,
  type ItemRelatorio,
} from '../../services/buscaRelatorios';
import { contarLocais, relatoriosLocais } from '../../services/relatoriosLocais';
import VisualizadorPdf from '../../components/VisualizadorPdf';
import { artefatoDoItemBuscado } from './artefatoRelatorio';
import {
  MAPA_VAZIO,
  carregarEmpresasPorTag,
  filtrarPorEmpresa,
  type MapaEmpresas,
} from './empresasPorTag';
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
const ALT_LINHA = 46;

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
  /**
   * Abre um relatório que esta tela NÃO sabe abrir: o legado, anterior ao
   * §7-quater, que não tem PDF arquivado e só existe como receita.
   *
   * Todo relatório COM arquivo é aberto aqui mesmo, pelo `pdfRef`. Delegar a
   * abertura por padrão foi o defeito que bloqueou o rollout de 25/08/2026.
   */
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
  /**
   * Fase 10A · empresa/cliente. Filtro do CLIENTE, não da consulta: a projeção
   * de relatórios não guarda cliente (ver `empresasPorTag.ts`). Ele vive na URL
   * como os outros para o link continuar reproduzindo a mesma lista.
   */
  const fEmpresa = params.get('empresa') ?? '';
  // O escopo mora na URL como todo o resto: quem abre o link do histórico
  // continua no histórico depois de recarregar. Sem parâmetro = 'ativos', que é
  // o conjunto que a tela antiga sempre mostrou.
  const escopo: EscopoRelatorios =
    params.get('escopo') === 'historicos' ? 'historicos'
    : params.get('escopo') === 'todos' ? 'todos'
    : 'ativos';

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
  /**
   * O documento aberto — e o ÚNICO estado desta tela que toca um arquivo.
   *
   * Enquanto for `null`, a busca inteira (listar, filtrar, paginar) não resolve
   * `pdfRef` nenhum: é o critério bloqueante da 9E, e é o que faz a tela custar o
   * mesmo em 10 e em 10.000 relatórios.
   */
  const [aberto, setAberto] = useState<ItemRelatorio | null>(null);
  const [erroDoc, setErroDoc] = useState<string | null>(null);
  /** Mapa TAG → empresa. Só é buscado quando o painel de filtros abre. */
  const [mapaEmpresas, setMapaEmpresas] = useState<MapaEmpresas>(MAPA_VAZIO);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);

  const filtros: FiltrosRelatorios = useMemo(
    () => ({ termo, tipo: fTipo, de: fDe, ate: fAte, escopo }),
    [termo, fTipo, fDe, fAte, escopo],
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
        setContagem({
          total: contarLocais(filtros),
          exato: true,
          // Offline o aviso conta pelo mesmo caminho local, para os dois
          // números continuarem falando do mesmo conjunto.
          historicos: escopo === 'ativos' ? contarLocais({ ...filtros, escopo: 'historicos' }) : 0,
        });
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
  }, [filtros, escopo]);

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

  // O mapa de empresas custa uma requisição por 50 equipamentos. Ele só é
  // buscado quando o painel de filtros abre (ou quando a URL já traz empresa
  // escolhida): abrir a tela continua custando exatamente o que custava.
  const precisaMapa = painelAberto || !!fEmpresa;
  /**
   * "Já pedi" mora num REF, não no conteúdo do mapa.
   *
   * A primeira versão desta guarda perguntava `mapaEmpresas.porTag.size > 0` —
   * e numa organização em que nenhum equipamento tem cliente o mapa volta
   * VAZIO, a condição continua falsa para sempre e o efeito se redispara a cada
   * quadro. Medido no navegador antes de sair daqui: **789 chamadas a
   * `buscar_equipamentos` em 8 segundos**. Resultado vazio é uma resposta, e
   * precisa ser lembrado como tal.
   */
  const mapaPedido = useRef(false);
  useEffect(() => {
    if (!precisaMapa || mapaPedido.current) return;
    mapaPedido.current = true;
    const ctrl = new AbortController();
    setCarregandoEmpresas(true);
    void carregarEmpresasPorTag(ctrl.signal)
      .then((m) => setMapaEmpresas(m))
      .catch(() => {
        // Falhou: pode tentar de novo quando o painel for reaberto.
        mapaPedido.current = false;
      })
      .finally(() => setCarregandoEmpresas(false));
    return () => ctrl.abort();
  }, [precisaMapa]);

  const visiveis = useMemo(
    () => filtrarPorEmpresa(itens, mapaEmpresas, fEmpresa),
    [itens, mapaEmpresas, fEmpresa],
  );

  /**
   * Com empresa escolhida, a lista precisa estar INTEIRA antes de o filtro
   * poder ser lido como resposta: filtrar só a primeira página mostraria "3
   * relatórios" para quem tem 40, sem nada na tela dizendo que faltam. Então a
   * paginação é puxada até o fim enquanto o filtro estiver ligado.
   */
  useEffect(() => {
    if (!fEmpresa || !temMais || carregando || carregandoMais) return;
    void carregarMais();
  }, [fEmpresa, temMais, carregando, carregandoMais, carregarMais]);

  const temFiltro = !!(termo || fTipo || fDe || fAte || fEmpresa);

  /**
   * Com empresa escolhida a contagem do servidor fala de outro conjunto (ela
   * não conhece o filtro), então quem conta é a lista da tela. Enquanto ainda
   * há páginas por vir, `exato: false` — o número ainda vai subir.
   */
  const contagemNaTela: ContagemRelatorios | null = fEmpresa
    ? { total: visiveis.length, exato: !temMais, historicos: 0 }
    : contagem;

  function limparTudo() {
    setParams(new URLSearchParams(), { replace: true });
  }

  /**
   * ABRIR O DOCUMENTO — o caminho que faltava e que reprovou o rollout de 25/08.
   *
   * Relatório finalizado É UM ARQUIVO (§7-quater): a tela serve o PDF arquivado,
   * byte a byte, e não remonta nada. Por isso o clique resolve aqui mesmo, em vez
   * de navegar para uma rota que a flag impede de renderizar a tela antiga.
   *
   * Sem `pdfRef` o relatório é LEGADO — anterior ao arquivamento — e só a tela
   * antiga sabe remontá-lo a partir da receita. Aí, e só aí, a abertura é
   * delegada; o que não pode voltar a acontecer é o clique não fazer nada.
   */
  function abrir(r: ItemRelatorio) {
    setErroDoc(null);
    if (artefatoDoItemBuscado(r)) setAberto(r);
    else aoAbrir?.(r);
  }

  const artefatoAberto = aberto ? artefatoDoItemBuscado(aberto) : null;
  if (aberto && artefatoAberto) {
    return (
      <div className="rel-page rel-doc-aberto">
        <div className="rel-doc-barra no-print">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setAberto(null)}>
            <Icone nome="arrowleft" tam={14} /> Voltar à busca
          </button>
          <div className="rel-doc-titulo">
            <b>{ou(aberto.nome ?? aberto.codigo)}</b>
            <span>
              {aberto.tag} · {ou(aberto.tipo)} · emissão {dataBr(aberto.emissao)}
            </span>
          </div>
        </div>

        {erroDoc && (
          <div className="rel-aviso-erro" role="status">
            {erroDoc}
          </div>
        )}

        <VisualizadorPdf
          artefato={artefatoAberto}
          nomeArquivo={aberto.nome ?? aberto.codigo ?? aberto.tag}
          onErro={setErroDoc}
        />

        {/* O SHA-256 é o que permite provar depois que o arquivo não foi
            trocado. Ele é do documento, não da tela, então é exibido junto. */}
        <p className="rel-doc-rodape no-print">
          {aberto.paginas ?? '—'} páginas · SHA-256 {aberto.sha256 ?? '—'}
        </p>
      </div>
    );
  }

  return (
    <div className="rel-page">
      <div className="rel-cabecalho-busca">
        <BuscaLista
          valor={termo}
          aoMudar={(t) => trocarParam('q', t)}
          placeholder="Buscar por TAG, equipamento ou nº do relatório…"
          carregando={carregando}
          contagem={contagemNaTela}
          offline={offline}
          compacto
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
            <label>
              Empresa / cliente
              <select
                value={fEmpresa}
                onChange={(e) => trocarParam('empresa', e.target.value)}
                disabled={carregandoEmpresas}
              >
                <option value="">
                  {carregandoEmpresas ? 'Carregando empresas…' : 'Todas'}
                </option>
                {mapaEmpresas.empresas.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {/* O que era a faixa âmbar no meio da tela. A contagem entra no
                RÓTULO da opção: quem procura o relatório de um equipamento
                excluído acha aqui, e quem não procura não é interrompido. */}
            <label>
              Equipamentos
              <select value={escopo} onChange={(e) => trocarParam('escopo', e.target.value)}>
                <option value="">Só os do cadastro atual</option>
                <option value="historicos">
                  Só de equipamento excluído
                  {(contagem?.historicos ?? 0) > 0 ? ` (${rotuloHistoricos(contagem!.historicos)})` : ''}
                </option>
                <option value="todos">Todos</option>
              </select>
            </label>
            {temFiltro && (
              <button type="button" className="fj-btn fj-btn-ghost" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
            {/* O filtro por empresa é do CLIENTE (a projeção de relatórios não
                guarda cliente). Quando a varredura do catálogo bate no teto, a
                tela DIZ — filtro que esconde linha calado é o mesmo relato de
                dado sumido, com outro nome. */}
            {!mapaEmpresas.completo && (
              <p className="rel-filtro-nota">
                O parque é grande demais para varrer inteiro: o filtro por empresa pode não
                alcançar todos os equipamentos. Use também a busca por TAG.
              </p>
            )}
          </div>
        )}
      </div>

      {/*
        RELATÓRIO DE EQUIPAMENTO EXCLUÍDO CONTINUA ALCANÇÁVEL — SÓ SAIU DA
        FAIXA ÂMBAR NO MEIO DA TELA.

        A faixa dizia "12 relatórios de equipamento excluído estão fora desta
        lista" acima do primeiro item, em amarelo, todas as vezes. O escopo
        agora é um `<select>` DENTRO do painel de filtros, com a contagem no
        próprio rótulo da opção: a informação não se perdeu, deixou de ocupar a
        área da listagem.

        Quando o escopo NÃO é o padrão, sobra uma linha discreta — cinza, de
        uma altura — porque uma lista que mudou de conjunto sem dizer é a
        mesma queixa de dado sumido.
      */}
      {escopo !== 'ativos' && (
        <div className="rel-escopo-linha" role="status">
          <span>
            {escopo === 'historicos'
              ? 'Mostrando apenas relatórios de equipamentos excluídos.'
              : 'Mostrando todos os relatórios, inclusive os de equipamentos excluídos.'}
          </span>
          <button type="button" className="fj-link" onClick={() => trocarParam('escopo', '')}>
            Voltar aos ativos
          </button>
        </div>
      )}

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!erro && !carregando && visiveis.length === 0 && (
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
          ) : escopo === 'historicos' ? (
            <p>Nenhum relatório de equipamento excluído.</p>
          ) : (
            <p>Nenhum relatório salvo ainda.</p>
          )}
        </div>
      )}

      {visiveis.length > 0 && (
        <div className="rel-tabela-v9" role="table" aria-label="Relatórios">
          <div className="rel-linha rel-linha-cabecalho" role="row">
            <span role="columnheader" aria-label="Arquivo" />
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
            itens={visiveis}
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
                {/* Ícone de PDF: o arquivo real que o dono do sistema mandou
                    usar (`public/icones/pdf.jpg`). Ele marca o relatório
                    FINALIZADO — o que tem `pdfRef`, o artefato do §7-quater.
                    Relatório legado, sem arquivo, ganha a marca vazia: a
                    diferença entre "tem PDF arquivado" e "só existe como
                    receita" é o que a coluna comunica.

                    A imagem é decorativa aqui (o texto ao lado já diz o que a
                    linha é), por isso `alt=""`. E ela NÃO é o PDF: continua
                    valendo a regra da 9E — listar não toca arquivo nenhum. */}
                <span role="cell" className="rel-cel-icone">
                  {r.pdfRef ? (
                    <img
                      className="rel-ico-pdf"
                      src="/icones/pdf.webp"
                      alt=""
                      loading="lazy"
                      title="Relatório finalizado (PDF arquivado)"
                    />
                  ) : (
                    <span className="rel-ico-sem-pdf" title="Relatório sem PDF arquivado (anterior ao arquivamento)">
                      <Icone nome="filetext" tam={15} />
                    </span>
                  )}
                </span>
                <span role="cell" className="rel-cel-nome" title={r.nome ?? r.codigo ?? ''}>
                  {ou(r.nome ?? r.codigo)}
                  {mapaEmpresas.porTag.get(r.tag) && (
                    <small className="rel-cel-empresa">{mapaEmpresas.porTag.get(r.tag)}</small>
                  )}
                </span>
                <span role="cell" className="rel-cel-tag">
                  {r.tag}
                  {/* Marcar é obrigação: sem isto a linha afirmaria, por
                      omissão, que o relatório pertence a um equipamento que
                      ainda está no cadastro. */}
                  {!r.equipamentoAtivo && (
                    <span className="rel-selo-excluido" title="O equipamento deste relatório foi excluído do cadastro. O documento continua salvo.">
                      Equipamento excluído
                    </span>
                  )}
                </span>
                {/* data-rot: no celular a linha vira cartão e as colunas perdem
                    o cabeçalho — duas datas seguidas não dizem qual é a emissão
                    e qual é a validade. O rótulo volta por CSS. */}
                <span role="cell" data-rot="Tipo">
                  <span className="badge-tipo-inspecao">{ou(r.tipo)}</span>
                </span>
                <span role="cell" data-rot="Criação">{dataBr(r.emissao)}</span>
                <span role="cell" data-rot="Validade">{dataBr(r.validade)}</span>
                <span role="cell" className="rel-cel-acoes">
                  <button
                    type="button"
                    className="btn-icone cor-azul"
                    title="Visualizar"
                    /* O ÚNICO ponto desta tela que toca o PDF. */
                    onClick={() => abrir(r)}
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
