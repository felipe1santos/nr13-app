/**
 * Fase 11 · a GEOMETRIA da folha, em milímetros.
 *
 * Todos os números aqui vieram do CSS da referência
 * (`C:\projetos\vender\relatorio-nr13.html`), medidos e não estimados:
 *
 *   .folha  { width: 210mm; min-height: 297mm; padding: 9mm 15mm 7mm 15mm }
 *   .cab    { border-bottom: .6pt solid #808080; padding-bottom: 2mm; margin-bottom: 3.5mm }
 *   .rod    { border-top: .6pt solid #808080; margin-top: 3.5mm; padding-top: 1.5mm }
 *
 * Por que em MILÍMETROS e não em pixels: o PDF é gerado em `mm` pelo jsPDF, e o
 * documento é A4 exato. Trabalhar em px obrigaria a converter em cada chamada,
 * com um arredondamento por conversão — é assim que uma folha ganha meio
 * milímetro por vez e o rodapé sai da margem.
 */

/** A4 retrato, em mm. */
export const FOLHA = { largura: 210, altura: 297 } as const;

export const MARGEM = { topo: 9, direita: 15, baixo: 7, esquerda: 15 } as const;

/** Caixa útil: onde o conteúdo pode existir. */
export const CAIXA = {
  x: MARGEM.esquerda,
  largura: FOLHA.largura - MARGEM.esquerda - MARGEM.direita, // 180 mm
  y: MARGEM.topo,
  altura: FOLHA.altura - MARGEM.topo - MARGEM.baixo,
} as const;

/** Altura reservada ao cabeçalho (logo 14mm + respiro + régua). */
export const ALTURA_CABECALHO = 14 + 2 + 3.5;
/**
 * Fator de entrelinha do RODAPÉ. A referência usa `line-height: 1.35` só no
 * `.rod` — o resto do documento é 1.3. Reservar as três linhas com 1.3 deixava
 * o rodapé 1,34 mm mais curto do que ele ocupa, e a terceira linha encostava na
 * borda do papel. Achado pelo gate de geometria (04/09/2026).
 */
export const ENTRELINHA_RODAPE = 1.35;

/** Altura reservada ao rodapé: margem + respiro + 3 linhas de 8.5pt. */
export const ALTURA_RODAPE = 3.5 + 1.5 + 3 * (8.5 * (25.4 / 72) * ENTRELINHA_RODAPE);

/** Onde o corpo começa e termina — o que sobra depois de cabeçalho e rodapé. */
export const CORPO = {
  y: CAIXA.y + ALTURA_CABECALHO,
  altura: CAIXA.altura - ALTURA_CABECALHO - ALTURA_RODAPE,
} as const;

/** `CORPO.y + CORPO.altura` — a linha que o conteúdo não pode cruzar. */
export const LIMITE_CORPO = CORPO.y + CORPO.altura;

/** Um ponto tipográfico em mm. Usado onde a referência mede em pt. */
export const PT = 25.4 / 72;

/** Espessura das bordas da referência: `.6pt`. */
export const BORDA_FINA = 0.6 * PT;

/** A paleta do documento — cinzas da referência, não do design de tela. */
export const COR = {
  texto: '#000000',
  valor: '#1B3A6B',
  reguaCabecalho: '#808080',
  bordaTabela: '#808080',
  fundoCabecalhoTabela: '#d9d9d9',
  fundoRotulo: '#f2f2f2',
  // Medição de espessura: a MAIOR leitura em azul-petróleo sobre azul claro, a
  // MENOR em vermelho sobre vermelho claro. Numa grade de 40 números, é a menor
  // que decide se o equipamento continua operando — e ela precisa ser achada
  // sem o leitor varrer a tabela célula a célula.
  fundoMaiorEspessura: '#ddeef3',
  textoMaiorEspessura: '#0b4f60',
  fundoMenorEspessura: '#fbe4e4',
  textoMenorEspessura: '#a11c1c',
  fundoZebra: '#fafafa',
  bordaFoto: '#cfcfcf',
  nota: '#404040',
} as const;

/** Tamanhos em pt, como no CSS da referência. */
export const FONTE = {
  base: 10,
  tituloDoc: 24,
  subtituloDoc: 14,
  sigla: 12,
  banner: 10.5,
  faixa: 9,
  secao: 10,
  tabela: 8.5,
  tabelaCompacta: 8,
  cabecalho: 8.5,
  numDoc: 10,
  pagina: 7.5,
  rodape: 8.5,
  mini: 8.5,
  nota: 8,
} as const;

/** Altura de uma linha de texto naquele corpo, em mm (fator 1,3 da referência). */
export function alturaLinha(tamanhoPt: number, fator = 1.3): number {
  return tamanhoPt * PT * fator;
}
