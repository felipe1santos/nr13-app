import { describe, expect, it } from 'vitest';
import { gerarCroquis2d } from '../croqui2dService';
import { modeloVazio } from '../modeladorService';

function modeloCompleto() {
  const m = modeloVazio('V1');
  m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
  m.tampo1 = { tipo: 'toriesferico', espessura: 10 }; m.tampo2 = { tipo: 'eliptico', espessura: 10 };
  m.bocais = [
    { id: 'N1', doMemorial: false, servico: 'Inspeção', dn: '4"', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 800, angulo: 0, projecao: 150 },
    { id: 'N2', doMemorial: false, servico: 'Dreno', dn: '1"', diametro: 25, espessura: 4, flange: '', local: 'casco', posicaoAxial: 1500, angulo: 90, projecao: 100 },
  ];
  return m;
}

describe('gerarCroquis2d', () => {
  it('modelo incompleto → null', () => {
    expect(gerarCroquis2d(modeloVazio('X'))).toBeNull();
  });
  it('gera 3 SVGs bem formados, sem NaN/undefined, com ids dos bocais', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    for (const svg of [c.longitudinal, c.transversal, c.detalheTampo]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(c.longitudinal).toContain('N1');
    expect(c.transversal).toContain('N2');
  });
  it('coordenadas dentro do viewBox (nenhum atributo numérico negativo)', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    const negativos = [...c.longitudinal.matchAll(/(?:x|y|cx|cy|x1|y1|x2|y2)="(-\d[\d.]*)"/g)];
    expect(negativos).toEqual([]);
  });
  it('detalhe do toriesférico anota Rc e rc; cotas com valores pt-BR', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    expect(c.detalheTampo).toContain('Rc');
    expect(c.detalheTampo).toContain('rc');
    expect(c.detalheTampo).toContain('Toriesf');
  });
  it('circunferência anotada na transversal', () => {
    expect(gerarCroquis2d(modeloCompleto())!.transversal).toMatch(/Circunf/);
  });

  it('escapa id de bocal com caracteres especiais nos 3 SVGs (evita quebra de tag/injeção de markup)', () => {
    const m = modeloCompleto();
    const idPerigoso = 'N<2&"x\'';
    m.bocais = [
      { id: idPerigoso, doMemorial: false, servico: '', dn: '', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 800, angulo: 0, projecao: 150 },
    ];
    const c = gerarCroquis2d(m)!;
    const escapado = 'N&lt;2&amp;&quot;x&#39;';
    for (const svg of [c.longitudinal, c.transversal]) {
      expect(svg).toContain(escapado);
      expect(svg).not.toContain('N<2');
      expect(svg).not.toContain('"x\'');
    }
  });

  it('virolas > 1 → costuras circunferenciais intermediárias (tangências + divisões)', () => {
    const m = modeloCompleto();
    m.virolas = 3;
    const c = gerarCroquis2d(m)!;
    // 2 tangências + 2 divisões de virola = 4 linhas de costura tracejadas na longitudinal
    // (o detalhe do tampo tem a sua própria; conta só as da longitudinal)
    const costuras = [...c.longitudinal.matchAll(/stroke-dasharray="8,3"/g)];
    expect(costuras).toHaveLength(4);
  });

  it('modelo sem o campo virolas (salvo antes da migração) → 1 virola, só as 2 tangências', () => {
    const m = modeloCompleto() as Record<string, unknown>;
    delete m.virolas;
    const c = gerarCroquis2d(m as ReturnType<typeof modeloCompleto>)!;
    expect([...c.longitudinal.matchAll(/stroke-dasharray="8,3"/g)]).toHaveLength(2);
  });

  it('bocal de frente (90°) vira círculo sólido na face; de trás (270°) vira tracejado — horizontal', () => {
    const m = modeloCompleto();
    m.bocais = [
      { id: 'NF', doMemorial: false, servico: '', dn: '', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 500, angulo: 90, projecao: 100 },
      { id: 'NT', doMemorial: false, servico: '', dn: '', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 1500, angulo: 270, projecao: 100 },
    ];
    const c = gerarCroquis2d(m)!;
    const circulosTracejados = [...c.longitudinal.matchAll(/<circle[^>]*stroke-dasharray="5,3"/g)];
    expect(circulosTracejados).toHaveLength(1);
    const circulosSolidos = [...c.longitudinal.matchAll(/<circle[^>]*fill="#fff" stroke="#111" stroke-width="1"\/>/g)];
    expect(circulosSolidos.length).toBeGreaterThanOrEqual(1);
  });

  it('transversal: anel de parede (2 círculos), cota diagonal Ø, arco de ângulo e callout t=', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    const circulos = [...c.transversal.matchAll(/<circle cx="180(?:\.\d)?" cy="174(?:\.\d)?" r="[\d.]+"/g)];
    expect(circulos.length).toBeGreaterThanOrEqual(2); // externo + interno
    expect(c.transversal).toContain(`Ø1.000`);
    expect(c.transversal).toContain('90°'); // arco do N2 + marca de compasso
    expect(c.transversal).toMatch(/t=10/);
  });

  it('longitudinal: bocais flangeados (pescoço+flange = 2 polígonos por bocal de topo)', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    expect([...c.longitudinal.matchAll(/<polygon/g)].length).toBeGreaterThanOrEqual(2);
    expect(c.longitudinal).toMatch(/t=10/); // callout de espessura do casco
  });

  it('detalhe do tampo em corte tem parede dupla (path interno) para todos os tipos curvos', () => {
    for (const tipo of ['eliptico', 'toriesferico', 'hemisferico'] as const) {
      const m = modeloCompleto();
      m.tampo1 = { tipo, espessura: 10 };
      const c = gerarCroquis2d(m)!;
      const paths = [...c.detalheTampo.matchAll(/<path d="M/g)];
      expect(paths.length).toBeGreaterThanOrEqual(2); // externo + interno
      expect(c.detalheTampo).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('tampo plano também gera as 3 vistas sem NaN', () => {
    const m = modeloCompleto();
    m.tampo1 = { tipo: 'plano', espessura: 12 };
    m.tampo2 = { tipo: 'plano', espessura: 12 };
    const c = gerarCroquis2d(m)!;
    for (const svg of [c.longitudinal, c.transversal, c.detalheTampo]) {
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(c.detalheTampo).toContain('Plano');
  });

  it('vaso vertical com suporte saia e bocais nos tampos gera SVG válido', () => {
    const m = modeloCompleto();
    m.orientacao = 'vertical';
    m.suporte = { tipo: 'saia', altura: 400, quantidade: '' };
    m.bocais.push(
      { id: 'T1', doMemorial: false, servico: '', dn: '', diametro: 80, espessura: 6, flange: '', local: 'tampo1', posicaoAxial: '', angulo: 0, projecao: 100 },
      { id: 'T2', doMemorial: false, servico: '', dn: '', diametro: 80, espessura: 6, flange: '', local: 'tampo2', posicaoAxial: '', angulo: 180, projecao: 100 },
    );
    const c = gerarCroquis2d(m)!;
    expect(c.longitudinal).toContain('T1');
    expect(c.longitudinal).toContain('T2');
    expect(c.longitudinal).not.toMatch(/NaN|undefined|Infinity/);
    const negativos = [...c.longitudinal.matchAll(/(?:x|y|cx|cy|x1|y1|x2|y2)="(-\d[\d.]*)"/g)];
    expect(negativos).toEqual([]);
  });

  it('cotas de posição axial de múltiplos bocais no casco escalonam (não sobrepõem) e ficam dentro do viewBox — horizontal', () => {
    const m = modeloVazio('V5');
    m.diametroInterno = 300; m.comprimentoCilindro = 3000; m.espessuraCasco = 6;
    m.tampo1 = { tipo: 'eliptico', espessura: 6 }; m.tampo2 = { tipo: 'eliptico', espessura: 6 };
    m.bocais = [0, 1, 2, 3].map((i) => ({
      id: `N${i + 1}`, doMemorial: false, servico: '', dn: '', diametro: 50, espessura: 4, flange: '',
      local: 'casco' as const, posicaoAxial: 400 + i * 600, angulo: 0, projecao: 100,
    }));
    const c = gerarCroquis2d(m)!;
    const cotas = [...c.longitudinal.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="9" font-weight="700" text-anchor="middle" fill="#111">N\d+: [\d.]+<\/text>/g)];
    expect(cotas).toHaveLength(4);
    const ys = cotas.map((match) => Number(match[1]));
    expect(new Set(ys).size).toBe(4); // 4 alturas distintas: nenhuma sobreposição
    for (const y of ys) {
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(420); // VB_H da vista longitudinal horizontal
    }
  });

  it('cotas de posição axial de múltiplos bocais no casco escalonam (não sobrepõem) e ficam dentro do viewBox — vertical', () => {
    const m = modeloVazio('V6');
    m.orientacao = 'vertical';
    m.diametroInterno = 300; m.comprimentoCilindro = 3000; m.espessuraCasco = 6;
    m.tampo1 = { tipo: 'eliptico', espessura: 6 }; m.tampo2 = { tipo: 'eliptico', espessura: 6 };
    m.bocais = [0, 1, 2, 3].map((i) => ({
      id: `N${i + 1}`, doMemorial: false, servico: '', dn: '', diametro: 50, espessura: 4, flange: '',
      local: 'casco' as const, posicaoAxial: 400 + i * 600, angulo: 0, projecao: 100,
    }));
    const c = gerarCroquis2d(m)!;
    const cotas = [...c.longitudinal.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="9" font-weight="700" text-anchor="middle" fill="#111">N\d+: [\d.]+<\/text>/g)];
    expect(cotas).toHaveLength(4);
    const xs = cotas.map((match) => Number(match[1]));
    expect(new Set(xs).size).toBe(4); // 4 posições x distintas: nenhuma sobreposição
    for (const x of xs) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(420); // VB_W da vista longitudinal vertical
    }
  });
});
