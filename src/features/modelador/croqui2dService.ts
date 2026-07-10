// Gerador de croqui 2D técnico do vaso modelado (fase 2 do Modelador de Vaso).
// Produz 3 SVGs auto-contidos (sem CSS externo): vista longitudinal, vista transversal (topo)
// e detalhe do tampo — no mesmo traço técnico do croqui da folha 2 da fase 1
// (`public/arquivos-prontuario/PRONT-CROQUI2D.html`, funções `seta`/`cota`), portado para TS.
//
// Lições da fase 1 (não repetir):
// 1. Rótulos nas bordas do viewBox são cortados — manter margem interna ≥14px em todo anchor de texto.
// 2. Toda coordenada deve ser clampada — nenhum atributo pode ficar negativo nem além do viewBox.
// 3. Nunca emitir NaN/undefined — todo número passa por `num()` e aborta cedo (retorna null).
import { circunferenciaMm, comprimentoTotalMm, dimensoesTampo, num } from './geometriaVaso';
import type { ModeloVaso, TampoModelo, TipoTampoModelo } from './tiposModelador';

export interface Croquis2d {
  longitudinal: string;
  transversal: string;
  detalheTampo: string;
}

const STROKE = '#444';
const FILL_CASCO = '#f3f4f6';
const STROKE_CL = '#888';

