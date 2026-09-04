import { jsPDF } from 'jspdf';
import { registrarCarlito } from './carlito';
import { Documento } from './documento';
import {
  folhaProntContinuacao,
  folhaProntCroqui,
  folhaProntFolhaDados,
  folhaProntMemorial,
  folhaProntProntuario,
  folhaProntUltrassom,
} from './folhasProntuario';
import { montarModeloProntuario, type ModeloProntuario } from './modeloProntuario';

/**
 * Fase 12 · o PRONTUÁRIO em vetor.
 *
 * Reusa integralmente o motor da Fase 11: `Documento` (cursor, quebra de folha,
 * tabela que repete cabeçalho, "Página X de Y"), `primitivas`, `carlito` e a
 * geometria A4. **Nenhum framework novo de PDF.**
 *
 * ## O que o prontuário NÃO tinha e agora tem
 *
 * O prontuário atual só IMPRIME (`imprimirRelatorio('.prontuario-preview')`).
 * Não existe geração de bytes, SHA-256, upload nem `pdfRef` — o documento nunca
 * virou artefato. Este gerador devolve os bytes; a publicação (hash, bucket,
 * `pdfRef`) reusa `artefatoRelatorio.ts` sem alteração, e só entra no fluxo
 * quando a virada for autorizada.
 *
 * ## O croqui
 *
 * As três vistas são SVG. jsPDF não importa SVG sem plugin, então elas são
 * rasterizadas em 3× ANTES da primeira passagem e guardadas num cache que as
 * folhas consultam. É o único raster do documento, e está declarado — o resto
 * é texto e traço.
 */

export interface ResultadoProntuario {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
  modelo: ModeloProntuario;
  /** Croquis que não puderam ser convertidos — nunca somem calados. */
  croquisFalhos: string[];
}

function emitir(doc: Documento, m: ModeloProntuario): void {
  folhaProntUltrassom(doc, m);
  if (m.tipoEquipamento === 'vaso') {
    folhaProntCroqui(doc, m);
    folhaProntFolhaDados(doc, m);
  }
  folhaProntProntuario(doc, m);
  folhaProntContinuacao(doc, m);
  folhaProntMemorial(doc, m);
}

/**
 * Converte um SVG em PNG de alta resolução.
 *
 * 3× a largura de destino: o croqui é lido de perto no papel, e um traço fino
 * rasterizado em 1× vira uma linha serrilhada. Falhar aqui devolve `null`, e a
 * folha diz que o croqui não pôde ser convertido em vez de desenhar outra coisa.
 */
async function svgParaPng(svg: string, larguraPx = 1800): Promise<string | null> {
  if (svg.startsWith('data:image')) return svg; // já é imagem (PNG legado)
  try {
    const limpo = svg.trim().startsWith('<svg') ? svg : `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(limpo);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('svg ilegível'));
      i.src = url;
    });
    const razao = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.5;
    const c = document.createElement('canvas');
    c.width = larguraPx;
    c.height = Math.max(1, Math.round(larguraPx * razao));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function gerarProntuarioVetorial(tag: string): Promise<ResultadoProntuario> {
  const inicio = performance.now();
  const modelo = montarModeloProntuario(tag);

  // Croquis rasterizados uma única vez, antes das duas passagens.
  const cache = new Map<string, string>();
  const croquisFalhos: string[] = [];
  for (const [nome, svg] of [
    ['vista longitudinal', modelo.croqui.longitudinal],
    ['vista transversal', modelo.croqui.transversal],
    ['detalhe do tampo', modelo.croqui.detalheTampo],
  ] as [string, string | null][]) {
    if (!svg) continue;
    const png = await svgParaPng(svg);
    if (png) cache.set(svg, png);
    else croquisFalhos.push(nome);
  }

  const novoPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const cab = {
    logo: modelo.empresa.logo,
    numeroRelatorio: modelo.numero ?? '',
    rodape: [modelo.empresa.razao, modelo.empresa.endereco, modelo.empresa.contato] as [string, string, string],
  };

  // 1ª passagem: contar. Mesmo motivo da Fase 11 — `putTotalPages` não é
  // confiável com fonte CID embutida.
  const contagem = novoPdf();
  await registrarCarlito(contagem);
  const rascunho = new Documento(contagem, cab, 0);
  (rascunho as unknown as { __croquis: Map<string, string> }).__croquis = cache;
  emitir(rascunho, modelo);
  const total = contagem.getNumberOfPages();

  // 2ª passagem: para valer.
  const pdf = novoPdf();
  await registrarCarlito(pdf);
  const doc = new Documento(pdf, cab, total);
  (doc as unknown as { __croquis: Map<string, string> }).__croquis = cache;
  emitir(doc, modelo);

  return {
    bytes: new Uint8Array(pdf.output('arraybuffer')),
    paginas: pdf.getNumberOfPages(),
    ms: Math.round(performance.now() - inicio),
    modelo,
    croquisFalhos,
  };
}
