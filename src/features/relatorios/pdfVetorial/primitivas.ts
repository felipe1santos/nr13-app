import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import {
  BORDA_FINA,
  CAIXA,
  COR,
  CORPO,
  FOLHA,
  FONTE,
  LIMITE_CORPO,
  MARGEM,
  PT,
  ENTRELINHA_RODAPE,
  alturaLinha,
} from './documentoA4';

/**
 * Fase 11 · os blocos de desenho do documento — TUDO VETOR.
 *
 * Cada função aqui escreve texto com `pdf.text()` e desenha caixa com
 * `pdf.rect()`/`pdf.line()`. Nada passa por canvas: o texto do PDF é texto de
 * verdade (selecionável, pesquisável, sem perda em zoom) e as bordas são linhas,
 * não pixels. A única coisa rasterizada no documento é FOTO — que é raster na
 * origem, e transformá-la em vetor não faria sentido nenhum.
 *
 * É essa separação que a Fase 11 chama de HÍBRIDO, e é o oposto do gerador
 * atual, que fotografa a folha inteira com `html2canvas` e cola a imagem na
 * página — inclusive o texto.
 *
 * Cada bloco devolve o `y` de onde o próximo começa. O chamador nunca calcula
 * altura por conta própria; é o que evita duas contas divergentes da mesma
 * coisa.
 */

export interface Contexto {
  pdf: jsPDF;
  /** Cabeçalho e rodapé precisam disso em toda folha. */
  cabecalho: DadosCabecalho;
}

export interface DadosCabecalho {
  /** dataURL da logo da executante, ou `null`. */
  logo: string | null;
  /** Nº do relatório impresso no alto de cada folha. */
  numeroRelatorio: string;
  /** As três linhas do rodapé (razão social, endereço/CNPJ, contato). */
  rodape: [string, string, string];
  /** A linha do alto: qual documento é este. Sem valor, é o relatório. */
  titulo?: string;
}

function corTexto(pdf: jsPDF, cor: string): void {
  pdf.setTextColor(cor);
}

/** Texto simples. Devolve o `y` da linha seguinte. */
export function texto(
  pdf: jsPDF,
  conteudo: string,
  x: number,
  y: number,
  opcoes: {
    tamanho?: number;
    negrito?: boolean;
    cor?: string;
    alinhamento?: 'left' | 'center' | 'right';
    larguraMax?: number;
  } = {},
): number {
  const tamanho = opcoes.tamanho ?? FONTE.base;
  pdf.setFont(FAMILIA, opcoes.negrito ? 'bold' : 'normal');
  pdf.setFontSize(tamanho);
  corTexto(pdf, opcoes.cor ?? COR.texto);

  const linhas = opcoes.larguraMax
    ? (pdf.splitTextToSize(conteudo, opcoes.larguraMax) as string[])
    : [conteudo];
  const passo = alturaLinha(tamanho);
  // O `y` do jsPDF é a LINHA DE BASE. Somar o passo antes de escrever põe a
  // primeira linha dentro da caixa, e não meio passo acima dela.
  let atual = y + passo * 0.78;
  for (const linha of linhas) {
    pdf.text(linha, x, atual, { align: opcoes.alinhamento ?? 'left' });
    atual += passo;
  }
  return y + passo * linhas.length;
}

/** Quantas linhas um texto ocupa numa largura — para medir ANTES de desenhar. */
export function alturaTexto(pdf: jsPDF, conteudo: string, largura: number, tamanho: number = FONTE.base): number {
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(tamanho);
  const linhas = pdf.splitTextToSize(conteudo, largura) as string[];
  return alturaLinha(tamanho) * Math.max(1, linhas.length);
}

/** `.banner` — caixa cinza escura, borda preta, texto centralizado. */
export function banner(pdf: jsPDF, conteudo: string, y: number): number {
  const altura = alturaLinha(FONTE.banner) + 1.4;
  pdf.setFillColor(COR.fundoCabecalhoTabela);
  pdf.setDrawColor(COR.texto);
  pdf.setLineWidth(BORDA_FINA);
  pdf.rect(CAIXA.x, y, CAIXA.largura, altura, 'FD');
  texto(pdf, conteudo, CAIXA.x + CAIXA.largura / 2, y + 0.6, {
    tamanho: FONTE.banner,
    negrito: true,
    alinhamento: 'center',
  });
  return y + altura + 1.2;
}

