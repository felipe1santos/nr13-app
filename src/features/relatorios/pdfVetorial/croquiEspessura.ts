/**
 * O MAPA DOS PONTOS DE MEDIÇÃO DE ESPESSURA — folha 7.4.1 (21/09/2026).
 *
 * ## O que ele é
 *
 * A tabela 7.4 diz QUANTO cada ponto mediu. Ela não diz ONDE o ponto fica —
 * "Casco 2 / 90°" só vira um lugar na cabeça de quem já conhece o vaso. O
 * croqui é a outra metade: três vistas esquemáticas com os pontos nas posições
 * que a medição descreve, cada um com o mesmo identificador da tabela.
 *
 * ## Ele é DERIVADO, nunca desenhado à mão
 *
 * Entra `m.ultrassom.pontos` — exatamente o array que a tabela imprime — e sai
 * o desenho. Não há chave nova, não há editor de croqui, não há geometria
 * digitada: quantos níveis o costado tem, quantos ângulos cada região usa e
 * quais pontos existem são perguntas que a MEDIÇÃO já respondeu.
 *
 * Por isso nada aqui é hardcode: `N1/N2/N3` da referência do engenheiro é um
 * exemplo, não um formato. Duas regiões desenham dois níveis; oito desenham
 * oito. Quatro ângulos desenham quatro; três desenham três, a 0°, 120° e 240°.
 *
 * ## O que ele NÃO faz
 *
 * Não calcula espessura, não classifica, não decide aprovação. O destaque de
 * cada ponto vem de `destaqueMedida.ts` — a MESMA regra da tabela. E ponto sem
 * medição não vira zero: ele aparece vazado, com o rótulo, dizendo que existe e
 * não foi medido. Inventar `0,00 mm` num desenho técnico é pior do que deixar o
 * espaço em branco, porque um número não levanta suspeita.
 */
import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import { CAIXA, COR, FONTE } from './documentoA4';
import { abaixoDaRequerida, destaqueDaMedida, extremosDaRegiao, temMedida } from './destaqueMedida';

/** As regiões que a grade de medição conhece (`medicoesEspessura.REGIOES`). */
export type RegiaoCroqui = 'ts' | 'casco' | 'ti';

/** A linha da tabela 7.4, como o modelo a entrega. */
export interface LinhaMedicao {
  regiao: string;
  regiaoId?: RegiaoCroqui;
  ponto: string;
  angulos: string[];
  medidas: string[];
  menor: string | null;
  requerida: string | null;
}

/** Um ponto do desenho — e a sua linha na tabela. */
export interface PontoCroqui {
  /** `TS-0`, `C2-90`, `TI-270` — o mesmo rótulo que a legenda explica. */
  id: string;
  regiao: RegiaoCroqui;
  /** 1-based dentro da região: o "N" do costado. */
  nivel: number;
  /** O rótulo da linha na tabela (`Casco 2`) — a ponte para a 7.4. */
  ponto: string;
  /** Graus, já normalizado em [0, 360). */
  angulo: number;
  /** O texto exatamente como a tabela o imprime, ou `null` se não medido. */
  valor: string | null;
  destaque: 'maior' | 'menor' | null;
  /** Abaixo da espessura mínima requerida daquela linha. */
  critico: boolean;
}

export interface NivelCroqui {
  regiao: RegiaoCroqui;
  nivel: number;
  ponto: string;
  /** `C2`, `TS`, `TI` — o prefixo dos ids daquele nível. */
  sigla: string;
  angulos: number[];
  pontos: PontoCroqui[];
  requerida: string | null;
}

export interface ModeloCroqui {
  ts: NivelCroqui[];
  casco: NivelCroqui[];
  ti: NivelCroqui[];
  /** Todos os pontos, na ordem da tabela. */
  pontos: PontoCroqui[];
  /** Espessura mínima requerida por região, quando a região tem uma só. */
  requeridas: { regiao: RegiaoCroqui; rotulo: string; valor: string }[];
  /** Há pelo menos um ponto com medição? Sem isso a folha não é emitida. */
  temAlgo: boolean;
}

const SIGLA_REGIAO: Record<RegiaoCroqui, string> = { ts: 'TS', casco: 'C', ti: 'TI' };
const ROTULO_REGIAO: Record<RegiaoCroqui, string> = {
  ts: 'Tampo superior',
  casco: 'Costado',
  ti: 'Tampo inferior',
};

