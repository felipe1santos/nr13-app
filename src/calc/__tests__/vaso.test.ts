import { describe, expect, it } from 'vitest';
import { calcularComponenteVaso, gerarBlocoComponenteVaso, camposFaltantesVaso } from '../vaso';

describe('vaso — cascos e tampos (ASME VIII Div.1, verbatim do math.js)', () => {
  it('casco cilíndrico UG-27(c)(1): aprova quando t_util >= t_req', () => {
    const log = gerarBlocoComponenteVaso(
      'Casco',
      'cilindrico',
      { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, mat: 'SA-516-70', temp: 100 },
      1000,
      1.5,
    );
    expect(log.join('\n')).toContain('msg-aprovado');
  });

  it('tampo elíptico 2:1 UG-32(c) calcula sem erro', () => {
    const log = gerarBlocoComponenteVaso('Tampo Superior', 'eliptico', { t_comercial: 10, ca: 1.5, S: 137.9, E: 1 }, 1000, 1.5);
    expect(log.some((l) => l.includes('PMTA'))).toBe(true);
  });

  it('tampo cônico UG-32(g) — novo, usa meio-ângulo alfa', () => {
    const log = gerarBlocoComponenteVaso('Tampo Cônico', 'cone', { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, alfa: 30 }, 1000, 1.5);
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});

describe('vaso — extração de pmta/t_min (calcularComponenteVaso)', () => {
  // Regressão: a linha de resultado emite `\text{ mm}`/`\text{ MPa}` (sem espaço antes do `}`) e o
  // regex exigia espaço, então pmta/t_min vinham '' para cilíndrico/elíptico/etc — quebrava a
  // injeção na ficha (PMTA 0.00, card mostrando "—") apesar de resultado APROVADO.
  it('elíptico: pmta e t_min são numéricos, não vazios', () => {
    const r = calcularComponenteVaso('Tampo', 'eliptico', { t_comercial: 10, ca: 1.5, S: 137.9, E: 0.85, temp: 100 }, 1000, 1.5);
    expect(r.pmta).not.toBe('');
    expect(r.t_min).not.toBe('');
    expect(Number.isFinite(parseFloat(r.pmta))).toBe(true);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
  });

  it('cilíndrico: pmta e t_min são numéricos, não vazios', () => {
    const r = calcularComponenteVaso('Casco', 'cilindrico', { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85, temp: 100 }, 1000, 1.5);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
    expect(parseFloat(r.t_min)).toBeGreaterThan(0);
  });

  it('planoAparafusado (linha com espaço final): continua extraindo', () => {
    const r = calcularComponenteVaso('Tampa', 'planoAparafusado', { t_comercial: 20, ca: 1.5, S: 137.9, E: 1, N_parafusos: 8, d_parafuso: 25, S_parafuso: 137.9 }, 600, 1.5);
    expect(parseFloat(r.pmta)).toBeGreaterThan(0);
  });
});

describe('vaso — flange (bug de dispatch corrigido)', () => {
  it('flange agora calcula (no math.js original esse branch nunca executava)', () => {
    const log = gerarBlocoComponenteVaso(
      'Flange Casco',
      'flange',
      { A: 600, D: 500, C: 560, t: 40, S: 137.9, P: 1.5, G: 480, b: 10, m: 2, y: 20 },
      1000,
      1.5,
    );
    expect(log.join('\n')).toContain('ESPESSURA MÍNIMA REQUERIDA');
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});

describe('vaso — bocal UG-37', () => {
  it('exige dadosCascoRef, senão retorna erro sistêmico', () => {
    const log = gerarBlocoComponenteVaso('Bocal N1', 'bocal', { d: 150, t_comercial: 10, ca: 1.5 }, 1000, 1.5);
    expect(log[0]).toContain('ERRO SISTÊMICO');
  });

  it('calcula área de compensação quando o casco de referência é informado', () => {
    const log = gerarBlocoComponenteVaso(
      'Bocal N1',
      'bocal',
      {
        d: 150,
        t_comercial: 10,
        ca: 1.5,
        proj_int: 0,
        dadosCascoRef: { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85 },
      },
      1000,
      1.5,
    );
    expect(log.join('\n')).toMatch(/msg-(aprovado|reprovado)/);
  });
});

describe('planoAparafusado com C configurável', () => {
  // Planilha_Tampo_Plano_UG34_ASME_Status.xlsx: d=300, P=0.7, S=138, E=1, C=0.3, CA=0, t=8
  it('bate com a planilha UG-34 (C=0.3)', () => {
    const r = calcularComponenteVaso(
      'TAMPA',
      'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, C_fator: 0.3, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 },
      300,
      0.7,
    );
    expect(parseFloat(r.t_min)).toBeCloseTo(11.7028, 3);
    expect(r.resultado).toBe('REPROVADO'); // t 8 < 11.70
  });

  it('default de C para aparafusado é 0.3', () => {
    const r1 = calcularComponenteVaso(
      'TAMPA',
      'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 },
      300,
      0.7,
    );
    const r2 = calcularComponenteVaso(
      'TAMPA',
      'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, C_fator: 0.3, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 },
      300,
      0.7,
    );
    expect(r1.t_min).toBe(r2.t_min);
  });
});

describe('correções da revisão de engenharia (calculos-corretos-sistema)', () => {
  const cascoRef = { t_comercial: 12, ca: 1.5, S: 137.9, E: 0.85 };

  it('bocal: t_r,bocal usa a eficiência de junta do bocal (E_bocal)', () => {
    const semSolda = gerarBlocoComponenteVaso(
      'Bocal N1', 'bocal',
      { d: 150, t_comercial: 10, ca: 1.5, proj_int: 0, E: 1, S: 137.9, dadosCascoRef: cascoRef }, 1000, 1.5,
    ).join('\n');
    const comSolda = gerarBlocoComponenteVaso(
      'Bocal N1', 'bocal',
      { d: 150, t_comercial: 10, ca: 1.5, proj_int: 0, E: 0.7, S: 137.9, dadosCascoRef: cascoRef }, 1000, 1.5,
    ).join('\n');
    expect(semSolda).toContain('E_bocal = 1.0000');
    expect(comSolda).toContain('E_bocal = 0.7000');
    // E menor → t_r,bocal maior → A2 menor: os logs precisam divergir nos números
    expect(semSolda).not.toBe(comSolda);
  });

  it('bocal: nomenclatura ASME A1..A4 e critério com A4', () => {
    const log = gerarBlocoComponenteVaso(
      'Bocal N1', 'bocal',
      { d: 150, t_comercial: 10, ca: 1.5, proj_int: 0, E: 1, S: 137.9, dadosCascoRef: cascoRef }, 1000, 1.5,
    ).join('\n');
    expect(log).toContain('Área A4');
    expect(log).not.toContain('A_5');
    expect(log).toContain('A_1 + A_2 + A_3 + A_4');
    expect(log).toContain('LIMITES DE REFORÇO (UG-40)');
    expect(log).toMatch(/CONFORME|NÃO CONFORME/);
  });

  it('bocal: A3 limitado à altura efetiva de reforço da UG-40', () => {
    // proj_int gigante (500 mm) não pode inflar A3 além de 2·limit_Y·tn
    const log = gerarBlocoComponenteVaso(
      'Bocal N1', 'bocal',
      { d: 150, t_comercial: 10, ca: 1.5, proj_int: 500, E: 1, S: 137.9, dadosCascoRef: cascoRef }, 1000, 1.5,
    ).join('\n');
    // limit_Y = min(2.5·10.5, 2.5·8.5) = 21.25 → h_efetivo clampado em 21.25, nunca 498.5
    expect(log).toContain('21.2500');
    expect(log).not.toContain('498.5000');
  });

  it('planoAparafusado: usa área resistente da rosca (M20 → 245 mm²), nunca π·d²/4', () => {
    const log = gerarBlocoComponenteVaso(
      'TAMPA', 'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, C_fator: 0.3, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 },
      300, 0.7,
    ).join('\n');
    expect(log).toContain('245.00'); // As de M20, não 314.16 (π·20²/4)
    expect(log).not.toContain('314.16');
    expect(log).toContain('stress area');
  });

  it('flange: observação da verificação simplificada + critério do momento máximo', () => {
    const log = gerarBlocoComponenteVaso(
      'Flange Casco', 'flange',
      { A: 600, D: 500, C: 560, t: 40, S: 137.9, P: 1.5, G: 480, b: 10, m: 2, y: 20 }, 1000, 1.5,
    ).join('\n');
    expect(log).toContain('verificação simplificada');
    expect(log).toContain('Flange verificada conforme momento máximo');
  });
});

describe('campos vazios → faltantes + aviso no log', () => {
  it('lista campos vazios e injeta aviso de valor padrão no log', () => {
    const r = calcularComponenteVaso('CASCO', 'cilindrico', { t_comercial: 8, ca: 0 }, 1000, 1.5);
    expect(r.faltantes).toEqual(['S — Tensão Admissível', 'E — Eficiência de Junta']);
    expect(r.log.some((l) => l.includes('ATENÇÃO: valor padrão adotado'))).toBe(true);
  });

  it('sem campos vazios não há faltantes nem aviso', () => {
    const r = calcularComponenteVaso('CASCO', 'cilindrico', { t_comercial: 8, ca: 0, S: 138, E: 1, temp: 25 }, 1000, 1.5);
    expect(r.faltantes ?? []).toEqual([]);
    expect(r.log.some((l) => l.includes('ATENÇÃO'))).toBe(false);
  });
});

describe('camposFaltantesVaso — bocal', () => {
  it('bocal exige d, S e Tnom; E não é obrigatório', () => {
    const f = camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10 });
    expect(f).toEqual(['d — Diâmetro do Bocal']);
  });
  it('bocal com reforço exige W e te', () => {
    const f = camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10, d: 150, temReforco: true });
    expect(f).toContain('W — Largura da Chapa de Reforço');
    expect(f).toContain('te — Espessura da Chapa de Reforço');
  });
  it('bocal completo sem reforço: nada faltante', () => {
    expect(camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10, d: 150 })).toEqual([]);
  });
});