/** `.faixa` — barra cinza clara, texto à esquerda. */
export function faixa(pdf: jsPDF, conteudo: string, y: number): number {
  const altura = alturaLinha(FONTE.faixa) + 1.4;
  pdf.setFillColor(COR.fundoRotulo);
  pdf.setDrawColor(COR.bordaTabela);
  pdf.setLineWidth(BORDA_FINA);
  pdf.rect(CAIXA.x, y, CAIXA.largura, altura, 'FD');
  texto(pdf, conteudo, CAIXA.x + 2, y + 0.6, { tamanho: FONTE.faixa, negrito: true });
  return y + altura;
}

export interface CelulaTabela {
  texto: string;
  /** Célula de rótulo: fundo cinza claro e negrito, como `td.rotulo`. */
  rotulo?: boolean;
  centro?: boolean;
  /** Quantas colunas ocupa. */
  colspan?: number;
  /** Valor preenchido pelo sistema: azul-escuro, como `.campo`. */
  valor?: boolean;
}

/**
 * `table.tb` — bordas 0,6pt, cabeçalho cinza, rótulos cinza-claro.
 *
 * As larguras são FRAÇÕES da caixa útil (somam 1), como no CSS por
 * porcentagem. Devolve o `y` do fim da tabela.
 */
export function tabela(
  pdf: jsPDF,
  opcoes: {
    y: number;
    colunas: number[];
    cabecalho?: string[];
    linhas: CelulaTabela[][];
    compacta?: boolean;
  },
): number {
  const tamanho = opcoes.compacta ? FONTE.tabelaCompacta : FONTE.tabela;
  const padX = 1.4;
  const padY = opcoes.compacta ? 0.45 : 0.6;
  const larguras = opcoes.colunas.map((f) => f * CAIXA.largura);
  let y = opcoes.y;

  pdf.setLineWidth(BORDA_FINA);
  pdf.setDrawColor(COR.bordaTabela);

  if (opcoes.cabecalho) {
    const altura = alturaLinha(tamanho) + padY * 2;
    let x = CAIXA.x;
    for (let i = 0; i < opcoes.cabecalho.length; i++) {
      pdf.setFillColor(COR.fundoCabecalhoTabela);
      pdf.rect(x, y, larguras[i], altura, 'FD');
      texto(pdf, opcoes.cabecalho[i], x + larguras[i] / 2, y + padY, {
        tamanho,
        negrito: true,
        alinhamento: 'center',
      });
      x += larguras[i];
    }
    y += altura;
  }

  for (const linha of opcoes.linhas) {
    // Mede antes de desenhar: a altura da linha é a da célula mais alta.
    let altura = alturaLinha(tamanho) + padY * 2;
    {
      let i = 0;
      for (const cel of linha) {
        const span = cel.colspan ?? 1;
        const larg = larguras.slice(i, i + span).reduce((a, b) => a + b, 0) - padX * 2;
        altura = Math.max(altura, alturaTexto(pdf, cel.texto, larg, tamanho) + padY * 2);
        i += span;
      }
    }

    let x = CAIXA.x;
    let i = 0;
    for (const cel of linha) {
      const span = cel.colspan ?? 1;
      const larg = larguras.slice(i, i + span).reduce((a, b) => a + b, 0);
      pdf.setFillColor(cel.rotulo ? COR.fundoRotulo : '#ffffff');
      pdf.rect(x, y, larg, altura, 'FD');
      texto(
        pdf,
        cel.texto,
        cel.centro ? x + larg / 2 : x + padX,
        y + padY,
        {
          tamanho,
          negrito: !!cel.rotulo,
          cor: cel.valor ? COR.valor : COR.texto,
          alinhamento: cel.centro ? 'center' : 'left',
          larguraMax: larg - padX * 2,
        },
      );
      x += larg;
      i += span;
    }
    y += altura;
  }

  return y;
}

/**
 * A PROPORÇÃO REAL de uma imagem, lida dos bytes dela (08/09/2026).
 *
 * `jsPDF.getImageProperties` decodifica o cabeçalho do PNG/JPEG e devolve
 * largura e altura de verdade. É síncrono e não depende de DOM — roda igual no
 * navegador e na suíte (`environment: 'node'`), que é o motivo de ele ser
 * preferido ao `Image` do `resolverFotos`.
 *
 * O `proporcao` que os chamadores passam continua valendo como SEGUNDA opção
 * (é o que serve o croqui, que chega como SVG rasterizado em canvas), e o
 * 4/3 histórico continua como último recurso. O que mudou é a ORDEM: antes o
 * palpite vinha primeiro, e imagem sem palpite era desenhada como 4:3
 * qualquer que fosse o formato dela.
 */
