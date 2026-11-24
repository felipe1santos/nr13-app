import { describe, expect, it } from 'vitest';
import { bancada, calcularBancada, fundoVertical, torisferico, vertical, type DadosAutoclaveBancada } from './autoclave';

/**
 * AUTOCLAVE DE BANCADA (23/11/2026) — conferida número a número contra a planilha
 * do engenheiro parceiro: Memorial_Calculo_SERCON_AHMC10_Corrigido.xlsx
 * (autoclave SERCON AHM, 56 L). Os valores esperados são os que o Excel calcula.
 */
const KGF = 0.0980665;
const SERCON: DadosAutoclaveBancada = {
  pressao: 2.2 * KGF, // PMTA informada 2,2 kgf/cm² → 0,2157 MPa
  diametro: 300,
  tensao: 115.14,
  ef_costado: 0.7,
  ef_fundo: 0.7,
  ef_porta: 0.7,
  ca: 0,
  t_costado: 2.18,
  t_fundo: 2.15,
  t_porta1: 1.49,
  t_porta2: 1.5,
  c_porta: 0.33,
  nerv_b: 5,
  nerv_h: 40,
  nerv_n: 8,
  vao_real: 90,
};

describe('autoclave de bancada — planilha SERCON AHMC10', () => {
  const c = calcularBancada(SERCON);

  it('costado UG-27: t circ/long, mínimo UG-16(b) e PMTA', () => {
    expect(c.costado.tCirc).toBeCloseTo(0.40216884866429387, 9);
    expect(c.costado.tLong).toBeCloseTo(0.2006540413732194, 9);
    expect(c.costado.tReq).toBeCloseTo(1.5, 9);
    expect(c.costado.pmtaCirc).toBeCloseTo(1.1612316599254502, 9);
    expect(c.costado.pmtaLong).toBeCloseTo(2.356413819001127, 9);
    expect(c.costado.pmta / KGF).toBeCloseTo(11.841267506492535, 6);
    expect(c.costado.ok).toBe(true);
  });

  it('fundo torisférico UG-32: M, t e PMTA', () => {
    expect(c.fundo.M).toBeCloseTo(1.7706207261596576, 9);
    expect(c.fundo.tCalc).toBeCloseTo(0.711135177475532, 9);
    expect(c.fundo.tReq).toBeCloseTo(1.5, 9);
    expect(c.fundo.pmta).toBeCloseTo(0.6519202920539171, 9);
    expect(c.fundo.pmta / KGF).toBeCloseTo(6.647736913766853, 6);
  });

  it('porta: força, nervuras (σ, uso, PMTA) e painel no vão real', () => {
    expect(c.porta.forca / 1000).toBeCloseTo(15.250207300181545, 6);
    expect(c.porta.nervuras!.Z).toBeCloseTo(1333.3333333333333, 6);
    expect(c.porta.nervuras!.sigma).toBeCloseTo(26.807005019850372, 6);
    expect(c.porta.nervuras!.uso).toBeCloseTo(0.2328209572681116, 9);
    expect(c.porta.nervuras!.pmta / KGF).toBeCloseTo(9.44932116856872, 6);
    expect(c.porta.vaoConservador).toBeCloseTo(114.80502970952693, 6);
    expect(c.porta.vaoMax).toBeCloseTo(100.6015501547613, 6);
    expect(c.porta.tReq).toBeCloseTo(2.674909080287805, 9);
    expect(c.porta.pmtaPainel / KGF).toBeCloseTo(2.748824464912358, 6);
    expect(c.porta.ok).toBe(true);
  });

  it('conclusão: PMTA calculada 2,75 kgf/cm² ≥ 2,2 e TH = 1,3 × PMTA', () => {
    expect(c.pmta / KGF).toBeCloseTo(2.748824464912358, 6);
    expect(c.aprovado).toBe(true);
    const r = bancada(SERCON);
    expect(r.resultado).toBe('APROVADO');
    expect(Number(r.pmta) / KGF).toBeCloseTo(2.75, 2);
    expect(r.log.join('\n')).toContain('ATENDE CONDICIONALMENTE');
  });

  it('sem vão real: usa o vão conservador e a porta NÃO se demonstra (como a aba Porta UG-34)', () => {
    const s = calcularBancada({ ...SERCON, vao_real: '' });
    expect(s.porta.vaoUsado).toBeCloseTo(114.80502970952693, 6);
    expect(s.porta.pmtaPainel).toBeCloseTo(0.1656650406126452, 9);
    expect(s.porta.ok).toBe(false);
    expect(s.aprovado).toBe(false);
  });

  it('LaTeX do memorial com barra dupla (sem caractere de controle)', () => {
    const txt = bancada(SERCON).log.join('\n');
    expect(txt).toContain('\\frac');
    expect(txt).not.toMatch(/[\f\t\v]/);
  });
});

describe('autoclave vertical — fundo torisférico (23/11/2026)', () => {
  const base = {
    pressao: 0.2,
    diametro: 400,
    tensao: 138,
    eficiencia: 1,
    ca: 1,
    c_fator: 0.33,
    t_tampo: 8,
    t_costado: 4,
    t_fundo: 6,
    n_travas: 6,
    d_trava: 12,
    tensao_trava: 120,
  };
  it('mesma fórmula da bancada (UG-32e), padrão L = D e r = 0,06·D', () => {
    const f = fundoVertical({ ...base, tipo_fundo: 'torisferico' });
    const t = torisferico(0.2, 138, 1, 400, 5);
    expect(f.pmta).toBeCloseTo(t.pmta, 12);
    expect(f.treq).toBeCloseTo(t.treq, 12);
    expect(t.M).toBeCloseTo(0.25 * (3 + Math.sqrt(1 / 0.06)), 12);
    expect(f.nome).toBe('Fundo Torisférico (UG-32e)');
  });
  it('o memorial vertical sai com a seção do torisférico e LaTeX íntegro', () => {
    const txt = vertical({ ...base, tipo_fundo: 'torisferico' }).log.join('\n');
    expect(txt).toContain('FUNDO TORISFÉRICO');
    expect(txt).toContain('\\frac{P \\cdot L \\cdot M}');
    expect(txt).not.toMatch(/[\f\t\v]/);
  });
  it('plano e cônico continuam com o mesmo texto de antes', () => {
    expect(vertical({ ...base, tipo_fundo: 'conico', alfa: 15 }).log.join('\n')).toContain('\\frac{P \\cdot D}{2 \\cdot \\cos\\alpha');
    expect(vertical({ ...base }).log.join('\n')).toContain('FUNDO PLANO — UG-34');
  });
});
