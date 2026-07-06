// Porte de CalculoAutoclave (math.js linhas 369-561).
//
// `cilindrica` é verbatim (ASME VIII Div.1 UG-27(c), mesmas duas juntas, mesmo teste UG-99(b)).
//
// `retangular` foi CORRIGIDA: o math.js usava `t_min = a·√(0.51·K·P/(S·E))` com K (coeficiente de
// fixação) e E (eficiência de junta) — nenhum dos dois existe na fórmula real da ASME VIII UG-47
// (placas estaiadas/com tirantes). A fórmula real é `t_min = pitch·√(P/(S·C))`, com C=2.1 (placa
// soldada ≤11mm) ou C=2.2 (>11mm), sem K nem E. Decisão tomada com o usuário após pesquisa
// confirmada em múltiplas fontes (ver plano de refatoração). PMTA, verificação de tirante e teste
// hidrostático (1.3×PMTA, UG-99(b)) seguem a mesma estrutura de antes.
import { CSS_AVISO, CSS_ERRO, CSS_OK, num, numOuPadrao } from './format';
import { areaResistenteParafuso } from './vaso';
import type { NumLike, ResultadoCalculo } from './tipos';

export interface DadosAutoclaveRetangular {
  pressao: NumLike; // P
  tensao: NumLike; // S
  c_stay?: NumLike; // C — UG-47: 2.1 (solda ≤11mm) ou 2.2 (>11mm); default 2.1
  espacamento: NumLike; // a — passo entre tirantes (mm)
  espessura: NumLike; // t_real
  diametro_tirante: NumLike; // d
  sigma_escoamento?: NumLike;
  material?: string; // material da chapa — só p/ documentação (injetado no RESUMO), não entra no cálculo
}

export interface DadosAutoclaveCilindrica {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia: NumLike;
  diametro: NumLike;
  espessura: NumLike;
  ca: NumLike;
  sigma_escoamento?: NumLike;
  material?: string; // material do casco — só p/ documentação (injetado no RESUMO), não entra no cálculo
}

const PASSO_MAX_UG47 = 215.0; // mm — mesmo limite geométrico do PG-46.5/UG-47 (salvo estais soldados, 15×d)

