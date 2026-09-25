import { jsPDF } from 'jspdf';
import { FAMILIA, registrarCarlito } from './carlito';
import { alturaLinha } from './documentoA4';
import { imagemEncaixada } from './primitivas';
import type { DadosCalibracaoInterna, LinhaResultado } from '../../calibracoes/tipos';

/**
 * Fase 7 · o CERTIFICADO INTERNO DE CALIBRAÇÃO em vetor.
 *
 * ## O que muda, e o que não muda
 *
 * Até aqui a emissão montava `CERTIFICADO-CAL-MANOMETRO.html` /
 * `CERTIIFCADO-CAL-PSV.html` num iframe fora da tela, fotografava a folha com
 * `html2canvas` (escala 2, JPEG 0,95) e colava a FOTO numa página A4: ~600 KB
 * por certificado, texto que não se seleciona nem se pesquisa, e um documento
 * preso a uma página só (a folha "apertava" a fonte até caber).
 *
 * Aqui a MESMA folha é desenhada direto no PDF: texto com Carlito embutida (a
 * fonte do relatório e do prontuário), tabelas e fios como linhas. Só três
 * coisas continuam raster, porque são raster na origem: a LOGO da empresa, a
 * RUBRICA do responsável e o SELO do Inmetro — cada uma embutida uma vez só,
 * no tamanho do quadro, sem esticar (`imagemEncaixada`).
 *
 * O CONTEÚDO não muda: seções, rótulos, textos fixos, marcadores de campo vazio
 * (`----`, `DD/MM/AAAA`) e a ordem são os do template. `modeloCertificado` é a
 * leitura do registro com as MESMAS regras do script de injeção dos dois
 * templates — é o contrato que o teste de paridade confere campo a campo.
 *
 * ## O que ele NÃO é
 *
 * - Não é o certificado do LABORATÓRIO (`origem: 'terceiro'`): aquele é PDF de
 *   origem e é servido byte a byte. Nada aqui o toca.
 * - Não regenera certificado EMITIDO: emitido abre sempre o `pdfRef`
 *   arquivado (§4-ter). Este gerador só roda na emissão NOVA e na prévia do
 *   rascunho.
 * - Não converte registro legado (sem `status`): esse continua pelo template,
 *   como sempre abriu.
 *
 * ## Paginação
 *
 * O template tinha uma página fixa e encolhia a fonte em três passos
 * (`aperto-1..3`) quando o texto não cabia — e, passado o último passo, o
 * rodapé saía cortado. Aqui o conteúdo QUEBRA de página: cabeçalho repetido,
 * tabela quebra por linha, e o rodapé é desenhado por último em toda folha.
 * Com mais de uma página sai "Página X de Y"; com uma, nada (o certificado de
 * uma folha nunca imprimiu número de página — revisão do engenheiro, 07/2026).
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** A empresa executante, como o template a lê de `nr13_minha_empresa`. */
export interface EmpresaCertificado {
  razao?: string;
  fantasia?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

export interface ResultadoLinha {
  vc: string;
  vi: string;
  erro: string;
}

export type ResultadosCertificado =
  | {
      tipo: 'manometro';
      /** O rótulo entre parênteses dos dois títulos: a unidade, ou `Kgf/cm²` do template. */
      unidade: string;
      crescente: ResultadoLinha[];
      incertezaC: string;
      coefC: string;
      decrescente: ResultadoLinha[];
      incertezaD: string;
      coefD: string;
    }
  | {
      tipo: 'psv';
      /** Sem unidade no registro, os rótulos saem sem parênteses (como o template). */
      unidade: string | null;
      abertura: string;
      ajuste: string;
      fechamento: string;
      incerteza: string;
      coef: string;
    };

export interface ModeloCertificado {
  tipo: 'manometro' | 'psv';
  titulo: string;
  numero: string;
  dataEmissao: string;
  cliente: { empresa: string; endereco: string };
  item: {
    instrumento: string;
    fabricante: string;
    modelo: string;
    serie: string;
    referencia: string;
    dataCalibracao: string;
    dataProxima: string;
  };
  procedimento: string;
  ambiente: { temperatura: string; umidade: string; local: string };
  padrao: { instrumento: string; serie: string; certificado: string; validade: string };
  rastreabilidade: string;
  resultados: ResultadosCertificado;
  definicoes: { termo: string; texto: string }[];
  conclusao: { status: 'APROVADO' | 'REPROVADO' | '--'; motivo: string };
  /** `null` = registro sem bloco de responsável (legado sem status). */
  responsavel: { nome: string; funcao: string; registro: string; falta: boolean } | null;
  rascunho: boolean;
  /** As linhas do rodapé (1 a 3), como o template as monta. */
  rodape: string[];
}

// ── Textos FIXOS do template (copiados, não reescritos) ─────────────────────

export const TITULOS = {
  manometro: 'CERTIFICADO DE CALIBRAÇÃO MANOMETRO',
  psv: 'CERTIFICADO DE CALIBRAÇÃO PSV',
} as const;

export const TEXTO_PROCEDIMENTO =
  'A calibração é realizada por comparação direta com o padrão de referência e a leitura do erro indicada no instrumento em calibração.';

export const TEXTO_RASTREABILIDADE =
  'O instrumento de medição padrão utilizado encontra-se calibrado por laboratório pertencente à RBC (Rede Brasileira de Calibração) ou acreditado pelo INMETRO, com certificado válido, garantindo a rastreabilidade metrológica e confiabilidade dos resultados de acordo com o Sistema Internacional de Unidades (SI).';

export const DEFINICOES = [
  { termo: 'Valor Convencional:', texto: 'refere-se à indicação no padrão utilizado.' },
  { termo: 'Valor Nominal:', texto: 'refere-se ao valor referenciado no instrumento sob calibração.' },
  {
    termo: 'Fator de abrangência k:',
    texto: 'corresponde, para uma distribuição normal, a uma probabilidade de abrangência de aproximadamente 95%.',
  },
  {
    termo: 'Incerteza da Medição:',
    texto:
      'é o parâmetro, associado ao resultado de uma medição, que caracteriza a dispersão dos valores que podem ser fundamentalmente atribuídos a um mensurando.',
  },
] as const;

export const TEXTO_CONCLUSAO_ANTES =
  'De acordo com os resultados obtidos na calibração, o equipamento no qual este relatório faz referência está';
export const TEXTO_CONCLUSAO_MEIO = ', pois durante o processo, o mesmo';

export const MARCA_RASCUNHO = 'RASCUNHO — NÃO EMITIDO';
export const ROTULO_RESPONSAVEL = 'RESPONSÁVEL PELA CALIBRAÇÃO';
export const RESPONSAVEL_FALTA = 'RESPONSÁVEL NÃO DEFINIDO';
/** O template sem `nr13_minha_empresa` mostrava um rodapé de EXEMPLO (CNPJ 00.000…); aqui não se inventa. */
export const EMPRESA_NAO_INFORMADA = 'NOME DA EMPRESA NÃO INFORMADO';

const VAZIO = '----';
const DATA_VAZIA = 'DD/MM/AAAA';

// ── Modelo: o registro lido com as regras do template ───────────────────────

/** `inj(id, val)` do template: só troca o marcador quando há valor. */
function v(valor: unknown, marcador = VAZIO): string {
  if (valor === null || valor === undefined || valor === '') return marcador;
  return String(valor);
}

/** O rodapé exatamente como os dois templates o montam. */
export function linhasRodape(dados: EmpresaCertificado | null | undefined): string[] {
  if (!dados) return [EMPRESA_NAO_INFORMADA];
  const linhas = [dados.razao || dados.fantasia || EMPRESA_NAO_INFORMADA];
  const l2: string[] = [];
  if (dados.endereco) l2.push(dados.endereco);
  if (dados.bairro) l2.push(dados.bairro);
  if (dados.cidade && dados.estado) l2.push(`${dados.cidade}/${dados.estado}`);
  if (dados.cnpj) l2.push(`CNPJ: ${dados.cnpj}`);
  if (dados.cep) l2.push(`CEP: ${dados.cep}`);
  if (l2.length) linhas.push(l2.join(' • '));
  const l3: string[] = [];
  if (dados.telefone) l3.push(`Telef: ${dados.telefone}`);
  if (dados.email) l3.push(`E-mail: ${dados.email}`);
  if (l3.length) linhas.push(l3.join(' • '));
  return linhas;
}

function linhas(lista: LinhaResultado[] | undefined): ResultadoLinha[] {
  const origem = Array.isArray(lista) ? lista : [];
  // O template tinha SEIS linhas fixas; menos dados = linhas com `----`. Mais
  // de seis nunca é descartado aqui (o template perdia a 7ª em silêncio).
  const n = Math.max(6, origem.length);
  return Array.from({ length: n }, (_, i) => ({
    vc: v(origem[i]?.vc),
    vi: v(origem[i]?.vi),
    erro: v(origem[i]?.erro),
  }));
}

/**
 * O CONTEÚDO do certificado. Pura: não lê storage, não baixa imagem.
 *
 * Cada campo segue a linha correspondente do script `calibId` dos templates —
 * inclusive o que parece estranho (`instrumento || nome`, `Kgf/cm²` quando não
 * há unidade, `--` cinza sem conclusão). Mudar isso seria redesenhar o
 * documento; esta fase só troca a tecnologia.
 */
export function modeloCertificado(
  c: DadosCalibracaoInterna,
  empresa: EmpresaCertificado | null | undefined,
): ModeloCertificado {
  const resultados: ResultadosCertificado =
    c.tipo === 'psv'
      ? {
          tipo: 'psv',
          unidade: c.unidade ? c.unidade : null,
          abertura: v(c.pressaoAbertura),
          ajuste: v(c.pressaoAjuste),
          fechamento: v(c.fechamento),
          incerteza: v(c.incerteza),
          coef: v(c.coef),
        }
      : {
          tipo: 'manometro',
          unidade: v(c.unidade, 'Kgf/cm²'),
          crescente: linhas(c.crescente),
          incertezaC: v(c.incertezaC),
          coefC: v(c.coefC),
          decrescente: linhas(c.decrescente),
          incertezaD: v(c.incertezaD),
          coefD: v(c.coefD),
        };

  const r = c.responsavel;
  const responsavel =
    !r && c.status !== 'rascunho'
      ? null
      : !r || !r.nome
        ? { nome: RESPONSAVEL_FALTA, funcao: '', registro: '', falta: true }
        : {
            nome: r.nome,
            funcao: r.funcao || '',
            registro: r.registro ? `Registro profissional: ${r.registro}` : '',
            falta: false,
          };

  return {
    tipo: c.tipo === 'psv' ? 'psv' : 'manometro',
    titulo: c.tipo === 'psv' ? TITULOS.psv : TITULOS.manometro,
    numero: v(c.numeroCertificado),
    dataEmissao: v(c.dataEmissao, DATA_VAZIA),
    cliente: { empresa: v(c.empresa), endereco: v(c.endereco) },
    item: {
      instrumento: v(c.instrumento || c.nome),
      fabricante: v(c.fabricante),
      modelo: v(c.modelo),
      serie: v(c.serie),
      referencia: v(c.referencia),
      dataCalibracao: v(c.dataCalibracao, DATA_VAZIA),
      dataProxima: v(c.dataProxCalibracao, DATA_VAZIA),
    },
    procedimento: TEXTO_PROCEDIMENTO,
    ambiente: { temperatura: v(c.tempAr), umidade: v(c.umidade), local: v(c.local) },
    padrao: {
      instrumento: v(c.padraoInst),
      serie: v(c.padraoSerie),
      certificado: v(c.padraoCert),
      validade: v(c.padraoVal, DATA_VAZIA),
    },
    rastreabilidade: TEXTO_RASTREABILIDADE,
    resultados,
    definicoes: DEFINICOES.map((d) => ({ ...d })),
    conclusao: c.statusConclusao
      ? { status: c.statusConclusao === 'aprovado' ? 'APROVADO' : 'REPROVADO', motivo: c.textoMotivo || '' }
      : { status: '--', motivo: '' },
    responsavel,
    rascunho: c.status === 'rascunho',
    rodape: linhasRodape(empresa),
  };
}

/**
 * O modelo achatado em `campo → valor` — a lista que a paridade semântica
 * compara (antigo × novo) e que o teste procura no texto extraído do PDF.
 */
export function camposSemanticos(m: ModeloCertificado): Record<string, string> {
  const out: Record<string, string> = {
    titulo: m.titulo,
    numero: m.numero,
    dataEmissao: m.dataEmissao,
    'cliente.empresa': m.cliente.empresa,
    'cliente.endereco': m.cliente.endereco,
    'item.instrumento': m.item.instrumento,
    'item.fabricante': m.item.fabricante,
    'item.modelo': m.item.modelo,
    'item.serie': m.item.serie,
    'item.referencia': m.item.referencia,
    'item.dataCalibracao': m.item.dataCalibracao,
    'item.dataProxima': m.item.dataProxima,
    'ambiente.temperatura': m.ambiente.temperatura,
    'ambiente.umidade': m.ambiente.umidade,
    'ambiente.local': m.ambiente.local,
    'padrao.instrumento': m.padrao.instrumento,
    'padrao.serie': m.padrao.serie,
    'padrao.certificado': m.padrao.certificado,
    'padrao.validade': m.padrao.validade,
    'conclusao.status': m.conclusao.status,
    'conclusao.motivo': m.conclusao.motivo,
  };
  const res = m.resultados;
  if (res.tipo === 'manometro') {
    out['resultados.unidade'] = res.unidade;
    res.crescente.forEach((l, i) => {
      out[`crescente.${i + 1}.vc`] = l.vc;
      out[`crescente.${i + 1}.vi`] = l.vi;
      out[`crescente.${i + 1}.erro`] = l.erro;
    });
    res.decrescente.forEach((l, i) => {
      out[`decrescente.${i + 1}.vc`] = l.vc;
      out[`decrescente.${i + 1}.vi`] = l.vi;
      out[`decrescente.${i + 1}.erro`] = l.erro;
    });
    out['resultados.incertezaC'] = res.incertezaC;
    out['resultados.coefC'] = res.coefC;
    out['resultados.incertezaD'] = res.incertezaD;
    out['resultados.coefD'] = res.coefD;
  } else {
    out['resultados.unidade'] = res.unidade ?? '';
    out['resultados.abertura'] = res.abertura;
    out['resultados.ajuste'] = res.ajuste;
    out['resultados.fechamento'] = res.fechamento;
    out['resultados.incerteza'] = res.incerteza;
    out['resultados.coef'] = res.coef;
  }
  if (m.responsavel) {
    out['responsavel.nome'] = m.responsavel.nome;
    out['responsavel.funcao'] = m.responsavel.funcao;
    out['responsavel.registro'] = m.responsavel.registro;
  }
  m.rodape.forEach((l, i) => (out[`rodape.${i + 1}`] = l));
  return out;
}

// ── Geometria (mm) — a do CSS dos templates, convertida (1px = 0,2646 mm) ────

const PX = 25.4 / 96;
/** Tamanho de fonte CSS (px) em pt, a unidade do jsPDF. */
const pt = (px: number) => px * 0.75;

const FOLHA = { largura: 210, altura: 297 } as const;
const MARGEM_X = 15;
const LARGURA = FOLHA.largura - 2 * MARGEM_X;
/** `.page { padding-top: 15mm }` — 10mm quando o bloco do responsável existe (`body.com-resp`). */
const TOPO = { normal: 15, comResponsavel: 10 } as const;
/** `.pgr-footer-new { bottom: 12mm }`. */
const RODAPE_BAIXO = 12;
/** A folga mínima entre o último conteúdo e o rodapé (`caberNaFolha`: 6 mm). */
const FOLGA_RODAPE = 6;
const ENTRELINHA = 1.3;

export const COR_CERT = {
  texto: '#111827',
  valor: '#0033a2',
  fundoSecao: '#eff0f1',
  bordaSecao: '#f1f1f1',
  bordaTabela: '#000000',
  gradeTabela: '#eaeef2',
  fundoTituloResultado: '#e5e7eb',
  bordaPadrao: '#d1d5db',
  rotuloPadrao: '#6b7280',
  bordaBloco: '#bfbfbf',
  aprovado: '#008000',
  reprovado: '#ff0000',
  semConclusao: '#9ca3af',
  falta: '#b91c1c',
  rotuloResponsavel: '#374151',
  // `rgba(185, 28, 28, .16)` do template: a cor aqui, a opacidade no GState.
  rascunho: '#b91c1c',
} as const;

const F = {
  corpo: pt(11),
  rotulo: pt(9),
  titulo: pt(14),
  infoRotulo: pt(10),
  infoValor: pt(12),
  secao: pt(11),
  nota: pt(9),
  respNome: pt(10),
  resp: pt(9),
  respRotulo: pt(8.5),
  rodape: pt(11),
  rascunho: pt(46),
  pagina: pt(9),
} as const;

const passo = (tamanho: number, fator = ENTRELINHA) => alturaLinha(tamanho, fator);

// ── Texto rico: trechos com peso e cor, quebrados por palavra ───────────────

export interface Trecho {
  texto: string;
  negrito?: boolean;
  cor?: string;
}

interface LinhaRica {
  trechos: Trecho[];
  largura: number;
}

function medir(pdf: jsPDF, t: string, negrito: boolean, tamanho: number): number {
  pdf.setFont(FAMILIA, negrito ? 'bold' : 'normal');
  pdf.setFontSize(tamanho);
  return pdf.getTextWidth(t);
}

/**
 * Quebra trechos numa largura, palavra por palavra — mantendo o negrito e a
 * cor de cada pedaço. Palavra maior que a linha (nº de série sem espaço) é
 * cortada por caractere: nada pode passar da borda da célula.
 */
export function quebrarRico(pdf: jsPDF, trechos: Trecho[], largura: number, tamanho: number): LinhaRica[] {
  const saida: LinhaRica[] = [];
  let atual: Trecho[] = [];
  let larguraAtual = 0;
  const fechar = () => {
    // Espaço no fim da linha não ocupa lugar.
    const ult = atual[atual.length - 1];
    if (ult && /\s$/.test(ult.texto)) {
      const aparado = ult.texto.replace(/\s+$/, '');
      larguraAtual -= medir(pdf, ult.texto, !!ult.negrito, tamanho) - medir(pdf, aparado, !!ult.negrito, tamanho);
      ult.texto = aparado;
    }
    saida.push({ trechos: atual.filter((t) => t.texto !== ''), largura: larguraAtual });
    atual = [];
    larguraAtual = 0;
  };
  const acrescentar = (t: Trecho, texto: string, w: number) => {
    const ult = atual[atual.length - 1];
    if (ult && ult.negrito === t.negrito && ult.cor === t.cor) ult.texto += texto;
    else atual.push({ texto, negrito: t.negrito, cor: t.cor });
    larguraAtual += w;
  };

  for (const t of trechos) {
    const partes = t.texto.split('\n');
    partes.forEach((parte, idxParte) => {
      if (idxParte > 0) fechar();
      // Palavras COM o espaço que as segue: "a b" → ["a ", "b"].
      const palavras = parte.match(/\S+\s*|\s+/g) ?? [];
      for (const palavra of palavras) {
        const w = medir(pdf, palavra, !!t.negrito, tamanho);
        const semEspaco = palavra.replace(/\s+$/, '');
        const wSem = medir(pdf, semEspaco, !!t.negrito, tamanho);
        if (larguraAtual + wSem <= largura + 0.01) {
          acrescentar(t, palavra, w);
          continue;
        }
        if (larguraAtual > 0 && /^\s+$/.test(palavra)) continue;
        if (larguraAtual > 0) fechar();
        if (wSem <= largura) {
          acrescentar(t, palavra.replace(/^\s+/, ''), medir(pdf, palavra.replace(/^\s+/, ''), !!t.negrito, tamanho));
          continue;
        }
        // Palavra maior que a linha: corta por caractere.
        let pedaco = '';
        for (const ch of semEspaco) {
          if (medir(pdf, pedaco + ch, !!t.negrito, tamanho) > largura && pedaco) {
            acrescentar(t, pedaco, medir(pdf, pedaco, !!t.negrito, tamanho));
            fechar();
            pedaco = '';
          }
          pedaco += ch;
        }
        if (pedaco) acrescentar(t, pedaco + (palavra.length > semEspaco.length ? ' ' : ''), medir(pdf, pedaco + ' ', !!t.negrito, tamanho));
      }
    });
  }
  if (atual.length || saida.length === 0) fechar();
  return saida;
}

function desenharLinhaRica(
  pdf: jsPDF,
  linha: LinhaRica,
  x: number,
  linhaBase: number,
  tamanho: number,
  alinhamento: 'left' | 'center',
  largura: number,
  corPadrao: string,
): void {
  let cx = alinhamento === 'center' ? x + (largura - linha.largura) / 2 : x;
  for (const t of linha.trechos) {
    pdf.setFont(FAMILIA, t.negrito ? 'bold' : 'normal');
    pdf.setFontSize(tamanho);
    pdf.setTextColor(t.cor ?? corPadrao);
    pdf.text(t.texto, cx, linhaBase);
    cx += pdf.getTextWidth(t.texto);
  }
}

// ── O desenhista: cursor, quebra de página, cabeçalho repetido ──────────────

export interface ImagensCertificado {
  /** dataURL PNG/JPEG da logo da executante — ou `null` (sem logo). */
  logo: string | null;
  /** dataURL PNG/JPEG da rubrica do responsável — ou `null` (sai só nome/registro). */
  rubrica: string | null;
  /** dataURL PNG/JPEG do selo do Inmetro da seção 5 — ou `null`. */
  selo: string | null;
}

/** O que o desenho mediu — para os testes de geometria (nada sai do papel). */
export interface GeometriaCertificado {
  paginas: number;
  /** Onde o conteúdo pode terminar (acima do rodapé, com a folga do template). */
  limiteConteudo: number;
  /** Topo do fio do rodapé. */
  topoRodape: number;
  /** Por página: o fundo do último bloco desenhado. */
  fundoConteudo: number[];
  /** O bloco do responsável: página e caixa. */
  responsavel: { pagina: number; x: number; y: number; largura: number; altura: number } | null;
  /** A conclusão (texto), por página em que aparece. */
  conclusao: { pagina: number; y: number; fim: number; x: number; largura: number }[];
}

interface Celula {
  paragrafos: { trechos: Trecho[]; tamanho: number; alinhamento?: 'left' | 'center'; cor?: string; depois?: number }[];
  colspan?: number;
  fundo?: string;
  alinhamento?: 'left' | 'center';
  /** Imagem à esquerda do texto (selo do Inmetro), com a altura em mm. */
  imagem?: { dataUrl: string | null; altura: number; largura: number };
  pad?: { x: number; y: number };
  borda?: string;
}

interface LinhaTabela {
  celulas: Celula[];
  /** Repetida no alto da folha quando a tabela quebra. */
  cabecalho?: boolean;
}

class Desenhista {
  readonly pdf: jsPDF;
  private readonly m: ModeloCertificado;
  private readonly img: ImagensCertificado;
  readonly limite: number;
  readonly topoRodape: number;
  private readonly topo: number;
  y = 0;
  pagina = 0;
  readonly fundo: number[] = [];
  resp: GeometriaCertificado['responsavel'] = null;
  readonly conclusao: GeometriaCertificado['conclusao'] = [];

