/**
 * E2E DO PAPEL · o TESTE HIDROSTÁTICO na unidade do equipamento (18/09/2026).
 *
 * Revisão do engenheiro: o TH saía em kgf/cm² qualquer que fosse a unidade
 * escolhida na criação do equipamento — rótulos do formulário fixos, prefill
 * convertido à mão, e no documento três pressões SEM unidade e um gráfico com
 * "kgf/cm²" escrito no código.
 *
 * Este arquivo gera o relatório de TRÊS equipamentos com a MESMA pressão física
 * (SI, Técnico, Petrobras) e lê o TEXTO extraído dos bytes do PDF com pdf.js.
 * Não olha modelo nem canvas: olha o que está impresso.
 *
 * O que ele prova:
 *
 * 1. Toda pressão do TH sai com a unidade do SEU equipamento — campos, eixo do
 *    gráfico, etiqueta da PT, rótulo dos pontos e cabeçalho das leituras.
 * 2. Nenhuma pressão do TH sai com número nu.
 * 3. A PRESSÃO DE PROJETO vem do MEMORIAL, nunca da PMTA.
 * 4. O FLUIDO de teste não é o fluido de operação da categoria.
 * 5. Registro ANTIGO (sem carimbo de unidade, digitado sob "kgf/cm²") é
 *    convertido na apresentação — e nada é regravado.
 * 6. A CATEGORIA NR-13 sai idêntica nos três.
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

vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    blobParaDataUrl: async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC',
  };
});

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import type { CategoriaSalva, InfoEquipamento } from '../../equipamento/tipos';
import type { SistemaUnidade } from '../../../calc/unidades';

const FLUIDO_OPERACAO = 'A - Fluido inflamável, combustível (T ≥ 200 °C)';

/** A MESMA física nos três: projeto 1,9 · PMO 1,75 · PMTA 2,2 · PTH 2,86 MPa. */
const P_PROJETO = 1.9;
const PMO = 1.75;
const PMTA = 2.2;
const PTH = 2.86;

interface Caso {
  tag: string;
  unidade: SistemaUnidade;
  rotulo: string;
  /** O que o técnico DIGITOU no formulário novo, na unidade do equipamento. */
  digitado: { trabalho: string; teste: string; curva: string[] };
  /** O que o documento imprime (formatação do documento, casas por unidade). */
  esperado: { projeto: string; trabalho: string; teste: string; curva: string[] };
}

const CASOS: Caso[] = [
  {
    tag: 'ZZ-TH-SI',
    unidade: 'SI',
    rotulo: 'MPa',
    digitado: { trabalho: '1,75', teste: '2,86', curva: ['0', '1,43', '2,86'] },
    esperado: { projeto: '1.900', trabalho: '1.750', teste: '2.860', curva: ['0.000', '1.430', '2.860'] },
  },
  {
    tag: 'ZZ-TH-TECNICO',
    unidade: 'TECNICO',
    rotulo: 'kgf/cm²',
    digitado: { trabalho: '17,85', teste: '29,16', curva: ['0', '14,58', '29,16'] },
    esperado: { projeto: '19.37', trabalho: '17.85', teste: '29.16', curva: ['0.00', '14.58', '29.16'] },
  },
  {
    tag: 'ZZ-TH-PETROBRAS',
    unidade: 'PETROBRAS',
    rotulo: 'bar',
    digitado: { trabalho: '17,5', teste: '28,6', curva: ['0', '14,3', '28,6'] },
    esperado: { projeto: '19.00', trabalho: '17.50', teste: '28.60', curva: ['0.00', '14.30', '28.60'] },
  },
];

const DOCUMENTOS = [
  'CAPA.html',
  'CLASSIFICACAO-RISCO.html',
  'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html',
  'TESTE-HIDROSTATICO.html',
];

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function equipamento(tag: string, unidade: SistemaUnidade, comMemorial = true) {
  const info: InfoEquipamento = {
    tag,
    tipo: 'vaso',
    subtipo: 'vertical',
    descricao: 'DESCRICAO-TH',
    fabricante: 'FABRICANTE-TH',
    codigoProjeto: 'PROJ-TH',
    pmtaAdotadaMpa: String(PMTA),
    pthAdotadaMpa: String(PTH),
    pmoAdotadaMpa: String(PMO),
  };
  const categoria: CategoriaSalva = {
    classe: 'A',
    grupo: 4,
    PV_cat: '2.7500',
    PV_enq: '2750.0000',
    isEnquadrado: true,
    catFinal: 'III',
    volInput: 1.25,
    presInput: 2.2,
    unidInput: 'SI',
    fluidoInput: FLUIDO_OPERACAO,
  };
  gravar(`nr13_info_${tag}`, info);
  gravar(`nr13_cat_${tag}`, categoria);
  gravar(`nr13_emp_${tag}`, { razaoSocial: 'CLIENTE-TH LTDA' });
  gravar(`nr13_calc_${tag}`, { pmta: '2.33', pth: '3.02', memorialHTML: '', componentes: [] });
  if (comMemorial) {
    gravar(`nr13_vaso_${tag}`, {
      tag,
      P: P_PROJETO,
      D: 1000,
      componentes: [{ id: 'casco', nome: 'Casco Cilíndrico', tipo: 'cilindrico', dados: { mat: 'MAT-TH', ca: '1,6', temp: '120' } }],
    });
  }
  gravar(`nr13_pref_unidade_${tag}`, unidade);
}

