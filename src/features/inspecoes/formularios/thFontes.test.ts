import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

import { prefillTH } from './autoPreencher';
import { fluidoEhOperacional, unidadeDoRegistroTh } from './unidadeTh';
import { pressaoDeProjetoMpa } from '../../memorial/pressaoProjeto';
import { numeroDigitado, valorDigitadoNaUnidade, type SistemaUnidade } from '../../../calc/unidades';

/**
 * Revisão do engenheiro (18/09/2026) · de ONDE vem cada pressão do teste
 * hidrostático, e o que não pode voltar a acontecer.
 *
 * | grandeza | fonte |
 * |---|---|
 * | PMTA | `nr13_info_.pmtaAdotadaMpa` ?? `nr13_calc_.pmta` |
 * | PRESSÃO DE PROJETO | `pressaoDeProjetoMpa` — o `P` do MEMORIAL |
 * | PRESSÃO DE TRABALHO | `nr13_info_.pmoAdotadaMpa` |
 * | PRESSÃO DE TESTE | sugerida da PTH adotada ?? calculada; vale a digitada |
 *
 * O formulário pré-preenchia a pressão de PROJETO com a PMTA, e o fluido de
 * TESTE com o fluido de OPERAÇÃO da categoria. Estes testes quebram se
 * qualquer um dos dois voltar.
 */

const TAG = 'ZZ-TH-FONTES';

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

beforeEach(() => {
  localStorage.clear();
  gravar(`nr13_info_${TAG}`, {
    tag: TAG,
    tipo: 'vaso',
    pmtaAdotadaMpa: '2.2',
    pmoAdotadaMpa: '1.75',
    pthAdotadaMpa: '2.86',
  });
  gravar(`nr13_calc_${TAG}`, { pmta: '2.33', pth: '3.02' });
  gravar(`nr13_cat_${TAG}`, { fluidoInput: 'A - Hidrogênio' });
});

describe('PRESSÃO DE PROJETO nunca é a PMTA', () => {
  it('sem memorial, o prefill NÃO traz pressão de projeto nenhuma', () => {
    const p = prefillTH(TAG, 'TECNICO');
    expect(p.pressaoProj).toBeUndefined();
    // e em particular não traz a PMTA (2,2 MPa = 22,43 kgf/cm²) nem a calculada
    expect(Object.values(p)).not.toContain('22.43');
    expect(Object.values(p)).not.toContain('23.76');
  });

  it('com memorial de vaso, é o `P` do memorial, na unidade pedida', () => {
    gravar(`nr13_vaso_${TAG}`, { tag: TAG, P: 1.9, D: 1000, componentes: [] });
    expect(prefillTH(TAG, 'SI').pressaoProj).toBe('1.900');
    expect(prefillTH(TAG, 'TECNICO').pressaoProj).toBe('19.37');
    expect(prefillTH(TAG, 'PETROBRAS').pressaoProj).toBe('19.00');
  });

  it('caldeira e autoclave também têm pressão de projeto (chaves próprias do memorial)', () => {
    gravar(`nr13_vaso_cald_${TAG}`, { tag: TAG, P: '1.2' });
    expect(pressaoDeProjetoMpa(TAG)).toBe(1.2);
    localStorage.clear();
    gravar(`nr13_info_${TAG}`, { tag: TAG, tipo: 'autoclave', subtipo: 'vertical' });
    gravar(`nr13_autoclave_dados_vertical_${TAG}`, { pressao: 0.29 });
    expect(pressaoDeProjetoMpa(TAG)).toBe(0.29);
  });

  it('`P` vazio ou texto não vira pressão de projeto', () => {
    gravar(`nr13_vaso_${TAG}`, { tag: TAG, P: '', componentes: [] });
    expect(pressaoDeProjetoMpa(TAG)).toBeNull();
  });

  it('a fonte do prefill não cita a PMTA na linha da pressão de projeto', () => {
    const src = readFileSync('src/features/inspecoes/formularios/autoPreencher.ts', 'utf8');
    const linha = src.split('\n').find((l) => l.includes("por(saida, 'pressaoProj'"));
    expect(linha, 'a linha do prefill da pressão de projeto sumiu').toBeTruthy();
    expect(linha).not.toMatch(/pmta/i);
    expect(linha).toContain('pressaoDeProjetoMpa');
  });
});

