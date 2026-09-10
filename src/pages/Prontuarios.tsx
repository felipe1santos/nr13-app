import { usePalcoDocumento } from '../features/documentos/usePalcoDocumento';
import RecusaPalco from '../components/RecusaPalco';
import { useEffect, useState } from 'react';
import { Icone } from '../components/Icone';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import CatalogoProntuariosV9 from '../features/prontuarios/CatalogoProntuariosV9';
import ListaProntuariosV9 from '../features/prontuarios/ListaProntuariosV9';
import MaisAcoesProntuario from '../features/prontuarios/MaisAcoesProntuario';
import CampoProntuario from '../features/prontuarios/CampoProntuario';
import type { DocumentoProntuario } from '../features/prontuarios/indiceProntuarios';
// A MESMA moldura de modal usada em `/relatorios`: overlay, cabeçalho, ESC e
// armadilha de foco iguais nos dois módulos. O que muda por dentro é o
// catálogo, que é a única parte diferente entre um e outro.
import ModalSelecionarEquipamento from '../features/relatorios/ModalSelecionarEquipamento';
import ModalExcluirProntuario from '../features/prontuarios/ModalExcluirProntuario';
import { abrirEquipamentoParaProntuario } from '../features/prontuarios/catalogoProntuarios';
import { formatarValor } from '../calc/unidades';
import {
  carregarProntuario,
  excluirProntuario,
  gravarAssinantes,
  gravarProntuarioAtual,
  obterAssinantes,
  obterOuCriarMeta,
  salvarProntuario,
} from '../features/prontuarios/prontuarioService';
import type { AssinantesProntuario } from '../features/prontuarios/prontuarioService';
import type { DimensaoProntuario, ProntuarioDados } from '../features/prontuarios/tipos';
import { rotulosDimensoes } from '../features/prontuarios/rotulosDimensoes';
import { paginasProntuario, temCroqui2d } from '../features/prontuarios/tipos';
import PainelPilotoProntuario from '../features/relatorios/pdfVetorial/PainelPilotoProntuario';
import { motorProntuarioAtual } from '../features/relatorios/motorPdf';
import { previaProntuarioAtual } from '../features/prontuarios/previaProntuario';
import PreviaProntuarioVetorial from '../features/prontuarios/PreviaProntuarioVetorial';
import { abrirPdfEmAba } from '../components/VisualizadorPdf';
import { gerarProntuarioVetorial } from '../features/relatorios/pdfVetorial/gerarProntuario';
import { gerarPdfBytes } from '../features/relatorios/pdfService';
import { publicarArtefato, artefatoDe, baixarArtefato } from '../features/relatorios/artefatoRelatorio';
import {
  emissaoAtual,
  listarEmissoes,
  registrarEmissao,
  bytesDaEmissao,
} from '../features/prontuarios/emissaoProntuario';
import {
  docDeEmissao,
  docDeRascunho,
  encerrarRascunho,
  registrarDocumento,
  removerDoIndice,
} from '../features/prontuarios/indiceProntuarios';
import { fonteDeImpressao, rotuloImpressao } from '../features/documentos/fonteImpressao';
import { imprimirPdfArquivado } from '../components/VisualizadorPdf';
import { carregarMinhaEmpresa, listarClientes, listarFuncionarios } from '../features/cadastros/cadastroService';
import type { Cliente, Funcionario } from '../features/cadastros/tipos';
import { carregarVaso } from '../features/memorial/vasoMemorialService';
import { carregarDadosAutoclave } from '../features/memorial/autoclaveMemorialService';
import { carregarCaldeira } from '../features/memorial/caldeiraMemorialService';
import { ler, salvar } from '../services/storage';
import { listarContainers } from '../features/inspecoes/inspecaoService';
import type { ContainerInspecao } from '../features/inspecoes/tipos';
import type { EmpresaEquipamento, CategoriaSalva } from '../features/equipamento/tipos';
import ModeladorVaso from '../features/modelador/ModeladorVaso';
import {
  abrirProntuarioFabricante,
  baixarPdfFabricante,
  formatarTamanho as formatarTamanhoPdf,
  lerProntuarioFabricante,
} from '../features/equipamento/ProntuarioFabricante';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import { isTrial } from '../services/auth';
import { MSG_BLOQUEIO_DOCS, documentosBloqueados } from '../services/trial';
import { emitirAviso } from '../services/eventos';
import '../pages/relatorios.css';
import './prontuarios.css';
import PaginaA4 from '../components/PaginaA4';

/**
 * As telas de `/prontuarios`.
 *
 * `selecao` SAIU (06/09/2026): escolher o equipamento era uma tela inteira,
 * com trilha e botão de voltar, no meio do caminho de criar — a mesma
 * duplicidade corrigida em `/relatorios`. Virou modal sobre a lista, que
 * continua atrás no mesmo estado.
 */
type Tela = 'equipamentos' | 'formulario' | 'visualizador';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function dadosPadrao(tag: string): ProntuarioDados {
  return {
    tag,
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    descricao: '',
    dataFabricacao: '',
    classeFluid: '',
    categoria: '',
    grupoPotencialRisco: '',
    modelo: '',
    caracteristicasFuncionais: '',
    codigoProjeto: '',
    anoEdicao: '',
    pressaoTH: '',
    pressaoMaxOp: '',
    pressaoProjeto: '',
    nroSerie: '',
    pmta: '',
    sobreespessura: '',
    tempProjeto: '',
    tipoTampos: '',
    fundoCorpo: '',
    tampa: '',
    manipulos: '',
    prisioneiros: '',
    aro: '',
    luvConexoes: '',
    dimensoes: [linhaVazia()],
    revisao: '',
    dataRevisao: '',
  };
}

function linhaVazia(): DimensaoProntuario {
  return {
    modelo: '',
    diametro: '',
    altura: '',
    comprimento: '',
    espCorpo: '',
    espFundo: '',
    espTampa: '',
    volume: '',
  };
}

// ── Ensaio de espessura: extrai a grade de pontos + mínimos de um container e grava nas chaves
// que as folhas do prontuário leem (nr13_med_grid_<TAG> e nr13_med_esp_<TAG>). ──────────────
type MedidasUS = Record<string, Record<string, string>>;
// Ângulos por região (colunas distribuídas em 360°). Espelho de angulosDe do
// FormularioUltrassom; container antigo sem `colunas` cai nos 4 ângulos históricos.
function angulosUS(n: unknown): string[] {
  const qtd = Math.min(12, Math.max(1, Math.round(Number(n)) || 4));
  return Array.from({ length: qtd }, (_, i) => String(Math.round((i * 360) / qtd)));
}

// Ponto de medição como salvo pelo FormularioUltrassom (PontoME). Normalização replicada de lá
// (normalizarPontos não é exportado): região fora de 'ts'/'ti' cai no casco, ids duplicados/vazios
// são descartados.
type RegiaoUS = 'ts' | 'casco' | 'ti';
const PONTOS_FIXOS_US: { id: string; regiao: RegiaoUS }[] = [
  { id: 'ts', regiao: 'ts' },
  { id: 'c1', regiao: 'casco' },
  { id: 'c2', regiao: 'casco' },
  { id: 'c3', regiao: 'casco' },
  { id: 'c4', regiao: 'casco' },
  { id: 'ti', regiao: 'ti' },
];

function normalizarPontosUS(bruto: unknown): { id: string; regiao: RegiaoUS }[] {
  if (!Array.isArray(bruto)) return [];
  const validos: { id: string; regiao: RegiaoUS }[] = [];
  const vistos = new Set<string>();
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const p = item as { id?: unknown; regiao?: unknown };
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    validos.push({ id, regiao: p.regiao === 'ts' || p.regiao === 'ti' ? p.regiao : 'casco' });
  }
  return validos;
}

