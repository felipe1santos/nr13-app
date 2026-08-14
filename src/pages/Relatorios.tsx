import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePalcoDocumento } from '../features/documentos/usePalcoDocumento';
import { paramsSomenteLeitura, travarIframeSomenteLeitura } from '../features/documentos/somenteLeituraDoc';
import { drenarPonte } from '../services/ponteTemplates';
import { ler, salvar } from '../services/storage';
import RecusaPalco from '../components/RecusaPalco';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import ModalNovaInspecao from '../features/relatorios/ModalNovaInspecao';
import ModalSelecionarContainer from '../features/relatorios/ModalSelecionarContainer';
import { carregarContainer } from '../features/inspecoes/inspecaoService';
import {
  adicionarEntradaLivroAuto,
  excluirDoHistorico,
  expandirFolhasFoto,
  expandirMemorial,
  filtrarDocumentosValidos,
  filtrarFolhasFotoVazias,
  gravarAssinantesRel,
  gravarInspecaoOrigemAtual,
  gravarMetaAtual,
  carregarRelatorio,
  contarRelatorios,
  listarHistorico,
  montarListaComTermoAbertura,
  obterAssinantesRel,
  salvarNoHistorico,
  snapshotAssinantes,
  snapshotEmpresa,
  type AssinanteTermoLivro,
  type AssinantesRelatorio,
} from '../features/relatorios/relatoriosService';
import { expandirFolhasUltrassom } from '../features/relatorios/ultrassomPaginacao';
import { listarFuncionarios } from '../features/cadastros/cadastroService';
import type { Funcionario } from '../features/cadastros/tipos';
import { validadesPorRelatorio, vincularLotesPendentes } from '../features/calibracoes/componentesService';
import { listarRastreabilidadesAtivas, rastreabilidadesParaRelatorio } from '../features/relatorios/rastreabilidadeService';
import { snapshotCalibracoesDosDocs } from '../features/calibracoes/calibracaoService';
import AnexosRastreabPreview from '../features/relatorios/AnexosRastreabPreview';
import { registrarUso } from '../services/usoMetricas';
import { documentosBloqueados } from '../services/trial';
import { mascararData } from '../services/mascaras';
import { exportarPdf, gerarPdfBytes } from '../features/relatorios/pdfService';
import { publicarArtefato, artefatoDe } from '../features/relatorios/artefatoRelatorio';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import { temArtefato, type RelatorioIndiceItem, type RelatorioMeta, type RelatorioSalvo, type TipoInspecao } from '../features/relatorios/tipos';
import VisualizadorPdf, { baixarPdfArquivado, imprimirPdfArquivado } from '../components/VisualizadorPdf';
import { Icone } from '../components/Icone';
import './relatorios.css';
import PaginaA4 from '../components/PaginaA4';
import FotoImg from '../components/FotoImg';

type Tela = 'equipamentos' | 'historico' | 'visualizador';
type EtapaModal = 'nenhuma' | 'documentos' | 'container';

const TIPOS_INSPECAO: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

const hoje = () => new Date().toLocaleDateString('pt-BR');

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

const IconeOlho = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconeDuplicar = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconeLapis = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const IconeLixeira = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
  </svg>
);

const IconePdf = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z" opacity="0.15" />
    <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function metaPadrao(tipo: TipoInspecao): RelatorioMeta {
  return {
    codigo: `REL-${Date.now()}`,
    emissao: hoje(),
    validade: '',
    execucaoInspecao: hoje(),
    proximaInspecaoInterna: '',
    proximaInspecaoExterna: '',
    validadeValvula: '',
    tipoInspecao: tipo,
    phNome: '',
    phCrea: '',
    tecnicoNome: '',
  };
}