/**
 * A região de uma linha da tabela.
 *
 * `regiaoId` é a fonte; o título em português é o recuo para relatórios
 * salvos antes de 21/09/2026, cujo modelo serializado não tem o campo. O recuo
 * casa por PREFIXO sem acento e em minúsculas — "Tampo superior" e "TAMPO
 * SUPERIOR" são o mesmo lugar do vaso.
 */
export function regiaoDaLinha(l: LinhaMedicao): RegiaoCroqui {
  if (l.regiaoId === 'ts' || l.regiaoId === 'casco' || l.regiaoId === 'ti') return l.regiaoId;
  const t = l.regiao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (t.startsWith('tampo superior')) return 'ts';
  if (t.startsWith('tampo inferior')) return 'ti';
  return 'casco';
}

/** O ângulo em graus, normalizado. Texto ilegível vira `null`. */
export function anguloDoTexto(v: string | null | undefined): number | null {
  const limpo = String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '');
  // `Number('')` é 0, não NaN: sem esta guarda um cabeçalho ilegível viraria um
  // ponto a 0° que a tabela não tem — o croqui inventando medição.
  if (limpo === '' || limpo === '-' || limpo === '.') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  const g = ((n % 360) + 360) % 360;
  return Math.round(g * 10) / 10;
}

/**
 * Monta o modelo do croqui a partir das linhas da tabela.
 *
 * Função PURA: nenhuma leitura de storage, nenhum desenho. É ela que o teste
 * usa para provar que o número de níveis do croqui é o número de regiões do
 * dado, e que cada ponto do desenho aponta para a linha certa.
 */
export function modeloCroqui(linhas: LinhaMedicao[]): ModeloCroqui {
  const porRegiao: Record<RegiaoCroqui, NivelCroqui[]> = { ts: [], casco: [], ti: [] };
  const todos: PontoCroqui[] = [];

  // Os extremos são POR REGIÃO, como na tabela — e a tabela agrupa pelo título
  // impresso, então o agrupamento aqui precisa ser o mesmo para o destaque cair
  // no mesmo ponto nos dois desenhos.
  const extremosPorRegiao = new Map<string, { maior: number | null; menor: number | null }>();
  for (const l of linhas) {
    const daRegiao = linhas.filter((x) => x.regiao === l.regiao);
    if (!extremosPorRegiao.has(l.regiao)) extremosPorRegiao.set(l.regiao, extremosDaRegiao(daRegiao));
  }

  for (const l of linhas) {
    const regiao = regiaoDaLinha(l);
    const nivel = porRegiao[regiao].length + 1;
    const sigla = regiao === 'casco' ? `C${nivel}` : SIGLA_REGIAO[regiao];
    const ext = extremosPorRegiao.get(l.regiao) ?? { maior: null, menor: null };

    const angulos: number[] = [];
    const pontos: PontoCroqui[] = [];
    l.angulos.forEach((bruto, i) => {
      const angulo = anguloDoTexto(bruto);
      if (angulo === null) return;
      angulos.push(angulo);
      const cru = l.medidas[i];
      const valor = temMedida(cru) ? String(cru).trim() : null;
      const p: PontoCroqui = {
        id: `${sigla}-${Math.round(angulo)}`,
        regiao,
        nivel,
        ponto: l.ponto,
        angulo,
        valor,
        destaque: destaqueDaMedida(cru, ext.maior, ext.menor).destaque ?? null,
        critico: abaixoDaRequerida(cru, l.requerida),
      };
      pontos.push(p);
      todos.push(p);
    });

    porRegiao[regiao].push({
      regiao,
      nivel,
      ponto: l.ponto,
      sigla,
      angulos,
      pontos,
      requerida: l.requerida,
    });
  }

  // A mínima requerida por região só entra na legenda quando a região inteira
  // tem UM valor. Regiões com requeridas diferentes por nível não podem exibir
  // um número só: seria um limite que não vale para metade dos pontos.
  const requeridas: ModeloCroqui['requeridas'] = [];
  for (const regiao of ['ts', 'casco', 'ti'] as RegiaoCroqui[]) {
    const valores = new Set(
      porRegiao[regiao].map((n) => (n.requerida ?? '').trim()).filter((v) => v !== '' && v !== '—'),
    );
    if (valores.size === 1 && porRegiao[regiao].length > 0) {
      requeridas.push({ regiao, rotulo: ROTULO_REGIAO[regiao], valor: [...valores][0] });
    }
  }

  return {
    ...porRegiao,
    pontos: todos,
    requeridas,
    temAlgo: todos.some((p) => p.valor !== null),
  };
}