async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    // Espaço único: o pdf.js devolve um item por trecho, e o espaçamento entre
    // eles é detalhe de desenho, não de conteúdo.
    paginas.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return paginas;
}

async function gerar(tag: string, th: Record<string, unknown>): Promise<string[]> {
  gravar('nr13_relatorio_meta_atual', {
    codigo: `REL-${tag}`,
    emissao: '18/09/2026',
    tipoInspecao: 'Inspeção Periódica',
    documentos: DOCUMENTOS,
  });
  gravar('nr13_injecao_atual', { th });
  gravar('nr13_inspecao_atual', { th });
  const r = await gerarRelatorioVetorial(tag, { documentos: DOCUMENTOS, certificados: false });
  return paginasDoPdf(r.bytes);
}

/** A folha do TH (7.5) — é nela que as pressões do ensaio são impressas. */
function folhaTh(paginas: string[]): string {
  const p = paginas.find((t) => t.includes('REGISTRO DE TESTE HIDROSTÁTICO'));
  if (!p) throw new Error('folha do teste hidrostático não encontrada no PDF');
  return p;
}

function folhaCategoria(paginas: string[]): string {
  const p = paginas.find((t) => t.includes('CATEGORIZAÇÃO DE RISCO'));
  if (!p) throw new Error('folha de categorização não encontrada no PDF');
  return p.replace(/^.*?4\. CATEGORIZAÇÃO DE RISCO/s, '');
}

const papel = new Map<SistemaUnidade, string[]>();
let papelLegado: string[] = [];
let papelLegadoSemMemorial: string[] = [];
let registroLegadoAntes = '';
let registroLegadoDepois = '';

beforeAll(async () => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });
  class ImagemFalsa {
    naturalWidth = 4;
    naturalHeight = 3;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImagemFalsa);

  localStorage.clear();
  for (const c of CASOS) {
    equipamento(c.tag, c.unidade);
    papel.set(
      c.unidade,
      await gerar(c.tag, {
        // O formulário NOVO carimba a unidade do equipamento.
        unidade: c.unidade,
        dataTeste: '2026-09-18',
        // O técnico deixou o fluido que o prefill antigo copiava da categoria.
        fluido: FLUIDO_OPERACAO,
        pressaoTrabalho: c.digitado.trabalho,
        pressaoTeste: c.digitado.teste,
        curva: c.digitado.curva.map((p, i) => ({ tempo: String(i * 10), pressao: p })),
        resultado: 'aprovado',
      }),
    );
  }

  // Registro ANTIGO: sem carimbo, digitado sob o rótulo fixo "(kgf/cm²)", num
  // equipamento Petrobras. A pressão de projeto dele é a PMTA que o prefill
  // antigo punha no campo (22,43 kgf/cm² = 2,2 MPa).
  const legado = {
    dataTeste: '2026-01-10',
    fluido: 'Água',
    pressaoProj: '22.43',
    pressaoTrabalho: '17.85',
    pressaoTeste: '29.16',
    curva: [{ tempo: '0', pressao: '0' }, { tempo: '10', pressao: '29.16' }],
    resultado: 'aprovado',
  };
  equipamento('ZZ-TH-LEGADO', 'PETROBRAS');
  registroLegadoAntes = JSON.stringify(legado);
  papelLegado = await gerar('ZZ-TH-LEGADO', legado);
  registroLegadoDepois = localStorage.getItem('nr13_injecao_atual') ?? '';

  equipamento('ZZ-TH-LEGADO-SEM-MEMORIAL', 'PETROBRAS', false);
  papelLegadoSemMemorial = await gerar('ZZ-TH-LEGADO-SEM-MEMORIAL', legado);
}, 240_000);

