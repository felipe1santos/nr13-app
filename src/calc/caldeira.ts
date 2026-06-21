// Porte verbatim de CalculoCaldeira (math.js linhas 563-934) — ASME Sec. I.
// fornalhaOndulada mantém a ressalva "NÃO VERIFICADO" como está hoje (decisão tomada com o
// usuário: pesquisa não confirmou a convenção de unidade exata da fórmula PFT-19 original).
import { CSS_AVISO, CSS_ERRO, CSS_OK, num, numOuPadrao } from './format';
import type { NumLike, ResultadoCalculo, ResultadoTeste } from './tipos';

export interface DadosCosto {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia: NumLike;
  diametro_externo: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
  temperatura?: NumLike;
  y?: NumLike;
}

export interface DadosTubo {
  pressao: NumLike;
  tensao: NumLike;
  diametro_externo: NumLike;
  e_fator?: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export interface DadosTampoAbaulado {
  pressao: NumLike;
  tensao: NumLike;
  raio_crown: NumLike;
  w_solda?: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export interface DadosEspelhoEstaiado {
  pressao: NumLike;
  tensao: NumLike;
  passo: NumLike;
  c_stay?: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
  estais_soldados?: boolean;
}

export interface DadosPlacaPlana {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia?: NumLike;
  c_flat?: NumLike;
  diametro_medicao: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export interface DadosFornalhaOndulada {
  pressao: NumLike;
  diametro_medio: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
  tipo_fornalha?: 'fox' | 'morison' | 'leeds' | string;
}

export interface DadosTesteHidrostaticoCaldeira {
  pmta: NumLike;
  tensao_componente_limitante: NumLike;
  sigma_escoamento?: NumLike;
}

// Coeficiente de temperatura y (PG-27.4 nota 6) — aço ferrítico. Usado quando o usuário não
// informa y manualmente.
export function coeficienteYCaldeira(temperaturaC: NumLike): number {
  const T = numOuPadrao(temperaturaC, 0);
  if (T <= 480) return 0.4;
  if (T <= 510) return 0.5;
  return 0.7;
}

// PG-27.2.2 — Costado / tubulão / corpo cilíndrico (por diâmetro externo)
export function costado(dados: DadosCosto, nomeComponente = 'COSTADO DE CALDEIRA'): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = num(dados.eficiencia);
  const D = num(dados.diametro_externo);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const temperatura = numOuPadrao(dados.temperatura, 0);
  const yInformado = dados.y !== undefined && dados.y !== '';
  const y = yInformado ? num(dados.y) : coeficienteYCaldeira(temperatura);
  const t_util = t_nom - C;

  const PISO_PG16_3 = 6.0; // mm — parede mínima de chapa de caldeira sob pressão (exceto caldeira elétrica)

  const t_calc = (P * D) / (2 * S * E + 2 * y * P) + C;
  const t_min = Math.max(t_calc, PISO_PG16_3);
  const pmta = (2 * S * E * t_util) / (D - 2 * y * t_util);

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    `// MEMORIAL DE CÁLCULO - ${nomeComponente.toUpperCase()} (NR-13)`,
    '// Norma Base: ASME Sec. I - Parágrafo PG-27.2.2 (por diâmetro externo)',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto)`,
    `// D = ${D.toFixed(4)} mm (Diâmetro Externo do Costado)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Admissível do material)`,
    `// E = ${E.toFixed(4)} (Eficiência de junta / ligamento entre furos — PG-52/53)`,
    `// T = ${temperatura.toFixed(2)} °C (Temperatura de projeto)`,
    `// y = ${y.toFixed(4)} (Coeficiente de temperatura — PG-27.4 nota 6${yInformado ? ', informado manualmente' : ', obtido automaticamente pela temperatura'})`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{P \\cdot D}{2 \\cdot S \\cdot E + 2 \\cdot y \\cdot P} + C$$`,
    `$$t = \\frac{${P} \\cdot ${D}}{2 \\cdot ${S} \\cdot ${E} + 2 \\cdot ${y} \\cdot ${P}} + ${C} = ${t_calc.toFixed(3)} \\text{ mm}$$`,
    `// Piso obrigatório PG-16.3 (chapa de caldeira sob pressão): t_min = max(t, 6 mm) = ${t_min.toFixed(3)} mm`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA) — condição corroída e quente',
    `$$PMTA = \\frac{2 \\cdot S \\cdot E \\cdot t_{util}}{D - 2 \\cdot y \\cdot t_{util}}$$`,
    `$$PMTA = \\frac{2 \\cdot ${S} \\cdot ${E} \\cdot ${t_util.toFixed(3)}}{${D} - 2 \\cdot ${y} \\cdot ${t_util.toFixed(3)}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-27.2.1 — Tubo de caldeira (diâmetro externo ≤ 125 mm)
export function tubo(dados: DadosTubo): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const D = num(dados.diametro_externo);
  const e_fator = numOuPadrao(dados.e_fator, 0);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = (P * D) / (2 * S + P) + 0.005 * D + e_fator;
  const t_linha = t_util - 0.005 * D - e_fator;
  const pmta = t_linha > 0 ? (2 * S * t_linha) / (D - t_linha) : 0;

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - TUBO DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PG-27.2.1 (OD ≤ 125 mm)',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | D (externo) = ${D.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | e = ${e_fator.toFixed(4)} mm`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{P \\cdot D}{2 \\cdot S + P} + 0.005 \\cdot D + e$$`,
    `$$t = \\frac{${P} \\cdot ${D}}{2 \\cdot ${S} + ${P}} + 0.005 \\cdot ${D} + ${e_fator} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    "// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA) — inversão algébrica da fórmula de espessura",
    `$$PMTA = \\frac{2 \\cdot S \\cdot t'}{D - t'} \\quad \\text{onde } t' = t_{util} - 0.005D - e$$`,
    `$$PMTA = \\frac{2 \\cdot ${S} \\cdot ${t_linha.toFixed(3)}}{${D} - ${t_linha.toFixed(3)}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-29.1 — Tampo abaulado torisférico (blank dished)
export function tampoAbaulado(dados: DadosTampoAbaulado): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const L = num(dados.raio_crown);
  const w = numOuPadrao(dados.w_solda, 1.0);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = (5 * P * L) / (4.8 * S * w);
  const pmta = (4.8 * S * w * t_util) / (5 * L);

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - TAMPO ABAULADO DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PG-29.1 (blank dished head)',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | L (raio de crown) = ${L.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | w = ${w.toFixed(4)}`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{5 \\cdot P \\cdot L}{4.8 \\cdot S \\cdot w}$$`,
    `$$t = \\frac{5 \\cdot ${P} \\cdot ${L}}{4.8 \\cdot ${S} \\cdot ${w}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{4.8 \\cdot S \\cdot w \\cdot t_{util}}{5 \\cdot L}$$`,
    `$$PMTA = \\frac{4.8 \\cdot ${S} \\cdot ${w} \\cdot ${t_util.toFixed(3)}}{5 \\cdot ${L}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-29.7 — Tampo elipsoidal 2:1 de caldeira: espessura mínima = a do costado adjacente (PG-27.2.2)
export function tampoElipsoidal(dados: DadosCosto): ResultadoCalculo {
  const resultadoCostado = costado(dados);
  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - TAMPO ELIPSOIDAL 2:1 DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PG-29.7',
    '// A norma exige que a espessura do tampo elipsoidal 2:1 não seja menor que a',
    '// espessura requerida para o costado adjacente, calculada pela PG-27.2.2:',
    '// ====================================================',
    ' ',
  ].concat(resultadoCostado.log);
  return { t_min: resultadoCostado.t_min, pmta: resultadoCostado.pmta, resultado: resultadoCostado.resultado, log: logTerminal };
}

const PISO_ESPESSURA_ESTAIADO = 8.0; // mm — PG-46.2
const PASSO_MAX_ESTAIADO = 215.0; // mm — PG-46.5 (salvo estais soldados)

// PG-46.1 — Espelho / placa plana estaiada
export function espelhoEstaiado(dados: DadosEspelhoEstaiado): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const p = num(dados.passo);
  const C_stay = numOuPadrao(dados.c_stay, 2.1);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const estaisSoldados = !!dados.estais_soldados;
  const t_util = t_nom - C;

  const t_min = p * Math.sqrt(P / (S * C_stay));
  const pmta = S * C_stay * Math.pow(t_util / p, 2);

  const espessura_ok = t_nom >= t_min && t_nom >= PISO_ESPESSURA_ESTAIADO;
  const pmta_ok = pmta >= P;
  const passo_ok = estaisSoldados || p <= PASSO_MAX_ESTAIADO;
  const resultadoFinal = espessura_ok && pmta_ok && passo_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - ESPELHO / PLACA ESTAIADA DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PG-46.1',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | p (passo entre estais) = ${p.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | C_stay = ${C_stay.toFixed(4)}`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm | Estais soldados: ${estaisSoldados ? 'Sim' : 'Não'}`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = p \\sqrt{\\frac{P}{S \\cdot C_{stay}}}$$`,
    `$$t = ${p} \\sqrt{\\frac{${P}}{${S} \\cdot ${C_stay}}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    `// Mínimo geométrico PG-46.2: espessura da placa estaiada ≥ ${PISO_ESPESSURA_ESTAIADO.toFixed(1)} mm`,
    `// Mínimo geométrico PG-46.5: passo entre estais ≤ ${PASSO_MAX_ESTAIADO.toFixed(0)} mm (salvo estais soldados)`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${Math.max(t_min, PISO_ESPESSURA_ESTAIADO).toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) não atende ao mínimo requerido (${Math.max(t_min, PISO_ESPESSURA_ESTAIADO).toFixed(3)} mm).</div>`,
    passo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Passo entre estais (${p.toFixed(1)} mm) dentro do limite geométrico.</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Passo entre estais (${p.toFixed(1)} mm) excede ${PASSO_MAX_ESTAIADO.toFixed(0)} mm sem estais soldados (PG-46.5).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = S \\cdot C_{stay} \\cdot \\left(\\frac{t_{util}}{p}\\right)^2$$`,
    `$$PMTA = ${S} \\cdot ${C_stay} \\cdot \\left(\\frac{${t_util.toFixed(3)}}{${p}}\\right)^2 = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-31 / UG-34 — Placa plana de caldeira (não estaiada): usada tanto pro "Tampo Plano" quanto
// pro "Espelho Não-Estaiado" — mesma física, só muda o nome do componente no memorial.
export function placaPlanaCaldeira(dados: DadosPlacaPlana, titulo: string, normaRef: string): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1.0);
  const C_flat = numOuPadrao(dados.c_flat, 0.33);
  const d = num(dados.diametro_medicao);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = d * Math.sqrt((C_flat * P) / (S * E));
  const pmta = (S * E * Math.pow(t_util, 2)) / (C_flat * Math.pow(d, 2));

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    `// MEMORIAL DE CÁLCULO - ${titulo.toUpperCase()} (NR-13)`,
    `// Norma Base: ASME Sec. I - Parágrafo ${normaRef} (placa plana, sem estais)`,
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | d (diâmetro de medição) = ${d.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | E = ${E.toFixed(4)} | C = ${C_flat.toFixed(4)}`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = d \\sqrt{\\frac{C \\cdot P}{S \\cdot E}}$$`,
    `$$t = ${d} \\sqrt{\\frac{${C_flat} \\cdot ${P}}{${S} \\cdot ${E}}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{S \\cdot E \\cdot t_{util}^2}{C \\cdot d^2}$$`,
    `$$PMTA = \\frac{${S} \\cdot ${E} \\cdot ${t_util.toFixed(3)}^2}{${C_flat} \\cdot ${d}^2} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-31 — Tampo plano de caldeira (reaproveita a fórmula de placa plana do UG-34, sem estais)
export function tampoPlano(dados: DadosPlacaPlana): ResultadoCalculo {
  return placaPlanaCaldeira(dados, 'Tampo Plano de Caldeira', 'PG-31 / UG-34');
}

// PG-31 — Espelho não-estaiado (placa plana sem apoio de tirantes)
export function espelhoNaoEstaiado(dados: DadosPlacaPlana): ResultadoCalculo {
  return placaPlanaCaldeira(dados, 'Espelho Não-Estaiado', 'PG-31 / UG-34');
}

const TABELA_C_FORNALHA: Record<string, number> = { fox: 97, morison: 108, leeds: 119 };

// PFT-19 — Fornalha ondulada / corrugada (Fox, Morison, Leeds)
// ATENÇÃO — NÃO VERIFICADO: o documento de origem indicava resultado em kPa, mas essa leitura
// literal dá espessuras fisicamente impossíveis (t > D) pra dimensões reais de caldeira. Aqui a
// fórmula é aplicada considerando PMTA já em MPa direto (sem conversão de unidade), o que dá
// números plausíveis nos testes — mas isso é uma REINTERPRETAÇÃO da fórmula original, não uma
// transcrição confirmada do código ASME. Pesquisa feita durante a refatoração não conseguiu
// confirmar a convenção de unidade exata (decisão: manter como está + ressalva, não arriscar
// "corrigir" sem base sólida). Confirme com o PH antes de usar em campo real.
export function fornalhaOndulada(dados: DadosFornalhaOndulada): ResultadoCalculo {
  const P = num(dados.pressao);
  const D = num(dados.diametro_medio);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;
  const tipoFornalha = (dados.tipo_fornalha || 'fox').toLowerCase();
  const C_furnace = TABELA_C_FORNALHA[tipoFornalha] || 97;

  const t_min = (P * D) / C_furnace;
  const pmta = (C_furnace * t_util) / D;

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - FORNALHA ONDULADA DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PFT-19 (fórmula empírica)',
    `// ⚠ NÃO VERIFICADO: fatores de unidade reinterpretados (ver comentário no código-fonte).`,
    `// Confirme este resultado com o Profissional Habilitado antes de usar em campo.`,
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | D (médio) = ${D.toFixed(4)} mm | Tipo = ${tipoFornalha} (C = ${C_furnace})`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{P \\cdot D}{C_{furnace}}$$`,
    `$$t = \\frac{${P} \\cdot ${D}}{${C_furnace}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{C_{furnace} \\cdot t_{util}}{D}$$`,
    `$$PMTA = \\frac{${C_furnace} \\cdot ${t_util.toFixed(3)}}{${D}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    `<div style="${CSS_AVISO}"><b>⚠ NÃO VERIFICADO:</b> Fórmula PFT-19 com fatores de unidade reinterpretados — confirme com o PH antes de usar este resultado em campo.</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// ─── CALDEIRA AQUATUBULAR — ASME VIII Div.1 ────────────────────────────────

// UG-32(d) — Fundo elíptico 2:1 (diâmetro interno)
export interface DadosFundoElipticoVIII {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia?: NumLike;
  diametro: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export function fundoElipticoVIII(dados: DadosFundoElipticoVIII): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1.0);
  const D = num(dados.diametro);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = (P * D) / (2 * S * E - 0.2 * P);
  const pmta = (2 * S * E * t_util) / (D + 0.2 * t_util);

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - FUNDO ELÍPTICO 2:1 (NR-13)',
    '// Norma Base: ASME Sec. VIII Div. 1 - Parágrafo UG-32(d)',
    '// ====================================================',
    `// P = ${P.toFixed(4)} MPa | D = ${D.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | E = ${E.toFixed(4)}`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{P \\cdot D}{2 \\cdot S \\cdot E - 0.2 \\cdot P}$$`,
    `$$t = \\frac{${P} \\cdot ${D}}{2 \\cdot ${S} \\cdot ${E} - 0.2 \\cdot ${P}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{2 \\cdot S \\cdot E \\cdot t_{util}}{D + 0.2 \\cdot t_{util}}$$`,
    `$$PMTA = \\frac{2 \\cdot ${S} \\cdot ${E} \\cdot ${t_util.toFixed(3)}}{${D} + 0.2 \\cdot ${t_util.toFixed(3)}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// UG-32(e) — Fundo torisférico ASME F&D (diâmetro interno; crown radius L = D por padrão)
export interface DadosFundoTorisfericoVIII {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia?: NumLike;
  diametro: NumLike;
  raio_crown?: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export function fundoTorisfericoVIII(dados: DadosFundoTorisfericoVIII): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1.0);
  const D = num(dados.diametro);
  const L = dados.raio_crown ? num(dados.raio_crown) : D;
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = (0.885 * P * L) / (S * E - 0.1 * P);
  const pmta = (S * E * t_util) / (0.885 * L + 0.1 * t_util);

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - FUNDO TORISFÉRICO ASME F&D (NR-13)',
    '// Norma Base: ASME Sec. VIII Div. 1 - Parágrafo UG-32(e)',
    '// ====================================================',
    `// P = ${P.toFixed(4)} MPa | D = ${D.toFixed(4)} mm | L (raio crown) = ${L.toFixed(4)} mm`,
    `// S = ${S.toFixed(4)} MPa | E = ${E.toFixed(4)} | Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t = \\frac{0.885 \\cdot P \\cdot L}{S \\cdot E - 0.1 \\cdot P}$$`,
    `$$t = \\frac{0.885 \\cdot ${P} \\cdot ${L}}{${S} \\cdot ${E} - 0.1 \\cdot ${P}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{S \\cdot E \\cdot t_{util}}{0.885 \\cdot L + 0.1 \\cdot t_{util}}$$`,
    `$$PMTA = \\frac{${S} \\cdot ${E} \\cdot ${t_util.toFixed(3)}}{0.885 \\cdot ${L} + 0.1 \\cdot ${t_util.toFixed(3)}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// UG-27 simplificado — Tubo de parede fina (PMTa = 2SEt/D), para tubos, superaquecedor, economizador
export interface DadosTuboThinWall {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia?: NumLike;
  diametro_externo: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

export function tuboThinWall(dados: DadosTuboThinWall, nomeComponente = 'TUBO'): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1.0);
  const D = num(dados.diametro_externo);
  const t_nom = num(dados.t_comercial);
  const C = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - C;

  const t_min = (P * D) / (2 * S * E);
  const pmta = t_util > 0 ? (2 * S * E * t_util) / D : 0;

  const espessura_ok = t_nom >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    `// MEMORIAL DE CÁLCULO - ${nomeComponente.toUpperCase()} (NR-13)`,
    '// Norma Base: ASME Sec. VIII Div. 1 - UG-27 (parede fina, válida para D/t > 20)',
    '// ====================================================',
    `// P = ${P.toFixed(4)} MPa | D = ${D.toFixed(4)} mm | S = ${S.toFixed(4)} MPa | E = ${E.toFixed(4)}`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${C.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t_{min} = \\frac{P \\cdot D}{2 \\cdot S \\cdot E}$$`,
    `$$t_{min} = \\frac{${P} \\cdot ${D}}{2 \\cdot ${S} \\cdot ${E}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura nominal (${t_nom.toFixed(2)} mm) atende ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura nominal (${t_nom.toFixed(2)} mm) é inferior ao mínimo requerido (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{2 \\cdot S \\cdot E \\cdot t_{util}}{D}$$`,
    `$$PMTA = \\frac{2 \\cdot ${S} \\cdot ${E} \\cdot ${t_util.toFixed(3)}}{${D}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA calculada (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA calculada (${pmta.toFixed(3)} MPa) é inferior à Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

// PG-99 — Teste hidrostático de caldeira (Pteste = 1,5 x PMTA) + validação de 80% do escoamento
export function testeHidrostatico(dados: DadosTesteHidrostaticoCaldeira): ResultadoTeste {
  const pmta = num(dados.pmta);
  const S = num(dados.tensao_componente_limitante);
  const sigmaEscoamento = numOuPadrao(dados.sigma_escoamento, 0);

  const FATOR_TESTE = 1.5;
  const p_teste = pmta * FATOR_TESTE;
  const sigma_teste = S * FATOR_TESTE;
  const limite_escoamento = sigmaEscoamento > 0 ? 0.8 * sigmaEscoamento : 0;
  const teste_verificado = sigmaEscoamento > 0 && S > 0;
  const teste_ok = teste_verificado ? sigma_teste <= limite_escoamento : null;
  const resultadoFinal = teste_ok === false ? 'REPROVADO' : 'APROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - TESTE HIDROSTÁTICO DE CALDEIRA (NR-13)',
    '// Norma Base: ASME Sec. I - Parágrafo PG-99',
    '// ====================================================',
    `// PMTA do equipamento (menor PMTA entre os componentes) = ${pmta.toFixed(3)} MPa`,
    ' ',
    `$$P_{teste} = 1.5 \\cdot PMTA = 1.5 \\cdot ${pmta.toFixed(3)} = ${p_teste.toFixed(3)} \\text{ MPa}$$`,
    teste_verificado
      ? `// Tensão de membrana no teste do componente limitante: sigma_teste = S x 1.5 = ${sigma_teste.toFixed(2)} MPa`
      : '// Informe a Tensão Admissível do componente limitante e a Tensão de Escoamento para validar contra 80% do escoamento.',
    teste_verificado
      ? teste_ok
        ? `<div style="${CSS_OK}"><b>OK:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) ≤ 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa). Teste hidrostático validado.</div>`
        : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) excede 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa).</div>`
      : `<div style="${CSS_AVISO}"><b>NÃO VERIFICADO:</b> Preencha S do componente limitante e a Tensão de Escoamento para validar.</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];
  return { p_teste: p_teste.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}