  constructor(pdf: jsPDF, m: ModeloCertificado, img: ImagensCertificado) {
    this.pdf = pdf;
    this.m = m;
    this.img = img;
    this.topo = m.responsavel ? TOPO.comResponsavel : TOPO.normal;
    this.topoRodape = FOLHA.altura - RODAPE_BAIXO - alturaRodape(m.rodape.length);
    this.limite = this.topoRodape - FOLGA_RODAPE;
  }

  get restante(): number {
    return this.limite - this.y;
  }

  novaPagina(): void {
    if (this.pagina > 0) {
      this.fundo[this.pagina - 1] = Math.max(this.fundo[this.pagina - 1] ?? 0, this.y);
      this.pdf.addPage();
    }
    this.pagina++;
    this.y = this.topo;
    this.cabecalho();
  }

  /** Cabe? Senão, folha nova. `altura` maior que a folha inteira não força folha em branco. */
  garantir(altura: number): void {
    if (this.y + altura <= this.limite) return;
    if (this.y <= this.topo + ALTURA_CABECALHO + 0.01) return;
    this.novaPagina();
  }

  marcarFundo(): void {
    this.fundo[this.pagina - 1] = Math.max(this.fundo[this.pagina - 1] ?? 0, this.y);
  }

  /** `.header-table`: logo | título | nº e data — em toda folha. */
  private cabecalho(): void {
    const { pdf, m } = this;
    const x = MARGEM_X;
    const y = this.y;
    const larg = [LARGURA * 0.25, LARGURA * 0.5, LARGURA * 0.25];
    const alt = ALTURA_CABECALHO - MARGEM_CABECALHO;
    pdf.setDrawColor(COR_CERT.texto);
    pdf.setLineWidth(PX);
    let cx = x;
    for (const w of larg) {
      pdf.rect(cx, y, w, alt);
      cx += w;
    }
    // Logo: quadro de 75px de altura máxima dentro da célula, centralizada.
    if (this.img.logo) {
      const padX = 8 * PX;
      const altLogo = Math.min(75 * PX, alt - 8 * PX);
      imagemEncaixada(pdf, this.img.logo, { x: x + padX, y: y + (alt - altLogo) / 2, largura: larg[0] - 2 * padX, altura: altLogo });
    }
    // Título: 14px, negrito, maiúsculas, centralizado.
    const linhasTitulo = quebrarRico(pdf, [{ texto: m.titulo, negrito: true }], larg[1] - 16 * PX, F.titulo);
    const altTitulo = linhasTitulo.length * passo(F.titulo, 1.2);
    let base = y + (alt - altTitulo) / 2 + passo(F.titulo, 1.2) * 0.78;
    for (const l of linhasTitulo) {
      desenharLinhaRica(pdf, l, x + larg[0] + 8 * PX, base, F.titulo, 'center', larg[1] - 16 * PX, COR_CERT.texto);
      base += passo(F.titulo, 1.2);
    }
    // Nº e data de emissão.
    const xi = x + larg[0] + larg[1] + 15 * PX;
    const wi = larg[2] - 15 * PX - 8 * PX;
    // `.info-label` (10px) · `.info-value` (12px, negrito, azul, margem 2px
    // acima e 4px abaixo) — duas vezes, centralizados na altura da célula.
    const blocos: { t: string; tam: number; neg: boolean; cor: string; antes: number; depois: number }[] = [
      { t: 'Certificado nº.', tam: F.infoRotulo, neg: false, cor: COR_CERT.texto, antes: 0, depois: 0 },
      { t: m.numero, tam: F.infoValor, neg: true, cor: COR_CERT.valor, antes: 2 * PX, depois: 4 * PX },
      { t: 'Data de Emissão:', tam: F.infoRotulo, neg: false, cor: COR_CERT.texto, antes: 0, depois: 0 },
      { t: m.dataEmissao, tam: F.infoValor, neg: true, cor: COR_CERT.valor, antes: 2 * PX, depois: 0 },
    ];
    const altInfo = blocos.reduce((s, b) => s + b.antes + passo(b.tam) + b.depois, 0);
    let yi = y + (alt - altInfo) / 2;
    for (const b of blocos) {
      yi += b.antes;
      pdf.setFont(FAMILIA, b.neg ? 'bold' : 'normal');
      pdf.setFontSize(b.tam);
      pdf.setTextColor(b.cor);
      // Uma linha só, como a célula do template: nº longo encolhe até caber.
      let tam = b.tam;
      while (tam > 5 && pdf.getTextWidth(b.t) > wi) pdf.setFontSize((tam -= 0.25));
      pdf.text(b.t, xi, yi + passo(b.tam) * 0.78);
      yi += passo(b.tam) + b.depois;
    }
    this.y = y + ALTURA_CABECALHO;
  }

