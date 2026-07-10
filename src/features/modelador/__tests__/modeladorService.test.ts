import { beforeEach, describe, expect, it } from 'vitest';
import { carregarOuPreCarregar, modeloVazio, montarFolhaDados, salvarModelo } from '../modeladorService';

// vitest roda em node (sem DOM): shim mínimo de localStorage p/ o motor de prontuário.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

describe('pré-carga do memorial', () => {
  beforeEach(() => localStorage.clear());

  it('sem memorial → modelo vazio', () => {
    const m = carregarOuPreCarregar('X1');
    expect(m.diametroInterno).toBe('');
    expect(m.bocais).toEqual([]);
  });

  it('importa D, casco, 2 tampos e bocal do nr13_vaso_<TAG>', () => {
    localStorage.setItem('nr13_vaso_V1', JSON.stringify({
      tag: 'V1', P: 1, D: 1000, orientacao: 'vertical',
      componentes: [
        { id: 'casco', nome: 'Casco', tipo: 'cilindrico', dados: { t_comercial: '10', mat: 'SA-516-70' } },
        { id: 'tampo1', nome: 'Tampo 1', tipo: 'eliptico', dados: { t_comercial: '8' } },
        { id: 'tampo2', nome: 'Tampo 2', tipo: 'toroesferico', dados: { t_comercial: '8,5' } },
        { id: 'bocal1', nome: 'Bocal 1', tipo: 'bocal', dados: { d: 100, t_comercial: 6 } },
      ],
    }));
    const m = carregarOuPreCarregar('V1');
    expect(m.diametroInterno).toBe(1000);
    expect(m.orientacao).toBe('vertical');
    expect(m.espessuraCasco).toBe(10);
    expect(m.material).toBe('SA-516-70');
    expect(m.tampo1).toEqual({ tipo: 'eliptico', espessura: 8 });
    expect(m.tampo2.tipo).toBe('toriesferico');
    expect(m.tampo2.espessura).toBeCloseTo(8.5, 5);
    expect(m.bocais).toHaveLength(1);
    expect(m.bocais[0]).toMatchObject({ id: 'N1', doMemorial: true, diametro: 100, espessura: 6 });
  });

  it('modelo salvo tem precedência sobre a pré-carga', async () => {
    const m = modeloVazio('V2');
    m.diametroInterno = 750;
    await salvarModelo('V2', m, null, null);
    localStorage.setItem('nr13_vaso_V2', JSON.stringify({ tag: 'V2', P: 1, D: 999, componentes: [] }));
    expect(carregarOuPreCarregar('V2').diametroInterno).toBe(750);
  });
});

describe('salvarModelo e folha de dados', () => {
  beforeEach(() => localStorage.clear());

  it('grava modelo3d, folha_dados e croqui2d', async () => {
    const m = modeloVazio('V3');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.tampo1.espessura = 10; m.tampo2.espessura = 10;
    await salvarModelo('V3', m, { longitudinal: '<svg/>', transversal: '<svg/>', detalheTampo: '<svg/>' }, null);
    expect(localStorage.getItem('nr13_modelo3d_V3')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('nr13_croqui2d_V3')!)).toHaveProperty('longitudinal');
    const fd = JSON.parse(localStorage.getItem('nr13_folha_dados_V3')!);
    expect(fd.pesos.vazioKg).toBeGreaterThan(600);
    expect(fd.comprimentoTotalMm).toBeCloseTo(2500, 0);
  });

  it('montarFolhaDados descreve componentes e bocais', () => {
    const m = modeloVazio('V4');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.bocais = [{ id: 'N1', doMemorial: false, servico: 'Dreno', dn: '1"', diametro: 25, espessura: 4, flange: 'SO #150', local: 'casco', posicaoAxial: 300, angulo: 180, projecao: 120 }];
    const fd = montarFolhaDados(m);
    expect(fd.bocais[0]).toMatchObject({ id: 'N1', servico: 'Dreno', dn: '1"', anguloGraus: 180 });
    expect(fd.dimensoes.some((d) => d.componente.includes('Casco'))).toBe(true);
  });

  it('obs do bocal de casco formata o número em pt-BR (vírgula decimal)', () => {
    const m = modeloVazio('V4b');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.bocais = [{ id: 'N1', doMemorial: false, servico: '', dn: '', diametro: 25, espessura: 4, flange: '', local: 'casco', posicaoAxial: 800.5, angulo: 0, projecao: 120 }];
    const fd = montarFolhaDados(m);
    expect(fd.bocais[0].obs).toBe('casco @ 800,5mm');
    expect(fd.bocais[0].obs).not.toContain('.');
  });

  it('obs do bocal de tampo traz o nome do tampo e o ângulo (posicaoAxial não se aplica)', () => {
    const m = modeloVazio('V4c');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.bocais = [
      { id: 'N1', doMemorial: false, servico: '', dn: '', diametro: 50, espessura: 6, flange: '', local: 'tampo1', posicaoAxial: '', angulo: 90, projecao: 100 },
      { id: 'N2', doMemorial: false, servico: '', dn: '', diametro: 50, espessura: 6, flange: '', local: 'tampo2', posicaoAxial: '', angulo: '', projecao: 100 },
    ];
    const fd = montarFolhaDados(m);
    expect(fd.bocais[0].obs).toBe('tampo 1 @ 90°');
    expect(fd.bocais[1].obs).toBe('tampo 2'); // sem ângulo informado: só o nome do tampo
  });
});

describe('salvarModelo remove chave de croqui2d obsoleta quando croquis2d===null', () => {
  beforeEach(() => localStorage.clear());

  it('save com croquis, depois save com null → chave nr13_croqui2d_<TAG> some', async () => {
    const m = modeloVazio('V7');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    await salvarModelo('V7', m, { longitudinal: '<svg/>', transversal: '<svg/>', detalheTampo: '<svg/>' }, null);
    expect(localStorage.getItem('nr13_croqui2d_V7')).toBeTruthy();

    await salvarModelo('V7', m, null, null);
    expect(localStorage.getItem('nr13_croqui2d_V7')).toBeNull();
  });

  it('png3d===null NÃO remove um croqui3d salvo anteriormente (mantém captura antiga intencional)', async () => {
    const m = modeloVazio('V8');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    localStorage.setItem('nr13_croqui3d_V8', JSON.stringify('data:image/png;base64,antigo'));
    await salvarModelo('V8', m, null, null);
    expect(localStorage.getItem('nr13_croqui3d_V8')).toBeTruthy();
  });
});
