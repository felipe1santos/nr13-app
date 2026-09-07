import { usePalcoDocumento } from '../features/documentos/usePalcoDocumento';
import RecusaPalco from '../components/RecusaPalco';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import PaginaA4 from '../components/PaginaA4';
import { ler } from '../services/storage';
import CatalogoLivroV9 from '../features/livro/CatalogoLivroV9';
import { abrirEquipamentoParaLivro } from '../features/livro/catalogoLivro';
import type { FotoEquipamento, InfoEquipamento } from '../features/equipamento/tipos';
import { identificacaoDe } from '../features/equipamento/identificacaoEquipamento';
import FotoImg from '../components/FotoImg';
import type { FotoArmazenada } from '../services/fotos';
import { listarFuncionarios } from '../features/cadastros/cadastroService';
import {
  montarEntradaLivroDoRelatorio,
  montarEntradaLivroManual,
  timestampDataLivro,
} from '../features/relatorios/relatoriosService';
import { carregarRelatorio, listarIndice } from '../features/relatorios/historicoRelatorios';
import {
  excluirRascunhoLivro,
  listarRascunhosLivro,
  salvarRascunhoLivro,
  trancarRegistroLivro,
} from '../features/livro/rascunhosLivro';
import { somenteOficiais } from '../features/livro/estadoRegistro';
import { validarRegistroLivro, type ResultadoValidacaoRegistro } from '../features/livro/validacaoRegistro';
import ModalTrancarRegistro from '../features/livro/ModalTrancarRegistro';
import ModalNovoRegistro from '../features/livro/ModalNovoRegistro';
import PopoverAjuda from '../features/livro/PopoverAjuda';
import { FORM_OCORRENCIA_VAZIO, type FormOcorrencia } from '../features/livro/formRegistro';
import PreviaRegistro from '../features/livro/PreviaRegistro';
import {
  descricaoCombinada,
  termoSugerido,
  type DadosPrevia,
} from '../features/livro/termoRegistro';
import { verificarCadeia, verificarEntrada, type LivroEntrada as EntradaLacre } from '../features/relatorios/livroLacre';
import { exportarPdf, exportarPdfLivroCompleto } from '../features/relatorios/pdfService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import { documentosBloqueados } from '../services/trial';
import './dashboard-novo.css';
import './relatorios.css';
/* A barra de ferramentas desta tela vive no CSS da sessão. Importado aqui de
   propósito: ele chegaria pelo `CatalogoLivroV9` de qualquer jeito, mas a tela
   que usa a regra é esta. */
import '../features/livro/listaRegistros.css';

interface LivroEntrada {
  id?: string;
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
  // Campos opcionais das entradas automáticas novas (ausentes nas antigas):
  ensaios?: string[];
  apto?: boolean | null;
  tecnicoNome?: string;
  // Ocorrência manual (manutenção/reparo entre inspeções):
  origem?: 'auto' | 'manual';
  quemRealizou?: string;
  // Ciclo de vida rascunho → lacrado. Campo AUSENTE = entrada antiga ⇒ lacrada (imutável).
  lacrado?: boolean;
  retificaDe?: string;
  // ── Lacre criptográfico (12/08/2026) — ver features/relatorios/livroLacre.ts ──
  sha256?: string;
  shaAnterior?: string | null;
  lacradaEm?: string;
}

/** O que o selo mostra para cada entrada. */
type SeloEntrada = 'integra' | 'adulterada' | 'elo_quebrado' | 'sem_lacre';

interface LinhaLivro {
  tag: string;
  nomeEquip: string;
  entradas: LivroEntrada[];
  ultimaData: string;
  categoria: string;
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

// A entrada automática grava a data já em dd/mm/aaaa, mas a ocorrência manual vem do <input
// type="date">, que devolve aaaa-mm-dd. Sem normalizar, o livro mistura os dois formatos na mesma
// lista. Só converte o que está em ISO; qualquer outro formato passa intacto.
function dataBR(data: string | undefined): string {
  const bruta = String(data || '').trim();
  const iso = bruta.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : bruta;
}

/**
 * O caminho de volta: `dd/mm/aaaa` → `aaaa-mm-dd`, que é o único formato que o
 * `<input type="date">` aceita. Já em ISO, devolve como está; qualquer outra
 * coisa devolve vazio — melhor o campo em branco do que uma data inventada num
 * registro de segurança.
 */
function paraISO(data: string): string {
  const bruta = data.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruta)) return bruta;
  const br = bruta.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : '';
}

// Cor do badge por tipo de entrada — mesma paleta de badges do sistema (fj-badge), só varia
// a cor por tipo pra dar leitura rápida rolando a linha do tempo.
const COR_TIPO: Record<string, string> = {
  'Inspeção Inicial': 'ok',
  'Inspeção Periódica': 'info',
  'Inspeção Extraordinária': 'warn',
  'Ocorrência': 'crit',
};

/**
 * UMA linha, montada do que já está no cache.
 *
 * Extraída na 9F.4 para o caminho novo montar só o equipamento ESCOLHIDO —
 * antes, chegar a uma linha exigia varrer a organização inteira. A composição é
 * exatamente a mesma dos dois lados da flag, de propósito: montá-la de novo na
 * tela nova é como as divergências de cartão nasceram na 9C.
 *
 * NÃO vai ao servidor: quem semeia é `abrirEquipamentoParaLivro`, e a ordem
 * (semear → montar) é responsabilidade de quem chama.
 */
function montarLinha(tag: string): LinhaLivro | null {
  try {
    const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
    if (!info) return null;
    // 10B.2 · a chave oficial só contém registro oficial — o rascunho vive em
    // `nr13_livro_rascunho_<TAG>`. O filtro aqui é DEFENSIVO: se um rascunho
    // chegasse a esta chave por qualquer caminho, ele não entraria na contagem
    // nem na folha impressa, que é o que a projeção e o Portal enxergam.
    const entradas = somenteOficiais(ler<LivroEntrada[]>(`nr13_livro_${tag}`) ?? []);
    const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
    return {
      tag,
      nomeEquip: info.descricao?.trim() || ROTULO_TIPO[info.tipo] || 'Equipamento',
      entradas,
      ultimaData: entradas.length > 0 ? entradas[entradas.length - 1].data : '',
      categoria: cat?.catFinal || '',
    };
  } catch {
    return null; // chave malformada: ignora
  }
}


type DocPreview =
  | { arquivo: 'CAPA-LIVRO-REGISTRO.html'; titulo: string }
  | { arquivo: 'TERMO-ABERTURA.html'; titulo: string }
  | { arquivo: 'LIVRO-REGISTRO.html'; titulo: string; entradaId: string; idx: number };

// URLs do livro COMPLETO (capa + termo + todos os registros em ordem cronológica), em
// ?modo=compacto: cada template vira um bloco na altura do conteúdo, sem numeração de folha.
// &idx é o fallback de entradas antigas sem id (o template busca por id e cai no índice).
function urlsLivroCompleto(linha: LinhaLivro, params = ''): string[] {
  const t = encodeURIComponent(linha.tag);
  return [
    `/arquivos-inspecao/CAPA-LIVRO-REGISTRO.html?tag=${t}&modo=compacto${params}`,
    `/arquivos-inspecao/TERMO-ABERTURA.html?tag=${t}&modo=compacto${params}`,
    ...linha.entradas.map(
      (e, i) => `/arquivos-inspecao/LIVRO-REGISTRO.html?tag=${t}&entrada=${encodeURIComponent(e.id ?? '')}&idx=${i}&modo=compacto${params}`,
    ),
  ];
}

