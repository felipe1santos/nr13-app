import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

import { ehPmtaDoPreenchimentoAntigo, pressoesDoProntuario } from './pressoesProntuario';

/**
 * Revisão do engenheiro, fase 2 · o prontuário preenchia "Pressão de projeto" e
 * "Pressão máx. de operação" com a PMTA calculada. Estes testes quebram se isso
 * voltar.
 */

const TAG = 'ZZ-PRONT';
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const INFO = { pmtaAdotadaMpa: '2.2', pmoAdotadaMpa: '1.75', pthAdotadaMpa: '2.86' };
const CALC = { pmta: '2.83', pth: '3.68' };

beforeEach(() => localStorage.clear());

describe('pressão de projeto vem do memorial, por tipo de equipamento', () => {
  it('vaso — nr13_vaso_.P', () => {
    gravar(`nr13_vaso_${TAG}`, { P: 1.9, componentes: [] });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'SI').pressaoProjeto).toBe('1.90 MPa');
  });

  it('caldeira — nr13_vaso_cald_.P', () => {
    gravar(`nr13_vaso_cald_${TAG}`, { P: 1.2 });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'PETROBRAS').pressaoProjeto).toBe('12.00 bar');
  });

  it('autoclave cilíndrica — corpo do autoclave; vertical — dados do subtipo', () => {
    gravar(`nr13_vaso_ac_corpo_${TAG}`, { P: 0.5, componentes: [] });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'TECNICO').pressaoProjeto).toBe('5.10 kgf/cm²');
    localStorage.clear();
    gravar(`nr13_info_${TAG}`, { tipo: 'autoclave', subtipo: 'vertical' });
    gravar(`nr13_autoclave_dados_vertical_${TAG}`, { pressao: 0.29 });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'SI').pressaoProjeto).toBe('0.29 MPa');
  });

  it('sem memorial, fica VAZIA — nunca a PMTA', () => {
    const p = pressoesDoProntuario(TAG, INFO, CALC, 'PETROBRAS');
    expect(p.pressaoProjeto).toBe('');
    expect(p.pressaoProjeto).not.toBe(p.pmta);
  });
});

describe('cada grandeza da sua fonte, na unidade do equipamento', () => {
  it('SI / Técnico / Petrobras', () => {
    gravar(`nr13_vaso_${TAG}`, { P: 1.9, componentes: [] });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'SI')).toMatchObject({
      pressaoProjeto: '1.90 MPa', pressaoMaxOp: '1.75 MPa', pmta: '2.20 MPa', pressaoTH: '2.86 MPa',
    });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'TECNICO')).toMatchObject({
      pressaoProjeto: '19.37 kgf/cm²', pressaoMaxOp: '17.85 kgf/cm²', pmta: '22.43 kgf/cm²', pressaoTH: '29.16 kgf/cm²',
    });
    expect(pressoesDoProntuario(TAG, INFO, CALC, 'PETROBRAS')).toMatchObject({
      pressaoProjeto: '19.00 bar', pressaoMaxOp: '17.50 bar', pmta: '22.00 bar', pressaoTH: '28.60 bar',
    });
  });

  it('PMO sem valor adotado fica vazia (não vira PMTA)', () => {
    expect(pressoesDoProntuario(TAG, { pmtaAdotadaMpa: '2.2' }, CALC, 'SI').pressaoMaxOp).toBe('');
  });

  it('PMTA e PTH: adotada vence calculada; sem adotada, a calculada', () => {
    expect(pressoesDoProntuario(TAG, {}, CALC, 'SI')).toMatchObject({ pmta: '2.83 MPa', pressaoTH: '3.68 MPa' });
  });
});

describe('rascunho antigo com a PMTA no campo errado', () => {
  it('o texto do preenchimento antigo é reconhecido e não vence o novo', () => {
    const p = pressoesDoProntuario(TAG, INFO, CALC, 'PETROBRAS');
    expect(p.legadoPmtaComoProjeto).toBe('28.30 bar');
    expect(ehPmtaDoPreenchimentoAntigo('pressaoProjeto', '28.30 bar', p)).toBe(true);
    expect(ehPmtaDoPreenchimentoAntigo('pressaoMaxOp', '28.30 bar', p)).toBe(true);
    // digitado pelo usuário: vence
    expect(ehPmtaDoPreenchimentoAntigo('pressaoProjeto', '20 bar', p)).toBe(false);
    // a PMTA no campo PMTA continua sendo PMTA
    expect(ehPmtaDoPreenchimentoAntigo('pmta', '28.30 bar', p)).toBe(false);
  });
});

describe('a tela não volta a usar a PMTA', () => {
  it('Prontuarios.tsx não preenche pressão de projeto/operação com pmta', () => {
    const src = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
    expect(src).not.toMatch(/pb\('pressaoProjeto',[^\n]*pmta/i);
    expect(src).not.toMatch(/pb\('pressaoMaxOp',[^\n]*pmta/i);
    expect(src).toContain("pb('pressaoProjeto', pressoes.pressaoProjeto)");
  });
});