describe('o TH sai na unidade do SEU equipamento', () => {
  for (const c of CASOS) {
    it(`${c.unidade}: as três pressões com unidade no rótulo e o valor certo`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      expect(th).toContain(`PRESSÃO DE PROJETO (${c.rotulo}) ${c.esperado.projeto}`);
      expect(th).toContain(`PRESSÃO DE TRABALHO (${c.rotulo}) ${c.esperado.trabalho}`);
      expect(th).toContain(`PRESSÃO DE TESTE (${c.rotulo}) ${c.esperado.teste}`);
    });

    it(`${c.unidade}: gráfico e tabela de leituras na mesma unidade e com os mesmos números`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      expect(th).toContain(`Pressão (${c.rotulo})`);
      expect(th).toContain(`PT: ${c.esperado.teste} ${c.rotulo}`);
      expect(th).toContain(`PRESSÃO (${c.rotulo})`);
      expect(th).toContain('TEMPO (min)');
      for (const v of c.esperado.curva.slice(1)) {
        // o rótulo do ponto no gráfico…
        expect(th).toContain(`${v} ${c.rotulo}`);
        // …e a linha da tabela
        expect(th).toMatch(new RegExp(`\\b\\d+ ${v.replace('.', '\\.')}\\b`));
      }
    });

    it(`${c.unidade}: nenhuma unidade de OUTRO sistema na folha do TH`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      for (const outro of ['MPa', 'kgf/cm²', 'bar'].filter((u) => u !== c.rotulo)) {
        expect(th, `"${outro}" apareceu no TH de um equipamento ${c.unidade}`).not.toMatch(
          new RegExp(`(^|[\\s(])${outro.replace('/', '\\/')}($|[\\s)])`),
        );
      }
    });

    it(`${c.unidade}: nenhuma pressão do TH com número nu`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      expect(th).not.toMatch(/PRESSÃO DE (PROJETO|TRABALHO|TESTE)\s+-?\d/);
    });

    it(`${c.unidade}: a pressão de PROJETO é a do memorial, não a PMTA`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      const pmtaNaUnidade = { SI: '2.200', TECNICO: '22.43', PETROBRAS: '22.00' }[c.unidade];
      expect(th).not.toContain(`PRESSÃO DE PROJETO (${c.rotulo}) ${pmtaNaUnidade}`);
    });

    it(`${c.unidade}: o fluido de OPERAÇÃO não é impresso como fluido de teste`, () => {
      const th = folhaTh(papel.get(c.unidade)!);
      expect(th).not.toContain('Fluido inflamável');
    });
  }
});

describe('registro ANTIGO (sem carimbo) — convertido na apresentação, nunca regravado', () => {
  it('29,16 kgf/cm² num equipamento Petrobras sai 28.60 bar', () => {
    const th = folhaTh(papelLegado);
    expect(th).toContain('PRESSÃO DE TESTE (bar) 28.60');
    expect(th).toContain('PRESSÃO DE TRABALHO (bar) 17.50');
    expect(th).toContain('PT: 28.60 bar');
  });

  it('com memorial, a pressão de projeto é a do memorial (19.00 bar), não a PMTA do prefill antigo', () => {
    expect(folhaTh(papelLegado)).toContain('PRESSÃO DE PROJETO (bar) 19.00');
  });

  it('SEM memorial, a PMTA que o prefill antigo pôs no campo NÃO vira pressão de projeto', () => {
    const th = folhaTh(papelLegadoSemMemorial);
    expect(th).not.toContain('PRESSÃO DE PROJETO (bar) 22.00');
    expect(th).not.toContain('22.43');
    expect(th).toMatch(/PRESSÃO DE PROJETO \(bar\) —/);
  });

  it('o registro do container não foi tocado pela geração', () => {
    expect(JSON.parse(registroLegadoDepois).th).toEqual(JSON.parse(registroLegadoAntes));
  });
});

describe('a CATEGORIA NR-13 não se move', () => {
  it('a folha de categorização é idêntica nos três relatórios', () => {
    const [si, tec, pb] = CASOS.map((c) => folhaCategoria(papel.get(c.unidade)!));
    expect(tec).toBe(si);
    expect(pb).toBe(si);
    // Os rótulos da folha saem em caixa alta ("KPA × M³").
    expect(si).toMatch(/KPA × M³/i);
    expect(si).toMatch(/MPA × M³/i);
    expect(si).toContain('22.43 kgf/cm²');
  });
});

describe('nada de lixo no papel', () => {
  for (const c of CASOS) {
    it(`${c.unidade}: sem NaN, undefined ou [object Object]`, () => {
      const tudo = papel.get(c.unidade)!.join('\n');
      expect(tudo).not.toMatch(/NaN|undefined|\[object Object\]/);
    });
  }
});