export function retangular(dados: DadosAutoclaveRetangular): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const C_stay = numOuPadrao(dados.c_stay, 2.1);
  const a = num(dados.espacamento);
  const t_real = num(dados.espessura);
  const d = num(dados.diametro_tirante);
  const sigmaEscoamento = numOuPadrao(dados.sigma_escoamento, 0);

  const t_min = a * Math.sqrt(P / (S * C_stay));
  const pmta = S * C_stay * Math.pow(t_real / a, 2);

  const area_painel = a * a;
  const forca_tirante = P * area_painel;
  const area_tirante = (Math.PI * Math.pow(d, 2)) / 4;
  const tensao_tirante = area_tirante > 0 ? forca_tirante / area_tirante : 0;

  const espessura_ok = t_real >= t_min;
  const tirante_ok = tensao_tirante <= S;
  const pmta_ok = pmta >= P;
  const passo_ok = a <= PASSO_MAX_UG47;

  const FATOR_TESTE = 1.3;
  const p_teste = pmta * FATOR_TESTE;
  const sigma_teste = S * FATOR_TESTE;
  const limite_escoamento = sigmaEscoamento > 0 ? 0.8 * sigmaEscoamento : 0;
  const teste_verificado = sigmaEscoamento > 0;
  const teste_ok = teste_verificado ? sigma_teste <= limite_escoamento : null;

  const resultadoFinal =
    espessura_ok && tirante_ok && pmta_ok && passo_ok && teste_ok !== false ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - AUTOCLAVE RETANGULAR (NR-13)',
    '// Método: placa plana estaiada com tirantes — ASME Sec. VIII Div. 1, Parágrafo UG-47',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto estipulada)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Máxima Admissível do material da chapa)`,
    `// C = ${C_stay.toFixed(4)} (Coeficiente UG-47: 2.1 para placa soldada ≤11mm, 2.2 para >11mm)`,
    `// a = ${a.toFixed(2)} mm (Passo/espaçamento entre os tirantes)`,
    `// d = ${d.toFixed(2)} mm (Diâmetro do tirante)`,
    `// t_real = ${t_real.toFixed(4)} mm (Espessura Real Atuante da placa)`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. CÁLCULO DA ESPESSURA MÍNIMA DA PLACA (UG-47)',
    `$$t_{min} = a \\sqrt{\\frac{P}{S \\cdot C}}$$`,
    `$$t_{min} = ${a} \\sqrt{\\frac{${P}}{${S} \\cdot ${C_stay}}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    `// Limite geométrico UG-47: passo entre tirantes ≤ ${PASSO_MAX_UG47.toFixed(0)} mm (salvo estais soldados, até 15×d)`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> A espessura real atuante (${t_real} mm) é maior ou igual à espessura requerida (${t_min.toFixed(3)} mm). Portanto, atende aos critérios estruturais.</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> A espessura real atuante (${t_real} mm) é menor que a espessura requerida (${t_min.toFixed(3)} mm).</div>`,
    passo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Passo entre tirantes (${a.toFixed(1)} mm) dentro do limite geométrico UG-47.</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Passo entre tirantes (${a.toFixed(1)} mm) excede ${PASSO_MAX_UG47.toFixed(0)} mm (UG-47).</div>`,
    ' ',
    '// 2. CÁLCULO DA PRESSÃO MÁXIMA (PMTA)',
    `$$PMTA = S \\cdot C \\cdot \\left(\\frac{t_{real}}{a}\\right)^2$$`,
    `$$PMTA = ${S} \\cdot ${C_stay} \\cdot \\left(\\frac{${t_real}}{${a}}\\right)^2 = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> A PMTA calculada (${pmta.toFixed(3)} MPa) é maior ou igual à Pressão de Projeto estipulada (${P} MPa). Equipamento seguro para operação.</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> A PMTA calculada (${pmta.toFixed(3)} MPa) é menor que a Pressão de Projeto estipulada (${P} MPa).</div>`,
    ' ',
    '// 3. VERIFICAÇÃO DE INTEGRIDADE DOS TIRANTES',
    `$$A_{painel} = a^2 = ${a}^2 = ${area_painel.toFixed(2)} \\text{ mm}^2$$`,
    `$$F_{tirante} = P \\cdot A_{painel} = ${P} \\cdot ${area_painel.toFixed(2)} = ${forca_tirante.toFixed(2)} \\text{ N}$$`,
    `$$A_{tirante} = \\frac{\\pi \\cdot d^2}{4} = \\frac{3.1415 \\cdot ${d}^2}{4} = ${area_tirante.toFixed(2)} \\text{ mm}^2$$`,
    `$$\\sigma_{tirante} = \\frac{F_{tirante}}{A_{tirante}} = \\frac{${forca_tirante.toFixed(2)}}{${area_tirante.toFixed(2)}} = ${tensao_tirante.toFixed(3)} \\text{ MPa}$$`,
    tirante_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> A tensão real gerada nos tirantes (${tensao_tirante.toFixed(3)} MPa) é inferior à Tensão Admissível do material (${S} MPa). Resistência mecânica suficiente.</div>`
      : `<div style="${CSS_ERRO}"><b>FALHA:</b> A tensão real nos tirantes (${tensao_tirante.toFixed(3)} MPa) supera a Tensão Admissível (${S} MPa). Risco crítico de ruptura.</div>`,
    ' ',
    '// 4. TESTE HIDROSTÁTICO — UG-99(b) / UG-100',
    `$$P_{teste} = 1.3 \\cdot PMTA = 1.3 \\cdot ${pmta.toFixed(3)} = ${p_teste.toFixed(3)} \\text{ MPa}$$`,
    `// Tensão de membrana no teste: sigma_teste = S x (Pteste/PMTA) = ${S} x 1.3 = ${sigma_teste.toFixed(2)} MPa`,
    teste_verificado
      ? teste_ok
        ? `<div style="${CSS_OK}"><b>OK:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) ≤ 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa). Teste hidrostático validado.</div>`
        : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) excede 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa). Reduza a pressão de teste ou revise o material.</div>`
      : `<div style="${CSS_AVISO}"><b>NÃO VERIFICADO:</b> Informe a Tensão de Escoamento do material para validar o teste hidrostático contra 80% do escoamento (UG-99/UG-100).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];

  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}

