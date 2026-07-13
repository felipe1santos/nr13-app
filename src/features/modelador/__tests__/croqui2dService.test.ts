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

function dispositivo(id: string, tipo: 'valvula' | 'manometro') {
  return { id, tipo, fabricante: '', modelo: '', dn: '', ajuste: '', materialCorpo: '', serie: '', local: '' };
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
    // 2 tangências + 2 divisões de virola = 4 linhas de costura (traço-ponto, class="costura")
    // na longitudinal (o detalhe do tampo tem a sua própria; conta só as da longitudinal)
    const costuras = [...c.longitudinal.matchAll(/class="costura"/g)];
    expect(costuras).toHaveLength(4);
  });

  it('modelo sem o campo virolas (salvo antes da migração) → 1 virola, só as 2 tangências', () => {
    const { virolas: _virolas, ...semVirolas } = modeloCompleto();
    const c = gerarCroquis2d(semVirolas as ReturnType<typeof modeloCompleto>)!;
    expect([...c.longitudinal.matchAll(/class="costura"/g)]).toHaveLength(2);
  });

  it('seção parcial hachurada (espessura da parede em corte) nas longitudinais horizontal e vertical', () => {
    const mH = modeloCompleto();
    const cH = gerarCroquis2d(mH)!;
    expect([...cH.longitudinal.matchAll(/class="hachura"/g)].length).toBeGreaterThanOrEqual(3);

    const mV = modeloCompleto();
    mV.orientacao = 'vertical';
    const cV = gerarCroquis2d(mV)!;
    expect([...cV.longitudinal.matchAll(/class="hachura"/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('linhas de extensão (chamada) ligam as cotas à geometria nas longitudinais', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    // Horizontal: Ø (2) + L (2) + Total (2) + 2 cotas axiais de bocal = ≥8 linhas de chamada
    expect([...c.longitudinal.matchAll(/class="cota-ext"/g)].length).toBeGreaterThanOrEqual(8);

    const mV = modeloCompleto();
    mV.orientacao = 'vertical';
    const cV = gerarCroquis2d(mV)!;
    // Vertical: L (2) + Total (2) + 2 chamadas de bocal = ≥6 (Ø fica dentro do vaso, sem chamada)
    expect([...cV.longitudinal.matchAll(/class="cota-ext"/g)].length).toBeGreaterThanOrEqual(6);
  });

  it('transversal e detalhe do tampo hachuram o material seccionado (clipPath por vista)', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    expect(c.transversal).toContain('clipPath id="ht-anel"');
    expect([...c.transversal.matchAll(/class="hachura"/g)].length).toBeGreaterThanOrEqual(5);
    expect(c.detalheTampo).toContain('clipPath id="ht-tampo"');
    expect([...c.detalheTampo.matchAll(/class="hachura"/g)].length).toBeGreaterThanOrEqual(5);
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
    const circulosSolidos = [...c.longitudinal.matchAll(/<circle[^>]*fill="#fff" stroke="#111" stroke-width="2"\/>/g)];
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
    const cotas = [...c.longitudinal.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="14" font-weight="700" text-anchor="middle" fill="#111">N\d+: [\d.]+<tspan/g)];
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
    const cotas = [...c.longitudinal.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="13" font-weight="700" text-anchor="middle" fill="#111">N\d+: [\d.]+<tspan/g)];
    expect(cotas).toHaveLength(4);
    const xs = cotas.map((match) => Number(match[1]));
    expect(new Set(xs).size).toBe(4); // 4 posições x distintas: nenhuma sobreposição
    for (const x of xs) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(420); // VB_W da vista longitudinal vertical
    }
  });

  it('dispositivos de segurança (válvula + manômetro) indicados na longitudinal com ids e símbolo marcado', () => {
    const m = modeloCompleto();
    m.dispositivos = [dispositivo('PSV-1', 'valvula'), dispositivo('PI-1', 'manometro')];
    const c = gerarCroquis2d(m)!;
    expect(c.longitudinal).toContain('PSV-1');
    expect(c.longitudinal).toContain('PI-1');
    expect([...c.longitudinal.matchAll(/<g class="dispositivo">/g)]).toHaveLength(2);
  });

  it('sem dispositivos cadastrados → nenhum símbolo class="dispositivo" no SVG', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    expect(c.longitudinal).not.toContain('class="dispositivo"');
  });

  it('excedente ignorado: 3 válvulas + 3 manômetros → só 2 + 2 símbolos', () => {
    const m = modeloCompleto();
    m.dispositivos = [
      dispositivo('PSV-1', 'valvula'), dispositivo('PSV-2', 'valvula'), dispositivo('PSV-3', 'valvula'),
      dispositivo('PI-1', 'manometro'), dispositivo('PI-2', 'manometro'), dispositivo('PI-3', 'manometro'),
    ];
    const c = gerarCroquis2d(m)!;
    expect([...c.longitudinal.matchAll(/<g class="dispositivo">/g)]).toHaveLength(4);
    expect(c.longitudinal).not.toContain('PSV-3');
    expect(c.longitudinal).not.toContain('PI-3');
  });

  it('id malicioso de dispositivo é escapado na longitudinal (evita quebra de tag/injeção)', () => {
    const m = modeloCompleto();
    m.dispositivos = [dispositivo('PSV<script>&"x\'', 'valvula')];
    const c = gerarCroquis2d(m)!;
    expect(c.longitudinal).toContain('PSV&lt;script&gt;&amp;&quot;x&#39;');
    expect(c.longitudinal).not.toContain('<script>');
  });

  it('símbolos de dispositivos dentro do viewBox nas duas orientações (sem NaN)', () => {
    for (const orientacao of ['horizontal', 'vertical'] as const) {
      const m = modeloCompleto();
      m.orientacao = orientacao;
      m.dispositivos = [dispositivo('PSV-1', 'valvula'), dispositivo('PI-1', 'manometro')];
      const c = gerarCroquis2d(m)!;
      expect(c.longitudinal).not.toMatch(/NaN|undefined|Infinity/);
      const [vbW, vbH] = orientacao === 'horizontal' ? [720, 420] : [420, 720];
      const grupos = [...c.longitudinal.matchAll(/<g class="dispositivo">([\s\S]*?)<\/g>/g)];
      expect(grupos).toHaveLength(2);
      for (const g of grupos) {
        // Atributos x*/y*/cx/cy dos <line>/<circle> do símbolo
        for (const [, attr, val] of g[1].matchAll(/(x1|x2|y1|y2|cx|cy)="(-?[\d.]+)"/g)) {
          const v = Number(val);
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(attr.startsWith('x') || attr === 'cx' ? vbW : vbH);
        }
        // Pares x,y dos <polygon points="...">
        for (const [, pts] of g[1].matchAll(/points="([^"]+)"/g)) {
          for (const par of pts.trim().split(/\s+/)) {
            const [x, y] = par.split(',').map(Number);
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(vbW);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(vbH);
          }
        }
      }
    }
  });

  it('bocal de casco SEM posição axial informada ainda ganha cota (na posição desenhada, L/2)', () => {
    const m = modeloVazio('V7');
    m.diametroInterno = 250; m.comprimentoCilindro = 800; m.espessuraCasco = 4;
    m.tampo1 = { tipo: 'toriesferico', espessura: 4 }; m.tampo2 = { tipo: 'toriesferico', espessura: 4 };
    m.bocais = [
      { id: 'N1', doMemorial: false, servico: '', dn: '', diametro: 25, espessura: 3, flange: '', local: 'casco', posicaoAxial: '', angulo: 0, projecao: 80 },
    ];
    const cH = gerarCroquis2d(m)!;
    expect(cH.longitudinal).toMatch(/>N1: 400<tspan/); // L/2 = 400

    m.orientacao = 'vertical';
    const cV = gerarCroquis2d(m)!;
    expect(cV.longitudinal).toMatch(/>N1: 400<tspan/);
  });
});