  /** `.section-title`. */
  secao(texto: string, largura = LARGURA, x = MARGEM_X, espacoAntes = 4 * PX): number {
    const { pdf } = this;
    const alt = passo(F.secao) + 2 * 3 * PX;
    const y = this.y + espacoAntes;
    pdf.setFillColor(COR_CERT.fundoSecao);
    pdf.setDrawColor(COR_CERT.bordaSecao);
    pdf.setLineWidth(PX);
    pdf.rect(x, y, largura, alt, 'FD');
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(F.secao);
    pdf.setTextColor(COR_CERT.texto);
    pdf.text(texto.toUpperCase(), x + 6 * PX, y + 3 * PX + passo(F.secao) * 0.78);
    return y + alt + 2 * PX;
  }

  alturaSecao(espacoAntes = 4 * PX): number {
    return espacoAntes + passo(F.secao) + 2 * 3 * PX + 2 * PX;
  }

  // ── Tabela: mede, quebra por linha, repete o cabeçalho ──

  private alturaCelula(c: Celula, largura: number): number {
    const pad = c.pad ?? { x: 4 * PX, y: 2 * PX };
    let alt = 0;
    const larguraTexto = largura - 2 * pad.x - (c.imagem ? c.imagem.largura + 8 * PX : 0);
    for (const p of c.paragrafos) {
      alt += quebrarRico(this.pdf, p.trechos, larguraTexto, p.tamanho).length * passo(p.tamanho) + (p.depois ?? 0);
    }
    if (c.imagem) alt = Math.max(alt, c.imagem.altura);
    return alt + 2 * pad.y;
  }

