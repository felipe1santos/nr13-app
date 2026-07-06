// Porte de CalculoNR13.gerarBloco (math.js linhas 4-331) — ASME Sec. VIII Div. 1.
// Mesma matemática, mesmos textos de memorial. Duas mudanças deliberadas em relação ao original:
//   1. BUG CORRIGIDO: no math.js, `if (tipo !== 'bocal') { ... } else if (tipo === 'bocal') {...}
//      else if (tipo === 'flange') {...}` nunca alcança o branch de flange, porque a 1ª condição
//      (`tipo !== 'bocal'`) já é verdadeira para 'flange' e consome o fluxo — flange nunca
//      calculava nada de útil em produção. Aqui o dispatch é por switch, então flange funciona.
//   2. NOVO: tipo 'cone' (tampo cônico, UG-32(g)), pedido como adição — não existia no math.js.
import { CSS_AVISO, num, numOuPadrao } from './format';
import type { NumLike, ResultadoCalculo } from './tipos';

export type TipoComponenteVaso =
  | 'cilindrico'
  | 'eliptico'
  | 'toroesferico'
  | 'esferico'
  | 'plano'
  | 'planoAparafusado'
  | 'cone'
  | 'bocal'
  | 'flange';

export interface DadosComponenteVaso {
  t_comercial?: NumLike;
  ca?: NumLike;
  S?: NumLike;
  E?: NumLike;
  mat?: string;
  temp?: NumLike;
  // cone (UG-32(g))
  alfa?: NumLike; // meio-ângulo do cone, em graus
  // bocal (UG-37)
  d?: NumLike;
  proj_int?: NumLike;
  dadosCascoRef?: { t_comercial?: NumLike; ca?: NumLike; S?: NumLike; E?: NumLike };
  temReforco?: boolean;
  w_reforco?: NumLike;
  t_reforco?: NumLike;
  S_reforco?: NumLike;
  // planoAparafusado — parafusos/travas (UG-34 + verificação)
  C_fator?: NumLike; // UG-34: 0.3 aparafusado (default), 0.33 soldado — planilha de referência
  N_parafusos?: NumLike;
  d_parafuso?: NumLike;
  S_parafuso?: NumLike;
  // flange (Apêndice 2)
  A?: NumLike;
  D?: NumLike; // raio de furos (B da fórmula) — nome de campo preservado do math.js
  C?: NumLike;
  t?: NumLike;
  P?: NumLike;
  G?: NumLike;
  b?: NumLike;
  m?: NumLike;
  y?: NumLike;
}

// Área resistente da rosca (stress area, ISO 898-1 — rosca métrica grossa), em mm².
// Revisão de engenharia: nos parafusos utiliza-se SEMPRE a área resistente da rosca,
// nunca π·d²/4. Fora da tabela, aproxima por 0,78·π·d²/4 (razão As/A_nominal da rosca grossa).
const AS_ROSCA_METRICA: Record<number, number> = {
  6: 20.1, 8: 36.6, 10: 58.0, 12: 84.3, 14: 115, 16: 157, 18: 192, 20: 245,
  22: 303, 24: 353, 27: 459, 30: 561, 33: 694, 36: 817, 39: 976, 42: 1121, 48: 1473,
};
export function areaResistenteParafuso(d: number): number {
  return AS_ROSCA_METRICA[d] ?? 0.78 * ((Math.PI * d * d) / 4);
}

function normaRefPara(tipo: TipoComponenteVaso): string {
  switch (tipo) {
    case 'cilindrico':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-27(c)(1) - Casco Cilíndrico';
    case 'eliptico':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-32(c) - Tampo Elíptico 2:1';
    case 'toroesferico':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-32(e) - Tampo Torosférico Padrão';
    case 'esferico':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-27(d) - Casco Esférico / Hemisférico';
    case 'plano':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-34 - Tampo Plano Circular';
    case 'planoAparafusado':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-34 + Verificação de Parafusos/Travas';
    case 'cone':
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-32(g) - Tampo Cônico';
    case 'bocal':
      return 'ASME Sec. VIII Div. 1 - Parágrafos UG-37, UG-40 e UG-41 - Aberturas e Reforços (Bocais)';
    case 'flange':
      return 'ASME Sec. VIII Div. 1 - Apêndice 2 - Flanges Circulares';
    default:
      return '';
  }
}

// Campos obrigatórios sem valor válido (vazio, não-numérico ou ≤ 0). O cálculo segue com
// defaults (numOuPadrao), mas o resultado não é confiável — o serviço marca PENDENTE.
export function camposFaltantesVaso(tipo: TipoComponenteVaso, dados: DadosComponenteVaso): string[] {
  const vazio = (v: NumLike | undefined) =>
    v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;
  const faltantes: string[] = [];
  // bocal/flange têm conjuntos próprios de entrada; S é comum a todos
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (tipo !== 'flange') {
    if (vazio(dados.E)) faltantes.push('E — Eficiência de Junta');
    if (vazio(dados.t_comercial)) faltantes.push('Tnom — Espessura Comercial');
  }
  return faltantes;
}