describe('as outras pressões, cada uma da sua fonte e na unidade pedida', () => {
  it('trabalho = PMO adotada; teste = PTH adotada', () => {
    expect(prefillTH(TAG, 'PETROBRAS')).toMatchObject({ pressaoTrabalho: '17.50', pressaoTeste: '28.60' });
    expect(prefillTH(TAG, 'TECNICO')).toMatchObject({ pressaoTrabalho: '17.85', pressaoTeste: '29.16' });
    expect(prefillTH(TAG, 'SI')).toMatchObject({ pressaoTrabalho: '1.750', pressaoTeste: '2.860' });
  });

  it('sem PTH adotada, o teste sugere a calculada', () => {
    gravar(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso' });
    expect(prefillTH(TAG, 'SI').pressaoTeste).toBe('3.020');
  });
});

describe('FLUIDO de teste não é o fluido de operação', () => {
  it('o prefill não traz fluido nenhum', () => {
    expect(prefillTH(TAG, 'SI')).not.toHaveProperty('fluido');
  });

  it('reconhece o valor que o prefill antigo copiava da categoria', () => {
    expect(fluidoEhOperacional('A - Hidrogênio', 'A - Hidrogênio')).toBe(true);
    // o técnico escreveu outra coisa: é informação do teste
    expect(fluidoEhOperacional('Água', 'A - Hidrogênio')).toBe(false);
    // coincidência sem o prefixo de classe NR-13 não é o defeito do prefill
    expect(fluidoEhOperacional('Água', 'Água')).toBe(false);
  });

  it('o formulário não tem mais "Água Potável" como padrão', () => {
    const src = readFileSync('src/features/inspecoes/formularios/FormularioTH.tsx', 'utf8');
    expect(src).not.toMatch(/fluido:\s*'Água Potável'/);
  });
});

describe('unidade do registro de TH', () => {
  it('registro novo → a do equipamento; antigo sem carimbo → kgf/cm²; carimbado → o carimbo', () => {
    expect(unidadeDoRegistroTh(null, 'PETROBRAS')).toBe('PETROBRAS');
    expect(unidadeDoRegistroTh({ pressaoTeste: '10' }, 'PETROBRAS')).toBe('TECNICO');
    expect(unidadeDoRegistroTh({ unidade: 'SI' }, 'PETROBRAS')).toBe('SI');
    expect(unidadeDoRegistroTh({ unidade: 'lixo' }, 'SI')).toBe('TECNICO');
  });
});

describe('valorDigitadoNaUnidade — conversão de apresentação pelo helper oficial', () => {
  const casos: [string, SistemaUnidade, SistemaUnidade, string][] = [
    ['29,16', 'TECNICO', 'PETROBRAS', '28.60'],
    ['29,16', 'TECNICO', 'SI', '2.860'],
    ['29,16', 'TECNICO', 'TECNICO', '29.16'],
    ['28.6', 'PETROBRAS', 'TECNICO', '29.16'],
    ['2.86', 'SI', 'PETROBRAS', '28.60'],
    ['13,7 kgf/cm²', 'TECNICO', 'TECNICO', '13.70'],
  ];
  for (const [v, de, para, esperado] of casos) {
    it(`${v} ${de} → ${para} = ${esperado}`, () => {
      expect(valorDigitadoNaUnidade(v, de, para)).toBe(esperado);
    });
  }

  it('mesma unidade não passa pela conversão (sem arredondamento de ida e volta)', () => {
    expect(valorDigitadoNaUnidade('13.705', 'TECNICO', 'TECNICO')).toBe('13.71');
  });

  it('texto sem número devolve null — quem imprime decide o que fazer', () => {
    expect(valorDigitadoNaUnidade('N/A', 'SI', 'SI')).toBeNull();
    expect(numeroDigitado('')).toBeNull();
  });
});

describe('uma constante de conversão só', () => {
  it('10,19716 não aparece fora de `calc/`', () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
          if (readFileSync(p, 'utf8').includes('10.19716') && !p.replace(/\\/g, '/').startsWith('src/calc/')) {
            achados.push(p);
          }
        }
      }
    };
    varrer('src');
    // modelo.ts e PressoesDocumentacao.tsx são anteriores a esta rodada e estão
    // registrados no plano (§4 · duplicações); o que NÃO pode é aparecer outro.
    expect(achados.map((p) => p.replace(/\\/g, '/')).sort()).toEqual([
      'src/features/equipamento/PressoesDocumentacao.tsx',
      'src/features/relatorios/pdfVetorial/modelo.ts',
    ]);
  });
});
