import type { ModeloVaso, TipoTampoModelo } from './tiposModelador';

/**
 * Helper: convert number or empty string to number or null
 */
export function num(v: number | ''): number | null {
  if (v === '') return null;
  return v;
}

/**
 * Calculates dimensions of a head type based on diameter and thickness.
 * Returns profundidade (depth), raioCoroa (crown radius), and raioCanto (corner radius).
 *
 * Formulas:
 * - Elíptico 2:1: h = D/4
 * - Toriesférico (Klopper): h ≈ 0,1935·D, coroa=D, canto=0,1·D
 * - Hemisferico: h = D/2
 * - Plano: h = t
 */
export function dimensoesTampo(tipo: TipoTampoModelo, D: number, t: number): {
  profundidade: number;
  raioCoroa: number | null;
  raioCanto: number | null;
} {
  switch (tipo) {
    case 'eliptico':
      // Elliptical 2:1 head: depth = D/4
      return { profundidade: D / 4, raioCoroa: null, raioCanto: null };

    case 'toriesferico':
      // Torispheric head (Klopper approximation)
      // h ≈ 0.1935·D, crown radius = D, corner radius = 0.1·D
      return {
        profundidade: 0.1935 * D,
        raioCoroa: D,
        raioCanto: 0.1 * D,
      };

    case 'hemisferico':
      // Hemispherical head: depth = D/2
      return { profundidade: D / 2, raioCoroa: null, raioCanto: null };

    case 'plano':
      // Flat head: depth = thickness
      return { profundidade: t, raioCoroa: null, raioCanto: null };
  }
}

/**
 * Direção radial local (no plano XZ, ANTES de qualquer rotação de orientação do vaso) de um bocal
 * dado seu ângulo em graus — fonte única de verdade da convenção de ângulo, compartilhada entre
 * `Viewport3D.tsx` (3D) e `croqui2dService.ts` (2D: `svgTransversal`/`anguloParaXY`, que usa
 * `rad = (angulo-90)·π/180`, x=cx+r·cos(rad), y=cy+r·sin(rad) em coordenadas de TELA (y para
 * baixo) ⇒ 0°=topo, sentido horário visto de cima).
 *
 * DERIVAÇÃO (prova geométrica — ver revisão de branch que motivou este helper):
 * 1. Defina φ = ânguloGraus em radianos, medido no sentido horário a partir do "topo" — mesma
 *    referência do compasso 2D. Numa parametrização (direita, cima) de um círculo percorrido no
 *    sentido horário a partir do topo: direita = sin(φ), cima = cos(φ). Prova: φ=0 → (0,1) = topo;
 *    φ=90° → (1,0) = direita; φ=180° → (0,−1) = baixo; φ=270° → (−1,0) = esquerda — exatamente as
 *    4 posições do mostrador de um relógio, confirmando o sentido horário.
 *    (Equivalência com a fórmula do croqui2d: cos(φ−90°) = sin(φ) e −sin(φ−90°) = cos(φ), e como o
 *    SVG usa y PARA BAIXO, "−sin(φ−90°)" para cima em tela equivale a "cima"=cos(φ) acima — mesma
 *    parametrização, dois sistemas de coordenadas diferentes.)
 * 2. No Viewport3D, o casco/tampos são construídos com o eixo do vaso = Y local; o bocal nasce
 *    apontando ao longo de +X local (ver `construirBocal`), ou seja, a referência "0°" do corpo
 *    do bocal É o eixo local X. Quando o vaso está deitado (`orientacao='horizontal'`), o grupo
 *    inteiro gira `rotation.z = +90°` — sob essa rotação (R_z, mão direita): novo_x = x·cosψ−y·sinψ,
 *    novo_y = x·sinψ+y·cosψ (z inalterado); com ψ=90°, o eixo local +X (1,0,0) mapeia para
 *    mundo (0,1,0) = +Y do mundo, que é "para cima" na cena (câmera trata Y como vertical).
 *    Logo, para "0°=topo" quando horizontal, a direção local ANTES da rotação de orientação
 *    precisa ser +X local — daí `direcaoBocalLocal(0) = (x:1, z:0)`.
 * 3. Tomando local-X como "cima" e local-Z como "direita" (consistente com olhar o vaso pelo eixo
 *    Y, i.e. a MESMA vista de topo/transversal do croqui2d) e aplicando o passo 1
 *    (direita=sin φ, cima=cos φ): x_local = cos(φ), z_local = sin(φ).
 *
 * Resultado: 0°→(1,0) [topo local]; 90°→(0,+1); 180°→(−1,0); 270°→(0,−1) — sentido horário visto
 * de cima, igual ao croqui2d.
 */