/** Formata número em pt-BR (vírgula decimal, até 1 casa; sem casas quando inteiro). */
function fmt(v: number | null, casas = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function clamp(v: number, min: number, max: number): number {
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
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Ponta de seta triangular (path 'd'), mesmo formato de `seta()` do PRONT-CROQUI2D.html. */
function seta(px: number, py: number, ang: number, tam = 6): string {
  const a1 = ang - 0.4;
  const a2 = ang + 0.4;
  const x1 = px - tam * Math.cos(a1);
  const y1 = py - tam * Math.sin(a1);
  const x2 = px - tam * Math.cos(a2);
  const y2 = py - tam * Math.sin(a2);
  return `M${px},${py} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} Z`;
}

/**
 * Cota: linha com setas triangulares nas duas pontas + rótulo centralizado sobre fundo branco.
 * `vbW` (largura do viewBox) é opcional: quando informado, o retângulo do rótulo é reclampado
 * para nunca ficar negativo nem ultrapassar a folha — cotas verticais próximas da margem esquerda
 * (comum na vista longitudinal vertical) senão empurram o rótulo para x negativo.
 */
function cota(parts: string[], x1: number, y1: number, x2: number, y2: number, label: string, vbW?: number): void {
  parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${STROKE}" stroke-width="1.1"/>`);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  parts.push(`<path d="${seta(x2, y2, ang)}" fill="${STROKE}"/>`);
  parts.push(`<path d="${seta(x1, y1, ang + Math.PI)}" fill="${STROKE}"/>`);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const texto = String(label);
  const w = Math.max(15, texto.length * 6 + 6);
  const rectX = vbW === undefined ? mx - w / 2 : clamp(mx - w / 2, 2, Math.max(2, vbW - w - 2));
  const textX = rectX + w / 2;
  parts.push(`<rect x="${rectX.toFixed(1)}" y="${(my - 6.5).toFixed(1)}" width="${w.toFixed(1)}" height="13" fill="#fff"/>`);
  parts.push(`<text x="${textX.toFixed(1)}" y="${(my + 3.3).toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="#111">${texto}</text>`);
}

function tipoTampoPorExtenso(tipo: TipoTampoModelo): string {
  switch (tipo) {
    case 'eliptico':
      return 'Tampo Elíptico 2:1';
    case 'toriesferico':
      return 'Tampo Toriesférico (Klopper)';
    case 'hemisferico':
      return 'Tampo Hemisférico';
    case 'plano':
      return 'Tampo Plano';
  }
}

interface DadosBase {
  D: number;
  L: number;
  tCasco: number;
  t1: number;
  t2: number;
  prof1: number;
  prof2: number;
  comprTotal: number;
  circunf: number;
}

function coletarDadosBase(m: ModeloVaso): DadosBase | null {
  const D = num(m.diametroInterno);
  const L = num(m.comprimentoCilindro);
  const tCasco = num(m.espessuraCasco);
  const t1 = num(m.tampo1.espessura);
  const t2 = num(m.tampo2.espessura);
  if (D === null || L === null || tCasco === null || t1 === null || t2 === null) return null;
  if (D <= 0 || L <= 0 || tCasco <= 0) return null;

  const comprTotal = comprimentoTotalMm(m);
  const circunf = circunferenciaMm(m);
  if (comprTotal === null || circunf === null) return null;

  const dim1 = dimensoesTampo(m.tampo1.tipo, D, t1);
  const dim2 = dimensoesTampo(m.tampo2.tipo, D, t2);

  return { D, L, tCasco, t1, t2, prof1: dim1.profundidade, prof2: dim2.profundidade, comprTotal, circunf };
}

// ───────────────────────── Vista longitudinal ─────────────────────────

/** Perfil de um tampo (path 'd') encaixado à esquerda ou direita de um retângulo [xCasco, xCasco±profPx]. */
function pathTampo(tipo: TipoTampoModelo, xCasco: number, yTop: number, yBottom: number, profPx: number, ladoDireito: boolean): string {
  const xPonta = ladoDireito ? xCasco + profPx : xCasco - profPx;
  switch (tipo) {
    case 'plano': {
      // Reta vertical (tampo chato).
      return `M${xCasco.toFixed(1)},${yTop.toFixed(1)} L${xPonta.toFixed(1)},${yTop.toFixed(1)} L${xPonta.toFixed(1)},${yBottom.toFixed(1)} L${xCasco.toFixed(1)},${yBottom.toFixed(1)} Z`;
    }
    case 'hemisferico': {
      // Semicírculo verdadeiro: raio = metade da altura do casco.
      const r = (yBottom - yTop) / 2;
      const large = 0; // semicírculo (180°) — sweep controla o lado
      const sweep = ladoDireito ? 1 : 0;
      return `M${xCasco.toFixed(1)},${yTop.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} ${sweep} ${xCasco.toFixed(1)},${yBottom.toFixed(1)} Z`;
    }
    case 'eliptico':
    case 'toriesferico':
    default: {
      // Arco elíptico/toriesférico (SVG elliptical arc — bojo até xPonta).
      const sweep = ladoDireito ? 1 : 0;
      const rx = profPx;
      const ry = (yBottom - yTop) / 2;
      return `M${xCasco.toFixed(1)},${yTop.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 ${sweep} ${xCasco.toFixed(1)},${yBottom.toFixed(1)} Z`;
    }
  }
}

/**
 * Perfil de um tampo (path 'd') encaixado em cima ou embaixo de um retângulo [xEsq, xDir] a
 * partir da linha do casco `yCasco` (variante vertical de `pathTampo`, chord horizontal).
 */
function pathTampoVertical(tipo: TipoTampoModelo, yCasco: number, xEsq: number, xDir: number, profPx: number, ladoBaixo: boolean): string {
  const yPonta = ladoBaixo ? yCasco + profPx : yCasco - profPx;
  switch (tipo) {
    case 'plano': {
      return `M${xEsq.toFixed(1)},${yCasco.toFixed(1)} L${xEsq.toFixed(1)},${yPonta.toFixed(1)} L${xDir.toFixed(1)},${yPonta.toFixed(1)} L${xDir.toFixed(1)},${yCasco.toFixed(1)} Z`;
    }
    case 'hemisferico': {
      const r = (xDir - xEsq) / 2;
      const large = 0;
      // sweep=1 percorre o arco em sentido horário (esquerda→cima→direita); sweep=0 vai por baixo.
      const sweep = ladoBaixo ? 0 : 1;
      return `M${xEsq.toFixed(1)},${yCasco.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} ${sweep} ${xDir.toFixed(1)},${yCasco.toFixed(1)} Z`;
    }
    case 'eliptico':
    case 'toriesferico':
    default: {
      const sweep = ladoBaixo ? 0 : 1;
      const rx = (xDir - xEsq) / 2;
      const ry = profPx;
      return `M${xEsq.toFixed(1)},${yCasco.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 ${sweep} ${xDir.toFixed(1)},${yCasco.toFixed(1)} Z`;
    }
  }
}

function svgLongitudinalHorizontal(m: ModeloVaso, d: DadosBase): string {
  const VB_W = 720;
  const VB_H = 420;
  const MARGIN = 14;
  const AREA_W = VB_W - 2 * MARGIN - 40; // reserva p/ cotas verticais à esquerda
  const AREA_H = VB_H - 2 * MARGIN - 80; // reserva p/ cotas horizontais em cima/embaixo + suporte

  const DExterno = d.D + 2 * d.tCasco;
  const scale = clamp(Math.min(AREA_W / d.comprTotal, AREA_H / DExterno), 0.001, 5);

  const comprPx = clamp(d.comprTotal * scale, 60, VB_W - 2 * MARGIN - 40);
  const Dpx = clamp(DExterno * scale, 30, VB_H - 2 * MARGIN - 80);
  const prof1Px = clamp(d.prof1 * scale, 8, comprPx * 0.4);
  const prof2Px = clamp(d.prof2 * scale, 8, comprPx * 0.4);
  const cilPx = clamp(comprPx - prof1Px - prof2Px, 10, comprPx);

  const xEsq = clamp(MARGIN + 50, MARGIN, VB_W - MARGIN);
  const xCascoEsq = clamp(xEsq + prof1Px, MARGIN, VB_W - MARGIN);
  const xCascoDir = clamp(xCascoEsq + cilPx, MARGIN, VB_W - MARGIN);
  const xDir = clamp(xCascoDir + prof2Px, MARGIN, VB_W - MARGIN);

  const yTop = clamp(70, MARGIN, VB_H - MARGIN);
  const yBottom = clamp(yTop + Dpx, MARGIN, VB_H - MARGIN - 60);
  const yCentro = (yTop + yBottom) / 2;

  const parts: string[] = [];

  // Tampos + costado
  parts.push(`<path d="${pathTampo(m.tampo1.tipo, xCascoEsq, yTop, yBottom, prof1Px, false)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
  parts.push(`<path d="${pathTampo(m.tampo2.tipo, xCascoDir, yTop, yBottom, prof2Px, true)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
  parts.push(`<rect x="${xCascoEsq.toFixed(1)}" y="${yTop.toFixed(1)}" width="${(xCascoDir - xCascoEsq).toFixed(1)}" height="${Dpx.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);

  // Linha de centro (CL) tracejada
  const clX1 = clamp(xEsq - 12, MARGIN, VB_W - MARGIN);
  const clX2 = clamp(xDir + 12, MARGIN, VB_W - MARGIN);
  parts.push(`<line x1="${clX1.toFixed(1)}" y1="${yCentro.toFixed(1)}" x2="${clX2.toFixed(1)}" y2="${yCentro.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="0.7" stroke-dasharray="7,3,2,3"/>`);
  parts.push(`<text x="${clamp(clX2 + 4, MARGIN, VB_W - MARGIN).toFixed(1)}" y="${(yCentro + 2.5).toFixed(1)}" font-size="8" fill="${STROKE_CL}">CL</text>`);

  // Suporte (saia / pés / selas) — bloco simples abaixo do casco.
  if (m.suporte.tipo !== 'nenhum') {
    const suporteAltura = clamp(24, 10, VB_H - yBottom - MARGIN - 20);
    if (m.suporte.tipo === 'saia') {
      const wSaia = clamp((xCascoDir - xCascoEsq) * 0.5, 20, xCascoDir - xCascoEsq);
      const xSaia = clamp(xCascoEsq + (xCascoDir - xCascoEsq - wSaia) / 2, MARGIN, VB_W - MARGIN);
      parts.push(`<rect x="${xSaia.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${wSaia.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
    } else {
      const legW = clamp(Dpx * 0.15, 8, 24);
      const leg1X = clamp(xCascoEsq + (xCascoDir - xCascoEsq) * 0.2 - legW / 2, MARGIN, VB_W - MARGIN);
      const leg2X = clamp(xCascoEsq + (xCascoDir - xCascoEsq) * 0.8 - legW / 2, MARGIN, VB_W - MARGIN);
      parts.push(`<rect x="${leg1X.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${legW.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
      parts.push(`<rect x="${leg2X.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${legW.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
    }
  }

  // Bocais: casco → stub retangular na posição axial (ângulo 0-180° = em cima, 180-360° = embaixo);
  // tampo1/tampo2 → stub no polo do tampo correspondente, deslocado pelo ângulo projetado
  // (não depende de posicaoAxial: o bocal de tampo não tem posição ao longo do comprimento).
  let idxCotaAxial = 0; // índice só dos bocais de casco com cota de posição axial (stagger abaixo)
  for (const b of m.bocais) {
    const angulo = num(b.angulo);
    const anguloEfetivo = angulo === null ? 0 : angulo;

    if (b.local === 'tampo1' || b.local === 'tampo2') {
      const isTampo1 = b.local === 'tampo1';
      const xPonta = isTampo1 ? xEsq : xDir;
      const rad = ((anguloEfetivo - 90) * Math.PI) / 180;
      const raioProj = Dpx / 2;
      const yBocal = clamp(yCentro + raioProj * 0.8 * Math.sin(rad), yTop + 6, yBottom - 6);
      const stubLen = clamp(16, 8, 30);
      const stubThick = clamp(10, 4, 20);
      const rectX = isTampo1
        ? clamp(xPonta - stubLen, MARGIN, VB_W - MARGIN - stubLen)
        : clamp(xPonta, MARGIN, VB_W - MARGIN - stubLen);
      parts.push(`<rect x="${rectX.toFixed(1)}" y="${(yBocal - stubThick / 2).toFixed(1)}" width="${stubLen.toFixed(1)}" height="${stubThick.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelX = clamp(isTampo1 ? rectX - 4 : rectX + stubLen + 4, MARGIN + 14, VB_W - MARGIN - 14);
      const labelY = clamp(yBocal + 3, MARGIN + 10, VB_H - MARGIN);
      parts.push(`<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="8" text-anchor="${isTampo1 ? 'end' : 'start'}" fill="#333">${esc(b.id)}</text>`);
      continue;
    }

    const posAxial = num(b.posicaoAxial);
    if (posAxial === null) continue;
    const emCima = anguloEfetivo >= 0 && anguloEfetivo < 180;

    // posicaoAxial é medida ao longo do casco (0 = início do cilindro).
    const xBocal = clamp(xCascoEsq + posAxial * scale, xCascoEsq, xCascoDir);
    const stubW = clamp(10, 4, 20);
    const stubH = clamp(18, 8, 30);

    if (emCima) {
      const yStubTop = clamp(yTop - stubH, MARGIN, yTop);
      parts.push(`<rect x="${(xBocal - stubW / 2).toFixed(1)}" y="${yStubTop.toFixed(1)}" width="${stubW.toFixed(1)}" height="${stubH.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelY = clamp(yStubTop - 4, MARGIN + 10, VB_H - MARGIN);
      parts.push(`<line x1="${xBocal.toFixed(1)}" y1="${yStubTop.toFixed(1)}" x2="${xBocal.toFixed(1)}" y2="${labelY.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`);
      parts.push(`<text x="${clamp(xBocal, MARGIN + 14, VB_W - MARGIN - 14).toFixed(1)}" y="${clamp(labelY - 2, MARGIN + 10, VB_H - MARGIN).toFixed(1)}" font-size="8" text-anchor="middle" fill="#333">${esc(b.id)}</text>`);
    } else {
      const yStubBottom = clamp(yBottom + stubH, yBottom, VB_H - MARGIN);
      parts.push(`<rect x="${(xBocal - stubW / 2).toFixed(1)}" y="${yBottom.toFixed(1)}" width="${stubW.toFixed(1)}" height="${stubH.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelY = clamp(yStubBottom + 10, MARGIN, VB_H - MARGIN - 4);
      parts.push(`<line x1="${xBocal.toFixed(1)}" y1="${yStubBottom.toFixed(1)}" x2="${xBocal.toFixed(1)}" y2="${labelY.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`);
      parts.push(`<text x="${clamp(xBocal, MARGIN + 14, VB_W - MARGIN - 14).toFixed(1)}" y="${clamp(labelY + 8, MARGIN + 10, VB_H - MARGIN).toFixed(1)}" font-size="8" text-anchor="middle" fill="#333">${esc(b.id)}</text>`);
    }

    // Cota da posição axial (se preenchida) — linha fina até a base, rótulo abaixo do casco.
    // Múltiplos bocais no casco: escalona a altura por índice (14px cada) p/ não sobrepor;
    // clampada dentro do viewBox — com muitos bocais as últimas cotas colam no limite inferior
    // (sobreposição residual aceitável em troca de nunca vazar da folha).
    const cotaY = clamp(yBottom + 44 + idxCotaAxial * 14, MARGIN, VB_H - MARGIN);
    cota(parts, xCascoEsq, cotaY, xBocal, cotaY, `${esc(b.id)}: ${fmt(posAxial, 0)}`, VB_W);
    idxCotaAxial++;
  }

  // Cotas principais: Ø interno, comprimento do cilindro, comprimento total.
  const xCotaD = clamp(xEsq - 30, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaD, yTop, xCotaD, yBottom, `Ø${fmt(d.D, 0)}`, VB_W);

  const yCotaCil = clamp(yBottom + 18, MARGIN, VB_H - MARGIN);
  cota(parts, xCascoEsq, yCotaCil, xCascoDir, yCotaCil, `${fmt(d.L, 0)}`, VB_W);

  const yCotaTotal = clamp(yBottom + 30, MARGIN, VB_H - MARGIN);
  cota(parts, xEsq, yCotaTotal, xDir, yCotaTotal, `Total: ${fmt(d.comprTotal, 0)}`, VB_W);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

/**
 * Vista longitudinal do vaso VERTICAL (colunas, reatores, autoclaves em pé): tampo1 em cima,
 * casco vertical, tampo2 embaixo, suporte (saia/pés) abaixo do tampo2. Cota do comprimento e
 * total ficam verticais (ao lado direito); Ø fica horizontal (embaixo). Variante transposta de
 * `svgLongitudinalHorizontal` (mesma lógica de clamp/cota, eixos x/y trocados).
 */
function svgLongitudinalVertical(m: ModeloVaso, d: DadosBase): string {
  const VB_W = 420;
  const VB_H = 720;
  const MARGIN = 14;
  const AREA_H = VB_H - 2 * MARGIN - 110; // reserva p/ cota Ø embaixo + suporte
  const AREA_W = VB_W - 2 * MARGIN - 70; // reserva p/ cotas de comprimento à direita + bocais

  const DExterno = d.D + 2 * d.tCasco;
  const scale = clamp(Math.min(AREA_W / DExterno, AREA_H / d.comprTotal), 0.001, 5);

  const comprPx = clamp(d.comprTotal * scale, 80, AREA_H);
  const Dpx = clamp(DExterno * scale, 30, AREA_W);
  const prof1Px = clamp(d.prof1 * scale, 8, comprPx * 0.4);
  const prof2Px = clamp(d.prof2 * scale, 8, comprPx * 0.4);
  const cilPx = clamp(comprPx - prof1Px - prof2Px, 10, comprPx);

  const centerX = clamp(VB_W / 2 - 15, MARGIN, VB_W - MARGIN);
  const xEsq = clamp(centerX - Dpx / 2, MARGIN, VB_W - MARGIN);
  const xDir = clamp(centerX + Dpx / 2, MARGIN, VB_W - MARGIN);

  const yTop = clamp(50, MARGIN, VB_H - MARGIN);
  const yCascoTop = clamp(yTop + prof1Px, MARGIN, VB_H - MARGIN);
  const yCascoBottom = clamp(yCascoTop + cilPx, MARGIN, VB_H - MARGIN - 90);
  const yBottom = clamp(yCascoBottom + prof2Px, MARGIN, VB_H - MARGIN - 70);

  const parts: string[] = [];

  // Tampos + costado
  parts.push(`<path d="${pathTampoVertical(m.tampo1.tipo, yCascoTop, xEsq, xDir, prof1Px, false)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
  parts.push(`<path d="${pathTampoVertical(m.tampo2.tipo, yCascoBottom, xEsq, xDir, prof2Px, true)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
  parts.push(`<rect x="${xEsq.toFixed(1)}" y="${yCascoTop.toFixed(1)}" width="${(xDir - xEsq).toFixed(1)}" height="${(yCascoBottom - yCascoTop).toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);

  // Linha de centro (CL) tracejada — vertical
  const clY1 = clamp(yTop - 12, MARGIN, VB_H - MARGIN);
  const clY2 = clamp(yBottom + 12, MARGIN, VB_H - MARGIN);
  parts.push(`<line x1="${centerX.toFixed(1)}" y1="${clY1.toFixed(1)}" x2="${centerX.toFixed(1)}" y2="${clY2.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="0.7" stroke-dasharray="7,3,2,3"/>`);
  parts.push(`<text x="${clamp(centerX + 4, MARGIN, VB_W - MARGIN).toFixed(1)}" y="${clamp(clY1 - 4, MARGIN + 10, VB_H - MARGIN).toFixed(1)}" font-size="8" fill="${STROKE_CL}">CL</text>`);

  // Suporte (saia / pés / selas) — abaixo do tampo2.
  if (m.suporte.tipo !== 'nenhum') {
    const suporteAltura = clamp(30, 10, VB_H - yBottom - MARGIN - 30);
    if (m.suporte.tipo === 'saia') {
      const wSaia = clamp((xDir - xEsq) * 0.6, 20, xDir - xEsq);
      const xSaia = clamp(centerX - wSaia / 2, MARGIN, VB_W - MARGIN - wSaia);
      parts.push(`<rect x="${xSaia.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${wSaia.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
    } else {
      const legW = clamp(Dpx * 0.15, 8, 24);
      const leg1X = clamp(xEsq + (xDir - xEsq) * 0.2 - legW / 2, MARGIN, VB_W - MARGIN - legW);
      const leg2X = clamp(xEsq + (xDir - xEsq) * 0.8 - legW / 2, MARGIN, VB_W - MARGIN - legW);
      parts.push(`<rect x="${leg1X.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${legW.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
      parts.push(`<rect x="${leg2X.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${legW.toFixed(1)}" height="${suporteAltura.toFixed(1)}" fill="#e5e7eb" stroke="${STROKE}" stroke-width="1"/>`);
    }
  }

  // Bocais: casco → stub radial (direita/esquerda) na posição axial vertical (ângulo 0-180° =
  // direita, 180-360° = esquerda); tampo1/tampo2 → stub no polo do tampo, deslocado pelo ângulo
  // projetado (não depende de posicaoAxial).
  let idxCotaAxialV = 0; // índice só dos bocais de casco com cota de posição axial (stagger à esquerda)
  for (const b of m.bocais) {
    const angulo = num(b.angulo);
    const anguloEfetivo = angulo === null ? 0 : angulo;

    if (b.local === 'tampo1' || b.local === 'tampo2') {
      const isTampo1 = b.local === 'tampo1';
      const yPonta = isTampo1 ? yTop : yBottom;
      const rad = ((anguloEfetivo - 90) * Math.PI) / 180;
      const raioProj = Dpx / 2;
      const xBocal = clamp(centerX + raioProj * 0.8 * Math.cos(rad), xEsq + 6, xDir - 6);
      const stubLen = clamp(16, 8, 30);
      const stubThick = clamp(10, 4, 20);
      const rectY = isTampo1
        ? clamp(yPonta - stubLen, MARGIN, VB_H - MARGIN - stubLen)
        : clamp(yPonta, MARGIN, VB_H - MARGIN - stubLen);
      parts.push(`<rect x="${(xBocal - stubThick / 2).toFixed(1)}" y="${rectY.toFixed(1)}" width="${stubThick.toFixed(1)}" height="${stubLen.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelY = isTampo1
        ? clamp(rectY - 4, MARGIN + 10, VB_H - MARGIN)
        : clamp(rectY + stubLen + 10, MARGIN + 10, VB_H - MARGIN);
      parts.push(`<text x="${clamp(xBocal, MARGIN + 14, VB_W - MARGIN - 14).toFixed(1)}" y="${labelY.toFixed(1)}" font-size="8" text-anchor="middle" fill="#333">${esc(b.id)}</text>`);
      continue;
    }

    const posAxial = num(b.posicaoAxial);
    if (posAxial === null) continue;
    const direita = anguloEfetivo >= 0 && anguloEfetivo < 180;

    // posicaoAxial é medida ao longo do eixo vertical (0 = junção com o tampo1, no topo).
    const yBocal = clamp(yCascoTop + posAxial * scale, yCascoTop, yCascoBottom);
    const stubLen = clamp(18, 8, 30);
    const stubThick = clamp(10, 4, 20);

    if (direita) {
      const xStub = clamp(xDir, MARGIN, VB_W - MARGIN - stubLen);
      parts.push(`<rect x="${xStub.toFixed(1)}" y="${(yBocal - stubThick / 2).toFixed(1)}" width="${stubLen.toFixed(1)}" height="${stubThick.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelX = clamp(xStub + stubLen + 4, MARGIN + 14, VB_W - MARGIN - 14);
      parts.push(`<line x1="${(xStub + stubLen).toFixed(1)}" y1="${yBocal.toFixed(1)}" x2="${labelX.toFixed(1)}" y2="${yBocal.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`);
      parts.push(`<text x="${labelX.toFixed(1)}" y="${(yBocal + 3).toFixed(1)}" font-size="8" text-anchor="start" fill="#333">${esc(b.id)}</text>`);
    } else {
      const xStub = clamp(xEsq - stubLen, MARGIN, VB_W - MARGIN - stubLen);
      parts.push(`<rect x="${xStub.toFixed(1)}" y="${(yBocal - stubThick / 2).toFixed(1)}" width="${stubLen.toFixed(1)}" height="${stubThick.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1"/>`);
      const labelX = clamp(xStub - 4, MARGIN + 14, VB_W - MARGIN - 14);
      parts.push(`<line x1="${xStub.toFixed(1)}" y1="${yBocal.toFixed(1)}" x2="${labelX.toFixed(1)}" y2="${yBocal.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`);
      parts.push(`<text x="${labelX.toFixed(1)}" y="${(yBocal + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#333">${esc(b.id)}</text>`);
    }

    // Cota da posição axial — linha vertical à esquerda, rótulo ao lado. Múltiplos bocais no
    // casco: escalona a distância à esquerda por índice (14px cada) p/ não sobrepor; clampada
    // dentro do viewBox (mesma lógica de stagger da vista horizontal).
    const cotaX = clamp(xEsq - 44 - idxCotaAxialV * 14, MARGIN, VB_W - MARGIN);
    cota(parts, cotaX, yCascoTop, cotaX, yBocal, `${esc(b.id)}: ${fmt(posAxial, 0)}`, VB_W);
    idxCotaAxialV++;
  }

  // Cotas principais: Ø interno (horizontal, embaixo), comprimento do cilindro e comprimento
  // total (verticais, à direita).
  const yCotaD = clamp(yBottom + 30, MARGIN, VB_H - MARGIN);
  cota(parts, xEsq, yCotaD, xDir, yCotaD, `Ø${fmt(d.D, 0)}`, VB_W);

  const xCotaCil = clamp(xDir + 18, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaCil, yCascoTop, xCotaCil, yCascoBottom, `${fmt(d.L, 0)}`, VB_W);

  const xCotaTotal = clamp(xDir + 34, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaTotal, yTop, xCotaTotal, yBottom, `Total: ${fmt(d.comprTotal, 0)}`, VB_W);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

/** Dispatcher: vaso vertical (colunas, reatores) renderiza em pé; horizontal (padrão) deitado. */
function svgLongitudinal(m: ModeloVaso, d: DadosBase): string {
  return m.orientacao === 'vertical' ? svgLongitudinalVertical(m, d) : svgLongitudinalHorizontal(m, d);
}

// ───────────────────────── Vista transversal (topo) ─────────────────────────

function svgTransversal(m: ModeloVaso, d: DadosBase): string {
  const VB_W = 360;
  const VB_H = 360;
  const MARGIN = 30; // folga p/ marcas de compasso fora do círculo (lição da bússola fase 1)

  const cx = VB_W / 2;
  const cy = VB_H / 2 - 10; // desloca um pouco p/ cima p/ dar espaço ao texto de circunferência embaixo
  const DExterno = d.D + 2 * d.tCasco;
  const raioMaxDisponivel = Math.min(cx, cy) - MARGIN;
  const scale = clamp(raioMaxDisponivel / (DExterno / 2), 0.0001, 5);
  const r = clamp((DExterno / 2) * scale, 20, raioMaxDisponivel);

  const parts: string[] = [];

  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);

  // Cruz tracejada
  const crossExt = r + 10;
  parts.push(`<line x1="${clamp(cx - crossExt, 2, VB_W - 2).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${clamp(cx + crossExt, 2, VB_W - 2).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="0.7" stroke-dasharray="7,3,2,3"/>`);
  parts.push(`<line x1="${cx.toFixed(1)}" y1="${clamp(cy - crossExt, 2, VB_H - 2).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${clamp(cy + crossExt, 2, VB_H - 2).toFixed(1)}" stroke="${STROKE_CL}" stroke-width="0.7" stroke-dasharray="7,3,2,3"/>`);

  // Marcas de compasso 0/90/180/270° FORA do círculo, com folga (evita clipping da fase 1).
  const compassR = r + 16;
  const marcas: { graus: number; label: string; dx: number; dy: number; anchor: string }[] = [
    { graus: 0, label: '0°', dx: 0, dy: -6, anchor: 'middle' },
    { graus: 90, label: '90°', dx: 8, dy: 3, anchor: 'start' },
    { graus: 180, label: '180°', dx: 0, dy: 14, anchor: 'middle' },
    { graus: 270, label: '270°', dx: -8, dy: 3, anchor: 'end' },
  ];
  for (const marca of marcas) {
    // 0° = topo (ângulo -90° em coordenadas de tela), sentido horário.
    const rad = ((marca.graus - 90) * Math.PI) / 180;
    const px = cx + compassR * Math.cos(rad);
    const py = cy + compassR * Math.sin(rad);
    const lx = clamp(px + marca.dx, 14, VB_W - 14);
    const ly = clamp(py + marca.dy, 14, VB_H - 14);
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8" text-anchor="${marca.anchor}" fill="#333">${marca.label}</text>`);
  }

  // Bocais plotados no ângulo: stub radial + id.
  for (const b of m.bocais) {
    const angulo = num(b.angulo);
    if (angulo === null) continue;
    const rad = ((angulo - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad);
    const y1 = cy + r * Math.sin(rad);
    const stubLen = 16;
    const x2 = clamp(cx + (r + stubLen) * Math.cos(rad), 4, VB_W - 4);
    const y2 = clamp(cy + (r + stubLen) * Math.sin(rad), 4, VB_H - 4);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
    const lx = clamp(cx + (r + stubLen + 10) * Math.cos(rad), 14, VB_W - 14);
    const ly = clamp(cy + (r + stubLen + 10) * Math.sin(rad), 14, VB_H - 14);
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8" text-anchor="middle" fill="#333">${esc(b.id)}</text>`);
  }

  // Circunferência anotada embaixo.
  const yTexto = clamp(VB_H - 12, 14, VB_H - 4);
  parts.push(`<text x="${cx.toFixed(1)}" y="${yTexto.toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="#111">Circunf.: ${fmt(d.circunf, 1)} mm</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

// ───────────────────────── Detalhe do tampo ─────────────────────────

function svgDetalheTampo(tampo: TampoModelo, D: number, t: number): string {
  const VB_W = 360;
  const VB_H = 300;
  const MARGIN = 18;

  const dims = dimensoesTampo(tampo.tipo, D, t);
  const AREA_W = VB_W - 2 * MARGIN - 30;
  const AREA_H = VB_H - 2 * MARGIN - 60;
  const scale = clamp(Math.min(AREA_W / D, AREA_H / Math.max(dims.profundidade, 1)), 0.0001, 5);

  const Dpx = clamp(D * scale, 40, AREA_W);
  const profPx = clamp(dims.profundidade * scale, 8, AREA_H);

  const xCentro = VB_W / 2;
  const yTop = clamp(MARGIN + 20, MARGIN, VB_H - MARGIN);
  const xEsq = clamp(xCentro - Dpx / 2, MARGIN, VB_W - MARGIN);
  const xDir = clamp(xCentro + Dpx / 2, MARGIN, VB_W - MARGIN);
  const yPonta = clamp(yTop - profPx, MARGIN, yTop);

  const parts: string[] = [];

  // Perfil do tampo em vista lateral (mesma lógica de pathTampo, mas apontando para cima).
  switch (tampo.tipo) {
    case 'plano':
      parts.push(`<rect x="${xEsq.toFixed(1)}" y="${yPonta.toFixed(1)}" width="${(xDir - xEsq).toFixed(1)}" height="${profPx.toFixed(1)}" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
      break;
    case 'hemisferico': {
      const r = Dpx / 2;
      parts.push(`<path d="M${xEsq.toFixed(1)},${yTop.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${xDir.toFixed(1)},${yTop.toFixed(1)} Z" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
      break;
    }
    case 'eliptico':
    case 'toriesferico':
    default: {
      const rx = Dpx / 2;
      parts.push(`<path d="M${xEsq.toFixed(1)},${yTop.toFixed(1)} A${rx.toFixed(1)},${profPx.toFixed(1)} 0 0 1 ${xDir.toFixed(1)},${yTop.toFixed(1)} Z" fill="${FILL_CASCO}" stroke="${STROKE}" stroke-width="1.2"/>`);
      break;
    }
  }

  // Linha de base (junção com o casco)
  parts.push(`<line x1="${clamp(xEsq - 8, MARGIN, VB_W - MARGIN).toFixed(1)}" y1="${yTop.toFixed(1)}" x2="${clamp(xDir + 8, MARGIN, VB_W - MARGIN).toFixed(1)}" y2="${yTop.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="0.7" stroke-dasharray="7,3,2,3"/>`);

  // Título por extenso
  const titulo = tipoTampoPorExtenso(tampo.tipo);
  parts.push(`<text x="${xCentro.toFixed(1)}" y="16" font-size="10" font-weight="800" text-anchor="middle" fill="#111">${titulo}</text>`);

  // Cotas: Ø, profundidade, espessura.
  const yCotaD = clamp(yTop + 20, MARGIN, VB_H - MARGIN);
  cota(parts, xEsq, yCotaD, xDir, yCotaD, `Ø${fmt(D, 0)}`, VB_W);

  const xCotaProf = clamp(xDir + 24, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaProf, yPonta, xCotaProf, yTop, `h=${fmt(dims.profundidade, 1)}`, VB_W);

  const xCotaT = clamp(xEsq - 24, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaT, yPonta, xCotaT, clamp(yPonta + 20, MARGIN, VB_H - MARGIN), `t=${fmt(t, 1)}`, VB_W);

  // Toriesférico: anota raio da coroa (Rc) e raio de canto (rc).
  if (tampo.tipo === 'toriesferico') {
    const yTexto = clamp(yTop + 40, MARGIN, VB_H - MARGIN);
    parts.push(`<text x="${xCentro.toFixed(1)}" y="${yTexto.toFixed(1)}" font-size="9" text-anchor="middle" fill="#111">Rc=${fmt(dims.raioCoroa, 0)}  rc=${fmt(dims.raioCanto, 0)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

/**
 * Gera os 3 croquis 2D técnicos do vaso modelado: vista longitudinal, vista transversal (topo)
 * e detalhe do tampo 1. Retorna null se diâmetro, comprimento do cilindro ou espessura do casco
 * estiverem incompletos (dados mínimos para o desenho).
 */
export function gerarCroquis2d(m: ModeloVaso): Croquis2d | null {
  const d = coletarDadosBase(m);
  if (d === null) return null;

  return {
    longitudinal: svgLongitudinal(m, d),
    transversal: svgTransversal(m, d),
    detalheTampo: svgDetalheTampo(m.tampo1, d.D, d.t1),
  };
}