  alturaLinha(l: LinhaTabela, larguras: number[]): number {
    let i = 0;
    let alt = 0;
    for (const c of l.celulas) {
      const span = c.colspan ?? 1;
      const w = larguras.slice(i, i + span).reduce((a, b) => a + b, 0);
      alt = Math.max(alt, this.alturaCelula(c, w));
      i += span;
    }
    return alt;
  }

  private desenharCelula(c: Celula, x: number, y: number, largura: number, altura: number, grade: string): void {
    const { pdf } = this;
    const pad = c.pad ?? { x: 4 * PX, y: 2 * PX };
    pdf.setLineWidth(PX);
    pdf.setDrawColor(c.borda ?? grade);
    pdf.setFillColor(c.fundo ?? '#ffffff');
    pdf.rect(x, y, largura, altura, 'FD');
    let xt = x + pad.x;
    let larguraTexto = largura - 2 * pad.x;
    if (c.imagem) {
      if (c.imagem.dataUrl) {
        imagemEncaixada(pdf, c.imagem.dataUrl, { x: xt, y: y + (altura - c.imagem.altura) / 2, largura: c.imagem.largura, altura: c.imagem.altura });
      }
      xt += c.imagem.largura + 8 * PX;
      larguraTexto -= c.imagem.largura + 8 * PX;
    }
    // Conteúdo centralizado na vertical (`vertical-align: middle`), salvo
    // quando a célula tem rótulo + valor empilhados (seção 5: `vertical-align: top`).
    const altTexto = this.alturaTextoCelula(c, larguraTexto);
    let yt = c.paragrafos.length > 1 ? y + pad.y : y + (altura - altTexto) / 2;
    for (const p of c.paragrafos) {
      const al = p.alinhamento ?? c.alinhamento ?? 'center';
      for (const l of quebrarRico(pdf, p.trechos, larguraTexto, p.tamanho)) {
        desenharLinhaRica(pdf, l, xt, yt + passo(p.tamanho) * 0.78, p.tamanho, al, larguraTexto, p.cor ?? COR_CERT.texto);
        yt += passo(p.tamanho);
      }
      yt += p.depois ?? 0;
    }
  }

