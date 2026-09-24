import { jsPDF } from 'jspdf';
import { FAMILIA, registrarCarlito } from './carlito';
import { Documento } from './documento';
import { CAIXA, COR, CORPO, FONTE, LIMITE_CORPO, alturaLinha } from './documentoA4';
import { foto } from './primitivas';
import { medirFotos } from './modelo';
import { baixarFoto, blobParaDataUrl } from '../../../services/fotos';
import { rotuloFoto, type FotoDescrita } from '../../inspecoes/fotosDescritas';

/**
 * RELATÓRIO DE IMAGENS — o documento feito de fotos descritas (Fase 5, 24/09/2026).
 *
 * HÍBRIDO como o resto do motor vetorial: texto é texto (Carlito embutida,
 * selecionável), foto é o único raster. Reusa `Documento` (cabeçalho, rodapé,
 * "Página X de Y" nas duas passagens) e a primitiva `foto` (contain, sem
 * esticar). **Nenhum framework novo de PDF.**
 *
 * ## Por que NÃO é a grade `Documento.fotos`
 *
 * A grade do relatório NR-13 tem altura FIXA por foto (quatro por folha, §5) e
 * por isso corta a legenda em duas linhas com reticência. Aqui a descrição É o
 * conteúdo — ela nunca pode ser cortada. Então a altura de cada linha da grade
 * é MEDIDA: a célula mais alta das duas decide, e a linha que não cabe abre
 * folha nova. Descrição tão longa que nem sozinha cabe numa folha deixa a
 * grade: a foto vai sozinha e o texto CORRE pelas folhas seguintes
 * (`Documento.texto` quebra linha a linha). A última folha pode ter uma foto só.
 *
 * ## Reuso no relatório NR-13
 *
 * `desenharFotosDescritas` recebe um `Documento` já aberto e não sabe de capa
 * nem de cabeçalho. Desde a Fase 5.2 ela desenha os DOIS: o documento avulso
 * (`gerarRelatorioImagensPdf`, com capa própria) e a seção 8.4 do relatório
 * NR-13 completo (`secaoRelatorioImagens`, no cabeçalho, rodapé e paginação do
 * relatório). As fotos chegam aos dois pela mesma `prepararFotosDescritas`.
 */

export interface FotoParaDocumento {
  dataUrl: string;
  descricao: string;
  /** largura/altura reais. Sem isto a primitiva mede pelos bytes. */
  proporcao?: number;
}

/** Onde cada foto caiu — é o que os testes conferem (sem sobreposição, sem corte). */
export interface CelulaDesenhada {
  indice: number;
  pagina: number;
  x: number;
  y: number;
  largura: number;
  /** Altura do quadro da imagem. */
  alturaImagem: number;
  /** Onde a descrição termina (mm, na página em que terminou). */
  fimDescricao: number;
  paginaFimDescricao: number;
  /** A descrição saiu da grade e correu em largura total. */
  corrida: boolean;
}

export const GRADE_IMAGENS = {
  vao: 6,
  get coluna(): number {
    return (CAIXA.largura - this.vao) / 2;
  },
  alturaImagem: 78,
  /** "Foto 01" acima da imagem. */
  alturaRotulo: 5,
  /** Entre a imagem e a descrição. */
  respiroDescricao: 1.6,
  /** Entre uma linha da grade e a próxima. */
  vaoLinhas: 5,
  fonteDescricao: 9,
} as const;

function linhasDaDescricao(pdf: jsPDF, texto: string, largura: number): string[] {
  const limpo = (texto ?? '').replace(/\r\n?/g, '\n').trim();
  if (limpo === '') return [];
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(GRADE_IMAGENS.fonteDescricao);
  return pdf.splitTextToSize(limpo, largura) as string[];
}

/**
 * A grade de duas colunas com a descrição inteira embaixo de cada foto.
 *
 * `aoAbrirFolha` redesenha o título da seção numa folha nova, como na grade do
 * relatório — folha de fotos sem título não diz o que é.
 */