function construirGridMinima(medidas: MedidasUS | undefined, pontos?: unknown, colunas?: unknown) {
  const med = medidas ?? {};
  const cols = (colunas ?? {}) as Partial<Record<RegiaoUS, unknown>>;
  // Shape lido por PRONT-ULTRASSOM.html: { <regiao>: { angulos: string[], linhas: string[][] } }
  // (formato antigo — array puro de linhas com 4 ângulos — segue aceito na LEITURA lá).
  const angPorRegiao: Record<RegiaoUS, string[]> = {
    ts: angulosUS(cols.ts),
    casco: angulosUS(cols.casco),
    ti: angulosUS(cols.ti),
  };
  const linha = (id: string, regiao: RegiaoUS) => angPorRegiao[regiao].map((a) => med[id]?.[a] ?? '');
  // Container sem lista de pontos (dado antigo) => os 6 ids históricos.
  const lista = normalizarPontosUS(pontos);
  const efetivos = lista.length ? lista : PONTOS_FIXOS_US;
  const grid: Record<RegiaoUS, { angulos: string[]; linhas: string[][] }> = {
    ts: { angulos: angPorRegiao.ts, linhas: [] },
    casco: { angulos: angPorRegiao.casco, linhas: [] },
    ti: { angulos: angPorRegiao.ti, linhas: [] },
  };
  for (const p of efetivos) grid[p.regiao].linhas.push(linha(p.id, p.regiao));
  const minOf = (rows: string[][]) => {
    let m = Infinity;
    rows.forEach((r) =>
      r.forEach((v) => {
        const n = parseFloat(String(v).replace(',', '.'));
        if (Number.isFinite(n) && n > 0 && n < m) m = n;
      }),
    );
    return m === Infinity ? '' : String(m).replace('.', ',');
  };
  const minima = { sup: minOf(grid.ts.linhas), casco: minOf(grid.casco.linhas), inf: minOf(grid.ti.linhas) };
  return { grid, minima };
}

interface DadosUltrassomContainer {
  medidas?: MedidasUS;
  pontos?: unknown;
  colunas?: unknown;
  aparelho?: string;
  acoplante?: string;
  tempSup?: string;
  estadoSup?: string;
  cabecote?: string;
  velSonica?: string;
}

async function aplicarEnsaioEspessura(tag: string, container: ContainerInspecao | null): Promise<void> {
  const us = (container?.dados?.ultrassom as DadosUltrassomContainer | undefined) ?? undefined;
  const { grid, minima } = construirGridMinima(us?.medidas, us?.pontos, us?.colunas);
  await salvar(`nr13_med_grid_${tag}`, grid);
  // Além dos mínimos (sup/casco/inf), grava os campos de "Informações para o Ensaio" preenchidos
  // no FormularioUltrassom — PRONT-ULTRASSOM.html lê essas mesmas chaves (aparelho/acoplante/
  // tempSup/estadoSup/cabecote/velSonica) de nr13_med_esp_<TAG>.
  await salvar(`nr13_med_esp_${tag}`, {
    ...minima,
    aparelho: us?.aparelho ?? '',
    acoplante: us?.acoplante ?? '',
    tempSup: us?.tempSup ?? '',
    estadoSup: us?.estadoSup ?? '',
    cabecote: us?.cabecote ?? '',
    velSonica: us?.velSonica ?? '',
  });
}

function containerTemEspessura(c: ContainerInspecao): boolean {
  return c.ensaios.includes('ultrassom');
}

function rotuloContainer(c: ContainerInspecao): string {
  const preenchido = !!(c.dados?.ultrassom as { medidas?: MedidasUS } | undefined)?.medidas;
  return `Inspeção de ${c.criadoEm}${preenchido ? '' : ' (vazio)'}`;
}


