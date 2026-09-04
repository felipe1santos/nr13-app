import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import { BORDA_FINA, CAIXA, COR, PT } from './documentoA4';

/**
 * Fase 11 · a CURVA DE PRESSURIZAÇÃO do teste hidrostático, em vetor.
 *
 * ## De onde vem cada número
 *
 * Da folha `public/arquivos-inspecao/TESTE-HIDROSTATICO.html`, que desenha o
 * mesmo gráfico com Chart.js. **Nada aqui é fórmula nova**: os pontos são os de
 * `injecao.th.curva` (tempo em minutos, pressão em kgf/cm²), a pressão de teste
 * é lida do mesmo campo e pelo mesmo regex (`/[\d.]+/`), as faixas de cor são
 * os mesmos 50% e 80% da PT do plugin `pressurePlugin`, e a escala de calor é a
 * mesma `getHeatColor` com os mesmos cinco cortes e as mesmas cinco cores.
 *
 * ## O que é desenho, e está declarado
 *
 * Duas coisas do Chart.js não são dado e precisaram de decisão:
 *
 * 1. **A escala do eixo Y.** O Chart.js usa `beginAtZero` + `grace: '20%'` e
 *    escolhe os tiques por um algoritmo interno. Aqui o topo é
 *    `max(maiorPressão, PT) × 1,2` arredondado para cima num passo redondo
 *    (1 · 2 · 2,5 · 5 × 10ⁿ), mirando ~5 divisões. É apresentação, não medida:
 *    o valor impresso em cada ponto é o valor do dado, com as mesmas duas casas.
 * 2. **O gradiente.** O Chart.js pinta linha e preenchimento com um gradiente
 *    vertical contínuo. Um PDF vetorial não tem gradiente de traço, então cada
 *    SEGMENTO é traçado na cor do gradiente no seu ponto médio — os mesmos
 *    cinco `addColorStop`, interpolados. Visualmente é o mesmo desenho; por
 *    dentro é uma polilinha, que é justamente o que torna o PDF leve e nítido
 *    em qualquer zoom, em vez de uma captura de tela.
 *
 * O eixo X é **categórico**, como no Chart.js: os pontos são igualmente
 * espaçados por índice e o rótulo é o tempo digitado. Trocar por escala
 * numérica mudaria o desenho de um gráfico já emitido em relatórios antigos.
 */

/** Um ponto da curva, já lido do modelo. */
export interface PontoCurva {
  tempo: string;
  /** kgf/cm² — `null` quando o usuário deixou a pressão em branco. */
  pressao: number | null;
}

export interface DadosGraficoTh {
  pontos: PontoCurva[];
  /** Pressão de teste em kgf/cm², ou `null` quando não informada. */
  pressaoTeste: number | null;
}

