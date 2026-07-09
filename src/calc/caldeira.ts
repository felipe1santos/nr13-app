// Motor de cálculo de CALDEIRAS — ASME Seção I, edição 2004.
// Fórmulas transcritas RIGOROSAMENTE das planilhas de referência do usuário
// (Memorial de Cálculo Costado/Tubo/Espelho): PG-27.2.2, PG-27.2.1 e PG-46.1.
// Unidades internas: MPa e mm (mesma convenção de calc/vaso.ts).
// PMTA (kgf/cm²) = P de projeto × 10,19716 (a planilha NÃO inverte a fórmula pela
// espessura encontrada); TH = 1,5 × PMTA (teste hidrostático de caldeira — difere
// do 1,3 do vaso ASME VIII).
import type { NumLike, Resultado } from './tipos';

export const KGF_POR_MPA = 10.19716;

export function pmtaCaldeiraKgf(pMpa: number): number {
  return pMpa * KGF_POR_MPA;
}
export function thCaldeiraKgf(pMpa: number): number {
  return 1.5 * pmtaCaldeiraKgf(pMpa);
}

interface EtapaCaldeiraBase {
  S?: NumLike; // tensão admissível (MPa)
  mat?: string;
  espProjeto?: NumLike; // espessura de projeto (mm) — informativa
  espEncontrada?: NumLike; // espessura encontrada/medida (mm) — critério de aprovação
}
export interface CostadoCaldeira extends EtapaCaldeiraBase {
  D?: NumLike; // diâmetro (mm)
  E?: NumLike; // eficiência de solda
  y?: NumLike; // coeficiente de temperatura (default 0,40 — planilha)
  C?: NumLike; // sobrecorrosão (mm, default 0)
}
export interface TuboCaldeira extends EtapaCaldeiraBase {
  D?: NumLike; // diâmetro EXTERNO do tubo (mm)
  fatorE?: NumLike; // fator de espessura "e" da PG-27.2.1 (mm, default 0)
}
export interface EspelhoCaldeira extends EtapaCaldeiraBase {
  passo?: NumLike; // passo dos estais p (mm)
  cEstais?: NumLike; // constante C dos estais (default 2,2 — soldados, planilha)
}

export interface ResultadoEtapaCaldeira {
  e: number; // espessura mínima calculada (mm)
  resultado: Resultado;
  log: string[];
  faltantes: string[];
}

function numOuPadrao(v: NumLike, padrao: number): number {
  if (v === undefined || v === null || v === '') return padrao;
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}
const vazio = (v: NumLike | undefined) =>
  v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;

function cabecalho(nome: string, paragrafo: string, P: number, temp: number): string[] {
  return [
    `// ====================================================`,
    `// MEMORIAL DE CÁLCULO: ${nome}`,
    `// Norma Base: ASME Seção I (2004) — Parágrafo ${paragrafo}`,
    `// ====================================================`,
    `// PARÂMETROS GERAIS DE ENTRADA`,
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto da caldeira)`,
    `// T = ${temp.toFixed(2)} °C (Temperatura de Projeto)`,
  ];
}

function statusEspessura(e: number, encontrada: number): { ok: boolean; linha: string } {
  const ok = encontrada >= e;
  const css = ok ? 'msg-aprovado' : 'msg-reprovado';
  const txt = ok
    ? `STATUS: APROVADO. Espessura encontrada (${encontrada.toFixed(2)} mm) ≥ espessura mínima calculada (${e.toFixed(3)} mm).`
    : `STATUS: REPROVADO! Espessura encontrada (${encontrada.toFixed(2)} mm) < espessura mínima calculada (${e.toFixed(3)} mm).`;
  return { ok, linha: `<span class="${css}">${txt}</span>` };
}

export function calcularCostadoCaldeira(P: NumLike, temp: NumLike, dados: CostadoCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const D = numOuPadrao(dados.D, 0);
  const S = numOuPadrao(dados.S, 0);
  const E = numOuPadrao(dados.E, 0);
  const y = numOuPadrao(dados.y, 0.4);
  const C = numOuPadrao(dados.C, 0);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const denom = 2 * S * E + 2 * y * p;
  const e = denom > 0 ? (p * D) / denom + C : 0;
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.D)) faltantes.push('D — Diâmetro');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.E)) faltantes.push('E — Eficiência de Solda');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('COSTADO (ASME I — PG-27.2.2)', 'PG-27.2.2 — Espessura Mínima do Costado', p, t).concat([
    `// D = ${D.toFixed(2)} mm (Diâmetro) | S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// E = ${E.toFixed(2)} (Eficiência de solda) | y = ${y.toFixed(2)} (Coef. de temperatura) | C = ${C.toFixed(2)} mm (Sobrecorrosão)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-27.2.2)`,
    `$$ e = \\frac{P \\cdot D}{2 \\cdot S \\cdot E + 2 \\cdot y \\cdot P} + C $$`,
    `$$ e = \\frac{${p.toFixed(4)} \\cdot ${D.toFixed(2)}}{2 \\cdot ${S.toFixed(2)} \\cdot ${E.toFixed(2)} + 2 \\cdot ${y.toFixed(2)} \\cdot ${p.toFixed(4)}} + ${C.toFixed(2)} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}

export function calcularTuboCaldeira(P: NumLike, temp: NumLike, dados: TuboCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const D = numOuPadrao(dados.D, 0);
  const S = numOuPadrao(dados.S, 0);
  const fatorE = numOuPadrao(dados.fatorE, 0);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const denom = 2 * S + p;
  const e = denom > 0 ? (p * D) / denom + 0.005 * D + fatorE : 0;
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.D)) faltantes.push('D — Diâmetro do Tubo');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('TUBO (ASME I — PG-27.2.1)', 'PG-27.2.1 — Espessura Mínima do Tubo', p, t).concat([
    `// D = ${D.toFixed(2)} mm (Diâmetro externo do tubo) | S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// e_fator = ${fatorE.toFixed(2)} mm (Fator de espessura da PG-27.2.1)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-27.2.1)`,
    `$$ e = \\frac{P \\cdot D}{2 \\cdot S + P} + 0.005 \\cdot D + e_{fator} $$`,
    `$$ e = \\frac{${p.toFixed(4)} \\cdot ${D.toFixed(2)}}{2 \\cdot ${S.toFixed(2)} + ${p.toFixed(4)}} + 0.005 \\cdot ${D.toFixed(2)} + ${fatorE.toFixed(2)} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}

export function calcularEspelhoCaldeira(P: NumLike, temp: NumLike, dados: EspelhoCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const S = numOuPadrao(dados.S, 0);
  const passo = numOuPadrao(dados.passo, 0);
  const cEstais = numOuPadrao(dados.cEstais, 2.2);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const radicando = S * cEstais > 0 ? p / (S * cEstais) : 0;
  const e = passo * Math.sqrt(radicando);
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.passo)) faltantes.push('p — Passo dos Estais');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('ESPELHO DIANTEIRO/TRASEIRO (ASME I — PG-46.1)', 'PG-46.1 — Espessura Mínima do Espelho', p, t).concat([
    `// S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// p = ${passo.toFixed(2)} mm (Passo dos estais) | C = ${cEstais.toFixed(2)} (Constante — estais soldados: 2,2)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-46.1)`,
    `$$ e = p \\cdot \\sqrt{\\frac{P}{S \\cdot C}} $$`,
    `$$ e = ${passo.toFixed(2)} \\cdot \\sqrt{\\frac{${p.toFixed(4)}}{${S.toFixed(2)} \\cdot ${cEstais.toFixed(2)}}} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}