// ── DESENHO ─────────────────────────────────────────────────────────────────

/**
 * ## O layout da folha (21/09/2026 · 2ª rodada)
 *
 * ```
 *  ┌── coluna esquerda ──┐        ┌──── coluna direita ────┐
 *  │  TAMPO SUPERIOR     │        │  COSTADO (planificado) │
 *  │  TAMPO INFERIOR     │        │  ...                   │
 *  │                     │        │  legenda (canto inf.)  │
 * ```
 *
 * A primeira versão empilhava as TRÊS vistas numa coluna estreita e gastava a
 * metade direita da folha com a lista "PONTOS E LEITURAS" — os mesmos números
 * que a folha 7.4, logo antes, já imprime numa tabela. Repetir o valor não
 * ajuda a achar o ponto, e era o que obrigava o desenho a caber em 46% da
 * largura, com texto de 4,8 pt.
 *
 * Sem a lista, o desenho ocupa a folha inteira: os tampos dobraram de raio, o
 * marcador de ponto quase dobrou e nenhum texto desta folha desce abaixo de
 * 7 pt.
 */

/** Geometria, em mm. Tudo que o desenho mede sai daqui. */
const GEO = {
  /** Raio das vistas em planta (tampos). */
  raioTampo: 38,
  /** Distância do centro até o anel de pontos, como fração do raio. */
  anelPontos: 0.74,
  /** Folga entre o círculo e o rótulo do ângulo. */
  folgaRotulo: 5,
  /** Largura da coluna da esquerda (as duas plantas). */
  colEsquerda: 92,
  /** Vão entre as duas colunas. */
  vao: 6,
  /** Recuo do costado dentro da coluna direita — abre espaço para os rótulos
   *  de nível (C1, C2…), que ficam FORA do quadro, à esquerda dele. */
  recuoCasco: 4,
  /** Largura do costado planificado. */
  largCasco: 74,
  /** Altura do costado — cresce com o número de níveis, entre estes limites. */
  altCascoMin: 86,
  /**
   * O teto do costado não é estético: com 12 níveis e a legenda quebrada em
   * duas linhas, 164 mm faziam `garantirEspaco` recusar a folha e partir o
   * croqui em duas páginas — banner e identificação numa, o desenho na outra.
   * O limite real é o que sobra do corpo A4 depois do cabeçalho de
   * identificação; 148 mm cabe no pior caso medido (12 × 12).
   */
  altCascoMax: 148,
  /** Raio do marcador de ponto. */
  ponto: 2.1,
  /** Altura do bloco de legenda (a convenção quebrada + os marcadores). */
  alturaLegenda: 24,
} as const;

/** Corpos de texto desta folha. Nenhum desce abaixo de 7 pt (§4 do pedido). */
const TIPO = {
  titulo: 8.5,
  angulo: 7,
  nivel: 7.5,
  legenda: 7,
  aviso: 7.5,
} as const;

const CORES = {
  linha: [64, 72, 82] as [number, number, number],
  guia: [168, 177, 188] as [number, number, number],
  ponto: [31, 87, 160] as [number, number, number],
  menor: [176, 58, 46] as [number, number, number],
  maior: [22, 122, 72] as [number, number, number],
  critico: [176, 58, 46] as [number, number, number],
  rotulo: [48, 55, 64] as [number, number, number],
};

function rgb(pdf: jsPDF, c: [number, number, number], onde: 'traco' | 'preenche'): void {
  if (onde === 'traco') pdf.setDrawColor(c[0], c[1], c[2]);
  else pdf.setFillColor(c[0], c[1], c[2]);
}

/** A cor de um ponto — a mesma semântica da tabela, mais o abaixo do mínimo. */
function corDoPonto(p: PontoCroqui): [number, number, number] {
  if (p.critico) return CORES.critico;
  if (p.destaque === 'menor') return CORES.menor;
  if (p.destaque === 'maior') return CORES.maior;
  return CORES.ponto;
}

