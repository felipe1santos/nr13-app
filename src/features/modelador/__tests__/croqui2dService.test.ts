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
});