  private alturaTextoCelula(c: Celula, larguraTexto: number): number {
    let alt = 0;
    for (const p of c.paragrafos) {
      alt += quebrarRico(this.pdf, p.trechos, larguraTexto, p.tamanho).length * passo(p.tamanho) + (p.depois ?? 0);
    }
    return alt;
  }

  /**
   * Uma tabela (ou várias LADO A LADO, como as duas de resultados do
   * manômetro): `blocos` são as faixas de colunas que ganham a borda externa
   * preta do `.content-table`; o vão entre elas é coluna sem desenho.
   */
  tabela(opcoes: {
    colunas: number[];
    linhas: LinhaTabela[];
    x?: number;
    blocos?: [number, number][];
    vaos?: number[];
    grade?: string;
    bordaExterna?: string;
    depois?: number;
  }): void {
    const { pdf } = this;
    const x0 = opcoes.x ?? MARGEM_X;
    const larguras = opcoes.colunas;
    const grade = opcoes.grade ?? COR_CERT.gradeTabela;
    const blocos = opcoes.blocos ?? [[0, larguras.length - 1]];
    const vaos = new Set(opcoes.vaos ?? []);
    const cabecalhos = opcoes.linhas.filter((l) => l.cabecalho);
    let inicioSegmento = this.y;

    const fecharSegmento = () => {
      pdf.setDrawColor(opcoes.bordaExterna ?? COR_CERT.bordaTabela);
      pdf.setLineWidth(PX);
      for (const [a, b] of blocos) {
        const xa = x0 + larguras.slice(0, a).reduce((s, w) => s + w, 0);
        const w = larguras.slice(a, b + 1).reduce((s, v2) => s + v2, 0);
        pdf.rect(xa, inicioSegmento, w, this.y - inicioSegmento);
      }
    };

    const desenharLinha = (l: LinhaTabela) => {
      const alt = this.alturaLinha(l, larguras);
      let x = x0;
      let i = 0;
      for (const c of l.celulas) {
        const span = c.colspan ?? 1;
        const w = larguras.slice(i, i + span).reduce((a, b) => a + b, 0);
        if (!vaos.has(i)) this.desenharCelula(c, x, this.y, w, alt, grade);
        x += w;
        i += span;
      }
      this.y += alt;
    };

    // Não começa a tabela no pé da folha: cabeçalho + 1ª linha de dados juntos.
    const primeiraDados = opcoes.linhas.find((l) => !l.cabecalho);
    const minimo =
      cabecalhos.reduce((s, l) => s + this.alturaLinha(l, larguras), 0) +
      (primeiraDados ? this.alturaLinha(primeiraDados, larguras) : 0);
    this.garantir(minimo);
    inicioSegmento = this.y;

    for (const l of opcoes.linhas) {
      const alt = this.alturaLinha(l, larguras);
      if (!l.cabecalho && this.y + alt > this.limite && this.y > inicioSegmento + 0.01) {
        fecharSegmento();
        this.novaPagina();
        inicioSegmento = this.y;
        for (const c of cabecalhos) desenharLinha(c);
      }
      desenharLinha(l);
    }
    fecharSegmento();
    this.y += opcoes.depois ?? 6 * PX;
    this.marcarFundo();
  }

