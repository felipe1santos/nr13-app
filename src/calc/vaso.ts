// Porte de CalculoNR13.gerarBloco (math.js linhas 4-331) — ASME Sec. VIII Div. 1.
// Mesma matemática, mesmos textos de memorial. Duas mudanças deliberadas em relação ao original:
//   1. BUG CORRIGIDO: no math.js, `if (tipo !== 'bocal') { ... } else if (tipo === 'bocal') {...}
//      else if (tipo === 'flange') {...}` nunca alcança o branch de flange, porque a 1ª condição
//      (`tipo !== 'bocal'`) já é verdadeira para 'flange' e consome o fluxo — flange nunca
//      calculava nada de útil em produção. Aqui o dispatch é por switch, então flange funciona.
//   2. NOVO: tipo 'cone' (tampo cônico, UG-32(g)), pedido como adição — não existia no math.js.
import { num, numOuPadrao } from './format';
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
      return 'ASME Sec. VIII Div. 1 - Parágrafo UG-37 - Aberturas e Reforços (Bocais)';
    case 'flange':
      return 'ASME Sec. VIII Div. 1 - Apêndice 2 - Flanges Circulares';
    default:
      return '';
  }
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
    `// MEMORIAL DE CÁLCULO: ${nomeDaPeca.toUpperCase()}`,
    `// Norma Base: ${normaRef}`,
    `// ====================================================`,
    `// PARÂMETROS DE ENTRADA:`,
    `// P = ${pressao.toFixed(4)} MPa (Pressão de Projeto estipulada)`,
    `// T = ${temp.toFixed(2)} °C (Temperatura de Projeto do elemento)`,
    `// D = ${diametro.toFixed(4)} mm (Diâmetro Interno Livre do equipamento)`,
    `// R = ${R.toFixed(4)} mm (Raio Interno do equipamento)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Máxima Admissível para o material ${mat})`,
    `// E = ${E.toFixed(4)} (Eficiência de Junta da Solda / Grau de Raio-X)`,
    `// Tnom = ${t_nom.toFixed(4)} mm (Espessura Comercial / Nominal adotada na fabricação)`,
    `// CA = ${ca.toFixed(4)} mm (Margem de Corrosão definida para desgaste)`,
    `// ----------------------------------------------------`,
    `// Tútil = Tnom - CA = ${t_nom.toFixed(4)} - ${ca.toFixed(4)} = ${t_util.toFixed(4)} mm (Espessura Útil que resistirá à pressão)`,
    `// ----------------------------------------------------`,
    ` `,
  ];

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
        `// 1. CÁLCULO DA ESPESSURA MÍNIMA REQUERIDA (Treq)`,
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
      const C_ap = 0.33;
      const t_req_placa = diametro * Math.sqrt((C_ap * pressao) / (S * E));
      const PMTA_placa = (S * E * Math.pow(t_util, 2)) / (C_ap * Math.pow(diametro, 2));

      const N_par = numOuPadrao(dados.N_parafusos, 8);
      const d_par = numOuPadrao(dados.d_parafuso, 25);
      const S_par = numOuPadrao(dados.S_parafuso, S);
      const A_total = (Math.PI * Math.pow(diametro, 2)) / 4;
      const A_par = (Math.PI * Math.pow(d_par, 2)) / 4;
      const F_por_par = A_total > 0 && N_par > 0 ? (pressao * A_total) / N_par : 0;
      const sigma_par = A_par > 0 ? F_por_par / A_par : Infinity;
      const PMTA_par = A_total > 0 ? (N_par * A_par * S_par) / A_total : 0;
      const PMTA_final = Math.min(PMTA_placa, PMTA_par);

      const isAprovadoT = t_util >= t_req_placa;
      const isAprovadoPar = sigma_par <= S_par;
      const isPmtaOk = PMTA_final >= pressao;
      const cssT = isAprovadoT ? 'msg-aprovado' : 'msg-reprovado';
      const cssPar = isAprovadoPar ? 'msg-aprovado' : 'msg-reprovado';
      const cssP = isPmtaOk ? 'msg-aprovado' : 'msg-reprovado';

      blocoOutput = blocoOutput.concat([
        `// PARÂMETROS DOS PARAFUSOS/TRAVAS:`,
        `// N = ${N_par} | d_par = ${d_par.toFixed(2)} mm | S_par = ${S_par.toFixed(4)} MPa`,
        ` `,
        `// 1. ESPESSURA MÍNIMA DA TAMPA (UG-34, C = ${C_ap})`,
        `$$ t_{req} = D \\sqrt{\\frac{C \\cdot P}{S \\cdot E}} $$`,
        `$$ t_{req} = ${diametro.toFixed(4)} \\sqrt{\\frac{${C_ap} \\cdot ${pressao.toFixed(4)}}{${S.toFixed(4)} \\cdot ${E.toFixed(4)}}} $$`,
        `$$ t_{req} = ${t_req_placa.toFixed(4)} \\text{ mm } $$`,
        `<span class="${cssT}">${isAprovadoT ? `STATUS: APROVADO. Tútil (${t_util.toFixed(4)} mm) ≥ Treq (${t_req_placa.toFixed(4)} mm).` : `STATUS: REPROVADO! Tútil (${t_util.toFixed(4)} mm) < Treq (${t_req_placa.toFixed(4)} mm).`}</span>`,
        ` `,
        `// 2. VERIFICAÇÃO DOS PARAFUSOS/TRAVAS`,
        `$$ A_{total} = \\frac{\\pi \\cdot D^2}{4} = ${A_total.toFixed(2)} \\text{ mm}^2 $$`,
        `$$ F_{par} = \\frac{P \\cdot A_{total}}{N} = \\frac{${pressao.toFixed(4)} \\cdot ${A_total.toFixed(2)}}{${N_par}} = ${F_por_par.toFixed(2)} \\text{ N} $$`,
        `$$ A_{par} = \\frac{\\pi \\cdot d_{par}^2}{4} = ${A_par.toFixed(2)} \\text{ mm}^2 $$`,
        `$$ \\sigma_{par} = \\frac{F_{par}}{A_{par}} = ${sigma_par.toFixed(4)} \\text{ MPa } $$`,
        `<span class="${cssPar}">${isAprovadoPar ? `STATUS: APROVADO. σ_par (${sigma_par.toFixed(4)} MPa) ≤ S_par (${S_par.toFixed(4)} MPa).` : `STATUS: REPROVADO! σ_par (${sigma_par.toFixed(4)} MPa) > S_par (${S_par.toFixed(4)} MPa).`}</span>`,
        ` `,
        `// 3. PMTA DO CONJUNTO (menor entre tampa UG-34 e parafusos)`,
        `$$ PMTA_{tampa} = ${PMTA_placa.toFixed(4)} \\text{ MPa } \\quad PMTA_{par} = ${PMTA_par.toFixed(4)} \\text{ MPa } $$`,
        `$$ PMTA = ${PMTA_final.toFixed(4)} \\text{ MPa } $$`,
        `<span class="${cssP}">${isPmtaOk ? `STATUS: APROVADO. PMTA (${PMTA_final.toFixed(4)} MPa) ≥ P (${pressao.toFixed(4)} MPa).` : `STATUS: REPROVADO! PMTA (${PMTA_final.toFixed(4)} MPa) < P (${pressao.toFixed(4)} MPa).`}</span>`,
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

      const tr_casco = (pressao * R) / (S_casco * E_casco - 0.6 * pressao);
      const trn_bocal = (pressao * (d_corroido / 2)) / (S * 1.0 - 0.6 * pressao);

      const limit_X = d_corroido;
      const limit_Y = Math.min(2.5 * ts_corroido, 2.5 * tn_corroido);

      const A_req = d_corroido * tr_casco;
      const A1 = limit_X * Math.max(0, ts_corroido - tr_casco);
      const A2 = 2 * limit_Y * Math.max(0, tn_corroido - trn_bocal);
      const A3 = 2 * h_corroido * tn_corroido;

      let A5 = 0;
      let arr_A5: string[] = [];

      if (dados.temReforco) {
        const w_ref = numOuPadrao(dados.w_reforco, 0.0);
        const t_ref = numOuPadrao(dados.t_reforco, 0.0);
        const S_pad = numOuPadrao(dados.S_reforco, S_casco);

        let fr = S_pad / S_casco;
        if (fr > 1.0) fr = 1.0;

        if (w_ref > d_bocal) {
          A5 = (w_ref - d_bocal - 2 * t_nom_bocal) * t_ref * fr;
          arr_A5 = [
            `// Área A5 (Disponível na Chapa de Reforço / Pad Adicional):`,
            `// Fator de Redução de Resistência (fr): $f_r = \\min(S_p / S_v, 1.0)$ = ${fr.toFixed(4)}`,
            `$$ A_5 = (W - d - 2 \\cdot Tnom) \\cdot t_e \\cdot f_r $$`,
            `$$ A_5 = (${w_ref.toFixed(4)} - ${d_bocal.toFixed(4)} - 2 \\cdot ${t_nom_bocal.toFixed(4)}) \\cdot ${t_ref.toFixed(4)} \\cdot ${fr.toFixed(4)} = ${A5.toFixed(4)} \\text{ mm}^2 $$`,
          ];
        }
      } else {
        arr_A5 = [`// Área A5 (Chapa de Reforço): Componente não possui reforço externo. A5 = 0.0000 mm²`];
      }

      const A_disp = A1 + A2 + A3 + A5;
      const isBocalAprovado = A_disp >= A_req;
      const css_valida_A = isBocalAprovado ? 'msg-aprovado' : 'msg-reprovado';
      const txt_valida_A = isBocalAprovado
        ? `STATUS: APROVADO. A soma das áreas disponíveis ( ${A_disp.toFixed(4)} mm² ) é maior ou igual à área requerida ( ${A_req.toFixed(4)} mm² ).`
        : `STATUS: REPROVADO! O furo não possui reforço suficiente. Área Disponível ( ${A_disp.toFixed(4)} mm² ) < Área Requerida ( ${A_req.toFixed(4)} mm² ).`;

      blocoOutput = blocoOutput
        .concat([
          `// Parâmetros Auxiliares do Casco furado: Tnom Casco = ${t_nom_casco.toFixed(4)} mm | CA Casco = ${ca_casco.toFixed(4)} mm`,
          ` `,
          `// ----------------------------------------------------`,
          `// 1. ÁREA REQUERIDA DE COMPENSAÇÃO (A_req)`,
          `// Regra ASME UG-37: O aço que foi cortado para fazer o furo no vaso deve ser matematicamente reposto ao redor do bocal.`,
          `$$ A_{req} = d_{corroido} \\cdot t_{r\\_casco} $$`,
          `$$ A_{req} = ${d_corroido.toFixed(4)} \\cdot ${tr_casco.toFixed(4)} = ${A_req.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// ----------------------------------------------------`,
          `// 2. ÁREAS DISPONÍVEIS PARA SACRIFÍCIO (A_disp)`,
          `// Área A1 (Material que "sobrou" na parede do Casco):`,
          `$$ A_1 = d_{corroido} \\cdot (T_{util\\_casco} - t_{r\\_casco}) $$`,
          `$$ A_1 = ${limit_X.toFixed(4)} \\cdot (${ts_corroido.toFixed(4)} - ${tr_casco.toFixed(4)}) = ${A1.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// Área A2 (Material que "sobrou" no Pescoço do Bocal):`,
          `$$ A_2 = 2 \\cdot Y \\cdot (T_{util\\_bocal} - t_{rn\\_bocal}) $$`,
          `$$ A_2 = 2 \\cdot ${limit_Y.toFixed(4)} \\cdot (${tn_corroido.toFixed(4)} - ${trn_bocal.toFixed(4)}) = ${A2.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
          `// Área A3 (Material projetado para o lado de dentro do equipamento):`,
          `$$ A_3 = 2 \\cdot h_{corroido} \\cdot T_{util\\_bocal} $$`,
          `$$ A_3 = 2 \\cdot ${h_corroido.toFixed(4)} \\cdot ${tn_corroido.toFixed(4)} = ${A3.toFixed(4)} \\text{ mm}^2 $$`,
          ` `,
        ])
        .concat(arr_A5)
        .concat([
          ` `,
          `// ----------------------------------------------------`,
          `// 3. VERIFICAÇÃO FINAL DE COMPENSAÇÃO DE ÁREA`,
          `// ----------------------------------------------------`,
          `$$ A_{disp} = A_1 + A_2 + A_3 + A_5 $$`,
          `$$ A_{disp} = ${A1.toFixed(4)} + ${A2.toFixed(4)} + ${A3.toFixed(4)} + ${A5.toFixed(4)} = ${A_disp.toFixed(4)} \\text{ mm}^2 $$`,
          `<span class="${css_valida_A}">${txt_valida_A}</span>`,
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

  return { t_min, pmta, resultado: aprovado ? 'APROVADO' : 'REPROVADO', log };
}