export function gerarBlocoComponenteVaso(
  nomeDaPeca: string,
  tipo: TipoComponenteVaso,
  dados: DadosComponenteVaso,
  D: NumLike,
  P: NumLike,
): string[] {
  const pressao = numOuPadrao(P, 1.5);
  const diametro = numOuPadrao(D, 1000.0);
  const R = diametro / 2;

  const t_nom = numOuPadrao(dados.t_comercial, 0.0);
  const ca = numOuPadrao(dados.ca, 0.0);
  const t_util = t_nom - ca;

  const S = numOuPadrao(dados.S, 137.9);
  const E = numOuPadrao(dados.E, 0.85);
  const mat = dados.mat || 'Aço Não Especificado';
  const temp = numOuPadrao(dados.temp, 25);

  const normaRef = normaRefPara(tipo);

  let blocoOutput: string[] = [
    `// ====================================================`,
    // Nome em caixa alta, preservando a letra minúscula das referências de norma "(UG-27c)" etc.
    `// MEMORIAL DE CÁLCULO: ${nomeDaPeca.toUpperCase().replace(/\(UG-(\d+)\s*([A-Z])\)/g, (_m, n: string, l: string) => `(UG-${n}${l.toLowerCase()})`)}`,
    `// Norma Base: ${normaRef}`,
    `// ====================================================`,
    `// PARÂMETROS GERAIS DE ENTRADA`,
    `// P = ${pressao.toFixed(4)} MPa (Pressão de Projeto estipulada)`,
    `// T = ${temp.toFixed(2)} °C (Temperatura de Projeto do elemento)`,
    `// D = ${diametro.toFixed(4)} mm (Diâmetro Interno livre do equipamento)`,
    `// R = ${R.toFixed(4)} mm (Raio Interno do equipamento)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Máxima Admissível — ${mat} @ ${temp.toFixed(0)}°C)`,
    `// E = ${E.toFixed(4)} (Eficiência de Junta da Solda / Grau de Raio-X)`,
    `// Tnom = ${t_nom.toFixed(4)} mm (Espessura nominal / medida atual)`,
    `// C.A. = ${ca.toFixed(4)} mm (Margem de corrosão definida para desgaste)`,
    `// ----------------------------------------------------`,
    `// Tútil = Tnom - C.A. = ${t_nom.toFixed(4)} - ${ca.toFixed(4)} = ${t_util.toFixed(4)} mm (Espessura útil que resistirá à pressão)`,
    `// ----------------------------------------------------`,
    ` `,
  ];

  const faltantes = camposFaltantesVaso(tipo, dados);
  for (const f of faltantes) {
    blocoOutput.push(
      `<div style="${CSS_AVISO}"><b>ATENÇÃO: valor padrão adotado</b> para "${f}" — campo não preenchido. Preencha para validar o cálculo.</div>`,
    );
  }
  if (faltantes.length > 0) blocoOutput.push(' ');

  switch (tipo) {
    case 'cilindrico':
    case 'eliptico':
    case 'toroesferico':
    case 'esferico':
    case 'plano':
    case 'cone': {
      let t_req = 0;
      let PMTA = 0;
      let eq_t = '';
      let sub_t = '';
      let eq_pmta = '';
      let sub_pmta = '';

      if (tipo === 'cilindrico') {
        t_req = (pressao * R) / (S * E - 0.6 * pressao);
        eq_t = `$$ t_{req} = \\frac{P \\cdot R}{S \\cdot E - 0.6 \\cdot P} $$`;
        sub_t = `$$ t_{req} = \\frac{${pressao.toFixed(4)} \\cdot ${R.toFixed(4)}}{(${S.toFixed(4)} \\cdot ${E.toFixed(4)}) - 0.6(${pressao.toFixed(4)})} $$`;

        PMTA = (S * E * t_util) / (R + 0.6 * t_util);
        eq_pmta = `$$ PMTA = \\frac{S \\cdot E \\cdot T_{util}}{R + 0.6 \\cdot T_{util}} $$`;
        sub_pmta = `$$ PMTA = \\frac{${S.toFixed(4)} \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)}}{${R.toFixed(4)} + 0.6(${t_util.toFixed(4)})} $$`;
      } else if (tipo === 'eliptico') {
        t_req = (pressao * diametro) / (2 * S * E - 0.2 * pressao);
        eq_t = `$$ t_{req} = \\frac{P \\cdot D}{2 \\cdot S \\cdot E - 0.2 \\cdot P} $$`;
        sub_t = `$$ t_{req} = \\frac{${pressao.toFixed(4)} \\cdot ${diametro.toFixed(4)}}{2(${S.toFixed(4)} \\cdot ${E.toFixed(4)}) - 0.2(${pressao.toFixed(4)})} $$`;

        PMTA = (2 * S * E * t_util) / (diametro + 0.2 * t_util);
        eq_pmta = `$$ PMTA = \\frac{2 \\cdot S \\cdot E \\cdot T_{util}}{D + 0.2 \\cdot T_{util}} $$`;
        sub_pmta = `$$ PMTA = \\frac{2(${S.toFixed(4)}) \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)}}{${diametro.toFixed(4)} + 0.2(${t_util.toFixed(4)})} $$`;
      } else if (tipo === 'toroesferico') {
        const L_c = diametro;
        t_req = (0.885 * pressao * L_c) / (S * E - 0.1 * pressao);
        eq_t = `$$ t_{req} = \\frac{0.885 \\cdot P \\cdot L_c}{S \\cdot E - 0.1 \\cdot P} $$`;
        sub_t = `$$ t_{req} = \\frac{0.885(${pressao.toFixed(4)}) \\cdot ${L_c.toFixed(4)}}{(${S.toFixed(4)} \\cdot ${E.toFixed(4)}) - 0.1(${pressao.toFixed(4)})} $$`;

        PMTA = (S * E * t_util) / (0.885 * L_c + 0.1 * t_util);
        eq_pmta = `$$ PMTA = \\frac{S \\cdot E \\cdot T_{util}}{0.885 \\cdot L_c + 0.1 \\cdot T_{util}} $$`;
        sub_pmta = `$$ PMTA = \\frac{${S.toFixed(4)} \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)}}{0.885(${L_c.toFixed(4)}) + 0.1(${t_util.toFixed(4)})} $$`;
      } else if (tipo === 'esferico') {
        t_req = (pressao * R) / (2 * S * E - 0.2 * pressao);
        eq_t = `$$ t_{req} = \\frac{P \\cdot R}{2 \\cdot S \\cdot E - 0.2 \\cdot P} $$`;
        sub_t = `$$ t_{req} = \\frac{${pressao.toFixed(4)} \\cdot ${R.toFixed(4)}}{2(${S.toFixed(4)} \\cdot ${E.toFixed(4)}) - 0.2(${pressao.toFixed(4)})} $$`;

        PMTA = (2 * S * E * t_util) / (R + 0.2 * t_util);
        eq_pmta = `$$ PMTA = \\frac{2 \\cdot S \\cdot E \\cdot T_{util}}{R + 0.2 \\cdot T_{util}} $$`;
        sub_pmta = `$$ PMTA = \\frac{2(${S.toFixed(4)}) \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)}}{${R.toFixed(4)} + 0.2(${t_util.toFixed(4)})} $$`;
      } else if (tipo === 'plano') {
        const C_factor = 0.33;
        t_req = diametro * Math.sqrt((C_factor * pressao) / (S * E));
        eq_t = `$$ t_{req} = D \\sqrt{\\frac{C \\cdot P}{S \\cdot E}} $$`;
        sub_t = `$$ t_{req} = ${diametro.toFixed(4)} \\sqrt{\\frac{${C_factor} \\cdot ${pressao.toFixed(4)}}{${S.toFixed(4)} \\cdot ${E.toFixed(4)}}} $$`;

        PMTA = (S * E * Math.pow(t_util, 2)) / (C_factor * Math.pow(diametro, 2));
        eq_pmta = `$$ PMTA = \\frac{S \\cdot E \\cdot T_{util}^2}{C \\cdot D^2} $$`;
        sub_pmta = `$$ PMTA = \\frac{${S.toFixed(4)} \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)}^2}{${C_factor} \\cdot ${diametro.toFixed(4)}^2} $$`;
      } else if (tipo === 'cone') {
        // UG-32(g) — tampo cônico (sem reforço na junção), meio-ângulo alfa em graus.
        const alfaGraus = numOuPadrao(dados.alfa, 30);
        const alfaRad = (alfaGraus * Math.PI) / 180;
        const cosAlfa = Math.cos(alfaRad);

        t_req = (pressao * diametro) / (2 * cosAlfa * (S * E - 0.6 * pressao));
        eq_t = `$$ t_{req} = \\frac{P \\cdot D}{2 \\cdot \\cos\\alpha \\cdot (S \\cdot E - 0.6 \\cdot P)} $$`;
        sub_t = `$$ t_{req} = \\frac{${pressao.toFixed(4)} \\cdot ${diametro.toFixed(4)}}{2 \\cdot \\cos(${alfaGraus.toFixed(2)}°) \\cdot ((${S.toFixed(4)} \\cdot ${E.toFixed(4)}) - 0.6(${pressao.toFixed(4)}))} $$`;

        PMTA = (2 * S * E * t_util * cosAlfa) / (diametro + 1.2 * t_util * cosAlfa);
        eq_pmta = `$$ PMTA = \\frac{2 \\cdot S \\cdot E \\cdot T_{util} \\cdot \\cos\\alpha}{D + 1.2 \\cdot T_{util} \\cdot \\cos\\alpha} $$`;
        sub_pmta = `$$ PMTA = \\frac{2 \\cdot ${S.toFixed(4)} \\cdot ${E.toFixed(4)} \\cdot ${t_util.toFixed(4)} \\cdot \\cos(${alfaGraus.toFixed(2)}°)}{${diametro.toFixed(4)} + 1.2(${t_util.toFixed(4)}) \\cdot \\cos(${alfaGraus.toFixed(2)}°)} $$`;
      }

      const result_t = `$$ t_{req} = ${t_req.toFixed(4)} \\text{ mm} $$`;
      const result_pmta = `$$ PMTA = ${PMTA.toFixed(4)} \\text{ MPa} $$`;

      const isAprovado = t_util >= t_req;
      const css_valida_t = isAprovado ? 'msg-aprovado' : 'msg-reprovado';
      const txt_valida_t = isAprovado
        ? `STATUS: APROVADO. A espessura útil ( ${t_util.toFixed(4)} mm ) é maior ou igual à mínima requerida ( ${t_req.toFixed(4)} mm ). Logo: Tútil >= Treq`
        : `STATUS: REPROVADO! A espessura útil ( ${t_util.toFixed(4)} mm ) é inferior à mínima requerida ( ${t_req.toFixed(4)} mm ). Logo: Tútil < Treq`;

      const isPmtaAprovada = PMTA >= pressao;
      const css_valida_p = isPmtaAprovada ? 'msg-aprovado' : 'msg-reprovado';
      const txt_valida_p = isPmtaAprovada
        ? `STATUS: APROVADO. A PMTA calculada ( ${PMTA.toFixed(4)} MPa ) atende à Pressão de Projeto ( ${pressao.toFixed(4)} MPa ).`
        : `STATUS: REPROVADO! A PMTA do componente ( ${PMTA.toFixed(4)} MPa ) é inferior à Pressão de Projeto ( ${pressao.toFixed(4)} MPa ). Risco de ruptura!`;

      blocoOutput = blocoOutput.concat([
        `// 1. ESPESSURA MÍNIMA REQUERIDA (t_req)`,
        eq_t,
        sub_t,
        result_t,
        `<span class="${css_valida_t}">${txt_valida_t}</span>`,
        ` `,
        `// ----------------------------------------------------`,
        `// 2. CÁLCULO DA PRESSÃO MÁXIMA DE TRABALHO ADMISSÍVEL (PMTA)`,
        `// Observação da Norma: O cálculo da PMTA utiliza a Espessura Útil (Tnom - CA = Tútil) e não a Espessura Requerida.`,
        eq_pmta,
        sub_pmta,
        result_pmta,
        `<span class="${css_valida_p}">${txt_valida_p}</span>`,
        ` `,
      ]);
      break;
    }

    case 'planoAparafusado': {
      const C_ap = numOuPadrao(dados.C_fator, 0.3);
      const t_req_placa = diametro * Math.sqrt((C_ap * pressao) / (S * E));
      const PMTA_placa = (S * E * Math.pow(t_util, 2)) / (C_ap * Math.pow(diametro, 2));

      const N_par = numOuPadrao(dados.N_parafusos, 8);
      const d_par = numOuPadrao(dados.d_parafuso, 25);
      const S_par = numOuPadrao(dados.S_parafuso, S);
      const A_total = (Math.PI * Math.pow(diametro, 2)) / 4;
      // Área resistente da rosca (stress area) — nunca π·d²/4 (revisão de engenharia).
      const As_par = areaResistenteParafuso(d_par);
      const Ab = N_par * As_par;
      const F_total = pressao * A_total;
      const sigma_par = Ab > 0 ? F_total / Ab : Infinity;
      const PMTA_par = A_total > 0 ? (Ab * S_par) / A_total : 0;
      const PMTA_final = Math.min(PMTA_placa, PMTA_par);

      const isAprovadoT = t_util >= t_req_placa;
      const isAprovadoPar = sigma_par <= S_par;
      const isPmtaOk = PMTA_final >= pressao;
      const cssT = isAprovadoT ? 'msg-aprovado' : 'msg-reprovado';
      const cssPar = isAprovadoPar ? 'msg-aprovado' : 'msg-reprovado';
      const cssP = isPmtaOk ? 'msg-aprovado' : 'msg-reprovado';

      blocoOutput = blocoOutput.concat([
        `// PARÂMETROS DOS PARAFUSOS/TRAVAS:`,
        `// N = ${N_par} | d_par = ${d_par.toFixed(2)} mm | As = ${As_par.toFixed(2)} mm² (área resistente da rosca) | Sb = ${S_par.toFixed(4)} MPa`,
        ` `,
        `// 1. ESPESSURA MÍNIMA DA TAMPA (UG-34, C = ${C_ap})`,
        `$$ t_{req} = D \\sqrt{\\frac{C \\cdot P}{S \\cdot E}} $$`,
        `$$ t_{req} = ${diametro.toFixed(4)} \\sqrt{\\frac{${C_ap} \\cdot ${pressao.toFixed(4)}}{${S.toFixed(4)} \\cdot ${E.toFixed(4)}}} $$`,
        `$$ t_{req} = ${t_req_placa.toFixed(4)} \\text{ mm } $$`,
        `<span class="${cssT}">${isAprovadoT ? `STATUS: APROVADO. Tútil (${t_util.toFixed(4)} mm) ≥ Treq (${t_req_placa.toFixed(4)} mm).` : `STATUS: REPROVADO! Tútil (${t_util.toFixed(4)} mm) < Treq (${t_req_placa.toFixed(4)} mm).`}</span>`,
        ` `,
        `// 2. VERIFICAÇÃO DOS PARAFUSOS/TRAVAS`,
        `// Utiliza-se sempre a área resistente da rosca (stress area), nunca π·d²/4.`,
        `$$ A_b = N \\cdot A_s = ${N_par} \\cdot ${As_par.toFixed(2)} = ${Ab.toFixed(2)} \\text{ mm}^2 $$`,
        `$$ F = P \\cdot \\frac{\\pi \\cdot D^2}{4} = ${pressao.toFixed(4)} \\cdot ${A_total.toFixed(2)} = ${F_total.toFixed(2)} \\text{ N} $$`,
        `$$ \\sigma = \\frac{F}{A_b} = \\frac{${F_total.toFixed(2)}}{${Ab.toFixed(2)}} = ${sigma_par.toFixed(4)} \\text{ MPa } $$`,
        `<span class="${cssPar}">${isAprovadoPar ? `STATUS: APROVADO. σ (${sigma_par.toFixed(4)} MPa) ≤ Sb (${S_par.toFixed(4)} MPa).` : `STATUS: REPROVADO! σ (${sigma_par.toFixed(4)} MPa) > Sb (${S_par.toFixed(4)} MPa).`}</span>`,
        ` `,
        `// 3. PMTA DO CONJUNTO (menor entre tampa UG-34 e parafusos)`,
        `$$ PMTA_{tampa} = ${PMTA_placa.toFixed(4)} \\text{ MPa } \\quad PMTA_{par} = ${PMTA_par.toFixed(4)} \\text{ MPa } $$`,
        `$$ PMTA = ${PMTA_final.toFixed(4)} \\text{ MPa } $$`,
        `<span class="${cssP}">${isPmtaOk ? `STATUS: APROVADO. PMTA (${PMTA_final.toFixed(4)} MPa) ≥ P (${pressao.toFixed(4)} MPa).` : `STATUS: REPROVADO! PMTA (${PMTA_final.toFixed(4)} MPa) < P (${pressao.toFixed(4)} MPa).`}</span>`,
        ` `,
        `// Observação Técnica: Esta metodologia é adequada para verificação mecânica simplificada de`,
        `// tampo plano aparafusado em software de inspeção. Não representa a implementação completa do`,
        `// Mandatory Appendix 2 da ASME, que inclui verificação de flange, junta de vedação, momentos e rigidez.`,
        ` `,
      ]);
      break;
    }

    case 'bocal': {
      const casco = dados.dadosCascoRef;
      if (!casco) {
        return [
          '// ERRO SISTÊMICO: O cálculo de reforço do bocal exige que o Casco Principal seja configurado primeiro.',
        ];
      }

      const d_bocal = numOuPadrao(dados.d, 150.0);
      const t_nom_bocal = numOuPadrao(dados.t_comercial, 0.0);
      const ca_bocal = numOuPadrao(dados.ca, 0.0);
      const tn_corroido = t_nom_bocal - ca_bocal;
      const d_corroido = d_bocal + 2 * ca_bocal;
      const h_proj_int = numOuPadrao(dados.proj_int, 0.0);
      const h_corroido = h_proj_int > ca_bocal ? h_proj_int - ca_bocal : 0;

      const t_nom_casco = numOuPadrao(casco.t_comercial, 0.0);
      const ca_casco = numOuPadrao(casco.ca, 0.0);
      const ts_corroido = t_nom_casco - ca_casco;
      const S_casco = numOuPadrao(casco.S, S);
      const E_casco = numOuPadrao(casco.E, E);

      // Eficiência de junta do próprio bocal (revisão de engenharia): bocal sem solda → E = 1,0.
      const E_bocal = numOuPadrao(dados.E, 1.0);

      const tr_casco = (pressao * R) / (S_casco * E_casco - 0.6 * pressao);
      const trn_bocal = (pressao * (d_corroido / 2)) / (S * E_bocal - 0.6 * pressao);

      // Limites de reforço (UG-40): X paralelo à parede do casco, Y normal a ela.
      const limit_X = d_corroido;
      const limit_Y = Math.min(2.5 * ts_corroido, 2.5 * tn_corroido);

      const A_req = d_corroido * tr_casco;
      const A1 = limit_X * Math.max(0, ts_corroido - tr_casco); // considerada somente se positiva
      const A2 = 2 * limit_Y * Math.max(0, tn_corroido - trn_bocal);
      // UG-40: a projeção interna só conta dentro do limite de reforço — o excedente é descartado.
      const h_efetivo = Math.min(h_corroido, limit_Y);
      const A3 = 2 * h_efetivo * tn_corroido;

      let A4 = 0;
      let arr_A4: string[] = [];

      if (dados.temReforco) {
        const w_ref = numOuPadrao(dados.w_reforco, 0.0);
        const t_ref = numOuPadrao(dados.t_reforco, 0.0);
        const S_pad = numOuPadrao(dados.S_reforco, S_casco);

        let fr = S_pad / S_casco;
        if (fr > 1.0) fr = 1.0;

        if (w_ref > d_bocal) {
          A4 = (w_ref - d_bocal - 2 * t_nom_bocal) * t_ref * fr;
          arr_A4 = [
            `// Área A4 (Disponível na Chapa de Reforço / Pad Adicional):`,
            `// Fator de Redução de Resistência (fr): $f_r = \\min(S_p / S_v, 1.0)$ = ${fr.toFixed(4)}`,
            `$$ A_4 = (W - d - 2 \\cdot Tnom) \\cdot t_e \\cdot f_r $$`,
            `$$ A_4 = (${w_ref.toFixed(4)} - ${d_bocal.toFixed(4)} - 2 \\cdot ${t_nom_bocal.toFixed(4)}) \\cdot ${t_ref.toFixed(4)} \\cdot ${fr.toFixed(4)} = ${A4.toFixed(4)} \\text{ mm}^2 $$`,
          ];
        }
      } else {
        arr_A4 = [`// Área A4 (Chapa de Reforço): Componente não possui reforço externo. A4 = 0.0000 mm²`];
      }

      const A_disp = A1 + A2 + A3 + A4;
      const isBocalAprovado = A_disp >= A_req;
      const css_valida_A = isBocalAprovado ? 'msg-aprovado' : 'msg-reprovado';
      const txt_valida_A = isBocalAprovado
        ? `STATUS: CONFORME. A soma das áreas efetivas de reforço disponíveis ( ${A_disp.toFixed(4)} mm² ) é igual ou superior à área requerida pela UG-37 ( ${A_req.toFixed(4)} mm² ).`
        : `STATUS: NÃO CONFORME! A área de reforço disponível ( ${A_disp.toFixed(4)} mm² ) é inferior à área requerida pela UG-37 ( ${A_req.toFixed(4)} mm² ).`;

      blocoOutput = blocoOutput
        .concat([
          `// Parâmetros Auxiliares do Casco furado: Tnom Casco = ${t_nom_casco.toFixed(4)} mm | CA Casco = ${ca_casco.toFixed(4)} mm`,
          `// E_bocal = ${E_bocal.toFixed(4)} (Eficiência de junta do bocal — bocal sem solda: E = 1,0)`,
          ` `,
          `// ----------------------------------------------------`,
          `// 1. DIMENSÕES CORROÍDAS`,
          `$$ d_{corr} = d + 2 \\cdot CA_{bocal} = ${d_bocal.toFixed(4)} + 2 \\cdot ${ca_bocal.toFixed(4)} = ${d_corroido.toFixed(4)} \\text{ mm} $$`,
          `$$ t_{n,corr} = Tnom_{bocal} - CA_{bocal} = ${tn_corroido.toFixed(4)} \\text{ mm} \\quad t_{s,corr} = Tnom_{casco} - CA_{casco} = ${ts_corroido.toFixed(4)} \\text{ mm} $$`,
          ` `,
          `// ----------------------------------------------------`,
          `// 2. ESPESSURAS REQUERIDAS`,
          `// Casco:`,
          `$$ t_{r,casco} = \\frac{P \\cdot R}{S_{casco} \\cdot E_{casco} - 0.6 \\cdot P} = ${tr_casco.toFixed(4)} \\text{ mm} $$`,
          `// Bocal (com eficiência de junta; caso o bocal seja sem solda, E_bocal = 1,0):`,
          `$$ t_{r,bocal} = \\frac{P \\cdot d_{corr}/2}{S_{bocal} \\cdot E_{bocal} - 0.6 \\cdot P} = ${trn_bocal.toFixed(4)} \\text{ mm} $$`,
          ` `,
          `// ----------------------------------------------------`,
          `// 3. ÁREA REQUERIDA DE COMPENSAÇÃO (A_req)`,
          `// Regra ASME UG-37: O aço que foi cortado para fazer o furo no vaso deve ser matematicamente reposto ao redor do bocal.`,
          `$$ A_{req} = d_{corr} \\cdot t_{r,casco} $$`,
          `$$ A_{req} = ${d_corroido.toFixed(4)} \\cdot ${tr_casco.toFixed(4)} = ${A_req.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// ----------------------------------------------------`,
          `// 4. ÁREAS DISPONÍVEIS DE REFORÇO (A_disp)`,
          `// Área A1 (excedente na parede do Casco — considerada somente se positiva):`,
          `$$ A_1 = d_{corr} \\cdot (t_{s,corr} - t_{r,casco}) $$`,
          `$$ A_1 = ${limit_X.toFixed(4)} \\cdot (${ts_corroido.toFixed(4)} - ${tr_casco.toFixed(4)}) = ${A1.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// Área A2 (excedente no Pescoço do Bocal):`,
          `// Y = altura efetiva de reforço conforme UG-40 = min(2,5·t_s,corr ; 2,5·t_n,corr) = ${limit_Y.toFixed(4)} mm`,
          `$$ A_2 = 2 \\cdot Y \\cdot (t_{n,corr} - t_{r,bocal}) $$`,
          `$$ A_2 = 2 \\cdot ${limit_Y.toFixed(4)} \\cdot (${tn_corroido.toFixed(4)} - ${trn_bocal.toFixed(4)}) = ${A2.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// Área A3 (parte interna do bocal localizada dentro do limite de reforço definido pela UG-40):`,
          `// h_corr = altura efetiva disponível no interior do vaso (limitada ao limite de reforço) = ${h_efetivo.toFixed(4)} mm`,
          `$$ A_3 = 2 \\cdot h_{corr} \\cdot t_{n,corr} = 2 \\cdot ${h_efetivo.toFixed(4)} \\cdot ${tn_corroido.toFixed(4)} = ${A3.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
        ])
        .concat(arr_A4)
        .concat([
          ` `,
          `// ----------------------------------------------------`,
          `// LIMITES DE REFORÇO (UG-40): as áreas consideradas são limitadas automaticamente ao limite`,
          `// de reforço estabelecido pela ASME. Área excedente localizada fora do limite de reforço`,
          `// não é considerada no cálculo.`,
          `// ----------------------------------------------------`,
          `// 5. CRITÉRIO — VERIFICAÇÃO FINAL DE COMPENSAÇÃO DE ÁREA`,
          `$$ A_1 + A_2 + A_3 + A_4 \\geq A_{req} $$`,
          `$$ A_{disp} = ${A1.toFixed(4)} + ${A2.toFixed(4)} + ${A3.toFixed(4)} + ${A4.toFixed(4)} = ${A_disp.toFixed(4)} \\text{ mm}^2 $$`,
          `<span class="${css_valida_A}">${txt_valida_A}</span>`,
          ` `,
          `// Observação: A UG-37 estabelece apenas a verificação da compensação de área da abertura.`,
          `// O bocal não possui PMTA independente; a pressão máxima admissível permanece limitada pelo`,
          `// componente principal (casco, tampo ou cone) e pelas demais verificações aplicáveis da ASME.`,
          ` `,
        ]);
      break;
    }

    case 'flange': {
      const A_flange = num(dados.A);
      const B_flange = num(dados.D);
      const C_flange = num(dados.C);
      const t_flange = num(dados.t);
      const S_f = num(dados.S);
      const P_flange = numOuPadrao(dados.P, pressao);

      const G = num(dados.G);
      const b = num(dados.b);
      const m = num(dados.m);
      const y_seat = num(dados.y);

      const H = (Math.PI / 4) * Math.pow(G, 2) * P_flange;
      const Hp = 2 * b * Math.PI * G * m * P_flange;
      const Wm1 = H + Hp;
      const Wm2 = Math.PI * b * G * y_seat;

      const hD = (C_flange - B_flange) / 2;
      const hG = (C_flange - G) / 2;
      const hT = (hD + hG) / 2;

      const HD = (Math.PI / 4) * Math.pow(B_flange, 2) * P_flange;
      const HT = H - HD;
      const HG = Wm1 - H;

      const MD = HD * hD;
      const MT = HT * hT;
      const MG = HG * hG;

      const M_op = MD + MT + MG;
      const M_seat = Wm2 * hG;
      const M_max = Math.max(M_op, M_seat);

      const K = A_flange / B_flange;
      const Y_factor = (1 / (K - 1)) * (0.66845 + 5.7169 * (Math.log10(K) / (Math.pow(K, 2) - 1)));

      const t_req = Math.sqrt((M_max * Y_factor) / (S_f * B_flange));

      const isAprovado = t_flange >= t_req;
      const css_valida = isAprovado ? 'msg-aprovado' : 'msg-reprovado';
      const txt_valida = isAprovado
        ? `STATUS: APROVADO. Espessura comercial ( ${t_flange.toFixed(2)} mm ) é suficiente para resistir ao momento fletor (t_req = ${t_req.toFixed(2)} mm).`
        : `STATUS: REPROVADO. Risco de empenamento. A espessura atual ( ${t_flange.toFixed(2)} mm ) é menor que a requerida ( ${t_req.toFixed(2)} mm ).`;

      blocoOutput = blocoOutput.concat([
        `// Norma Aplicada: ASME Sec. VIII Div. 1 - Apêndice 2 (Flanges Circulares)`,
        `// Material do Flange: ${mat} | S = ${S_f} MPa`,
        ` `,
        `// ----------------------------------------------------`,
        `// 1. CÁLCULO DE CARGAS NOS PARAFUSOS (Wm1 e Wm2)`,
        `$$ W_{m1} = \\frac{\\pi}{4} G^2 P + 2 b \\pi G m P = ${Wm1.toFixed(2)} \\text{ N (Operação)} $$`,
        `$$ W_{m2} = \\pi b G y = ${Wm2.toFixed(2)} \\text{ N (Assentamento da Junta)} $$`,
        ` `,
        `// ----------------------------------------------------`,
        `// 2. MOMENTO FLETOR MÁXIMO ATUANTE (Mo)`,
        `// Braços de Alavanca: hD = ${hD.toFixed(2)} mm | hT = ${hT.toFixed(2)} mm | hG = ${hG.toFixed(2)} mm`,
        `$$ M_{op} = M_D + M_T + M_G = ${(M_op / 1e6).toFixed(4)} \\text{ kN.m} $$`,
        `$$ M_{seat} = W_{m2} \\cdot h_G = ${(M_seat / 1e6).toFixed(4)} \\text{ kN.m} $$`,
        `// Momento Crítico adotado para cálculo (Maior Valor): ${(M_max / 1e6).toFixed(4)} kN.m`,
        ` `,
        `// ----------------------------------------------------`,
        `// 3. ESPESSURA MÍNIMA REQUERIDA (T_req)`,
        `// Fator Dimensional Y (ASME Fig 2-7.1) = ${Y_factor.toFixed(4)}`,
        `$$ t_{req} = \\sqrt{\\frac{M_{max} \\cdot Y}{S \\cdot B}} $$`,
        `$$ t_{req} = \\sqrt{\\frac{${M_max.toFixed(2)} \\cdot ${Y_factor.toFixed(4)}}{${S_f.toFixed(2)} \\cdot ${B_flange.toFixed(2)}}} = ${t_req.toFixed(4)} \\text{ mm} $$`,
        `<span class="${css_valida}">${txt_valida}</span>`,
        ` `,
        `// Critério: Flange verificada conforme momento máximo. A PMTA permanece limitada pelo componente principal.`,
        ` `,
        `// Observação: Esta rotina corresponde a uma verificação simplificada da espessura da flange,`,
        `// baseada no momento fletor máximo atuante. O procedimento é destinado à avaliação de flanges`,
        `// em equipamentos existentes e não substitui o dimensionamento completo previsto na ASME`,
        `// Section VIII, Division 1 – Mandatory Appendix 2. Para projetos de novos flanges ou`,
        `// reavaliações completas de projeto, devem ser aplicadas as verificações integrais da norma,`,
        `// incluindo as tensões na flange, no cubo (hub), nos parafusos, na junta de vedação e os`,
        `// fatores geométricos aplicáveis ao tipo de flange.`,
        ` `,
      ]);
      break;
    }
  }

  return blocoOutput;
}

