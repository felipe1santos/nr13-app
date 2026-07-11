// Perfis geométricos reais dos tampos para o croqui 2D (fase 2.1 do Modelador de Vaso).
// Cada perfil é uma polilinha amostrada em COORDENADAS LOCAIS (z, r):
//   z = distância axial a partir da linha de tangência (0 = junção com o casco, h = ápice), em mm
//   r = coordenada radial (−R .. +R), em mm
// O chamador fornece um `MapaLocal` (z,r) → (x,y) em px que resolve orientação (esq/dir/cima/
// baixo) e escala — polilinhas são invariantes a qualquer transformação linear, o que elimina o
// manejo de sweep-flags de arcos SVG em 5 orientações diferentes.
//
// Geometrias:
// - Elíptico 2:1: semielipse com h = D/4.
// - Toriesférico (Klopper): coroa Rc = D + canto rc = 0,1·D REAIS, tangentes entre si
//   (h resultante ≈ 0,1935·D — bate com `dimensoesTampo`).
// - Hemisférico: semicírculo, h = D/2.
// - Plano: retângulo com profundidade = espessura.
import type { TipoTampoModelo } from './tiposModelador';

export type MapaLocal = (z: number, r: number) => [number, number];

/** Amostra o perfil completo (borda superior → ápice → borda inferior) em coords locais (z, r). */
export function pontosPerfilTampo(tipo: TipoTampoModelo, R: number, h: number): [number, number][] {
  const N = 48;
  const pts: [number, number][] = [];

  switch (tipo) {
    case 'plano':
      return [
        [0, R],
        [h, R],
        [h, -R],
        [0, -R],
      ];

    case 'hemisferico':
    case 'eliptico': {
      // Semielipse: r = R·cos φ, z = h·sin φ, φ ∈ [0, π] (hemisférico é o caso h = R).
      for (let i = 0; i <= N; i++) {
        const phi = (Math.PI * i) / N;
        pts.push([h * Math.sin(phi), R * Math.cos(phi)]);
      }
      return pts;
    }

    case 'toriesferico': {
      // Klopper: coroa Rc = D = 2R (centro no eixo, z = h − Rc); canto rc = 0,2R = 0,1D
      // (centro na linha de tangência, r = R − rc). Ponto de tangência T na reta que liga os
      // dois centros (dist. entre centros = Rc − rc).
      const Rc = 2 * R;
      const rc = 0.2 * R;
      const dz = Rc - h; // componente z do vetor (centro da coroa → centro do canto)
      const dr = R - rc;
      const norm = Math.hypot(dz, dr) || 1;
      // Ângulo do canto na tangência: ponto = (rc·sinθ, R−rc + rc·cosθ), θ=0 na borda (0, R).
      const thetaT = Math.atan2(dz / norm, dr / norm);
      // Ângulo da coroa na tangência: ponto = (h−Rc + Rc·cosα, Rc·sinα), α=0 no ápice (h, 0).
      const tz = rc * Math.sin(thetaT);
      const tr = R - rc + rc * Math.cos(thetaT);
      const alphaT = Math.atan2(tr, tz - (h - Rc));

      const NC = 10; // amostras do canto
      const NK = 16; // amostras de meia coroa
      // Metade superior: borda (0, R) → canto → tangência → coroa → ápice (h, 0)
      for (let i = 0; i <= NC; i++) {
        const th = (thetaT * i) / NC;
        pts.push([rc * Math.sin(th), R - rc + rc * Math.cos(th)]);
      }
      for (let i = 1; i <= NK; i++) {
        const al = alphaT * (1 - i / NK);
        pts.push([h - Rc + Rc * Math.cos(al), Rc * Math.sin(al)]);
      }
      // Metade inferior: espelho em r, do ápice de volta à borda (0, −R)
      for (let i = pts.length - 2; i >= 0; i--) {
        const [z, r] = pts[i];
        pts.push([z, -r]);
      }
      return pts;
    }
  }
}

/** Converte a polilinha local em path SVG via `map`; `fechar` adiciona Z (corda fecha o perfil). */
export function pathPerfil(pontos: [number, number][], map: MapaLocal, fechar: boolean): string {
  if (pontos.length === 0) return '';
  const [x0, y0] = map(pontos[0][0], pontos[0][1]);
  let d = `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  for (let i = 1; i < pontos.length; i++) {
    const [x, y] = map(pontos[i][0], pontos[i][1]);
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return fechar ? `${d} Z` : d;
}

export interface PerfilDuplo {
  /** Path fechado do contorno externo (para fill branco + stroke). */
  externo: string;
  /** Path aberto do contorno interno (parede) — vazio para tampo plano com t ínfima. */
  interno: string;
  /** Profundidade externa usada (mm) — conveniência p/ cotas. */
  profundidadeExt: number;
}

/** Profundidade do tampo em função do Ø usado no DESENHO (mesmas fórmulas de `dimensoesTampo`). */
function profundidade(tipo: TipoTampoModelo, D: number, t: number): number {
  switch (tipo) {
    case 'eliptico':
      return D / 4;
    case 'toriesferico':
      return 0.1935 * D;
    case 'hemisferico':
      return D / 2;
    case 'plano':
      return t;
  }
}

/**
 * Perfis externo+interno do tampo em px, prontos para desenhar em corte (parede dupla).
 * `Dext` = Ø externo (mm), `t` = espessura (mm), `map` resolve orientação+escala.
 * O contorno interno usa Ø−2t e a profundidade correspondente (aproximação de offset suficiente
 * para desenho; não é usado em cálculo).
 */
export function perfilTampoDuplo(tipo: TipoTampoModelo, Dext: number, t: number, map: MapaLocal): PerfilDuplo {
  const Rext = Dext / 2;
  const hExt = profundidade(tipo, Dext, t);
  const externo = pathPerfil(pontosPerfilTampo(tipo, Rext, hExt), map, true);

  const tEfetiva = Math.min(Math.max(t, 0), Rext * 0.5);
  const Rint = Rext - tEfetiva;
  let interno = '';
  if (Rint > 1 && tEfetiva > 0) {
    if (tipo === 'plano') {
      // Plano em corte: parede interna é a face plana interna (z = 0 já é a face; não desenha).
      interno = '';
    } else {
      const hInt = Math.max(profundidade(tipo, 2 * Rint, tEfetiva), 1);
      interno = pathPerfil(pontosPerfilTampo(tipo, Rint, hInt), map, false);
    }
  }
  return { externo, interno, profundidadeExt: hExt };
}