// Iframe que se ajusta à altura real do conteúdo (blocos do livro completo). Re-mede após as
// fontes carregarem — a altura do texto muda quando a Inter substitui a fonte de fallback.
function IframeBlocoLivro({ src, titulo }: { src: string; titulo: string }) {
  const [altura, setAltura] = useState(300);
  return (
    <iframe
      src={src}
      title={titulo}
      scrolling="no"
      style={{ width: 794, height: altura, border: 'none', display: 'block', background: '#fff' }}
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        const medir = () => {
          const pagina = doc?.querySelector<HTMLElement>('.page');
          const h = pagina?.scrollHeight || doc?.body?.scrollHeight || 0;
          if (h > 80) setAltura(h + 2);
        };
        medir();
        setTimeout(medir, 700);
      }}
    />
  );
}

// ── Recorte VISUAL do preview de um registro ────────────────────────────────────────────────
// O Registro de Segurança é um documento curto: na folha A4 do modal sobrava mais de meia folha
// em branco. Medimos aqui a altura REAL do conteúdo dentro do iframe e encolhemos só a CAIXA
// visível (.pagina-relatorio-a4, que já tem overflow:hidden) — o iframe continua com 297mm e o
// documento dentro dele não é tocado. Impressão/PDF passam por
// prepararFolhasImpressao/exportarPdf, que rasterizam `iframe.contentDocument.body` com
// height: ALTURA_A4_PX (297mm) e NÃO olham a altura do wrapper — logo o papel sai idêntico.
const ALTURA_A4_PREVIEW = 1123; // px @96dpi = 297mm (mesma referência do PaginaA4)
const FOLGA_RECORTE = 14; // respiro embaixo pro corte não ficar rente ao texto

/** Fundo (px, relativo ao topo da .page) do último conteúdo visível. null = não deu pra medir. */
function medirFundoConteudo(doc: Document | null | undefined): number | null {
  try {
    if (!doc) return null;
    const win = doc.defaultView;
    const page = doc.querySelector<HTMLElement>('.page') ?? doc.body;
    if (!win || !page) return null;
    const topo = page.getBoundingClientRect().top;
    const alturaPagina = page.getBoundingClientRect().height || ALTURA_A4_PREVIEW;
    let fundo = 0;

    // 1) Texto real (Range por nó de texto) — ignora containers esticados por flex.
    const walker = doc.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    let no: Node | null;
    while ((no = walker.nextNode())) {
      if (!no.nodeValue || !no.nodeValue.trim()) continue;
      const pai = no.parentElement;
      if (!pai) continue;
      const cs = win.getComputedStyle(pai);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const range = doc.createRange();
      range.selectNodeContents(no);
      const r = range.getBoundingClientRect();
      if (r.height > 0) fundo = Math.max(fundo, r.bottom - topo);
    }

    // 2) Imagens/vetores (logo, rubrica, selos).
    doc.querySelectorAll<HTMLElement>('img, svg, canvas').forEach((el) => {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) fundo = Math.max(fundo, r.bottom - topo);
    });

    // 3) Caixas com borda/fundo próprio (ex.: .termo-box tem min-height e passa do texto).
    //    Ignora containers grandes (> 60% da folha), que são esticados e não são "conteúdo".
    doc.querySelectorAll<HTMLElement>('.page *').forEach((el) => {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0 || r.height > alturaPagina * 0.6) return;
      const temBorda = parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderTopWidth) > 0;
      const temFundo = cs.backgroundImage !== 'none';
      if (!temBorda && !temFundo) return;
      fundo = Math.max(fundo, r.bottom - topo);
    });

    if (fundo <= 80) return null; // medição suspeita: mantém a folha A4 inteira
    return fundo;
  } catch {
    return null; // contentDocument nulo / cross-origin: comportamento atual
  }
}

// Tipos de ocorrência manual (manutenções pontuais entre inspeções — NR-13 13.4.1.9).
/* Os tipos de ocorrência, o tipo do formulário e o estado vazio moram em
   `features/livro/formRegistro.ts` desde 07/09/2026: o modal virou componente
   próprio (`ModalNovoRegistro`) e os dois precisam do MESMO tipo. */

