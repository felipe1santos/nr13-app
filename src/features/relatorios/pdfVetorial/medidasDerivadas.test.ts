import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { montarModeloProntuario } from './modeloProntuario';
import { COLUNAS_DIMENSAO, rotulosDimensoes } from '../../prontuarios/rotulosDimensoes';

const TAG = 'VP-DIM';

/**
 * O DEFEITO QUE ESTES GATES SEGURAM (10/09/2026).
 *
 * A seção "4. CROQUI 2D COTADO E DIMENSÕES" do prontuário imprimia, num
 * documento assinado por engenheiro:
 *
 * ```
 * pesos              {"vazioKg":417.62295507194204,"cheioDaguaKg":1417.56…}
 * circunferenciaMm   1610.694553495487
 * bocais             []
 * geradoEm           07/09/2026
 * ```
 *
 * JSON cru, chave em camelCase e float com doze casas. A causa era o TIPO:
 * `folhaDados: Record<string, string | null>`, preenchido com `JSON.stringify`
 * em tudo que não fosse texto — com um saco de strings, a folha não tinha o
 * que renderizar além de chave e valor.
 */
beforeEach(() => localStorage.clear());

function semear(folhaDados: unknown, extras: Record<string, unknown> = {}) {
  localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'vaso', ...extras }));
  localStorage.setItem(`nr13_folha_dados_${TAG}`, JSON.stringify(folhaDados));
}

describe('as medidas derivadas do modelo saem legíveis, não em JSON', () => {
  it('os pesos viram valores com unidade, uma casa decimal', () => {
    semear({
      pesos: {
        vazioKg: 417.62295507194204,
        cheioDaguaKg: 1417.5657167707932,
        operacaoKg: 900,
        densidade: 7850,
        notaSuporte: false,
      },
    });
    const m = montarModeloProntuario(TAG);
    expect(m.folhaDados.pesoVazio).toBe('417,6 kg');
    expect(m.folhaDados.pesoCheio).toBe('1.417,6 kg');
    expect(m.folhaDados.pesoOperacao).toBe('900 kg');
  });

  it('a circunferência perde as doze casas que a medida não tem', () => {
    semear({ circunferenciaMm: 1610.694553495487, comprimentoTotalMm: 5176 });
    const m = montarModeloProntuario(TAG);
    expect(m.folhaDados.circunferencia).toBe('1.610,7 mm');
    expect(m.folhaDados.comprimentoTotal).toBe('5.176 mm');
  });

  it('as dimensões viram uma linha de texto por componente', () => {
    semear({
      dimensoes: [
        { componente: 'Casco cilíndrico', texto: 'Casco cilíndrico — Ø500 mm × 4.926 mm, t=6,35 mm' },
        { componente: 'Tampo 1', texto: 'Tampo 1 (Elíptico 2:1) — Ø500 t=6,35 h=125' },
      ],
    });
    const m = montarModeloProntuario(TAG);
    expect(m.folhaDados.dimensoes).toEqual([
      'Casco cilíndrico — Ø500 mm × 4.926 mm, t=6,35 mm',
      'Tampo 1 (Elíptico 2:1) — Ø500 t=6,35 h=125',
    ]);
  });

  it('o bocal vira linha de tabela, com o local por extenso', () => {
    semear({
      bocais: [
        {
          id: 'B1',
          servico: 'Entrada de ar',
          dn: '2"',
          flange: '150#',
          local: 'casco',
          diametroMm: 60.3,
          espessuraMm: 3.9,
          posicaoAxialMm: 1200,
          anguloGraus: 90,
        },
      ],
    });
    const b = montarModeloProntuario(TAG).folhaDados.bocais[0];
    expect(b).toEqual({
      tag: 'B1',
      servico: 'Entrada de ar',
      dn: '2"',
      diametroEspessura: 'Ø60,3 × 3,9',
      flange: '150#',
      local: 'Casco',
      posicao: '1.200 mm',
      angulo: '90°',
    });
  });

  it('bocal sem medida não inventa número — mostra travessão', () => {
    semear({ bocais: [{ id: 'B2', servico: 'Dreno' }] });
    const b = montarModeloProntuario(TAG).folhaDados.bocais[0];
    expect(b.diametroEspessura).toBe('—');
    expect(b.posicao).toBe('—');
    expect(b.angulo).toBe('—');
    expect(b.local).toBe('—');
  });

  it('a orientação sai capitalizada, não em minúscula de payload', () => {
    semear({ orientacao: 'horizontal' });
    expect(montarModeloProntuario(TAG).folhaDados.orientacao).toBe('Horizontal');
  });

  it('a nota do suporte acompanha o peso — pés e selas não entram na conta', () => {
    semear({ pesos: { vazioKg: 100, notaSuporte: true } });
    expect(montarModeloProntuario(TAG).folhaDados.notaSuporte).toBe(true);
  });

  it('sem a chave do modelo, tudo é nulo e nada é inventado', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'vaso' }));
    const fd = montarModeloProntuario(TAG).folhaDados;
    expect(fd.comprimentoTotal).toBeNull();
    expect(fd.circunferencia).toBeNull();
    expect(fd.dimensoes).toEqual([]);
    expect(fd.bocais).toEqual([]);
  });
});