function proporcaoReal(pdf: jsPDF, dataUrl: string, informada?: number): number {
  try {
    const p = pdf.getImageProperties(dataUrl) as { width?: number; height?: number };
    if (p && p.width && p.height) return p.width / p.height;
  } catch {
    // Formato que o jsPDF não sabe medir cai no palpite — nunca impede o desenho.
  }
  if (informada && informada > 0) return informada;
  return 4 / 3;
}

/**
 * Uma FOTO — o único raster do documento.
 *
 * `object-fit: contain` feito à mão: a imagem cabe inteira dentro do quadro,
 * centralizada, sem esticar. Esticar foto de inspeção é adulterar evidência
 * técnica, e é o que aconteceria com um `addImage` que preenchesse a caixa.
 *
 * **O quadro é o LIMITE, não o formato.** A moldura cinza é desenhada no
 * tamanho pedido; a imagem se encaixa dentro dela na proporção que ela tem de
 * verdade. Foto de celular em pé (3:4) numa caixa larga sai estreita e
 * centralizada — que é o certo — em vez de achatada para caber.
 */
export function foto(
  pdf: jsPDF,
  dataUrl: string,
  quadro: { x: number; y: number; largura: number; altura: number },
  proporcao?: number,
): void {
  pdf.setDrawColor(COR.bordaFoto);
  pdf.setLineWidth(0.4 * PT);
  pdf.rect(quadro.x, quadro.y, quadro.largura, quadro.altura);

  const razao = proporcaoReal(pdf, dataUrl, proporcao);
  let larg = quadro.largura;
  let alt = larg / razao;
  if (alt > quadro.altura) {
    alt = quadro.altura;
    larg = alt * razao;
  }
  const x = quadro.x + (quadro.largura - larg) / 2;
  const y = quadro.y + (quadro.altura - alt) / 2;
  const formato = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  try {
    pdf.addImage(dataUrl, formato, x, y, larg, alt, undefined, 'FAST');
  } catch {
    // Arquivo corrompido (truncado no upload, byte perdido no cofre) fazia o
    // jsPDF lançar `wrong PNG signature` e **derrubava a emissão inteira** —
    // uma foto ilegível custava o relatório. A moldura já foi desenhada: o
    // quadro sai vazio, e o resto do documento continua.
  }
}

/**
 * Uma imagem SEM moldura, encaixada num quadro — logo e rubrica.
 *
 * Mesma conta do `foto()`, sem o retângulo cinza. Existe porque logo e rubrica
 * eram desenhadas com largura e altura FIXAS (`50×14` a logo, `40×16` a
 * rubrica): toda logo que não fosse exatamente 25:7 saía deformada, e foi
 * assim que a logo do cliente apareceu esticada no cabeçalho de todas as
 * páginas do relatório.
 *
 * `alinhamento` decide o que fazer com a sobra horizontal: a logo do cabeçalho
 * encosta à esquerda (o resto da faixa é do nº do relatório), a rubrica
 * centraliza sobre a linha de assinatura.
 */
export function imagemEncaixada(
  pdf: jsPDF,
  dataUrl: string,
  quadro: { x: number; y: number; largura: number; altura: number },
  opcoes: { alinhamento?: 'left' | 'center'; proporcao?: number } = {},
): void {
  const razao = proporcaoReal(pdf, dataUrl, opcoes.proporcao);
  let larg = quadro.largura;
  let alt = larg / razao;
  if (alt > quadro.altura) {
    alt = quadro.altura;
    larg = alt * razao;
  }
  const x = opcoes.alinhamento === 'left'
    ? quadro.x
    : quadro.x + (quadro.largura - larg) / 2;
  // Vertical: sempre centralizada. Logo colada no topo da faixa brigaria com o
  // fio do cabeçalho.
  const y = quadro.y + (quadro.altura - alt) / 2;
  const formato = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  try {
    pdf.addImage(dataUrl, formato, x, y, larg, alt, undefined, 'FAST');
  } catch {
    // Mesma razão do `foto()`: imagem ilegível não derruba o documento.
  }
}

