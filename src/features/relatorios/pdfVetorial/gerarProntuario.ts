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

/**
 * Gira um PNG em 90° — a vista longitudinal "em pé" na prancha.
 *
 * O giro é da IMAGEM já rasterizada, não do SVG: assim as cotas, os textos e
 * as linhas vão juntos, exatamente como o editor os desenhou. Falhar devolve
 * `null`, e a folha usa a versão deitada.
 */
async function girar90(png: string): Promise<{ png: string; proporcao: number } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('png ilegível'));
      i.src = png;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalHeight;
    c.height = img.naturalWidth;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    // -90°: o equipamento fica com a frente para a direita, e a cota de
    // comprimento sobe pela folha em vez de atravessá-la.
    ctx.translate(0, c.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    return { png: c.toDataURL('image/png'), proporcao: c.width / Math.max(1, c.height) };
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
    if (convertido) {
      cache.set(svg, convertido);
      // A vista longitudinal de um vaso é uma faixa larga e baixa: numa coluna
      // alta e estreita ela vira um risco no meio do branco. A versão GIRADA
      // 90° ocupa a coluna inteira, que é como uma prancha técnica põe a vista
      // principal quando o desenho é comprido. É a MESMA imagem — nada é
      // redesenhado, e as cotas giram junto.
      // A versão girada é preparada SEMPRE para a vista principal: quem decide
      // se usa é a folha, comparando qual das duas preenche melhor a coluna.
      // Decidir aqui por proporção falhava quando o SVG traz margem branca —
      // a proporção do arquivo não é a do desenho dentro dele.
      if (nome === 'vista longitudinal') {
        const girada = await girar90(convertido.png);
        if (girada) cache.set(`${svg}#girado`, girada);
      }
    } else croquisFalhos.push(nome);
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
  const desenhar = (totalDoRodape: number) => {
    const p = novoPdf();
    return registrarCarlito(p).then(() => {
      const d = new Documento(p, cab, totalDoRodape, 'final', {}, respiro);
      (d as unknown as { __croquis: Map<string, { png: string; proporcao: number }> }).__croquis = cache;
      emitir(d, modelo, paginasDasSecoes);
      return p;
    });
  };

  let pdf = await desenhar(total);

  // O RODAPÉ NÃO PODE MENTIR.
  //
  // A 1ª passagem conta as folhas; a 2ª desenha com esse total. Quando o
  // respiro (ou qualquer coisa que dependa da 1ª medição) muda a quebra, a 2ª
  // passagem sai com uma folha a mais e o rodapé anuncia "Página 1 de 10" num
  // documento de 11 — foi o que se mediu no prontuário em 06/09/2026.
  //
  // Em vez de caçar cada causa possível, o gerador CONFERE: se o número de
  // folhas não bater com o que o rodapé afirma, desenha de novo com o número
  // certo. Acontece raramente, custa uma passagem, e o documento nunca sai
  // dizendo um total que não é o dele.
  if (pdf.getNumberOfPages() !== total) {
    pdf = await desenhar(pdf.getNumberOfPages());
  }

  return {
    bytes: new Uint8Array(pdf.output('arraybuffer')),
    paginas: pdf.getNumberOfPages(),
    ms: Math.round(performance.now() - inicio),
    modelo,
    croquisFalhos,
  };
}
