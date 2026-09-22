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

/** Altura total reservada para o croqui, em mm. */
export const ALTURA_CROQUI = 132;

const GEO = {
  /** Raio das vistas em planta (tampos). */
  raio: 23,
  /** Largura do costado na vista lateral. */
  largCasco: 52,
  /** Altura mínima e máxima do costado — cresce com o número de níveis. */
  altCascoMin: 34,
  altCascoMax: 74,
  /** Raio do marcador de ponto. */
  ponto: 1.15,
  /** Sobra entre a coluna do desenho e a coluna da legenda. */
  vao: 8,
};

const CORES = {
  linha: [90, 98, 108] as [number, number, number],
  guia: [176, 184, 194] as [number, number, number],
  ponto: [31, 87, 160] as [number, number, number],
  menor: [176, 58, 46] as [number, number, number],
  maior: [22, 122, 72] as [number, number, number],
  critico: [176, 58, 46] as [number, number, number],
  rotulo: [70, 77, 86] as [number, number, number],
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

function textoPequeno(pdf: jsPDF, t: string, x: number, y: number, tamanho = 5.4, alinhamento: 'left' | 'center' | 'right' = 'left'): void {
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(tamanho);
  rgb(pdf, CORES.rotulo, 'preenche');
  pdf.text(t, x, y, { align: alinhamento });
}

/**
 * Uma vista em PLANTA (tampo): círculo, eixos e os pontos nos ângulos reais.
 *
 * 0° à direita e o ângulo crescendo no sentido horário — a convenção do
 * desenho de caldeiraria, e a mesma da referência que o engenheiro enviou.
 */
function vistaPlanta(
  pdf: jsPDF,
  cx: number,
  cy: number,
  nivel: NivelCroqui | undefined,
  titulo: string,
): void {
  rgb(pdf, CORES.linha, 'traco');
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, GEO.raio, 'S');

  // Eixos de referência, tracejados, só para dar o norte da peça.
  rgb(pdf, CORES.guia, 'traco');
  pdf.setLineWidth(0.15);
  pdf.setLineDashPattern([0.8, 0.8], 0);
  pdf.line(cx - GEO.raio - 2, cy, cx + GEO.raio + 2, cy);
  pdf.line(cx, cy - GEO.raio - 2, cx, cy + GEO.raio + 2);
  pdf.setLineDashPattern([], 0);

  textoPequeno(pdf, titulo, cx, cy - GEO.raio - 5.2, 6, 'center');

  if (!nivel) {
    textoPequeno(pdf, 'sem pontos', cx, cy + 1, 5.2, 'center');
    return;
  }

  for (const p of nivel.pontos) {
    // -sen: o eixo Y do PDF cresce para baixo, e sem o sinal o 90° sairia em
    // cima quando a convenção o põe embaixo.
    const rad = (p.angulo * Math.PI) / 180;
    const px = cx + GEO.raio * 0.72 * Math.cos(rad);
    const py = cy + GEO.raio * 0.72 * Math.sin(rad);
    desenharPonto(pdf, px, py, p);
    // O rótulo sai para FORA do círculo, na direção do próprio ângulo: com 8
    // pontos, texto por dentro se sobrepõe ao vizinho.
    const lx = cx + (GEO.raio + 3.4) * Math.cos(rad);
    const ly = cy + (GEO.raio + 3.4) * Math.sin(rad) + 0.9;
    const alinha = Math.cos(rad) < -0.2 ? 'right' : Math.cos(rad) > 0.2 ? 'left' : 'center';
    textoPequeno(pdf, `${Math.round(p.angulo)}°`, lx, ly, 4.8, alinha as 'left');
  }
}