function texto(
  pdf: jsPDF,
  t: string,
  x: number,
  y: number,
  tamanho: number,
  alinhamento: 'left' | 'center' | 'right' = 'left',
  cor: [number, number, number] = CORES.rotulo,
): void {
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(tamanho);
  rgb(pdf, cor, 'preenche');
  pdf.text(t, x, y, { align: alinhamento });
}

function tituloVista(
  pdf: jsPDF,
  t: string,
  x: number,
  y: number,
  alinhamento: 'left' | 'center' = 'center',
): void {
  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(TIPO.titulo);
  rgb(pdf, CORES.linha, 'preenche');
  pdf.text(t, x, y, { align: alinhamento });
  pdf.setFont(FAMILIA, 'normal');
}

function desenharPonto(pdf: jsPDF, x: number, y: number, p: PontoCroqui): void {
  const cor = corDoPonto(p);
  rgb(pdf, cor, 'traco');
  pdf.setLineWidth(0.4);
  if (p.valor === null) {
    // NÃO MEDIDO: círculo vazado. O ponto existe na malha e não tem leitura —
    // e é isso que o desenho precisa dizer, em vez de um zero.
    rgb(pdf, [255, 255, 255], 'preenche');
    pdf.circle(x, y, GEO.ponto, 'FD');
  } else {
    rgb(pdf, cor, 'preenche');
    pdf.circle(x, y, GEO.ponto, 'F');
  }
}

/**
 * Uma vista em PLANTA (tampo): círculo, eixos e os pontos nos ângulos reais.
 *
 * 0° à direita e o ângulo crescendo no sentido horário — a convenção do
 * desenho de caldeiraria, e a mesma da referência que o engenheiro enviou.
 *
 * O número de pontos é o do DADO: três ângulos desenham três, doze desenham
 * doze. Nada aqui conhece "0/90/180/270".
 */
function vistaPlanta(
  pdf: jsPDF,
  cx: number,
  cy: number,
  nivel: NivelCroqui | undefined,
  titulo: string,
): void {
  const R = GEO.raioTampo;

  rgb(pdf, CORES.linha, 'traco');
  pdf.setLineWidth(0.5);
  pdf.circle(cx, cy, R, 'S');

  // Eixos de referência, tracejados, só para dar o norte da peça.
  rgb(pdf, CORES.guia, 'traco');
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.line(cx - R - 2, cy, cx + R + 2, cy);
  pdf.line(cx, cy - R - 2, cx, cy + R + 2);
  pdf.setLineDashPattern([], 0);

  tituloVista(pdf, titulo, cx, cy - R - GEO.folgaRotulo - 4.5);

  if (!nivel || nivel.pontos.length === 0) {
    texto(pdf, 'sem pontos medidos', cx, cy + 1, TIPO.aviso, 'center');
    return;
  }

  for (const p of nivel.pontos) {
    const rad = (p.angulo * Math.PI) / 180;
    const px = cx + R * GEO.anelPontos * Math.cos(rad);
    const py = cy + R * GEO.anelPontos * Math.sin(rad);

    // O raio do centro até o ponto: mostra que a leitura é na parede, e liga
    // o marcador ao rótulo do ângulo que fica logo além dele.
    rgb(pdf, CORES.guia, 'traco');
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([0.7, 0.9], 0);
    pdf.line(cx, cy, px, py);
    pdf.setLineDashPattern([], 0);

    desenharPonto(pdf, px, py, p);

    // O rótulo sai para FORA do círculo, na direção do próprio ângulo: por
    // dentro ele se sobreporia ao vizinho assim que a malha passa de 6 pontos.
    const lx = cx + (R + GEO.folgaRotulo) * Math.cos(rad);
    const ly = cy + (R + GEO.folgaRotulo) * Math.sin(rad) + 1.1;
    const alinha = Math.cos(rad) < -0.25 ? 'right' : Math.cos(rad) > 0.25 ? 'left' : 'center';
    texto(pdf, `${Math.round(p.angulo)}°`, lx, ly, TIPO.angulo, alinha as 'left');
  }
}

/**
 * Os ângulos COMUNS a todos os níveis do costado, ou `null`.
 *
 * O cabeçalho de ângulos da vista planificada só pode existir se todos os
 * níveis tiverem a MESMA malha — que é o caso real (o número de colunas é uma
 * configuração da região, não da linha). Divergindo, o cabeçalho sairia
 * mentindo sobre metade dos pontos, e é melhor não ter cabeçalho nenhum.
 */
