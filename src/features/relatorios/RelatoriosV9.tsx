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
import { filtrarRascunhos, listarRascunhos, type RascunhoItem } from './rascunhos';
import {
  proximaInspecaoIso,
  qualProxima,
  rotuloSituacao,
  situacaoDaLinha,
  totalNaTela,
  unificarLista,
} from './listaUnificada';
import {
  arquivarRelatorio,
  desarquivarRelatorio,
  filtrarPorArquivo,
  idsArquivados,
  type ModoArquivo,
} from './arquivados';
import { excluirRelatorio, renomearRelatorio } from './historicoRelatorios';
import ModalFiltrosRelatorios, {
  FILTRO_VAZIO,
  temAlgumFiltro,
  type RecorteSituacao,
  type ValoresFiltro,
} from './ModalFiltrosRelatorios';
import { ROTULO_TIPO } from './CatalogoRelatoriosV9';
import ModalNovaInspecao from './ModalNovaInspecao';
import ModalRenomear from './ModalRenomear';
import ModalSelecionarEquipamento from './ModalSelecionarEquipamento';
import ModalRemocao from './ModalRemocao';
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

/** ISO → `DD/MM/AAAA HH:MM`. Usado só no bloco de rascunhos. */
export function dataHoraBr(iso: string | undefined): string {
  if (!iso) return SEM_DATA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return SEM_DATA;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Campo opcional da linha: ausente vira travessão, como na tela legada. */
function ou(v: string | null | undefined): string {
  return v && v.trim() !== '' ? v : '-';
}

/** A data da próxima inspeção, como a linha a mostra. */
function proximaInspecao(r: ItemRelatorio): string {
  const iso = proximaInspecaoIso(r);
  return iso ? dataBr(iso) : '—';
}

/** O que aquela data é — a coluna é estreita, e o tooltip completa. */
function rotuloProxima(r: ItemRelatorio): string {
  const qual = qualProxima(r);
  if (!qual) return 'Sem próxima inspeção registrada neste relatório';
  return qual === 'interna' ? 'Próxima inspeção INTERNA' : 'Próxima inspeção EXTERNA';
}

/** Altura estimada de uma linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 40;

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
  /**
   * CRIAR um relatório: a tela já perguntou tudo — equipamento, tipo e quais
   * folhas — e entrega a decisão pronta. Quem recebe abre o editor.
   *
   * A configuração vem junto de propósito. Antes esta prop era um
   * `() => void` que navegava para uma tela de seleção, e a montagem
   * perguntava tudo de novo do outro lado; agora a pergunta acontece uma vez
   * só, em modal, com a lista intacta atrás.
   */
  aoEscolherEquipamento?: (escolha?: {
    tag: string;
    tipo: TipoInspecao;
    documentos: string[];
  }) => void;
  /**
   * Continuar um RASCUNHO (10B.1) — abre o editor de onde parou.
   *
   * É outro verbo, e por isso outra prop: `aoAbrir` leva a um documento
   * emitido; este leva a um documento em edição.
   */
  aoContinuarRascunho?: (item: RascunhoItem) => void;
}