/** Cabeçalho da folha: logo à esquerda, nº do relatório e paginação à direita. */
export function cabecalho(
  ctx: Contexto,
  pagina: number,
  total: number,
  destacarLogoVazia = false,
): void {
  const { pdf } = ctx;
  const y = CAIXA.y;

  if (ctx.cabecalho.logo) {
    try {
      // `50×14` é o QUADRO da logo na faixa do cabeçalho, não o tamanho dela:
      // a imagem se encaixa dentro, à esquerda, na proporção que tem. Antes ela
      // era esticada até esse retângulo, e logo quadrada saía achatada em todas
      // as páginas do documento.
      imagemEncaixada(pdf, ctx.cabecalho.logo, { x: CAIXA.x, y, largura: 50, altura: 14 }, { alinhamento: 'left' });
    } catch {
      // Logo ilegível não pode impedir a emissão do relatório.
    }
  } else if (destacarLogoVazia) {
    // Bloco 1 · na PRÉVIA, a área da logo vazia se anuncia — é o
    // `.cab .logo-vazio` da referência (amarelo, tracejado). No documento
    // FINAL não sobra nada: nem amarelo, nem moldura, nem legenda.
    pdf.setDrawColor('#b9b9b9');
    pdf.setLineWidth(BORDA_FINA);
    pdf.setFillColor('#FFF8C4');
    pdf.rect(CAIXA.x, y, 50, 14, 'FD');
    pdf.setFont(FAMILIA, 'normal');
    pdf.setFontSize(7.5);
    corTexto(pdf, '#8a7a2e');
    pdf.text('Clique para adicionar a logo', CAIXA.x + 25, y + 7.8, { align: 'center' });
  }

  const dir = CAIXA.x + CAIXA.largura;
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(FONTE.cabecalho);
  corTexto(pdf, COR.texto);
  // O prontuário usa o MESMO cabeçalho do relatório — mesma logo, mesma
  // régua, mesma paginação — e só troca a linha que diz qual documento é
  // este. Sem isso, o prontuário saía carimbado como relatório de inspeção.
  pdf.text(ctx.cabecalho.titulo ?? 'RELATÓRIO DE INSPEÇÃO DE SEGURANÇA NR-13 N°', dir, y + 5, { align: 'right' });
  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(FONTE.numDoc);
  pdf.text(ctx.cabecalho.numeroRelatorio || '—', dir, y + 9.5, { align: 'right' });
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(FONTE.pagina);
  pdf.text(`Página ${pagina} de ${total}`, dir, y + 13.5, { align: 'right' });

  const yRegua = y + 16;
  pdf.setDrawColor(COR.reguaCabecalho);
  pdf.setLineWidth(BORDA_FINA);
  pdf.line(CAIXA.x, yRegua, dir, yRegua);
}

/** Rodapé: régua e as três linhas da executante, centralizadas. */
export function rodape(ctx: Contexto): void {
  const { pdf } = ctx;
  const yRegua = FOLHA.altura - MARGEM.baixo - ALTURA_RODAPE_INTERNA;
  pdf.setDrawColor(COR.reguaCabecalho);
  pdf.setLineWidth(BORDA_FINA);
  pdf.line(CAIXA.x, yRegua, CAIXA.x + CAIXA.largura, yRegua);

  const centro = CAIXA.x + CAIXA.largura / 2;
  let y = yRegua + 1.5;
  ctx.cabecalho.rodape.forEach((linha, i) => {
    y = texto(pdf, linha, centro, y, {
      tamanho: FONTE.rodape,
      negrito: i === 0,
      alinhamento: 'center',
    });
  });
}

/** Altura ocupada pelo rodapé abaixo da régua — na entrelinha do `.rod` (1.35). */
const ALTURA_RODAPE_INTERNA = 1.5 + 3 * alturaLinha(FONTE.rodape, ENTRELINHA_RODAPE);

/** Uma folha nova, já com cabeçalho e rodapé. Devolve o `y` inicial do corpo. */
export function novaFolha(ctx: Contexto, pagina: number, total: number, primeira = false): number {
  if (!primeira) ctx.pdf.addPage();
  cabecalho(ctx, pagina, total);
  rodape(ctx);
  return CORPO.y;
}

/** O conteúdo cabe no que falta da folha? */
export function cabeNaFolha(y: number, alturaNecessaria: number): boolean {
  return y + alturaNecessaria <= LIMITE_CORPO;
}