export function angulosComunsDoCasco(niveis: NivelCroqui[]): number[] | null {
  if (niveis.length === 0) return null;
  const chave = (n: NivelCroqui) => n.angulos.join('|');
  const primeiro = chave(niveis[0]);
  if (niveis.some((n) => chave(n) !== primeiro)) return null;
  return niveis[0].angulos.length > 0 ? niveis[0].angulos.slice() : null;
}

/** A altura que o costado ocupa com `n` níveis. */
export function alturaDoCasco(n: number): number {
  return Math.max(GEO.altCascoMin, Math.min(GEO.altCascoMax, 16 + n * 13));
}

/**
 * A vista LATERAL do costado, planificada: um nível por linha da tabela e uma
 * coluna por ângulo.
 *
 * O ponto fica no cruzamento — nível (C1, C2…) à esquerda, ângulo no topo. É
 * assim que o desenho identifica cada ponto sem escrever `C2-90` dentro do
 * quadro: com 8 níveis × 12 ângulos seriam 96 etiquetas sobrepostas.
 */
function vistaCostado(pdf: jsPDF, xEsq: number, topo: number, niveis: NivelCroqui[]): number {
  const largura = GEO.largCasco;
  const altura = alturaDoCasco(niveis.length);

  tituloVista(pdf, 'COSTADO — VISTA PLANIFICADA', xEsq, topo - 8.5, 'left');

  rgb(pdf, CORES.linha, 'traco');
  pdf.setLineWidth(0.5);
  pdf.rect(xEsq, topo, largura, altura, 'S');

  if (niveis.length === 0) {
    texto(pdf, 'sem níveis de costado', xEsq + largura / 2, topo + altura / 2, TIPO.aviso, 'center');
    return topo + altura;
  }

  const posX = (i: number, total: number) => xEsq + (largura * (i + 1)) / (total + 1);

  // Cabeçalho de ângulos, quando todos os níveis compartilham a mesma malha.
  const comuns = angulosComunsDoCasco(niveis);
  if (comuns) {
    comuns.forEach((a, i) => {
      texto(pdf, `${Math.round(a)}°`, posX(i, comuns.length), topo - 2.2, TIPO.angulo, 'center');
    });
  }

  const passo = altura / (niveis.length + 1);
  niveis.forEach((n, i) => {
    const y = topo + passo * (i + 1);

    rgb(pdf, CORES.guia, 'traco');
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(xEsq, y, xEsq + largura, y);
    pdf.setLineDashPattern([], 0);

    n.pontos.forEach((p, j) => desenharPonto(pdf, posX(j, n.pontos.length), y, p));

    texto(pdf, n.sigla, xEsq - 2.5, y + 1.3, TIPO.nivel, 'right');
  });

  return topo + altura;
}

/** Um marcador da legenda, desenhado como o ponto que ele explica. */
function marcadorLegenda(
  pdf: jsPDF,
  x: number,
  y: number,
  cor: [number, number, number],
  cheio: boolean,
): void {
  rgb(pdf, cor, 'traco');
  pdf.setLineWidth(0.4);
  if (cheio) {
    rgb(pdf, cor, 'preenche');
    pdf.circle(x, y, GEO.ponto, 'F');
  } else {
    rgb(pdf, [255, 255, 255], 'preenche');
    pdf.circle(x, y, GEO.ponto, 'FD');
  }
}

/**
 * A legenda — no canto inferior DIREITO, abaixo do costado.
 *
 * Duas linhas, e só: a convenção dos identificadores numa, o significado dos
 * marcadores na outra, com os marcadores DESENHADOS em vez de descritos. Um
 * círculo vazado explica-se melhor do que a frase "ponto vazado".
 */