export default function RelatoriosV9({ aoAbrir, aoEscolherEquipamento, aoContinuarRascunho }: PropsRelatoriosV9) {
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
  /**
   * Recorte por SITUAÇÃO. Exato e sem consulta nova: rascunho é registro local,
   * finalizado é o que veio do servidor, arquivado é o modo de lista. Mora na
   * URL como os outros — o link precisa reproduzir a mesma lista.
   */
  const fSituacao = (params.get('situacao') ?? '') as RecorteSituacao;
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
   * O fluxo de CRIAR, em dois passos, sem sair da rota.
   *
   * `null` = fechado; `{ passo: 1 }` = escolhendo o equipamento;
   * `{ passo: 2, ... }` = configurando o que já foi escolhido. O passo 2
   * guarda o resumo do equipamento porque é o que o cabeçalho dele mostra —
   * e ele veio junto da seleção, sem leitura nova.
   */
  const [criacao, setCriacao] = useState<
    | null
    | { passo: 1 }
    | { passo: 2; tag: string; descricao: string | null; tipoEq: string | null }
  >(null);
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

  // ── Ações por relatório ────────────────────────────────────────────────────
  /** Ids fora da lista padrão. Arquivar NÃO apaga nada — ver `arquivados.ts`. */
  const [arquivados, setArquivados] = useState<Set<string>>(() => idsArquivados());
  const [renomeando, setRenomeando] = useState<{ item: ItemRelatorio; nome: string } | null>(null);
  const [arquivando, setArquivando] = useState<ItemRelatorio | null>(null);
  /** Rascunho escolhido para exclusão DEFINITIVA. */
  const [excluindoRascunho, setExcluindoRascunho] = useState<RascunhoItem | null>(null);
  const [ocupadoAcao, setOcupadoAcao] = useState(false);

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

  /**
   * O recorte de ARQUIVADOS é do cliente: a projeção do servidor não conhece
   * esse estado (seria coluna nova, e o SQL Editor segue sem abrir). Arquivar é
   * raro, então o custo é uma comparação de `Set` por linha já carregada.
   */
  const modoArquivo: ModoArquivo =
    params.get('arquivo') === 'arquivados' ? 'arquivados'
    : params.get('arquivo') === 'todos' ? 'todos'
    : 'ativos';
  const visiveis = useMemo(() => {
    const base = filtrarPorArquivo(
      filtrarPorEmpresa(itens, mapaEmpresas, fEmpresa),
      arquivados,
      modoArquivo,
    );
    // SITUAÇÃO: recorte exato, sem consulta nova. "Só rascunhos" tira os
    // emitidos; "só finalizados" tira os arquivados desta lista (arquivado é
    // outra situação, não um finalizado com etiqueta).
    if (fSituacao === 'rascunho') return [];
    if (fSituacao === 'finalizado') return base.filter((r) => !arquivados.has(r.relatorioId));
    if (fSituacao === 'arquivado') return base.filter((r) => arquivados.has(r.relatorioId));
    return base;
  }, [itens, mapaEmpresas, fEmpresa, arquivados, modoArquivo, fSituacao]);

  /**
   * 10B.1 · os RASCUNHOS, que não vêm do servidor.
   *
   * Eles não estão na projeção de propósito (ver `rascunhos.ts`): é por não
   * estarem lá que não geram vencimento, não vão ao Portal e não contam como
   * relatório emitido. A lista deles é local, leve, e é lida uma vez — nenhuma
   * requisição a mais nesta tela.
   */
  const [rascunhos, setRascunhos] = useState<RascunhoItem[]>(() => listarRascunhos());
  /**
   * Período, empresa e escopo são filtros do SERVIDOR; rascunho não está lá.
   *
   * A situação entra na mesma conta: pedir "finalizado" ou "arquivado" exclui
   * o rascunho por definição — ele não é nem um nem outro.
   */
  const filtroQueNaoAlcancaRascunho =
    !!(fDe || fAte || fEmpresa) ||
    escopo !== 'ativos' ||
    fSituacao === 'finalizado' ||
    fSituacao === 'arquivado' ||
    modoArquivo === 'arquivados';
  const rascunhosVisiveis = useMemo(
    () => (filtroQueNaoAlcancaRascunho ? [] : filtrarRascunhos(rascunhos, { termo, tipo: fTipo })),
    [rascunhos, filtroQueNaoAlcancaRascunho, termo, fTipo],
  );

  /**
   * A LISTA DA TELA — uma só (hotfix de UX, 05/09/2026).
   *
   * Antes eram duas tabelas empilhadas, com dois cabeçalhos: a tela parecia
   * clonada e, para achar um documento, era preciso decidir antes em qual das
   * duas procurar. Rascunho e emitido convivem na mesma listagem, separados
   * pelo selo de situação. Ver `listaUnificada.ts`.
   */
  const linhas = useMemo(
    () => unificarLista(rascunhosVisiveis, visiveis),
    [rascunhosVisiveis, visiveis],
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

  // ── Ações: renomear, arquivar, excluir rascunho ────────────────────────────
  const [erroAcao, setErroAcao] = useState('');

  async function salvarNome(nome: string) {
    if (!renomeando) return;
    setOcupadoAcao(true);
    setErroAcao('');
    try {
      // Só o rótulo. `renomearRelatorio` reescreve `nome` no registro e no
      // índice; `pdfRef`, `sha256` e os bytes no bucket não são tocados.
      const ok = await renomearRelatorio(renomeando.item.relatorioId, renomeando.item.tag, nome);
      if (!ok) {
        setErroAcao('Não foi possível renomear: o registro deste relatório não está neste aparelho.');
        return;
      }
      // A lista vem do servidor; atualiza a linha em memória para o nome novo
      // aparecer agora, sem esperar a projeção.
      setItens((atuais) =>
        atuais.map((i) => (i.relatorioId === renomeando.item.relatorioId ? { ...i, nome } : i)),
      );
      setRenomeando(null);
    } catch (e) {
      setErroAcao(`Não foi possível renomear: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupadoAcao(false);
    }
  }

  async function confirmarArquivar() {
    if (!arquivando) return;
    setOcupadoAcao(true);
    setErroAcao('');
    try {
      await arquivarRelatorio(arquivando.relatorioId, arquivando.tag);
      setArquivados(idsArquivados());
      setArquivando(null);
    } catch (e) {
      setErroAcao(`Não foi possível arquivar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupadoAcao(false);
    }
  }

  async function desarquivar(id: string) {
    await desarquivarRelatorio(id);
    setArquivados(idsArquivados());
  }

  /**
   * Exclusão DEFINITIVA de rascunho.
   *
   * `excluirRelatorio` apaga as três referências que um rascunho tem: o registro
   * `nr13_rel_<id>_<TAG>`, a entrada do índice do equipamento (que o rascunho
   * nem chega a ter) e o item de `nr13_rascunhos`. Tudo pelo caminho oficial de
   * mutação — a mesma fila durável do resto do sistema, nada de escrita direta.
   *
   * As fotos NÃO são apagadas de propósito: elas vivem em `nr13_inspecao_atual`
   * / `nr13_injecao_atual`, que são do CONTAINER de inspeção e não do rascunho.
   * Apagá-las levaria junto o trabalho de campo do equipamento.
   */
  async function confirmarExcluirRascunho() {
    if (!excluindoRascunho) return;
    setOcupadoAcao(true);
    setErroAcao('');
    try {
      await excluirRelatorio(excluindoRascunho.id, excluindoRascunho.tag);
      setRascunhos(listarRascunhos());
      setExcluindoRascunho(null);
    } catch (e) {
      setErroAcao(`Não foi possível excluir: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupadoAcao(false);
    }
  }

  /**
   * O recorte inteiro, num objeto — é o que o modal edita como rascunho.
   *
   * A URL continua sendo a fonte da verdade; isto é a leitura dela. O termo de
   * BUSCA fica de fora de propósito: ele é da barra, não do filtro, e some do
   * "Limpar filtros" pelo mesmo motivo — apagar o que a pessoa digitou ao
   * limpar o período seria o filtro comendo a busca.
   */
  const filtroAtual: ValoresFiltro = {
    de: fDe,
    ate: fAte,
    tipo: fTipo,
    empresa: fEmpresa,
    situacao: fSituacao,
    escopo,
    arquivo: modoArquivo,
  };

  /**
   * Aplica o rascunho do modal na URL, DE UMA VEZ.
   *
   * De uma vez importa: sete `trocarParam` seguidos são sete `setParams`, e
   * como cada um parte do `params` do render atual, os últimos apagariam os
   * primeiros. É o mesmo motivo de `trocarParam` existir com `replace`.
   */
  function aplicarFiltro(v: ValoresFiltro) {
    const novos = new URLSearchParams(params);
    const por = (chave: string, valor: string, vazio = '') => {
      if (valor && valor !== vazio) novos.set(chave, valor);
      else novos.delete(chave);
    };
    por('de', v.de);
    por('ate', v.ate);
    por('tipo', v.tipo);
    por('empresa', v.empresa);
    por('situacao', v.situacao);
    por('escopo', v.escopo, 'ativos');
    por('arquivo', v.arquivo, 'ativos');
    setParams(novos, { replace: true });
    setPainelAberto(false);
  }

  const temFiltro = temAlgumFiltro(filtroAtual);

  /**
   * Com empresa escolhida a contagem do servidor fala de outro conjunto (ela
   * não conhece o filtro), então quem conta é a lista da tela. Enquanto ainda
   * há páginas por vir, `exato: false` — o número ainda vai subir.
   */
  // A contagem fala da LISTA que está na tela, e o rascunho está nela desde
  // o hotfix de 05/09/2026. Contar só os emitidos anunciaria menos linhas do
  // que se vê — o mesmo relato de 'sumiu' com outro nome.
  const contagemNaTela: ContagemRelatorios | null = fEmpresa
    ? { total: totalNaTela(rascunhosVisiveis.length, visiveis.length), exato: !temMais, historicos: 0 }
    : contagem
      ? { ...contagem, total: totalNaTela(rascunhosVisiveis.length, contagem.total) }
      : null;

  /**
   * Limpa o RECORTE e preserva o termo digitado.
   *
   * Antes zerava a URL inteira, busca junto: quem tinha buscado "AUTOCLAVE" e
   * clicava em "limpar filtros" via o texto sumir do campo. Filtro e busca são
   * duas coisas, e o botão de uma não manda na outra.
   */
  function limparTudo() {
    aplicarFiltro(FILTRO_VAZIO);
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
        {/* BARRA · filtro à esquerda, busca ocupando o meio, criar à direita.
            O que RECORTA a lista vem antes dela; o campo cresce com a janela; a
            ação de criar fica no extremo oposto, sozinha, onde o olho procura a
            ação principal. Antes os três estavam à direita, na ordem
            criar → filtro, com o campo espremido à esquerda. */}
        <BuscaLista
          valor={termo}
          aoMudar={(t) => trocarParam('q', t)}
          placeholder="Buscar por TAG, equipamento, nome ou nº do relatório…"
          carregando={carregando}
          contagem={contagemNaTela}
          offline={offline}
          compacto
          antes={
            <button
              type="button"
              className={`fj-btn fj-btn-ghost rel-btn-filtro${temFiltro ? ' filtro-ativo' : ''}`}
              aria-haspopup="dialog"
              onClick={() => setPainelAberto(true)}
            >
              <Icone nome="filter" tam={14} /> <span className="rel-btn-rotulo">Período e tipo</span>
            </button>
          }
        >
          {aoEscolherEquipamento && (
            <button
              type="button"
              className="fj-btn fj-btn-primary rel-btn-criar"
              aria-haspopup="dialog"
              onClick={() => setCriacao({ passo: 1 })}
            >
              <Icone nome="plus" tam={14} /> <span className="rel-btn-rotulo">Criar relatório</span>
            </button>
          )}
        </BuscaLista>

      </div>

      {/* FILTRO EM MODAL. O painel antigo abria empurrando a lista para baixo e
          aplicava a cada `onChange` — mexer no "De" disparava consulta antes de
          o "Até" existir. Aqui o recorte é RASCUNHO até o Aplicar, e por isso
          existe um Cancelar de verdade. */}
      {painelAberto && (
        <ModalFiltrosRelatorios
          valores={filtroAtual}
          tipos={TIPOS_INSPECAO}
          empresas={mapaEmpresas.empresas}
          carregandoEmpresas={carregandoEmpresas}
          empresasIncompletas={!mapaEmpresas.completo}
          rotuloHistoricos={
            (contagem?.historicos ?? 0) > 0 ? ` (${rotuloHistoricos(contagem!.historicos)})` : ''
          }
          aoAplicar={aplicarFiltro}
          aoFechar={() => setPainelAberto(false)}
        />
      )}

      {/* CRIAR · passo 1. A lista continua atrás, no mesmo estado: busca,
          rolagem e filtro sobrevivem ao cancelamento. */}
      {criacao?.passo === 1 && (
        <ModalSelecionarEquipamento
          aoFechar={() => setCriacao(null)}
          aoEscolher={(tag, item) =>
            setCriacao({
              passo: 2,
              tag,
              descricao: item?.descricao ?? null,
              tipoEq: item?.tipo ? (ROTULO_TIPO[item.tipo] ?? item.tipo) : null,
            })
          }
        />
      )}

      {/* CRIAR · passo 2. É o MESMO `ModalNovaInspecao` que o editor sempre
          usou — tipo de inspeção, folhas e lotes de calibração saem da
          lógica que já existe. Aqui ele só ganhou de quem está falando e o
          caminho de volta. Confirmar entrega a escolha pronta ao pai, que
          abre o editor. */}
      {criacao?.passo === 2 && (
        <ModalNovaInspecao
          tag={criacao.tag}
          resumo={{ tag: criacao.tag, descricao: criacao.descricao, tipo: criacao.tipoEq }}
          aoVoltar={() => setCriacao({ passo: 1 })}
          onClose={() => setCriacao(null)}
          onGerar={(tipo, documentos) => {
            setCriacao(null);
            aoEscolherEquipamento?.({ tag: criacao.tag, tipo, documentos });
          }}
        />
      )}

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

      {/* Arquivado NÃO é apagado, e a tela repete isso onde ele reaparece: sem
          esta linha, um relatório que sumiu da lista padrão parece destruído. */}
      {modoArquivo !== 'ativos' && (
        <div className="rel-escopo-linha" role="status">
          <span>
            {modoArquivo === 'arquivados'
              ? 'Mostrando só os relatórios arquivados. Eles continuam inteiros — PDF, código de verificação e histórico intactos.'
              : 'Mostrando todos, inclusive os arquivados.'}
          </span>
          <button type="button" className="fj-link" onClick={() => trocarParam('arquivo', '')}>
            Voltar à lista padrão
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

      {renomeando && (
        <ModalRenomear
          nomeAtual={renomeando.nome}
          ocupado={ocupadoAcao}
          erro={erroAcao}
          aoFechar={() => {
            setRenomeando(null);
            setErroAcao('');
          }}
          aoSalvar={(nome) => void salvarNome(nome)}
        />
      )}

      {arquivando && (
        <ModalRemocao
          modo="arquivar"
          nome={ou(arquivando.nome ?? arquivando.codigo)}
          ocupado={ocupadoAcao}
          erro={erroAcao}
          aoFechar={() => {
            setArquivando(null);
            setErroAcao('');
          }}
          aoConfirmar={() => void confirmarArquivar()}
        />
      )}

      {excluindoRascunho && (
        <ModalRemocao
          modo="rascunho"
          nome={excluindoRascunho.codigo || excluindoRascunho.nome}
          ocupado={ocupadoAcao}
          erro={erroAcao}
          aoFechar={() => {
            setExcluindoRascunho(null);
            setErroAcao('');
          }}
          aoConfirmar={() => void confirmarExcluirRascunho()}
        />
      )}

      {linhas.length > 0 && (
        <div className="rel-tabela-v9" role="table" aria-label="Relatórios">
          {/* CAIXA DE ENTRADA · uma linha por documento.
              O nome do relatório tinha o número do documento e a empresa
              EMPILHADOS embaixo dele. Duas informações na mesma célula fazem a
              linha crescer e a varredura vertical parar de funcionar: o olho
              não sabe mais onde uma linha termina. O número virou COLUNA, com
              cabeçalho próprio; a célula do nome tem uma linha e só uma. */}
          <div className="rel-linha rel-linha-cabecalho" role="row">
            <span role="columnheader" aria-label="Arquivo" />
            <span role="columnheader">Relatório</span>
            <span role="columnheader">Nº relatório</span>
            <span role="columnheader">TAG</span>
            <span role="columnheader">Tipo</span>
            <span role="columnheader">Criação</span>
            <span role="columnheader">Validade</span>
            <span role="columnheader">Próxima</span>
            <span role="columnheader">Situação</span>
            <span role="columnheader">Ações</span>
          </div>

          {/* Virtualizada: o DOM passa a ser proporcional ao que se VÊ, não ao
              que a organização tem. "Carregar mais" acumula itens no estado, e
              sem isto 20 páginas seriam 1.000 linhas no DOM. */}
          <ListaVirtualizada
            itens={linhas}
            chaveDe={(l) => l.chave}
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
            desenhar={(linha) => {
              const sit = situacaoDaLinha(linha, arquivados);

              /* RASCUNHO na MESMA lista (hotfix de UX, 05/09/2026): duas
                 tabelas empilhadas faziam a tela parecer clonada. A diferença
                 vive no acento da linha, no ícone e no selo — não numa segunda
                 tabela. As ações continuam as de sempre: rascunho é o único que
                 pode ser destruído, porque nada nele foi emitido. */
              if (linha.tipo === 'rascunho') {
                const r = linha.rascunho;
                return (
                  <div className="rel-linha rel-linha-rascunho" role="row">
                    <span role="cell" className="rel-cel-icone">
                      <span className="rel-marca rel-marca-rascunho" title="Relatório em edição — ainda não finalizado">
                        <Icone nome="pencil" tam={15} />
                      </span>
                    </span>
                    <span role="cell" className="rel-cel-nome" title={r.nome}>
                      <b className="rel-nome-forte">{r.nome || r.codigo}</b>
                    </span>
                    {/* O "atualizado em" saiu da célula do nome e virou o
                        tooltip da criação: é metadado de quem já achou a linha,
                        não critério de varredura. */}
                    <span role="cell" className="rel-cel-codigo" data-rot="Nº relatório" title={r.codigo}>
                      {ou(r.codigo)}
                    </span>
                    <span role="cell" className="rel-cel-tag" data-rot="TAG">{r.tag}</span>
                    <span role="cell" className="rel-cel-tipo" data-rot="Tipo">{ou(r.tipo)}</span>
                    <span role="cell" data-rot="Criação" title={`atualizado em ${dataHoraBr(r.atualizadoEm)}`}>
                      {dataBr(r.criadoEm)}
                    </span>
                    {/* Rascunho não tem validade nem próxima inspeção: nada foi
                        emitido. Travessão, e não um valor inventado. */}
                    <span role="cell" data-rot="Validade">—</span>
                    <span role="cell" data-rot="Próxima">—</span>
                    <span role="cell" data-rot="Situação">
                      <span className="rel-selo rel-selo-rascunho">{rotuloSituacao(sit)}</span>
                    </span>
                    <span role="cell" className="rel-cel-acoes">
                      <button
                        type="button"
                        className="btn-icone cor-azul"
                        title="Continuar editando"
                        aria-label={`Continuar editando ${r.codigo || r.nome}`}
                        onClick={() => aoContinuarRascunho?.(r)}
                      >
                        <Icone nome="pencil" tam={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icone"
                        title="Excluir rascunho definitivamente"
                        aria-label={`Excluir o rascunho ${r.codigo || r.nome}`}
                        onClick={() => setExcluindoRascunho(r)}
                      >
                        <Icone nome="trash" tam={14} />
                      </button>
                    </span>
                  </div>
                );
              }

              const r = linha.item;
              return (
                <div className={`rel-linha${sit === 'arquivado' ? ' rel-linha-arquivada' : ''}`} role="row">
                  {/* A marca do arquivo: quadrada, do sprite do próprio sistema,
                      e vermelha só quando existe PDF arquivado (§7-quater). O
                      relatório legado — sem arquivo — fica com a marca neutra, e
                      o selo diz isso em vez de prometer um documento que não
                      está lá. Listar continua sem tocar arquivo nenhum. */}
                  <span role="cell" className="rel-cel-icone">
                    <span
                      className={`rel-marca${r.pdfRef ? ' rel-marca-pdf' : ''}`}
                      title={r.pdfRef ? 'Relatório finalizado (PDF arquivado)' : 'Relatório sem PDF arquivado (anterior ao arquivamento)'}
                    >
                      <Icone nome="filetext" tam={15} />
                    </span>
                  </span>
                  <span role="cell" className="rel-cel-nome" title={r.nome ?? r.codigo ?? ''}>
                    <b className="rel-nome-forte">{ou(r.nome ?? r.codigo)}</b>
                  </span>
                  {/* RASTREABILIDADE em coluna própria. O `title` da empresa
                      guarda o cliente sem gastar uma coluna: ele só existe
                      quando o mapa TAG → empresa já foi carregado (varredura do
                      catálogo), e coluna que às vezes está vazia por falta de
                      dado carregado é pior do que coluna que não existe. */}
                  <span
                    role="cell"
                    className="rel-cel-codigo"
                    data-rot="Nº relatório"
                    title={mapaEmpresas.porTag.get(r.tag) ?? r.codigo ?? ''}
                  >
                    {ou(r.codigo)}
                  </span>
                  <span role="cell" className="rel-cel-tag" data-rot="TAG">
                    {r.tag}
                    {!r.equipamentoAtivo && (
                      <span className="rel-selo-excluido" title="O equipamento deste relatório foi excluído do cadastro. O documento continua salvo.">
                        Equipamento excluído
                      </span>
                    )}
                  </span>
                  {/* data-rot: no celular a linha vira cartão e as colunas perdem
                      o cabeçalho — duas datas seguidas não dizem qual é a emissão
                      e qual é a validade. O rótulo volta por CSS. */}
                  {/* O tipo era um badge azul PREENCHIDO, repetido em toda
                      linha: numa lista onde quase tudo é "Inspeção Periódica",
                      a mancha de cor não distingue nada e come a atenção que a
                      situação precisa. Virou texto. */}
                  <span role="cell" className="rel-cel-tipo" data-rot="Tipo">{ou(r.tipo)}</span>
                  <span role="cell" data-rot="Criação">{dataBr(r.emissao)}</span>
                  <span role="cell" data-rot="Validade">{dataBr(r.validade)}</span>
                  {/* PRÓXIMA INSPEÇÃO: já vem na projeção (`proximaInterna` /
                      `proximaExterna`), então não custa requisição nenhuma. A mais
                      próxima das duas é a que importa para quem varre a lista. */}
                  <span role="cell" data-rot="Próxima" title={rotuloProxima(r)}>{proximaInspecao(r)}</span>
                  <span role="cell" data-rot="Situação">
                    <span className={`rel-selo rel-selo-${sit}`}>{rotuloSituacao(sit)}</span>
                  </span>
                  <span role="cell" className="rel-cel-acoes">
                    <button
                      type="button"
                      className="btn-icone cor-azul"
                      title="Visualizar"
                      aria-label={`Visualizar ${ou(r.nome ?? r.codigo)}`}
                      /* O ÚNICO ponto desta tela que toca o PDF. */
                      onClick={() => abrir(r)}
                    >
                      <Icone nome="eye" tam={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icone"
                      title="Editar nome"
                      aria-label={`Editar o nome de ${ou(r.nome ?? r.codigo)}`}
                      onClick={() => setRenomeando({ item: r, nome: r.nome ?? r.codigo ?? '' })}
                    >
                      <Icone nome="pencil" tam={14} />
                    </button>
                    {/* Relatório FINALIZADO não tem excluir: ele é um arquivo com
                        SHA que alimenta vencimento, Portal e Livro. O que existe é
                        tirar da lista — e a tela diz isso, em vez de oferecer um
                        botão que promete destruir e não destrói. */}
                    <button
                      type="button"
                      className="btn-icone"
                      title={arquivados.has(r.relatorioId) ? 'Trazer de volta para a lista' : 'Remover da lista (arquivar)'}
                      aria-label={
                        arquivados.has(r.relatorioId)
                          ? `Trazer ${ou(r.nome ?? r.codigo)} de volta`
                          : `Arquivar ${ou(r.nome ?? r.codigo)}`
                      }
                      onClick={() =>
                        arquivados.has(r.relatorioId)
                          ? void desarquivar(r.relatorioId)
                          : setArquivando(r)
                      }
                    >
                      <Icone nome={arquivados.has(r.relatorioId) ? 'refresh' : 'trash'} tam={14} />
                    </button>
                  </span>
                </div>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