/** O primeiro número de um texto — a MESMA leitura do template (`/[\d.]+/`). */
export function numeroDoTexto(v: string | null | undefined): number | null {
  const m = String(v ?? '').match(/[\d.]+/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * A curva do modelo (strings, como saem da folha) virando pontos numéricos.
 *
 * O template lê `parseFloat(input.value)` de um `<input type="number">` e trata
 * campo vazio como `null` — é a mesma leitura aqui, com a vírgula aceita porque
 * o dado pode ter vindo de um teclado brasileiro antes do campo virar numérico.
 * Ponto sem TEMPO não existe para o gráfico (o template também o descarta);
 * ponto com tempo e sem pressão vira um furo na linha, não um zero.
 */
export function pontosDaCurva(curva: { tempo: string; pressao: string }[]): PontoCurva[] {
  return curva
    .filter((l) => String(l.tempo ?? '').trim() !== '' && String(l.tempo).trim() !== '—')
    .map((l) => {
      const bruto = String(l.pressao ?? '').trim().replace(',', '.');
      const n = Number.parseFloat(bruto);
      return { tempo: String(l.tempo).trim(), pressao: Number.isFinite(n) ? n : null };
    });
}

/** `getHeatColor` do template, cortes e cores idênticos. */
export function corDeCalor(ratio: number): string {
  if (ratio <= 0) return '#2563eb';
  if (ratio <= 0.3) return '#16a34a';
  if (ratio <= 0.55) return '#ca8a04';
  if (ratio <= 0.75) return '#ea580c';
  return '#dc2626';
}

/** Os cinco `addColorStop` do gradiente da linha (posição 0 = topo). */
const GRADIENTE: [number, [number, number, number]][] = [
  [0.0, [220, 38, 38]],
  [0.22, [234, 88, 12]],
  [0.46, [202, 138, 4]],
  [0.72, [22, 163, 74]],
  [1.0, [37, 99, 235]],
];

function hex(c: [number, number, number]): string {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Cor do gradiente na posição `t` (0 = topo do gráfico, 1 = base). */
export function corDoGradiente(t: number): string {
  const p = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < GRADIENTE.length; i++) {
    const [pa, ca] = GRADIENTE[i - 1];
    const [pb, cb] = GRADIENTE[i];
    if (p <= pb) {
      const f = pb === pa ? 0 : (p - pa) / (pb - pa);
      return hex([ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]);
    }
  }
  return hex(GRADIENTE[GRADIENTE.length - 1][1]);
}

/** A mesma cor com alfa, já achatada sobre o branco do papel. */
function sobreBranco(cor: [number, number, number], alfa: number): string {
  return hex([
    255 - (255 - cor[0]) * alfa,
    255 - (255 - cor[1]) * alfa,
    255 - (255 - cor[2]) * alfa,
  ]);
}

/** As três faixas de fundo do plugin, achatadas sobre o branco. */
const FAIXA_CRITICA = sobreBranco([220, 38, 38], 0.07);
const FAIXA_ATENCAO = sobreBranco([202, 138, 4], 0.06);
const FAIXA_NORMAL = sobreBranco([22, 163, 74], 0.05);

/**
 * Topo do eixo Y e o passo dos tiques.
 *
 * `beginAtZero` + folga de 20% do Chart.js, com o topo arredondado para um
 * número redondo — um eixo terminando em "17,04 kgf/cm²" não se lê no papel.
 */
export function escalaY(valores: number[], pressaoTeste: number | null): { max: number; passo: number } {
  const candidatos = valores.filter((v) => Number.isFinite(v));
  if (pressaoTeste !== null) candidatos.push(pressaoTeste);
  const pico = candidatos.length > 0 ? Math.max(...candidatos) : 0;
  const alvo = pico > 0 ? pico * 1.2 : 1;

  const bruto = alvo / 5; // ~5 divisões
  const ordem = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / ordem;
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * ordem;
  return { max: Math.ceil(alvo / passo) * passo, passo };
}

/** Casas decimais do rótulo do tique — evita "0.30000000000000004". */
function rotuloTique(v: number, passo: number): string {
  const casas = passo >= 1 ? (Number.isInteger(passo) ? 0 : 1) : passo >= 0.1 ? 1 : 2;
  return v.toFixed(casas);
}

/** Geometria do quadro, em mm. */
const ALTURA = 76;
const PAD = { esquerda: 17, direita: 5, topo: 9, baixo: 13 } as const;

/** Quanto o gráfico ocupa na folha — o `Documento` usa para garantir espaço. */
export const ALTURA_GRAFICO_TH = ALTURA;

/**
 * Desenha o gráfico em `(CAIXA.x, y)` e devolve o `y` de baixo.
 *
 * Só desenha se houver pelo menos um ponto com pressão: um gráfico com eixos e
 * nenhuma curva não informa nada e ocupa um terço da folha.
 */
export function desenharGraficoTh(pdf: jsPDF, y: number, dados: DadosGraficoTh): number {
  const comValor = dados.pontos.filter((p) => p.pressao !== null);
  if (comValor.length === 0) return y;

  const x0 = CAIXA.x;
  const larg = CAIXA.largura;
  const plot = {
    x: x0 + PAD.esquerda,
    y: y + PAD.topo,
    largura: larg - PAD.esquerda - PAD.direita,
    altura: ALTURA - PAD.topo - PAD.baixo,
  };
  const base = plot.y + plot.altura;
  const { max: yMax, passo } = escalaY(
    dados.pontos.map((p) => p.pressao ?? Number.NaN),
    dados.pressaoTeste,
  );

  const paraY = (v: number) => base - (Math.min(Math.max(v, 0), yMax) / yMax) * plot.altura;
  const n = dados.pontos.length;
  const paraX = (i: number) => (n <= 1 ? plot.x + plot.largura / 2 : plot.x + (i / (n - 1)) * plot.largura);
  /** O mesmo `ratio` do plugin: posição do valor entre a base e o topo do eixo. */
  const ratio = (v: number) => Math.min(Math.max(v / yMax, 0), 1);

  // ── Moldura ───────────────────────────────────────────────────────────────
  pdf.setDrawColor(COR.bordaTabela);
  pdf.setLineWidth(BORDA_FINA);
  pdf.setFillColor('#ffffff');
  pdf.rect(x0, y, larg, ALTURA, 'FD');

  // ── Faixas de zona: verde 0–50% PT, amarelo 50–80%, vermelho 80%–PT ───────
  // Sem PT informada o plugin usa 90% do topo do eixo como referência. Acima da
  // PT o fundo fica branco, como no template: ali não há pressurização prevista.
  const pt = dados.pressaoTeste ?? yMax * 0.9;
  const faixas: [number, number, string][] = [
    [pt * 0.8, pt, FAIXA_CRITICA],
    [pt * 0.5, pt * 0.8, FAIXA_ATENCAO],
    [0, pt * 0.5, FAIXA_NORMAL],
  ];
  for (const [de, ate, cor] of faixas) {
    const yTopo = paraY(ate);
    const yBase = paraY(de);
    if (yBase - yTopo <= 0.05) continue;
    pdf.setFillColor(cor);
    pdf.rect(plot.x, yTopo, plot.largura, yBase - yTopo, 'F');
  }

  // ── Grade e tiques do eixo Y ──────────────────────────────────────────────
  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor('#4b5563');
  for (let v = 0; v <= yMax + 1e-9; v += passo) {
    const yv = paraY(v);
    pdf.setDrawColor('#e5e7eb');
    pdf.setLineWidth(0.15);
    pdf.line(plot.x, yv, plot.x + plot.largura, yv);
    pdf.text(rotuloTique(v, passo), plot.x - 1.2, yv + 0.8, { align: 'right' });
  }

  // ── Preenchimento sob a curva, segmento a segmento ────────────────────────
  // Cada trapézio recebe a cor do gradiente no seu ponto médio, achatada sobre
  // o branco com o mesmo alfa da faixa correspondente do `fillGrad`.
  const idx = dados.pontos.map((p, i) => ({ i, v: p.pressao })).filter((p) => p.v !== null) as {
    i: number;
    v: number;
  }[];
  for (let k = 1; k < idx.length; k++) {
    const a = idx[k - 1];
    const b = idx[k];
    const t = 1 - ratio((a.v + b.v) / 2);
    const corHex = corDoGradiente(t);
    const rgb: [number, number, number] = [
      parseInt(corHex.slice(1, 3), 16),
      parseInt(corHex.slice(3, 5), 16),
      parseInt(corHex.slice(5, 7), 16),
    ];
    // Alfa do `fillGrad` na mesma posição: 0,42 no topo → 0,06 na base.
    const alfa = 0.06 + (0.42 - 0.06) * (1 - t);
    pdf.setFillColor(sobreBranco(rgb, alfa));
    pdf.setDrawColor(sobreBranco(rgb, alfa));
    pdf.setLineWidth(0.01);
    const xa = paraX(a.i);
    const xb = paraX(b.i);
    pdf.lines(
      [
        [xb - xa, paraY(b.v) - paraY(a.v)],
        [0, base - paraY(b.v)],
        [xa - xb, 0],
      ],
      xa,
      paraY(a.v),
      [1, 1],
      'F',
      true,
    );
  }

  // ── A linha ───────────────────────────────────────────────────────────────
  pdf.setLineWidth(0.75);
  for (let k = 1; k < idx.length; k++) {
    const a = idx[k - 1];
    const b = idx[k];
    pdf.setDrawColor(corDoGradiente(1 - ratio((a.v + b.v) / 2)));
    pdf.line(paraX(a.i), paraY(a.v), paraX(b.i), paraY(b.v));
  }

  // ── Linha da pressão de teste, tracejada, com etiqueta ────────────────────
  if (dados.pressaoTeste !== null && dados.pressaoTeste <= yMax) {
    const yPt = paraY(dados.pressaoTeste);
    pdf.setDrawColor('#dc2626');
    pdf.setLineWidth(0.3);
    pdf.setLineDashPattern([1.5, 1], 0);
    pdf.line(plot.x, yPt, plot.x + plot.largura, yPt);
    pdf.setLineDashPattern([], 0);

    const etiqueta = `PT: ${dados.pressaoTeste.toFixed(1)} kgf/cm²`;
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(5.5);
    const largEtiq = pdf.getTextWidth(etiqueta) + 2;
    pdf.setFillColor('#dc2626');
    pdf.rect(plot.x + 1, yPt - 3.4, largEtiq, 3, 'F');
    pdf.setTextColor('#ffffff');
    pdf.text(etiqueta, plot.x + 2, yPt - 1.3);
  }

  // ── Pontos e valores ──────────────────────────────────────────────────────
  for (const p of idx) {
    const cor = corDeCalor(ratio(p.v));
    const px = paraX(p.i);
    const py = paraY(p.v);

    const rotulo = `${p.v.toFixed(2)} kgf/cm²`;
    pdf.setFont(FAMILIA, 'bold');
    pdf.setFontSize(5.5);
    const largRot = pdf.getTextWidth(rotulo) + 2.2;
    const xRot = Math.min(Math.max(px - largRot / 2, plot.x), plot.x + plot.largura - largRot);
    const yRot = Math.max(py - 5.6, y + 1);
    pdf.setFillColor('#ffffff');
    pdf.setDrawColor(cor);
    pdf.setLineWidth(0.22);
    pdf.roundedRect(xRot, yRot, largRot, 3.1, 0.7, 0.7, 'FD');
    pdf.setTextColor(cor);
    pdf.text(rotulo, xRot + largRot / 2, yRot + 2.2, { align: 'center' });

    pdf.setFillColor('#ffffff');
    pdf.setDrawColor(cor);
    pdf.setLineWidth(0.45);
    pdf.circle(px, py, 0.95, 'FD');
  }

  // ── Eixos, rótulos de tempo e títulos ─────────────────────────────────────
  pdf.setDrawColor('#9ca3af');
  pdf.setLineWidth(0.25);
  pdf.line(plot.x, base, plot.x + plot.largura, base);
  pdf.line(plot.x, plot.y, plot.x, base);

  pdf.setFont(FAMILIA, 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor('#4b5563');
  // Com muitos pontos os rótulos se encavalam: imprime 1 a cada `salto`.
  const salto = Math.max(1, Math.ceil(n / 14));
  dados.pontos.forEach((p, i) => {
    if (i % salto !== 0 && i !== n - 1) return;
    pdf.text(p.tempo, paraX(i), base + 3.2, { align: 'center' });
  });

  pdf.setFont(FAMILIA, 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(COR.texto);
  pdf.text('Tempo (minutos)', plot.x + plot.largura / 2, base + 7.4, { align: 'center' });
  pdf.text('Pressão (kgf/cm²)', x0 + 3.2, plot.y + plot.altura / 2, {
    align: 'center',
    angle: 90,
  });

  pdf.setLineWidth(BORDA_FINA);
  pdf.setDrawColor(COR.bordaTabela);
  pdf.setTextColor(COR.texto);
  return y + ALTURA;
}

/** Só para a documentação da geometria — 1 pt em mm, igual ao resto do módulo. */
export const PONTO_MM = PT;
