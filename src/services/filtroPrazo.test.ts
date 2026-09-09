import { describe, expect, it } from 'vitest';
import { FILTROS_PRAZO, FILTRO_PRAZO_PADRAO, noFiltroPrazo } from './vencimentos';
import type { FiltroPrazo } from './vencimentos';

/**
 * 08/09/2026 · A RÉGUA DE PRAZO DO DASHBOARD.
 *
 * A regra era inline no JSX do `Dashboard.tsx` — três ternários dentro de um
 * `.filter()` — e por isso nunca teve teste. Ela saiu de lá porque a mudança
 * de "Todos · 5 · 30 · 60 · Vencidos" para "15 · 30 · 60 · 90 · Vencidos" tem
 * uma consequência que não é visual: sem "Todos", a janela mais larga passou a
 * ser 90 dias, e se ela não incluísse o que já venceu, o painel abriria
 * escondendo justamente o que está atrasado.
 *
 * O que este arquivo trava:
 *  - a lista de chips é exatamente a pedida, nessa ordem;
 *  - a janela é cumulativa (15 ⊂ 30 ⊂ 60 ⊂ 90);
 *  - toda janela inclui o vencido;
 *  - "Vencidos" isola só o negativo;
 *  - item sem prazo nunca entra em filtro nenhum.
 */

const item = (dias: number | undefined) => ({ dias });

describe('filtros de prazo do painel', () => {
  it('a régua é exatamente 15 / 30 / 60 / 90 / Vencidos, nessa ordem', () => {
    expect(FILTROS_PRAZO.map(([v]) => v)).toEqual([15, 30, 60, 90, 'vencidos']);
    expect(FILTROS_PRAZO.map(([, r]) => r)).toEqual([
      '15 dias', '30 dias', '60 dias', '90 dias', 'Vencidos',
    ]);
  });

  it('"Todos" e "5 dias" não existem mais', () => {
    const valores = FILTROS_PRAZO.map(([v]) => String(v));
    expect(valores).not.toContain('todos');
    expect(valores).not.toContain('5');
  });

  it('o painel abre na janela mais larga', () => {
    const janelas = FILTROS_PRAZO
      .map(([v]) => v)
      .filter((v): v is Exclude<FiltroPrazo, 'vencidos'> => v !== 'vencidos');
    expect(FILTRO_PRAZO_PADRAO).toBe(Math.max(...janelas));
  });

  // Cada linha: dias restantes → em quais chips a linha aparece.
  const CASOS: Array<{ dias: number; em: FiltroPrazo[] }> = [
    { dias: -120, em: [15, 30, 60, 90, 'vencidos'] },
    { dias: -1, em: [15, 30, 60, 90, 'vencidos'] },
    { dias: 0, em: [15, 30, 60, 90] },       // vence hoje: não é vencido
    { dias: 3, em: [15, 30, 60, 90] },
    { dias: 15, em: [15, 30, 60, 90] },      // a borda é INCLUSIVA
    { dias: 16, em: [30, 60, 90] },
    { dias: 30, em: [30, 60, 90] },
    { dias: 31, em: [60, 90] },
    { dias: 60, em: [60, 90] },
    { dias: 61, em: [90] },
    { dias: 90, em: [90] },
    { dias: 91, em: [] },                     // fora da régua: some do painel
    { dias: 900, em: [] },
  ];

  it.each(CASOS)('vence em $dias dia(s) → aparece em $em', ({ dias, em }) => {
    for (const [filtro] of FILTROS_PRAZO) {
      expect(noFiltroPrazo(item(dias), filtro), `dias=${dias} no filtro ${filtro}`)
        .toBe(em.includes(filtro));
    }
  });

  it('a janela é cumulativa: o que entra na menor entra em todas as maiores', () => {
    for (let dias = -30; dias <= 120; dias++) {
      const entrou = [15, 30, 60, 90].map((f) => noFiltroPrazo(item(dias), f as FiltroPrazo));
      // Uma vez verdadeiro, nunca mais falso ao afrouxar a janela.
      for (let i = 1; i < entrou.length; i++) {
        if (entrou[i - 1]) expect(entrou[i], `dias=${dias}`).toBe(true);
      }
    }
  });

  it('item sem prazo não entra em filtro nenhum', () => {
    for (const [filtro] of FILTROS_PRAZO) {
      expect(noFiltroPrazo(item(undefined), filtro)).toBe(false);
    }
  });

  it('"Vencidos" NÃO traz o que ainda vai vencer', () => {
    expect(noFiltroPrazo(item(0), 'vencidos')).toBe(false);
    expect(noFiltroPrazo(item(1), 'vencidos')).toBe(false);
    expect(noFiltroPrazo(item(-1), 'vencidos')).toBe(true);
  });
});
