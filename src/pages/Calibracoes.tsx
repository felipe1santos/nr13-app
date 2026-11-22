import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFocoPreso } from '../components/useFocoPreso';
import { paramsSomenteLeitura, travarIframeSomenteLeitura } from '../features/documentos/somenteLeituraDoc';
import { Icone } from '../components/Icone';
import ModalComponente from '../features/calibracoes/ModalComponente';
import AjudaCalibracoes from '../features/calibracoes/AjudaCalibracoes';
import '../features/calibracoes/ilustracoes.css';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { rotuloTipoEquipamento } from '../features/relatorios/pdfVetorial/rotulos';
import {
  arquivoCalibracao,
  excluirCalibracao,
  listarCalibracoes,
  salvarCalibracao,
} from '../features/calibracoes/calibracaoService';
import {
  ehCongelada,
  ehEmitido,
  ehInterna,
  ehOficial,
  ehTerceiro,
  rotuloOrigem,
  type DadosCalibracao,
} from '../features/calibracoes/tipos';
import { definicaoDe } from '../features/calibracoes/instrumentos';
import {
  avisosEmissao,
  listarResponsaveis,
  pendenciasEmissao,
  snapshotResponsavel,
} from '../features/calibracoes/responsavelCalibracao';
import { emitirCertificado } from '../features/calibracoes/emissaoCertificado';
import { artefatoDaCalibracao, nomeArquivoCalibracao } from '../features/calibracoes/artefatoCalibracao';
import ModalCalibracaoTerceiro from '../features/calibracoes/ModalCalibracaoTerceiro';
import VisualizadorPdf, { baixarPdfArquivado, imprimirPdfArquivado } from '../components/VisualizadorPdf';
import ModalNovoLote from '../features/calibracoes/ModalNovoLote';
import ModalDetalhesLote from '../features/calibracoes/ModalDetalhesLote';
import {
  FILTRO_LOTES_VAZIO,
  calibracaoDoItem,
  dataDoLote,
  itensDoLote,
  filtrarLotes,
  ordenarLotes,
  podeExcluirLote,
  progressoLote,
  type FiltroLotes,
  type SituacaoLote,
} from '../features/calibracoes/lote';
import {
  converterForm,
  formDeRascunho,
  formDeRevisao,
  formDoComponente,
  novoIdCalibracao,
  type FormDados,
} from '../features/calibracoes/formCalibracao';
import FormularioCalibracao, { type AcaoSalvar } from '../features/calibracoes/FormularioCalibracao';
import ModalEscolherComponente from '../features/calibracoes/ModalEscolherComponente';
import ModalHistoricoComponente from '../features/calibracoes/ModalHistoricoComponente';
import ModalSelecionarEquipamento from '../features/relatorios/ModalSelecionarEquipamento';
import VisualizadorCalibracao from '../features/calibracoes/VisualizadorCalibracao';
import PreviaCertificado from '../features/calibracoes/PreviaCertificado';
import {
  baixarPreviaCertificado,
  ehRascunhoInterno,
  imprimirPreviaCertificado,
} from '../features/calibracoes/acoesPreviaCertificado';
// 9F.3 · a lista pela projeção e o contrato de semeadura da TAG.
import CatalogoCalibracoesV9 from '../features/calibracoes/CatalogoCalibracoesV9';
import { GradeAcessorios, TabelaRealizadas, TopoEquipamentoCal } from '../features/calibracoes/PainelEquipamentoCal';
import {
  abrirEquipamentoParaCalibracoes,
} from '../features/calibracoes/catalogoCalibracoes';
import {
  criarLote,
  excluirLote,
  listarComponentes,
  listarLotes,
  salvarComponente,
  salvarLote,
  type ComponenteCal,
  type LoteCal,
} from '../features/calibracoes/componentesService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import { exportarPdf } from '../features/relatorios/pdfService';
import { documentosBloqueados } from '../services/trial';
import '../pages/relatorios.css';
import './calibracoes.css';
import PaginaA4 from '../components/PaginaA4';
import RecusaPalco from '../components/RecusaPalco';
import { usePalcoDocumento } from '../features/documentos/usePalcoDocumento';

type Tela = 'equipamentos' | 'historico' | 'visualizador' | 'verDados';

/**
 * Reestruturação (19/09/2026) · a calibração aberta na JANELA (modal ⇄ tela
 * cheia). A página por trás não muda de estado: fechar devolve o usuário
 * exatamente onde estava.
 */
interface Calibrando {
  tag: string;
  titulo: string;
  form: FormDados;
  componente: ComponenteCal | null;
  lotes: LoteCal[];
  loteId: string;
  /** Rascunho sendo continuado: grava no MESMO id. */
  idExistente?: string;
}

/** Nova calibração: escolher o equipamento, depois o componente. */
type NovaCal =
  | { passo: 'equipamento' }
  | { passo: 'componente'; tag: string; componentes: ComponenteCal[]; calibracoes: DadosCalibracao[]; lotes: LoteCal[] };

function parseDateBR(d: string): number {
  const p = d.split('/');
  if (p.length !== 3) return 0;
  return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
}