function desenharPonto(pdf: jsPDF, x: number, y: number, p: PontoCroqui): void {
  const cor = corDoPonto(p);
  rgb(pdf, cor, 'traco');
  pdf.setLineWidth(0.25);
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
 * A vista LATERAL do costado: um nível por linha da tabela.
 *
 * A altura do corpo cresce com o número de níveis até um teto, e o espaçamento
 * é dividido igualmente — é isso que mantém 2 níveis arejados e 8 legíveis sem
 * sobrepor rótulo (§17 do pedido).
 */
function vistaLateral(pdf: jsPDF, cx: number, topo: number, niveis: NivelCroqui[]): number {
  const altura = Math.max(
    GEO.altCascoMin,
    Math.min(GEO.altCascoMax, 14 + niveis.length * 11),
  );
  const x0 = cx - GEO.largCasco / 2;

  rgb(pdf, CORES.linha, 'traco');
  pdf.setLineWidth(0.3);
  pdf.rect(x0, topo, GEO.largCasco, altura, 'S');

  textoPequeno(pdf, 'COSTADO — VISTA LATERAL', cx, topo - 3.2, 6, 'center');

  if (niveis.length === 0) {
    textoPequeno(pdf, 'sem regiões de costado', cx, topo + altura / 2, 5.2, 'center');
    return topo + altura;
  }

  const passo = altura / (niveis.length + 1);
  niveis.forEach((n, i) => {
    const y = topo + passo * (i + 1);
    rgb(pdf, CORES.guia, 'traco');
    pdf.setLineWidth(0.15);
    pdf.setLineDashPattern([0.8, 0.8], 0);
    pdf.line(x0 - 3, y, x0 + GEO.largCasco + 3, y);
    pdf.setLineDashPattern([], 0);

    // Os pontos do nível, distribuídos na largura pela ORDEM do ângulo: a vista
    // lateral é uma planificação, e 0° fica na geratriz da esquerda.
    const n_ = n.pontos.length;
    n.pontos.forEach((p, j) => {
      const px = x0 + (GEO.largCasco * (j + 1)) / (n_ + 1);
      desenharPonto(pdf, px, y, p);
    });

    textoPequeno(pdf, n.sigla, x0 + GEO.largCasco + 4.4, y + 1.2, 5.4);
  });

  return topo + altura;
}

export interface DadosCroqui {
  modelo: ModeloCroqui;
  /** A tabela de leitura ao lado do desenho. */
  comTabela?: boolean;
}

/**
 * Desenha o croqui inteiro e devolve o `y` de saída.
 *
 * O layout é de duas colunas: as três vistas à esquerda, a leitura
 * ponto-a-ponto à direita. Em A4 isso deixa o desenho com ~70 mm de largura
 * útil e mantém todo texto em 5 pt ou mais — abaixo disso a folha impressa
 * deixa de ser legível, que é o limite que o §13 do pedido pede para respeitar.
 */
export function desenharCroquiEspessura(pdf: jsPDF, y: number, dados: DadosCroqui): number {
  const m = dados.modelo;
  const colDesenho = CAIXA.largura * 0.46;
  const cx = CAIXA.x + colDesenho / 2;
  let cursor = y + 6;

  // ── VISTA SUPERIOR ────────────────────────────────────────────────────────
  vistaPlanta(pdf, cx, cursor + GEO.raio, m.ts[0], 'TAMPO SUPERIOR — VISTA');
  cursor += GEO.raio * 2 + 9;

  // ── COSTADO ───────────────────────────────────────────────────────────────
  cursor = vistaLateral(pdf, cx, cursor + 3, m.casco) + 9;

  // ── VISTA INFERIOR ────────────────────────────────────────────────────────
  vistaPlanta(pdf, cx, cursor + GEO.raio, m.ti[0], 'TAMPO INFERIOR — VISTA');
  cursor += GEO.raio * 2 + 6;

  // ── COLUNA DA DIREITA: o que cada ponto do desenho vale ───────────────────
  const xLeg = CAIXA.x + colDesenho + GEO.vao;
  const largLeg = CAIXA.largura - colDesenho - GEO.vao;
  let yl = y + 6;

  textoPequeno(pdf, 'PONTOS E LEITURAS (mm)', xLeg, yl, 6);
  yl += 4;

  // A lista se divide em COLUNAS pelo total de pontos, não pelo estouro: com 24
  // leituras numa coluna só, a metade direita da folha ficava vazia e o texto
  // descia até o rodapé. A divisão é por contagem para as colunas saírem
  // parelhas — uma cheia e outra com três linhas é pior do que duas iguais.
  const colunas = largLeg > 70 && m.pontos.length > 12 ? 2 : 1;
  const largCol = largLeg / colunas;
  const alturaLinha = 4.1;
  const porColuna = Math.ceil(m.pontos.length / colunas);
  let yCol = yl;

  m.pontos.forEach((p, i) => {
    const coluna = Math.min(Math.floor(i / porColuna), colunas - 1);
    if (i % porColuna === 0) yCol = yl;
    if (yCol > y + ALTURA_CROQUI - 8) return;
    const x = xLeg + coluna * largCol;
    const cor = corDoPonto(p);
    rgb(pdf, cor, 'preenche');
    if (p.valor === null) {
      rgb(pdf, cor, 'traco');
      pdf.setLineWidth(0.25);
      rgb(pdf, [255, 255, 255], 'preenche');
      pdf.circle(x + 1.2, yCol - 1, GEO.ponto, 'FD');
    } else {
      pdf.circle(x + 1.2, yCol - 1, GEO.ponto, 'F');
    }
    textoPequeno(pdf, p.id, x + 4, yCol, 5.2);
    textoPequeno(pdf, p.valor === null ? 'não medido' : `${p.valor} mm`, x + largCol - 2, yCol, 5.2, 'right');
    yCol += alturaLinha;
  });

  // ── LEGENDA ───────────────────────────────────────────────────────────────
  const fimDaLista = yl + Math.min(porColuna, m.pontos.length) * alturaLinha;
  let yLeg = Math.max(cursor, fimDaLista) + 3;
  pdf.setLineWidth(0.15);
  rgb(pdf, CORES.guia, 'traco');
  pdf.line(CAIXA.x, yLeg, CAIXA.x + CAIXA.largura, yLeg);
  yLeg += 4;

  const itens: string[] = [
    'TS = tampo superior · C1, C2… = regiões do costado · TI = tampo inferior · número = ângulo em graus',
    'Ponto cheio = medido · ponto vazado = sem medição registrada (não é zero)',
    'Vermelho = menor leitura da região ou abaixo da mínima requerida · verde = maior leitura da região',
  ];
  for (const t of itens) {
    textoPequeno(pdf, t, CAIXA.x, yLeg, 5.2);
    yLeg += 3.6;
  }
  for (const r of m.requeridas) {
    textoPequeno(pdf, `Espessura mínima requerida — ${r.rotulo}: ${r.valor} mm`, CAIXA.x, yLeg, 5.2);
    yLeg += 3.6;
  }

  // Devolve o estado de texto do documento: quem desenha não pode deixar a
  // caneta com a cor e o corpo do croqui para a próxima linha da folha.
  pdf.setTextColor(COR.texto);
  pdf.setFontSize(FONTE.base);
  return yLeg;
}