export default function Relatorios() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [tag, setTag] = useState('');
  const [etapaModal, setEtapaModal] = useState<EtapaModal>('nenhuma');
  const [pendente, setPendente] = useState<{ tipo: TipoInspecao; docs: string[] } | null>(null);
  const [documentos, setDocumentos] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<RelatorioMeta | null>(null);
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [versao, setVersao] = useState(0);
  // Relatório finalizado sendo VISTO pelo arquivo (não remontado). Null = fluxo
  // legado. Declarado aqui em cima porque o palco depende dele.
  const [relatorioArquivado, setRelatorioArquivado] = useState<RelatorioSalvo | null>(null);

  // Palco: materializa no localStorage só as chaves desta TAG antes de montar
  // os iframes. Nenhum iframe pode ser renderizado antes de `pronto` — um
  // documento meio montado sai impresso com folha faltando.
  const palco = usePalcoDocumento(tag, `rel-${tag}-${versao}`, { somenteLeitura, pular: !!relatorioArquivado });

  // RELATÓRIO SALVO NÃO SE EDITA. `somenteLeitura` é estado React e só alcança a
  // UI React — o conteúdo do documento mora dentro dos iframes, onde os
  // templates são preenchíveis por design. Esta é a trava de DOM (camada 1); as
  // outras duas são `ro=1` na query (sb-storage.js recusa sbSalvar) e o palco,
  // que não drena a ponte em documento somente leitura.
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!somenteLeitura || tela !== 'visualizador' || palco.estado !== 'pronto') return;
    const iframes = Array.from(previewRef.current?.querySelectorAll('iframe') ?? []);
    const limpezas = iframes.map((f) => travarIframeSomenteLeitura(f));
    return () => limpezas.forEach((limpar) => limpar());
  }, [somenteLeitura, tela, palco.estado, documentos, versao]);

  // ÍNDICE, não os relatórios completos (§achado 1, 14/08/2026): a lista exibe
  // nome, TAG, tipo e datas — nenhum snapshot. O registro inteiro só é carregado
  // em `visualizar`, `duplicar` e `confirmarRenome`, um por vez.
  const [historico, setHistorico] = useState<RelatorioIndiceItem[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [toastSalvo, setToastSalvo] = useState(false);
  // Erro da finalização (geração/upload do PDF). Fica na tela até o próximo save:
  // um alert() sumiria e o usuário concluiria que salvou.
  const [erroSalvar, setErroSalvar] = useState('');
  // Progresso da rasterização — dezenas de segundos num relatório grande.
  const [progressoPdf, setProgressoPdf] = useState<{ feito: number; total: number } | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [nomeRenomeando, setNomeRenomeando] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalConfig, setModalConfig] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [filtroTipos, setFiltroTipos] = useState<Set<TipoInspecao>>(() => new Set(TIPOS_INSPECAO));
  // Motor de assinatura do relatório: assinantes escolhidos (gravados em nr13_assinantes_rel_<TAG>,
  // lidos pelo public/rel-assinatura.js dentro das folhas) + lista de funcionários para os selects.
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [assinantes, setAssinantes] = useState<AssinantesRelatorio>({
    engenheiroId: null,
    tecnicoId: null,
    assinanteTermoLivro: 'engenheiro',
  });

  // Aviso (não impresso) de rastreabilidade ausente: se o relatório tem folha de ULTRASSOM ou
  // TESTE-HIDROSTATICO e não há registro compatível em Calibrações → Rastreabilidade, os blocos
  // "instrumento de medição" dessas folhas ficam em "--". Dispensável com o X; reaparece ao
  // abrir/remontar outro relatório. Fica FORA dos iframes (parte do app, classe no-print), então
  // nunca sai na impressão nem no PDF — exportarPdf rasteriza só os iframes das folhas.
  const [avisoRastreabFechado, setAvisoRastreabFechado] = useState(false);
  useEffect(() => {
    if (tela === 'visualizador') setAvisoRastreabFechado(false);
  }, [tela, versao]);
  const faltaRastreabilidade = useMemo(() => {
    if (tela !== 'visualizador' || !documentos) return false;
    const nomes = documentos.map((d) => d.split('?')[0]);
    const precisaUS = nomes.includes('ULTRASSOM.html');
    const precisaTH = nomes.includes('TESTE-HIDROSTATICO.html');
    if (!precisaUS && !precisaTH) return false;
    // Basta existir QUALQUER rastreabilidade cadastrada para o aviso sumir: exigir um registro
    // por tipo de ensaio fazia o aviso aparecer mesmo com o cadastro feito (ex.: relatório com
    // TH e instrumento cadastrado como ultrassom). Os templates seguem escolhendo o registro
    // compatível por conta própria.
    return listarRastreabilidadesAtivas().length === 0;
  }, [tela, documentos, versao]);

  const historicoVisivel = historico.filter((r) => filtroTipos.has(r.tipo));

  // Validades de válvula/manômetro derivadas dos lotes de calibração vinculados a cada relatório.
  const validadesCal = validadesPorRelatorio(tag);

  // Listas para os seletores de assinantes; se o funcionário salvo foi excluído, o select cai em ''.
  const engenheiros = funcionarios.filter((f) => f.tipo === 'Engenheiro');
  const tecnicos = funcionarios.filter((f) => String(f.tipo).startsWith('Inspetor'));
  const valorAssinante = (id: string | null, lista: Funcionario[]) =>
    id && lista.some((f) => f.id === id) ? id : '';

  async function prepararEImprimir() {
    setImprimindo(true);
    try {
      // Relatório finalizado imprime o ARQUIVO. Re-rasterizar a tela produziria
      // um impresso feito com os dados de hoje — e permitiria que uma alteração
      // no DOM saísse no papel como se fosse o documento assinado.
      if (relatorioArquivado && temArtefato(relatorioArquivado)) {
        const ok = await imprimirPdfArquivado(artefatoDe(relatorioArquivado)!);
        if (!ok) setErroSalvar('Não foi possível abrir o PDF para impressão. Verifique a conexão.');
        else registrarUso('impressao');
        return;
      }
      await imprimirRelatorio('.relatorio-preview', true, documentos ?? []);
      registrarUso('impressao');
    } finally {
      setImprimindo(false);
    }
  }

  // Pré-rasteriza as folhas em #print-root assim que o relatório carrega, e mantém atualizado a
  // cada nova versão. Assim o Ctrl+P nativo já imprime as imagens prontas (1 folha por A4), sem
  // pré-visualização e sem quebrar os iframes. Limpa ao sair do visualizador.
  useEffect(() => {
    if (tela !== 'visualizador' || !documentos) return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.relatorio-preview');
    if (!preview) return;
    const iframes = Array.from(preview.querySelectorAll('iframe'));
    const aguardarIframes = Promise.all(
      iframes.map((f) =>
        f.contentDocument && f.contentDocument.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true })),
      ),
    );
    aguardarIframes
      .then(() => new Promise((r) => setTimeout(r, 500))) // deixa imagens/fontes dos templates assentarem
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview', true, documentos);
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [tela, documentos, versao]);

  // UMA contagem por equipamento, recalculada só quando a lista muda. Chamar
  // `listarHistorico` direto no JSX rodava a leitura por equipamento a CADA
  // render — com o índice por TAG isso é barato, mas continua sendo trabalho
  // repetido numa lista que pode ter centenas de itens.
  const contagemPorTag = useMemo(
    () => new Map(equipamentos.map((e) => [e.tag, contarRelatorios(e.tag)] as const)),
    [equipamentos],
  );

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    carregarEquipamentos();
  }, [carregarEquipamentos]);


  function abrirEquipamento(novaTag: string) {
    setTag(novaTag);
    setHistorico(listarHistorico(novaTag));
    setDocumentos(null);
    setMeta(null);
    setSelecionados(new Set());
    setTela('historico');
  }

  function voltarParaEquipamentos() {
    setTela('equipamentos');
  }

  function voltarParaHistorico() {
    setRelatorioArquivado(null);
    setErroSalvar('');
    setHistorico(listarHistorico(tag));
    setDocumentos(null);
    setMeta(null);
    setTela('historico');
  }

  function abrirEtapaDocumentos() {
    setEtapaModal('documentos');
  }

  // Assinantes do relatório (engenheiro + técnico): carrega a escolha salva da TAG e, por
  // conveniência, pré-seleciona o engenheiro quando há exatamente 1 cadastrado. O técnico NUNCA
  // é pré-selecionado sozinho. SEMPRE grava a chave (síncrono no localStorage) ANTES de os
  // iframes remontarem — as folhas leem nr13_assinantes_rel_<TAG> no DOMContentLoaded.
  // `gravar: false` ao ABRIR um relatório salvo: a folha usa o snapshot congelado
  // meta.assinantes (ctx=rel), então regravar a chave viva da TAG só mudaria dado
  // compartilhado por causa de uma leitura.
  function carregarAssinantesRel(
    tagEq: string,
    funcs: Funcionario[],
    opcoes?: { gravar?: boolean },
  ): AssinantesRelatorio {
    const a = obterAssinantesRel(tagEq);
    if (!a.engenheiroId) {
      const engs = funcs.filter((f) => f.tipo === 'Engenheiro');
      if (engs.length === 1) a.engenheiroId = engs[0].id;
    }
    if (opcoes?.gravar !== false) gravarAssinantesRel(tagEq, a);
    setAssinantes(a);
    return a;
  }

  // Reflete os assinantes na meta — o Livro de Registro usa phNome/phCrea (e o campo Técnico usa
  // tecnicoNome). tecnicoNome digitado manualmente NUNCA é sobrescrito.
  function aplicarAssinantesNaMeta(m: RelatorioMeta, a: AssinantesRelatorio, funcs: Funcionario[]): RelatorioMeta {
    const novo = { ...m };
    const eng = funcs.find((f) => a.engenheiroId != null && f.id === a.engenheiroId);
    const tec = funcs.find((f) => a.tecnicoId != null && f.id === a.tecnicoId);
    if (eng) {
      novo.phNome = eng.nome;
      novo.phCrea = eng.crea || '';
    }
    if (tec && !novo.tecnicoNome) novo.tecnicoNome = tec.nome;
    return novo;
  }

  // Troca de assinante com o relatório aberto: regrava a chave e bumpa a versão (remonta os
  // iframes, que releem a chave). Em relatório editável, espelha também na meta.
  function trocarAssinanteRel(campo: 'engenheiroId' | 'tecnicoId', id: string) {
    if (somenteLeitura) return; // relatório salvo não troca assinante (o select já vem desabilitado)
    const novo: AssinantesRelatorio = { ...assinantes, [campo]: id || null };
    setAssinantes(novo);
    gravarAssinantesRel(tag, novo);
    if (meta && !somenteLeitura) {
      const m = { ...meta };
      if (campo === 'engenheiroId') {
        const eng = funcionarios.find((f) => f.id === id);
        m.phNome = eng?.nome ?? '';
        m.phCrea = eng?.crea ?? '';
      } else {
        const tec = funcionarios.find((f) => f.id === id);
        if (tec && !m.tecnicoNome) m.tecnicoNome = tec.nome;
      }
      // Mantém o snapshot congelado em sincronia com a troca (rel-assinatura.js lê meta.assinantes).
      m.assinantes = snapshotAssinantes(novo, funcionarios);
      setMeta(m);
      void gravarMetaAtual(m); // grava localStorage de forma síncrona antes do remount
    }
    setVersao((v) => v + 1);
  }

  // Quem assina o Termo do Livro de Registro (folha LIVRO-REGISTRO.html): engenheiro ou técnico.
  // Grava na mesma chave dos assinantes e mantém o snapshot congelado da meta em sincronia —
  // relatório salvo (somenteLeitura) não passa por aqui: o select fica desabilitado.
  function trocarAssinanteTermoLivro(valor: AssinanteTermoLivro) {
    if (somenteLeitura) return; // idem: o select fica desabilitado, este é o guarda de dados
    const novo: AssinantesRelatorio = { ...assinantes, assinanteTermoLivro: valor };
    setAssinantes(novo);
    gravarAssinantesRel(tag, novo);
    if (meta && !somenteLeitura) {
      const m = { ...meta, assinantes: snapshotAssinantes(novo, funcionarios) };
      setMeta(m);
      void gravarMetaAtual(m); // grava localStorage de forma síncrona antes do remount
    }
    setVersao((v) => v + 1);
  }

  function avancarParaEtapaContainer(tipo: TipoInspecao, docsSelecionados: string[]) {
    setPendente({ tipo, docs: docsSelecionados });
    setEtapaModal('container');
  }

  async function finalizarGeracao(containerId: string | null) {
    if (!pendente) return;
    setEtapaModal('nenhuma');
    const validos = filtrarDocumentosValidos(pendente.docs);
    // Carrega o container ANTES de montar: a auto-injeção das folhas de fotos depende de haver
    // fotos de campo (VE/VI/TH) — sem fotos, a folha não entra.
    const dadosContainer = containerId ? (carregarContainer(tag, containerId)?.dados ?? {}) : {};
    const comTermo = expandirFolhasUltrassom(
      tag,
      expandirFolhasFoto(
        expandirMemorial(tag, montarListaComTermoAbertura(tag, validos, dadosContainer)),
        dadosContainer,
      ),
      dadosContainer,
    );
    let novaMeta = metaPadrao(pendente.tipo);
    novaMeta.documentos = comTermo; // SUMARIO/INSPECOES leem isto pra montar TOC e ensaios
    if (containerId) novaMeta.containerOrigemId = containerId;
    // Assinantes do motor de assinatura: grava nr13_assinantes_rel_<TAG> ANTES de montar os
    // iframes e espelha engenheiro/técnico na meta (livro de registro usa phNome/phCrea).
    const funcs = listarFuncionarios();
    setFuncionarios(funcs);
    const a = carregarAssinantesRel(tag, funcs);
    novaMeta = aplicarAssinantesNaMeta(novaMeta, a, funcs);
    // Congela empresa + assinantes na meta (relatório salvo não muda com trocas futuras).
    novaMeta.empresa = snapshotEmpresa();
    novaMeta.assinantes = snapshotAssinantes(a, funcs);
    // Congela também as calibrações injetadas (dados das folhas ?calibId=) e as versões dos
    // certificados padrão — editar calibração/certificado depois não altera este relatório.
    novaMeta.certCalibracoes = snapshotCalibracoesDosDocs(comTermo);
    novaMeta.rastreabIds = rastreabilidadesParaRelatorio(comTermo).map((r) => r.id);
    // Sempre regrava (limpa quando não há container): sem isto, um relatório sem container exibe
    // os dados de campo do ÚLTIMO relatório gerado (chaves nr13_inspecao_atual/nr13_injecao_atual).
    await gravarInspecaoOrigemAtual(dadosContainer);
    await gravarMetaAtual(novaMeta);
    setDocumentos(comTermo);
    setMeta(novaMeta);
    setSomenteLeitura(false);
    setPendente(null);
    setRelatorioArquivado(null); // relatório NOVO nunca abre no modo arquivo
    setErroSalvar('');
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  // Re-hidrata as chaves "atuais" que os templates leem do localStorage ANTES de remontar os
  // iframes, senão um relatório reaberto exibe a meta/dados de campo do último relatório gerado.
  async function visualizar(item: RelatorioIndiceItem) {
    // A lista é o ÍNDICE. O registro completo (meta com snapshots, documentos,
    // livroSnapshot) é carregado agora, e só o deste relatório.
    let r = carregarRelatorio(item.id, item.tagVaso);
    if (!r) return;
    // ARTEFATO: relatório finalizado no modelo novo NÃO é remontado. Abrir o
    // arquivo é o que garante que ele não mude quando a ficha do equipamento, o
    // memorial, o laudo ou os próprios templates mudarem depois. `documentos` e
    // `meta` seguem gravados só para auditoria.
    if (temArtefato(r)) {
      setRelatorioArquivado(r);
      // `meta` e `documentos` são a RECEITA congelada. Preenchê-los aqui é o que
      // faz o cabeçalho e o modal de configurações terem o que exibir — o
      // documento em si NÃO sai daqui, sai do arquivo. Sem isto a tela do
      // visualizador não renderiza nada (o bloco exige `meta && documentos`).
      setMeta(r.meta);
      setDocumentos(r.documentos);
      setSomenteLeitura(true);
      setErroSalvar('');
      setTela('visualizador');
      return;
    }

    let dadosContainer: unknown = {};
    if (r.meta.containerOrigemId) {
      const container = carregarContainer(r.tagVaso, r.meta.containerOrigemId);
      dadosContainer = container?.dados ?? {};
    }
    // Regrava nr13_assinantes_rel_<TAG> antes de remontar os iframes (motor de assinatura).
    {
      const funcs = listarFuncionarios();
      setFuncionarios(funcs);
      const a = carregarAssinantesRel(r.tagVaso, funcs, { gravar: false });
      // Relatório salvo ANTES dos snapshots (meta sem assinantes/empresa/calibrações): congela
      // AGORA, na 1ª reabertura, e regrava no histórico — para o drift (trocar rubrica/logo/
      // certificado depois não altera mais este relatório). Não toca em quem já tem snapshot.
      if (!r.meta.assinantes || !r.meta.empresa || !r.meta.certCalibracoes || !r.meta.rastreabIds) {
        r = {
          ...r,
          meta: {
            ...r.meta,
            assinantes: r.meta.assinantes ?? snapshotAssinantes(a, funcs),
            empresa: r.meta.empresa ?? snapshotEmpresa(),
            certCalibracoes: r.meta.certCalibracoes ?? snapshotCalibracoesDosDocs(r.documentos),
            rastreabIds: r.meta.rastreabIds ?? rastreabilidadesParaRelatorio(r.documentos).map((x) => x.id),
          },
        };
        await salvarNoHistorico(r);
      }
    }
    // Sempre regrava (limpa quando o relatório não tem container): senão um relatório reaberto sem
    // container exibe os dados de campo do último relatório gerado.
    await gravarInspecaoOrigemAtual(dadosContainer);
    // Filtra folhas de fotos sem imagem (a lista salva não passa pela auto-injeção que gateia isso).
    const docsFiltrados = expandirFolhasUltrassom(
      r.tagVaso,
      expandirFolhasFoto(filtrarFolhasFotoVazias(r.documentos, dadosContainer), dadosContainer),
      dadosContainer,
    );
    // meta.documentos (lido pelo SUMARIO p/ o TOC e numeração) deve casar com a lista renderizada
    // já expandida — senão o sumário conta páginas diferente das folhas exibidas.
    await gravarMetaAtual({ ...r.meta, documentos: docsFiltrados });
    setDocumentos(docsFiltrados);
    setMeta(r.meta);
    setSomenteLeitura(true);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  async function duplicar(item: RelatorioIndiceItem) {
    const r = carregarRelatorio(item.id, item.tagVaso);
    if (!r) return;
    // Regrava as chaves de campo do container de origem (ou limpa): senão o duplicado renderiza os
    // dados de ensaio do último relatório que esteve nas chaves nr13_inspecao_atual/nr13_injecao_atual.
    const dadosContainer = r.meta.containerOrigemId
      ? (carregarContainer(r.tagVaso, r.meta.containerOrigemId)?.dados ?? {})
      : {};
    // Filtra folhas de fotos sem imagem e reexpande conforme a contagem ATUAL do container (a lista
    // salva não passa pela auto-injeção que gateia isso — mesmo motivo de visualizar()).
    const docsFiltrados = expandirFolhasUltrassom(
      r.tagVaso,
      expandirFolhasFoto(filtrarFolhasFotoVazias(r.documentos, dadosContainer), dadosContainer),
      dadosContainer,
    );
    const novaMeta: RelatorioMeta = { ...r.meta, codigo: `REL-${Date.now()}`, emissao: hoje(), documentos: docsFiltrados };
    // Regrava nr13_assinantes_rel_<TAG> antes de remontar os iframes (motor de assinatura).
    {
      const funcs = listarFuncionarios();
      setFuncionarios(funcs);
      const a = carregarAssinantesRel(r.tagVaso, funcs);
      // Duplicado é um relatório NOVO — refaz os snapshots com a empresa/assinantes/
      // calibrações ATUAIS (não herda os congelados do relatório de origem).
      novaMeta.empresa = snapshotEmpresa();
      novaMeta.assinantes = snapshotAssinantes(a, funcs);
      novaMeta.certCalibracoes = snapshotCalibracoesDosDocs(docsFiltrados);
      novaMeta.rastreabIds = rastreabilidadesParaRelatorio(docsFiltrados).map((x) => x.id);
    }
    await gravarInspecaoOrigemAtual(dadosContainer);
    await gravarMetaAtual(novaMeta);
    setDocumentos(docsFiltrados);
    setMeta(novaMeta);
    setSomenteLeitura(false);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  async function excluirHistorico(id: string) {
    await excluirDoHistorico(id, tag);
    setHistorico(listarHistorico(tag));
  }

  async function excluirSelecionados() {
    for (const id of selecionados) await excluirDoHistorico(id, tag);
    setSelecionados(new Set());
    setHistorico(listarHistorico(tag));
  }

  function toggleSelecionado(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleSelecionarTodos() {
    setSelecionados((s) => (s.size === historico.length ? new Set() : new Set(historico.map((r) => r.id))));
  }

  function iniciarRenome(r: RelatorioIndiceItem) {
    setRenomeandoId(r.id);
    setNomeRenomeando(r.nome);
  }

  async function confirmarRenome(item: RelatorioIndiceItem) {
    const novoNome = nomeRenomeando.trim();
    // Renomear é rótulo do histórico, não conteúdo do documento (§7-ter). Carrega
    // o registro completo para não gravar um relatório sem meta/documentos.
    const r = novoNome ? carregarRelatorio(item.id, item.tagVaso) : null;
    if (r) await salvarNoHistorico({ ...r, nome: novoNome });
    setRenomeandoId(null);
    setHistorico(listarHistorico(tag));
  }

  async function atualizarMetadados() {
    if (!meta || somenteLeitura) return; // o botão some em relatório salvo; aqui o dado também
    await gravarMetaAtual(meta);
    setVersao((v) => v + 1);
  }

  async function baixarPdf() {
    setExportando(true);
    try {
      // Finalizado: entrega o MESMO arquivo que subiu na emissão. Regenerar
      // produziria um PDF com os dados de hoje e com hash diferente do que ficou
      // registrado — deixaria de ser o documento assinado.
      if (relatorioArquivado && temArtefato(relatorioArquivado)) {
        if (documentosBloqueados()) return;
        const ok = await baixarPdfArquivado(artefatoDe(relatorioArquivado)!, relatorioArquivado.nome);
        if (!ok) setErroSalvar('Não foi possível baixar o PDF. Verifique a conexão.');
        else registrarUso('pdf');
        return;
      }
      if (!meta) return;
      await exportarPdf('.relatorio-preview', `Relatorio_${meta.tipoInspecao.replace(/ /g, '_')}_${tag}.pdf`, { rastreabilidades: true, documentos: documentos ?? [] });
      registrarUso('pdf');
    } finally {
      setExportando(false);
    }
  }

  /**
   * SALVAR = FINALIZAR: gera o PDF, sobe para o bucket e só então grava.
   *
   * Antes, salvar gravava a RECEITA (documentos + meta) e o documento era
   * remontado dos dados VIVOS a cada abertura — editar a ficha mudava relatório
   * assinado, e no Portal do Cliente dava para adulterar o DOM antes de baixar.
   * Ver `features/relatorios/artefatoRelatorio.ts`.
   *
   * ORDEM, e cada passo está aqui por um motivo:
   *  1. drenar a ponte ANTES DE TUDO — é o que os templates gravaram enquanto o
   *     relatório ainda era editável (medição de espessura, laudo). Gerar o PDF
   *     antes disso congelaria um documento sem o que acabou de ser digitado.
   *  2. congelar o livro — `nr13_livro_<TAG>` é chave única e acumulativa; sem a
   *     cópia não existe "o livro daquela inspeção".
   *  3. gerar o PDF do que está na tela AGORA.
   *  4. publicar (hash + upload).
   *  5. só então gravar o histórico.
   *
   * Falhar em 3 ou 4 NÃO salva: o relatório continua editável e o usuário vê o
   * motivo. Marcar como salvo sem o arquivo seria o pior desfecho possível —
   * o documento pareceria finalizado e não existiria.
   */
  async function salvarHistorico() {
    if (!meta || !documentos || somenteLeitura) return; // salvar duas vezes não reabre a edição
    setSalvando(true);
    setErroSalvar('');
    try {
      // 1. Absorve o que os templates gravaram por sbSalvar ENQUANTO era editável.
      await drenarPonte((chave, valor) => salvar(chave, JSON.parse(valor)));

      // 2. Livro daquela emissão.
      const livroSnapshot = ler<unknown>(`nr13_livro_${tag}`) ?? null;

      // 3. PDF do que está montado.
      setProgressoPdf({ feito: 0, total: documentos.length });
      const { bytes, paginas, falhasAnexo } = await gerarPdfBytes('.relatorio-preview', {
        rastreabilidades: true,
        documentos,
        onProgresso: (feito, total) => setProgressoPdf({ feito, total }),
      });

      // 4. Hash + upload. Offline, `salvarArquivo` deixa no cofre local e
      //    enfileira — o artefato existe, só ainda não chegou ao servidor.
      const artefato = await publicarArtefato(bytes, paginas);
      // A verdade vem do cofre: upload recusado com o navegador ONLINE também é
      // pendente. Usar `navigator.onLine` marcava como sincronizado um documento
      // que nunca chegou ao bucket (medido em 11/08/2026 com upload devolvendo 500).
      const pdfPendente = artefato.pendente;

      const relatorio: RelatorioSalvo = {
        id: meta.codigo,
        tagVaso: tag,
        nome: `Relatorio_${meta.tipoInspecao.replace(/ /g, '_')}_${tag}.pdf`,
        tipo: meta.tipoInspecao,
        data: hoje(),
        documentos,
        meta,
        status: 'Aprovado',
        ...artefato,
        pdfPendente,
        livroSnapshot,
      };

      // 5. Agora sim.
      await salvarNoHistorico(relatorio);
      await adicionarEntradaLivroAuto(relatorio);
      // Lotes de calibração marcados "vincular ao próximo relatório" capturam este relatório.
      await vincularLotesPendentes(tag, relatorio.id);
      setHistorico(listarHistorico(tag));
      setSomenteLeitura(true);
      // Remonta os iframes para que a folha nasça com ro=1 (sb-storage.js recusa
      // escrita) além da trava de DOM, que o efeito aplica ao ver a flag virar.
      setVersao((v) => v + 1);
      if (falhasAnexo.length > 0) {
        setErroSalvar(
          `Relatório finalizado, mas sem o certificado padrão de: ${falhasAnexo.join(', ')}. Confira o PDF cadastrado em Certificados.`,
        );
      }
      setToastSalvo(true);
      setTimeout(() => setToastSalvo(false), 3000);
    } catch (e) {
      // NÃO marca como salvo. O relatório segue editável e o usuário pode tentar
      // de novo depois de resolver a causa (rede, sessão, memória).
      setErroSalvar(
        `Não foi possível finalizar o relatório: ${e instanceof Error ? e.message : String(e)}. Nada foi salvo — tente novamente.`,
      );
    } finally {
      setSalvando(false);
      setProgressoPdf(null);
    }
  }

  function setCampoMeta(chave: keyof RelatorioMeta, valor: string) {
    if (somenteLeitura) return; // os inputs já são readOnly; este é o guarda de estado
    setMeta((m) => (m ? { ...m, [chave]: valor } : m));
  }

  // Campos de data do modal: máscara dd/mm/aaaa (o usuário digita só os números).
  function setCampoData(chave: keyof RelatorioMeta, valor: string) {
    setCampoMeta(chave, mascararData(valor));
  }

  return (
    <div className="relatorios-page">
      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <h3>Equipamentos Cadastrados</h3>
          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentos.map((eq) => (
                <button
                  type="button"
                  key={eq.tag}
                  className="card-equipamento-horiz"
                  onClick={() => abrirEquipamento(eq.tag)}
                >
                  <div className="card-eq-img">
                    {eq.fotoCapa ? <FotoImg foto={eq.fotoCapa} alt={eq.tag} /> : <span className="card-eq-img-vazio">{eq.tag.slice(0, 2)}</span>}
                  </div>
                  <div className="card-eq-info">
                    <div className="eq-col">
                      <span className="eq-tag">{eq.tag}</span>
                      <span className="eq-tipo">{ROTULO_TIPO[eq.info.tipo]}</span>
                    </div>
                    <div className="eq-col">
                      <span className="eq-label">Categoria</span>
                      <span className="eq-value">{eq.categoria?.catFinal ?? '—'}</span>
                    </div>
                    <div className="eq-col">
                      <span className="eq-label">PMTA</span>
                      <span className="eq-value">{eq.calculo ? formatarValor(parseFloat(eq.calculo.pmta), eq.unidade) : '—'}</span>
                    </div>
                  </div>
                  <span className={`badge-relatorios ${(contagemPorTag.get(eq.tag) ?? 0) > 0 ? 'tem' : ''}`}>
                    {contagemPorTag.get(eq.tag) ?? 0} Relatórios
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tela === 'historico' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={voltarParaEquipamentos}>
              ← Voltar
            </button>
            <span className="breadcrumb-chevron">›</span>
            <span className="crumb-tag-chip">{tag}</span>
          </div>
          <div className="meta-card-header">
            <h3>Histórico de Relatórios</h3>
            <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
              {selecionados.size > 0 && (
                <button type="button" className="btn-secundario" onClick={excluirSelecionados}>
                  Excluir Selecionados ({selecionados.size})
                </button>
              )}
              <button type="button" className="btn-filtrar" onClick={() => setFiltroAberto((a) => !a)}>
                <Icone nome="filter" tam={14} /> Filtrar <Icone nome="chevdown" tam={12} />
              </button>
              {filtroAberto && (
                <div className="filter-menu">
                  <div className="fm-label">Tipo de inspeção</div>
                  {TIPOS_INSPECAO.map((t) => (
                    <label key={t} className="filter-opt">
                      <input
                        type="checkbox"
                        checked={filtroTipos.has(t)}
                        onChange={() =>
                          setFiltroTipos((s) => {
                            const novo = new Set(s);
                            if (novo.has(t)) novo.delete(t);
                            else novo.add(t);
                            return novo;
                          })
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>
              )}
              <button type="button" className="btn-primario" onClick={abrirEtapaDocumentos}>
                + Criar Relatório
              </button>
            </div>
          </div>
          {historico.length === 0 ? (
            <p className="dashboard-vazio">Nenhum relatório salvo ainda para este equipamento.</p>
          ) : (
            <div className="meta-table-wrap">
            <table className="meta-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={selecionados.size === historico.length} onChange={toggleSelecionarTodos} />
                  </th>
                  {/* Rótulos curtos, iguais aos `data-rot` do cartão do celular:
                      "Próx. Insp. Interna" quebrava em três linhas na coluna e
                      deixava o cabeçalho três vezes mais alto que o conteúdo. */}
                  <th>Nome do Relatório</th>
                  <th>TAG</th>
                  <th>Tipo</th>
                  <th>Criação</th>
                  <th>Validade</th>
                  <th>Próx. interna</th>
                  <th>Próx. externa</th>
                  <th>Val. válvula</th>
                  <th>Val. manômetro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {historicoVisivel.map((r) => (
                  <tr key={r.id}>
                    <td className="cel-check" data-rot="Selecionar">
                      <input type="checkbox" checked={selecionados.has(r.id)} onChange={() => toggleSelecionado(r.id)} />
                    </td>
                    <td className="cel-nome" data-rot="Relatório">
                      <span className="nome-relatorio-cel">
                        <span className="icone-pdf-cel">{IconePdf}</span>
                        {renomeandoId === r.id ? (
                          <input
                            autoFocus
                            value={nomeRenomeando}
                            onChange={(e) => setNomeRenomeando(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmarRenome(r)}
                          />
                        ) : (
                          // Envolvido para poder cortar em duas linhas: o nome gerado
                          // ("Relatorio_Inspeção_Periódica_AUTOCLAVE ESTERILAV - SANTA
                          // CASA MAUÁ.pdf") come metade da tabela e empurra a coluna de
                          // Ações para fora da tela.
                          <span className="nome-relatorio-txt" title={r.nome}>{r.nome}</span>
                        )}
                      </span>
                    </td>
                    {/* data-rot alimenta o ::before de cada célula quando a tabela vira
                        cartão no celular (ver relatorios.css) — sem cabeçalho, o valor
                        sozinho não diz de que data se trata. */}
                    <td data-rot="TAG">
                      <span className="tag-cel-link">{r.tagVaso}</span>
                    </td>
                    <td data-rot="Tipo">
                      <span className="badge-tipo-inspecao">{r.tipo}</span>
                    </td>
                    <td data-rot="Criação">{r.emissao}</td>
                    <td data-rot="Validade">{r.validade || '-'}</td>
                    <td data-rot="Próx. interna">{r.proximaInspecaoInterna || '-'}</td>
                    <td data-rot="Próx. externa">{r.proximaInspecaoExterna || '-'}</td>
                    {/* Derivado do lote de calibração vinculado; fallback: valor manual antigo */}
                    <td data-rot="Val. válvula">{validadesCal.get(r.id)?.valvula || r.validadeValvula || '-'}</td>
                    <td data-rot="Val. manômetro">{validadesCal.get(r.id)?.manometro || '-'}</td>
                    <td className="acoes-relatorio-icones">
                      {renomeandoId === r.id ? (
                        <button type="button" className="btn-secundario" onClick={() => confirmarRenome(r)}>
                          Salvar
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn-icone cor-cinza" title="Renomear" onClick={() => iniciarRenome(r)}>
                            {IconeLapis}
                          </button>
                          <button type="button" className="btn-icone cor-azul" title="Visualizar" onClick={() => visualizar(r)}>
                            {IconeOlho}
                          </button>
                          <button type="button" className="btn-icone cor-roxo" title="Duplicar" onClick={() => duplicar(r)}>
                            {IconeDuplicar}
                          </button>
                          <button type="button" className="btn-icone cor-vermelho" title="Deletar" onClick={() => excluirHistorico(r.id)}>
                            {IconeLixeira}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {tela === 'visualizador' && meta && documentos && (
        <>
          {/* Barra de ações — só 4 botões */}
          {erroSalvar && (
            <div className="no-print" role="alert" style={{ margin: '8px 0', padding: '10px 14px', border: '1px solid #c0392b', borderRadius: 8, background: '#fdf0ee', color: '#8e2b20', fontSize: 13 }}>
              {erroSalvar}
            </div>
          )}
          <div className="meta-barra-fixa no-print">
            <button type="button" className="btn-secundario barra-btn" onClick={voltarParaHistorico}>
              ← Voltar
            </button>
            <div className="meta-barra-acoes">
              {/* `gerando`: enquanto o contador de folhas está na cara do botão, ele ocupa a
                  linha inteira no celular — truncar "Gerando PDF 3/27..." tiraria justamente
                  o sinal de que o app não travou. */}
              {!somenteLeitura && (
                <button type="button" className={`barra-btn barra-btn-salvar${salvando ? ' is-loading' : ''}${progressoPdf ? ' gerando' : ''}`} onClick={salvarHistorico} disabled={salvando}>
                  {/* Salvar agora GERA o PDF: num relatório de 30+ folhas são
                      dezenas de segundos, e sem o contador a tela parece travada. */}
                  {progressoPdf
                    ? `Gerando PDF ${progressoPdf.feito}/${progressoPdf.total}...`
                    : salvando
                      ? 'Finalizando...'
                      : 'Salvar'}
                </button>
              )}
              <button
                type="button"
                className={`btn-secundario barra-btn${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                onClick={prepararEImprimir}
                disabled={imprimindo}
              >
                {documentosBloqueados() && <Icone nome="cadeado" tam={13} />}{' '}
                {imprimindo ? 'Preparando…' : 'Imprimir'}
              </button>
              <button
                type="button"
                className={`barra-btn barra-btn-pdf${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                onClick={baixarPdf}
                disabled={exportando}
              >
                {documentosBloqueados() ? <Icone nome="cadeado" tam={14} /> : <Icone nome="download" tam={14} />}{' '}
                {exportando ? 'Gerando PDF…' : 'Baixar PDF'}
              </button>
              <button type="button" className="btn-secundario barra-btn" onClick={() => setModalConfig(true)}>
                <Icone nome="sliders" tam={14} /> Configurações
              </button>
            </div>
          </div>

          {/* Banner flutuante (âmbar/warning) — fora dos iframes, nunca impresso */}
          {faltaRastreabilidade && !avisoRastreabFechado && (
            <div className="no-print rel-aviso-flutuante" role="alert">
              <span className="rel-aviso-ico">
                <Icone nome="alerttri" tam={16} />
              </span>
              <span>
                Cadastre o certificado do instrumento padrão em <b>Calibrações → Certificados Calibração</b>{' '}
                para os dados do aparelho aparecerem no relatório.
              </span>
              <button
                type="button"
                className="rel-aviso-fechar"
                aria-label="Dispensar aviso"
                onClick={() => setAvisoRastreabFechado(true)}
              >
                ✕
              </button>
            </div>
          )}

          {/* DOCUMENTO FINALIZADO: mostra o arquivo, não remonta. Nem o palco é
              montado — ver relatório salvo deixa de disputar os 3.368 KB. */}
          {relatorioArquivado && temArtefato(relatorioArquivado) ? (
            <>
              {relatorioArquivado.pdfPendente && (
                <div className="no-print" style={{ margin: '8px 0', padding: '8px 12px', border: '1px solid #b8860b', borderRadius: 8, background: '#fff8e1', color: '#7a5b00', fontSize: 13 }}>
                  Este documento ainda não terminou de subir para o servidor. Ele está salvo no
                  aparelho e o envio é retomado sozinho quando a conexão voltar.
                </div>
              )}
              <VisualizadorPdf
                artefato={{
                  pdfRef: relatorioArquivado.pdfRef!,
                  sha256: relatorioArquivado.sha256 ?? '',
                  geradoEm: relatorioArquivado.geradoEm ?? '',
                  pendente: relatorioArquivado.pdfPendente === true,
                  paginas: relatorioArquivado.paginas ?? 0,
                }}
                nomeArquivo={relatorioArquivado.nome}
                onErro={setErroSalvar}
              />
              <p className="no-print" style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 8, wordBreak: 'break-all' }}>
                Documento arquivado em {relatorioArquivado.geradoEm?.slice(0, 10) ?? '—'} ·{' '}
                {relatorioArquivado.paginas ?? '—'} páginas · SHA-256 {relatorioArquivado.sha256 ?? '—'}
              </p>
            </>
          ) : (
          <>
          {palco.estado !== 'pronto' && (
            <RecusaPalco estado={palco.estado} falha={palco.falha} />
          )}

          <div className="relatorio-preview" ref={previewRef}>
            {palco.estado === 'pronto' &&
              documentos.map((doc, i) => {
              const sep = doc.includes('?') ? '&' : '?';
              return (
                <PaginaA4 key={`${doc}-${i}-${versao}`}>
                  {/* ctx=rel: avisa rel-empresa.js/rel-assinatura.js que a folha roda dentro do
                      visualizador do relatório — usam os snapshots congelados da meta.
                      ro=1: relatório já salvo — sb-storage.js recusa toda escrita da folha. */}
                  <iframe src={`/arquivos-inspecao/${doc}${sep}tag=${encodeURIComponent(tag)}&page=${i + 1}&ctx=rel${palco.paramsIframe}${paramsSomenteLeitura(somenteLeitura)}`} scrolling="no" title={doc} />
                </PaginaA4>
              );
            })}
            {/* PDFs dos certificados padrão no fim — o preview mostra o pacote completo. */}
            <AnexosRastreabPreview key={`anexos-${versao}`} documentos={documentos} />
          </div>
          </>
          )}

          {/* Modal de configurações: todas as datas/campos + Atualizar + Baixar PDF */}
          {modalConfig && (
            <div className="rel-modal-overlay no-print" onClick={() => setModalConfig(false)}>
              <div className="rel-modal" onClick={(e) => e.stopPropagation()}>
                <div className="rel-modal-header">
                  <span>Configurações do Relatório</span>
                  <button type="button" className="rel-modal-fechar" onClick={() => setModalConfig(false)}>✕</button>
                </div>
                <div className="rel-modal-corpo">
                  <div className="rel-config-grid">
                    <div className="meta-barra-campo">
                      <label>Código</label>
                      <input value={meta.codigo} disabled />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Emissão</label>
                      <input placeholder="DD/MM/AAAA" inputMode="numeric" value={meta.emissao} readOnly={somenteLeitura} onChange={(e) => setCampoData('emissao', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Validade</label>
                      <input placeholder="DD/MM/AAAA" inputMode="numeric" value={meta.validade} readOnly={somenteLeitura} onChange={(e) => setCampoData('validade', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Execução Insp.</label>
                      <input placeholder="DD/MM/AAAA" inputMode="numeric" value={meta.execucaoInspecao} readOnly={somenteLeitura} onChange={(e) => setCampoData('execucaoInspecao', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Próx. Interna</label>
                      <input placeholder="DD/MM/AAAA" inputMode="numeric" value={meta.proximaInspecaoInterna} readOnly={somenteLeitura} onChange={(e) => setCampoData('proximaInspecaoInterna', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Próx. Externa</label>
                      <input placeholder="DD/MM/AAAA" inputMode="numeric" value={meta.proximaInspecaoExterna} readOnly={somenteLeitura} onChange={(e) => setCampoData('proximaInspecaoExterna', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Técnico</label>
                      <input value={meta.tecnicoNome} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('tecnicoNome', e.target.value)} />
                    </div>
                    {/* Assinantes do relatório (motor de assinatura) — gravados em
                        nr13_assinantes_rel_<TAG> antes do remount dos iframes. */}
                    <div className="meta-barra-campo">
                      <label htmlFor="rel-sel-engenheiro">Engenheiro (assina)</label>
                      {/* Relatório salvo é imutável: o snapshot congelado na meta vence, então
                          trocar assinante não teria efeito — select desabilitado. */}
                      <select
                        id="rel-sel-engenheiro"
                        value={valorAssinante(assinantes.engenheiroId, engenheiros)}
                        disabled={somenteLeitura}
                        onChange={(e) => trocarAssinanteRel('engenheiroId', e.target.value)}
                      >
                        <option value="">— sem assinatura —</option>
                        {engenheiros.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}{f.crea ? ` — ${f.crea}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="meta-barra-campo">
                      <label htmlFor="rel-sel-tecnico">Técnico (assina)</label>
                      <select
                        id="rel-sel-tecnico"
                        value={valorAssinante(assinantes.tecnicoId, tecnicos)}
                        disabled={somenteLeitura}
                        onChange={(e) => trocarAssinanteRel('tecnicoId', e.target.value)}
                      >
                        <option value="">— sem assinatura —</option>
                        {tecnicos.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}{f.crea ? ` — ${f.crea}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Termo do Livro de Registro: quem assina a folha LIVRO-REGISTRO.html.
                        A escolha vai para nr13_assinantes_rel_<TAG> e para o snapshot congelado
                        em meta.assinantes (relatório salvo não muda depois — §7-bis). */}
                    <div className="meta-barra-campo">
                      <label htmlFor="rel-sel-termo-livro">Quem assina o Termo do Livro de Registro</label>
                      <select
                        id="rel-sel-termo-livro"
                        value={assinantes.assinanteTermoLivro}
                        disabled={somenteLeitura}
                        onChange={(e) => trocarAssinanteTermoLivro(e.target.value as AssinanteTermoLivro)}
                      >
                        <option value="engenheiro">Engenheiro</option>
                        <option value="tecnico">Técnico</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="rel-modal-acoes">
                  {!somenteLeitura && (
                    <button type="button" className="btn-secundario" onClick={() => { atualizarMetadados(); }}>
                      Atualizar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {etapaModal === 'documentos' && (
        <ModalNovaInspecao onClose={() => setEtapaModal('nenhuma')} onGerar={avancarParaEtapaContainer} tag={tag} />
      )}
      {etapaModal === 'container' && (
        <ModalSelecionarContainer
          tag={tag}
          onClose={() => setEtapaModal('nenhuma')}
          onConfirmar={finalizarGeracao}
        />
      )}

      {toastSalvo && (
        <div className="toast-sucesso" role="status">
          ✓ Relatório salvo com sucesso
        </div>
      )}
    </div>
  );
}
