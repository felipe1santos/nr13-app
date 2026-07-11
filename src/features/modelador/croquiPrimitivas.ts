// Primitivas puras de desenho técnico SVG do croqui 2D (fase 2.1 do Modelador de Vaso).
// Todas as funções ou retornam strings SVG ou empurram elementos em `parts: string[]`.
// Invariantes herdadas da fase 1 (ver croqui2dService.ts): coordenadas sempre clampadas pelo
// chamador, nenhum NaN/undefined emitido, texto do usuário sempre escapado via `esc()`.

export const STROKE = '#111';
export const FILL_BRANCO = '#fff';
export const STROKE_CL = '#888';
export const DASH_CL = '7,3,2,3';
export const DASH_OCULTO = '5,3';
export const DASH_COSTURA = '8,3';

/** Formata número em pt-BR (vírgula decimal, até `casas`; sem casas quando inteiro). */
export function fmt(v: number | null, casas = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Escapa `& < > " '` antes de interpolar uma string EDITÁVEL PELO USUÁRIO (ex.: `b.id`, o
 * identificador do bocal) dentro de um SVG que depois é injetado via `innerHTML` nas folhas do
 * relatório/prontuário. Sem isto, um id como `N<2&"x"` quebra a tag/atributo XML ou injeta markup
 * arbitrário. `&` precisa ser escapado PRIMEIRO (senão o `&amp;` gerado pelos escapes seguintes
 * seria re-escapado).
 */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Ponta de seta triangular (path 'd') apontando na direção `ang` (radianos, tela). */
export function seta(px: number, py: number, ang: number, tam = 6): string {
  const a1 = ang - 0.4;
  const a2 = ang + 0.4;
  const x1 = px - tam * Math.cos(a1);
  const y1 = py - tam * Math.sin(a1);
  const x2 = px - tam * Math.cos(a2);
  const y2 = py - tam * Math.sin(a2);
  return `M${px.toFixed(1)},${py.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} Z`;
}

/**
 * Rótulo sobre fundo branco, centralizado em (mx,my); reclampado ao viewBox quando `vbW`/`vbH`
 * dados (sem eles, ainda garante que o retângulo nunca fica com y negativo).
 */
function rotulo(parts: string[], mx: number, my: number, texto: string, vbW?: number, vbH?: number): void {
  const w = Math.max(15, texto.length * 5.4 + 6);
  const rectX = vbW === undefined ? mx - w / 2 : clamp(mx - w / 2, 2, Math.max(2, vbW - w - 2));
  const myC = clamp(my, 8, vbH === undefined ? Math.max(my, 8) : Math.max(8, vbH - 8));
  const textX = rectX + w / 2;
  parts.push(`<rect x="${rectX.toFixed(1)}" y="${(myC - 6).toFixed(1)}" width="${w.toFixed(1)}" height="12" fill="#fff"/>`);
  parts.push(`<text x="${textX.toFixed(1)}" y="${(myC + 3.3).toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="#111">${texto}</text>`);
}

/**
 * Cota linear: linha com setas triangulares nas duas pontas + rótulo centralizado sobre fundo
 * branco. `vbW` (largura do viewBox) é opcional: quando informado, o retângulo do rótulo é
 * reclampado para nunca ficar negativo nem ultrapassar a folha.
 */
export function cota(parts: string[], x1: number, y1: number, x2: number, y2: number, label: string, vbW?: number): void {
  parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${STROKE}" stroke-width="1"/>`);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  parts.push(`<path d="${seta(x2, y2, ang)}" fill="${STROKE}"/>`);
  parts.push(`<path d="${seta(x1, y1, ang + Math.PI)}" fill="${STROKE}"/>`);
  rotulo(parts, (x1 + x2) / 2, (y1 + y2) / 2, String(label), vbW);
}

/**
 * Cota angular: arco de `g1` a `g2` (graus na convenção do vaso: 0°=topo, sentido horário visto
 * de cima) com setas tangentes nas pontas e rótulo no meio do arco. Ignora arcos degenerados
 * (<0,5° ou >359,5°). Chamador garante que `cx/cy/r` cabem no viewBox.
 */
export function cotaAngular(parts: string[], cx: number, cy: number, r: number, g1: number, g2: number, label: string, vbW?: number): void {
  let a1 = ((g1 % 360) + 360) % 360;
  let a2 = ((g2 % 360) + 360) % 360;
  while (a2 <= a1) a2 += 360;
  const delta = a2 - a1;
  if (delta < 0.5 || delta > 359.5) return;
  const rad = (g: number) => ((g - 90) * Math.PI) / 180;
  const p1x = cx + r * Math.cos(rad(a1));
  const p1y = cy + r * Math.sin(rad(a1));
  const p2x = cx + r * Math.cos(rad(a2));
  const p2y = cy + r * Math.sin(rad(a2));
  const large = delta > 180 ? 1 : 0;
  parts.push(`<path d="M${p1x.toFixed(1)},${p1y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} 1 ${p2x.toFixed(1)},${p2y.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="0.9"/>`);
  // Setas tangentes ao arco, apontando para fora das pontas (sentido de percurso: horário).
  parts.push(`<path d="${seta(p1x, p1y, rad(a1) - Math.PI / 2, 5)}" fill="${STROKE}"/>`);
  parts.push(`<path d="${seta(p2x, p2y, rad(a2) + Math.PI / 2, 5)}" fill="${STROKE}"/>`);
  const gm = (a1 + a2) / 2;
  rotulo(parts, cx + (r + 10) * Math.cos(rad(gm)), cy + (r + 10) * Math.sin(rad(gm)), label, vbW);
}

/** Linha de costura (solda): traço fino tracejado, convenção de junta soldada do desenho técnico. */
export function costura(parts: string[], x1: number, y1: number, x2: number, y2: number): void {
  parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${STROKE}" stroke-width="0.7" stroke-dasharray="${DASH_COSTURA}"/>`);
}

/**
 * Callout com leader: ponto no alvo + linha até o texto (`t=4,5`, `Rc=1000`…). O texto ancora do
 * lado oposto ao alvo (start se o texto está à direita do alvo, end caso contrário).
 */
export function callout(parts: string[], xAlvo: number, yAlvo: number, xTexto: number, yTexto: number, label: string): void {
  parts.push(`<circle cx="${xAlvo.toFixed(1)}" cy="${yAlvo.toFixed(1)}" r="1.4" fill="${STROKE}"/>`);
  parts.push(`<line x1="${xAlvo.toFixed(1)}" y1="${yAlvo.toFixed(1)}" x2="${xTexto.toFixed(1)}" y2="${yTexto.toFixed(1)}" stroke="${STROKE}" stroke-width="0.7"/>`);
  const anchor = xTexto >= xAlvo ? 'start' : 'end';
  const dx = xTexto >= xAlvo ? 2 : -2;
  parts.push(`<text x="${(xTexto + dx).toFixed(1)}" y="${(yTexto + 3).toFixed(1)}" font-size="8.5" font-weight="700" text-anchor="${anchor}" fill="#111">${label}</text>`);
}

/** Balão de identificação de bocal (círculo + id centralizado), estilo prancha de fabricante. */
export function idBalao(parts: string[], x: number, y: number, textoEscapado: string, r = 8): void {
  parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#fff" stroke="${STROKE}" stroke-width="0.9"/>`);
  parts.push(`<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#111">${textoEscapado}</text>`);
}

function pontosPoly(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

export interface OpcoesBocal {
  /** Traço tracejado (bocal em face oculta) — sem fill branco, só contorno. */
  tracejado?: boolean;
}

/**
 * Bocal flangeado: pescoço (retângulo ao longo de `angRad`, a partir de `xBase/yBase` na
 * superfície do casco) + placa de flange perpendicular na ponta, como nas pranchas de referência.
 * `comp` = comprimento total (pescoço+flange) em px; `largura` = Ø do pescoço em px.
 * Retorna a ponta externa do flange (âncora para balão/label).
 */
export function bocalFlangeado(
  parts: string[],
  xBase: number,
  yBase: number,
  angRad: number,
  comp: number,
  largura: number,
  opts: OpcoesBocal = {},
): { x: number; y: number } {
  const ux = Math.cos(angRad);
  const uy = Math.sin(angRad);
  const vx = -uy;
  const vy = ux;
  const flangeThk = Math.max(2.5, comp * 0.18);
  const neckLen = Math.max(3, comp - flangeThk);
  const wN = largura / 2;
  const wF = Math.max(largura * 0.85, wN + 3);

  const p = (ao: number, lado: number): [number, number] => [xBase + ux * ao + vx * lado, yBase + uy * ao + vy * lado];

  const pesc: [number, number][] = [p(0, -wN), p(neckLen, -wN), p(neckLen, wN), p(0, wN)];
  const flan: [number, number][] = [p(neckLen, -wF), p(neckLen + flangeThk, -wF), p(neckLen + flangeThk, wF), p(neckLen, wF)];

  const estilo = opts.tracejado
    ? `fill="none" stroke="${STROKE}" stroke-width="0.9" stroke-dasharray="${DASH_OCULTO}"`
    : `fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="1"`;
  parts.push(`<polygon points="${pontosPoly(pesc)}" ${estilo}/>`);
  parts.push(`<polygon points="${pontosPoly(flan)}" ${estilo}/>`);

  return { x: xBase + ux * (neckLen + flangeThk), y: yBase + uy * (neckLen + flangeThk) };
}
