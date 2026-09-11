import { useEffect, useRef, useState } from 'react';
import { Icone } from '../components/Icone';
import ModalComponente from '../features/calibracoes/ModalComponente';
import AjudaCalibracoes from '../features/calibracoes/AjudaCalibracoes';
import '../features/calibracoes/ilustracoes.css';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { mascararData } from '../services/mascaras';
import { rotuloTipoEquipamento } from '../features/relatorios/pdfVetorial/rotulos';
import {
  arquivoCalibracao,
  calcularErro,
  excluirCalibracao,
  listarCalibracoes,
  salvarCalibracao,
} from '../features/calibracoes/calibracaoService';
import type { DadosCalibracao, DadosManometro, DadosPSV } from '../features/calibracoes/tipos';
import ModalResultados from '../features/calibracoes/ModalResultados';
import ModalNovoLote from '../features/calibracoes/ModalNovoLote';
import ModalDetalhesLote from '../features/calibracoes/ModalDetalhesLote';
import {
  FILTRO_LOTES_VAZIO,
  dataDoLote,
  filtrarLotes,
  ordenarLotes,
  podeExcluirLote,
  progressoLote,
  type FiltroLotes,
  type SituacaoLote,
} from '../features/calibracoes/lote';
import {
  ROTULO_ACESSORIO,
  clienteDoEquipamento,
  comecaEditando,
  motivoPadrao,
  padraoSugerido,
  pontosDoComponente,
  proximaCalibracao,
  resumoAcessorio,
  unidadeDoComponente,
  type CampoAcessorio,
} from '../features/calibracoes/preencherCalibracao';
import {
  maiorErro,
  paraLinhas,
  paraPontos,
  resumoPontos,
  type PontoCal,
} from '../features/calibracoes/resultadosCalibracao';
import VisualizadorCalibracao from '../features/calibracoes/VisualizadorCalibracao';
// 9F.3 · a lista pela projeção e o contrato de semeadura da TAG.
import CatalogoCalibracoesV9 from '../features/calibracoes/CatalogoCalibracoesV9';
import {
  abrirEquipamentoParaCalibracoes,
} from '../features/calibracoes/catalogoCalibracoes';
import {
  criarLote,
  excluirLote,
  fotoDoComponente,
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
import FotoImg from '../components/FotoImg';
import RecusaPalco from '../components/RecusaPalco';
import { usePalcoDocumento } from '../features/documentos/usePalcoDocumento';

type Tela = 'equipamentos' | 'historico' | 'formulario' | 'visualizador' | 'verDados';

interface FormDados {
  tipo: 'manometro' | 'psv';
  nome: string;
  numeroCertificado: string;
  dataEmissao: string;
  empresa: string;
  endereco: string;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  referencia: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  tempAr: string;
  umidade: string;
  local: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  textoMotivo: string;
  /** Unidade das medições — vem do cadastro do componente. */
  unidade: string;
  /**
   * Quem forneceu o padrão do bloco 5, para a tela poder DIZER isso.
   *
   * Preencher quatro campos sozinho e não avisar é pior do que não preencher:
   * o usuário não sabe se aquilo veio do cadastro ou de uma calibração antiga,
   * e passa a conferir tudo à mão de qualquer jeito.
   */
  padraoOrigem: string | null;
  crescente: Array<{ vc: string; vi: string }>;
  incertezaC: string;
  coefC: string;
  decrescente: Array<{ vc: string; vi: string }>;
  incertezaD: string;
  coefD: string;
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
}

/**
 * O formulário nasce com o que o sistema já sabe.
 *
 * O que estava aqui lia `localStorage.getItem('nr13_minha_empresa')` DIRETO.
 * Numa organização v2 o `localStorage` é só o palco (§2-ter): a chave não está
 * lá, a leitura devolvia `{}` e o bloco "DADOS DO CLIENTE / SOLICITANTE" do
 * certificado saía `----` em toda calibração — sem erro nenhum na tela.
 * Ver `preencherCalibracao.ts`.
 */
function formPadrao(tipo: 'manometro' | 'psv' = 'manometro', tag = ''): FormDados {
  const { empresa, endereco } = tag ? clienteDoEquipamento(tag) : { empresa: '', endereco: '' };
  const padrao = tag ? padraoSugerido(tipo, tag) : null;
  const hoje = new Date().toLocaleDateString('pt-BR');
  return {
    tipo,
    nome: '',
    numeroCertificado: `CERT-${Date.now()}`,
    dataEmissao: hoje,
    empresa,
    endereco,
    instrumento: '',
    fabricante: '',
    modelo: '',
    serie: '',
    referencia: '',
    dataCalibracao: hoje,
    // Sem valor aqui, o template mantém o próprio texto de exemplo e o
    // certificado emitido imprime literalmente "DD/MM/AAAA" como se fosse data.
    dataProxCalibracao: proximaCalibracao(hoje),
    tempAr: '',
    umidade: '',
    local: '',
    padraoInst: padrao?.padraoInst ?? '',
    padraoSerie: padrao?.padraoSerie ?? '',
    padraoCert: padrao?.padraoCert ?? '',
    padraoVal: padrao?.padraoVal ?? '',
    statusConclusao: '',
    textoMotivo: '',
    unidade: 'kgf/cm²',
    padraoOrigem: padrao?.origem ?? null,
    crescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaC: '',
    coefC: '',
    decrescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaD: '',
    coefD: '',
    pressaoAbertura: '',
    pressaoAjuste: '',
    fechamento: '',
    incerteza: '',
    coef: '',
  };
}

function converterForm(form: FormDados, tag: string, id: string): DadosCalibracao {
  const base = {
    id,
    tag,
    nome: form.nome || (form.tipo === 'manometro' ? 'Manômetro' : 'Válvula de Segurança'),
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    numeroCertificado: form.numeroCertificado,
    dataEmissao: form.dataEmissao,
    empresa: form.empresa,
    endereco: form.endereco,
    instrumento: form.instrumento || form.nome,
    fabricante: form.fabricante,
    modelo: form.modelo,
    serie: form.serie,
    referencia: form.referencia,
    dataCalibracao: form.dataCalibracao,
    dataProxCalibracao: form.dataProxCalibracao,
    tempAr: form.tempAr,
    umidade: form.umidade,
    local: form.local,
    padraoInst: form.padraoInst,
    padraoSerie: form.padraoSerie,
    padraoCert: form.padraoCert,
    padraoVal: form.padraoVal,
    statusConclusao: form.statusConclusao,
    // Status escolhido e motivo em branco fechava a frase da conclusão em "o
    // mesmo", sem ponto final — o template costura status e motivo numa frase
    // só. O texto padrão é o MESMO do seletor da folha.
    textoMotivo: form.textoMotivo.trim() || motivoPadrao(form.statusConclusao),
    unidade: form.unidade,
  };

  if (form.tipo === 'manometro') {
    return {
      ...base,
      tipo: 'manometro',
      crescente: form.crescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaC: form.incertezaC,
      coefC: form.coefC,
      decrescente: form.decrescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaD: form.incertezaD,
      coefD: form.coefD,
    } as DadosManometro;
  }
  return {
    ...base,
    tipo: 'psv',
    pressaoAbertura: form.pressaoAbertura,
    pressaoAjuste: form.pressaoAjuste,
    fechamento: form.fechamento,
    incerteza: form.incerteza,
    coef: form.coef,
  } as DadosPSV;
}

function parseDateBR(d: string): number {
  const p = d.split('/');
  if (p.length !== 3) return 0;
  return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
}


export default function Calibracoes() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  const [tag, setTag] = useState('');
  const [cals, setCals] = useState<DadosCalibracao[]>([]);
  const [calAtual, setCalAtual] = useState<DadosCalibracao | null>(null);
  const [form, setForm] = useState<FormDados>(formPadrao());
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  // Palco: a folha CERTIFICADO-CAL-* lê `nr13_calibracao_item_<id>` e
  // `nr13_minha_empresa` do localStorage no DOMContentLoaded. Esta tela montava o
  // iframe sem preparar nada — na v2 o dado mora no Map/IndexedDB, então "Ver
  // como fica o documento" abria o certificado EM BRANCO. Só monta na tela do
  // visualizador: nas outras não há iframe e segurar a trava do palco à toa
  // impediria o relatório de abrir em seguida.
  const palco = usePalcoDocumento(tag, `cal-${calAtual?.id ?? 'nenhuma'}-${versao}`, {
    pular: tela !== 'visualizador',
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
  const [resultadosAbertos, setResultadosAbertos] = useState(false);
  /**
   * A seção do acessório abre FECHADA (resumo) quando o cadastro do componente
   * já respondeu por ela. Ver `comecaEditando`.
   */
  const [editandoAcessorio, setEditandoAcessorio] = useState(false);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  /** Criação (`lote: null`) ou edição de um lote; `null` = modal fechado. */
  const [loteEditando, setLoteEditando] = useState<{ novo: boolean; lote: LoteCal | null } | null>(null);
  const [filtroLotes, setFiltroLotes] = useState<FiltroLotes>(FILTRO_LOTES_VAZIO);
  /**
   * De onde a calibração veio: o lote e o acessório.
   *
   * A tela dizia só "Nova Calibração — Manômetro". Quem chega nela depois de
   * navegar pelo lote precisa ver EM QUE lote está gravando — e ter como
   * voltar para ele, não para a lista.
   */
  const [contextoForm, setContextoForm] = useState<{
    loteId: string;
    loteNome: string;
    loteData: string;
    componente: string;
  } | null>(null);
  /**
   * UX · nomear o lote SEM `window.prompt`.
   *
   * Criar e renomear um lote passavam por um diálogo do navegador: fora do
   * design do sistema, sem foco controlado, e no celular ele é uma folha do
   * SO que cobre a tela e não mostra o que está sendo nomeado. Agora o campo
   * nasce na própria lista, já preenchido com o nome sugerido e com o texto
   * selecionado — Enter confirma, Esc cancela.
   *
   * `null` = nenhum campo aberto; `{ id: null }` = criando; `{ id }` =
   * renomeando aquele lote.
   */
  const vinculoCalibracao = useRef<{ componenteId: string; loteId: string } | null>(null);





  // Pré-rasteriza o certificado em #print-root (1 imagem A4) quando o preview abre — igual ao
  // relatório/prontuário. Sem isto, o Ctrl+P/botão Imprimir cairia no print nativo do iframe
  // (sai em tiras / só 1 página). Limpa ao sair do visualizador.
  useEffect(() => {
    if (tela !== 'visualizador') return;
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
  }, [tela, calAtual, versao]);


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
    setTag(tagEscolhida);
    setEqAtual(aberto.resumo);
    setCals(
      [...aberto.calibracoes].sort(
        (a, b) =>
          parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm),
      ),
    );
    setComponentes(aberto.componentes);
    setLotes(aberto.lotes);
    setConfirmandoId(null);
    setTela('historico');
  }

  // Calibração SEMPRE parte de um componente cadastrado dentro de um lote:
  // pré-preenche o formulário com os dados do instrumento e vincula os ids.
  function novaForm(
    tipo: 'manometro' | 'psv',
    comp?: ComponenteCal,
    loteId?: string,
    /**
     * A data de EXECUÇÃO do lote semeia a do certificado.
     *
     * Calibração de acessório é lançada dias depois de feita, e o formulário
     * nascia com "hoje" — a data do registro, não a do ensaio. O lote passou a
     * ter a data certa (§7), e é dela que cada certificado parte; continua
     * editável item a item, porque nem sempre os acessórios são calibrados no
     * mesmo dia.
     */
    dataLote?: string,
  ) {
    const base = formPadrao(tipo, tag);
    if (dataLote && dataLote.trim() !== '') {
      base.dataCalibracao = dataLote;
      base.dataProxCalibracao = proximaCalibracao(dataLote);
    }
    if (comp) {
      base.nome = comp.nome;
      base.instrumento = comp.nome;
      base.fabricante = comp.fabricante ?? '';
      base.modelo = comp.modelo ?? '';
      base.serie = comp.serie ?? '';
      base.referencia = comp.referencia ?? '';
      base.unidade = unidadeDoComponente(comp);
      // Os pontos de calibração são do INSTRUMENTO. Vindos do cadastro, a
      // coluna "valor do padrão" das duas tabelas já nasce preenchida — era
      // ela que se redigitava dez vezes por certificado.
      const pontos = pontosDoComponente(comp);
      base.crescente = pontos.map((vc) => ({ vc, vi: '' }));
      base.decrescente = pontos.map((vc) => ({ vc, vi: '' }));
      if (comp.tipo === 'psv') base.pressaoAjuste = comp.pressaoAjuste ?? '';
    }
    vinculoCalibracao.current = comp && loteId ? { componenteId: comp.id, loteId } : null;
    setContextoForm(
      comp && loteId
        ? {
            loteId,
            loteNome: lotes.find((l) => l.id === loteId)?.descricao ?? '',
            loteData: dataLote ?? '',
            componente: comp.nome,
          }
        : null,
    );
    setEditandoAcessorio(comecaEditando(base));
    setForm(base);
    setTela('formulario');
  }

  function abrirVisualizador(cal: DadosCalibracao) {
    setCalAtual(cal);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  function abrirVerDados(cal: DadosCalibracao) {
    setCalAtual(cal);
    setTela('verDados');
  }

  function excluir(id: string) {
    excluirCalibracao(tag, id);
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    setConfirmandoId(null);
    if (tela === 'visualizador') setTela('historico');
  }

  function set<K extends keyof FormDados>(campo: K, valor: FormDados[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /**
   * As duas tabelas da folha, vistas como uma lista de PONTOS.
   *
   * O formulário guarda `crescente[]` e `decrescente[]` porque é assim que o
   * certificado imprime e é assim que `DadosManometro` grava. Quem preenche,
   * porém, trabalha por ponto: um valor no padrão, duas leituras. A conversão
   * fica aqui, e o formato gravado não muda — ver `resultadosCalibracao.ts`.
   */
  const pontos: PontoCal[] = paraPontos(form.crescente, form.decrescente);
  const resumoResultados = resumoPontos(pontos);
  const piorErro = maiorErro(pontos);
  const temResultados =
    form.tipo === 'manometro'
      ? resumoResultados.feitos > 0
      : [form.pressaoAbertura, form.pressaoAjuste, form.fechamento].some((v) => v.trim() !== '');

  function aplicarResultados(v: {
    manometro: { pontos: PontoCal[]; incertezaC: string; coefC: string; incertezaD: string; coefD: string };
    psv: { pressaoAbertura: string; pressaoAjuste: string; fechamento: string; incerteza: string; coef: string };
  }) {
    const linhas = paraLinhas(v.manometro.pontos);
    setForm((f) => ({
      ...f,
      crescente: linhas.crescente.map((l) => ({ vc: l.vc, vi: l.vi })),
      decrescente: linhas.decrescente.map((l) => ({ vc: l.vc, vi: l.vi })),
      incertezaC: v.manometro.incertezaC,
      coefC: v.manometro.coefC,
      incertezaD: v.manometro.incertezaD,
      coefD: v.manometro.coefD,
      pressaoAbertura: v.psv.pressaoAbertura,
      pressaoAjuste: v.psv.pressaoAjuste,
      fechamento: v.psv.fechamento,
      incerteza: v.psv.incerteza,
      coef: v.psv.coef,
    }));
    setResultadosAbertos(false);
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
    const nome = `${cal.numeroCertificado || 'certificado'}-${cal.nome || cal.tipo}`.replace(
      /[^\w.-]+/g,
      '-',
    );
    await exportarPdf('.mlote-visor-folha, .cal-preview', nome);
  }

  function mostrarToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  }

  function salvar(voltarParaLista = false) {
    const id = `cal-${Date.now()}`;
    const dados: DadosCalibracao = { ...converterForm(form, tag, id), ...(vinculoCalibracao.current ?? {}) };
    salvarCalibracao(tag, dados);
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    if (voltarParaLista) {
      // confirma o salvamento, fecha o formulário e volta à lista — usuário adiciona outro manualmente
      const nome = dados.nome || (dados.tipo === 'manometro' ? 'Manômetro' : 'PSV');
      mostrarToast(`✓ "${nome}" salvo com sucesso`);
      setTela('historico');
    } else {
      setCalAtual(dados);
      setVersao((v) => v + 1);
      setTela('visualizador');
    }
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
            acoes={
              /* [i] Informações na barra da SESSÃO: a explicação do fluxo com a
                 ilustração, sem ocupar área fixa acima da lista. */
              <button
                type="button"
                className="fj-btn fj-btn-ghost cal-btn-info"
                aria-haspopup="dialog"
                onClick={() => setAjudaAberta(true)}
              >
                <Icone nome="alerttri" tam={13} />{" "}
                <span className="pront-btn-rotulo">Informações</span>
              </button>
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
          <div className="bloco-dados">
            <div className="cal-faixa">
              <button
                type="button"
                className="btn-secundario cal-btn-voltar"
                onClick={() => setTela('equipamentos')}
              >
                ← Voltar
              </button>
              <div className="cal-faixa-foto">
                {eqAtual?.fotoCapa ? (
                  <FotoImg foto={eqAtual.fotoCapa} alt={`Foto de ${tag}`} variante="thumb" />
                ) : (
                  <Icone nome="cylinder" tam={26} />
                )}
              </div>
              <div className="cal-faixa-id">
                <h3>Calibrações — {tag}</h3>
                <span>
                  {rotuloTipoEquipamento(eqAtual?.info.tipo) ?? 'Equipamento'}
                  <button type="button" className="cal-ajuda-link" onClick={() => setAjudaAberta(true)}>
                    <Icone nome="alerttri" tam={11} /> Como funciona
                  </button>
                </span>
              </div>

              {/* Os acessórios em LINHA, não numa coluna à direita. São três a
                  seis por equipamento, e a faixa rola na horizontal em vez de
                  empurrar os lotes para baixo. */}
              <div className="cal-acessorios" role="list" aria-label="Acessórios do equipamento">
                {componentes.map((c) => (
                  <div key={c.id} className="cal-acess" role="listitem">
                    <span className="cal-acess-foto" aria-hidden>
                      {fotoDoComponente(c) ? (
                        <FotoImg foto={fotoDoComponente(c)} alt="" placeholder="" variante="thumb" />
                      ) : (
                        <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={16} />
                      )}
                    </span>
                    <span className="cal-acess-txt">
                      <strong>{c.nome}</strong>
                      <em>
                        {c.tipo === 'psv' ? 'Válvula PSV' : 'Manômetro'}
                        {c.serie ? ` · S/N ${c.serie}` : ''}
                      </em>
                    </span>
                    <button
                      type="button"
                      className="btn-icone cor-cinza cal-acess-editar"
                      title="Editar acessório"
                      aria-label={`Editar ${c.nome}`}
                      onClick={() => setCompForm({ ...c })}
                    >
                      <Icone nome="pencil" tam={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="cal-acess-add"
                  onClick={() =>
                    setCompForm({
                      id: `comp-${Date.now()}`,
                      tipo: 'manometro',
                      nome: '',
                      criadoEm: new Date().toLocaleDateString('pt-BR'),
                    })
                  }
                >
                  <Icone nome="plus" tam={14} /> Adicionar
                </button>
              </div>
            </div>

            {compForm && (
              <ModalComponente
                valor={compForm}
                aoFechar={() => setCompForm(null)}
                aoSalvar={async (c) => {
                  await salvarComponente(tag, c);
                  setComponentes(listarComponentes(tag));
                  setCompForm(null);
                }}
              />
            )}

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
              aoCalibrar={(c) => {
                setLoteAberto(null);
                novaForm(c.tipo, c, loteAbertoObj.id, dataDoLote(loteAbertoObj));
              }}
              aoVerDados={(cal) => {
                setLoteAberto(null);
                abrirVerDados(cal);
              }}
              aoBaixarPdf={baixarPdfCalibracao}
            />
          )}
        </>
      )}

      {/* ── FORMULÁRIO ───────────────────────────────── */}
      {tela === 'formulario' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                // Voltar ao LOTE de onde se veio, não à lista: é de lá que o
                // usuário saiu, e é lá que ele vê o que ainda falta calibrar.
                const volta = contextoForm?.loteId ?? null;
                setTela('historico');
                setLoteAberto(volta);
              }}
            >
              ← {contextoForm ? 'Voltar ao lote' : 'Voltar'}
            </button>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header" style={{ marginBottom: 12 }}>
            <h3>Nova Calibração — {form.tipo === 'manometro' ? 'Manômetro' : 'Válvula de Segurança (PSV)'}</h3>
          </div>
          {contextoForm && (
            <div className="cal-ctx" role="note">
              <span>
                <em>Lote</em>
                <strong>{contextoForm.loteNome || '—'}</strong>
              </span>
              <span>
                <em>Data</em>
                <strong>{contextoForm.loteData || form.dataCalibracao}</strong>
              </span>
              <span>
                <em>Acessório</em>
                <strong>{contextoForm.componente}</strong>
              </span>
            </div>
          )}

          {/* Identificação */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Identificação do Item</div>
            <div className="cal-form-grid cols-3">
              <div className="cal-campo cal-campo-full">
                <label>Nome / Identificação do Instrumento *</label>
                <input
                  value={form.nome}
                  onChange={(e) => set('nome', e.target.value)}
                  placeholder={form.tipo === 'manometro' ? 'Ex: Manômetro Principal, Manômetro 1...' : 'Ex: Válvula de Segurança 1, PSV-001...'}
                />
              </div>
              <div className="cal-campo">
                <label>Nº do Certificado</label>
                <input value={form.numeroCertificado} onChange={(e) => set('numeroCertificado', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Data de Emissão</label>
                <input value={form.dataEmissao} onChange={(e) => set('dataEmissao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* ── O ACESSÓRIO ───────────────────────────────────────────────
              Fabricante, modelo, série e faixa são característica do
              instrumento: não mudam de uma calibração para a outra, e já vêm
              do cadastro do componente. Continuavam desenhados como cinco
              caixas abertas — e campo editável parece trabalho a fazer mesmo
              quando está preenchido. Viram resumo; a edição fica atrás de um
              botão, para a correção pontual daquele certificado. */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">
              Dados do Item Calibrado
              <span className="cal-secao-fonte">cadastro do acessório</span>
            </div>

            {!editandoAcessorio ? (
              <div className="cal-acessorio">
                <dl className="cal-acessorio-lista">
                  {resumoAcessorio(form).itens.map((i) => (
                    <div key={i.campo}>
                      <dt>{i.rotulo}</dt>
                      <dd className={i.valor === '' ? 'vazio' : undefined}>{i.valor || '—'}</dd>
                    </div>
                  ))}
                </dl>
                <div className="cal-acessorio-pe">
                  <span>
                    <Icone nome="checkcircle" tam={13} /> Do cadastro do componente — para mudar
                    sempre, edite o componente em <strong>Componentes do Equipamento</strong>.
                  </span>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setEditandoAcessorio(true)}
                  >
                    <Icone nome="pencil" tam={13} /> Ajustar só neste certificado
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cal-form-grid cols-3">
                  {(Object.keys(ROTULO_ACESSORIO) as CampoAcessorio[]).map((campo) => (
                    <div className="cal-campo" key={campo}>
                      <label>{ROTULO_ACESSORIO[campo]}</label>
                      <input
                        value={form[campo]}
                        onChange={(e) => set(campo, e.target.value)}
                        placeholder={campo === 'instrumento' ? form.nome : undefined}
                      />
                    </div>
                  ))}
                </div>
                <p className="cal-auto-aviso cal-auto-aviso-falta">
                  <Icone nome="alerttri" tam={13} />
                  <span>
                    O que for digitado aqui vale <strong>só para este certificado</strong>. Para
                    valer em todas as calibrações, edite o componente.
                  </span>
                </p>
              </>
            )}

            {/* As datas são da RODADA, não do acessório — ficam sempre abertas. */}
            <div className="cal-form-grid cols-3">
              <div className="cal-campo">
                <label>Data da Calibração</label>
                <input value={form.dataCalibracao} onChange={(e) => set('dataCalibracao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
              <div className="cal-campo">
                <label>Data da Próxima Calibração</label>
                <input value={form.dataProxCalibracao} onChange={(e) => set('dataProxCalibracao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* Condições Ambientais */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">
              Condições Ambientais
              <span className="cal-secao-fonte execucao">desta calibração</span>
            </div>
            <div className="cal-form-grid cols-3">
              <div className="cal-campo">
                <label>Temperatura do Ar</label>
                <input value={form.tempAr} onChange={(e) => set('tempAr', e.target.value)} placeholder="Ex: 23°C" />
              </div>
              <div className="cal-campo">
                <label>Umidade Relativa</label>
                <input value={form.umidade} onChange={(e) => set('umidade', e.target.value)} placeholder="Ex: 60%" />
              </div>
              <div className="cal-campo">
                <label>Local</label>
                <input value={form.local} onChange={(e) => set('local', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Padrões — preenchidos do cadastro de Certificados (ver
              `padraoSugerido`). Continuam editáveis: o cadastro é a fonte
              usual, não uma trava. */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Padrões Utilizados e Rastreabilidade</div>
            {form.padraoOrigem ? (
              <p className="cal-auto-aviso">
                <Icone nome="checkcircle" tam={13} />
                <span>
                  Preenchido a partir do certificado <strong>{form.padraoOrigem}</strong>, cadastrado
                  em Certificados. Pode ser editado aqui sem alterar o cadastro.
                </span>
              </p>
            ) : (
              <p className="cal-auto-aviso cal-auto-aviso-falta">
                <Icone nome="alerttri" tam={13} />
                <span>
                  Nenhum padrão de {form.tipo === 'manometro' ? 'manômetro' : 'válvula'} cadastrado em{' '}
                  <strong>Certificados</strong> — estes campos saem em branco no documento se não
                  forem preenchidos.
                </span>
              </p>
            )}
            <div className="cal-form-grid cols-4">
              <div className="cal-campo">
                <label>Instrumento Padrão</label>
                <input value={form.padraoInst} onChange={(e) => set('padraoInst', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Nº Série</label>
                <input value={form.padraoSerie} onChange={(e) => set('padraoSerie', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Nº Certificado</label>
                <input value={form.padraoCert} onChange={(e) => set('padraoCert', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Validade</label>
                <input value={form.padraoVal} onChange={(e) => set('padraoVal', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* ── RESULTADOS OBTIDOS ────────────────────────────────────────
              Vinte células nuas no meio do formulário viraram um RESUMO com um
              botão. O preenchimento mora no modal, onde cabe uma linha por
              ponto, o erro ao vivo e o progresso — ver `ModalResultados`. */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">
              Resultados Obtidos ({form.tipo === 'manometro' ? 'Manômetro' : 'PSV'})
              <span className="cal-secao-fonte execucao">desta calibração</span>
            </div>
            <div className="cal-resultados-cartao">
              <div className="cal-resultados-resumo">
                {form.tipo === 'manometro' ? (
                  <>
                    <span className="cal-res-num">
                      <strong>{resumoResultados.feitos}</strong> de {resumoResultados.total || 0}
                    </span>
                    <span className="cal-res-rot">pontos medidos</span>
                    {piorErro !== null && (
                      <span className="cal-res-erro">
                        maior erro <strong>{piorErro}</strong> {form.unidade}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="cal-res-num">
                      <strong>{[form.pressaoAbertura, form.pressaoAjuste, form.fechamento].filter((v) => v.trim() !== '').length}</strong> de 3
                    </span>
                    <span className="cal-res-rot">pressões registradas</span>
                  </>
                )}
              </div>
              <button
                type="button"
                className="btn-primario cal-res-botao"
                onClick={() => setResultadosAbertos(true)}
              >
                <Icone nome="sliders" tam={14} />
                {temResultados ? 'Revisar resultados' : 'Preencher resultados'}
              </button>
            </div>
            {!temResultados && (
              <p className="cal-auto-aviso cal-auto-aviso-falta">
                <Icone nome="alerttri" tam={13} />
                <span>Sem medições, as tabelas do certificado saem com travessões.</span>
              </p>
            )}
          </div>

          {/* Conclusão */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Conclusão Técnica</div>
            <div className="cal-form-grid">
              <div className="cal-campo">
                <label>Status</label>
                <select value={form.statusConclusao} onChange={(e) => set('statusConclusao', e.target.value as FormDados['statusConclusao'])}>
                  <option value="">Selecione...</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                </select>
              </div>
              <div className="cal-campo">
                <label>Motivo / Complemento</label>
                <input value={form.textoMotivo} onChange={(e) => set('textoMotivo', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="cal-acoes-form">
            <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
              Cancelar
            </button>
            <button type="button" className="btn-secundario" onClick={() => salvar(true)}>
              Salvar e Voltar à Lista
            </button>
            <button type="button" className="btn-primario" onClick={() => salvar(false)}>
              Salvar e Visualizar
            </button>
          </div>

          {resultadosAbertos && (
            <ModalResultados
              tipo={form.tipo}
              unidade={form.unidade}
              nome={form.nome}
              manometro={{
                pontos,
                incertezaC: form.incertezaC,
                coefC: form.coefC,
                incertezaD: form.incertezaD,
                coefD: form.coefD,
              }}
              psv={{
                pressaoAbertura: form.pressaoAbertura,
                pressaoAjuste: form.pressaoAjuste,
                fechamento: form.fechamento,
                incerteza: form.incerteza,
                coef: form.coef,
              }}
              aoConfirmar={aplicarResultados}
              aoFechar={() => setResultadosAbertos(false)}
            />
          )}
        </div>
      )}

      {/* ── VISUALIZADOR ─────────────────────────────── */}
      {tela === 'visualizador' && calAtual && (
        <>
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
                {calAtual.tipo === 'manometro' ? 'Certificado de Calibração — Manômetro' : 'Certificado de Calibração — PSV'}
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secundario" onClick={() => abrirVerDados(calAtual)}>
                  Ver preenchido
                </button>
                <button
                  type="button"
                  className={`btn-secundario${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                  onClick={() => void imprimirRelatorio('.cal-preview')}
                >
                  {documentosBloqueados() && <Icone nome="cadeado" tam={13} />} Imprimir
                </button>
                {confirmandoId === calAtual.id ? (
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

          {palco.estado !== 'pronto' && <RecusaPalco estado={palco.estado} falha={palco.falha} />}

          <div className="cal-preview">
            {palco.estado === 'pronto' && (
              <PaginaA4 key={`${calAtual.id}-${versao}`}>
                <iframe
                  src={`/arquivos-inspecao/${arquivoCalibracao(calAtual.tipo)}?calibId=${calAtual.id}&tag=${encodeURIComponent(tag)}&page=1${palco.paramsIframe}`}
                  scrolling="no"
                  title="Certificado de Calibração"
                />
              </PaginaA4>
            )}
          </div>
        </>
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
              {calAtual.tipo === 'manometro' ? 'Calibração — Manômetro' : 'Calibração — PSV'} (dados preenchidos)
            </h3>
            <button type="button" className="btn-primario" onClick={() => abrirVisualizador(calAtual)}>
              <Icone nome="eye" tam={14} /> Ver como fica o documento
            </button>
          </div>
          <VisualizadorCalibracao dados={calAtual} />
        </div>
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