  /** `.text-block`: caixa com borda cinza, texto rico que quebra de página. */
  bloco(
    paragrafos: { trechos: Trecho[]; marcador?: boolean }[],
    opcoes: { x?: number; largura?: number; tamanho?: number; depois?: number; registrar?: boolean } = {},
  ): void {
    const { pdf } = this;
    const x = opcoes.x ?? MARGEM_X;
    const largura = opcoes.largura ?? LARGURA;
    const tam = opcoes.tamanho ?? F.corpo;
    const pad = { x: 6 * PX, y: 4 * PX };
    const recuo = 15 * PX;
    const linhasTodas: { linha: LinhaRica; marcador: boolean; recuo: number }[] = [];
    for (const p of paragrafos) {
      const r = p.marcador ? recuo : 0;
      const ls = quebrarRico(pdf, p.trechos, largura - 2 * pad.x - r, tam);
      ls.forEach((l, i) => linhasTodas.push({ linha: l, marcador: !!p.marcador && i === 0, recuo: r }));
    }
    const h = passo(tam);
    this.garantir(Math.min(linhasTodas.length, 2) * h + 2 * pad.y);
    let i = 0;
    while (i < linhasTodas.length) {
      const cabem = Math.max(1, Math.floor((this.limite - this.y - 2 * pad.y + 0.01) / h));
      const fatia = linhasTodas.slice(i, i + cabem);
      const alt = fatia.length * h + 2 * pad.y;
      pdf.setDrawColor(COR_CERT.bordaBloco);
      pdf.setLineWidth(PX);
      pdf.rect(x, this.y, largura, alt);
      let base = this.y + pad.y + h * 0.78;
      for (const f of fatia) {
        if (f.marcador) {
          pdf.setFillColor(COR_CERT.texto);
          pdf.circle(x + pad.x + f.recuo - 2.2, base - h * 0.28, 0.45, 'F');
        }
        desenharLinhaRica(pdf, f.linha, x + pad.x + f.recuo, base, tam, 'left', largura - 2 * pad.x - f.recuo, COR_CERT.texto);
        base += h;
      }
      if (opcoes.registrar) this.conclusao.push({ pagina: this.pagina, y: this.y, fim: this.y + alt, x, largura });
      this.y += alt;
      this.marcarFundo();
      i += fatia.length;
      if (i < linhasTodas.length) this.novaPagina();
    }
    this.y += opcoes.depois ?? 4 * PX;
  }

  // ── Responsável: rubrica, fio, nome, função, registro, rótulo ──

  alturaResponsavel(): number {
    const r = this.m.responsavel;
    if (!r) return 0;
    let alt = 11 + 2 * PX + passo(F.respNome, 1.25);
    if (r.funcao) alt += passo(F.resp, 1.25);
    if (r.registro) alt += passo(F.resp, 1.25);
    alt += passo(F.respRotulo, 1.25);
    return alt;
  }

  responsavel(x: number, y: number, largura: number): void {
    const { pdf } = this;
    const r = this.m.responsavel;
    if (!r) return;
    const altRubrica = 11;
    if (this.img.rubrica && !r.falta) {
      imagemEncaixada(pdf, this.img.rubrica, { x: x + (largura - Math.min(60, largura)) / 2, y, largura: Math.min(60, largura), altura: altRubrica });
    }
    let yy = y + altRubrica;
    pdf.setDrawColor('#000000');
    pdf.setLineWidth(PX);
    pdf.line(x, yy, x + largura, yy);
    yy += 2 * PX;
    const linha = (t: string, tam: number, negrito: boolean, cor: string) => {
      pdf.setFont(FAMILIA, negrito ? 'bold' : 'normal');
      pdf.setFontSize(tam);
      pdf.setTextColor(cor);
      const txt = (pdf.splitTextToSize(t, largura) as string[]).join(' ');
      const ls = pdf.splitTextToSize(txt, largura) as string[];
      for (const l of ls.slice(0, 1)) pdf.text(l, x + largura / 2, yy + passo(tam, 1.25) * 0.78, { align: 'center' });
      yy += passo(tam, 1.25);
    };
    linha(r.nome, F.respNome, true, r.falta ? COR_CERT.falta : COR_CERT.texto);
    if (r.funcao) linha(r.funcao, F.resp, false, COR_CERT.texto);
    if (r.registro) linha(r.registro, F.resp, false, COR_CERT.texto);
    linha(ROTULO_RESPONSAVEL, F.respRotulo, true, COR_CERT.rotuloResponsavel);
    this.resp = { pagina: this.pagina, x, y, largura, altura: yy - y };
  }

  /** Rodapé em toda folha: fio de 3px, as linhas da empresa, e "Página X de Y" quando há mais de uma. */
  rodapes(): void {
    const { pdf, m } = this;
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      const y = this.topoRodape;
      pdf.setDrawColor('#000000');
      pdf.setLineWidth(3 * PX);
      pdf.line(MARGEM_X, y + 1.5 * PX, MARGEM_X + LARGURA, y + 1.5 * PX);
      let yy = y + 3 * PX + 8 * PX;
      m.rodape.forEach((l, i) => {
        pdf.setFont(FAMILIA, i === 0 ? 'bold' : 'normal');
        pdf.setFontSize(F.rodape);
        pdf.setTextColor('#000000');
        const ls = pdf.splitTextToSize(l, LARGURA) as string[];
        pdf.text(ls[0] ?? '', MARGEM_X + LARGURA / 2, yy + passo(F.rodape, 1.4) * 0.78, { align: 'center' });
        yy += passo(F.rodape, 1.4);
      });
      if (m.rascunho) this.marcaRascunho();
      if (total > 1) {
        pdf.setFont(FAMILIA, 'normal');
        pdf.setFontSize(F.pagina);
        pdf.setTextColor(COR_CERT.texto);
        pdf.text(`Página ${p} de ${total}`, MARGEM_X + LARGURA, FOLHA.altura - RODAPE_BAIXO + passo(F.pagina) * 0.9, { align: 'right' });
      }
    }
  }

  /** A marca d'água do rascunho (`.cal-rascunho`): só na prévia, nunca no emitido. */
  private marcaRascunho(): void {
    const { pdf } = this;
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(F.rascunho);
    pdf.setTextColor(COR_CERT.rascunho);
    // POR CIMA do conteúdo e translúcida, como a camada do template: por baixo,
    // o fundo branco das células a apagaria; opaca, taparia um valor.
    const gs = pdf as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void };
    gs.setGState(new gs.GState({ opacity: 0.16 }));
    const w = pdf.getTextWidth(MARCA_RASCUNHO);
    const ang = (24 * Math.PI) / 180;
    const cx = FOLHA.largura / 2;
    const cy = 118 + 8;
    pdf.text(MARCA_RASCUNHO, cx - (w / 2) * Math.cos(ang), cy + (w / 2) * Math.sin(ang), { angle: 24 });
    gs.setGState(new gs.GState({ opacity: 1 }));
  }
}

/** `.header-table` + `margin-bottom: 8px`. */
const MARGEM_CABECALHO = 8 * PX;
const ALTURA_CABECALHO = 75 * PX + 2 * 4 * PX + 2 * PX + MARGEM_CABECALHO;

function alturaRodape(linhas: number): number {
  return 3 * PX + 8 * PX + Math.max(1, linhas) * passo(F.rodape, 1.4);
}

// ── As seções ───────────────────────────────────────────────────────────────

function rotulo(t: string): Celula {
  return { paragrafos: [{ trechos: [{ texto: t.toUpperCase(), negrito: true }], tamanho: F.rotulo }] };
}
function valor(t: string, colspan?: number): Celula {
  return { paragrafos: [{ trechos: [{ texto: t }], tamanho: F.corpo, cor: COR_CERT.valor }], colspan };
}