// Roda o motor e devolve no formato comum {t_min,pmta,resultado,log} usado pelos outros
// componentes. t_min/pmta são extraídos das linhas de resultado do próprio log (mesmo texto que
// aparece no memorial) — só cascos/tampos têm essas linhas; bocal/flange são checagens de
// área/momento (aprovado/reprovado), sem PMTA, então ficam com t_min/pmta vazios.
// Tolerante ao espaço antes do `}`: o branch principal (cilíndrico/elíptico/etc) emite
// `\text{ mm}`/`\text{ MPa}` (sem espaço final) e o planoAparafusado emite `\text{ mm }`/`\text{ MPa }`
// (com espaço). Sem o ` ?` o regex só casava o planoAparafusado e os demais ficavam com pmta/t_min ''.
const RE_TREQ = /t_\{req\} = ([-\d.]+) \\text\{ mm ?\}/;
const RE_PMTA = /PMTA = ([-\d.]+) \\text\{ MPa ?\}/;

export function calcularComponenteVaso(
  nomeDaPeca: string,
  tipo: TipoComponenteVaso,
  dados: DadosComponenteVaso,
  D: NumLike,
  P: NumLike,
): ResultadoCalculo {
  const log = gerarBlocoComponenteVaso(nomeDaPeca, tipo, dados, D, P);
  const aprovado = log.some((l) => l.includes('msg-aprovado')) && !log.some((l) => l.includes('msg-reprovado'));

  const linhaTreq = log.find((l) => RE_TREQ.test(l));
  const linhaPmta = log.find((l) => RE_PMTA.test(l));
  const t_min = linhaTreq ? RE_TREQ.exec(linhaTreq)![1] : '';
  const pmta = linhaPmta ? RE_PMTA.exec(linhaPmta)![1] : '';

  const faltantes = camposFaltantesVaso(tipo, dados);
  return { t_min, pmta, resultado: aprovado ? 'APROVADO' : 'REPROVADO', log, faltantes };
}