export function desenharFotosDescritas(
  doc: Documento,
  fotos: FotoParaDocumento[],
  aoAbrirFolha?: () => void,
): CelulaDesenhada[] {
  const g = GRADE_IMAGENS;
  const col = g.coluna;
  const passo = alturaLinha(g.fonteDescricao);
  const pdf = doc.pdf;
  const celulas: CelulaDesenhada[] = [];
  // Quanto cabe numa folha LIMPA, já com o título da seção redesenhado. Até a
  // primeira folha nova é uma estimativa (corpo menos um banner, ~7,4 mm);
  // depois é a medida real de uma folha aberta.
  let capacidadeFolha = LIMITE_CORPO - CORPO.y - (aoAbrirFolha ? 8 : 0);

  const novaFolha = () => {
    doc.novaFolha();
    aoAbrirFolha?.();
    capacidadeFolha = LIMITE_CORPO - doc.y;
  };

  const altura = (linhas: string[]) =>
    g.alturaRotulo + g.alturaImagem + (linhas.length > 0 ? g.respiroDescricao + linhas.length * passo : 0);

  const desenharCelula = (i: number, x: number, y: number, linhas: string[]): CelulaDesenhada => {
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(FONTE.faixa);
    pdf.setTextColor(COR.texto);
    pdf.text(rotuloFoto(i), x, y + 3.6);
    const yImg = y + g.alturaRotulo;
    foto(pdf, fotos[i].dataUrl, { x, y: yImg, largura: col, altura: g.alturaImagem }, fotos[i].proporcao);
    pdf.setFont(FAMILIA, 'normal');
    pdf.setFontSize(g.fonteDescricao);
    pdf.setTextColor(COR.texto);
    let yTxt = yImg + g.alturaImagem + g.respiroDescricao;
    for (const l of linhas) {
      pdf.text(l, x, yTxt + passo * 0.78);
      yTxt += passo;
    }
    return {
      indice: i,
      pagina: doc.paginaAtual,
      x,
      y,
      largura: col,
      alturaImagem: g.alturaImagem,
      fimDescricao: linhas.length > 0 ? yTxt : yImg + g.alturaImagem,
      paginaFimDescricao: doc.paginaAtual,
      corrida: false,
    };
  };

  /** Foto cuja descrição não cabe nem sozinha numa folha: sai da grade. */
  const desenharCorrida = (i: number) => {
    const alturaFoto = g.alturaRotulo + g.alturaImagem + g.respiroDescricao;
    if (alturaFoto + passo > doc.espacoRestante) novaFolha();
    const y = doc.y;
    const c = desenharCelula(i, CAIXA.x, y, []);
    doc.y = y + alturaFoto;
    // Linha a linha, pela MESMA `novaFolha` da grade: a folha de continuação
    // ganha o título "IMAGENS (continuação)" como qualquer outra (5.1).
    const linhas = linhasDaDescricao(pdf, fotos[i].descricao, CAIXA.largura);
    for (const l of linhas) {
      if (doc.y + passo > LIMITE_CORPO) novaFolha();
      pdf.setFont(FAMILIA, 'normal');
      pdf.setFontSize(g.fonteDescricao);
      pdf.setTextColor(COR.texto);
      pdf.text(l, CAIXA.x, doc.y + passo * 0.78);
      doc.y += passo;
    }
    celulas.push({ ...c, corrida: true, fimDescricao: doc.y, paginaFimDescricao: doc.paginaAtual });
    doc.y += g.vaoLinhas;
  };

  for (let i = 0; i < fotos.length; ) {
    const linhasA = linhasDaDescricao(pdf, fotos[i].descricao, col);
    const temPar = i + 1 < fotos.length;
    const linhasB = temPar ? linhasDaDescricao(pdf, fotos[i + 1].descricao, col) : [];

    if (altura(linhasA) > capacidadeFolha) {
      desenharCorrida(i);
      i += 1;
      continue;
    }
    // O par só vai junto se a segunda também couber numa folha limpa; senão a
    // primeira ocupa a linha sozinha e a segunda sai corrida na volta seguinte.
    const par = temPar && altura(linhasB) <= capacidadeFolha;
    const alturaLinhaGrade = Math.max(altura(linhasA), par ? altura(linhasB) : 0);
    if (alturaLinhaGrade > doc.espacoRestante) novaFolha();
    const y = doc.y;
    celulas.push(desenharCelula(i, CAIXA.x, y, linhasA));
    if (par) celulas.push(desenharCelula(i + 1, CAIXA.x + col + g.vao, y, linhasB));
    doc.y = y + alturaLinhaGrade + g.vaoLinhas;
    i += par ? 2 : 1;
  }
  return celulas;
}