function legenda(pdf: jsPDF, x: number, y: number): number {
  // O limite é a margem direita da folha. A 1ª versão emendava os quatro
  // marcadores numa linha só e o último saía CORTADO na borda do papel —
  // visto no PDF, não no código: em mm a conta fechava, mas a largura real do
  // texto depende da fonte, e só `getTextWidth` sabe dela.
  const limite = CAIXA.x + CAIXA.largura;
  const largura = limite - x;

  // A linha da convenção também precisa quebrar: na malha de 12 ela passava da
  // margem e terminava em "…ângulo em gra". Quem sabe a largura real do texto
  // é a fonte, então quem quebra é o jsPDF, não uma contagem de caracteres.
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(TIPO.legenda);
  const convencao: string[] = pdf.splitTextToSize(
    'TS = tampo superior · C1…Cn = níveis do costado · TI = tampo inferior · números = ângulo em graus',
    largura,
  );
  let linha = y;
  for (const l of convencao) {
    texto(pdf, l, x, linha, TIPO.legenda);
    linha += 4;
  }

  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(TIPO.legenda);
  linha += 1.5;
  let cursor = x;
  const item = (cor: [number, number, number], cheio: boolean, rot: string) => {
    const largura = GEO.ponto * 2 + 2.2 + pdf.getTextWidth(rot);
    if (cursor > x && cursor + largura > limite) {
      linha += 4.6;
      cursor = x;
    }
    marcadorLegenda(pdf, cursor + GEO.ponto, linha - 1, cor, cheio);
    texto(pdf, rot, cursor + GEO.ponto * 2 + 2.2, linha, TIPO.legenda);
    cursor += largura + 5;
  };
  item(CORES.ponto, true, 'medido');
  item(CORES.ponto, false, 'sem medição (não é zero)');
  item(CORES.menor, true, 'menor / abaixo da mínima');
  item(CORES.maior, true, 'maior da região');

  return linha + 3;
}

export interface DadosCroqui {
  modelo: ModeloCroqui;
}

/**
 * A altura que a folha precisa reservar para este croqui, em mm.
 *
 * Calculada a partir do MODELO, não fixa: um costado de 12 níveis ocupa mais
 * papel do que um de 2, e `garantirEspaco` precisa saber disso ANTES de
 * desenhar qualquer coisa.
 */
export function alturaDoCroqui(m: ModeloCroqui): number {
  const alturaPlantas = 2 * (GEO.raioTampo * 2 + GEO.folgaRotulo * 2 + 9) + 6;
  const alturaDireita = 12 + alturaDoCasco(m.casco.length) + 9 + GEO.alturaLegenda;
  return Math.max(alturaPlantas, alturaDireita) + 6;
}

/**
 * Desenha o croqui inteiro e devolve o `y` de saída.
 *
 * Duas colunas: as PLANTAS dos tampos à esquerda (superior em cima, inferior
 * embaixo), o COSTADO planificado à direita, a legenda no canto inferior
 * direito. Nenhum valor de medição é repetido — eles estão na folha 7.4.
 */
export function desenharCroquiEspessura(pdf: jsPDF, y: number, dados: DadosCroqui): number {
  const m = dados.modelo;
  const y0 = y + 4;

  // ── COLUNA ESQUERDA · as duas plantas ─────────────────────────────────────
  const cxTampo = CAIXA.x + GEO.colEsquerda / 2;
  const alturaBloco = GEO.raioTampo * 2 + GEO.folgaRotulo * 2 + 9;
  const cyTS = y0 + 9 + GEO.folgaRotulo + GEO.raioTampo;
  const cyTI = cyTS + alturaBloco + 6;

  vistaPlanta(pdf, cxTampo, cyTS, m.ts[0], 'TAMPO SUPERIOR (TS)');
  vistaPlanta(pdf, cxTampo, cyTI, m.ti[0], 'TAMPO INFERIOR (TI)');
  const fimEsquerda = cyTI + GEO.raioTampo + GEO.folgaRotulo + 4;

  // ── COLUNA DIREITA · o costado e a legenda ────────────────────────────────
  const xDir = CAIXA.x + GEO.colEsquerda + GEO.vao;
  const fimCasco = vistaCostado(pdf, xDir + GEO.recuoCasco, y0 + 12, m.casco);

  // A legenda mora no canto inferior direito: desce até a base do conteúdo e
  // nunca encavala o costado quando ele é alto.
  const yLegenda = Math.max(fimCasco + 9, fimEsquerda - GEO.alturaLegenda + 6);
  const fimLegenda = legenda(pdf, xDir, yLegenda);

  // Devolve o estado de texto do documento: quem desenha não pode deixar a
  // caneta com a cor e o corpo do croqui para a próxima linha da folha.
  pdf.setTextColor(COR.texto);
  pdf.setFontSize(FONTE.base);
  pdf.setFont(FAMILIA, 'normal');
  return Math.max(fimEsquerda, fimLegenda) + 2;
}