export interface DadosAutoclaveVertical {
  pressao: NumLike; // P (MPa)
  diametro: NumLike; // D interno (mm)
  tensao: NumLike; // S (MPa)
  eficiencia?: NumLike; // E — default 1
  ca?: NumLike; // corrosão (mm)
  c_fator?: NumLike; // C do UG-34 — default 0.33 (planilha de referência)
  t_tampo: NumLike;
  t_costado: NumLike;
  t_fundo: NumLike;
  tipo_fundo?: 'plano' | 'conico'; // default 'plano'
  alfa?: NumLike; // semiângulo do cone (graus) — só p/ fundo cônico
  n_travas: NumLike;
  d_trava: NumLike; // diâmetro da trava/parafuso (mm)
  tensao_trava: NumLike; // S admissível da trava (MPa)
  sigma_escoamento?: NumLike;
  material?: string; // só p/ documentação (RESUMO), não entra no cálculo
}

// Autoclave vertical com tampo plano removível (UG-34) travado por parafusos/travas radiais,
// costado cilíndrico (UG-27(c)(1)) e fundo plano ou cônico (UG-32(g)). Estrutura validada
// contra Autoclave_vertical_corrigida_ASME (1).xlsx — a planilha original tinha um fator /10
// espúrio (mistura cm×mm) no tampo, NÃO replicado aqui; a fórmula usada é a mesma da planilha
// standalone do UG-34 (Planilha_Tampo_Plano_UG34_ASME_Status.xlsx), que não tem o fator.
export function vertical(dados: DadosAutoclaveVertical): ResultadoCalculo {
  const P = num(dados.pressao);
  const D = num(dados.diametro);
  const R = D / 2;
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1);
  const CA = numOuPadrao(dados.ca, 0);
  const C = numOuPadrao(dados.c_fator, 0.33);
  const tipoFundo = dados.tipo_fundo ?? 'plano';

  // 1) TAMPO PLANO APARAFUSADO — UG-34
  const tuTampo = num(dados.t_tampo) - CA;
  const treqTampo = D * Math.sqrt((C * P) / (S * E));
  const pmtaTampo = ((S * E) / C) * Math.pow(tuTampo / D, 2);
  const tampo_ok = num(dados.t_tampo) >= treqTampo;

  // 2) COSTADO CILÍNDRICO — UG-27(c)(1)
  const tuCost = num(dados.t_costado) - CA;
  const treqCost = (P * R) / (S * E - 0.6 * P);
  const pmtaCost = (S * E * tuCost) / (R + 0.6 * tuCost);
  const costado_ok = tuCost >= treqCost;

  // 3) FUNDO — plano (UG-34, mesmo critério da tampa) ou cônico (UG-32(g))
  const tuFundo = num(dados.t_fundo) - CA;
  let treqFundo: number;
  let pmtaFundo: number;
  let linhasFundo: string[];
  if (tipoFundo === 'conico') {
    const alfaGraus = numOuPadrao(dados.alfa, 15);
    const alfaRad = (alfaGraus * Math.PI) / 180;
    const cosA = Math.cos(alfaRad);
    treqFundo = (P * D) / (2 * cosA * (S * E - 0.6 * P));
    pmtaFundo = (tuFundo * S * E) / (D / (2 * cosA) + 0.6 * tuFundo);
    linhasFundo = [
      `// 3. FUNDO CÔNICO — ASME VIII Div.1 UG-32(g) (α = ${alfaGraus.toFixed(2)}°)`,
      `$$t_{req} = \\frac{P \\cdot D}{2 \\cdot \\cos\\alpha \\cdot (S \\cdot E - 0.6 \\cdot P)} = ${treqFundo.toFixed(4)} \\text{ mm}$$`,
      `$$PMTA_{fundo} = \\frac{t_{util} \\cdot S \\cdot E}{\\frac{D}{2\\cos\\alpha} + 0.6 \\cdot t_{util}} = ${pmtaFundo.toFixed(4)} \\text{ MPa}$$`,
    ];
  } else {
    treqFundo = treqTampo; // planilha de referência: fundo plano dimensionado como a tampa UG-34
    pmtaFundo = ((S * E) / C) * Math.pow(tuFundo / D, 2);
    linhasFundo = [
      '// 3. FUNDO PLANO — UG-34 (mesmo critério da tampa)',
      `$$t_{req} = ${treqFundo.toFixed(4)} \\text{ mm} \\quad PMTA_{fundo} = ${pmtaFundo.toFixed(4)} \\text{ MPa}$$`,
    ];
  }
  const fundo_ok = tuFundo >= treqFundo;

  // 4) TRAVAS — força de separação P·A dividida pelas travas (mesma checagem da planilha)
  const N = num(dados.n_travas);
  const dTrava = num(dados.d_trava);
  const Strava = num(dados.tensao_trava);
  const areaTampa = (Math.PI * D * D) / 4;
  const forcaTotal = P * areaTampa;
  const cargaPorTrava = N > 0 ? forcaTotal / N : Infinity;
  // Área resistente da rosca (stress area) — nunca π·d²/4 (revisão de engenharia).
  const areaTrava = areaResistenteParafuso(dTrava);
  const cargaAdm = areaTrava * Strava;
  const travas_ok = cargaAdm >= cargaPorTrava;

  const pmta = Math.min(pmtaTampo, pmtaCost, pmtaFundo);
  const pmta_ok = pmta >= P;
  const resultadoFinal = tampo_ok && costado_ok && fundo_ok && travas_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const FATOR_TESTE = 1.3;
  const p_teste = pmta * FATOR_TESTE;

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - AUTOCLAVE VERTICAL (NR-13)',
    '// Modelo: tampo plano removível com travas (UG-34) + costado cilíndrico (UG-27) + fundo',
    '// Conforme ASME VIII Div.1 – UG-34, UG-27 e UG-32',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | D = ${D.toFixed(2)} mm | S = ${S.toFixed(2)} MPa | E = ${E.toFixed(2)} | CA = ${CA.toFixed(2)} mm | C = ${C}`,
    `// t_tampo = ${num(dados.t_tampo).toFixed(2)} mm | t_costado = ${num(dados.t_costado).toFixed(2)} mm | t_fundo = ${num(dados.t_fundo).toFixed(2)} mm`,
    `// Travas: N = ${N} | d = ${dTrava.toFixed(2)} mm | S_trava = ${Strava.toFixed(2)} MPa`,
    ' ',
    '// 1. TAMPO PLANO APARAFUSADO — UG-34',
    `$$t_{req} = D\\sqrt{\\frac{C \\cdot P}{S \\cdot E}} = ${D.toFixed(2)}\\sqrt{\\frac{${C} \\cdot ${P}}{${S} \\cdot ${E}}} = ${treqTampo.toFixed(4)} \\text{ mm}$$`,
    `$$PMTA_{tampo} = \\frac{S \\cdot E}{C}\\left(\\frac{t_{util}}{D}\\right)^2 = ${pmtaTampo.toFixed(4)} \\text{ MPa}$$`,
    tampo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> t_tampo (${num(dados.t_tampo).toFixed(2)} mm) ≥ requerida (${treqTampo.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> t_tampo (${num(dados.t_tampo).toFixed(2)} mm) < requerida (${treqTampo.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. COSTADO CILÍNDRICO — UG-27(c)(1)',
    `$$t_{req} = \\frac{P \\cdot R}{S \\cdot E - 0.6 \\cdot P} = ${treqCost.toFixed(4)} \\text{ mm} \\quad PMTA_{costado} = ${pmtaCost.toFixed(4)} \\text{ MPa}$$`,
    costado_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> espessura útil do costado (${tuCost.toFixed(2)} mm) ≥ requerida (${treqCost.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> espessura útil do costado (${tuCost.toFixed(2)} mm) < requerida (${treqCost.toFixed(3)} mm).</div>`,
    ' ',
    ...linhasFundo,
    fundo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> espessura útil do fundo (${tuFundo.toFixed(2)} mm) ≥ requerida (${treqFundo.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> espessura útil do fundo (${tuFundo.toFixed(2)} mm) < requerida (${treqFundo.toFixed(3)} mm).</div>`,
    ' ',
    '// 4. VERIFICAÇÃO DAS TRAVAS',
    `// A_trava = área resistente da rosca (stress area) = ${areaTrava.toFixed(2)} mm² — nunca π·d²/4.`,
    `$$A_{tampa} = \\frac{\\pi D^2}{4} = ${areaTampa.toFixed(2)} \\text{ mm}^2 \\quad F = P \\cdot A = ${forcaTotal.toFixed(2)} \\text{ N}$$`,
    `$$F_{trava} = F/N = ${cargaPorTrava.toFixed(2)} \\text{ N} \\quad F_{adm} = A_{trava} \\cdot S_{trava} = ${cargaAdm.toFixed(2)} \\text{ N}$$`,
    travas_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> carga por trava (${cargaPorTrava.toFixed(2)} N) ≤ admissível (${cargaAdm.toFixed(2)} N).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> carga por trava (${cargaPorTrava.toFixed(2)} N) > admissível (${cargaAdm.toFixed(2)} N).</div>`,
    ' ',
    '// 5. PMTA DO CONJUNTO E TESTE HIDROSTÁTICO',
    `$$PMTA = \\min(PMTA_{tampo}, PMTA_{costado}, PMTA_{fundo}) = ${pmta.toFixed(4)} \\text{ MPa}$$`,
    `$$P_{teste} = 1.3 \\cdot PMTA = ${p_teste.toFixed(4)} \\text{ MPa}$$`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];

  return { t_min: treqTampo.toFixed(4), pmta: pmta.toFixed(4), resultado: resultadoFinal, log: logTerminal };
}

export function cilindrica(dados: DadosAutoclaveCilindrica): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = num(dados.eficiencia);
  const D = num(dados.diametro);
  const R = D / 2;
  const t_real = num(dados.espessura);
  const CA = num(dados.ca);
  const t_util = t_real - CA;
  const sigmaEscoamento = numOuPadrao(dados.sigma_escoamento, 0);

  const t_min_circ = (P * R) / (S * E - 0.6 * P);
  const pmta_circ = (S * E * t_util) / (R + 0.6 * t_util);

  const t_min_long = (P * R) / (2 * S * E + 0.4 * P);
  // Limite de aplicação (revisão de engenharia): a equação da UG-27(c)(2) é válida somente quando
  // R − 0,4·t_util > 0. Fora dessa condição a equação está fora do domínio de aplicação e os
  // resultados não são válidos para determinação da espessura mínima ou da PMTA — nesse caso a
  // junta longitudinal não governa (Infinity mantém o min() na junta circunferencial).
  const denom_long = R - 0.4 * t_util;
  const long_aplicavel = denom_long > 0;
  const pmta_long = long_aplicavel ? (2 * S * E * t_util) / denom_long : Infinity;

  const t_min = Math.max(t_min_circ, t_min_long);
  const pmta = Math.min(pmta_circ, pmta_long);
  const juntaGovernante = t_min_circ >= t_min_long ? 'circunferencial — UG-27(c)(1)' : 'longitudinal — UG-27(c)(2)';

  const espessura_ok = t_util >= t_min;
  const pmta_ok = pmta >= P;

  const FATOR_TESTE = 1.3;
  const p_teste = pmta * FATOR_TESTE;
  const sigma_teste = S * FATOR_TESTE;
  const limite_escoamento = sigmaEscoamento > 0 ? 0.8 * sigmaEscoamento : 0;
  const teste_verificado = sigmaEscoamento > 0;
  const teste_ok = teste_verificado ? sigma_teste <= limite_escoamento : null;

  const resultadoFinal = espessura_ok && pmta_ok && teste_ok !== false ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - AUTOCLAVE CILÍNDRICA (NR-13)',
    '// Norma Base: ASME Sec. VIII Div. 1 - Parágrafo UG-27(c)',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto estipulada)`,
    `// D = ${D.toFixed(4)} mm (Diâmetro Interno Livre da Autoclave)`,
    `// R = ${R.toFixed(4)} mm (Raio Interno do cilindro)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Máxima Admissível do material)`,
    `// E = ${E.toFixed(4)} (Eficiência de Junta da Solda)`,
    `// t_real = ${t_real.toFixed(4)} mm (Espessura Comercial / Nominal da chapa)`,
    `// CA = ${CA.toFixed(4)} mm (Margem de Corrosão definida para desgaste)`,
    '// ----------------------------------------------------',
    `// t_{util} = t_{real} - CA = ${t_real.toFixed(4)} - ${CA.toFixed(4)} = ${t_util.toFixed(4)} mm (Espessura Útil de resistência)`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. CÁLCULO DA ESPESSURA MÍNIMA REQUERIDA (junta circunferencial — UG-27(c)(1))',
    `$$t_{min,circ} = \\frac{P \\cdot R}{S \\cdot E - 0.6 \\cdot P}$$`,
    `$$t_{min,circ} = \\frac{${P} \\cdot ${R}}{${S} \\cdot ${E} - 0.6 \\cdot ${P}} = ${t_min_circ.toFixed(3)} \\text{ mm}$$`,
    ' ',
    '// 2. CÁLCULO DA ESPESSURA MÍNIMA REQUERIDA (junta longitudinal — UG-27(c)(2))',
    '// A norma exige calcular as duas juntas e adotar a espessura mais restritiva.',
    `$$t_{min,long} = \\frac{P \\cdot R}{2 \\cdot S \\cdot E + 0.4 \\cdot P}$$`,
    `$$t_{min,long} = \\frac{${P} \\cdot ${R}}{2 \\cdot ${S} \\cdot ${E} + 0.4 \\cdot ${P}} = ${t_min_long.toFixed(3)} \\text{ mm}$$`,
    `// Junta governante: ${juntaGovernante} → t_min = ${t_min.toFixed(3)} mm`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> A espessura útil descontada a corrosão (${t_util.toFixed(2)} mm) atende ao mínimo requerido pela norma (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> A espessura útil (${t_util.toFixed(2)} mm) é insuficiente perante a norma exigida (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 3. CÁLCULO DA PRESSÃO MÁXIMA (PMTA) — menor entre as duas juntas',
    `$$PMTA_{circ} = \\frac{S \\cdot E \\cdot t_{util}}{R + 0.6 \\cdot t_{util}} = ${pmta_circ.toFixed(3)} \\text{ MPa}$$`,
    ...(long_aplicavel
      ? [`$$PMTA_{long} = \\frac{2 \\cdot S \\cdot E \\cdot t_{util}}{R - 0.4 \\cdot t_{util}} = ${pmta_long.toFixed(3)} \\text{ MPa}$$`]
      : [
          `// PMTA_long (UG-27(c)(2)): NÃO APLICÁVEL — R − 0,4·t_util = ${denom_long.toFixed(3)} mm ≤ 0.`,
          `<div style="${CSS_AVISO}"><b>Limite de aplicação:</b> A equação da UG-27(c)(2) é válida somente quando R − 0,4·t_util &gt; 0. Caso essa condição não seja atendida, a equação encontra-se fora do seu domínio de aplicação e os resultados obtidos não são válidos para determinação da espessura mínima ou da PMTA.</div>`,
        ]),
    `$$PMTA = \\min(PMTA_{circ}, PMTA_{long}) = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> A PMTA calculada do cilindro (${pmta.toFixed(3)} MPa) é maior ou igual à Pressão de Projeto (${P} MPa). Operação validada.</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> A PMTA do cilindro (${pmta.toFixed(3)} MPa) não atinge a Pressão de Projeto solicitada (${P} MPa). Risco iminente.</div>`,
    ' ',
    '// 4. TESTE HIDROSTÁTICO — UG-99(b) / UG-100',
    `$$P_{teste} = 1.3 \\cdot PMTA = 1.3 \\cdot ${pmta.toFixed(3)} = ${p_teste.toFixed(3)} \\text{ MPa}$$`,
    `// Tensão de membrana no teste: sigma_teste = S x (Pteste/PMTA) = ${S} x 1.3 = ${sigma_teste.toFixed(2)} MPa`,
    teste_verificado
      ? teste_ok
        ? `<div style="${CSS_OK}"><b>OK:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) ≤ 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa). Teste hidrostático validado.</div>`
        : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Tensão no teste (${sigma_teste.toFixed(2)} MPa) excede 80% da tensão de escoamento (${limite_escoamento.toFixed(2)} MPa). Reduza a pressão de teste ou revise o material.</div>`
      : `<div style="${CSS_AVISO}"><b>NÃO VERIFICADO:</b> Informe a Tensão de Escoamento do material para validar o teste hidrostático contra 80% do escoamento (UG-99/UG-100).</div>`,
    ' ',
    '// ====================================================',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];

  return { t_min: t_min.toFixed(2), pmta: pmta.toFixed(2), resultado: resultadoFinal, log: logTerminal };
}
