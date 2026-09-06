import { jsPDF } from 'jspdf';
import { registrarCarlito } from './carlito';
import { Documento } from './documento';
import {
  folhaProntCapa,
  folhaProntContinuacao,
  folhaProntCroqui,
  folhaProntFolhaDados,
  folhaProntMemorial,
  folhaProntProntuario,
  folhaProntSumario,
  secoesDoProntuario,
} from './folhasProntuario';
import { folhaProntUltrassom } from './folhasProntuario';
import type { RespiroMedido } from './documento';
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

/**
 * As folhas, na ordem — capa e sumário na frente, como no relatório.
 *
 * `registrar` recebe, na 1ª passagem, a página em que cada seção começou; a 2ª
 * usa esse mapa para o sumário trazer a página real. É o mesmo mecanismo do
 * relatório e não custa uma passagem a mais.
 */
function emitir(
  doc: Documento,
  m: ModeloProntuario,
  paginas: Map<string, number> = new Map(),
  registrar?: Map<string, number>,
): void {
  const titulos = secoesDoProntuario(m);
  let i = 0;
  const secao = (fn: () => void) => {
    const inicio = doc.pdf.getNumberOfPages() + 1;
    fn();
    if (registrar && titulos[i]) registrar.set(titulos[i], inicio);
    i++;
  };

  folhaProntCapa(doc, m);
  folhaProntSumario(doc, m, paginas);
  secao(() => folhaProntUltrassom(doc, m));
  if (m.tipoEquipamento === 'vaso') {
    // Croqui e folha de dados só existem para VASO (§8): caldeira e autoclave
    // não têm modelo de croqui, e um desenho genérico num prontuário assinado
    // afirmaria uma geometria que não é a do equipamento.
    secao(() => folhaProntCroqui(doc, m));
    secao(() => folhaProntFolhaDados(doc, m));
  }
  secao(() => folhaProntProntuario(doc, m));
  secao(() => folhaProntContinuacao(doc, m));
  secao(() => folhaProntMemorial(doc, m));
}

/**
 * Converte um SVG em PNG de alta resolução.
 *
 * 3× a largura de destino: o croqui é lido de perto no papel, e um traço fino
 * rasterizado em 1× vira uma linha serrilhada. Falhar aqui devolve `null`, e a
 * folha diz que o croqui não pôde ser convertido em vez de desenhar outra coisa.
 */
async function svgParaPng(svg: string, larguraPx = 1800): Promise<{ png: string; proporcao: number } | null> {
  if (svg.startsWith('data:image')) {
    // PNG legado: mede a proporção real dele, sem assumir nada.
    try {
      const i = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('png ilegível'));
        im.src = svg;
      });
      return { png: svg, proporcao: i.naturalHeight ? i.naturalWidth / i.naturalHeight : 1 };
    } catch {
      return null;
    }
  }
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
    // A proporção REAL do desenho viaja junto: sem ela o croqui cairia no
    // recuo 4:3 da primitiva `foto` e sairia ESTICADO. Croqui distorcido num
    // prontuário é cota errada — pior que croqui ausente.
    return { png: c.toDataURL('image/png'), proporcao: img.naturalWidth / Math.max(1, img.naturalHeight) };
  } catch {
    return null;
  }
}

export async function gerarProntuarioVetorial(tag: string): Promise<ResultadoProntuario> {
  const inicio = performance.now();
  const modelo = montarModeloProntuario(tag);

  // Croquis rasterizados uma única vez, antes das duas passagens.
  const cache = new Map<string, { png: string; proporcao: number }>();
  const croquisFalhos: string[] = [];
  for (const [nome, svg] of [
    ['vista longitudinal', modelo.croqui.longitudinal],
    ['vista transversal', modelo.croqui.transversal],
    ['detalhe do tampo', modelo.croqui.detalheTampo],
  ] as [string, string | null][]) {
    if (!svg) continue;
    const convertido = await svgParaPng(svg);
    if (convertido) cache.set(svg, convertido);
    else croquisFalhos.push(nome);
  }

  const novoPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const cab = {
    logo: modelo.empresa.logo,
    numeroRelatorio: modelo.numero ?? '',
    rodape: [modelo.empresa.razao, modelo.empresa.endereco, modelo.empresa.contato] as [string, string, string],
    // O prontuário usa o cabeçalho do relatório e só troca esta linha: um
    // documento carimbado com o nome do outro é erro de conteúdo, não de
    // estilo.
    titulo: 'PRONTUÁRIO DO EQUIPAMENTO — NR-13 N°',
  };

  // 1ª passagem: contar. Mesmo motivo da Fase 11 — `putTotalPages` não é
  // confiável com fonte CID embutida.
  const contagem = novoPdf();
  await registrarCarlito(contagem);
  const rascunho = new Documento(contagem, cab, 0);
  (rascunho as unknown as { __croquis: Map<string, { png: string; proporcao: number }> }).__croquis = cache;
  const paginasDasSecoes = new Map<string, number>();
  const respiro: RespiroMedido = {};
  rascunho.aoFecharSecaoElastica = (medida) => {
    respiro[medida.chave] = { sobra: medida.sobra, linhas: medida.linhas, folhaFinal: medida.folhaFinal };
  };
  emitir(rascunho, modelo, new Map(), paginasDasSecoes);
  const total = contagem.getNumberOfPages();

  // 2ª passagem: para valer.
  const pdf = novoPdf();
  await registrarCarlito(pdf);
  const doc = new Documento(pdf, cab, total, 'final', {}, respiro);
  (doc as unknown as { __croquis: Map<string, { png: string; proporcao: number }> }).__croquis = cache;
  emitir(doc, modelo, paginasDasSecoes);

  return {
    bytes: new Uint8Array(pdf.output('arraybuffer')),
    paginas: pdf.getNumberOfPages(),
    ms: Math.round(performance.now() - inicio),
    modelo,
    croquisFalhos,
  };
}
