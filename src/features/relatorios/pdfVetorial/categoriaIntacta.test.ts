/**
 * A SEÇÃO CATEGORIA NR-13 NÃO SEGUE A UNIDADE DO EQUIPAMENTO (16/09/2026).
 *
 * ## A regra, e onde ela começa e termina
 *
 * A unidade escolhida no equipamento vale para a ficha, o cartão, o memorial e
 * o relatório geral. **Não vale para o bloco de Categoria NR-13** — nem para as
 * fórmulas, nem para os campos que a seção exibe ao redor delas.
 *
 * O limite é a SEÇÃO, não só a conta. Em 16/09/2026 a PMTA daquela folha chegou
 * a converter, sob o argumento de que é exibição e não entra no cálculo da
 * categoria: correto sobre a fórmula, errado sobre o limite pedido. Revertido
 * no mesmo dia.
 *
 * Por que o limite é a seção: a folha é lida como um conjunto — PMTA, produto
 * em kPa·m³, produto em MPa·m³ e a matriz classe × grupo, um embaixo do outro.
 * Com a PMTA em bar e os produtos em kPa e MPa, quem confere a categoria teria
 * de converter de cabeça para verificar a conta impressa ao lado.
 *
 * ## O que este arquivo faz
 *
 * Gera o relatório de TRÊS equipamentos idênticos — mesma pressão física, mesmo
 * volume, mesmo fluido — que diferem só na unidade: SI, Técnico e Petrobras. Lê
 * o TEXTO do PDF e exige que a seção de categorização saia **igual nos três**.
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
    blobParaDataUrl: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC',
  };
});

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { montarModeloRelatorio } from './modelo';
import { zerarCacheFontes } from './carlito';
import type { CategoriaSalva, InfoEquipamento } from '../../equipamento/tipos';
import type { SistemaUnidade } from '../../../calc/unidades';

const EQUIPAMENTOS: { tag: string; unidade: SistemaUnidade }[] = [
  { tag: 'ZZ-CAT-SI', unidade: 'SI' },
  { tag: 'ZZ-CAT-TECNICO', unidade: 'TECNICO' },
  { tag: 'ZZ-CAT-PETROBRAS', unidade: 'PETROBRAS' },
];

/** 2,2 MPa × 1,25 m³ — o MESMO equipamento, três vezes. */
const PMTA_MPA = 2.2;

const DOCUMENTOS = ['CAPA.html', 'CLASSIFICACAO-RISCO.html', 'PRONTUARIO.html'];

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function montar(eq: { tag: string; unidade: SistemaUnidade }) {
  const info: InfoEquipamento = {
    tag: eq.tag,
    tipo: 'vaso',
    subtipo: 'vertical',
    descricao: 'DESCRICAO-CAT',
    fabricante: 'FABRICANTE-CAT',
    codigoProjeto: 'PROJ-CAT-ASME',
    pmtaAdotadaMpa: String(PMTA_MPA),
    pthAdotadaMpa: '2.86',
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
    fluidoInput: 'A - Fluido inflamável, combustível (T ≥ 200 °C)',
  };
  gravar(`nr13_info_${eq.tag}`, info);
  gravar(`nr13_cat_${eq.tag}`, categoria);
  gravar(`nr13_emp_${eq.tag}`, { razaoSocial: 'CLIENTE-CAT LTDA' });
  gravar(`nr13_calc_${eq.tag}`, { pmta: '2.33', pth: '3.02', memorialHTML: '', componentes: [] });
  gravar(`nr13_pref_unidade_${eq.tag}`, eq.unidade);
}

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return paginas;
}

/**
 * A folha de CATEGORIZAÇÃO, isolada do resto do documento.
 *
 * Isolar importa: o resto do relatório MUDA de unidade de propósito, e comparar
 * o documento inteiro daria diferença sem dizer onde. O que tem de ser idêntico
 * nos três é esta folha.
 */
function folhaCategorizacao(paginas: string[]): string {
  const p = paginas.find((t) => t.includes('CATEGORIZAÇÃO DE RISCO'));
  if (!p) throw new Error('folha de categorização não encontrada no PDF');
  // Fora o cabeçalho, que traz o nº do relatório (diferente em cada um).
  return p.replace(/^.*?4\. CATEGORIZAÇÃO DE RISCO/s, '');
}

const papel = new Map<SistemaUnidade, string[]>();

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
  for (const eq of EQUIPAMENTOS) montar(eq);
  for (const eq of EQUIPAMENTOS) {
    gravar('nr13_relatorio_meta_atual', {
      codigo: `REL-CAT-${eq.unidade}`,
      emissao: '16/09/2026',
      tipoInspecao: 'Inspeção Periódica',
      documentos: DOCUMENTOS,
    });
    const r = await gerarRelatorioVetorial(eq.tag, { documentos: DOCUMENTOS, certificados: false });
    papel.set(eq.unidade, await textoDoPdf(r.bytes));
  }
}, 180_000);