export default function LivroRegistro() {
  // Estado (e não useMemo) para poder recarregar a timeline após salvar uma ocorrência manual.
  //
  // 9F.4: no caminho novo esta lista começa VAZIA e ganha exatamente UMA linha —
  // a do equipamento escolhido, montada depois da semeadura. Varrer o cache aqui
  // sob a flag nova devolveria só o que por acaso já estivesse no aparelho.
  const [linhas, setLinhas] = useState<LinhaLivro[]>([]);
  /** Termo da busca do catálogo (só no caminho novo). */
  const [termoBusca, setTermoBusca] = useState('');
  /** Abrindo um livro pela lista nova: semeando a TAG antes de ler. */
  const [abrindo, setAbrindo] = useState(false);

  // Fase 9 · 9F.4 — a hidratação integral SÓ acontece no caminho legado.
  //
  // Esta tela era a ÚLTIMA do sistema que ainda chamava `lerTudo()`. Ela cruza
  // `nr13_info_` com `nr13_livro_<TAG>` de cada equipamento, e o livro não tinha
  // projeção que dissesse quem tem livro — então, sob `boot_v9`, o cache não
  // teria nada disso e a tela abriria VAZIA.
  //
  // Com `livro_v9` LIGADA a lista vem do catálogo (`CatalogoLivroV9`) e este
  // efeito não roda: `deveHidratarListaLegada` é a decisão, e ela mora no
  // serviço porque a suíte não renderiza React — regra dentro do JSX não tem
  // teste. Com a flag desligada, tudo continua exatamente como sempre foi.
  const [tagAberta, setTagAberta] = useState<string | null>(null);

  /**
   * Abrir um livro vindo da lista NOVA: semear a TAG e só então montar a linha.
   *
   * A ordem é o risco inteiro desta etapa. Ler antes de semear abriria o livro
   * sem entrada nenhuma e SEM ERRO — o usuário concluiria que o registro de
   * segurança do equipamento sumiu. `abrirEquipamentoParaLivro` garante o
   * `await`, e `semeaduraLivro.test.ts` guarda a ordem.
   */
  const abrirPorTag = async (tag: string) => {
    setAbrindo(true);
    try {
      await abrirEquipamentoParaLivro(tag);
      const linha = montarLinha(tag);
      // Sem ficha no cache (offline logo no primeiro acesso), monta o mínimo
      // para o livro abrir mesmo assim, em vez de não responder ao clique.
      setLinhas([linha ?? { tag, nomeEquip: tag, entradas: [], ultimaData: '', categoria: '' }]);
      setRascunhos(listarRascunhosLivro(tag) as unknown as LivroEntrada[]);
      setTagAberta(tag);
    } finally {
      setAbrindo(false);
    }
  };
  const [preview, setPreview] = useState<{ tag: string; doc: DocPreview } | null>(null);
  /*
   * O QUE O VISUALIZADOR MOSTRA PRIMEIRO (07/09/2026).
   *
   * 'ficha' é a leitura eletrônica do registro; 'a4' é a folha para imprimir e
   * colar no livro físico. A ficha é o padrão porque é o que o usuário faz o
   * tempo todo — a folha ele gera uma vez, na hora de imprimir. A capa e o
   * termo de abertura não têm ficha: são documentos de papel, e abrem em A4.
   */
  const [modoVisual, setModoVisual] = useState<'ficha' | 'a4'>('ficha');
  /** A entrada aberta no visualizador, quando o que se vê é um registro. */
  const [registroAberto, setRegistroAberto] = useState<{
    entrada: LivroEntrada;
    numero: number;
  } | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [livroCompleto, setLivroCompleto] = useState(false);
  const [exportandoLivro, setExportandoLivro] = useState(false);
  const [form, setForm] = useState<FormOcorrencia>(FORM_OCORRENCIA_VAZIO);

  // Palco do livro. A TAG ativa é a do equipamento aberto ou a da pré-visualização
  // — as duas montam folhas que leem localStorage no DOMContentLoaded. O hook fica
  // ANTES dos retornos condicionais desta tela, porque hook não pode ser pulado.
  /** Sobe a cada gravação no livro — é o que força o palco a ser refeito. */
  const [versaoLivro, setVersaoLivro] = useState(0);

  const tagDoPalco = tagAberta ?? preview?.tag ?? '';
  /*
   * O PALCO precisa ser REMONTADO quando o livro muda.
   *
   * Ele materializa as chaves da TAG no localStorage uma vez, no id do
   * documento — e o id era fixo (`livro-<TAG>`). Resultado medido em produção
   * em 07/09/2026: trancar um registro e clicar em "Ver / Imprimir" abria a
   * folha com o palco montado ANTES do trancamento, sem a entrada nova e sem o
   * termo digitado. A versão entra no id: livro alterado, palco refeito.
   */
  const palco = usePalcoDocumento(tagDoPalco, `livro-${tagDoPalco}-v${versaoLivro}`);

  /**
   * A foto de identificação do equipamento aberto.
   *
   * Do CACHE, e não de uma consulta nova: `abrirEquipamentoParaLivro` já semeou
   * a TAG antes desta tela montar, e `identificacaoDe` é a mesma regra da ficha
   * e da capa do relatório (a marcada como capa, ou a primeira). `null` quando
   * o equipamento não tem foto — o cabeçalho mostra o marcador neutro.
   */
  /**
   * A razão social da executante — é ela que o Termo cita ("pela empresa
   * habilitada X"). Do cadastro `nr13_minha_empresa`, a mesma fonte que a folha
   * do livro usa; sem cadastro, a folha escreveria o marcador, e a prévia
   * escreve o mesmo, em vez de inventar um nome.
   */
  const nomeEmpresaExecutante = useMemo(() => {
    const emp = ler<{ razao?: string; fantasia?: string }>('nr13_minha_empresa');
    return (emp?.razao || emp?.fantasia || '').trim();
  }, []);


  const fotoDoEquipamento = useMemo<FotoArmazenada | null>(() => {
    if (!tagAberta) return null;
    const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tagAberta}`) ?? [];
    const capa = identificacaoDe(fotos);
    // `base64: capa.src` é o campo LEGADO — as fotos gravadas antes do bucket
    // moram ali, e é assim que a ficha e a capa do relatório as exibem.
    return capa ? { ref: capa.ref, base64: capa.src } : null;
  }, [tagAberta]);
  const [erroForm, setErroForm] = useState('');
  // ── Fase 10B.2 · registros em rascunho ─────────────────────────────────────
  /** Rascunhos do livro ABERTO. Vivem em `nr13_livro_rascunho_<TAG>`, fora da
      chave oficial — é o que os mantém fora da projeção, do Portal e da folha. */
  const [rascunhos, setRascunhos] = useState<LivroEntrada[]>([]);
  /** id do rascunho sendo editado no modal; `null` = registro novo. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /** Aba com que o modal abre: o olho da lista pede a prévia, o lápis o formulário. */
  const [abaModal, setAbaModal] = useState<'previa' | 'ajuda'>('previa');
  /** Rascunho escolhido para trancar, já validado. `null` = modal fechado. */
  const [trancando, setTrancando] = useState<{ id: string; validacao: ResultadoValidacaoRegistro } | null>(null);
  const [trancandoOcupado, setTrancandoOcupado] = useState(false);
  const [erroTrancar, setErroTrancar] = useState('');
  // Visão "Histórico": log cronológico em texto puro (sem iframes de folhas).
  // Altura (px) do recorte VISUAL da folha no modal de preview. null = folha A4 inteira.
  const [alturaRecorte, setAlturaRecorte] = useState<number | null>(null);
  const funcionarios = useMemo(() => listarFuncionarios(), []);

  const linhaAberta = linhas.find((l) => l.tag === tagAberta) ?? null;

  /**
   * A LISTA ÚNICA: rascunhos e registros lacrados, em ordem cronológica.
   *
   * O `numero` vem da posição no array OFICIAL, não da posição nesta lista: a
   * numeração do livro é a ordem dos trancamentos, e um rascunho no meio não
   * pode empurrar o "#000002" de um registro já emitido. Rascunho não recebe
   * número nenhum — ele ganha o seu ao ser trancado.
   */
  const itensDoLivro = useMemo(() => {
    const oficiais = (linhaAberta?.entradas ?? []).map((entrada, i) => ({
      entrada,
      numero: i + 1,
      rascunho: false,
      i,
    }));
    const emRascunho = rascunhos.map((entrada, i) => ({
      entrada,
      numero: 0,
      rascunho: true,
      i,
    }));
    return [...oficiais, ...emRascunho].sort(
      (a, b) => timestampDataLivro(a.entrada.data) - timestampDataLivro(b.entrada.data),
    );
  }, [linhaAberta, rascunhos]);

  // ── Selo de integridade ────────────────────────────────────────────────────
  // O lacre (hash + elo) já protege o livro; sem mostrá-lo, protege em silêncio.
  // A verificação é assíncrona (crypto.subtle) e roda só para o livro ABERTO —
  // um equipamento por vez, algumas dezenas de entradas, microssegundos cada.
  const [selos, setSelos] = useState<Record<string, SeloEntrada>>({});
  const [cadeiaOk, setCadeiaOk] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!linhaAberta) {
      setSelos({});
      setCadeiaOk(null);
      return;
    }
    const entradas = linhaAberta.entradas as unknown as EntradaLacre[];
    void Promise.all([
      verificarCadeia(entradas),
      Promise.all(entradas.map(async (e) => [e.id, await verificarEntrada(e)] as const)),
    ]).then(([cadeia, porEntrada]) => {
      if (!vivo) return;
      const mapa: Record<string, SeloEntrada> = {};
      for (const [id, veredicto] of porEntrada) mapa[String(id)] = veredicto;
      // O elo quebrado é da CADEIA, não da entrada em si: sobrescreve só quem a
      // cadeia acusou, e sem apagar um veredicto de "adulterada" que é pior.
      for (const p of cadeia.problemas) {
        if (mapa[p.id] !== 'adulterada') mapa[p.id] = p.motivo === 'elo_quebrado' ? 'elo_quebrado' : 'adulterada';
      }
      setSelos(mapa);
      setCadeiaOk(cadeia.ok);
    });
    return () => {
      vivo = false;
    };
  }, [linhaAberta]);

  // Pré-rasteriza a folha em #print-root assim que o preview abre (mesmo padrão de
  // Relatorios.tsx), pra que Imprimir/Baixar PDF funcionem igual ao resto do sistema.
  useEffect(() => {
    if (!preview) return;
    setAlturaRecorte(null); // troca de documento: volta pra folha inteira até medir de novo
    let cancelado = false;
    const container = document.querySelector<HTMLElement>('.relatorio-preview');
    if (!container) return;
    const iframe = container.querySelector('iframe');
    const aguardar = iframe?.contentDocument && iframe.contentDocument.readyState === 'complete'
      ? Promise.resolve()
      : new Promise<void>((res) => iframe?.addEventListener('load', () => res(), { once: true }));
    aguardar
      .then(() => new Promise((r) => setTimeout(r, 400)))
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [preview]);

  async function imprimirPreview() {
    setImprimindo(true);
    try {
      await imprimirRelatorio('.relatorio-preview');
    } finally {
      setImprimindo(false);
    }
  }

  async function baixarPreview() {
    if (!preview) return;
    setExportando(true);
    try {
      await exportarPdf('.relatorio-preview', `${preview.doc.titulo.replace(/\s+/g, '_')}_${preview.tag}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  async function exportarLivroPdf() {
    if (!linhaAberta || exportandoLivro) return;
    setExportandoLivro(true);
    try {
      await exportarPdfLivroCompleto(urlsLivroCompleto(linhaAberta, palco.paramsIframe), `Livro_Registro_${linhaAberta.tag}.pdf`);
    } finally {
      setExportandoLivro(false);
    }
  }

  function abrirModalOcorrencia() {
    setForm(FORM_OCORRENCIA_VAZIO);
    setAbaModal('previa');
    setEditandoId(null);
    setErroForm('');
    setModalOcorrencia(true);
  }

  /**
   * Reabre um rascunho para continuar de onde parou.
   *
   * `aba` decide o que o usuário vê primeiro: o OLHO da lista abre na prévia
   * (ele quer LER o rascunho), o lápis abre no formulário. Nos dois casos é o
   * mesmo modal e o mesmo rascunho — ver e editar deixaram de ser dois lugares.
   */
  function editarRascunho(r: LivroEntrada, aba: 'previa' | 'ajuda' = 'previa') {
    // A descrição é gravada combinada ("o que foi feito — detalhe"). Na volta ela
    // vem inteira no primeiro campo: separar por um travessão que o usuário pode
    // ter digitado quebraria o texto dele no lugar errado.
    setForm({
      data: r.data ?? '',
      tipoOcorrencia: r.tipo ?? '',
      oQueFoiFeito: r.descricao ?? '',
      descricao: '',
      quemRealizou: r.quemRealizou ?? '',
      phId: (r as { phId?: string }).phId ?? '',
      retificaDe: r.retificaDe ?? '',
      // O termo digitado volta como está. Vazio = a sugestão volta a valer.
      termoTexto: (r as { termoTexto?: string }).termoTexto ?? '',
      relatorioCodigo: r.relatorioCodigo || undefined,
      apto: r.apto ?? null,
    });
    setAbaModal(aba);
    setEditandoId(r.id ?? null);
    setErroForm('');
    setModalOcorrencia(true);
  }

  /**
   * PRÉ-PREENCHER a partir de um relatório finalizado.
   *
   * É o que restou — de propósito — do antigo acoplamento automático: os mesmos
   * campos (tipo, data de execução, ensaios, laudo, rubrica congelada), agora
   * como uma OFERTA. Quem decide que existe um registro é o usuário.
   */
  async function preencherDeRelatorio(relatorioId: string) {
    if (!linhaAberta || !relatorioId) return;
    setErroForm('');
    const rel = carregarRelatorio(relatorioId, linhaAberta.tag);
    if (!rel) {
      // O índice tem o relatório, o registro completo ainda não chegou a este
      // aparelho (boot leve). Dizer isso é melhor do que um clique que não faz
      // nada — e melhor ainda do que deixar na tela o erro da escolha anterior.
      setErroForm('Este relatório ainda não está baixado neste aparelho. Abra-o em Relatórios uma vez e tente de novo.');
      return;
    }
    const entrada = await montarEntradaLivroDoRelatorio(rel);
    if (!entrada) {
      setErroForm('Este relatório já tem registro trancado neste livro.');
      return;
    }
    setForm((f) => ({
      ...f,
      // `<input type="date">` só aceita `aaaa-mm-dd`. A entrada montada traz a
      // data do relatório, que pode vir em `dd/mm/aaaa` — atribuir isso ao
      // campo o deixa VAZIO, sem erro nenhum, e o usuário perde o único campo
      // obrigatório que o pré-preenchimento deveria ter resolvido (medido em
      // produção em 07/09/2026).
      data: paraISO(String(entrada.data ?? '')) || f.data,
      tipoOcorrencia: String(entrada.tipo ?? f.tipoOcorrencia),
      oQueFoiFeito: String(entrada.descricao ?? f.oQueFoiFeito),
      phId: entrada.phId ?? f.phId,
    }));
    setErroForm('');
  }

  /**
   * SALVAR — grava o RASCUNHO e mantém tudo editável.
   *
   * Nada aqui toca `nr13_livro_<TAG>`: o registro só entra no livro oficial ao
   * ser TRANCADO. É por isso que ele não conta, não vai ao Portal e não entra na
   * cadeia enquanto está em rascunho.
   */
  /**
   * Os dados da FICHA de um registro já gravado.
   *
   * `termoTexto` ausente é entrada ANTIGA (anterior a 07/09/2026) ou automática
   * de relatório: aí a ficha mostra a mesma frase que a folha montaria, pela
   * mesma regra — o registro não fica sem termo na tela por ter sido criado
   * antes de o campo existir.
   */
  function dadosDaEntrada(e: LivroEntrada): DadosPrevia {
    const termo = (e as { termoTexto?: string }).termoTexto?.trim();
    return {
      tag: linhaAberta?.tag ?? '',
      equipamento: linhaAberta?.nomeEquip ?? '',
      empresa: nomeEmpresaExecutante,
      data: e.data,
      tipo: e.tipo,
      // A descrição já vem combinada na entrada gravada.
      oQueFoiFeito: e.descricao ?? '',
      descricao: '',
      quemRealizou: e.quemRealizou ?? '',
      assinante: e.phNome ?? '',
      relatorioCodigo: e.relatorioCodigo || undefined,
      termo:
        termo ||
        termoSugerido({
          tipo: e.tipo,
          data: e.data,
          empresa: nomeEmpresaExecutante,
          relatorioCodigo: e.relatorioCodigo || undefined,
          apto: e.apto,
          descricao: e.descricao ?? '',
        }),
    };
  }

  /** O termo efetivo: o texto do usuário ou, na falta dele, a sugestão. */
  function termoDoFormulario(): string {
    return termoSugerido({
      tipo: form.tipoOcorrencia,
      data: form.data,
      empresa: nomeEmpresaExecutante,
      relatorioCodigo: form.relatorioCodigo,
      apto: form.apto,
      descricao: descricaoCombinada(form.oQueFoiFeito, form.descricao),
    });
  }

  async function salvarOcorrencia() {
    if (!linhaAberta) return;
    if (!form.data || !form.tipoOcorrencia || !form.oQueFoiFeito.trim()) {
      setErroForm('Preencha a data, o tipo de ocorrência e o que foi feito.');
      return;
    }
    const entrada = await montarEntradaLivroManual({
      data: form.data,
      tipoOcorrencia: form.tipoOcorrencia,
      oQueFoiFeito: form.oQueFoiFeito,
      descricao: form.descricao,
      quemRealizou: form.quemRealizou,
      phId: form.phId || null,
      retificaDe: form.retificaDe || undefined,
      // O termo vai GRAVADO, inclusive quando o usuário não mexeu nele: guardar
      // só o texto editado deixaria a folha remontar a frase com os dados de
      // AMANHÃ (razão social nova, por exemplo) num registro já trancado.
      termoTexto: form.termoTexto.trim() || termoDoFormulario(),
      relatorioCodigo: form.relatorioCodigo,
      apto: form.apto ?? null,
    });
    // Editar um rascunho reescreve o MESMO registro: id novo criaria um segundo
    // rascunho a cada gravação.
    await salvarRascunhoLivro(linhaAberta.tag, { ...entrada, id: editandoId ?? entrada.id });
    setRascunhos(listarRascunhosLivro(linhaAberta.tag) as unknown as LivroEntrada[]);
    setModalOcorrencia(false);
    setForm(FORM_OCORRENCIA_VAZIO);
    setEditandoId(null);
    setErroForm('');
  }

  function abrirTrancamento(r: LivroEntrada) {
    setErroTrancar('');
    setTrancando({ id: r.id ?? '', validacao: validarRegistroLivro(r as never) });
  }

  async function confirmarTrancamento() {
    if (!linhaAberta || !trancando) return;
    setTrancandoOcupado(true);
    setErroTrancar('');
    try {
      await trancarRegistroLivro(linhaAberta.tag, trancando.id);
      // 9G.3 · o livro aberto é recomposto pela TAG, não por varredura do cache.
      const atualizada = montarLinha(linhaAberta.tag);
      if (atualizada) setLinhas([atualizada]);
      setRascunhos(listarRascunhosLivro(linhaAberta.tag) as unknown as LivroEntrada[]);
      setVersaoLivro((v) => v + 1);
      setTrancando(null);
    } catch (e) {
      setErroTrancar(
        `Não foi possível trancar o registro: ${e instanceof Error ? e.message : String(e)}. Nada foi alterado.`,
      );
    } finally {
      setTrancandoOcupado(false);
    }
  }

  async function apagarRascunho(id: string) {
    if (!linhaAberta) return;
    await excluirRascunhoLivro(linhaAberta.tag, id);
    setRascunhos(listarRascunhosLivro(linhaAberta.tag) as unknown as LivroEntrada[]);
  }

  const srcPreview = preview
    ? `/arquivos-inspecao/${preview.doc.arquivo}?tag=${encodeURIComponent(preview.tag)}${
        preview.doc.arquivo === 'LIVRO-REGISTRO.html'
          ? `&entrada=${encodeURIComponent(preview.doc.entradaId)}&idx=${preview.doc.idx}`
          : ''
      }${palco.paramsIframe}`
    : '';

  /* ── Detalhe do equipamento: capa + termo fixos no topo, depois a timeline ── */
  if (linhaAberta) {
    return (
      <div className="dash-page">
        <div className="fj-panel">
          {/*
            CABEÇALHO ÚNICO (07/09/2026).

            Eram TRÊS faixas empilhadas — cabeçalho com o nome, barra de
            ferramentas e a fileira de cards — e sobrava vazio entre elas. Agora
            identificação, ações e foto dividem o MESMO bloco: trilha e eyebrow
            na primeira linha, nome do equipamento e badges embaixo, ações à
            direita e a foto de identificação no canto.
          */}
          {/*
            DUAS LINHAS, e só (07/09/2026).

            LINHA 1: volta + trilha da norma à esquerda, ações e a foto à
            direita. LINHA 2: TAG, tipo e categoria — a identificação, junta.
            Antes a identificação e as ações disputavam a mesma linha e os
            badges abriam uma terceira; o cabeçalho passava de 110px sem dizer
            nada a mais.
          */}
          <div className="fj-panel-head livro-topo">
            <div className="livro-topo-l1">
              <div className="meta-breadcrumb livro-topo-trilha">
                <button type="button" className="btn-secundario" onClick={() => { setTagAberta(null); setLivroCompleto(false); }}>
                  ← Todos os equipamentos
                </button>
                <span className="breadcrumb-chevron">›</span>
                <span className="fj-eyebrow">NR-13 · 13.4.1.9 · Livro de Registro de Segurança</span>
              </div>

              {/* 10B.2 · o registro do Livro passou a ser ATO DO USUÁRIO. Antes,
                  finalizar um relatório criava um sozinho, já lacrado. */}
              <div className="livro-toolbar-acoes">
                <button type="button" className="fj-btn fj-btn-primary" onClick={abrirModalOcorrencia}>
                  <Icone nome="plus" tam={13} /> Novo registro
                </button>
                <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setLivroCompleto(true)}>
                  <Icone nome="eye" tam={13} /> Ver livro completo
                </button>
                <button
                  type="button"
                  className={`fj-btn fj-btn-ghost${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                  onClick={() => void exportarLivroPdf()}
                  disabled={exportandoLivro}
                >
                  {documentosBloqueados() ? <Icone nome="cadeado" tam={13} /> : <Icone nome="download" tam={13} />}{' '}
                  {exportandoLivro ? 'Gerando PDF…' : 'Exportar PDF'}
                </button>
              </div>

              {/* A foto REAL do equipamento, do cache que a abertura já semeou.
                  Sem ida à rede: `carregarEquipamento` trouxe `nr13_fotos_<TAG>`
                  antes de a tela montar. */}
              <span className="livro-topo-foto">
                {fotoDoEquipamento ? (
                  <FotoImg
                    foto={fotoDoEquipamento}
                    alt={`Foto do equipamento ${linhaAberta.tag}`}
                    variante="thumb"
                    placeholder=""
                  />
                ) : (
                  <span className="livro-topo-foto-vazia" aria-hidden>
                    <Icone nome="camera" tam={16} />
                  </span>
                )}
              </span>
            </div>

            <div className="livro-topo-l2">
              <h2>{linhaAberta.tag}</h2>
              <span className="livro-topo-tipo">{linhaAberta.nomeEquip}</span>
              {linhaAberta.categoria && (
                <span className="livro-topo-cat">Cat. {linhaAberta.categoria}</span>
              )}
            </div>
          </div>

          {/*
            FAIXA UTILITÁRIA: documentos do livro à esquerda, estado à direita.

            Os dois cards eram um grid `auto-fit` que esticava até o fim da
            tela — dois painéis enormes para dois atalhos. Agora eles têm
            largura própria, e o espaço que sobrava passou a carregar o resumo
            do livro, que antes ocupava uma faixa verde inteira embaixo.
          */}
          <div className="livro-fixos">
            <div className="livro-fixos-docs">
              <button
                type="button"
                className="livro-doc-card"
                onClick={() => { setRegistroAberto(null); setModoVisual('a4'); setPreview({ tag: linhaAberta.tag, doc: { arquivo: 'CAPA-LIVRO-REGISTRO.html', titulo: 'Capa do Livro de Registro' } }); }}
              >
                {/* A capa é o LIVRO; o termo é o documento lavrado que o abre —
                    daí o livro e o carimbo de conformidade. */}
                <span className="livro-doc-ic capa"><Icone nome="book" tam={15} /></span>
                <div>
                  <strong>Capa do Livro</strong>
                  <span>Identificação e classificação</span>
                </div>
              </button>
              <button
                type="button"
                className="livro-doc-card"
                onClick={() => { setRegistroAberto(null); setModoVisual('a4'); setPreview({ tag: linhaAberta.tag, doc: { arquivo: 'TERMO-ABERTURA.html', titulo: 'Termo de Abertura' } }); }}
              >
                <span className="livro-doc-ic termo"><Icone nome="clipboard" tam={15} /></span>
                <div>
                  <strong>Termo de Abertura</strong>
                  <span>NR-13, item 13.4.1.9</span>
                </div>
              </button>
            </div>

            {/* O estado do livro em três números e um selo. O veredicto da
                cadeia só aparece quando há registro lacrado para verificar —
                dizer "íntegra" sobre livro vazio não afirma nada. */}
            <div className="livro-resumo">
              <span className="livro-resumo-num">
                <b>{itensDoLivro.length}</b>
                <small>registro{itensDoLivro.length === 1 ? '' : 's'}</small>
              </span>
              <span className="livro-resumo-txt">
                {linhaAberta.entradas.length} lacrado{linhaAberta.entradas.length === 1 ? '' : 's'}
                {rascunhos.length > 0 && ` · ${rascunhos.length} rascunho${rascunhos.length === 1 ? '' : 's'}`}
              </span>
              {cadeiaOk !== null && linhaAberta.entradas.length > 0 && (
                <span className={`livro-resumo-cadeia${cadeiaOk ? '' : ' quebrada'}`}>
                  <Icone nome={cadeiaOk ? 'shield' : 'alerttri'} tam={12} />
                  {cadeiaOk ? 'Cadeia íntegra' : 'Cadeia não confere'}
                  <PopoverAjuda rotulo="O que é a cadeia de registros" alinhamento="direita">
                    <b>Cada registro guarda a impressão digital do anterior.</b>
                    <span>
                      Ao trancar, o sistema calcula o SHA-256 do conteúdo do registro e grava junto
                      o hash do registro anterior. Editar, remover ou reordenar qualquer um quebra a
                      sequência, e a quebra aparece aqui e no registro afetado.
                    </span>
                  </PopoverAjuda>
                </span>
              )}
            </div>
          </div>


          {itensDoLivro.length === 0 ? (
            <p className="dashboard-vazio" style={{ padding: '14px 0' }}>Nenhum registro lançado ainda neste livro.</p>
          ) : (
            <ul className="livro-timeline">
              {itensDoLivro.map(({ entrada, numero, rascunho, i }) => {
                const cor = COR_TIPO[entrada.tipo] ?? 'neutro';
                // Os 8 primeiros dígitos do SHA-256 REAL. Vazio = entrada antiga,
                // sem lacre — e aí nenhum código é exibido, em vez de inventar um.
                const cripto = entrada.sha256 ? entrada.sha256.slice(0, 8).toUpperCase() : '';
                const numeroRegistro = numero ? String(numero).padStart(6, '0') : '';
                const retificada = entrada.retificaDe
                  ? linhaAberta.entradas.find((e) => e.id === entrada.retificaDe)
                  : undefined;
                return (
                  <li
                    key={entrada.id ?? `${rascunho ? 'r' : 'o'}-${i}`}
                    className={`livro-timeline-item${rascunho ? ' rascunho' : ''}`}
                  >
                    <span className="livro-timeline-marco" />
                    <div className="livro-timeline-corpo">
                      {/* Cabeçalho da linha: número do registro, data, tipo e o
                          estado do lacre — a informação que identifica a
                          entrada, antes do texto dela. O número saiu dos
                          metadados (onde disputava espaço com o SHA) porque é
                          por ele que um registro é citado. */}
                      <div className="livro-timeline-topo">
                        {/* Rascunho não tem número: a numeração do livro é a
                            ordem dos TRANCAMENTOS, e dar um número agora seria
                            prometer uma posição que só o trancamento define. */}
                        {rascunho ? (
                          <span className="livro-timeline-rascunho">Rascunho</span>
                        ) : (
                          <span className="livro-timeline-num">#{numeroRegistro}</span>
                        )}
                        <span className="livro-timeline-data">{dataBR(entrada.data)}</span>
                        {/* O tipo é METADADO, não etiqueta: cor no texto, sem
                            fundo. Com o fundo cheio, cada linha da lista tinha
                            três adesivos coloridos disputando o olho com o
                            texto do registro. */}
                        <span className={`livro-timeline-tipo t-${cor}`}>{entrada.tipo}</span>
                        {/* Sem selo Apto/Inapto para ocorrência manual — não é laudo de inspeção. */}
                        {entrada.origem !== 'manual' && (entrada.apto === true || entrada.apto === false) && (
                          <span className={`livro-timeline-laudo ${entrada.apto ? 'ok' : 'crit'}`}>
                            {entrada.apto ? 'Apto' : 'Inapto'}
                          </span>
                        )}
                        {entrada.origem === 'manual' && <span className="livro-timeline-origem">manual</span>}
                        {/* LACRADO é um fato do registro (tem selo criptográfico);
                            ÍNTEGRO é o veredicto de recalculá-lo, e continua nos
                            metadados. Trocar um pelo outro afirmaria verificação
                            onde há só presença de hash. */}
                        {cripto && (
                          <span className="livro-timeline-lacre">
                            <Icone nome="cadeado" tam={11} /> Lacrado
                          </span>
                        )}
                      </div>
                      {retificada && (
                        <div className="livro-timeline-desc" style={{ fontStyle: 'italic' }}>
                          Retifica o registro de {retificada.data}
                          {retificada.relatorioCodigo ? ` (relatório ${retificada.relatorioCodigo})` : ''}
                        </div>
                      )}
                      <div className="livro-timeline-desc">{entrada.descricao}</div>
                      {entrada.ensaios && entrada.ensaios.length > 0 && (
                        <div className="livro-timeline-desc">Ensaios: {entrada.ensaios.join(' · ')}</div>
                      )}
                      <div className="livro-timeline-meta">
                        {entrada.relatorioCodigo && <span>Relatório {entrada.relatorioCodigo}</span>}
                        {entrada.phNome && <span>{entrada.phNome}</span>}
                        {entrada.tecnicoNome && <span>Téc.: {entrada.tecnicoNome}</span>}
                        {entrada.quemRealizou && <span>Exec.: {entrada.quemRealizou}</span>}
                        {/* SELO REAL (12/08/2026). Antes daqui saía um código
                            derivado do id por uma função de hash caseira, com o
                            título "recurso em desenvolvimento", e um "Íntegro"
                            FIXO NO CÓDIGO — a tela afirmava integridade que
                            nunca havia sido verificada. Agora o código é o
                            SHA-256 gravado na emissão e o veredicto vem de
                            recalculá-lo. */}
                        {cripto && (
                          <span className="selo-flat crypto" title={`SHA-256 ${entrada.sha256}\nLacrado em ${entrada.lacradaEm?.slice(0, 10) ?? '—'}`}>
                            <Icone nome="shield" tam={10} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 3 }} />
                            SHA-256 {cripto}
                          </span>
                        )}
                        {/* O número saiu daqui e virou o `#000001` do cabeçalho:
                            ali ele identifica a entrada, aqui competia com o
                            SHA por atenção. */}
                        {selos[entrada.id ?? ''] === 'integra' && (
                          <span className="livro-timeline-integro" title="O conteúdo confere com o hash gravado na emissão.">
                            <Icone nome="check" tam={10} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 3 }} />
                            Íntegro
                          </span>
                        )}
                        {selos[entrada.id ?? ''] === 'adulterada' && (
                          <span className="selo-flat crit" title="O conteúdo NÃO confere com o hash gravado na emissão.">
                            ⚠ Alterado após a emissão
                          </span>
                        )}
                        {selos[entrada.id ?? ''] === 'elo_quebrado' && (
                          <span className="selo-flat crit" title="O elo com o registro anterior não confere: algum registro foi removido ou reordenado.">
                            ⚠ Cadeia quebrada
                          </span>
                        )}
                        {selos[entrada.id ?? ''] === 'sem_lacre' && (
                          <span className="selo-flat neutro" title="Registro anterior à adoção do lacre criptográfico (12/08/2026). Não é sinal de problema.">
                            Sem lacre
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Largura mínima de 190px vinha inline e, no celular, sobrava uma
                        coluna de ~60px para a descrição — uma palavra por linha. Agora é
                        classe, e abaixo de 640px a ação cai para a linha de baixo. */}
                    {/*
                      AS AÇÕES, pelo ESTADO do registro.

                      Rascunho: ver (abre o modal na prévia), editar, trancar e
                      excluir. Lacrado: ver/imprimir a folha — e só. A ausência
                      do lápis num registro trancado não é economia de espaço, é
                      a regra: registro consumado não se edita, se retifica.
                    */}
                    <div className="livro-timeline-acoes">
                      {rascunho ? (
                        <>
                          <button
                            type="button"
                            className="btn-icone"
                            title="Ver como vai ficar"
                            aria-label="Ver o rascunho"
                            onClick={() => editarRascunho(entrada, 'previa')}
                          >
                            <Icone nome="eye" tam={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icone"
                            title="Editar rascunho"
                            aria-label="Editar o rascunho"
                            onClick={() => editarRascunho(entrada, 'ajuda')}
                          >
                            <Icone nome="pencil" tam={14} />
                          </button>
                          <button
                            type="button"
                            className="fj-btn fj-btn-primary livro-btn-trancar"
                            onClick={() => abrirTrancamento(entrada)}
                          >
                            <Icone nome="cadeado" tam={13} /> Trancar
                          </button>
                          <button
                            type="button"
                            className="btn-icone cor-vermelho"
                            title="Excluir rascunho"
                            aria-label="Excluir o rascunho"
                            onClick={() => void apagarRascunho(entrada.id ?? '')}
                          >
                            <Icone nome="trash" tam={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={`fj-btn fj-btn-ghost${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                          onClick={() => {
                            // Guarda a ENTRADA: é dela que a ficha eletrônica é
                            // montada. A folha A4 continua vindo do iframe, na
                            // aba ao lado.
                            setRegistroAberto({ entrada, numero });
                            setModoVisual('ficha');
                            setPreview({
                              tag: linhaAberta.tag,
                              doc: {
                                arquivo: 'LIVRO-REGISTRO.html',
                                titulo: `Registro_${entrada.data.replace(/\//g, '-')}`,
                                entradaId: entrada.id ?? '',
                                idx: i,
                              },
                            });
                          }}
                        >
                          {documentosBloqueados() ? <Icone nome="cadeado" tam={13} /> : <Icone nome="eye" tam={13} />} Ver registro
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {preview && (
          <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
            <div className="fj-modal-box" style={{ maxWidth: 900 }}>
              <div className="fj-modal-head">
                <div>
                  <div className="fj-eyebrow">{preview.doc.titulo}</div>
                  <h2>{preview.tag}</h2>
                </div>
                <button type="button" className="fj-modal-close" onClick={() => setPreview(null)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
              {/* A barra do visualizador: à esquerda, o QUE se está vendo
                  (ficha eletrônica ou folha A4); à direita, o que fazer com a
                  folha. Imprimir e baixar só aparecem no modo A4 — imprimir a
                  ficha não é o que ninguém quer, e o botão ali só confundiria. */}
              <div className="no-print livro-visual-barra">
                {registroAberto && (
                  <div className="livro-visual-modos" role="tablist" aria-label="Formato do registro">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modoVisual === 'ficha'}
                      className={modoVisual === 'ficha' ? 'ativa' : ''}
                      onClick={() => setModoVisual('ficha')}
                    >
                      <Icone nome="filetext" tam={12} /> Registro
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modoVisual === 'a4'}
                      className={modoVisual === 'a4' ? 'ativa' : ''}
                      onClick={() => setModoVisual('a4')}
                    >
                      <Icone nome="planilha" tam={12} /> Folha A4
                    </button>
                  </div>
                )}
                {modoVisual === 'a4' && (
                  <div className="livro-visual-acoes">
                    <button
                      type="button"
                      className={`btn-secundario${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                      onClick={() => void imprimirPreview()}
                      disabled={imprimindo}
                    >
                      {documentosBloqueados() && <Icone nome="cadeado" tam={13} />}{' '}
                      {imprimindo ? 'Preparando…' : 'Imprimir'}
                    </button>
                    <button
                      type="button"
                      className={`barra-btn barra-btn-pdf${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                      onClick={() => void baixarPreview()}
                      disabled={exportando}
                    >
                      {documentosBloqueados() ? <Icone nome="cadeado" tam={13} /> : <Icone nome="download" tam={13} />}{' '}
                      {exportando ? 'Gerando PDF…' : 'Baixar PDF'}
                    </button>
                  </div>
                )}
              </div>

              {registroAberto && modoVisual === 'ficha' && (
                <div className="livro-visual-ficha">
                  <PreviaRegistro
                    dados={dadosDaEntrada(registroAberto.entrada)}
                    selo={
                      registroAberto.entrada.sha256
                        ? {
                            texto: `#${String(registroAberto.numero).padStart(6, '0')} · Lacrado`,
                            tom: 'lacrado',
                          }
                        : undefined
                    }
                  />
                </div>
              )}

              {/* O iframe da folha continua MONTADO mesmo na ficha, só
                  escondido: ele mede a altura do conteúdo no `onLoad`, e
                  desmontá-lo faria a medição recomeçar a cada troca de aba. */}
              <div
                style={{ padding: 16, display: modoVisual === 'a4' ? undefined : 'none' }}
                className="relatorio-preview"
              >
                {/* Recorte só VISUAL: encolhe a caixa da folha, nunca o documento (ver
                    medirFundoConteudo). Sem medição válida, fica a folha A4 inteira. */}
                <div
                  className="lrprev-recorte"
                  data-recortado={alturaRecorte ? '1' : undefined}
                  style={alturaRecorte ? ({ ['--lrprev-h' as string]: `${alturaRecorte}px` } as React.CSSProperties) : undefined}
                >
                  <PaginaA4>
                    <iframe
                      src={srcPreview}
                      scrolling="no"
                      title={preview.doc.titulo}
                      onLoad={(e) => {
                        const doc = e.currentTarget.contentDocument;
                        const medir = () => {
                          const fundo = medirFundoConteudo(doc);
                          // Conteúdo que preenche (ou passa de) a folha: nada a cortar.
                          if (fundo === null || fundo + FOLGA_RECORTE >= ALTURA_A4_PREVIEW) {
                            setAlturaRecorte(null);
                            return;
                          }
                          setAlturaRecorte(Math.ceil(fundo + FOLGA_RECORTE));
                        };
                        medir();
                        // As fontes carregam depois e mudam a altura do texto (mesma razão do
                        // IframeBlocoLivro) — re-mede.
                        setTimeout(medir, 700);
                      }}
                    />
                  </PaginaA4>
                </div>
              </div>
            </div>
          </div>
        )}

        {livroCompleto && (
          <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setLivroCompleto(false)}>
            <div className="fj-modal-box" style={{ maxWidth: 900 }}>
              <div className="fj-modal-head">
                <div>
                  <div className="fj-eyebrow">Livro de Registro completo — ordem cronológica</div>
                  <h2>{linhaAberta.tag}</h2>
                </div>
                <button type="button" className="fj-modal-close" onClick={() => setLivroCompleto(false)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
                <button
                  type="button"
                  className={`barra-btn barra-btn-pdf${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                  onClick={() => void exportarLivroPdf()}
                  disabled={exportandoLivro}
                >
                  {documentosBloqueados() ? <Icone nome="cadeado" tam={13} /> : <Icone nome="download" tam={13} />}{' '}
                  {exportandoLivro ? 'Gerando PDF…' : 'Exportar PDF'}
                </button>
              </div>
              <div style={{ padding: 16, overflowX: 'auto' }}>
                {/* Documento único: capa, termo de abertura e todos os registros empilhados */}
                {palco.estado !== 'pronto' && <RecusaPalco estado={palco.estado} falha={palco.falha} />}
                <div style={{ width: 794, margin: '0 auto', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}>
                  {palco.estado === 'pronto' && urlsLivroCompleto(linhaAberta, palco.paramsIframe).map((url, i) => (
                    <IframeBlocoLivro key={url} src={url} titulo={`Bloco ${i + 1} do livro`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {modalOcorrencia && (
          <ModalNovoRegistro
            tag={linhaAberta.tag}
            equipamento={linhaAberta.nomeEquip}
            empresa={nomeEmpresaExecutante}
            abaInicial={abaModal}
            modo={form.retificaDe ? 'retificar' : editandoId ? 'editar' : 'novo'}
            form={form}
            aoMudarForm={setForm}
            relatorios={listarIndice(linhaAberta.tag).map((r) => ({
              id: r.id,
              rotulo: `${r.codigo || r.id} · ${r.tipo} · ${r.emissao || r.data}`,
            }))}
            assinantes={funcionarios.map((f) => ({
              id: f.id,
              rotulo: `${f.nome}${f.crea ? ` — ${f.crea}` : ''}`,
            }))}
            avisoRetificacao={
              form.retificaDe
                ? `Retifica o registro de ${
                    linhaAberta.entradas.find((e) => e.id === form.retificaDe)?.data ?? '—'
                  } — o registro lacrado permanece no livro; esta é uma entrada nova de correção.`
                : undefined
            }
            erro={erroForm}
            aoPreencherDeRelatorio={(id) => void preencherDeRelatorio(id)}
            aoSalvar={() => void salvarOcorrencia()}
            aoFechar={() => setModalOcorrencia(false)}
          />
        )}

        {trancando && (
          <ModalTrancarRegistro
            validacao={trancando.validacao}
            ocupado={trancandoOcupado}
            erro={erroTrancar}
            aoFechar={() => setTrancando(null)}
            aoConfirmar={() => void confirmarTrancamento()}
          />
        )}
      </div>
    );
  }

  /* ── Lista de equipamentos ── */
  return (
    <div className="dash-page">
      <div className="fj-panel">
        {/* Bloco de abertura: o mesmo `fj-panel-head` com filete âmbar das
            outras telas, com uma descrição curta e o chip de ícone que a tela
            de DENTRO já usa (capa/termo). */}
        {/* O parágrafo de quatro linhas virou o "i" ao lado do título: quem já
            conhece a sessão não precisa relê-lo a cada visita, e quem não
            conhece encontra a explicação onde a dúvida aparece. */}
        <div className="fj-panel-head reg-hero">
          <div className="reg-hero-txt">
            <div className="fj-eyebrow">NR-13 · 13.4.1.9</div>
            <h2>
              Registros de Segurança
              <PopoverAjuda rotulo="Como funcionam os Registros de Segurança">
                <b>O histórico de segurança de cada equipamento.</b>
                <span>
                  Reúne, em ordem cronológica, inspeções, manutenções, reparos e demais
                  ocorrências. Cada registro nasce como rascunho e, ao ser trancado, entra na
                  numeração do livro e passa a integrar a cadeia de integridade — deixa de poder
                  ser editado ou apagado.
                </span>
                <span>
                  Abra um equipamento para ler a linha do tempo, lançar um registro ou exportar o
                  documento completo.
                </span>
              </PopoverAjuda>
            </h2>
          </div>
          <span className="reg-hero-ic" aria-hidden>
            <Icone nome="shield" tam={26} />
          </span>
        </div>

        {/* A semeadura da TAG é uma ida à rede, e o clique precisa responder:
            sem isto, o usuário clica e a tela fica parada. */}
        {abrindo && (
          <div className="rel-rodape-carregando" role="status">
            Abrindo os registros…
          </div>
        )}
        <CatalogoLivroV9
          termo={termoBusca}
          aoMudarTermo={setTermoBusca}
          aoEscolher={(tag) => void abrirPorTag(tag)}
        />
      </div>
    </div>
  );
}
