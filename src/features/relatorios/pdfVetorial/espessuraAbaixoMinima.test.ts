/**
 * MENOR VALOR MEDIDO ≠ ABAIXO DA ESPESSURA MÍNIMA (21/10/2026).
 *
 * A queixa do cliente, nas palavras dele: "a legenda indica que os pontos
 * marcados em vermelho são 'menor/abaixo da mínima'. Porém a espessura medida
 * é 4,61 mm e a mínima é 4,01 mm. Então não está abaixo da mínima."
 *
 * A causa: `destaqueDaMedida` marcava a menor leitura da região como `menor`,
 * e a tabela 7.4, o mapa 7.4.1 e a grade do prontuário pintavam `menor` com o
 * vermelho. A legenda do mapa juntava as duas coisas numa frase só.
 *
 * Agora são três classificações e UMA regra: `abaixo` (leitura < requerida,
 * vermelho), `menor` (comparação entre pontos, âmbar) e `maior`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { abaixoDaRequerida, destaqueDaMedida, extremosDaRegiao } from './destaqueMedida';
import { modeloCroqui, type LinhaMedicao } from './croquiEspessura';
import { corDeFundo } from './documento';
import { COR } from './documentoA4';
import { requeridaDoMemorial, requeridaMmDoMemorial } from './modelo';
import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';

const linha = (regiao: string, regiaoId: 'ts' | 'casco' | 'ti', medidas: string[], requerida: string | null, requeridaMm?: number | null): LinhaMedicao => ({
  regiao,
  regiaoId,
  ponto: regiao,
  angulos: ['0', '90', '180', '270'],
  medidas,
  menor: null,
  requerida,
  ...(requeridaMm === undefined ? {} : { requeridaMm }),
});

describe('os três casos do cliente — comparação numérica com a mínima', () => {
  it('CASO 1 · 4,61 medido contra 4,01 de mínima NÃO está abaixo', () => {
    expect(abaixoDaRequerida('4,61', '4,01')).toBe(false);
    // É o menor da região — e continua sendo só isso.
    const { maior, menor } = extremosDaRegiao([{ medidas: ['4,61', '4,70', '4,82', '4,75'] }]);
    expect(destaqueDaMedida('4,61', maior, menor, '4,01').destaque).toBe('menor');
  });

  it('CASO 2 · 4,01 igual à mínima 4,01 NÃO está abaixo', () => {
    expect(abaixoDaRequerida('4,01', '4,01')).toBe(false);
    expect(abaixoDaRequerida('4,01', 4.01)).toBe(false);
    const { maior, menor } = extremosDaRegiao([{ medidas: ['4,01', '4,70'] }]);
    expect(destaqueDaMedida('4,01', maior, menor, '4,01').destaque).toBe('menor');
  });

  it('CASO 3 · 3,99 contra 4,01 está ABAIXO — e isso vence o "menor da região"', () => {
    expect(abaixoDaRequerida('3,99', '4,01')).toBe(true);
    const { maior, menor } = extremosDaRegiao([{ medidas: ['3,99', '4,70', '4,82'] }]);
    expect(menor).toBe(3.99);
    expect(destaqueDaMedida('3,99', maior, menor, '4,01').destaque).toBe('abaixo');
  });

  it('a screenshot: 6,47 é o menor, a mínima está bem abaixo — nada é crítico', () => {
    const l = linha('Tampo Inferior', 'ti', ['6,47', '6,48', '6,47', '6,47'], '4,9');
    const m = modeloCroqui([l, linha('Tampo Inferior', 'ti', ['6,47', '6,50', '6,47', '6,48'], '4,9')]);
    expect(m.pontos.some((p) => p.critico)).toBe(false);
    expect(m.pontos.some((p) => p.destaque === 'abaixo')).toBe(false);
    expect(m.pontos.filter((p) => p.destaque === 'menor').every((p) => p.valor === '6,47')).toBe(true);
  });

  it('sem requerida não existe "abaixo" — não se inventa reprovação', () => {
    const { maior, menor } = extremosDaRegiao([{ medidas: ['3,00', '4,00'] }]);
    expect(destaqueDaMedida('3,00', maior, menor).destaque).toBe('menor');
    expect(destaqueDaMedida('3,00', maior, menor, null).destaque).toBe('menor');
  });
});

describe('arredondamento — decide o valor técnico, não o texto exibido', () => {
  it('mínima real 4,954, exibida 4,95: leitura 4,952 está ABAIXO', () => {
    // Comparar com o texto "4,95" aprovaria a leitura; o cálculo a reprova.
    expect(abaixoDaRequerida('4,952', '4,95')).toBe(false);
    expect(abaixoDaRequerida('4,952', 4.954)).toBe(true);
    expect(abaixoDaRequerida('4,955', 4.954)).toBe(false);
  });

  it('o memorial entrega a requerida crua, ao lado do texto', () => {
    const comps = [
      { nome: 'Tampo Superior', tReqMm: 4.95437 },
      { nome: 'Casco Cilíndrico', tReqMm: 10.2 },
      { nome: 'Tampo Inferior', tReqMm: 4.01 },
    ];
    expect(requeridaDoMemorial(comps)).toEqual({ ts: '4,954', casco: '10,2', ti: '4,01' });
    expect(requeridaMmDoMemorial(comps)).toEqual({ ts: 4.95437, casco: 10.2, ti: 4.01 });
  });

  it('o mapa usa a requerida numérica quando ela existe', () => {
    const l = linha('Tampo Superior', 'ts', ['4,9541', '5,10', '5,20', '5,30'], '4,954', 4.95437);
    const m = modeloCroqui([l]);
    expect(m.pontos.find((p) => p.angulo === 0)?.critico).toBe(true);
    // Documento antigo, sem `requeridaMm`: vale o texto.
    const antigo = modeloCroqui([linha('Tampo Superior', 'ts', ['4,9541', '5,10', '5,20', '5,30'], '4,954')]);
    expect(antigo.pontos.find((p) => p.angulo === 0)?.critico).toBe(false);
  });
});

describe('tabela × mapa — a mesma leitura, a mesma classificação', () => {
  it('em casco, tampo superior e tampo inferior', () => {
    const linhas = [
      linha('Tampo Superior', 'ts', ['4,61', '4,70', '4,82', '4,75'], '4,01', 4.01),
      linha('Casco', 'casco', ['8,10', '7,95', '8,20', '8,05'], '6,0', 6.0),
      linha('Casco', 'casco', ['5,50', '8,00', '8,10', '8,02'], '6,0', 6.0),
      linha('Tampo Inferior', 'ti', ['4,01', '4,30', '3,99', '4,40'], '4,01', 4.01),
    ];
    const m = modeloCroqui(linhas);
    // A tabela 7.4 calcula os extremos por região, com a requerida da linha.
    const porRegiao = new Map<string, LinhaMedicao[]>();
    for (const l of linhas) porRegiao.set(l.regiao, [...(porRegiao.get(l.regiao) ?? []), l]);
    let i = 0;
    for (const l of linhas) {
      const { maior, menor } = extremosDaRegiao(porRegiao.get(l.regiao)!);
      for (const v of l.medidas) {
        const daTabela = destaqueDaMedida(v, maior, menor, l.requeridaMm ?? l.requerida).destaque ?? null;
        const doMapa = m.pontos[i++];
        expect(doMapa.destaque).toBe(daTabela);
        expect(doMapa.critico).toBe(daTabela === 'abaixo');
      }
    }
    const criticos = m.pontos.filter((p) => p.critico).map((p) => p.id);
    // TS: 4,61 é o menor e está acima → não crítico. Casco: 5,50 < 6,0 → crítico.
    // TI: 3,99 < 4,01 → crítico; 4,01 = 4,01 → não.
    expect(criticos).toEqual(['C2-0', 'TI-180']);
    expect(m.pontos.find((p) => p.id === 'TS-0')?.destaque).toBe('menor');
    expect(m.pontos.find((p) => p.id === 'TI-0')?.destaque).toBeNull();
  });

  it('as cores: menor é âmbar, abaixo é vermelho — nunca a mesma', () => {
    for (const modo of ['preview', 'final'] as const) {
      expect(corDeFundo({ texto: '4,61', valor: true, destaque: 'menor' }, modo)).toBe(COR.fundoRealceSuave);
      expect(corDeFundo({ texto: '3,99', valor: true, destaque: 'abaixo' }, modo)).toBe('#fbe4e4');
    }
  });
});

// ── O DOCUMENTO DE VERDADE — tela (prévia) e PDF final ──────────────────────

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return paginas;
}

async function mapa(tag: string, ti: string[], modo: 'preview' | 'final'): Promise<string> {
  localStorage.clear();
  gravar(`nr13_info_${tag}`, { tag, tipo: 'vaso', descricao: `VASO ${tag}`, numeroSerie: 'S-1' });
  gravar(`nr13_pref_unidade_${tag}`, 'SI');
  gravar(`nr13_calc_${tag}`, {
    pmta: 1,
    componentes: [
      { nome: 'Tampo Superior', tReqMm: 4.01 },
      { nome: 'Casco Cilíndrico', tReqMm: 4.01 },
      { nome: 'Tampo Inferior', tReqMm: 4.01 },
    ],
  });
  const ang = ['0', '90', '180', '270'];
  const dados = {
    ultrassom: {
      equipamento: `VASO ${tag}`,
      dataUltrassom: '2026-10-21',
      pontos: [
        { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
        { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
        { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
      ],
      colunas: { ts: 4, casco: 4, ti: 4 },
      medidas: {
        ts: Object.fromEntries(ang.map((a, i) => [a, ['4,70', '4,75', '4,80', '4,72'][i]])),
        c1: Object.fromEntries(ang.map((a, i) => [a, ['4,90', '4,95', '4,88', '4,92'][i]])),
        ti: Object.fromEntries(ang.map((a, i) => [a, ti[i]])),
      },
    },
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
  gravar('nr13_relatorio_meta_atual', { containerOrigemId: 'cont-espessura' });
  const r = await gerarRelatorioVetorial(tag, { documentos: ['ULTRASSOM.html'], certificados: false, modo });
  const paginas = await textoDoPdf(r.bytes);
  return paginas.find((p) => p.includes('MAPA DOS PONTOS DE MEDIÇÃO')) ?? '';
}

describe('a legenda do mapa no documento — prévia e PDF final', () => {
  beforeAll(() => {
    zerarCacheFontes();
    vi.stubGlobal('fetch', async (url: string) => {
      const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    });
  });

  it.each(['preview', 'final'] as const)('%s · menor 4,61 acima de 4,01: sem legenda de "abaixo"', async (modo) => {
    const t = await mapa('ZZ-ESP-ACIMA', ['4,61', '4,70', '4,82', '4,75'], modo);
    expect(t).toContain('menor valor medido');
    expect(t).not.toContain('abaixo da espessura mínima');
    expect(t).not.toContain('menor / abaixo da mínima');
  }, 120_000);

  it.each(['preview', 'final'] as const)('%s · menor 4,01 igual à mínima: sem legenda de "abaixo"', async (modo) => {
    const t = await mapa('ZZ-ESP-IGUAL', ['4,01', '4,70', '4,82', '4,75'], modo);
    expect(t).toContain('menor valor medido');
    expect(t).not.toContain('abaixo da espessura mínima');
  }, 120_000);

  it.each(['preview', 'final'] as const)('%s · 3,99 abaixo de 4,01: a legenda de "abaixo" aparece', async (modo) => {
    const t = await mapa('ZZ-ESP-ABAIXO', ['3,99', '4,70', '4,82', '4,75'], modo);
    expect(t).toContain('abaixo da espessura mínima requerida');
    expect(t).toContain('menor valor medido');
  }, 120_000);
});
