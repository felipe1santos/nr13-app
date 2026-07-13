// Gerador de croqui 2D técnico do vaso modelado (fase 2.1 do Modelador de Vaso).
// Produz 3 SVGs auto-contidos (sem CSS externo) no traço de prancha de fabricante:
// vista longitudinal (costuras sólidas de solda, bocais flangeados, suportes, cotas com linhas
// de extensão/chamada e seção parcial hachurada mostrando a espessura da parede), vista
// transversal/topo (anel de parede hachurado em corte, Ø diagonal, arcos de ângulo por bocal)
// e detalhe do tampo em corte (parede dupla hachurada, Rc/rc no toriesférico).
// Consumidos por PRONT-CROQUI2D.html.
//
// Convenções de ângulo (mesma fonte de verdade de `direcaoBocalLocal` em geometriaVaso.ts):
// 0° = topo, sentido horário visto de cima. Nas vistas longitudinais o observador fica:
// - horizontal: no lado 90° → [45°,135°) é a frente (círculo sólido na face do casco),
//   [225°,315°) é o fundo (tracejado), [315°,45°) sobe, [135°,225°) desce.
// - vertical: no lado 0° → [315°,45°) frente (sólido), [135°,225°) fundo (tracejado),
//   [45°,135°) stub à direita, [225°,315°) à esquerda.
//
// Lições da fase 1 (não repetir):
// 1. Rótulos nas bordas do viewBox são cortados — manter margem interna ≥14px em todo anchor de texto.
// 2. Toda coordenada deve ser clampada — nenhum atributo pode ficar negativo nem além do viewBox.
// 3. Nunca emitir NaN/undefined — todo número passa por `num()` e aborta cedo (retorna null).
import {
  DASH_CL,
  DASH_OCULTO,
  FILL_BRANCO,
  STROKE,
  STROKE_CL,
  bocalFlangeado,
  callout,
  clamp,
  cota,
  cotaAngular,
  cotaEspessura,
  costura,
  esc,
  fmt,
  hachuraClip,
  hachuraRect,
  idBalao,
  linhaExt,
  quebraOndulada,
} from './croquiPrimitivas';
import { pontosPerfilTampo, perfilTampoDuplo, type MapaLocal } from './croquiTampos';
import { circunferenciaMm, comprimentoTotalMm, dimensoesTampo, num } from './geometriaVaso';
import type { BocalModelo, ModeloVaso, TampoModelo, TipoTampoModelo } from './tiposModelador';

export interface Croquis2d {
  longitudinal: string;
  transversal: string;
  detalheTampo: string;
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
  DExt: number;
  L: number;
  tCasco: number;
  t1: number;
  t2: number;
  prof1: number;
  prof2: number;
  comprTotal: number;
  circunf: number;
  virolas: number;
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

  // Migração: modelos salvos antes do campo `virolas` chegam sem ele — 1 virola.
  const virolasRaw = m.virolas === undefined ? 1 : num(m.virolas);
  const virolas = virolasRaw === null ? 1 : Math.max(1, Math.min(12, Math.round(virolasRaw)));

  return {
    D,
    DExt: D + 2 * tCasco,
    L,
    tCasco,
    t1,
    t2,
    prof1: dim1.profundidade,
    prof2: dim2.profundidade,
    comprTotal,
    circunf,
    virolas,
  };
}

/** Setor angular do bocal na convenção 0°=topo/horário (ver cabeçalho). */
type SetorBocal = 'a0' | 'a90' | 'a180' | 'a270';
function setorAngulo(ang: number): SetorBocal {
  const a = ((ang % 360) + 360) % 360;
  if (a >= 315 || a < 45) return 'a0';
  if (a < 135) return 'a90';
  if (a < 225) return 'a180';
  return 'a270';
}

/**
 * Silhueta única do vaso (tampo1 + costado + tampo2) como path fechado SEM cordas nas linhas de
 * tangência — assim a costura tracejada é a ÚNICA marca da junção soldada (com a corda sólida
 * por cima, a linha de solda ficava invisível — feedback da prancha de referência).
 * `curva1/curva2` mapeiam o perfil local (z,r) de cada tampo; `w1/w2` são os dois segmentos
 * retos de parede que fecham o contorno (o segundo via Z).
 */