function desenhar(d: Desenhista, m: ModeloCertificado, img: ImagensCertificado): void {
  d.novaPagina();

  // 1. Cliente
  d.garantir(d.alturaSecao() + 12);
  d.y = d.secao('1. DADOS DO CLIENTE / SOLICITANTE');
  d.tabela({
    colunas: [LARGURA * 0.35, LARGURA * 0.65],
    linhas: [
      { celulas: [rotulo('EMPRESA'), rotulo('ENDEREÇO')], cabecalho: true },
      { celulas: [valor(m.cliente.empresa), valor(m.cliente.endereco)] },
    ],
  });

  // 2. Item calibrado
  d.garantir(d.alturaSecao() + 12);
  d.y = d.secao('2. DADOS DO ITEM CALIBRADO');
  const c5 = [0.25, 0.2, 0.15, 0.2, 0.2].map((f) => f * LARGURA);
  d.tabela({
    colunas: c5,
    linhas: [
      {
        celulas: [rotulo('INSTRUMENTO'), rotulo('FABRICANTE'), rotulo('MODELO'), rotulo('LOTE / SÉRIE'), rotulo('REFERÊNCIA')],
        cabecalho: true,
      },
      {
        celulas: [
          valor(m.item.instrumento),
          valor(m.item.fabricante),
          valor(m.item.modelo),
          valor(m.item.serie),
          valor(m.item.referencia),
        ],
      },
      { celulas: [{ ...rotulo('DATA DA CALIBRAÇÃO'), colspan: 3 }, { ...rotulo('DATA DA PRÓXIMA CALIBRAÇÃO'), colspan: 2 }] },
      { celulas: [valor(m.item.dataCalibracao, 3), valor(m.item.dataProxima, 2)] },
    ],
  });

  // 3 e 4, lado a lado (`display:flex; gap:10px`).
  {
    const vao = 10 * PX;
    const meia = (LARGURA - vao) / 2;
    const larguraTextoProc = meia - 2 * 6 * PX;
    const altProc =
      quebrarRico(d.pdf, [{ texto: m.procedimento }], larguraTextoProc, F.corpo).length * passo(F.corpo) + 2 * 4 * PX;
    const tabAmb: LinhaTabela[] = [
      { celulas: [rotulo('TEMPERATURA DO AR'), rotulo('UMIDADE RELATIVA'), rotulo('LOCAL')], cabecalho: true },
      { celulas: [valor(m.ambiente.temperatura), valor(m.ambiente.umidade), valor(m.ambiente.local)] },
    ];
    const colAmb = [meia / 3, meia / 3, meia / 3];
    const altAmb = tabAmb.reduce((s, l) => s + d.alturaLinha(l, colAmb), 0);
    // As duas colunas têm a mesma altura (`height: calc(100% - 22px)`): a da
    // maior. A tabela do ambiente estica pela linha de valores.
    const alt = Math.max(altAmb, altProc);
    if (alt > altAmb + 0.01) {
      const extra = alt - altAmb;
      tabAmb[1] = { celulas: tabAmb[1].celulas.map((c) => ({ ...c, pad: { x: 4 * PX, y: 2 * PX + extra / 2 } })) };
    }
    d.garantir(d.alturaSecao(0) + alt);
    const y0 = d.y;
    const yTitulo = d.secao('3. PROCEDIMENTO DE CALIBRAÇÃO', meia, MARGEM_X, 0);
    d.y = y0;
    d.secao('4. CONDIÇÕES AMBIENTAIS', meia, MARGEM_X + meia + vao, 0);
    d.y = yTitulo;
    const antes = d.y;
    d.tabela({ colunas: colAmb, linhas: tabAmb, x: MARGEM_X + meia + vao, depois: 0 });
    // Procedimento: caixa da mesma altura.
    d.pdf.setDrawColor(COR_CERT.bordaBloco);
    d.pdf.setLineWidth(PX);
    d.pdf.rect(MARGEM_X, antes, meia, alt);
    let base = antes + 4 * PX + passo(F.corpo) * 0.78;
    for (const l of quebrarRico(d.pdf, [{ texto: m.procedimento }], larguraTextoProc, F.corpo)) {
      desenharLinhaRica(d.pdf, l, MARGEM_X + 6 * PX, base, F.corpo, 'left', larguraTextoProc, COR_CERT.texto);
      base += passo(F.corpo);
    }
    d.y = antes + alt + 6 * PX;
    d.marcarFundo();
  }

  // 5. Padrões e rastreabilidade
  d.garantir(d.alturaSecao() + 24);
  d.y = d.secao('5. PADRÕES UTILIZADOS E RASTREABILIDADE METROLÓGICA');
  const padrao = (r: string, val: string): Celula => ({
    paragrafos: [
      { trechos: [{ texto: r.toUpperCase(), negrito: true }], tamanho: F.nota, cor: COR_CERT.rotuloPadrao, depois: 2 * PX, alinhamento: 'left' },
      { trechos: [{ texto: val }], tamanho: F.corpo, cor: COR_CERT.valor, alinhamento: 'left' },
    ],
    pad: { x: 6 * PX, y: 4 * PX },
    borda: COR_CERT.bordaPadrao,
  });
  d.tabela({
    colunas: [0.25, 0.25, 0.25, 0.25].map((f) => f * LARGURA),
    grade: COR_CERT.bordaPadrao,
    bordaExterna: COR_CERT.bordaPadrao,
    linhas: [
      {
        celulas: [
          padrao('INSTRUMENTO PADRÃO', m.padrao.instrumento),
          padrao('Nº SÉRIE', m.padrao.serie),
          padrao('Nº CERTIFICADO', m.padrao.certificado),
          padrao('VALIDADE', m.padrao.validade),
        ],
      },
      {
        celulas: [
          {
            colspan: 4,
            alinhamento: 'left',
            pad: { x: 4 * PX, y: 4 * PX },
            imagem: { dataUrl: img.selo, altura: 30 * PX, largura: 30 * PX * 1.6 },
            paragrafos: [{ trechos: [{ texto: m.rastreabilidade }], tamanho: F.nota, alinhamento: 'left' }],
          },
        ],
      },
    ],
  });

  // 6. Resultados
  const res = m.resultados;
  d.garantir(d.alturaSecao() + 30);
  d.y = d.secao('6. RESULTADOS OBTIDOS');
  if (res.tipo === 'manometro') {
    const vao = 10 * PX;
    const meia = (LARGURA - vao) / 2;
    const col = [meia * 0.33, meia * 0.33, meia * 0.34];
    const tituloRes = (t: string): Celula => ({
      colspan: 3,
      fundo: COR_CERT.fundoTituloResultado,
      paragrafos: [{ trechos: [{ texto: t, negrito: true }], tamanho: F.corpo }],
    });
    const vazioVao: Celula = { paragrafos: [] };
    const nota = (inc: string, k: string): Celula => ({
      colspan: 3,
      alinhamento: 'left',
      pad: { x: 4 * PX, y: 2 * PX + 1.5 * PX },
      paragrafos: [
        {
          tamanho: F.nota,
          alinhamento: 'left',
          trechos: [
            { texto: 'Incerteza de Medição: ', negrito: true },
            { texto: inc, cor: COR_CERT.valor },
            { texto: ' | Coeficiente k: ', negrito: true },
            { texto: k, cor: COR_CERT.valor },
          ],
        },
      ],
    });
    const cab = ['VALOR CONVENCIONAL', 'VALOR NOMINAL', 'ERRO'].map(rotulo);
    const n = Math.max(res.crescente.length, res.decrescente.length);
    const vaziaLinha = { vc: '', vi: '', erro: '' };
    const linhasRes: LinhaTabela[] = [
      {
        cabecalho: true,
        celulas: [tituloRes(`SENTIDO CRESCENTE (${res.unidade})`), vazioVao, tituloRes(`SENTIDO DECRESCENTE (${res.unidade})`)],
      },
      { cabecalho: true, celulas: [...cab, vazioVao, ...cab.map((c) => ({ ...c }))] },
      ...Array.from({ length: n }, (_, i) => {
        const a = res.crescente[i] ?? vaziaLinha;
        const b = res.decrescente[i] ?? vaziaLinha;
        return { celulas: [valor(a.vc), valor(a.vi), valor(a.erro), vazioVao, valor(b.vc), valor(b.vi), valor(b.erro)] };
      }),
      { celulas: [nota(res.incertezaC, res.coefC), vazioVao, nota(res.incertezaD, res.coefD)] },
    ];
    d.tabela({
      colunas: [...col, vao, ...col],
      linhas: linhasRes,
      blocos: [
        [0, 2],
        [4, 6],
      ],
      vaos: [3],
    });
  } else {
    const u = res.unidade ? ` (${res.unidade})` : '';
    d.tabela({
      colunas: [0.33, 0.33, 0.34].map((f) => f * LARGURA),
      depois: 5 * PX,
      linhas: [
        {
          cabecalho: true,
          celulas: [rotulo(`PRESSÃO DE ABERTURA${u}`), rotulo(`PRESSÃO DE AJUSTE${u}`), rotulo(`FECHAMENTO${u}`)],
        },
        { celulas: [valor(res.abertura), valor(res.ajuste), valor(res.fechamento)] },
        {
          celulas: [
            {
              colspan: 3,
              alinhamento: 'left',
              pad: { x: 4 * PX, y: 2 * PX + 1.5 * PX },
              paragrafos: [
                {
                  tamanho: F.nota,
                  alinhamento: 'left',
                  trechos: [
                    { texto: 'Incerteza de Medição: ', negrito: true },
                    { texto: res.incerteza, cor: COR_CERT.valor },
                    { texto: ' | Coeficiente k: ', negrito: true },
                    { texto: res.coef, cor: COR_CERT.valor },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  // 7. Definições
  d.garantir(d.alturaSecao() + 3 * passo(F.corpo));
  d.y = d.secao('7. DEFINIÇÕES GERAIS');
  d.bloco(
    m.definicoes.map((df) => ({ marcador: true, trechos: [{ texto: `${df.termo} `, negrito: true }, { texto: df.texto }] })),
    { depois: 6 * PX },
  );

  // 8. Conclusão (+ responsável ao lado, como no template: `td.c2` de 62 mm)
  const cor =
    m.conclusao.status === 'APROVADO'
      ? COR_CERT.aprovado
      : m.conclusao.status === 'REPROVADO'
        ? COR_CERT.reprovado
        : COR_CERT.semConclusao;
  const trechosConclusao: Trecho[] = [
    { texto: `${TEXTO_CONCLUSAO_ANTES} `, negrito: true },
    { texto: m.conclusao.status, negrito: true, cor },
    { texto: `${TEXTO_CONCLUSAO_MEIO} `, negrito: true },
    { texto: m.conclusao.motivo, negrito: true },
  ];
  const larguraResp = m.responsavel ? 62 : 0;
  const vaoResp = m.responsavel ? 6 * PX : 0;
  const larguraConcl = LARGURA - larguraResp - vaoResp;
  const altResp = d.alturaResponsavel();
  const linhasConcl = quebrarRico(d.pdf, trechosConclusao, larguraConcl - 2 * 6 * PX, F.corpo).length;
  const altConcl = linhasConcl * passo(F.corpo) + 2 * 4 * PX;
  // Conclusão curta (até ~60 mm) fica inteira com o título e o responsável;
  // longa começa onde estiver, com o responsável ao lado das primeiras linhas,
  // e o resto quebra de página.
  const inicioMinimo = altConcl <= 60 ? altConcl : 3 * passo(F.corpo) + 2 * 4 * PX;
  d.garantir(d.alturaSecao() + Math.max(altResp, inicioMinimo));
  d.y = d.secao('8. CONCLUSÃO TÉCNICA');
  const yConcl = d.y;
  const paginaConcl = d.pagina;
  d.bloco([{ trechos: trechosConclusao }], { largura: larguraConcl, depois: 0, registrar: true });
  if (m.responsavel) {
    const xResp = MARGEM_X + larguraConcl + vaoResp;
    // Ao lado do INÍCIO da conclusão, se ele couber ali; senão, ao lado do fim;
    // senão, na folha seguinte. Nunca por cima do rodapé.
    if (d.pagina === paginaConcl && yConcl + altResp <= d.limite) {
      d.responsavel(xResp, yConcl, larguraResp);
      d.y = Math.max(d.y, yConcl + altResp);
    } else {
      const ultimo = d.conclusao[d.conclusao.length - 1];
      if (ultimo && ultimo.pagina === d.pagina && ultimo.y + altResp <= d.limite) {
        d.responsavel(xResp, ultimo.y, larguraResp);
        d.y = Math.max(d.y, ultimo.y + altResp);
      } else {
        d.novaPagina();
        d.responsavel(xResp, d.y, larguraResp);
        d.y += altResp;
      }
    }
    d.marcarFundo();
  }
  d.rodapes();
}

// ── Geração ─────────────────────────────────────────────────────────────────

export interface ResultadoCertificado {
  bytes: Uint8Array;
  paginas: number;
  geometria: GeometriaCertificado;
}

/**
 * O PDF do certificado. Uma passagem só: o layout não depende do total de
 * folhas (o "Página X de Y" vai no rodapé, desenhado por último em cada folha
 * com `setPage`), então não há o que recontar.
 *
 * Datas do PDF fixas, como na emissão raster: o hash depende só do conteúdo.
 */
export async function gerarCertificadoCalibracaoPdf(
  m: ModeloCertificado,
  imagens: ImagensCertificado,
): Promise<ResultadoCertificado> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  await registrarCarlito(pdf);
  pdf.setProperties({
    title: `Certificado de calibração ${m.numero}`,
    creator: 'NR-13',
    subject: m.titulo,
  });
  pdf.setCreationDate(new Date(0));
  pdf.setFileId('4e5231334345525449464943414430ff'.slice(0, 32));
  const d = new Desenhista(pdf, m, imagens);
  desenhar(d, m, imagens);
  const paginas = pdf.getNumberOfPages();
  return {
    bytes: new Uint8Array(pdf.output('arraybuffer')),
    paginas,
    geometria: {
      paginas,
      limiteConteudo: d.limite,
      topoRodape: d.topoRodape,
      fundoConteudo: Array.from({ length: paginas }, (_, i) => d.fundo[i] ?? 0),
      responsavel: d.resp,
      conclusao: d.conclusao,
    },
  };
}