export function direcaoBocalLocal(anguloGraus: number): { x: number; z: number } {
  const rad = (anguloGraus * Math.PI) / 180;
  return { x: Math.cos(rad), z: Math.sin(rad) };
}

/**
 * Total length in mm: cylinder length + depth of head1 + depth of head2.
 * Uses the thickness from each head (espessura) to calculate its depth.
 * Returns null if any required field is empty.
 */
export function comprimentoTotalMm(m: ModeloVaso): number | null {
  const D = num(m.diametroInterno);
  const L = num(m.comprimentoCilindro);
  const t1 = num(m.tampo1.espessura);
  const t2 = num(m.tampo2.espessura);

  if (D === null || L === null || t1 === null || t2 === null) {
    return null;
  }

  const prof1 = dimensoesTampo(m.tampo1.tipo, D, t1).profundidade;
  const prof2 = dimensoesTampo(m.tampo2.tipo, D, t2).profundidade;

  return L + prof1 + prof2;
}

/**
 * Circumference in mm: π·(D + 2·espessuraCasco).
 * Returns null if D or espessuraCasco is empty.
 */
export function circunferenciaMm(m: ModeloVaso): number | null {
  const D = num(m.diametroInterno);
  const t = num(m.espessuraCasco);

  if (D === null || t === null) {
    return null;
  }

  return Math.PI * (D + 2 * t);
}

/**
 * Internal volume in m³ (converted from mm).
 * Cylinder: π·(D/2)²·L
 * Per head:
 * - Elliptical: π·D³/24
 * - Torispheric (Klopper): 0.0847·D³
 * - Hemispherical: π·D³/12
 * - Flat: 0
 * Returns null if any required field is empty.
 */
export function volumeInternoM3(m: ModeloVaso): number | null {
  const D = num(m.diametroInterno);
  const L = num(m.comprimentoCilindro);
  const t1 = num(m.tampo1.espessura);
  const t2 = num(m.tampo2.espessura);

  if (D === null || L === null || t1 === null || t2 === null) {
    return null;
  }

  // Cylinder volume (all in mm, convert mm³ to m³ at the end)
  // π·(D/2)²·L = π·D²·L/4
  const volumeCilindroMm3 = Math.PI * (D / 2) ** 2 * L;

  // Head 1 volume
  let volumeTampo1Mm3 = 0;
  switch (m.tampo1.tipo) {
    case 'eliptico':
      volumeTampo1Mm3 = (Math.PI * D ** 3) / 24;
      break;
    case 'toriesferico':
      volumeTampo1Mm3 = 0.0847 * D ** 3;
      break;
    case 'hemisferico':
      volumeTampo1Mm3 = (Math.PI * D ** 3) / 12;
      break;
    case 'plano':
      volumeTampo1Mm3 = 0;
      break;
  }

  // Head 2 volume
  let volumeTampo2Mm3 = 0;
  switch (m.tampo2.tipo) {
    case 'eliptico':
      volumeTampo2Mm3 = (Math.PI * D ** 3) / 24;
      break;
    case 'toriesferico':
      volumeTampo2Mm3 = 0.0847 * D ** 3;
      break;
    case 'hemisferico':
      volumeTampo2Mm3 = (Math.PI * D ** 3) / 12;
      break;
    case 'plano':
      volumeTampo2Mm3 = 0;
      break;
  }

  // Convert mm³ to m³ (1 m³ = 10^9 mm³)
  const totalMm3 = volumeCilindroMm3 + volumeTampo1Mm3 + volumeTampo2Mm3;
  return totalMm3 / 1e9;
}

/**
 * Steel volume in m³ (casca fina approximation: area × thickness).
 * Cylinder: π·(D+t)·L·t
 * Per head (area × t):
 * - Elliptical: area = 1.084·D²
 * - Torispheric: area = 0.99·D²
 * - Hemispherical: area = (π/2)·D²
 * - Flat: area = (π/4)·D²
 * Per bocal: π·(d+t_bocal)·projecao·t_bocal (if complete)
 * Support (saia): π·(D+t)·altura·t (using cylinder thickness); others: 0
 * Returns null if D, L, or t is empty.
 */