// ── A PORTA ÚNICA das fotos descritas para o papel (Fase 5.2) ───────────────

/**
 * Foto que não carrega PARA a geração, dizendo qual.
 *
 * O relatório NR-13 descarta a foto de exame que não resolve e segue. Aqui não
 * dá: "Foto 01…" é derivado da ordem, e pular uma foto renumeraria as
 * seguintes — a descrição "Foto 04" do técnico viraria a "Foto 03" do papel.
 * Vale igual para o avulso e para a seção 8.4 do relatório completo.
 */
export class FotoIndisponivelErro extends Error {
  readonly rotulos: string[];
  constructor(rotulos: string[]) {
    super(
      `${rotulos.join(', ')} do Relatório de Imagens não ${rotulos.length === 1 ? 'pôde' : 'puderam'} ser ` +
        `carregada${rotulos.length === 1 ? '' : 's'} (sem cópia neste aparelho e sem conexão com o servidor). ` +
        'O documento não foi gerado para não renumerar as fotos.',
    );
    this.name = 'FotoIndisponivelErro';
    this.rotulos = rotulos;
  }
}

/**
 * As fotos descritas, prontas para desenhar: imagem (cofre → bucket), proporção
 * medida dos bytes, descrição — NA ORDEM do registro. É a mesma função para o
 * documento avulso e para a seção do relatório completo: não existe um segundo
 * caminho que possa pular, reordenar ou re-legendar uma foto.
 */
export async function prepararFotosDescritas(fotos: FotoDescrita[]): Promise<FotoParaDocumento[]> {
  const imagens = await Promise.all(
    fotos.map(async (f) => {
      if (f.base64 && f.base64.startsWith('data:image')) return f.base64;
      if (!f.ref) return null;
      try {
        const blob = await baixarFoto(f.ref);
        return blob ? await blobParaDataUrl(blob) : null;
      } catch {
        return null;
      }
    }),
  );
  const faltando = imagens.flatMap((img, i) => (img ? [] : [rotuloFoto(i)]));
  if (faltando.length > 0) throw new FotoIndisponivelErro(faltando);

  // Proporção dos bytes (contain sem esticar). `medirFotos` descarta a que o
  // navegador não decodifica — o que também renumeraria, então confere.
  const medidas = await medirFotos(fotos.map((f, i) => ({ dataUrl: imagens[i] as string, descricao: f.descricao })));
  if (medidas.length !== fotos.length) {
    const ok = new Set(medidas.map((m) => m.dataUrl));
    throw new FotoIndisponivelErro(fotos.flatMap((_, i) => (ok.has(imagens[i] as string) ? [] : [rotuloFoto(i)])));
  }
  return medidas.map((m) => ({ dataUrl: m.dataUrl, descricao: m.descricao, proporcao: m.proporcao }));
}

/** O título da seção dentro do relatório completo — número fixo (§ sumário). */
export const TITULO_SECAO_IMAGENS = '8.4 RELATÓRIO DE IMAGENS';