describe('a tabela de dimensões diz a unidade e o nome certo do campo', () => {
  it('os valores numéricos saem em pt-BR', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'vaso' }));
    localStorage.setItem(
      `nr13_prontuario_${TAG}`,
      JSON.stringify({ dimensoes: [{ modelo: 'ZZ-A2', diametro: '500', espCorpo: '6.35', volume: '1000' }] }),
    );
    const d = montarModeloProntuario(TAG).dimensoes[0];
    expect(d.espCorpo).toBe('6,35');
    expect(d.diametro).toBe('500');
    expect(d.volume).toBe('1.000');
  });

  it('texto livre no campo passa intacto, em vez de virar travessão', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'vaso' }));
    localStorage.setItem(
      `nr13_prontuario_${TAG}`,
      JSON.stringify({ dimensoes: [{ modelo: 'X', altura: 's/ tampo', comprimento: '2 × 500' }] }),
    );
    const d = montarModeloProntuario(TAG).dimensoes[0];
    expect(d.altura).toBe('s/ tampo');
    expect(d.comprimento).toBe('2 × 500');
  });

  it('numa aquatubular a última coluna é produção de vapor, não volume', () => {
    // O cabeçalho fixo do vetorial imprimia kg/h sob a palavra VOLUME.
    expect(rotulosDimensoes('caldeira', 'aquatubular').volume).toBe('Prod. Vapor (kg/h)');
    expect(rotulosDimensoes('caldeira', 'flamotubular').volume).toBe("Volume d'água (L)");
    expect(rotulosDimensoes('vaso', '').volume).toBe('Volume (L)');
  });

  it('todo rótulo de medida declara a unidade', () => {
    for (const tipo of ['vaso', 'caldeira', 'autoclave']) {
      const r = rotulosDimensoes(tipo, '');
      for (const c of COLUNAS_DIMENSAO) {
        if (c === 'modelo') continue;
        expect(`${tipo}.${c}: ${r[c]}`).toMatch(/\((mm|L|kg\/h)\)$/);
      }
    }
  });

  it('o subtipo chega ao modelo — sem ele os rótulos seriam os do vaso', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'caldeira', subtipo: 'aquatubular' }));
    const m = montarModeloProntuario(TAG);
    expect(m.tipoEquipamento).toBe('caldeira');
    expect(m.subtipo).toBe('aquatubular');
  });
});

describe('as regras ficam no código, não só no comentário', () => {
  /**
   * Estes gates procuram o defeito no CÓDIGO, e por isso a prosa sai antes.
   *
   * Os dois comentários que explicam o conserto citam `JSON.stringify` e
   * `geradoEm` — é o que torna o comentário útil para quem chega depois. Sem
   * tirar os blocos `/* *\/`, o gate acusaria a própria explicação do conserto
   * e obrigaria a apagá-la para ficar verde.
   */
  const semProsa = (caminho: string) =>
    readFileSync(caminho, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  const modelo = semProsa('src/features/relatorios/pdfVetorial/modeloProntuario.ts');
  const folha = semProsa('src/features/relatorios/pdfVetorial/folhasProntuario.ts');
  const form = readFileSync('src/pages/Prontuarios.tsx', 'utf8');

  it('o modelo do prontuário NUNCA despeja estrutura com JSON.stringify', () => {
    // Foi exatamente assim que o JSON cru chegou ao papel.
    expect(modelo).not.toContain('JSON.stringify');
  });

  it('o formulário e a folha leem os rótulos do MESMO módulo', () => {
    expect(form).toContain("from '../features/prontuarios/rotulosDimensoes'");
    expect(folha).toContain("from '../../prontuarios/rotulosDimensoes'");
    // Uma cópia local dos rótulos dentro da tela é como as unidades sumiram do
    // documento: o .tsx não é importável pela folha (a suíte roda em node).
    expect(form).not.toContain('function getLabelsDimensoes');
  });

  it('o cabeçalho da tabela sai dos rótulos, não de uma lista fixa', () => {
    expect(folha).toContain('cabecalho: COLUNAS_DIMENSAO.map((c) => r[c]');
    expect(folha).not.toContain("cabecalho: ['MODELO', 'Ø', 'ALTURA'");
  });

  it('o carimbo interno do payload não vai para o documento', () => {
    // `geradoEm` é quando o payload foi calculado, não uma medida do
    // equipamento — e a folha já traz a data de emissão no cabeçalho.
    expect(folha).not.toContain('geradoEm');
  });
});