export function volumeAcoM3(m: ModeloVaso): number | null {
  const D = num(m.diametroInterno);
  const L = num(m.comprimentoCilindro);
  const t = num(m.espessuraCasco);
  const t1 = num(m.tampo1.espessura);
  const t2 = num(m.tampo2.espessura);

  if (D === null || L === null || t === null || t1 === null || t2 === null) {
    return null;
  }

  // Cylinder volume: π·(D+t)·L·t (mm³)
  const volumeCascaMm3 = Math.PI * (D + t) * L * t;

  // Head 1 area and volume
  let areaTampo1Mm2 = 0;
  switch (m.tampo1.tipo) {
    case 'eliptico':
      areaTampo1Mm2 = 1.084 * D ** 2;
      break;
    case 'toriesferico':
      areaTampo1Mm2 = 0.99 * D ** 2;
      break;
    case 'hemisferico':
      areaTampo1Mm2 = (Math.PI / 2) * D ** 2;
      break;
    case 'plano':
      areaTampo1Mm2 = (Math.PI / 4) * D ** 2;
      break;
  }
  const volumeTampo1Mm3 = areaTampo1Mm2 * t1;

  // Head 2 area and volume
  let areaTampo2Mm2 = 0;
  switch (m.tampo2.tipo) {
    case 'eliptico':
      areaTampo2Mm2 = 1.084 * D ** 2;
      break;
    case 'toriesferico':
      areaTampo2Mm2 = 0.99 * D ** 2;
      break;
    case 'hemisferico':
      areaTampo2Mm2 = (Math.PI / 2) * D ** 2;
      break;
    case 'plano':
      areaTampo2Mm2 = (Math.PI / 4) * D ** 2;
      break;
  }
  const volumeTampo2Mm3 = areaTampo2Mm2 * t2;

  // Bocals: π·(d+t_bocal)·projecao·t_bocal (if all fields present)
  let volumeBocaisMm3 = 0;
  for (const bocal of m.bocais) {
    const dBocal = num(bocal.diametro);
    const tBocal = num(bocal.espessura);
    const proj = num(bocal.projecao);

    if (dBocal !== null && tBocal !== null && proj !== null) {
      volumeBocaisMm3 += Math.PI * (dBocal + tBocal) * proj * tBocal;
    }
  }

  // Support
  let volumeSuporteMm3 = 0;
  if (m.suporte.tipo === 'saia') {
    const altura = num(m.suporte.altura);
    if (altura !== null) {
      // π·(D+t)·altura·t (using cylinder thickness)
      volumeSuporteMm3 = Math.PI * (D + t) * altura * t;
    }
  }
  // For 'pes', 'selas', 'nenhum': volume = 0

  const totalMm3 = volumeCascaMm3 + volumeTampo1Mm3 + volumeTampo2Mm3 + volumeBocaisMm3 + volumeSuporteMm3;
  return totalMm3 / 1e9; // Convert mm³ to m³
}

/**
 * Weights in kg.
 * - vazioKg: volumeAco × densidadeAco
 * - cheioDaguaKg: vazioKg + volumeInterno × 1000 (water density)
 * - operacaoKg: pesoOperacao if provided, else cheioDaguaKg
 * Returns null for any weight if the required volume is null.
 */
export function pesosKg(m: ModeloVaso): {
  vazioKg: number | null;
  cheioDaguaKg: number | null;
  operacaoKg: number | null;
} {
  const volAco = volumeAcoM3(m);
  const volInterno = volumeInternoM3(m);
  const pesoOp = num(m.pesoOperacao);

  if (volAco === null) {
    // Sem volume de aço calculável (faltam dados do casco/tampos) — ainda assim, se o usuário
    // digitou o peso de operação manualmente, ele não pode ser forçado a null (nunca descartar
    // dado que o usuário digitou).
    return { vazioKg: null, cheioDaguaKg: null, operacaoKg: pesoOp };
  }

  const vazioKg = volAco * m.densidadeAco;

  if (volInterno === null) {
    return { vazioKg, cheioDaguaKg: null, operacaoKg: pesoOp };
  }

  const cheioDaguaKg = vazioKg + volInterno * 1000; // water density = 1000 kg/m³
  const operacaoKg = pesoOp !== null ? pesoOp : cheioDaguaKg;

  return {
    vazioKg,
    cheioDaguaKg,
    operacaoKg,
  };
}