export default function Prontuarios() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  /** O modal de escolher o equipamento para um prontuário NOVO. */
  const [criando, setCriando] = useState(false);
  /** Termo do catálogo DENTRO do modal — separado do da lista, que fica atrás. */
  const [termoCriacao, setTermoCriacao] = useState('');
  // Decisão de SESSÃO (memoizada em `flag.ts`), lida uma vez: qual lista
  // responde por esta tela. Só a LISTA e o momento da semeadura mudam — o
  // formulário e o visualizador são os mesmos nos dois caminhos.
  const [tag, setTag] = useState('');
  const [dados, setDados] = useState<ProntuarioDados>(dadosPadrao(''));
  const [versao, setVersao] = useState(0);

  // Palco: as 6 folhas do prontuário leem localStorage no DOMContentLoaded.
  // Nenhum iframe antes de `pronto` — prontuário meio montado sai impresso com
  // folha faltando.
  // A prévia vetorial é o DOCUMENTO: sem os seis iframes, e por isso sem
  // palco. O palco existe para materializar as chaves que os templates HTML
  // leem — sem template, materializar não serve a ninguém.
  const previaPront = previaProntuarioAtual(window.location.search);
  const palco = usePalcoDocumento(tag, `pront-${tag}-${versao}`, { pular: previaPront === 'vetorial' });
  /**
   * A TAG cujo prontuário a LISTA está pedindo para excluir.
   *
   * Uma TAG, e não um booleano: a exclusão é pedida de dois lugares (a lista e
   * o menu do visualizador) e o modal precisa saber DE QUEM está falando.
   */
  const [excluindoTag, setExcluindoTag] = useState<string | null>(null);
  /**
   * Este prontuário já existia quando foi aberto?
   *
   * Só para o TÍTULO do formulário. Ele dizia "Novo Prontuário" mesmo ao editar
   * um prontuário já EMITIDO — o cabeçalho contava uma história diferente da
   * que o botão "Emitir" e o selo da lista contavam.
   */
  const [jaExistia, setJaExistia] = useState(false);
  /** Bump para a lista refazer a busca depois de uma exclusão. */
  const [versaoLista, setVersaoLista] = useState(0);
  /**
   * Os campos cujo valor NA TELA veio do sistema.
   *
   * `abrirEquipamento` já sabia disso — montava o conjunto `preenchidos` e o
   * jogava fora. A diferença importante é o filtro: um campo que o memorial
   * preencheu MAS que o usuário já tinha editado mostra o valor DELE, e marcar
   * esse como automático seria mentir sobre a origem do dado. Por isso o
   * conjunto guardado é o dos campos em que o valor final ainda é o do sistema.
   *
   * Ele não é persistido: é derivado da abertura, e a próxima recalcula.
   */
  const [autoPreenchidos, setAutoPreenchidos] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [mostrarModelador, setMostrarModelador] = useState(false);
  const [tipoEquip, setTipoEquip] = useState('vaso');
  const [subtipoEquip, setSubtipoEquip] = useState('');
  const [visualizandoSemSalvar, setVisualizandoSemSalvar] = useState(false);
  const [containers, setContainers] = useState<ContainerInspecao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [assinantes, setAssinantes] = useState<AssinantesProntuario>({ engenheiroId: null, tecnicoId: null });
  const [imprimindo, setImprimindo] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erroEmissao, setErroEmissao] = useState('');
  // A emissão vigente do prontuário deste equipamento — `null` = nunca emitido.
  const [emissao, setEmissao] = useState<ReturnType<typeof emissaoAtual>>(null);
  /** Qual revisão está aberta — a posição da emissão vigente na lista da TAG. */
  const revisaoAtual = emissao ? listarEmissoes(tag).findIndex((x) => x.id === emissao.id) + 1 : 0;
  // Recomputado a cada render — o bump de `versao` no onSalvo do modelador atualiza o indicador.
  const croquiSalvo = tag !== '' && localStorage.getItem(`nr13_croqui2d_${tag}`) !== null;
  // Caldeira e autoclave não têm croqui: as duas folhas que dependem dele saem
  // do documento (ver paginasProntuario). A numeração e o total do rodapé saem
  // desta lista, e a impressão/PDF rasterizam o que ela montou.
  const folhasDoProntuario = paginasProntuario(tipoEquip);

  // A emissão vigente entra no estado quando o visualizador abre: é ela que
  // decide se a tela oferece "Emitir" ou "Abrir documento emitido".
  useEffect(() => {
    setEmissao(tag ? emissaoAtual(tag) : null);
    setErroEmissao('');
  }, [tag, versao]);
  // PDF do prontuário do fabricante (nr13_pront_fab_<TAG>) — enviado na ficha do equipamento.
  const prontFabricante = tag !== '' ? lerProntuarioFabricante(tag) : null;

  /**
   * IMPRIMIR = o ARQUIVO, quando ele existe.
   *
   * Prontuário já emitido imprime os bytes do `pdfRef` daquela emissão. Antes
   * daqui o botão rasterizava as 6 folhas montadas na tela — papel feito com os
   * dados de HOJE, para um documento assinado meses atrás, e adulterável pelo
   * DevTools antes do clique. Ver `features/documentos/fonteImpressao.ts`.
   *
   * Sem emissão não há arquivo: aí é PRÉ-VISUALIZAÇÃO, o botão diz isso, e nada
   * é arquivado nem registrado.
   */
  async function prepararEImprimir() {
    setImprimindo(true);
    setErroEmissao('');
    try {
      if (fonteDeImpressao(emissao) === 'arquivo') {
        const ok = await imprimirPdfArquivado(artefatoDe(emissao)!);
        if (!ok) setErroEmissao('Não foi possível abrir o PDF para impressão. Verifique a conexão.');
        return;
      }
      if (previaPront === 'vetorial') {
        // Sem arquivo emitido, o que se imprime é a PRÉ-VISUALIZAÇÃO — e ela
        // sai do mesmo gerador da emissão, não de uma rasterização da tela.
        const r = await gerarProntuarioVetorial(tag);
        if (!abrirPdfEmAba(r.bytes)) {
          setErroEmissao('Não foi possível abrir a pré-visualização para impressão. Verifique o bloqueador de pop-ups.');
        }
        return;
      }
      await imprimirRelatorio('.prontuario-preview');
    } finally {
      setImprimindo(false);
    }
  }

  /**
   * EMITIR: o prontuário vira ARQUIVO.
   *
   * Qual motor produz os bytes é decisão de `motorProntuarioAtual` — chave
   * própria (`nr13_motor_prontuario`), independente da do relatório. Depois
   * disso o caminho é o mesmo do §7-quater: SHA-256, upload, `pdfRef`, e
   * reabrir serve o ARQUIVO em vez de remontar as folhas.
   *
   * Emitir de novo NÃO sobrescreve: `registrarEmissao` acrescenta uma revisão
   * e a emissão anterior continua alcançável pelo seu próprio `pdfRef`.
   */
  async function emitirProntuario() {
    if (documentosBloqueados()) return;
    setEmitindo(true);
    setErroEmissao('');
    try {
      const motor = motorProntuarioAtual(window.location.search);
      const r =
        motor === 'vetorial'
          ? await gerarProntuarioVetorial(tag)
          : await gerarPdfBytes('.prontuario-preview', { rastreabilidades: false });
      const artefato = await publicarArtefato(r.bytes, r.paginas);
      const meta = await obterOuCriarMeta(tag);
      const emitida = await registrarEmissao(tag, {
        numero: meta.numero ?? null,
        emissao: meta.emissao ?? null,
        motor,
        pdfRef: artefato.pdfRef,
        sha256: artefato.sha256,
        paginas: artefato.paginas,
        tamanho: r.bytes.byteLength,
        geradoEm: artefato.geradoEm,
        // A verdade vem do cofre: upload recusado com o navegador online
        // também é pendente (medido em 11/08/2026 com o bucket devolvendo 500).
        pdfPendente: artefato.pendente,
      });
      setEmissao(emitida);
      // UMA LINHA POR REVISÃO. `registrarEmissao` acrescenta e nunca
      // sobrescreve, então a posição na lista É o número da revisão.
      const revisao = listarEmissoes(tag).findIndex((x) => x.id === emitida.id) + 1;
      await registrarDocumento(
        docDeEmissao(
          emitida,
          revisao,
          dados.descricao || null,
          dados.empresaRazaoSocial || null,
          ROTULO_TIPO[tipoEquip] ?? tipoEquip ?? null,
          dados.categoria || null,
        ),
      );
      // O trabalho em aberto virou documento: manter as duas linhas anunciaria
      // um rascunho que não existe mais.
      await encerrarRascunho(tag);
    } catch (e) {
      setErroEmissao(e instanceof Error ? e.message : 'Falha ao emitir o prontuário.');
    } finally {
      setEmitindo(false);
    }
  }

  /**
   * Abre o documento EMITIDO — o arquivo, nunca uma remontagem.
   *
   * Não depende do palco nem dos dados vivos do equipamento: `bytesDaEmissao`
   * recebe só o registro da emissão e resolve o `pdfRef`. Um documento de meses
   * atrás abre sem montar folha nenhuma.
   */
  async function abrirEmitido() {
    if (!emissao) return;
    setErroEmissao('');
    try {
      const blob = await bytesDaEmissao(emissao, { artefatoDe, baixarArtefato });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setErroEmissao(e instanceof Error ? e.message : 'Falha ao abrir o documento emitido.');
    }
  }

  // Pré-rasteriza as folhas do prontuário em #print-root assim que o visualizador carrega (e a cada
  // nova versão). Assim o Ctrl+P nativo e o botão imprimem as imagens prontas — 1 folha por A4, sem
  // o navegador quebrar os iframes. Limpa ao sair do visualizador.
  //
  // COM EMISSÃO, NÃO. `prepararFolhasImpressao` liga a classe `imprimindo-relatorio`, e é ela que
  // faz o Ctrl+P NATIVO imprimir as imagens do #print-root. Num prontuário já emitido isso poria
  // no papel uma rasterização das folhas montadas com os dados de HOJE — parecendo o documento
  // arquivado e sem sê-lo. Sem a classe, o Ctrl+P cai no fluxo normal do navegador e o caminho
  // oficial continua sendo o botão, que serve o `pdfRef`.
  useEffect(() => {
    if (tela !== 'visualizador') return;
    // Prévia vetorial não tem iframe para rasterizar: o documento já é PDF.
    if (previaPront === 'vetorial') return;
    if (fonteDeImpressao(emissao) === 'arquivo') return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.prontuario-preview');
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
      .then(() => new Promise((r) => setTimeout(r, 500))) // deixa imagens/croqui/fontes assentarem
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.prontuario-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
    // `emissao` entra nas dependências para que EMITIR desligue o modo de impressão
    // rasterizada na hora: a limpeza do efeito é que remove a classe e o #print-root.
  }, [tela, versao, emissao]);


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    setClientes(listarClientes());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    setFuncionarios(listarFuncionarios());
  }, []);

  // Assinantes do prontuário (engenheiro + técnico): carrega a escolha salva da TAG e, por
  // conveniência, pré-seleciona o engenheiro quando há exatamente 1 cadastrado (e persiste).
  // O técnico NUNCA é pré-selecionado sozinho.
  function carregarAssinantes(tagEq: string, funcs: Funcionario[]) {
    const a = obterAssinantes(tagEq);
    if (!a.engenheiroId) {
      const engs = funcs.filter((f) => f.tipo === 'Engenheiro');
      if (engs.length === 1) {
        a.engenheiroId = engs[0].id;
        gravarAssinantes(tagEq, a);
      }
    }
    setAssinantes(a);
  }

  // Grava a escolha ANTES do bump de versão — os iframes remontados leem a chave nova.
  function trocarAssinante(campo: keyof AssinantesProntuario, id: string) {
    const novo: AssinantesProntuario = { ...assinantes, [campo]: id || null };
    setAssinantes(novo);
    gravarAssinantes(tag, novo);
    setVersao((v) => v + 1);
  }

  /**
   * 9F.2.3 — o caminho da tela nova: SEMEIA a TAG e só então abre.
   *
   * A ordem é o teste inteiro (`catalogoProntuarios.test.ts`). Sem a semeadura,
   * o cache não tem a TAG, o palco não acha nada para materializar e as seis
   * folhas do prontuário imprimem "-" — sem erro nenhum na tela.
   */
  /**
   * Abre o prontuário de uma TAG.
   *
   * `editar` força o FORMULÁRIO. Sem ele vale a regra de sempre: prontuário
   * existente abre no visualizador, inexistente abre no formulário — é o
   * comportamento que a lista já tinha no clique da linha, e ele não mudou.
   */
  /**
   * Abrir uma linha da lista canônica.
   *
   * RASCUNHO abre no formulário — é trabalho em aberto, e o verbo é continuar.
   * EMITIDO abre o equipamento e o visualizador, que serve o ARQUIVO daquela
   * emissão (§7-quater): documento emitido não é remontado.
   */
  async function abrirDocumento(doc: DocumentoProntuario) {
    await abrirPorTag(doc.tag, { editar: doc.situacao === 'rascunho' });
  }

  async function abrirPorTag(tag: string, opcoes?: { editar?: boolean }) {
    const { resumo } = await abrirEquipamentoParaProntuario(tag);
    if (!resumo) return;
    await abrirEquipamento(resumo);
    if (opcoes?.editar) setTela('formulario');
  }

  async function abrirEquipamento(eq: EquipamentoResumo) {
    const existente = carregarProntuario(eq.tag);
    setJaExistia(!!existente);
    setTag(eq.tag);
    setTipoEquip(eq.info.tipo);
    setSubtipoEquip(eq.info.subtipo || '');
    const conts = listarContainers(eq.tag);
    setContainers(conts);
    // Lista fresca de funcionários (pode ter mudado desde o mount) + assinantes salvos da TAG.
    const funcs = listarFuncionarios();
    setFuncionarios(funcs);
    carregarAssinantes(eq.tag, funcs);

    {
      // O prefill do memorial roda SEMPRE (novo ou existente) para que os campos derivados do
      // memorial/equipamento (materiais, espessuras, pressões, categoria…) sejam puxados mesmo em
      // prontuários antigos salvos com o memorial vazio/quebrado. Edições manuais do usuário são
      // preservadas no merge abaixo (o valor salvo vence; o memorial só preenche o que está vazio).
      const base = dadosPadrao(eq.tag);
      const preenchidos = new Set<string>();
      const dimPreenh = new Set<string>();
      const dimLine = linhaVazia();

      // helpers que marcam campos como auto-preenchidos
      function pb<K extends keyof ProntuarioDados>(k: K, v: ProntuarioDados[K]) {
        if (v != null && v !== '') { base[k] = v; preenchidos.add(k as string); }
      }
      function pd(k: keyof DimensaoProntuario, v: string) {
        if (v !== '') { dimLine[k] = v; dimPreenh.add(k as string); }
      }
      const str = (v: unknown): string => (v != null && v !== '' ? String(v) : '');

      // ─── Equipamento ───
      pb('descricao', eq.info.descricao || ROTULO_TIPO[eq.info.tipo] || '');
      pb('dataFabricacao', eq.info.ano || '');
      pb('nroSerie', eq.info.numeroSerie || eq.info.tag || eq.tag);
      pb('modelo', eq.info.fabricante || '');
      pb('categoria', eq.categoria?.catFinal ?? '');

      // ─── Categoria ───
      const cat = ler<CategoriaSalva>(`nr13_cat_${eq.tag}`);
      if (cat) {
        pb('classeFluid', cat.fluidoInput ? cat.fluidoInput.slice(4) : cat.classe);
        pb('grupoPotencialRisco', String(cat.grupo));
      }

      // ─── Cálculo (PMTA / PTH) ───
      if (eq.calculo) {
        const pmtaNum = parseFloat(eq.calculo.pmta);
        const pthNum = parseFloat(eq.calculo.pth || '0');
        pb('pmta', formatarValor(pmtaNum, eq.unidade));
        pb('pressaoProjeto', formatarValor(pmtaNum, eq.unidade));
        pb('pressaoMaxOp', formatarValor(pmtaNum, eq.unidade));
        if (pthNum > 0) pb('pressaoTH', formatarValor(pthNum, eq.unidade));
      }

      // ─── Minha empresa (emissora) ───
      const minhaEmp = carregarMinhaEmpresa();
      if (minhaEmp.logo) base.logo = minhaEmp.logo;
      pb('minhaEmpresaNome', minhaEmp.razao || minhaEmp.fantasia || '');
      pb('minhaEmpresaCnpj', minhaEmp.cnpj || '');
      pb('minhaEmpresaEndereco', minhaEmp.endereco || '');
      pb('minhaEmpresaCidade', minhaEmp.cidade || '');
      pb('minhaEmpresaEstado', minhaEmp.estado || '');
      pb('minhaEmpresaTelefone', minhaEmp.telefone || '');

      // ─── Dimensão: modelo e volume da categoria ───
      pd('modelo', eq.info.fabricante || '');
      if (cat && cat.volInput > 0) pd('volume', (cat.volInput * 1000).toFixed(0));

      // ─── Dados do memorial por tipo ───
      const ROTULO_TAMPO_VASO: Record<string, string> = {
        eliptico: 'Elíptico 2:1 (UG-32d)',
        toroesferico: 'Torisférico ASME F&D (UG-32e)',
        esferico: 'Hemiesférico (UG-32b)',
        plano: 'Plano Soldado (UG-34)',
        planoAparafusado: 'Plano Aparafusado (UG-34)',
        cone: 'Cônico (UG-32g)',
      };

      if (eq.info.tipo === 'vaso') {
        pb('codigoProjeto', 'ASME Seção VIII Divisão 1');
        pb('anoEdicao', '2021');
        const v = carregarVaso(eq.tag);
        if (v.D) pd('diametro', str(v.D));
        if (v.componentes.length > 0) {
          const casco = v.componentes.find((c) => c.id === 'casco');
          const t1 = v.componentes.find((c) => c.id === 'tampo1');
          const t2 = v.componentes.find((c) => c.id === 'tampo2');
          if (casco) {
            if (casco.dados.t_comercial) pd('espCorpo', str(casco.dados.t_comercial));
            if (casco.dados.ca) pb('sobreespessura', str(casco.dados.ca) + ' mm');
            if (casco.dados.temp) pb('tempProjeto', str(casco.dados.temp) + ' °C');
            if (casco.dados.mat) pb('fundoCorpo', casco.dados.mat);
          }
          if (t1?.dados.t_comercial) pd('espFundo', str(t1.dados.t_comercial));
          if (t2?.dados.t_comercial) pd('espTampa', str(t2.dados.t_comercial));
          const rots = [t1, t2].filter(Boolean).map((c) => ROTULO_TAMPO_VASO[c!.tipo] || c!.tipo);
          if (rots.length) pb('tipoTampos', rots.join(' / '));
          if (t1?.dados.mat) pb('tampa', t1.dados.mat);
        }
      }

      if (eq.info.tipo === 'autoclave') {
        pb('codigoProjeto', 'ASME Seção VIII Divisão 1');
        pb('anoEdicao', '2021');
        if (eq.info.subtipo === 'cilindrica') {
          // O memorial da autoclave cilíndrica é, na prática, o MemorialVaso salvo em ac_corpo —
          // fonte primária. nr13_autoclave_dados_cilindrica só é fallback (pode ser default).
          const v = carregarVaso(eq.tag, 'ac_corpo');
          const dac = carregarDadosAutoclave(eq.tag, 'cilindrica');
          const casco = v.componentes.find((c) => c.id === 'casco');
          const t1 = v.componentes.find((c) => c.id === 'tampo1');
          const t2 = v.componentes.find((c) => c.id === 'tampo2');
          if (v.D) pd('diametro', str(v.D));
          else if (dac.diametro) pd('diametro', str(dac.diametro));
          if (casco?.dados.t_comercial) pd('espCorpo', str(casco.dados.t_comercial));
          else if (dac.espessura) pd('espCorpo', str(dac.espessura));
          if (casco?.dados.ca) pb('sobreespessura', str(casco.dados.ca) + ' mm');
          else if (dac.ca) pb('sobreespessura', str(dac.ca) + ' mm');
          if (casco?.dados.mat) pb('fundoCorpo', casco.dados.mat);
          if (casco?.dados.temp) pb('tempProjeto', str(casco.dados.temp) + ' °C');
          if (t1?.dados.t_comercial) pd('espFundo', str(t1.dados.t_comercial));
          if (t2?.dados.t_comercial) pd('espTampa', str(t2.dados.t_comercial));
          const rots = [t1, t2].filter(Boolean).map((c) => ROTULO_TAMPO_VASO[c!.tipo] || c!.tipo);
          if (rots.length) pb('tipoTampos', rots.join(' / '));
          if (t1?.dados.mat) pb('tampa', t1.dados.mat);
        } else {
          const dac = carregarDadosAutoclave(eq.tag, 'retangular');
          if (dac.espessura) { pd('espCorpo', str(dac.espessura)); pd('espFundo', str(dac.espessura)); pd('espTampa', str(dac.espessura)); }
        }
      }

      if (eq.info.tipo === 'caldeira') {
        pb('codigoProjeto', 'ASME Seção I');
        pb('anoEdicao', '2004');
        const cald = carregarCaldeira(eq.tag);
        if (cald.costado.D) pd('diametro', str(cald.costado.D));
        if (cald.costado.espEncontrada) pd('espCorpo', str(cald.costado.espEncontrada));
        if (cald.costado.C) pb('sobreespessura', str(cald.costado.C) + ' mm');
        if (cald.temp !== '' && cald.temp != null) pb('tempProjeto', str(cald.temp) + ' °C');
        if (cald.costado.mat) pb('fundoCorpo', cald.costado.mat);
        if (cald.espelho.espEncontrada) {
          pd('espFundo', str(cald.espelho.espEncontrada));
          pd('espTampa', str(cald.espelho.espEncontrada));
        }
        if (cald.espelho.mat) pb('tampa', cald.espelho.mat);
      }

      base.dimensoes = [dimLine];

      // ─── Empresa proprietária ───
      const empTag = ler<EmpresaEquipamento>(`nr13_emp_${eq.tag}`);
      if (empTag) {
        if (empTag.clienteId) base.empresaClienteId = empTag.clienteId;
        pb('empresaRazaoSocial', empTag.razaoSocial || '');
        pb('empresaCnpj', empTag.cnpj || '');
        pb('empresaEndereco', empTag.endereco || '');
        pb('empresaCidade', empTag.cidade || empTag.localidade || '');
        pb('empresaEstado', empTag.estado || '');
        pb('empresaTelefone', empTag.telefone || '');
      }

      // Merge gap-fill: parte do memorial (base) e sobrepõe os valores não-vazios já salvos pelo
      // usuário (existente vence). Assim campos vazios recebem o memorial sem apagar edições.
      let finais = base;
      if (existente) {
        finais = { ...base };
        (Object.keys(existente) as (keyof ProntuarioDados)[]).forEach((k) => {
          if (k === 'dimensoes') return;
          const val = existente[k];
          if (val != null && val !== '') (finais as unknown as Record<string, unknown>)[k] = val;
        });
        const dimsTemDado = existente.dimensoes?.some((l) =>
          Object.values(l).some((c) => c !== '' && c != null),
        );
        finais.dimensoes = dimsTemDado ? existente.dimensoes : base.dimensoes;
      }

      // Só continua "automático" o campo em que o valor final é o do sistema.
      setAutoPreenchidos(
        new Set(
          [...preenchidos].filter(
            (k) =>
              (finais as unknown as Record<string, unknown>)[k] ===
              (base as unknown as Record<string, unknown>)[k],
          ),
        ),
      );
      setDados(finais);
      setMostrarModelador(false);
      gravarProntuarioAtual(finais);
      // Grava/reusa a meta (nº do relatório + data de emissão) na chave por TAG que as folhas
      // PRONT-*.html leem — precisa acontecer antes de montar os iframes.
      await obterOuCriarMeta(eq.tag);
      // Re-aplica a grade de espessura do ensaio escolhido (ou limpa se nenhum) para os iframes.
      const contSel = finais.containerEnsaioId ? conts.find((c) => c.id === finais.containerEnsaioId) ?? null : null;
      await aplicarEnsaioEspessura(eq.tag, contSel);
      if (existente) {
        setVersao((v) => v + 1);
        setVisualizandoSemSalvar(false);
        setTela('visualizador');
      } else {
        setTela('formulario');
      }
    }
  }

  function set<K extends keyof ProntuarioDados>(campo: K, valor: ProntuarioDados[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
    // Digitou: o valor deixou de ser do sistema, e o selo "auto" some. Sem
    // isto o campo continuaria anunciando uma origem que já não é a dele.
    setAutoPreenchidos((s) => {
      if (!s.has(campo as string)) return s;
      const n = new Set(s);
      n.delete(campo as string);
      return n;
    });
  }

  function setDim(i: number, campo: keyof DimensaoProntuario, valor: string) {
    setDados((d) => {
      const dims = [...(d.dimensoes ?? [])];
      if (!dims[i]) dims[i] = linhaVazia();
      dims[i] = { ...dims[i], [campo]: valor };
      return { ...d, dimensoes: dims };
    });
  }

  function preencherEmpresaProprietaria(clienteId: string) {
    const c = clientes.find((x) => x.id === clienteId);
    const novo: ProntuarioDados = { ...dados, empresaClienteId: clienteId || undefined };
    if (c) {
      novo.empresaRazaoSocial = c.razaoSocial || c.nomeFantasia || '';
      novo.empresaCnpj = c.cnpj || '';
      novo.empresaEndereco = [c.endereco, c.bairro].filter(Boolean).join(' - ');
      novo.empresaCidade = c.cidade || '';
      novo.empresaEstado = c.estado || '';
      novo.empresaTelefone = c.telefone || '';
    }
    setDados(novo);
    gravarProntuarioAtual(novo);
  }

  function selecionarEnsaio(id: string) {
    set('containerEnsaioId', id || undefined);
    const cont = id ? containers.find((c) => c.id === id) ?? null : null;
    const novo = { ...dados, containerEnsaioId: id || undefined };
    gravarProntuarioAtual(novo);
    void aplicarEnsaioEspessura(tag, cont);
  }

  async function visualizar() {
    gravarProntuarioAtual(dados);
    await obterOuCriarMeta(tag);
    setVersao((v) => v + 1);
    setVisualizandoSemSalvar(true);
    setTela('visualizador');
  }

  /**
   * SALVAR = guardar o RASCUNHO. Não emite nada.
   *
   * O trabalho fica gravado em `nr13_prontuario_<TAG>` — sincroniza pela v2,
   * sobrevive a fechar o navegador e pode ser retomado de outro aparelho. A
   * linha no índice é o que o faz aparecer na lista como trabalho em aberto,
   * em vez de ficar invisível até alguém abrir aquele equipamento.
   */
  async function salvar() {
    setSalvando(true);
    try {
      await salvarProntuario(tag, dados);
      gravarProntuarioAtual(dados);
      const meta = await obterOuCriarMeta(tag);
      await registrarDocumento(
        docDeRascunho(tag, dados, meta.numero ?? null, undefined, ROTULO_TIPO[tipoEquip] ?? tipoEquip ?? null),
      );
      setJaExistia(true);
      setVersao((v) => v + 1);
      setVisualizandoSemSalvar(false);
      setTela('visualizador');
    } finally {
      setSalvando(false);
    }
  }

  // Listas para os seletores de assinantes; se o funcionário salvo foi excluído, o select cai em ''.
  const engenheiros = funcionarios.filter((f) => f.tipo === 'Engenheiro');
  const tecnicos = funcionarios.filter((f) => String(f.tipo).startsWith('Inspetor'));
  const valorAssinante = (id: string | null, lista: Funcionario[]) =>
    id && lista.some((f) => f.id === id) ? id : '';

  /*
   * O `handleExcluir` de dois cliques SAIU (06/09/2026).
   *
   * Ele era um botão vermelho na barra que virava "Confirmar Exclusão" no
   * primeiro clique — uma confirmação que não explicava nada e ficava no mesmo
   * lugar do botão que a disparou. A exclusão agora mora no menu "Mais ações" e
   * abre `ModalExcluirProntuario`, que diz o que NÃO é apagado: os PDFs já
   * emitidos e o croqui.
   */


  return (
    <div className="prontuarios-page">
      {/* O <h1> saiu: a topbar já mostra o título e o subtítulo da seção, e
          repeti-lo custava ~40px acima do conteúdo em toda visita. */}

      {/* 9F.2.1 · a lista da projeção, com busca e virtualização. O que vem
          depois dela — formulário e visualizador — é o MESMO nos dois
          caminhos. */}
      {/* UX · o menu abre o HISTÓRICO de prontuários, não a lista de
          equipamentos. Escolher o equipamento é etapa da CRIAÇÃO, e mora na
          tela 'selecao' — a mesma separação feita em /relatorios. */}
      {/* LISTA CANÔNICA · uma barra, uma lista. O botão de criar vai DENTRO da
          barra (à direita da busca), em vez de num cabeçalho acima dela: eram
          três faixas empilhadas antes da primeira linha do conteúdo. */}
      {/* LISTA CANÔNICA · uma linha por DOCUMENTO — cada revisão emitida e
          cada rascunho em aberto. O catálogo de EQUIPAMENTOS continua existindo
          e continua sendo o passo 1 da criação, dentro do modal. */}
      {tela === 'equipamentos' && (
        <ListaProntuariosV9
          versao={versaoLista}
          aoAbrir={(doc) => void abrirDocumento(doc)}
          acoes={
            <button
              type="button"
              className="fj-btn fj-btn-primary pront-btn-criar"
              aria-haspopup="dialog"
              onClick={() => setCriando(true)}
            >
              <Icone nome="plus" tam={14} />{' '}
              <span className="pront-btn-rotulo">Criar prontuário</span>
            </button>
          }
        />
      )}

      {/* CRIAR · a lista continua atrás, no mesmo estado. Cancelar devolve
          exatamente o que havia antes — busca, filtro e rolagem. */}
      {/* EXCLUIR pela lista. A regra é a MESMA de sempre
          (`excluirProntuario`); o que muda é o lugar de onde ela é chamada.
          Modal, e não `confirm()`, porque a ação apaga um documento técnico. */}
      {excluindoTag && (
        <ModalExcluirProntuario
          tag={excluindoTag}
          temEmissao={!!emissaoAtual(excluindoTag)}
          aoFechar={() => setExcluindoTag(null)}
          aoConfirmar={async () => {
            await excluirProntuario(excluindoTag);
            await removerDoIndice(excluindoTag);
            setExcluindoTag(null);
            // A lista relê sozinha: a projeção é a fonte, e o selo daquela
            // linha passa a sair do que o servidor souber na próxima busca.
            setVersaoLista((v) => v + 1);
          }}
        />
      )}

      {criando && (
        <ModalSelecionarEquipamento
          sobre="Criar prontuário"
          aoFechar={() => setCriando(false)}
          /* Coluna de apoio, à DIREITA da lista: a ilustração cabe grande sem
             empurrar equipamento nenhum, e os três passos dizem o que acontece
             depois da escolha. */
          intro={
            <div className="mcr-intro">
              <img
                src="/ilustracoes/escolher-equipamento.webp"
                alt="Folha de prontuário sobre outras folhas, com campos preenchidos e itens marcados"
                loading="lazy"
                decoding="async"
              />
              <strong>Escolha o equipamento</strong>
              <p>Selecione ao lado o equipamento que vai receber o prontuário.</p>
              <ul className="mcr-intro-passos">
                <li>O documento abre já com os dados da ficha preenchidos.</li>
                <li>Você completa o que faltar e salva como rascunho.</li>
                <li>A emissão acontece depois, quando o prontuário estiver pronto.</li>
              </ul>
            </div>
          }
        >
          <CatalogoProntuariosV9
            modo="selecao"
            termo={termoCriacao}
            aoMudarTermo={setTermoCriacao}
            aoEscolher={(tag) => {
              setCriando(false);
              void abrirPorTag(tag);
            }}
          />
        </ModalSelecionarEquipamento>
      )}


      {tela === 'formulario' && (
        <>
          {/* UMA BARRA. Eram três faixas empilhadas antes do primeiro campo:
              trilha com "← Voltar {tag}", cabeçalho com "Prontuário — {tag}", e
              as ações lá embaixo, no fim do formulário — o usuário rolava a
              tela inteira para salvar. Agora: voltar, identificação, situação e
              ações na mesma linha, no topo, sempre alcançáveis. */}
          <div className="bloco-dados pront-topo">
            <div className="pront-barra">
              <button
                type="button"
                className="fj-btn fj-btn-ghost pront-barra-voltar"
                onClick={() => setTela('equipamentos')}
              >
                ← <span className="pront-btn-rotulo">Voltar</span>
              </button>
              <div className="pront-barra-id">
                <strong>{jaExistia ? 'Prontuário' : 'Novo prontuário'} — {tag}</strong>
                <span>{emissao ? `emitido · rev. ${String(revisaoAtual).padStart(2, '0')}` : 'rascunho'}</span>
              </div>
              <div className="pront-visualizador-acoes">
                <button type="button" className="fj-btn fj-btn-ghost" onClick={visualizar}>
                  <span className="pront-btn-rotulo">Pré-visualizar</span>
                  <span className="pront-btn-icone" aria-hidden>
                    <Icone nome="eye" tam={14} />
                  </span>
                </button>
                <button
                  type="button"
                  className={`fj-btn fj-btn-primary${salvando ? ' is-loading' : ''}`}
                  onClick={salvar}
                  disabled={salvando}
                >
                  {salvando ? 'Salvando…' : 'Salvar rascunho'}
                </button>
              </div>
            </div>

            {/* RESUMO · o que identifica o documento, numa faixa de uma linha.
                Ele responde "estou no equipamento certo?" sem rolar até os
                campos, que é a pergunta de quem volta a um rascunho. */}
            <div className="pront-resumo">
              <span><b>Equipamento</b>{dados.descricao?.trim() || '—'}</span>
              <span><b>Tipo</b>{ROTULO_TIPO[tipoEquip] ?? tipoEquip ?? '—'}</span>
              <span><b>Cliente</b>{dados.empresaRazaoSocial?.trim() || '—'}</span>
              <span><b>Categoria</b>{dados.categoria?.trim() || '—'}</span>
            </div>
          </div>

        <div className="bloco-dados">

          {/* Empresa Proprietária — editável */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Empresa Proprietária</div>
            <div className="pront-form-grid cols-1">
              <div className="pront-campo">
                <label>Selecionar Empresa Cadastrada (preenche automático)</label>
                {clientes.length > 0 ? (
                  <select
                    value={dados.empresaClienteId ?? ''}
                    onChange={(e) => preencherEmpresaProprietaria(e.target.value)}
                  >
                    <option value="">— Selecione um cliente cadastrado —</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razaoSocial || c.nomeFantasia || c.cnpj || c.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="dashboard-vazio" style={{ margin: 0, fontSize: 13 }}>
                    Nenhum cliente cadastrado. Cadastre em "Clientes" para puxar automaticamente.
                  </p>
                )}
              </div>
            </div>
            <div className="pront-form-grid">
              {/* ORDEM que não deixa buraco na grade: o campo largo ocupa a
                  linha inteira, e os curtos vêm em PARES. Antes era Razão
                  (largo) · CNPJ · Endereço (largo) · Cidade · Estado ·
                  Telefone — o CNPJ ficava sozinho numa linha, com meia linha
                  vazia ao lado, e o mesmo acontecia com o Telefone. */}
              <CampoProntuario
                rotulo="Razão Social"
                valor={dados.empresaRazaoSocial ?? ''}
                aoMudar={(v) => set('empresaRazaoSocial', v)}
                automatico={autoPreenchidos.has('empresaRazaoSocial')}
                largo
              />
              <CampoProntuario
                rotulo="CNPJ"
                valor={dados.empresaCnpj ?? ''}
                aoMudar={(v) => set('empresaCnpj', v)}
                automatico={autoPreenchidos.has('empresaCnpj')}
              />
              <CampoProntuario
                rotulo="Telefone"
                valor={dados.empresaTelefone ?? ''}
                aoMudar={(v) => set('empresaTelefone', v)}
                automatico={autoPreenchidos.has('empresaTelefone')}
              />
              <CampoProntuario
                rotulo="Endereço"
                valor={dados.empresaEndereco ?? ''}
                aoMudar={(v) => set('empresaEndereco', v)}
                automatico={autoPreenchidos.has('empresaEndereco')}
                largo
              />
              <CampoProntuario
                rotulo="Cidade"
                valor={dados.empresaCidade ?? ''}
                aoMudar={(v) => set('empresaCidade', v)}
                automatico={autoPreenchidos.has('empresaCidade')}
              />
              <CampoProntuario
                rotulo="Estado"
                valor={dados.empresaEstado ?? ''}
                aoMudar={(v) => set('empresaEstado', v)}
                automatico={autoPreenchidos.has('empresaEstado')}
              />
            </div>
          </div>

          {/* Ensaios / Containers de Inspeção — fonte da medição de espessura */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Ensaios / Containers Salvos</div>
            <div className="pront-form-grid cols-1">
              <div className="pront-campo">
                <label>Medição de Espessura (Ultrassom) — puxar do container de inspeção</label>
                {containers.filter(containerTemEspessura).length > 0 ? (
                  <select
                    value={dados.containerEnsaioId ?? ''}
                    onChange={(e) => selecionarEnsaio(e.target.value)}
                  >
                    <option value="">— Nenhum (não puxar espessura) —</option>
                    {containers.filter(containerTemEspessura).map((c) => (
                      <option key={c.id} value={c.id}>
                        {rotuloContainer(c)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="dashboard-vazio" style={{ margin: 0, fontSize: 13 }}>
                    Nenhum container com Medição de Espessura salvo para este equipamento. Crie a
                    inspeção em "Inspeções" e preencha o Ultrassom.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Identificação */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Identificação do Vaso de Pressão</div>
            <div className="pront-form-grid cols-1">
              <CampoProntuario
                rotulo="Descrição"
                valor={dados.descricao}
                aoMudar={(v) => set('descricao', v)}
                automatico={autoPreenchidos.has('descricao')}
              />
            </div>
            <div className="pront-form-grid">
              <CampoProntuario
                rotulo="Data de Fabricação"
                valor={dados.dataFabricacao}
                aoMudar={(v) => set('dataFabricacao', v)}
                automatico={autoPreenchidos.has('dataFabricacao')}
                placeholder="DD/MM/AAAA"
              />
              <CampoProntuario
                rotulo="Classe do Fluído"
                valor={dados.classeFluid}
                aoMudar={(v) => set('classeFluid', v)}
                automatico={autoPreenchidos.has('classeFluid')}
              />
              <CampoProntuario
                rotulo="Categoria do Vaso"
                valor={dados.categoria}
                aoMudar={(v) => set('categoria', v)}
                automatico={autoPreenchidos.has('categoria')}
              />
              <CampoProntuario
                rotulo="Grupo de Potencial de Risco"
                valor={dados.grupoPotencialRisco}
                aoMudar={(v) => set('grupoPotencialRisco', v)}
                automatico={autoPreenchidos.has('grupoPotencialRisco')}
              />
              <CampoProntuario
                rotulo="Modelo"
                valor={dados.modelo}
                aoMudar={(v) => set('modelo', v)}
                automatico={autoPreenchidos.has('modelo')}
                largo
              />
              <CampoProntuario
                rotulo="Características Funcionais"
                valor={dados.caracteristicasFuncionais}
                aoMudar={(v) => set('caracteristicasFuncionais', v)}
                automatico={autoPreenchidos.has('caracteristicasFuncionais')}
                largo
              />
            </div>
          </div>

          {/* Dados do Projeto */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Dados do Projeto</div>
            <div className="pront-form-grid cols-3">
              <CampoProntuario
                rotulo="Código do Projeto"
                valor={dados.codigoProjeto}
                aoMudar={(v) => set('codigoProjeto', v)}
                automatico={autoPreenchidos.has('codigoProjeto')}
              />
              <CampoProntuario
                rotulo="Ano de Edição"
                valor={dados.anoEdicao}
                aoMudar={(v) => set('anoEdicao', v)}
                automatico={autoPreenchidos.has('anoEdicao')}
              />
              <CampoProntuario
                rotulo="Pressão de Teste Hidrostático"
                valor={dados.pressaoTH}
                aoMudar={(v) => set('pressaoTH', v)}
                automatico={autoPreenchidos.has('pressaoTH')}
              />
              <CampoProntuario
                rotulo="Pressão Máxima de Operação"
                valor={dados.pressaoMaxOp}
                aoMudar={(v) => set('pressaoMaxOp', v)}
                automatico={autoPreenchidos.has('pressaoMaxOp')}
              />
              <CampoProntuario
                rotulo="Pressão de Projeto (PMTA)"
                valor={dados.pressaoProjeto}
                aoMudar={(v) => set('pressaoProjeto', v)}
                automatico={autoPreenchidos.has('pressaoProjeto')}
              />
              <CampoProntuario
                rotulo="Nº de Série"
                valor={dados.nroSerie}
                aoMudar={(v) => set('nroSerie', v)}
                automatico={autoPreenchidos.has('nroSerie')}
              />
              <CampoProntuario
                rotulo="PMTA"
                valor={dados.pmta}
                aoMudar={(v) => set('pmta', v)}
                automatico={autoPreenchidos.has('pmta')}
              />
              <CampoProntuario
                rotulo="Sobreespessura para Corrosão"
                valor={dados.sobreespessura}
                aoMudar={(v) => set('sobreespessura', v)}
                automatico={autoPreenchidos.has('sobreespessura')}
              />
            </div>
          </div>

          {/* Materiais */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Especificações dos Materiais</div>
            <div className="pront-form-grid">
              <CampoProntuario
                rotulo="Temperatura de Projeto"
                valor={dados.tempProjeto}
                aoMudar={(v) => set('tempProjeto', v)}
                automatico={autoPreenchidos.has('tempProjeto')}
              />
              <CampoProntuario
                rotulo="Tipo de Tampos"
                valor={dados.tipoTampos}
                aoMudar={(v) => set('tipoTampos', v)}
                automatico={autoPreenchidos.has('tipoTampos')}
              />
              <CampoProntuario
                rotulo="Fundo / Corpo"
                valor={dados.fundoCorpo}
                aoMudar={(v) => set('fundoCorpo', v)}
                automatico={autoPreenchidos.has('fundoCorpo')}
              />
              <CampoProntuario
                rotulo="Tampa"
                valor={dados.tampa}
                aoMudar={(v) => set('tampa', v)}
                automatico={autoPreenchidos.has('tampa')}
              />
              <CampoProntuario
                rotulo="Manípulos de Fechamento"
                valor={dados.manipulos}
                aoMudar={(v) => set('manipulos', v)}
                automatico={autoPreenchidos.has('manipulos')}
              />
              <CampoProntuario
                rotulo="Prisioneiros de Fechamento"
                valor={dados.prisioneiros}
                aoMudar={(v) => set('prisioneiros', v)}
                automatico={autoPreenchidos.has('prisioneiros')}
              />
              <CampoProntuario
                rotulo="Aro"
                valor={dados.aro}
                aoMudar={(v) => set('aro', v)}
                automatico={autoPreenchidos.has('aro')}
              />
              <CampoProntuario
                rotulo="Luvas, Tubos, Conexões"
                valor={dados.luvConexoes}
                aoMudar={(v) => set('luvConexoes', v)}
                automatico={autoPreenchidos.has('luvConexoes')}
              />
            </div>
          </div>

          {/* Dimensões + Croqui 2D */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Dimensões e Croqui 2D</div>

            {/* Linha única de dimensões adaptada por tipo de equipamento */}
            {(() => {
              const lbls = rotulosDimensoes(tipoEquip, subtipoEquip);
              const dim = dados.dimensoes?.[0] ?? linhaVazia();
              const campos = ['modelo', 'diametro', 'comprimento', 'altura', 'espCorpo', 'espFundo', 'espTampa', 'volume'] as const;
              return (
                <div className="pront-form-grid pront-dim-linha" style={{ padding: '4px 14px 12px' }}>
                  {campos.map((c) => (
                    <div key={c} className="pront-campo">
                      <label>{lbls[c]}</label>
                      <input value={dim[c]} onChange={(e) => setDim(0, c, e.target.value)} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Croqui 2D / Modelador */}
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Croqui
                </span>
                {temCroqui2d(tipoEquip) ? (
                  <>
                    <button type="button" className="btn-secundario" style={{ fontSize: 12 }} onClick={() => setMostrarModelador(true)}>
                      Croqui 2D do Equipamento
                    </button>
                    <span style={{ fontSize: 12, color: croquiSalvo ? 'var(--ok)' : 'var(--text-muted)', fontStyle: croquiSalvo ? 'normal' : 'italic' }}>
                      {croquiSalvo ? '✓ croqui gerado' : 'croqui pendente'}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Não se aplica — o croqui 2D existe só para vaso de pressão.
                  </span>
                )}
              </div>

              {/* Prontuário do fabricante (PDF) — enviado na ficha do equipamento */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Prontuário do fabricante
                </span>
                {prontFabricante ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>
                      ✓ {prontFabricante.nome} ({formatarTamanhoPdf(prontFabricante.tamanho)})
                    </span>
                    <button
                      type="button"
                      className="btn-secundario"
                      style={{ fontSize: 12 }}
                      onClick={() => void abrirProntuarioFabricante(prontFabricante)}
                    >
                      Visualizar
                    </button>
                    {isTrial() ? (
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: 12 }}
                        title={MSG_BLOQUEIO_DOCS}
                        onClick={() => emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_DOCS })}
                      >
                        Baixar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: 12 }}
                        onClick={() =>
                          void baixarPdfFabricante(
                            prontFabricante,
                            prontFabricante.nome || `prontuario-fabricante-${tag}.pdf`,
                          )
                        }
                      >
                        Baixar
                      </button>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    nenhum PDF enviado — envie na ficha do equipamento
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Revisão */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Revisão</div>
            <div className="pront-form-grid">
              <CampoProntuario
                rotulo="Revisão"
                valor={dados.revisao}
                aoMudar={(v) => set('revisao', v)}
                automatico={autoPreenchidos.has('revisao')}
              />
              <CampoProntuario
                rotulo="Data de Revisão"
                valor={dados.dataRevisao}
                aoMudar={(v) => set('dataRevisao', v)}
                automatico={autoPreenchidos.has('dataRevisao')}
                placeholder="DD/MM/AAAA"
              />
            </div>
          </div>

          {/* O rodapé repete o SALVAR — e só ele. Quem terminou de preencher
              está no fim da página, e mandá-lo rolar de volta ao topo para
              salvar seria trocar uma rolagem por outra. As demais ações moram
              na barra, uma vez só. */}
          <div className="pront-acoes-criar">
            <button
              type="button"
              className={`fj-btn fj-btn-primary${salvando ? ' is-loading' : ''}`}
              onClick={salvar}
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          </div>
        </div>
        </>
      )}

      {tela === 'visualizador' && (
        <>
          {/* BARRA ÚNICA E COMPACTA.
              Eram três faixas empilhadas — trilha, cabeçalho com título, e uma
              linha com até seis botões do mesmo tamanho —, mais os dois selects
              de assinatura, tudo acima do documento. Agora: uma linha só, com o
              voltar, a identificação, as ações principais e um "Mais ações" que
              guarda o que é raro. O documento ganhou o espaço de volta. */}
          <div className="bloco-dados pront-topo">
          <div className="pront-barra">
            <button
              type="button"
              className="fj-btn fj-btn-ghost pront-barra-voltar"
              onClick={() => setTela(visualizandoSemSalvar ? 'formulario' : 'equipamentos')}
            >
              ← <span className="pront-btn-rotulo">{visualizandoSemSalvar ? 'Edição' : 'Voltar'}</span>
            </button>
            <div className="pront-barra-id">
              <strong>{tag}</strong>
              {/* A FAIXA DE METADADOS SUBIU PARA CÁ (07/09/2026). "Documento
                  emitido em … · 3 páginas · código de verificação …" era um
                  parágrafo de largura inteira entre a barra e a prévia, e
                  empurrava o documento para baixo em toda abertura. */}
              <span title={emissao ? `Código de verificação: ${emissao.sha256}` : undefined}>
                {visualizandoSemSalvar
                  ? 'pré-visualização · não salvo'
                  : emissao
                    ? [
                        `emitido · rev. ${String(revisaoAtual).padStart(2, '0')}`,
                        emissao.emissao,
                        `${emissao.paginas} páginas`,
                        emissao.pdfPendente ? 'no aparelho' : 'arquivado',
                        `verificação ${emissao.sha256.slice(0, 8)}…`,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'rascunho'}
              </span>
            </div>
            <div className="pront-visualizador-acoes">
                {visualizandoSemSalvar ? (
                  <button type="button" className={`btn-primario ${salvando ? 'is-loading' : ''}`} onClick={salvar} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar Definitivamente'}
                  </button>
                ) : (
                  <>
                    {/* SEM emissão, editar é a ação óbvia e fica na linha.
                        COM emissão, o que está na tela é um ARQUIVO que não se
                        edita: a ação principal passa a ser emitir a próxima
                        revisão, e "Editar dados" desce para o menu — ele prepara
                        a revisão seguinte, não altera a que está aberta. */}
                    {!emissao && (
                      <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setTela('formulario')}>
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      className={`fj-btn fj-btn-primary${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                      onClick={emitirProntuario}
                      disabled={emitindo}
                      title="Gera o PDF definitivo, calcula o código de verificação e arquiva"
                    >
                      {documentosBloqueados() && <Icone nome="cadeado" tam={13} />}{' '}
                      {emitindo ? 'Emitindo…' : emissao ? 'Emitir revisão' : 'Emitir'}
                    </button>
                    {/* MAIS AÇÕES · o que é raro sai da linha principal.
                        Imprimir e abrir o emitido continuam a um clique de
                        distância; a exclusão vive SÓ aqui, porque prontuário não
                        é descartável — ela existe para o rascunho que nasceu
                        errado, não como ação de rotina. */}
                    <MaisAcoesProntuario
                      temEmissao={!!emissao}
                      imprimindo={imprimindo}
                      rotuloImprimir={rotuloImpressao(fonteDeImpressao(emissao))}
                      bloqueado={documentosBloqueados()}
                      aoImprimir={prepararEImprimir}
                      aoAbrirEmitido={abrirEmitido}
                      aoEditar={emissao ? () => setTela('formulario') : undefined}
                      aoExcluir={() => setExcluindoTag(tag)}
                    />
                  </>
                )}
            </div>
          </div>

            {/* ASSINANTES · recolhidos por padrão.
                Eram dois selects largos numa faixa própria acima do documento,
                sempre visíveis — e são escolhidos uma vez, não a cada abertura.
                O resumo diz quem assina; o detalhe abre a um clique. Continuam
                gravados em nr13_assinantes_pront_<TAG> antes do remount dos
                iframes (as folhas leem a chave no motor de assinatura). */}
            <details className="pront-assinantes-caixa">
              <summary>
                <Icone nome="pencil" tam={13} /> Assinaturas
                <span className="pront-assinantes-resumo">
                  {[
                    engenheiros.find((f) => f.id === assinantes.engenheiroId)?.nome,
                    tecnicos.find((f) => f.id === assinantes.tecnicoId)?.nome,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'nenhuma definida'}
                </span>
              </summary>
              <div className="pront-assinantes">
              <div className="pront-assinante-campo">
                <label htmlFor="pront-sel-engenheiro">Engenheiro (assina)</label>
                <select
                  id="pront-sel-engenheiro"
                  value={valorAssinante(assinantes.engenheiroId, engenheiros)}
                  onChange={(e) => trocarAssinante('engenheiroId', e.target.value)}
                >
                  <option value="">— sem assinatura —</option>
                  {engenheiros.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}{f.crea ? ` — ${f.crea}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pront-assinante-campo">
                <label htmlFor="pront-sel-tecnico">Técnico (assina)</label>
                <select
                  id="pront-sel-tecnico"
                  value={valorAssinante(assinantes.tecnicoId, tecnicos)}
                  onChange={(e) => trocarAssinante('tecnicoId', e.target.value)}
                >
                  <option value="">— sem assinatura —</option>
                  {tecnicos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}{f.crea ? ` — ${f.crea}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              </div>
            </details>
          </div>

          {palco.estado !== 'pronto' && (
            <RecusaPalco estado={palco.estado} falha={palco.falha} />
          )}

          {/* O parágrafo "Documento emitido em … · 3 páginas · código de
              verificação …" SAIU: ele tinha largura inteira, ficava entre a
              barra e a prévia e empurrava o documento para baixo em toda
              abertura. O mesmo texto virou a segunda linha da barra. O ERRO de
              emissão continua abaixo: é excepcional, precisa ser lido, e não
              cabe numa linha discreta. */}
          {erroEmissao && <p className="pront-emissao-erro">{erroEmissao}</p>}

          {/* Fase 12 · bancada do piloto do prontuário. Atrás de `?piloto=1`:
              produção continua imprimindo pelo caminho de hoje. */}
          {new URLSearchParams(window.location.search).get('piloto') === '1' && (
            <PainelPilotoProntuario tag={tag} />
          )}

          {previaPront === 'vetorial' ? (
            <PreviaProntuarioVetorial
              tag={tag}
              versao={versao}
              nomeArquivo={`Prontuario_${tag}.pdf`}
            />
          ) : (
          <div className="prontuario-preview">
            {palco.estado === 'pronto' &&
              folhasDoProntuario.map((doc, i) => (
              <PaginaA4 key={`${doc}-${i}-${versao}`}>
                <iframe
                  src={`/arquivos-prontuario/${doc}?tag=${encodeURIComponent(tag)}&page=${i + 1}&total=${folhasDoProntuario.length}${palco.paramsIframe}`}
                  scrolling="no"
                  title={doc}
                  onLoad={(e) => {
                    const ifrDoc = (e.target as HTMLIFrameElement).contentDocument;
                    if (ifrDoc) ifrDoc.designMode = 'on';
                  }}
                />
              </PaginaA4>
            ))}
          </div>
          )}
        </>
      )}

      {mostrarModelador && (
        <ModeladorVaso
          tag={tag}
          onFechar={() => setMostrarModelador(false)}
          // Bump de versão: atualiza o indicador "croqui gerado" e remonta os iframes na volta.
          onSalvo={() => setVersao((v) => v + 1)}
        />
      )}
    </div>
  );
}