/**
 * 8.4 · a SEÇÃO dentro do relatório NR-13 completo.
 *
 * Sem capa própria (o relatório já tem uma), com o cabeçalho, o rodapé e a
 * paginação GLOBAIS do `Documento` do relatório. O desenho das fotos é o MESMO
 * `desenharFotosDescritas` do avulso — muda só o título da seção.
 */
export function secaoRelatorioImagens(doc: Documento, fotos: FotoParaDocumento[]): CelulaDesenhada[] {
  if (fotos.length === 0) return [];
  doc.novaFolha();
  doc.banner(TITULO_SECAO_IMAGENS);
  return desenharFotosDescritas(doc, fotos, () => doc.banner(`${TITULO_SECAO_IMAGENS} (continuação)`));
}

export interface EntradaRelatorioImagens {
  tag: string;
  /** Linhas "RÓTULO: valor" da capa, na ordem. Valor vazio sai "—". */
  identificacao: { rotulo: string; valor: string | null }[];
  observacoes: string;
  fotos: FotoParaDocumento[];
  empresa: { razao: string; endereco: string; contato: string; logo: string | null };
}

export interface ResultadoRelatorioImagens {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
  celulas: CelulaDesenhada[];
}

/** Capa SIMPLES: título, identificação do equipamento, observação. */
function capa(doc: Documento, e: EntradaRelatorioImagens): void {
  doc.novaFolha();
  doc.y += 8;
  doc.texto('RELATÓRIO DE IMAGENS', { tamanho: FONTE.tituloDoc, negrito: true, alinhamento: 'center' });
  doc.texto(`T.A.G. ${e.tag}`, {
    tamanho: FONTE.subtituloDoc,
    alinhamento: 'center',
    espacoAntes: 2,
  });
  doc.y += 8;
  doc.banner('IDENTIFICAÇÃO');
  doc.tabela({
    colunas: [0.34, 0.66],
    linhas: e.identificacao.map((l) => [
      { texto: l.rotulo, rotulo: true },
      { texto: l.valor && l.valor.trim() !== '' ? l.valor : '—', semDestaque: true },
    ]),
  });
  if (e.observacoes.trim() !== '') {
    doc.banner('OBSERVAÇÃO GERAL');
    doc.texto(e.observacoes.trim(), { tamanho: FONTE.base });
  }
}

function emitir(doc: Documento, e: EntradaRelatorioImagens): CelulaDesenhada[] {
  capa(doc, e);
  doc.novaFolha();
  doc.banner('IMAGENS');
  return desenharFotosDescritas(doc, e.fotos, () => doc.banner('IMAGENS (continuação)'));
}

export async function gerarRelatorioImagensPdf(e: EntradaRelatorioImagens): Promise<ResultadoRelatorioImagens> {
  const inicio = performance.now();
  const novoPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const cab = {
    logo: e.empresa.logo,
    numeroRelatorio: e.tag,
    rodape: [e.empresa.razao, e.empresa.endereco, e.empresa.contato] as [string, string, string],
    titulo: 'RELATÓRIO DE IMAGENS — T.A.G.',
  };

  // Duas passagens, como o relatório e o prontuário: a 1ª conta as folhas, a
  // 2ª desenha com o total certo no "Página X de Y".
  const contagem = novoPdf();
  await registrarCarlito(contagem);
  emitir(new Documento(contagem, cab, 0), e);
  let total = contagem.getNumberOfPages();

  const desenhar = async (t: number) => {
    const p = novoPdf();
    await registrarCarlito(p);
    const celulas = emitir(new Documento(p, cab, t), e);
    return { p, celulas };
  };
  let r = await desenhar(total);
  // O rodapé não pode mentir: se a 2ª passagem quebrou diferente, redesenha.
  if (r.p.getNumberOfPages() !== total) {
    total = r.p.getNumberOfPages();
    r = await desenhar(total);
  }
  return {
    bytes: new Uint8Array(r.p.output('arraybuffer')),
    paginas: r.p.getNumberOfPages(),
    ms: Math.round(performance.now() - inicio),
    celulas: r.celulas,
  };
}