function pathSilhueta(
  pts1: [number, number][],
  map1: MapaLocal,
  pts2: [number, number][],
  map2: MapaLocal,
  w1: [number, number],
): string {
  const seg: string[] = [];
  pts1.forEach(([z, r], i) => {
    const [x, y] = map1(z, r);
    seg.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  });
  seg.push(`L${w1[0].toFixed(1)},${w1[1].toFixed(1)}`);
  for (let i = pts2.length - 1; i >= 0; i--) {
    const [x, y] = map2(pts2[i][0], pts2[i][1]);
    seg.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `${seg.join(' ')} Z`;
}

/** Largura (px) do stub de um bocal a partir do Ø informado (fallback 60 mm). */
function larguraBocalPx(b: BocalModelo, scale: number, min = 5, max = 18): number {
  const diam = num(b.diametro);
  return clamp((diam === null ? 60 : diam) * scale, min, max);
}

/** Recuo axial da superfície do tampo em px na altura radial rrPx (aprox. elíptica p/ curvos). */
function recuoTampoPx(tipo: TipoTampoModelo, rrPx: number, RPx: number, profPx: number): number {
  if (tipo === 'plano') return profPx;
  const frac = clamp(1 - (rrPx / Math.max(RPx, 0.001)) ** 2, 0, 1);
  return profPx * Math.sqrt(frac);
}

/**
 * Escolhe um trecho do casco (entre `a` e `b`) livre de bocais para posicionar a seção parcial
 * de espessura (breakout hachurado) sem colidir com stubs/círculos. `ocupados` são as posições
 * (px, no mesmo eixo de a/b) dos bocais do casco. Fallback: primeiro candidato.
 */
function escolherTrechoLivre(a: number, b: number, ocupados: number[]): [number, number] {
  const candidatos: [number, number][] = [
    [0.6, 0.86],
    [0.14, 0.4],
    [0.4, 0.6],
  ];
  for (const [f1, f2] of candidatos) {
    const p1 = a + (b - a) * f1;
    const p2 = a + (b - a) * f2;
    if (!ocupados.some((o) => o > p1 - 14 && o < p2 + 14)) return [p1, p2];
  }
  return [a + (b - a) * candidatos[0][0], a + (b - a) * candidatos[0][1]];
}

// ───────────────────────── Vista longitudinal — HORIZONTAL ─────────────────────────

function svgLongitudinalHorizontal(m: ModeloVaso, d: DadosBase): string {
  const VB_W = 720;
  const VB_H = 420;
  const MARGIN = 14;

  const bocaisCasco = m.bocais.filter((b) => b.local === 'casco');
  const nAx = bocaisCasco.length;

  // Escala tipográfica desta vista (viewBox 720×420 impresso a ~114mm ⇒ 1 un ≈ 0,16mm no papel):
  // cota precisa de fs ≥14 para render ≥2,2mm; hierarquia principal > secundária > balão > nota.
  const FS_P = 17;
  const FS_S = 14;
  const FS_BAL = 13;
  const FS_NOTA = 12;
  const SW_CASCO = 2.8;
  const SW_COMP = 2;
  const SW_COSTURA = 1.3;

  const RESERVA_ESQ = 96; // cota Ø + bocais do tampo1
  const RESERVA_DIR = 80; // bocais do tampo2 + cota do suporte
  const RESERVA_TOPO = 76; // stubs de cima + callout t
  const temSuporte = m.suporte.tipo !== 'nenhum';
  const temBocalBaixo = bocaisCasco.some((b) => setorAngulo(num(b.angulo) ?? 0) === 'a180');
  // suporte (hSup ≤34) + cotas axiais escalonadas + L + Total (+ stub/balão de bocal de baixo)
  const reservaBaixo = 102 + nAx * 24 + (temBocalBaixo ? 30 : 0);

  const AREA_W = VB_W - RESERVA_ESQ - RESERVA_DIR;
  const AREA_H = VB_H - RESERVA_TOPO - reservaBaixo;
  const scale = clamp(Math.min(AREA_W / d.comprTotal, AREA_H / d.DExt), 0.001, 5);

  const prof1Px = d.prof1 * scale;
  const prof2Px = d.prof2 * scale;
  const cilPx = clamp(d.L * scale, 10, AREA_W);
  const Dpx = clamp(d.DExt * scale, 26, AREA_H);
  const RPx = Dpx / 2;

  const xEsq = RESERVA_ESQ;
  const xCascoEsq = clamp(xEsq + prof1Px, MARGIN, VB_W - MARGIN);
  const xCascoDir = clamp(xCascoEsq + cilPx, MARGIN, VB_W - MARGIN);
  const xDir = clamp(xCascoDir + prof2Px, MARGIN, VB_W - MARGIN);
  const yTop = RESERVA_TOPO;
  const yBottom = clamp(yTop + Dpx, MARGIN, VB_H - MARGIN);
  const yCentro = (yTop + yBottom) / 2;

  const parts: string[] = [];

  // Silhueta única tampo1+costado+tampo2 (sem corda nas tangências — ver pathSilhueta)
  const mapEsq: MapaLocal = (z, r) => [xCascoEsq - z * scale, yCentro + r * scale];
  const mapDir: MapaLocal = (z, r) => [xCascoDir + z * scale, yCentro + r * scale];
  const silhueta = pathSilhueta(
    pontosPerfilTampo(m.tampo1.tipo, d.DExt / 2, d.prof1),
    mapEsq,
    pontosPerfilTampo(m.tampo2.tipo, d.DExt / 2, d.prof2),
    mapDir,
    [xCascoDir, yTop],
  );
  parts.push(`<path d="${silhueta}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_CASCO}"/>`);

  // Costuras: linhas de tangência (junção soldada tampo-casco) + divisões de virolas
  costura(parts, xCascoEsq, yTop, xCascoEsq, yBottom, SW_COSTURA);
  costura(parts, xCascoDir, yTop, xCascoDir, yBottom, SW_COSTURA);
  for (let i = 1; i < d.virolas; i++) {
    const x = clamp(xCascoEsq + ((xCascoDir - xCascoEsq) * i) / d.virolas, MARGIN, VB_W - MARGIN);
    costura(parts, x, yTop, x, yBottom, SW_COSTURA);
  }

  // Seção parcial (breakout) da parede superior: trecho hachurado entre a superfície externa e a
  // interna revelando a espessura do casco no próprio desenho (como nas pranchas de referência),
  // com linha da superfície interna e bordas de ruptura onduladas. t é exagerada quando a escala
  // é pequena (piso 4,5px) para continuar legível no papel. O trecho desvia de bocais E de
  // costuras de virola — a banda (e a cota de espessura dela) nunca cobre outra informação.
  const tVisPx = clamp(d.tCasco * scale, 4.5, 12);
  const xsOcupados = bocaisCasco.map((b) => {
    const p = num(b.posicaoAxial);
    return p === null ? (xCascoEsq + xCascoDir) / 2 : clamp(xCascoEsq + p * scale, xCascoEsq, xCascoDir);
  });
  for (let i = 1; i < d.virolas; i++) {
    xsOcupados.push(xCascoEsq + ((xCascoDir - xCascoEsq) * i) / d.virolas);
  }
  const [xQa, xQb] = escolherTrechoLivre(xCascoEsq, xCascoDir, xsOcupados);
  hachuraRect(parts, xQa, yTop, xQb - xQa, tVisPx, 5, 0.85);
  parts.push(`<line x1="${xQa.toFixed(1)}" y1="${(yTop + tVisPx).toFixed(1)}" x2="${xQb.toFixed(1)}" y2="${(yTop + tVisPx).toFixed(1)}" stroke="${STROKE}" stroke-width="1.1"/>`);
  quebraOndulada(parts, xQa, yTop, xQa, yTop + tVisPx);
  quebraOndulada(parts, xQb, yTop, xQb, yTop + tVisPx);

  // Linha de centro
  const clX1 = clamp(xEsq - 14, MARGIN, VB_W - MARGIN);
  const clX2 = clamp(xDir + 14, MARGIN, VB_W - MARGIN);
  parts.push(`<line x1="${clX1.toFixed(1)}" y1="${yCentro.toFixed(1)}" x2="${clX2.toFixed(1)}" y2="${yCentro.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="1" stroke-dasharray="${DASH_CL}"/>`);
  parts.push(`<text x="${clamp(clX2 + 5, MARGIN, VB_W - MARGIN - 16).toFixed(1)}" y="${(yCentro + 4).toFixed(1)}" font-size="${FS_NOTA}" fill="${STROKE_CL}">CL</text>`);

  // Suporte
  const alturaSup = num(m.suporte.altura);
  const hSupPx = clamp(alturaSup === null ? 24 : alturaSup * scale, 12, 34);
  const yBase = clamp(yBottom + hSupPx, MARGIN, VB_H - MARGIN);
  if (temSuporte) {
    if (m.suporte.tipo === 'selas') {
      // Duas selas trapezoidais (20% e 80% do cilindro) com chapa de base
      for (const frac of [0.2, 0.8]) {
        const xc = xCascoEsq + (xCascoDir - xCascoEsq) * frac;
        const wTop = clamp(Dpx * 0.28, 14, 44);
        const wBase = wTop + 14;
        const p1 = clamp(xc - wTop / 2, MARGIN, VB_W - MARGIN);
        const p2 = clamp(xc + wTop / 2, MARGIN, VB_W - MARGIN);
        const p3 = clamp(xc + wBase / 2, MARGIN, VB_W - MARGIN);
        const p4 = clamp(xc - wBase / 2, MARGIN, VB_W - MARGIN);
        parts.push(`<polygon points="${p1.toFixed(1)},${(yBottom - 2).toFixed(1)} ${p2.toFixed(1)},${(yBottom - 2).toFixed(1)} ${p3.toFixed(1)},${(yBase - 3).toFixed(1)} ${p4.toFixed(1)},${(yBase - 3).toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
        parts.push(`<rect x="${(p4 - 2).toFixed(1)}" y="${(yBase - 3).toFixed(1)}" width="${(p3 - p4 + 4).toFixed(1)}" height="3" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
      }
    } else if (m.suporte.tipo === 'saia') {
      const wSaia = clamp((xCascoDir - xCascoEsq) * 0.5, 20, xCascoDir - xCascoEsq);
      const xSaia = clamp(xCascoEsq + (xCascoDir - xCascoEsq - wSaia) / 2, MARGIN, VB_W - MARGIN);
      parts.push(`<rect x="${xSaia.toFixed(1)}" y="${yBottom.toFixed(1)}" width="${wSaia.toFixed(1)}" height="${(yBase - yBottom).toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
    } else {
      // Pés: perna + chapa de base
      const legW = clamp(Dpx * 0.12, 7, 20);
      for (const frac of [0.2, 0.8]) {
        const xc = clamp(xCascoEsq + (xCascoDir - xCascoEsq) * frac, MARGIN, VB_W - MARGIN);
        parts.push(`<rect x="${(xc - legW / 2).toFixed(1)}" y="${(yBottom - 1).toFixed(1)}" width="${legW.toFixed(1)}" height="${(yBase - yBottom - 2).toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
        parts.push(`<rect x="${(xc - legW / 2 - 5).toFixed(1)}" y="${(yBase - 3).toFixed(1)}" width="${(legW + 10).toFixed(1)}" height="3" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
      }
    }
    // Cota da altura do suporte (se informada)
    if (alturaSup !== null) {
      const xCotaSup = clamp(xDir + 26, MARGIN, VB_W - MARGIN);
      cota(parts, xCotaSup, yBottom, xCotaSup, yBase, fmt(alturaSup, 0), VB_W, FS_S, 0.5, 'mm');
    }
  }

  // Bocais (guarda a âncora vertical de cada bocal de casco p/ a linha de chamada da cota axial;
  // yMaxInferior acompanha o ponto mais fundo ocupado por stub/balão de bocal de baixo, para as
  // linhas de cota axiais começarem abaixo dele — cota nunca cruza balão)
  const ancoraYCota = new Map<BocalModelo, number>();
  let yMaxInferior = yBase;
  for (const b of m.bocais) {
    const angulo = num(b.angulo);
    const anguloEfetivo = angulo === null ? 0 : angulo;
    const wPx = larguraBocalPx(b, scale, 7, 26);

    if (b.local === 'tampo1' || b.local === 'tampo2') {
      const isTampo1 = b.local === 'tampo1';
      const rad = ((anguloEfetivo - 90) * Math.PI) / 180;
      const rrPx = clamp(RPx * 0.8 * Math.sin(rad), -RPx + 6, RPx - 6);
      const yBocal = yCentro + rrPx;
      const recuo = recuoTampoPx(isTampo1 ? m.tampo1.tipo : m.tampo2.tipo, rrPx, RPx, isTampo1 ? prof1Px : prof2Px);
      const xBase = isTampo1 ? xCascoEsq - recuo : xCascoDir + recuo;
      const tip = bocalFlangeado(parts, clamp(xBase, MARGIN, VB_W - MARGIN), yBocal, isTampo1 ? Math.PI : 0, 28, wPx, { sw: SW_COMP });
      const bx = clamp(tip.x + (isTampo1 ? -16 : 16), MARGIN + 16, VB_W - MARGIN - 16);
      idBalao(parts, bx, clamp(yBocal, MARGIN + 16, VB_H - MARGIN - 16), esc(b.id), FS_BAL);
      continue;
    }

    const posAxial = num(b.posicaoAxial);
    const xBocal = posAxial === null ? (xCascoEsq + xCascoDir) / 2 : clamp(xCascoEsq + posAxial * scale, xCascoEsq, xCascoDir);
    const setor = setorAngulo(anguloEfetivo);

    if (setor === 'a0' || setor === 'a180') {
      const emCima = setor === 'a0';
      const yBaseBocal = emCima ? yTop : yBottom;
      const tip = bocalFlangeado(parts, xBocal, yBaseBocal, emCima ? -Math.PI / 2 : Math.PI / 2, 30, wPx, { sw: SW_COMP });
      const by = clamp(tip.y + (emCima ? -16 : 16), MARGIN + 16, VB_H - MARGIN - 16);
      idBalao(parts, clamp(xBocal, MARGIN + 16, VB_W - MARGIN - 16), by, esc(b.id), FS_BAL);
      ancoraYCota.set(b, yBaseBocal);
      if (!emCima) yMaxInferior = Math.max(yMaxInferior, by + 14);
    } else {
      // Bocal na face do casco (frente sólido / fundo tracejado): círculo projetado em tamanho
      // real (boca de visita Ø400+ aparece grande, como nas pranchas de referência)
      const yProj = clamp(yCentro - RPx * Math.cos((anguloEfetivo * Math.PI) / 180), yTop + 6, yBottom - 6);
      const diamB = num(b.diametro);
      const rBocal = clamp(((diamB === null ? 60 : diamB) * scale) / 2, 5, RPx * 0.72);
      const oculto = setor === 'a270';
      const estilo = oculto
        ? `fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-dasharray="${DASH_OCULTO}"`
        : `fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"`;
      parts.push(`<circle cx="${xBocal.toFixed(1)}" cy="${yProj.toFixed(1)}" r="${rBocal.toFixed(1)}" ${estilo}/>`);
      const bx = clamp(xBocal + rBocal + 18, MARGIN + 16, VB_W - MARGIN - 16);
      const by = clamp(yProj - rBocal - 8, MARGIN + 16, VB_H - MARGIN - 16);
      parts.push(`<line x1="${(xBocal + rBocal * 0.7).toFixed(1)}" y1="${(yProj - rBocal * 0.7).toFixed(1)}" x2="${(bx - 12).toFixed(1)}" y2="${by.toFixed(1)}" stroke="${STROKE}" stroke-width="1"/>`);
      idBalao(parts, bx, by, esc(b.id), FS_BAL);
      ancoraYCota.set(b, clamp(yProj + rBocal, MARGIN, VB_H - MARGIN));
    }
  }

  // Posições das linhas de cota principais (calculadas antes p/ ancorar as linhas de extensão)
  const yCotaAxial0 = Math.max(yBase + 16, yMaxInferior + 12);
  const yCotaCil = clamp(yCotaAxial0 + nAx * 24 + 8, MARGIN, VB_H - MARGIN);
  const yCotaTotal = clamp(yCotaCil + 28, MARGIN, VB_H - MARGIN);
  const xCotaD = clamp(xEsq - 34, MARGIN, VB_W - MARGIN);

  // Linhas de extensão (chamada): ligam a geometria às linhas de cota, como nas pranchas
  // profissionais — tangências → cota L (e origem das cotas axiais), ápices dos tampos → cota
  // Total, faces superior/inferior do casco → cota Ø.
  linhaExt(parts, xCascoEsq, yBottom + 2, xCascoEsq, yCotaCil + 4);
  linhaExt(parts, xCascoDir, yBottom + 2, xCascoDir, yCotaCil + 4);
  linhaExt(parts, xEsq, yCentro + 2, xEsq, yCotaTotal + 4);
  linhaExt(parts, xDir, yCentro + 2, xDir, yCotaTotal + 4);
  linhaExt(parts, xCotaD - 4, yTop, xCascoEsq - 2, yTop);
  linhaExt(parts, xCotaD - 4, yBottom, xCascoEsq - 2, yBottom);

  // Cotas axiais dos bocais de casco (a partir da linha de tangência do tampo 1), escalonadas,
  // cada uma com linha de chamada vertical descendo do eixo do bocal até a sua linha de cota.
  // Bocal sem posição informada é desenhado (e cotado) no meio do cilindro — a cota sempre
  // existe, mostrando a posição efetivamente desenhada.
  let idxCotaAxial = 0;
  for (const b of bocaisCasco) {
    const posAxial = num(b.posicaoAxial);
    const posEfetiva = posAxial === null ? d.L / 2 : posAxial;
    const xBocal = clamp(xCascoEsq + posEfetiva * scale, xCascoEsq, xCascoDir);
    const cotaY = clamp(yCotaAxial0 + idxCotaAxial * 24, MARGIN, VB_H - MARGIN);
    const yAnc = ancoraYCota.get(b);
    if (yAnc !== undefined && cotaY > yAnc + 6) linhaExt(parts, xBocal, yAnc + 2, xBocal, cotaY + 4);
    cota(parts, xCascoEsq, cotaY, xBocal, cotaY, `${esc(b.id)}: ${fmt(posEfetiva, 0)}`, VB_W, FS_S, 0.5, 'mm');
    idxCotaAxial++;
  }

  // Cotas principais: L do cilindro (entre tangências), comprimento total, Ø, espessura
  cota(parts, xCascoEsq, yCotaCil, xCascoDir, yCotaCil, `${fmt(d.L, 0)}`, VB_W, FS_P, 0.5, 'mm');
  cota(parts, xEsq, yCotaTotal, xDir, yCotaTotal, `Total: ${fmt(d.comprTotal, 0)}`, VB_W, FS_P, 0.5, 'mm');
  cota(parts, xCotaD, yTop, xCotaD, yBottom, `Ø${fmt(d.D, 0)}`, VB_W, FS_P, 0.5, 'mm');

  // Cota de espessura na seção parcial: setas externas apontando para as duas superfícies da
  // parede (rótulo dentro do vaso, abaixo da banda) — cota "de verdade", não só um leader
  const xAlvoT = (xQa + xQb) / 2;
  cotaEspessura(parts, xAlvoT, yTop + tVisPx, xAlvoT, yTop, `t=${fmt(d.tCasco, 1)}`, FS_S, 'mm');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

// ───────────────────────── Vista longitudinal — VERTICAL ─────────────────────────

function svgLongitudinalVertical(m: ModeloVaso, d: DadosBase): string {
  const VB_W = 420;
  const VB_H = 720;
  const MARGIN = 14;

  const bocaisCasco = m.bocais.filter((b) => b.local === 'casco');
  const nAx = bocaisCasco.length;

  // Escala tipográfica desta vista (viewBox 420×720 impresso a ~114mm de caixa ⇒ ~0,17mm/un).
  // Todas as cotas usam FS_S: hierarquia sutil da prancha de referência (desenho > cotas).
  const FS_S = 13;
  const FS_BAL = 12;
  const FS_NOTA = 11;
  const SW_CASCO = 2.6;
  const SW_COMP = 1.8;
  const SW_COSTURA = 1.2;

  // TODAS as cotas lineares ficam à ESQUERDA (axiais + L + Total), como a prancha de
  // referência; à direita só stubs/balões e a cota do suporte. Ø vai sutil DENTRO do vaso.
  const RESERVA_ESQ = 118 + nAx * 24;
  const RESERVA_DIR = 64; // stubs + balão + cota do suporte
  const RESERVA_TOPO = 64; // bocal do tampo1 + balão
  const temSuporte = m.suporte.tipo !== 'nenhum';
  const RESERVA_BAIXO = (temSuporte ? 44 : 0) + 16 + 36; // suporte + folga + bocal tampo2

  const AREA_W = VB_W - RESERVA_ESQ - RESERVA_DIR;
  const AREA_H = VB_H - RESERVA_TOPO - RESERVA_BAIXO;
  const scale = clamp(Math.min(AREA_W / d.DExt, AREA_H / d.comprTotal), 0.001, 5);

  const prof1Px = d.prof1 * scale;
  const prof2Px = d.prof2 * scale;
  const cilPx = clamp(d.L * scale, 10, AREA_H);
  const Dpx = clamp(d.DExt * scale, 26, AREA_W);
  const RPx = Dpx / 2;

  const centerX = clamp(RESERVA_ESQ + AREA_W / 2, MARGIN, VB_W - MARGIN);
  const xEsq = clamp(centerX - RPx, MARGIN, VB_W - MARGIN);
  const xDir = clamp(centerX + RPx, MARGIN, VB_W - MARGIN);
  const yTop = RESERVA_TOPO;
  const yCascoTop = clamp(yTop + prof1Px, MARGIN, VB_H - MARGIN);
  const yCascoBottom = clamp(yCascoTop + cilPx, MARGIN, VB_H - MARGIN);
  const yBottom = clamp(yCascoBottom + prof2Px, MARGIN, VB_H - MARGIN);

  const parts: string[] = [];

  // Silhueta única tampo1+costado+tampo2 (sem corda nas tangências — ver pathSilhueta)
  const mapTopo: MapaLocal = (z, r) => [centerX + r * scale, yCascoTop - z * scale];
  const mapBaixo: MapaLocal = (z, r) => [centerX + r * scale, yCascoBottom + z * scale];
  const silhueta = pathSilhueta(
    pontosPerfilTampo(m.tampo1.tipo, d.DExt / 2, d.prof1),
    mapTopo,
    pontosPerfilTampo(m.tampo2.tipo, d.DExt / 2, d.prof2),
    mapBaixo,
    [xEsq, yCascoBottom],
  );
  parts.push(`<path d="${silhueta}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_CASCO}"/>`);

  // Costuras: tangências (junção soldada tampo-casco) + virolas
  costura(parts, xEsq, yCascoTop, xDir, yCascoTop, SW_COSTURA);
  costura(parts, xEsq, yCascoBottom, xDir, yCascoBottom, SW_COSTURA);
  for (let i = 1; i < d.virolas; i++) {
    const y = clamp(yCascoTop + ((yCascoBottom - yCascoTop) * i) / d.virolas, MARGIN, VB_H - MARGIN);
    costura(parts, xEsq, y, xDir, y, SW_COSTURA);
  }

  // Seção parcial (breakout) da parede direita: trecho hachurado revelando a espessura do casco
  // no próprio desenho (espelho do breakout da vista horizontal; piso 4,5px p/ legibilidade).
  // Desvia de bocais E de costuras de virola — a banda nunca cobre outra informação.
  const tVisPx = clamp(d.tCasco * scale, 4.5, 12);
  const ysOcupados = bocaisCasco.map((b) => {
    const p = num(b.posicaoAxial);
    return p === null ? (yCascoTop + yCascoBottom) / 2 : clamp(yCascoTop + p * scale, yCascoTop, yCascoBottom);
  });
  for (let i = 1; i < d.virolas; i++) {
    ysOcupados.push(yCascoTop + ((yCascoBottom - yCascoTop) * i) / d.virolas);
  }
  const [yQa, yQb] = escolherTrechoLivre(yCascoTop, yCascoBottom, ysOcupados);
  hachuraRect(parts, xDir - tVisPx, yQa, tVisPx, yQb - yQa, 5, 0.85);
  parts.push(`<line x1="${(xDir - tVisPx).toFixed(1)}" y1="${yQa.toFixed(1)}" x2="${(xDir - tVisPx).toFixed(1)}" y2="${yQb.toFixed(1)}" stroke="${STROKE}" stroke-width="1.1"/>`);
  quebraOndulada(parts, xDir - tVisPx, yQa, xDir, yQa);
  quebraOndulada(parts, xDir - tVisPx, yQb, xDir, yQb);

  // Linha de centro vertical
  const clY1 = clamp(yTop - 12, MARGIN, VB_H - MARGIN);
  const clY2 = clamp(yBottom + 12, MARGIN, VB_H - MARGIN);
  parts.push(`<line x1="${centerX.toFixed(1)}" y1="${clY1.toFixed(1)}" x2="${centerX.toFixed(1)}" y2="${clY2.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="1" stroke-dasharray="${DASH_CL}"/>`);
  parts.push(`<text x="${clamp(centerX + 6, MARGIN, VB_W - MARGIN - 14).toFixed(1)}" y="${clamp(clY1 - 4, MARGIN + 10, VB_H - MARGIN).toFixed(1)}" font-size="${FS_NOTA}" fill="${STROKE_CL}">CL</text>`);

  // Suporte
  const alturaSup = num(m.suporte.altura);
  const hSupPx = clamp(alturaSup === null ? 30 : alturaSup * scale, 14, 44);
  const yBase = clamp(yBottom + hSupPx, MARGIN, VB_H - MARGIN);
  if (temSuporte) {
    if (m.suporte.tipo === 'saia') {
      // Saia: trapézio (leve abertura) + chapa de base
      const wTopo = Dpx * 0.92;
      const wBase = Dpx * 1.02;
      const p: [number, number][] = [
        [clamp(centerX - wTopo / 2, MARGIN, VB_W - MARGIN), clamp(yBottom - prof2Px * 0.35, MARGIN, VB_H - MARGIN)],
        [clamp(centerX + wTopo / 2, MARGIN, VB_W - MARGIN), clamp(yBottom - prof2Px * 0.35, MARGIN, VB_H - MARGIN)],
        [clamp(centerX + wBase / 2, MARGIN, VB_W - MARGIN), yBase - 3],
        [clamp(centerX - wBase / 2, MARGIN, VB_W - MARGIN), yBase - 3],
      ];
      parts.push(`<polygon points="${p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
      parts.push(`<rect x="${(p[3][0] - 4).toFixed(1)}" y="${(yBase - 3).toFixed(1)}" width="${(p[2][0] - p[3][0] + 8).toFixed(1)}" height="3" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
    } else {
      // Pés (ou selas em vaso vertical — fallback igual): pernas inclinadas + chapas de base
      const legW = clamp(Dpx * 0.13, 7, 18);
      for (const lado of [-1, 1]) {
        const xTopo = centerX + lado * RPx * 0.72;
        const xPe = clamp(centerX + lado * RPx * 0.95, MARGIN, VB_W - MARGIN);
        const yEnc = clamp(yBottom - prof2Px * 0.5, MARGIN, VB_H - MARGIN);
        parts.push(`<polygon points="${clamp(xTopo - legW / 2, MARGIN, VB_W - MARGIN).toFixed(1)},${yEnc.toFixed(1)} ${clamp(xTopo + legW / 2, MARGIN, VB_W - MARGIN).toFixed(1)},${yEnc.toFixed(1)} ${clamp(xPe + legW / 2, MARGIN, VB_W - MARGIN).toFixed(1)},${(yBase - 3).toFixed(1)} ${clamp(xPe - legW / 2, MARGIN, VB_W - MARGIN).toFixed(1)},${(yBase - 3).toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
        parts.push(`<rect x="${clamp(xPe - legW / 2 - 5, MARGIN, VB_W - MARGIN).toFixed(1)}" y="${(yBase - 3).toFixed(1)}" width="${(legW + 10).toFixed(1)}" height="3" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"/>`);
      }
    }
    if (alturaSup !== null) {
      const xCotaSup = clamp(xDir + 24, MARGIN, VB_W - MARGIN);
      cota(parts, xCotaSup, yBottom, xCotaSup, yBase, fmt(alturaSup, 0), VB_W, FS_S, 0.5, 'mm');
    }
  }

  // Bocais (guarda a âncora horizontal de cada bocal de casco p/ a linha de chamada da cota)
  const ancoraXCota = new Map<BocalModelo, number>();
  for (const b of m.bocais) {
    const angulo = num(b.angulo);
    const anguloEfetivo = angulo === null ? 0 : angulo;
    const wPx = larguraBocalPx(b, scale, 6, 22);

    if (b.local === 'tampo1' || b.local === 'tampo2') {
      const isTampo1 = b.local === 'tampo1';
      const rad = ((anguloEfetivo - 90) * Math.PI) / 180;
      const rrPx = clamp(RPx * 0.8 * Math.cos(rad), -RPx + 6, RPx - 6);
      const xBocal = centerX + rrPx;
      const recuo = recuoTampoPx(isTampo1 ? m.tampo1.tipo : m.tampo2.tipo, rrPx, RPx, isTampo1 ? prof1Px : prof2Px);
      const yBaseBocal = isTampo1 ? yCascoTop - recuo : yCascoBottom + recuo;
      const tip = bocalFlangeado(parts, clamp(xBocal, MARGIN, VB_W - MARGIN), clamp(yBaseBocal, MARGIN, VB_H - MARGIN), isTampo1 ? -Math.PI / 2 : Math.PI / 2, 26, wPx, { sw: SW_COMP });
      const by = clamp(tip.y + (isTampo1 ? -15 : 15), MARGIN + 14, VB_H - MARGIN - 14);
      idBalao(parts, clamp(xBocal, MARGIN + 14, VB_W - MARGIN - 14), by, esc(b.id), FS_BAL);
      continue;
    }

    const posAxial = num(b.posicaoAxial);
    const yBocal = posAxial === null ? (yCascoTop + yCascoBottom) / 2 : clamp(yCascoTop + posAxial * scale, yCascoTop, yCascoBottom);
    const setor = setorAngulo(anguloEfetivo);

    if (setor === 'a90' || setor === 'a270') {
      const direita = setor === 'a90';
      const tip = bocalFlangeado(parts, direita ? xDir : xEsq, yBocal, direita ? 0 : Math.PI, 26, wPx, { sw: SW_COMP });
      const bx = clamp(tip.x + (direita ? 15 : -15), MARGIN + 14, VB_W - MARGIN - 14);
      idBalao(parts, bx, clamp(yBocal, MARGIN + 14, VB_H - MARGIN - 14), esc(b.id), FS_BAL);
      ancoraXCota.set(b, direita ? xDir : xEsq);
    } else {
      // Frente (0°, sólido) / fundo (180°, tracejado): círculo projetado na face
      const xProj = clamp(centerX + RPx * Math.sin((anguloEfetivo * Math.PI) / 180), xEsq + 6, xDir - 6);
      const diamB = num(b.diametro);
      const rBocal = clamp(((diamB === null ? 60 : diamB) * scale) / 2, 5, RPx * 0.72);
      const oculto = setor === 'a180';
      const estilo = oculto
        ? `fill="none" stroke="${STROKE}" stroke-width="1.6" stroke-dasharray="${DASH_OCULTO}"`
        : `fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_COMP}"`;
      parts.push(`<circle cx="${xProj.toFixed(1)}" cy="${yBocal.toFixed(1)}" r="${rBocal.toFixed(1)}" ${estilo}/>`);
      const bx = clamp(xProj + rBocal + 16, MARGIN + 14, VB_W - MARGIN - 14);
      const by = clamp(yBocal - rBocal - 10, MARGIN + 14, VB_H - MARGIN - 14);
      parts.push(`<line x1="${(xProj + rBocal * 0.7).toFixed(1)}" y1="${(yBocal - rBocal * 0.7).toFixed(1)}" x2="${(bx - 12).toFixed(1)}" y2="${by.toFixed(1)}" stroke="${STROKE}" stroke-width="1"/>`);
      idBalao(parts, bx, by, esc(b.id), FS_BAL);
      ancoraXCota.set(b, clamp(xProj - rBocal, MARGIN, VB_W - MARGIN));
    }
  }

  // Posições das linhas de cota — TODAS à esquerda (como a prancha de referência): colunas
  // axiais mais próximas do vaso, depois L (tangência a tangência) e Total (ápice a ápice)
  // na coluna mais externa. Nada se repete à direita.
  const xCotaCil = clamp(xEsq - 40 - nAx * 24 - 14, MARGIN, VB_W - MARGIN);
  const xCotaTotal = clamp(xCotaCil - 30, MARGIN, VB_W - MARGIN);

  // Linhas de extensão (chamada): geometria → linhas de cota (tangências servem às cotas
  // axiais e à L; ápices servem à Total — o vão de 14px até o ápice evita cruzar o stub do
  // bocal de tampo)
  linhaExt(parts, xCotaCil - 4, yCascoTop, xEsq - 2, yCascoTop);
  linhaExt(parts, xCotaCil - 4, yCascoBottom, xEsq - 2, yCascoBottom);
  linhaExt(parts, xCotaTotal - 4, yTop, centerX - 14, yTop);
  linhaExt(parts, xCotaTotal - 4, yBottom, centerX - 14, yBottom);

  // Cotas axiais (da tangência do tampo1 até o bocal), escalonadas à esquerda, cada uma com
  // linha de chamada horizontal do eixo do bocal até a sua linha de cota. Bocal sem posição
  // informada é desenhado (e cotado) no meio do cilindro — a cota sempre existe.
  let idxCotaAxialV = 0;
  for (const b of bocaisCasco) {
    const posAxial = num(b.posicaoAxial);
    const posEfetiva = posAxial === null ? d.L / 2 : posAxial;
    const yBocal = clamp(yCascoTop + posEfetiva * scale, yCascoTop, yCascoBottom);
    const cotaX = clamp(xEsq - 40 - idxCotaAxialV * 24, MARGIN, VB_W - MARGIN);
    const xAnc = ancoraXCota.get(b);
    if (xAnc !== undefined && xAnc > cotaX + 6) linhaExt(parts, cotaX - 4, yBocal, xAnc, yBocal);
    // frac 0.78: rótulo perto do bocal — alturas de bocal são distintas entre si, então os
    // rótulos das colunas vizinhas (24px) nunca ficam na mesma altura (nem na do rótulo de L)
    cota(parts, cotaX, yCascoTop, cotaX, yBocal, `${esc(b.id)}: ${fmt(posEfetiva, 0)}`, VB_W, FS_S, 0.78, 'mm');
    idxCotaAxialV++;
  }

  // Cotas principais à esquerda: L e Total (valor puro, como a prancha de referência; frac
  // separa as alturas dos rótulos p/ não sobreporem as colunas vizinhas)
  cota(parts, xCotaCil, yCascoTop, xCotaCil, yCascoBottom, `${fmt(d.L, 0)}`, VB_W, FS_S, 0.45, 'mm');
  cota(parts, xCotaTotal, yTop, xCotaTotal, yBottom, `${fmt(d.comprTotal, 0)}`, VB_W, FS_S, 0.62, 'mm');

  // Ø sutil DENTRO do vaso (linha fina parede a parede), desviando das costuras de virola
  let yDiam = yCascoTop + (yCascoBottom - yCascoTop) * 0.42;
  for (let i = 1; i < d.virolas; i++) {
    const yVirola = yCascoTop + ((yCascoBottom - yCascoTop) * i) / d.virolas;
    if (Math.abs(yDiam - yVirola) < 12) {
      yDiam = yVirola - 20;
      break;
    }
  }
  yDiam = clamp(yDiam, yCascoTop + 14, yCascoBottom - 14);
  cota(parts, xEsq, yDiam, xDir, yDiam, `Ø${fmt(d.D, 0)}`, VB_W, FS_S, 0.5, 'mm');

  // Cota de espessura na seção parcial: setas externas apontando para as duas superfícies da
  // parede, rótulo DENTRO do vaso (como o "4.5" da prancha de referência) — o lado direito
  // externo já está ocupado pelos stubs de bocal.
  const yAlvoT = (yQa + yQb) / 2;
  cotaEspessura(parts, xDir - tVisPx, yAlvoT, xDir, yAlvoT, `t=${fmt(d.tCasco, 1)}`, FS_S, 'mm');

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

  const cx = VB_W / 2;
  const cy = VB_H / 2 - 6;

  const bocaisCasco = m.bocais.filter((b) => b.local === 'casco' && num(b.angulo) !== null);
  const bocaisTampo = m.bocais.filter((b) => b.local !== 'casco');
  const nArcos = bocaisCasco.filter((b) => {
    const a = ((num(b.angulo)! % 360) + 360) % 360;
    return a > 0.5 && a < 359.5;
  }).length;

  // Escala tipográfica desta vista (viewBox 360×360 impresso a ~89mm ⇒ ~0,17mm/un).
  const FS_P = 16;
  const FS_S = 13;
  const FS_BAL = 12;
  const FS_NOTA = 11;
  const SW_ANEL = 2.6;
  const SW_ANEL_INT = 1.8;

  // Reserva externa: stub flangeado (26) + balão (13) e/ou arcos escalonados (20 cada)
  const reservaExterna = Math.max(52, 32 + Math.min(nArcos, 5) * 20);
  const raioMax = Math.min(cx, cy) - reservaExterna - 10;
  const r = clamp(raioMax, 30, Math.min(cx, cy) - 20);
  const scale = clamp(r / (d.DExt / 2), 0.0001, 5);
  const tPx = clamp(d.tCasco * scale, 3, 18);
  const rInt = r - tPx;

  const parts: string[] = [];

  // Anel de parede (corte): círculo externo + interno, com hachura de material seccionado
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_ANEL}"/>`);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rInt.toFixed(1)}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_ANEL_INT}"/>`);
  const anelD =
    `M${(cx - r).toFixed(1)},${cy.toFixed(1)} a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)},0 a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)},0 Z ` +
    `M${(cx - rInt).toFixed(1)},${cy.toFixed(1)} a${rInt.toFixed(1)},${rInt.toFixed(1)} 0 1 0 ${(2 * rInt).toFixed(1)},0 a${rInt.toFixed(1)},${rInt.toFixed(1)} 0 1 0 ${(-2 * rInt).toFixed(1)},0 Z`;
  hachuraClip(parts, 'ht-anel', anelD, cx - r, cy - r, 2 * r, 2 * r, 7);

  // Cruz de centro tracejada
  const crossExt = r + 8;
  parts.push(`<line x1="${clamp(cx - crossExt, 2, VB_W - 2).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${clamp(cx + crossExt, 2, VB_W - 2).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${STROKE_CL}" stroke-width="1" stroke-dasharray="${DASH_CL}"/>`);
  parts.push(`<line x1="${cx.toFixed(1)}" y1="${clamp(cy - crossExt, 2, VB_H - 2).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${clamp(cy + crossExt, 2, VB_H - 2).toFixed(1)}" stroke="${STROKE_CL}" stroke-width="1" stroke-dasharray="${DASH_CL}"/>`);

  // Marcas de compasso 0/90/180/270°
  const marcas: { graus: number; dx: number; dy: number; anchor: string }[] = [
    { graus: 0, dx: 0, dy: -6, anchor: 'middle' },
    { graus: 90, dx: 7, dy: 4, anchor: 'start' },
    { graus: 180, dx: 0, dy: 15, anchor: 'middle' },
    { graus: 270, dx: -7, dy: 4, anchor: 'end' },
  ];
  for (const marca of marcas) {
    const rad = ((marca.graus - 90) * Math.PI) / 180;
    const px = cx + (r + 16) * Math.cos(rad);
    const py = cy + (r + 16) * Math.sin(rad);
    parts.push(`<text x="${clamp(px + marca.dx, 14, VB_W - 14).toFixed(1)}" y="${clamp(py + marca.dy, 14, VB_H - 14).toFixed(1)}" font-size="${FS_NOTA}" text-anchor="${marca.anchor}" fill="#555">${marca.graus}°</text>`);
  }

  // Cota diagonal do Ø interno (estilo Ø700 da prancha de referência): 315° → 135°
  const radDiag = ((315 - 90) * Math.PI) / 180;
  const dx1 = cx + rInt * Math.cos(radDiag);
  const dy1 = cy + rInt * Math.sin(radDiag);
  const dx2 = cx - rInt * Math.cos(radDiag);
  const dy2 = cy - rInt * Math.sin(radDiag);
  cota(parts, dx1, dy1, dx2, dy2, `Ø${fmt(d.D, 0)}`, VB_W, FS_P, 0.5, 'mm');

  // Callout de espessura da parede (alvo no anel, a 45°). Texto ACIMA do anel, à direita do
  // compasso 0° — os rótulos dos arcos de ângulo dos bocais ocupam a diagonal direita (raio
  // r+30+…) e cobriam o "t" quando o texto ficava na mesma faixa.
  const rad45 = ((45 - 90) * Math.PI) / 180;
  const xAlvo = cx + (r - tPx / 2) * Math.cos(rad45);
  const yAlvo = cy + (r - tPx / 2) * Math.sin(rad45);
  callout(parts, xAlvo, yAlvo, clamp(cx + r * 0.55, 12, VB_W - 58), clamp(cy - r - 30, 14, VB_H - 14), `t=${fmt(d.tCasco, 1)}`, FS_S, 'mm');

  // Bocais do casco: stub flangeado radial no ângulo + arco de cota angular a partir de 0°.
  // Bocais no MESMO ângulo compartilham um único arco (senão os rótulos se sobrepõem).
  let idxArco = 0;
  const angulosCotados = new Set<number>();
  for (const b of bocaisCasco) {
    const angulo = num(b.angulo)!;
    const a = ((angulo % 360) + 360) % 360;
    const rad = ((a - 90) * Math.PI) / 180;
    const xBase = cx + r * Math.cos(rad);
    const yBase = cy + r * Math.sin(rad);
    const wPx = larguraBocalPx(b, scale, 6, 22);
    const tip = bocalFlangeado(parts, xBase, yBase, rad, 26, wPx, { sw: SW_ANEL_INT });
    const bx = clamp(tip.x + 15 * Math.cos(rad), 14, VB_W - 14);
    const by = clamp(tip.y + 15 * Math.sin(rad), 14, VB_H - 14);
    idBalao(parts, bx, by, esc(b.id), FS_BAL);

    if (a > 0.5 && a < 359.5 && !angulosCotados.has(Math.round(a))) {
      angulosCotados.add(Math.round(a));
      const rArco = clamp(r + 30 + idxArco * 20, r + 14, Math.min(cx, cy) - 14);
      cotaAngular(parts, cx, cy, rArco, 0, a, `${fmt(a, 0)}°`, VB_W, FS_S);
      idxArco++;
    }
  }

  // Bocais de tampo: flange quadrado tracejado (fora do plano de corte) próximo ao centro
  let idxTampo = 0;
  for (const b of bocaisTampo) {
    const angulo = num(b.angulo);
    const a = angulo === null ? 0 : angulo;
    const rad = ((a - 90) * Math.PI) / 180;
    const dist = rInt * 0.4;
    const xB = clamp(cx + dist * Math.cos(rad), 12, VB_W - 12);
    const yB = clamp(cy + dist * Math.sin(rad), 12, VB_H - 12);
    const lado = clamp(larguraBocalPx(b, scale, 6, 22) * 1.6, 12, 32);
    parts.push(`<rect x="${(xB - lado / 2).toFixed(1)}" y="${(yB - lado / 2).toFixed(1)}" width="${lado.toFixed(1)}" height="${lado.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.6" stroke-dasharray="${DASH_OCULTO}"/>`);
    parts.push(`<circle cx="${xB.toFixed(1)}" cy="${yB.toFixed(1)}" r="${(lado * 0.28).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2" stroke-dasharray="${DASH_OCULTO}"/>`);
    const bx = clamp(xB + lado / 2 + 14, 14, VB_W - 14);
    const by = clamp(yB - lado / 2 - 12 - idxTampo * 8, 14, VB_H - 14);
    parts.push(`<line x1="${xB.toFixed(1)}" y1="${yB.toFixed(1)}" x2="${(bx - 12).toFixed(1)}" y2="${by.toFixed(1)}" stroke="${STROKE}" stroke-width="1"/>`);
    idBalao(parts, bx, by, esc(b.id), FS_BAL);
    idxTampo++;
  }

  // Circunferência anotada embaixo
  parts.push(`<text x="${cx.toFixed(1)}" y="${(VB_H - 10).toFixed(1)}" font-size="15" font-weight="700" text-anchor="middle" fill="#111">Circunf.: ${fmt(d.circunf, 1)} mm</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" font-family="Inter, sans-serif">${parts.join('')}</svg>`;
}

// ───────────────────────── Detalhe do tampo (corte) ─────────────────────────

function svgDetalheTampo(tampo: TampoModelo, d: DadosBase): string {
  const VB_W = 360;
  const VB_H = 300;
  const MARGIN = 16;

  const t = num(tampo.espessura) ?? d.t1;
  const DExt = d.D + 2 * t;
  const dims = dimensoesTampo(tampo.tipo, d.D, t);

  // Escala tipográfica desta vista (viewBox 360×300 impresso a ~89mm ⇒ ~0,20mm/un).
  const FS_TIT = 15;
  const FS_C = 13;
  const FS_CALL = 12;
  const SW_EXT = 2.2;
  const SW_INT = 1.6;

  const AREA_W = VB_W - 2 * MARGIN - 100; // reserva p/ cotas h (dir) e t (esq)
  const AREA_H = VB_H - 158; // topo: título; baixo: casco + cota Ø
  const profRef = Math.max(dims.profundidade, 8);
  const scale = clamp(Math.min(AREA_W / DExt, AREA_H / profRef), 0.0001, 5);

  const xCentro = VB_W / 2;
  const yBase = clamp(VB_H - 92, MARGIN, VB_H - MARGIN);
  const RextPx = (DExt / 2) * scale;
  const xEsq = clamp(xCentro - RextPx, MARGIN, VB_W - MARGIN);
  const xDir = clamp(xCentro + RextPx, MARGIN, VB_W - MARGIN);

  const parts: string[] = [];

  // Perfil em corte (parede dupla) apontando para cima, com hachura do material seccionado
  const map: MapaLocal = (z, r) => [xCentro + r * scale, yBase - z * scale];
  const perfil = perfilTampoDuplo(tampo.tipo, DExt, t, map);
  parts.push(`<path d="${perfil.externo}" fill="${FILL_BRANCO}" stroke="${STROKE}" stroke-width="${SW_EXT}"/>`);
  if (perfil.interno) {
    parts.push(`<path d="${perfil.interno}" fill="none" stroke="${STROKE}" stroke-width="${SW_INT}"/>`);
  }
  const yPonta = clamp(yBase - perfil.profundidadeExt * scale, MARGIN, yBase);
  // Hachura entre os perfis externo e interno (interno fechado vira furo via evenodd); no tampo
  // plano não há perfil interno e a chapa inteira é hachurada — correto para um corte.
  const tampoD = perfil.interno ? `${perfil.externo} ${perfil.interno} Z` : perfil.externo;
  hachuraClip(parts, 'ht-tampo', tampoD, xEsq, yPonta, xDir - xEsq, yBase - yPonta, 6);

  // Trecho do casco em corte abaixo da linha de tangência (junção soldada), hachurado
  const tPx = clamp(t * scale, 1.5, 14);
  const hCasco = 22;
  for (const lado of [-1, 1]) {
    const xExt = xCentro + lado * RextPx;
    const xInt = xCentro + lado * (RextPx - tPx);
    parts.push(`<line x1="${xExt.toFixed(1)}" y1="${yBase.toFixed(1)}" x2="${xExt.toFixed(1)}" y2="${clamp(yBase + hCasco, MARGIN, VB_H - MARGIN).toFixed(1)}" stroke="${STROKE}" stroke-width="${SW_EXT}"/>`);
    parts.push(`<line x1="${xInt.toFixed(1)}" y1="${yBase.toFixed(1)}" x2="${xInt.toFixed(1)}" y2="${clamp(yBase + hCasco, MARGIN, VB_H - MARGIN).toFixed(1)}" stroke="${STROKE}" stroke-width="${SW_INT}"/>`);
    hachuraRect(parts, Math.min(xExt, xInt), yBase, tPx, hCasco, 4);
  }
  costura(parts, clamp(xEsq - 8, MARGIN, VB_W - MARGIN), yBase, clamp(xDir + 8, MARGIN, VB_W - MARGIN), yBase, 1.2);

  // Título
  parts.push(`<text x="${xCentro.toFixed(1)}" y="20" font-size="${FS_TIT}" font-weight="800" text-anchor="middle" fill="#111">${tipoTampoPorExtenso(tampo.tipo)}</text>`);

  // Cotas: Ø (abaixo do casco), profundidade h (direita), espessura t (callout na parede)
  const yCotaD = clamp(yBase + hCasco + 18, MARGIN, VB_H - MARGIN);
  cota(parts, xEsq, yCotaD, xDir, yCotaD, `Ø${fmt(d.D, 0)}`, VB_W, FS_C, 0.5, 'mm');

  const xCotaProf = clamp(xDir + 26, MARGIN, VB_W - MARGIN);
  cota(parts, xCotaProf, yPonta, xCotaProf, yBase, `h=${fmt(dims.profundidade, 1)}`, VB_W, FS_C, 0.5, 'mm');

  callout(
    parts,
    clamp(xEsq + tPx / 2, MARGIN, VB_W - MARGIN),
    clamp(yBase + hCasco / 2, MARGIN, VB_H - MARGIN),
    clamp(xEsq - 30, MARGIN + 4, VB_W - MARGIN),
    clamp(yBase + hCasco + 4, MARGIN, VB_H - MARGIN),
    `t=${fmt(t, 1)}`,
    FS_CALL,
    'mm',
  );

  // Toriesférico: leaders do raio da coroa (Rc, no ápice, texto à direita) e do raio de canto
  // (rc, no canto ESQUERDO, texto acima-esquerda — o lado direito já tem a cota h)
  if (tampo.tipo === 'toriesferico') {
    callout(parts, clamp(xCentro + RextPx * 0.35, MARGIN, VB_W - MARGIN), clamp(yPonta + (yBase - yPonta) * 0.12, MARGIN, VB_H - MARGIN), clamp(xCentro + RextPx * 0.55, MARGIN, VB_W - MARGIN - 56), clamp(yPonta - 16, MARGIN + 10, VB_H - MARGIN), `Rc=${fmt(dims.raioCoroa, 0)}`, FS_CALL, 'mm');
    const xCanto = xCentro - RextPx * 0.93;
    const yCanto = yBase - (yBase - yPonta) * 0.32;
    callout(parts, clamp(xCanto, MARGIN, VB_W - MARGIN), clamp(yCanto, MARGIN, VB_H - MARGIN), clamp(xEsq - 14, MARGIN + 4, VB_W - MARGIN), clamp(yCanto - 24, MARGIN + 10, VB_H - MARGIN), `rc=${fmt(dims.raioCanto, 0)}`, FS_CALL, 'mm');
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
    detalheTampo: svgDetalheTampo(m.tampo1, d),
  };
}
