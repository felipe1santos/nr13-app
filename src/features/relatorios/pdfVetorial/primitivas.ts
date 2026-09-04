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
 * Uma FOTO — o único raster do documento.
 *
 * `object-fit: contain` feito à mão: a imagem cabe inteira dentro do quadro,
 * centralizada, sem esticar. Esticar foto de inspeção é adulterar evidência
 * técnica, e é o que aconteceria com um `addImage` que preenchesse a caixa.
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

  const razao = proporcao && proporcao > 0 ? proporcao : 4 / 3;
  let larg = quadro.largura;
  let alt = larg / razao;
  if (alt > quadro.altura) {
    alt = quadro.altura;
    larg = alt * razao;
  }
  const x = quadro.x + (quadro.largura - larg) / 2;
  const y = quadro.y + (quadro.altura - alt) / 2;
  const formato = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, formato, x, y, larg, alt, undefined, 'FAST');
}

/** Cabeçalho da folha: logo à esquerda, nº do relatório e paginação à direita. */
export function cabecalho(ctx: Contexto, pagina: number, total: number): void {
  const { pdf } = ctx;
  const y = CAIXA.y;

  if (ctx.cabecalho.logo) {
    try {
      const formato = ctx.cabecalho.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(ctx.cabecalho.logo, formato, CAIXA.x, y, 50, 14, undefined, 'FAST');
    } catch {
      // Logo ilegível não pode impedir a emissão do relatório.
    }
  }

  const dir = CAIXA.x + CAIXA.largura;
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(FONTE.cabecalho);
  corTexto(pdf, COR.texto);
  pdf.text('RELATÓRIO DE INSPEÇÃO DE SEGURANÇA NR-13 N°', dir, y + 5, { align: 'right' });
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

/** Altura ocupada pelo rodapé abaixo da régua. */
const ALTURA_RODAPE_INTERNA = 1.5 + 3 * alturaLinha(FONTE.rodape);

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