export default function Calibracoes() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  /**
   * O certificado abre num MODAL sobre a tela atual (22/11/2026) — antes
   * trocava de tela. `tela` continua sendo o FUNDO (histórico ou dados).
   */
  const [vendo, setVendo] = useState(false);
  const [tag, setTag] = useState('');
  const [cals, setCals] = useState<DadosCalibracao[]>([]);
  const [calAtual, setCalAtual] = useState<DadosCalibracao | null>(null);
  const [calibrando, setCalibrando] = useState<Calibrando | null>(null);
  /** Contagem por TAG que este aparelho já conhece (ver `CatalogoCalibracoesV9.contagensLocais`). */
  const [contagensLocais, setContagensLocais] = useState<Record<string, number>>({});
  // Só as OFICIAIS: é o que a projeção conta (`calibracoes_index` não recebe
  // rascunho). Contar o rascunho aqui fazia o número da coluna mudar de
  // definição conforme o aparelho tinha ou não aberto o equipamento.
  const atualizarContagem = (t: string) =>
    setContagensLocais((c) => ({ ...c, [t]: listarCalibracoes(t).filter(ehOficial).length }));
  /**
   * Acessórios por TAG que este aparelho já leu do CADASTRO — a mesma conta
   * do painel do equipamento (`componentes.length`). Ver `acessoriosServidor.ts`.
   */
  const [acessoriosLocais, setAcessoriosLocais] = useState<Record<string, number>>({});
  const conhecerComponentes = (t: string, lista: ComponenteCal[]) =>
    setAcessoriosLocais((a) => (a[t] === lista.length ? a : { ...a, [t]: lista.length }));
  /** O cadastro do equipamento ABERTO mudou: a tela e a contagem andam juntas. */
  const definirComponentes = (t: string, lista: ComponenteCal[]) => {
    setComponentes(lista);
    conhecerComponentes(t, lista);
  };
  /** Busca do seletor de equipamento da Nova calibração (a da lista não é tocada). */
  const [termoNova, setTermoNova] = useState('');
  const [novaCal, setNovaCal] = useState<NovaCal | null>(null);
  /** Histórico de UM componente (clique no acessório). */
  const [historicoComp, setHistoricoComp] = useState<ComponenteCal | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  /** Fase 2 (D) · o acessório para o qual se registra certificado de laboratório. */
  const [terceiroPara, setTerceiroPara] = useState<{ comp: ComponenteCal; loteId?: string; dataLote?: string; tag?: string } | null>(null);
  /** Fase 2 (C.3) · emissão em curso / o que a recusou. */
  const [emitindo, setEmitindo] = useState(false);
  const [erroEmissao, setErroEmissao] = useState<string[] | null>(null);
  const responsaveis = listarResponsaveis();
  // Emitido ou de laboratório: a tela serve o ARQUIVO, sem palco.
  const artefatoAtual = artefatoDaCalibracao(calAtual);
  const arquivoAtual = calAtual ? arquivoCalibracao(calAtual) : null;

  // Palco: a folha CERTIFICADO-CAL-* lê `nr13_calibracao_item_<id>` e
  // `nr13_minha_empresa` do localStorage no DOMContentLoaded. Esta tela montava o
  // iframe sem preparar nada — na v2 o dado mora no Map/IndexedDB, então "Ver
  // como fica o documento" abria o certificado EM BRANCO. Só monta na tela do
  // visualizador: nas outras não há iframe e segurar a trava do palco à toa
  // impediria o relatório de abrir em seguida.
  const palco = usePalcoDocumento(tag, `cal-${calAtual?.id ?? 'nenhuma'}-${versao}`, {
    // Fase 7 · rascunho interno sai do gerador vetorial, sem palco.
    pular: !vendo || !!artefatoAtual || !arquivoAtual || ehRascunhoInterno(calAtual),
    // Calibração CONCLUÍDA (oficial) é somente leitura: o que a folha tiver
    // de campo não volta para o banco. Era o defeito: registro antigo sem PDF
    // arquivado abria a folha editável e a ponte gravava o que se digitava.
    somenteLeitura: ehOficial(calAtual),
  });
  /**
   * 9F.3.5 · qual lista responde. Lido UMA vez, no primeiro render: trocar a
   * fonte no meio da sessão faria a rolagem alternar entre dois cursores, e o
   * usuário veria itens repetirem ou sumirem. É a mesma decisão de sessão de
   * `armazenamentoV2Ativo`.
   */
  /** Termo da busca da lista nova. A antiga não tem campo de texto. */
  const [termoBusca, setTermoBusca] = useState('');
  const [toast, setToast] = useState('');
  // Componentes (válvulas/manômetros) + lotes de calibração do equipamento aberto
  const [eqAtual, setEqAtual] = useState<EquipamentoResumo | null>(null);
  const [componentes, setComponentes] = useState<ComponenteCal[]>([]);
  const [lotes, setLotes] = useState<LoteCal[]>([]);
  const [compForm, setCompForm] = useState<ComponenteCal | null>(null);
  /** "Como funciona" — o texto que era faixa fixa no topo da tela. */
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  /** Criação (`lote: null`) ou edição de um lote; `null` = modal fechado. */
  const [loteEditando, setLoteEditando] = useState<{ novo: boolean; lote: LoteCal | null } | null>(null);
  const [filtroLotes, setFiltroLotes] = useState<FiltroLotes>(FILTRO_LOTES_VAZIO);
  const [abaCal, setAbaCal] = useState<'calibrar' | 'realizadas'>('calibrar');






  // Pré-rasteriza o certificado em #print-root (1 imagem A4) quando o preview abre — igual ao
  // relatório/prontuário. Sem isto, o Ctrl+P/botão Imprimir cairia no print nativo do iframe
  // (sai em tiras / só 1 página). Limpa ao sair do visualizador.
  useEffect(() => {
    if (!vendo) return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.cal-preview');
    if (!preview) return;
    const iframes = Array.from(preview.querySelectorAll('iframe'));
    Promise.all(
      iframes.map((f) =>
        f.contentDocument && f.contentDocument.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true })),
      ),
    )
      .then(() => new Promise((r) => setTimeout(r, 500)))
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.cal-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [vendo, calAtual, versao]);


  /**
   * 9F.3.3 · abrir pela TAG, vinda do catálogo do servidor.
   *
   * SEMEIA ANTES DE LER. Com a flag ligada a lista não hidratou nada, então as
   * quatro famílias desta tela (`nr13_calibracoes_`, `nr13_componentes_cal_`,
   * `nr13_lotes_cal_` e, por id, `nr13_calibracao_item_`) só existem no cache
   * depois de `carregarEquipamento`. Ler antes abriria o histórico VAZIO — e
   * sem erro nenhum, que é a forma cara de errar. A ordem mora em
   * `abrirEquipamentoParaCalibracoes` e é travada por
   * `semeaduraCalibracoes.test.ts`.
   */
  async function abrirPorTag(tagEscolhida: string) {
    const aberto = await abrirEquipamentoParaCalibracoes(tagEscolhida);
    setVendo(false);
    setTag(tagEscolhida);
    setEqAtual(aberto.resumo);
    setCals(
      [...aberto.calibracoes].sort(
        (a, b) =>
          parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm),
      ),
    );
    definirComponentes(tagEscolhida, aberto.componentes);
    setContagensLocais((c) => ({ ...c, [tagEscolhida]: aberto.calibracoes.filter(ehOficial).length }));
    setLotes(aberto.lotes);
    setConfirmandoId(null);
    setTela('historico');
  }

  // Link direto `/calibracoes?tag=X` (21/11/2026): o atalho "ir para a
  // calibração" do modal do Dashboard abre o equipamento já aberto aqui.
  const [paramsUrl] = useSearchParams();
  const tagDaUrl = paramsUrl.get('tag') ?? '';
  useEffect(() => {
    if (tagDaUrl) void abrirPorTag(tagDaUrl);
    // Só quando a TAG da URL muda — abrirPorTag é recriada a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagDaUrl]);

  /**
   * Abrir a JANELA de calibração para um componente. Instrumento sem folha
   * nossa vai para o registro de laboratório externo. O lote é discreto: vem
   * pré-escolhido quando a calibração nasce de um lote; senão, o mais recente
   * em andamento que cobre o componente e ainda não o calibrou; senão, avulsa.
   */
  function iniciarCalibracao(
    tagAlvo: string,
    comp: ComponenteCal,
    ctx: { lotes: LoteCal[]; calibracoes: DadosCalibracao[]; loteId?: string; dataLote?: string },
  ) {
    if (!definicaoDe(comp.tipo).modeloInterno) {
      setTerceiroPara({ comp, loteId: ctx.loteId, dataLote: ctx.dataLote, tag: tagAlvo });
      return;
    }
    const lotesDoComp = ordenarLotes(ctx.lotes).filter((l) =>
      itensDoLote(l, [comp]).some((c) => c.id === comp.id),
    );
    const sugerido =
      ctx.loteId ??
      lotesDoComp.find((l) => !l.relatorioId && !calibracaoDoItem(l.id, comp.id, ctx.calibracoes))?.id ??
      '';
    const loteSug = ctx.lotes.find((l) => l.id === sugerido);
    setCalibrando({
      tag: tagAlvo,
      titulo: 'Nova calibração',
      form: formDoComponente(comp, tagAlvo, ctx.dataLote ?? (loteSug ? dataDoLote(loteSug) : undefined)),
      componente: comp,
      lotes: lotesDoComp,
      loteId: sugerido,
    });
  }

  /** Nova calibração, passo 1 → 2: semeia a TAG (sem hidratar a organização) e lista os componentes. */
  async function escolherEquipamentoNova(t: string) {
    const aberto = await abrirEquipamentoParaCalibracoes(t);
    conhecerComponentes(t, aberto.componentes);
    setNovaCal({
      passo: 'componente',
      tag: t,
      componentes: aberto.componentes,
      calibracoes: aberto.calibracoes,
      lotes: aberto.lotes,
    });
  }

  /** Continuar um RASCUNHO na janela (mesmo id, mesmo nº reservado). */
  function continuarRascunho(cal: DadosCalibracao, contexto: { componentes: ComponenteCal[]; lotes: LoteCal[] }) {
    if (!ehInterna(cal)) return;
    const comp = contexto.componentes.find((c) => c.id === cal.componenteId) ?? null;
    setCalibrando({
      tag: cal.tag,
      titulo: 'Continuar calibração (rascunho)',
      form: formDeRascunho(cal, cal.tag),
      componente: comp,
      lotes: comp ? ordenarLotes(contexto.lotes).filter((l) => itensDoLote(l, [comp]).length > 0) : contexto.lotes,
      loteId: cal.loteId ?? '',
      idExistente: cal.id,
    });
  }

  function abrirVisualizador(cal: DadosCalibracao) {
    setCalAtual(cal);
    setVersao((v) => v + 1);
    setVendo(true);
  }

  function abrirVerDados(cal: DadosCalibracao) {
    setCalAtual(cal);
    setTela('verDados');
  }

  async function excluir(id: string) {
    try {
      await excluirCalibracao(tag, id);
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : 'Não foi possível excluir.');
      setConfirmandoId(null);
      return;
    }
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    atualizarContagem(tag);
    setConfirmandoId(null);
    if (vendo) setVendo(false);
  }

  // Os lotes que a lista mostra: ordenados pela data de EXECUÇÃO (não pela de
  // registro) e passados pela busca/situação. Ver `lote.ts`.
  const lotesVisiveis = filtrarLotes(ordenarLotes(lotes), filtroLotes, componentes, cals);
  const loteAbertoObj = loteAberto ? (lotes.find((l) => l.id === loteAberto) ?? null) : null;

  /**
   * Baixar o PDF de UM certificado de calibração.
   *
   * Ele é GERADO do registro, e não servido de um arquivo: diferente de
   * relatório e prontuário (§7-quater), certificado de calibração nunca teve
   * artefato arquivado — a folha sempre foi re-renderizada. Está documentado em
   * `docs/medicoes/2026-09-11-ux-calibracoes.md` para as duas coisas não se
   * confundirem.
   *
   * A folha precisa estar MONTADA para ser rasterizada, e quem a monta é o
   * visor dentro do modal do lote — por isso o seletor é o do visor.
   */
  async function baixarPdfCalibracao(cal: DadosCalibracao) {
    // Emitido / laboratório: o ARQUIVO. Nunca uma regeração.
    const arte = artefatoDaCalibracao(cal);
    if (arte) {
      if (!(await baixarPdfArquivado(arte, nomeArquivoCalibracao(cal)))) {
        mostrarToast('Arquivo indisponível agora — tente com conexão.');
      }
      return;
    }
    const nome = `${cal.numeroCertificado || 'certificado'}-${cal.nome || cal.tipo}`.replace(
      /[^\w.-]+/g,
      '-',
    );
    // Fase 7 · rascunho: os bytes da prévia vetorial (nada publicado).
    if (ehRascunhoInterno(cal)) {
      await baixarPreviaCertificado(cal);
      return;
    }
    await exportarPdf('.mlote-visor-folha, .cal-preview', nome);
  }

  function mostrarToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  }

  /**
   * Gravar a calibração da JANELA. `emitir` = grava o rascunho e emite na
   * sequência (C.3). Depois, a página por trás é atualizada no lugar — o
   * usuário continua onde estava.
   */
  async function salvarDaJanela(c: Calibrando, form: FormDados, loteId: string, acao: AcaoSalvar) {
    const id = c.idExistente ?? novoIdCalibracao();
    const vinculo = {
      ...(c.componente ? { componenteId: c.componente.id } : {}),
      ...(loteId ? { loteId } : {}),
    };
    const dados: DadosCalibracao = { ...converterForm(form, c.tag, id), ...vinculo };
    await salvarCalibracao(c.tag, dados);
    let aviso = `✓ Rascunho salvo — ${dados.numeroCertificado}`;
    if (acao === 'emitir') {
      try {
        const final = await emitirCertificado(c.tag, dados);
        aviso = final.status === 'emitido' && 'emissao' in final && final.emissao?.pendente
          ? '✓ Certificado emitido — o arquivo sobe quando a conexão voltar'
          : `✓ Certificado ${final.numeroCertificado} emitido e arquivado`;
      } catch (e) {
        // O rascunho JÁ foi gravado; a janela continua aberta nele, com o motivo.
        setCalibrando({ ...c, form, loteId, idExistente: id });
        throw e;
      }
    }
    if (tag === c.tag) recarregarLista();
    atualizarContagem(c.tag);
    setCalibrando(null);
    mostrarToast(aviso);
  }

  function recarregarLista() {
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    return lista;
  }

  /**
   * Fase 2 (C.2) · trocar o responsável de um RASCUNHO direto na revisão. O
   * rascunho ainda é editável; o emitido, não (`salvarCalibracao` recusa).
   */
  async function definirResponsavel(idFunc: string) {
    if (!calAtual || !ehInterna(calAtual) || calAtual.status !== 'rascunho') return;
    const f = responsaveis.find((x) => x.id === idFunc);
    const novo = { ...calAtual };
    if (f) novo.responsavel = snapshotResponsavel(f);
    else delete novo.responsavel;
    try {
      await salvarCalibracao(tag, novo);
      setCalAtual(novo);
      recarregarLista();
      setErroEmissao(null);
      setVersao((v) => v + 1);
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  /** Fase 2 (C.3) · EMITIR: gera, arquiva (SHA-256 + bucket) e só então carimba. */
  async function emitir() {
    if (!calAtual || emitindo) return;
    const faltas = pendenciasEmissao(calAtual);
    if (faltas.length) {
      setErroEmissao(faltas);
      return;
    }
    setEmitindo(true);
    setErroEmissao(null);
    try {
      const emitido = await emitirCertificado(tag, calAtual);
      setCalAtual(emitido);
      recarregarLista();
      setVersao((v) => v + 1);
      mostrarToast(
        emitido.emissao?.pendente
          ? '✓ Certificado emitido — o arquivo sobe quando a conexão voltar'
          : '✓ Certificado emitido e arquivado',
      );
    } catch (e) {
      const motivos = (e as { motivos?: string[] }).motivos;
      setErroEmissao(motivos ?? [e instanceof Error ? e.message : 'Falha ao emitir o certificado.']);
    } finally {
      setEmitindo(false);
    }
  }

  /** Fase 2 (C.3) · corrigir um emitido = abrir uma REVISÃO (registro novo). */
  function abrirRevisao(cal: DadosCalibracao) {
    if (!ehInterna(cal)) return;
    const comp = componentes.find((c) => c.id === cal.componenteId) ?? null;
    setCalibrando({
      tag,
      titulo: 'Revisão do certificado',
      form: formDeRevisao(cal, tag),
      componente: comp,
      lotes: comp ? ordenarLotes(lotes).filter((l) => itensDoLote(l, [comp]).length > 0) : lotes,
      loteId: cal.loteId ?? '',
    });
  }


  return (
    <div className="calibracoes-page">
      {/* O <h1> saiu: a topbar já mostra o título e o subtítulo da seção, e
          repeti-lo custava ~40px acima do conteúdo em toda visita. */}

      {/* Os certificados dos instrumentos PADRÃO saíram daqui para o menu próprio
          "Certificados" (src/pages/Certificados.tsx) — esta tela cuida só das
          calibrações dos acessórios do cliente (manômetros/PSV por equipamento). */}

      {/* ── EQUIPAMENTOS · LISTA NOVA (9F.3, sob `calibracoes_v9`) ──────
          Vem da projeção, com busca, keyset e virtualização. A contagem de
          calibrações chega pronta do servidor, em vez de um `JSON.parse` por
          cartão a cada quadro. O que vem DEPOIS da lista é o mesmo dos dois
          lados — o histórico, o formulário e o certificado não foram
          duplicados. */}
      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          {/* O cabeçalho "Selecione o Equipamento" saiu: o título da página já
              diz Calibrações, a barra logo abaixo diz o que fazer, e a faixa
              custava 40px acima do conteúdo em toda visita. */}
          <CatalogoCalibracoesV9
            termo={termoBusca}
            aoMudarTermo={setTermoBusca}
            aoEscolher={(t) => void abrirPorTag(t)}
            contagensLocais={contagensLocais}
            acessoriosLocais={acessoriosLocais}
            acoes={
              <>
                {/* [i] Informações na barra da SESSÃO: a explicação do fluxo com a
                    ilustração, sem ocupar área fixa acima da lista. */}
                <button
                  type="button"
                  className="fj-btn fj-btn-ghost cal-btn-info"
                  title="Como funciona a calibração"
                  aria-haspopup="dialog"
                  onClick={() => setAjudaAberta(true)}
                >
                  <Icone nome="info" tam={18} />{" "}
                  <span className="pront-btn-rotulo">Informações</span>
                </button>
                {/* Reestruturação (19/09/2026) · o caminho óbvio: equipamento
                    → componente → calibração, sem passar por lote. */}
                <button
                  type="button"
                  className="fj-btn fj-btn-primary cal-btn-nova"
                  aria-haspopup="dialog"
                  onClick={() => setNovaCal({ passo: 'equipamento' })}
                >
                  <Icone nome="plus" tam={14} /> Nova calibração
                </button>
              </>
            }
          />
        </div>
      )}

      {/* ── EQUIPAMENTOS · LISTA LEGADA ──────────────── */}

      {/* ── EQUIPAMENTO: CABEÇALHO + LISTA DE LOTES (11/09/2026) ───────────
          Três regiões, e só três: a faixa do equipamento com os acessórios em
          linha, a lista de lotes em UMA LINHA cada, e os modais.

          O accordion saiu. Ele despejava todos os componentes do equipamento
          embaixo de cada lote aberto: dois lotes com cinco acessórios eram dez
          blocos empilhados antes do próximo lote, e a página crescia sem
          limite. Consultar um lote agora é um modal SOBRE a lista — fechar
          devolve o lugar exato onde se estava. */}
      {tela === 'historico' && (
        <>
          <div className={`cal4 cal-aba-${abaCal}`}>
            {/* Cobalto · barra do protótipo: Voltar · Calibrações › TAG · ações. */}
            <div className="fx-bar cal4-bar">
              <button type="button" className="fx-voltar cal-btn-voltar" onClick={() => setTela('equipamentos')}>
                <Icone nome="arrowleft" tam={16} />
                Voltar
              </button>
              <nav className="fx-trilha" aria-label="Caminho">
                <button type="button" onClick={() => setTela('equipamentos')}>Calibrações</button>
                <span className="sep">›</span>
                <b>{tag}</b>
              </nav>
              <span className="grow" />
              <button type="button" className="cal4-btn cal4-btn-sec cal-ajuda-link" onClick={() => setAjudaAberta(true)}>
                <Icone nome="info" tam={16} /> Como funciona
              </button>
              <button
                type="button"
                className="fj-btn fj-btn-primary cal-btn-nova"
                onClick={() =>
                  setNovaCal({ passo: 'componente', tag, componentes, calibracoes: cals, lotes })
                }
              >
                <Icone nome="plus" tam={14} /> Nova calibração
              </button>
            </div>

            {/* Abas: "Calibrar acessórios" (onde se começa uma calibração) e
                "Calibrações realizadas" (o histórico e os lotes). Só separam o
                que já existia; nada some, nada muda de regra. */}
            <div className="cal4-abas cal-abas" role="tablist" aria-label="Calibrações do equipamento">
              <button type="button" role="tab" aria-selected={abaCal === 'calibrar'} onClick={() => setAbaCal('calibrar')}>
                <Icone nome="gauge" tam={16} />
                Calibrar acessórios <span className="n">{componentes.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={abaCal === 'realizadas'} onClick={() => setAbaCal('realizadas')}>
                <Icone nome="clipboard" tam={16} />
                Calibrações realizadas <span className="n">{cals.length}</span>
              </button>
            </div>

            <div className="mz cal4-corpo">
              <TopoEquipamentoCal
                tag={tag}
                tipo={eqAtual?.info.tipo}
                descricao={[eqAtual?.info.descricao?.trim(), rotuloTipoEquipamento(eqAtual?.info.tipo) ?? 'Equipamento']
                  .filter(Boolean)
                  .join(' · ')}
                componentes={componentes}
                cals={cals}
              />

              {abaCal === 'calibrar' ? (
                <GradeAcessorios
                  componentes={componentes}
                  cals={cals}
                  aoAdicionar={() =>
                    setCompForm({
                      id: `comp-${Date.now()}`,
                      tipo: 'manometro',
                      nome: '',
                      criadoEm: new Date().toLocaleDateString('pt-BR'),
                    })
                  }
                  aoEditar={(c) => setCompForm({ ...c })}
                  aoHistorico={(c) => setHistoricoComp(c)}
                  aoCalibrar={(c) => iniciarCalibracao(tag, c, { lotes, calibracoes: cals })}
                  aoContinuar={(cal) => continuarRascunho(cal, { componentes, lotes })}
                />
              ) : (
                <>
                  <TabelaRealizadas
                    componentes={componentes}
                    cals={cals}
                    aoContinuar={(cal) => continuarRascunho(cal, { componentes, lotes })}
                    aoVer={abrirVisualizador}
                    aoBaixar={(cal) => void baixarPdfCalibracao(cal)}
                  />
                  {/* Lotes: opcionais e discretos (§4-quater), num cartão próprio. */}
                  <section className="mz-card cal4-lotes">
                    <header className="mz-h">
                      <h2>Lotes de calibração</h2>
                      <span className="mz-norma">{lotes.length}</span>
                    </header>
                    <div className="cal4-lotes-c">
                  {/* ── BARRA DA LISTA ────────────────────────────────────────── */}
                  <div className="cal-lotes-barra">
                    <div className="cal-lotes-busca">
                      <Icone nome="search" tam={14} />
                      <input
                        type="search"
                        value={filtroLotes.termo}
                        onChange={(e) => setFiltroLotes((f) => ({ ...f, termo: e.target.value }))}
                        placeholder="Buscar lote, data ou acessório…"
                        aria-label="Buscar lote"
                      />
                    </div>
                    <select
                      className="cal-lotes-situacao"
                      value={filtroLotes.situacao}
                      onChange={(e) =>
                        setFiltroLotes((f) => ({ ...f, situacao: e.target.value as SituacaoLote }))
                      }
                      aria-label="Situação do lote"
                    >
                      <option value="todos">Todas as situações</option>
                      <option value="andamento">Em andamento</option>
                      <option value="completo">Completo</option>
                    </select>
                    <button
                      type="button"
                      className="btn-primario cal-lotes-novo"
                      disabled={componentes.length === 0}
                      title={componentes.length === 0 ? 'Cadastre os acessórios primeiro' : undefined}
                      onClick={() => setLoteEditando({ novo: true, lote: null })}
                    >
                      <Icone nome="plus" tam={14} /> Novo lote
                    </button>
                  </div>

                  {lotes.length === 0 ? (
                    <div className="cal-vazio">
                      <img
                        className="pront-ilustra"
                        src="/ilustracoes/fluxo-calibracao.webp"
                        alt="Fluxo da calibração: os acessórios do equipamento, o lote e o técnico calibrando"
                        loading="lazy"
                        decoding="async"
                      />
                      <h3>Nenhuma calibração registrada</h3>
                      <p>
                        Cada inspeção gera um <b>lote</b> com a calibração dos acessórios deste
                        equipamento. Use “Novo lote” acima para começar
                        {componentes.length === 0 ? ' — antes, cadastre os acessórios.' : '.'}
                      </p>
                    </div>
                  ) : lotesVisiveis.length === 0 ? (
                    <p className="cal-lotes-nada">
                      Nenhum lote para esse filtro.{' '}
                      <button type="button" onClick={() => setFiltroLotes(FILTRO_LOTES_VAZIO)}>
                        Limpar
                      </button>
                    </p>
                  ) : (
                    <ul className="cal-lotes" role="list">
                      {lotesVisiveis.map((lote) => {
                        const p = progressoLote(lote, componentes, cals);
                        return (
                          <li key={lote.id} className="cal-lote-linha">
                            <button
                              type="button"
                              className="cal-lote-abrir"
                              onClick={() => setLoteAberto(lote.id)}
                              aria-label={`Ver o lote ${lote.descricao}`}
                            >
                              <span className="cal-lote-nome">{lote.descricao}</span>
                              <span className="cal-lote-data">{dataDoLote(lote)}</span>
                              <span className="cal-lote-itens">
                                {p.feitos}/{p.total}
                              </span>
                              <span className={`mlote-selo${p.completo ? ' completo' : ' pendente'}`}>
                                {p.completo ? 'Completo' : 'Em andamento'}
                              </span>
                            </button>
                            <div className="cal-lote-acoes">
                              <button
                                type="button"
                                className="btn-icone cor-azul"
                                title="Ver lote"
                                aria-label={`Ver o lote ${lote.descricao}`}
                                onClick={() => setLoteAberto(lote.id)}
                              >
                                <Icone nome="eye" tam={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-icone cor-cinza"
                                title="Editar lote"
                                aria-label={`Editar o lote ${lote.descricao}`}
                                onClick={() => setLoteEditando({ novo: false, lote })}
                              >
                                <Icone nome="pencil" tam={14} />
                              </button>
                              {/* A exclusão só existe enquanto o lote não tem
                                  certificado — a MESMA regra de antes, agora sem o
                                  botão que só sabia recusar. */}
                              {podeExcluirLote(lote.id, cals) && (
                                <button
                                  type="button"
                                  className="btn-icone cor-vermelho"
                                  title="Excluir lote"
                                  aria-label={`Excluir o lote ${lote.descricao}`}
                                  onClick={async () => {
                                    if (!window.confirm(`Excluir o lote "${lote.descricao}"?`)) return;
                                    await excluirLote(tag, lote.id);
                                    setLotes(listarLotes(tag));
                                  }}
                                >
                                  <Icone nome="trash" tam={14} />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                    </div>
                  </section>
                </>
              )}
            </div>

            {compForm && (
              <ModalComponente
                valor={compForm}
                aoFechar={() => setCompForm(null)}
                aoSalvar={async (c) => {
                  await salvarComponente(tag, c);
                  definirComponentes(tag, listarComponentes(tag));
                  setCompForm(null);
                }}
              />
            )}

          </div>

          {loteEditando && (
            <ModalNovoLote
              componentes={componentes}
              lote={loteEditando.lote}
              aoFechar={() => setLoteEditando(null)}
              aoSalvar={async ({ nome, data, itens }) => {
                const alvo = loteEditando.lote;
                if (alvo) {
                  await salvarLote(tag, { ...alvo, descricao: nome, data, itens });
                } else {
                  const criado = await criarLote(tag, nome);
                  await salvarLote(tag, { ...criado, descricao: nome, data, itens });
                }
                setLotes(listarLotes(tag));
                setLoteEditando(null);
              }}
            />
          )}

          {loteAbertoObj && (
            <ModalDetalhesLote
              lote={loteAbertoObj}
              tag={tag}
              componentes={componentes}
              calibracoes={cals}
              aoFechar={() => setLoteAberto(null)}
              aoCalibrar={(c) =>
                // O lote continua aberto por trás: fechar a janela devolve o
                // usuário a ele, com o progresso já atualizado.
                iniciarCalibracao(tag, c, {
                  lotes,
                  calibracoes: cals,
                  loteId: loteAbertoObj.id,
                  dataLote: dataDoLote(loteAbertoObj),
                })
              }
              aoRegistrarTerceiro={(c) => {
                setTerceiroPara({ comp: c, loteId: loteAbertoObj.id, dataLote: dataDoLote(loteAbertoObj) });
              }}
              aoRevisar={(cal) => continuarRascunho(cal, { componentes, lotes })}
              aoVerDados={(cal) => {
                setLoteAberto(null);
                abrirVerDados(cal);
              }}
              aoBaixarPdf={baixarPdfCalibracao}
            />
          )}
        </>
      )}

      {/* ── VISUALIZADOR ─────────────────────────────── */}
      {vendo && calAtual && (
        // Fundo NÃO fecha: o rascunho tem campo (responsável) e ação (emitir).
        // Fecha pelo X e pelo Esc (useFocoPreso).
        <div className="fj-modal-overlay calv-fundo">
          <CaixaCalibracao aoFechar={() => setVendo(false)}>
          <div className="bloco-dados calv-topo">
            <button type="button" className="calv-fechar" onClick={() => setVendo(false)} aria-label="Fechar">
              <Icone nome="x" tam={16} />
            </button>
            <div className="calv-sub">
              <strong>{tag}</strong>
              <span className="breadcrumb-chevron">›</span>
              <span>{calAtual.nome}</span>
            </div>
            <div className="meta-card-header">
              <h3 id="calv-tit">
                {ehTerceiro(calAtual) ? 'Certificado do laboratório' : 'Certificado de Calibração'} —{' '}
                {definicaoDe(calAtual.tipo).rotulo}
                <span className={`cal-status-cert ${ehTerceiro(calAtual) ? 'externo' : ehEmitido(calAtual) ? 'emitido' : ehInterna(calAtual) && calAtual.status === 'rascunho' ? 'rascunho' : 'legado'}`}>
                  {ehTerceiro(calAtual)
                    ? 'Laboratório externo'
                    : ehEmitido(calAtual)
                      ? 'Emitido'
                      : ehInterna(calAtual) && calAtual.status === 'rascunho'
                        ? 'Rascunho'
                        : rotuloOrigem(calAtual)}
                </span>
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => {
                    setVendo(false);
                    abrirVerDados(calAtual);
                  }}
                >
                  Ver preenchido
                </button>
                {artefatoAtual ? (
                  <>
                    <button type="button" className="btn-secundario" onClick={() => void baixarPdfCalibracao(calAtual)}>
                      <Icone nome="download" tam={13} /> Baixar PDF
                    </button>
                    <button
                      type="button"
                      className={`btn-secundario${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                      onClick={() => void imprimirPdfArquivado(artefatoAtual)}
                    >
                      Imprimir
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`btn-secundario${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                    onClick={() =>
                      void (ehRascunhoInterno(calAtual)
                        ? imprimirPreviaCertificado(calAtual)
                        : imprimirRelatorio('.cal-preview'))
                    }
                  >
                    {documentosBloqueados() && <Icone nome="cadeado" tam={13} />} Imprimir
                  </button>
                )}
                {ehInterna(calAtual) && calAtual.status !== 'rascunho' && (
                  <button type="button" className="btn-secundario" onClick={() => abrirRevisao(calAtual)}>
                    <Icone nome="pencil" tam={13} /> {ehEmitido(calAtual) ? 'Corrigir (nova revisão)' : 'Criar revisão para emitir'}
                  </button>
                )}
                {/* Só RASCUNHO se exclui. Concluída (oficial) não se edita nem se
                    apaga — corrigir é revisão. Antes só o emitido/terceiro era
                    protegido, e a calibração antiga concluída aparecia com Excluir. */}
                {ehCongelada(calAtual) || ehOficial(calAtual) ? null : confirmandoId === calAtual.id ? (
                  <>
                    <button type="button" className="btn-remover" onClick={() => excluir(calAtual.id)}>
                      Confirmar Exclusão
                    </button>
                    <button type="button" className="btn-secundario" onClick={() => setConfirmandoId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-remover" onClick={() => setConfirmandoId(calAtual.id)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="calv-corpo">
          {/* Fase 2 (C.3) · RASCUNHO → revisão → EMITIR. */}
          {ehInterna(calAtual) && calAtual.status === 'rascunho' && (
            <div className="bloco-dados cal-emissao">
              <div className="cal-emissao-linha">
                <label className="cal-campo cal-emissao-resp">
                  <span>Responsável pela calibração</span>
                  <select
                    value={calAtual.responsavel?.id ?? ''}
                    onChange={(e) => void definirResponsavel(e.target.value)}
                    disabled={emitindo}
                  >
                    <option value="">Selecione…</option>
                    {responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                        {r.crea ? ` — ${r.crea}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`btn-primario cal-emissao-btn${emitindo ? ' is-loading' : ''}`}
                  onClick={() => void emitir()}
                  disabled={emitindo}
                >
                  <Icone nome="checkcircle" tam={14} /> {emitindo ? 'Emitindo…' : 'Emitir certificado'}
                </button>
              </div>
              <p className="cal-emissao-ajuda">
                Emitir gera o PDF definitivo, calcula o SHA-256 e arquiva o arquivo. Depois disso o
                certificado não muda — corrigir exige uma revisão.
              </p>
              {avisosEmissao(calAtual).map((a) => (
                <p key={a} className="cal-auto-aviso cal-auto-aviso-falta">
                  <Icone nome="alerttri" tam={13} />
                  <span>{a}</span>
                </p>
              ))}
              {erroEmissao && (
                <div className="cal-emissao-erro" role="alert">
                  <strong>Não emitido:</strong>
                  <ul>
                    {erroEmissao.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {ehEmitido(calAtual) && ehInterna(calAtual) && calAtual.emissao && (
            <p className="cal-emissao-selo">
              Emitido em {new Date(calAtual.emissao.emitidoEm).toLocaleString('pt-BR')} · SHA-256{' '}
              <code>{calAtual.emissao.sha256.slice(0, 16)}…</code>
              {calAtual.emissao.pendente ? ' · arquivo aguardando conexão para subir' : ''}
            </p>
          )}

          {artefatoAtual ? (
            <div className="cal-preview-arquivo">
              <VisualizadorPdf artefato={artefatoAtual} nomeArquivo={nomeArquivoCalibracao(calAtual)} />
            </div>
          ) : ehRascunhoInterno(calAtual) ? (
            <div className="cal-preview-arquivo">
              <PreviaCertificado key={`${calAtual.id}-${versao}`} cal={calAtual} />
            </div>
          ) : !arquivoAtual ? (
            <p className="cal-auto-aviso cal-auto-aviso-falta">
              <Icone nome="alerttri" tam={13} />
              <span>
                Esta calibração não tem folha de certificado nem PDF anexado — o relatório cita os
                dados do registro.
              </span>
            </p>
          ) : (
            <>
              {palco.estado !== 'pronto' && <RecusaPalco estado={palco.estado} falha={palco.falha} />}
              <div className="cal-preview">
                {palco.estado === 'pronto' && (
                  <PaginaA4 key={`${calAtual.id}-${versao}`}>
                    <iframe
                      src={`/arquivos-inspecao/${arquivoAtual}?calibId=${calAtual.id}&tag=${encodeURIComponent(tag)}&page=1${palco.paramsIframe}${paramsSomenteLeitura(ehOficial(calAtual))}`}
                      scrolling="no"
                      title="Certificado de Calibração"
                      // Concluída: trava o DOM da folha (camada visual do §7-ter);
                      // a de dados é o `ro=1` acima + palco sem drenar.
                      onLoad={(e) => {
                        if (ehOficial(calAtual)) travarIframeSomenteLeitura(e.currentTarget);
                      }}
                    />
                  </PaginaA4>
                )}
              </div>
            </>
          )}
          </div>
          </CaixaCalibracao>
        </div>
      )}

      {/* ── VER PREENCHIDO (dados salvos, sem campos de edição) ── */}
      {tela === 'verDados' && calAtual && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
            <span className="breadcrumb-chevron">›</span>
            <span>{calAtual.nome}</span>
          </div>
          <div className="meta-card-header">
            <h3>
              Calibração — {definicaoDe(calAtual.tipo).rotulo} (dados preenchidos)
            </h3>
            <button type="button" className="btn-primario" onClick={() => abrirVisualizador(calAtual)}>
              <Icone nome="eye" tam={14} /> Ver como fica o documento
            </button>
          </div>
          <VisualizadorCalibracao dados={calAtual} />
        </div>
      )}

      {/* O histórico vem ANTES da janela no DOM: "Continuar" e "Nova calibração"
          abrem a janela POR CIMA dele, e fechá-la devolve ao histórico. */}
      {historicoComp && (
        <ModalHistoricoComponente
          tag={tag}
          componente={historicoComp}
          calibracoes={cals}
          aoFechar={() => setHistoricoComp(null)}
          aoNovaCalibracao={() => iniciarCalibracao(tag, historicoComp, { lotes, calibracoes: cals })}
          aoContinuar={(cal) => continuarRascunho(cal, { componentes, lotes })}
          aoVerDados={(cal) => {
            setHistoricoComp(null);
            abrirVerDados(cal);
          }}
          aoEditarComponente={() => setCompForm({ ...historicoComp })}
          aoBaixarPdf={baixarPdfCalibracao}
        />
      )}

      {/* ── NOVA CALIBRAÇÃO · passo 1: equipamento ────────────────────── */}
      {novaCal?.passo === 'equipamento' && (
        <ModalSelecionarEquipamento
          titulo="Qual equipamento?"
          sobre="Nova calibração"
          aoFechar={() => setNovaCal(null)}
        >
          <CatalogoCalibracoesV9
            modo="selecao"
            termo={termoNova}
            aoMudarTermo={setTermoNova}
            aoEscolher={(t) => void escolherEquipamentoNova(t)}
            contagensLocais={contagensLocais}
            acessoriosLocais={acessoriosLocais}
          />
        </ModalSelecionarEquipamento>
      )}

      {/* ── NOVA CALIBRAÇÃO · passo 2: componente ───────────────────────── */}
      {novaCal?.passo === 'componente' && !calibrando && !terceiroPara && (
        <ModalEscolherComponente
          tag={novaCal.tag}
          componentes={novaCal.componentes}
          calibracoes={novaCal.calibracoes}
          aoCadastrar={async (c) => {
            await salvarComponente(novaCal.tag, c);
            const lista = listarComponentes(novaCal.tag);
            setNovaCal({ ...novaCal, componentes: lista });
            conhecerComponentes(novaCal.tag, lista);
            if (novaCal.tag === tag) setComponentes(lista);
          }}
          aoEscolher={(c) => {
            const ctx = novaCal;
            setNovaCal(null);
            iniciarCalibracao(ctx.tag, c, { lotes: ctx.lotes, calibracoes: ctx.calibracoes });
          }}
          aoVoltar={() => setNovaCal({ passo: 'equipamento' })}
          aoFechar={() => setNovaCal(null)}
        />
      )}

      {/* ── A JANELA DA CALIBRAÇÃO (modal ⇄ tela cheia) ────────────────── */}
      {calibrando && (
        <FormularioCalibracao
          key={`${calibrando.tag}-${calibrando.idExistente ?? calibrando.form.numeroCertificado}`}
          tag={calibrando.tag}
          titulo={calibrando.titulo}
          inicial={calibrando.form}
          componente={calibrando.componente}
          lotes={calibrando.lotes}
          loteInicial={calibrando.loteId}
          aoSalvar={(form, loteId, acao) => salvarDaJanela(calibrando, form, loteId, acao)}
          aoComponenteSalvo={async (c) => {
            await salvarComponente(calibrando.tag, c);
            if (calibrando.tag === tag) definirComponentes(tag, listarComponentes(tag));
          }}
          aoFechar={() => setCalibrando(null)}
        />
      )}

      {terceiroPara && (
        <ModalCalibracaoTerceiro
          tag={terceiroPara.tag ?? tag}
          componente={terceiroPara.comp}
          loteId={terceiroPara.loteId}
          dataLote={terceiroPara.dataLote}
          aoFechar={() => setTerceiroPara(null)}
          aoSalvar={(cal) => {
            if ((terceiroPara.tag ?? tag) === tag) recarregarLista();
            atualizarContagem(terceiroPara.tag ?? tag);
            setTerceiroPara(null);
            mostrarToast(`✓ Certificado ${cal.numeroCertificado} de ${cal.laboratorio} registrado`);
          }}
        />
      )}

      {ajudaAberta && <AjudaCalibracoes aoFechar={() => setAjudaAberta(false)} />}

      {toast && (
        <div className="toast-sucesso" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/**
 * A caixa do modal do certificado: foco preso e Esc fecham — montada só
 * quando o modal abre, que é quando o hook de foco precisa do elemento.
 */
function CaixaCalibracao({ aoFechar, children }: { aoFechar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocoPreso(ref, aoFechar);
  return (
    <div ref={ref} className="calv" role="dialog" aria-modal="true" aria-labelledby="calv-tit" tabIndex={-1}>
      {children}
    </div>
  );
}