describe('a folha de categorização sai IDÊNTICA nas três unidades', () => {
  it('o texto inteiro da folha é o mesmo', () => {
    const si = folhaCategorizacao(papel.get('SI')!);
    const tecnico = folhaCategorizacao(papel.get('TECNICO')!);
    const petrobras = folhaCategorizacao(papel.get('PETROBRAS')!);
    expect(tecnico, 'Técnico divergiu de SI na folha de categorização').toBe(si);
    expect(petrobras, 'Petrobras divergiu de SI na folha de categorização').toBe(si);
  });

  it('a PMTA daquela folha continua em kgf/cm² nas três', () => {
    // 2,2 MPa = 22,43 kgf/cm². É o que a folha sempre imprimiu, e continua —
    // mesmo no equipamento em bar, cujo resto do documento sai em bar.
    for (const u of ['SI', 'TECNICO', 'PETROBRAS'] as SistemaUnidade[]) {
      expect(folhaCategorizacao(papel.get(u)!), `${u}`).toContain('22.43 kgf/cm²');
    }
  });

  it('as unidades normativas continuam escritas na folha', () => {
    for (const u of ['SI', 'TECNICO', 'PETROBRAS'] as SistemaUnidade[]) {
      const f = folhaCategorizacao(papel.get(u)!);
      expect(f, `${u}: produto do enquadramento`).toContain('P.V. (KPA × M³)');
      expect(f, `${u}: limite do enquadramento`).toContain('P.V. > 8 (KPA × M³)');
      expect(f, `${u}: produto do grupo de risco`).toContain('P.V. PARA RISCO (MPA × M³)');
    }
  });

  it('os produtos e a categoria são os mesmos nas três', () => {
    for (const u of ['SI', 'TECNICO', 'PETROBRAS'] as SistemaUnidade[]) {
      const f = folhaCategorizacao(papel.get(u)!);
      expect(f, `${u}: produto em kPa·m³`).toContain('2.750');
      expect(f, `${u}: produto em MPa·m³`).toContain('2,75');
      expect(f, `${u}: grupo`).toContain('4');
      expect(f, `${u}: categoria`).toContain('III');
      expect(f, `${u}: classe`).toContain('Classe A');
    }
  });

  it('nenhuma unidade do equipamento vaza para a folha', () => {
    // O equipamento em bar tem o resto do documento em bar. A folha de
    // categorização não pode trazer nem o rótulo nem o valor convertido.
    const f = folhaCategorizacao(papel.get('PETROBRAS')!);
    expect(f, 'o rótulo bar entrou na folha').not.toMatch(/\bbar\b/);
    // 2,2 MPa em bar = 22.00. O número não pode aparecer no lugar do 22.43.
    expect(f).not.toContain('22.00');
  });
});

describe('o resto do documento continua seguindo a unidade — a exceção é só a folha', () => {
  it('a folha de dados técnicos sai em cada unidade', () => {
    const tec = papel.get('TECNICO')!.find((t) => t.includes('ASPECTOS OPERACIONAIS'))!;
    const pet = papel.get('PETROBRAS')!.find((t) => t.includes('ASPECTOS OPERACIONAIS'))!;
    expect(tec).toContain('22.43');
    expect(pet).toContain('22.00');
  });

  it('e o bloco CATEGORIZAÇÃO DO EQUIPAMENTO dessa folha continua normativo', () => {
    // A folha de dados técnicos repete a categorização num bloco no fim. Ele
    // segue a mesma exceção: kPa·m³ e MPa·m³ nas três.
    for (const u of ['SI', 'TECNICO', 'PETROBRAS'] as SistemaUnidade[]) {
      const dados = papel.get(u)!.find((t) => t.includes('CATEGORIZAÇÃO DO EQUIPAMENTO'))!;
      expect(dados, `${u}`).toContain('RELAÇÃO: P (kPa) × V (m³)');
      expect(dados, `${u}`).toContain('RELAÇÃO: P (MPa) × V (m³)');
      expect(dados, `${u}`).toContain('2.750');
      expect(dados, `${u}`).toContain('2,75');
    }
  });
});

describe('o modelo também não converte a PMTA da categorização', () => {
  it('`categorizacaoFolha.pmta` é kgf/cm² em qualquer unidade', () => {
    for (const eq of EQUIPAMENTOS) {
      const m = montarModeloRelatorio(eq.tag);
      expect(m.unidade, 'a fixture perdeu a unidade').toBe(eq.unidade);
      expect(m.categorizacaoFolha.pmta, `${eq.unidade}`).toBe('22.43 kgf/cm²');
      // E os produtos seguem crus, como a categorização os gravou.
      expect(m.categorizacaoDetalhe.pvKpa).toBe('2.750');
      expect(m.categorizacaoDetalhe.pvMpa).toBe('2,75');
    }
  });
});
