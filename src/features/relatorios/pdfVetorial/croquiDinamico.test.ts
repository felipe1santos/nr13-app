/**
 * O CROQUI É PARAMETRIZADO PELA MALHA REAL (21/09/2026 · 2ª rodada).
 *
 * A 1ª rodada já lia os ângulos do dado, mas ninguém tinha provado isso
 * **no PDF**: os testes cobriam `modeloCroqui`, a função pura, e paravam ali.
 * Este arquivo gera o documento de verdade e lê o texto de volta com pdf.js,
 * que é o único lugar onde "o croqui acompanha a malha" pode ser verdade ou
 * mentira.
 *
 * Os casos são os que o usuário pediu para ver: a malha padrão de 4, a de
 * **6 ângulos nos tampos com mais níveis de casco**, e o extremo de 12 — que é
 * o teto que o formulário de campo permite (`MAX_COLUNAS`).
 *
 * E provam também o que a folha NÃO deve ter: nenhum valor de medição. Eles
 * estão na 7.4, uma página antes; repeti-los aqui era o defeito desta rodada.
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

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import { angulosDaRegiao } from '../medicoesEspessura';

const CONTAINER = 'cont-malha';

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

/** Uma leitura plausível, só para o ponto existir. Os valores não saem na folha. */
const leitura = (i: number) => (9 + (i % 7) * 0.03).toFixed(2).replace('.', ',');

/**
 * Monta a malha do jeito que o FORMULÁRIO DE CAMPO a grava.
 *
 * Esta é a lição da 1ª tentativa deste teste, e vale registrar: gravar
 * `nr13_med_grid_<TAG>` com 6 ângulos NÃO muda o documento. A FORMA da grade
 * (quantos pontos, quantos ângulos) vem sempre do CONTAINER —
 * `pontosDoContainer` + `colunasDoContainer` sobre `nr13_injecao_atual.ultrassom`
 * —, e a grade salva só fornece os VALORES, posicionalmente
 * (`montarGrade`). Uma fixture que só grava a grade testa o padrão de 4
 * ângulos achando que testou 6.
 *
 * Então aqui o dado entra como o técnico o produz: `pontos`, `colunas` e
 * `medidas` por ângulo.
 */
function malha(angTampo: number, angCasco: number, niveisCasco: number) {
  const angT = angulosDaRegiao(angTampo);
  const angC = angulosDaRegiao(angCasco);

  const pontos = [
    { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
    ...Array.from({ length: niveisCasco }, (_, i) => ({
      id: `c${i + 1}`,
      rotulo: `Casco ${i + 1}`,
      regiao: 'casco',
    })),
    { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
  ];

  const medidas: Record<string, Record<string, string>> = {};
  const preencher = (id: string, angulos: string[], semente: number) => {
    medidas[id] = {};
    angulos.forEach((a, j) => void (medidas[id][a] = leitura(semente + j)));
  };
  preencher('ts', angT, 0);
  for (let i = 0; i < niveisCasco; i++) preencher(`c${i + 1}`, angC, i + 1);
  preencher('ti', angT, 5);

  return { pontos, colunas: { ts: angTampo, casco: angCasco, ti: angTampo }, medidas, angT, angC };
}

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      t.items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return paginas;
}

interface Caso {
  paginas: string[];
  croqui: string;
  tabela: string;
  grade: ReturnType<typeof malha>;
}

/** Gera o documento AVULSO do ensaio para uma malha e devolve as páginas. */
async function gerarCaso(tag: string, angTampo: number, angCasco: number, niveis: number): Promise<Caso> {
  const grade = malha(angTampo, angCasco, niveis);
  localStorage.clear();
  gravar(`nr13_info_${tag}`, { tag, tipo: 'vaso', descricao: `VASO ${tag}`, numeroSerie: 'S-1' });
  gravar(`nr13_pref_unidade_${tag}`, 'SI');
  // O rodapé das folhas sai do cadastro da empresa — a folha do croqui usa o
  // MESMO rodapé das outras, e é isso que este dado prova.
  gravar('nr13_minha_empresa', { razaoSocial: 'ZZ ENGENHARIA DE ENSAIOS LTDA', cnpj: '11.222.333/0001-44', cidade: 'Vitória', estado: 'ES', telefone: '(27) 3333-4444', email: 'contato@zzengenharia.test' });
  const dados = {
    ultrassom: {
      equipamento: `VASO ${tag}`,
      dataUltrassom: '2026-09-21',
      pontos: grade.pontos,
      colunas: grade.colunas,
      medidas: grade.medidas,
    },
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
  gravar('nr13_relatorio_meta_atual', { containerOrigemId: CONTAINER });

  const r = await gerarRelatorioVetorial(tag, {
    documentos: ['ULTRASSOM.html'],
    certificados: false,
    modo: 'preview',
  });
  const paginas = await textoDoPdf(r.bytes);
  return {
    paginas,
    grade,
    tabela: paginas.find((p) => p.includes('MEDIÇÃO DE ESPESSURA POR ULTRASSOM')) ?? '',
    croqui: paginas.find((p) => p.includes('MAPA DOS PONTOS DE MEDIÇÃO')) ?? '',
  };
}

let c4: Caso;
let c6: Caso;
let c12: Caso;

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
  c4 = await gerarCaso('ZZ-MALHA-4', 4, 4, 4);
  c6 = await gerarCaso('ZZ-MALHA-6', 6, 6, 8);
  c12 = await gerarCaso('ZZ-MALHA-12', 12, 12, 12);
}, 300_000);

describe('a folha do croqui existe em toda malha', () => {
  it.each([
    ['4 ângulos · 4 níveis', () => c4],
    ['6 ângulos · 8 níveis', () => c6],
    ['12 ângulos · 12 níveis', () => c12],
  ])('%s — o croqui sai logo depois da tabela, numa folha só', (_rot, pega) => {
    const c = pega();
    // A tabela 7.4 pode ocupar mais de uma página quando a malha é grande
    // (12 × 12 são 168 células). O croqui vem DEPOIS da última delas.
    const daTabela = c.paginas
      .map((p, i) => (p.includes('MEDIÇÃO DE ESPESSURA POR ULTRASSOM') ? i : -1))
      .filter((i) => i >= 0);
    const doCroqui = c.paginas
      .map((p, i) => (p.includes('MAPA DOS PONTOS DE MEDIÇÃO') ? i : -1))
      .filter((i) => i >= 0);

    expect(daTabela.length).toBeGreaterThan(0);
    // O croqui cabe em UMA folha, seja qual for a malha — é o que a altura
    // dinâmica (`alturaDoCroqui`) precisa garantir. Com 12 × 12 (168 células)
    // a folha 7.4 transborda e continua na página seguinte SEM repetir o
    // banner, então o croqui não é "a página do banner + 1": é a ÚLTIMA.
    expect(doCroqui).toHaveLength(1);
    expect(doCroqui[0]).toBe(c.paginas.length - 1);
    expect(doCroqui[0]).toBeGreaterThan(daTabela[0]);
  });
});

describe('os ÂNGULOS do desenho são os da malha', () => {
  it('malha de 4 desenha 0°, 90°, 180° e 270° — e nenhum outro', () => {
    for (const a of ['0°', '90°', '180°', '270°']) expect(c4.croqui).toContain(a);
    for (const a of ['60°', '120°', '45°', '30°']) expect(c4.croqui).not.toContain(a);
  });

  it('SEIS ângulos nos tampos aparecem no croqui: 0, 60, 120, 180, 240 e 300', () => {
    for (const a of ['0°', '60°', '120°', '180°', '240°', '300°']) expect(c6.croqui).toContain(a);
    // E os da malha de 4 que não existem nesta não podem aparecer.
    expect(c6.croqui).not.toContain('90°');
    expect(c6.croqui).not.toContain('270°');
  });

  it('doze ângulos aparecem todos — inclusive os de 30 em 30', () => {
    for (const a of ['0°', '30°', '60°', '90°', '120°', '150°', '180°', '210°', '240°', '270°', '300°', '330°']) {
      expect(c12.croqui).toContain(a);
    }
  });

  it('o croqui usa exatamente os ângulos que a TABELA imprime', () => {
    // A prova de paridade interna: os dois leem a mesma grade.
    for (const a of c6.grade.angC) {
      expect(c6.tabela).toContain(`${a}°`);
      expect(c6.croqui).toContain(`${a}°`);
    }
  });
});

describe('os NÍVEIS do costado são os da malha', () => {
  it('quatro linhas de casco viram C1..C4, e não existe C5', () => {
    for (const s of ['C1', 'C2', 'C3', 'C4']) expect(c4.croqui).toContain(s);
    expect(c4.croqui).not.toContain('C5');
  });

  it('OITO linhas de casco viram C1..C8', () => {
    for (let i = 1; i <= 8; i++) expect(c6.croqui).toContain(`C${i}`);
    expect(c6.croqui).not.toContain('C9');
  });

  it('doze linhas viram C1..C12', () => {
    for (let i = 1; i <= 12; i++) expect(c12.croqui).toContain(`C${i}`);
  });
});

describe('a folha NÃO repete a folha de medições', () => {
  it('a lista "PONTOS E LEITURAS" saiu', () => {
    for (const c of [c4, c6, c12]) expect(c.croqui).not.toContain('PONTOS E LEITURAS');
  });

  it('nenhum valor de espessura é impresso no croqui', () => {
    for (const c of [c4, c6, c12]) {
      // Os valores existem na tabela, uma página antes — e só lá.
      // O pdf.js devolve o texto na ordem dos glifos e com o kerning entre
      // eles ("9,00" vira "9,0 0"): comparar valor numérico exige tirar os
      // espaços dos dois lados, senão o teste mede o kerning, não o conteúdo.
      const compacto = (s: string) => s.replace(/\s+/g, '');
      const naTabela = compacto(c.paginas.filter((p) => p.includes('MEDIÇÃO DE ESPESSURA')).join(' '));
      const noCroqui = compacto(c.croqui);
      const valores = new Set(Object.values(c.grade.medidas).flatMap((m) => Object.values(m)));
      for (const v of valores) {
        expect(naTabela).toContain(compacto(v));
        expect(noCroqui).not.toContain(compacto(v));
      }
    }
  });

  it('o croqui também não repete a coluna "mm"', () => {
    expect(c6.croqui).not.toContain('não medido');
  });
});

describe('o layout pedido', () => {
  it('as três vistas estão tituladas, tampos e costado separados', () => {
    for (const t of ['TAMPO SUPERIOR (TS)', 'TAMPO INFERIOR (TI)', 'COSTADO — VISTA PLANIFICADA']) {
      expect(c6.croqui).toContain(t);
    }
  });

  it('a folha se identifica sozinha — cabeçalho de equipamento e ensaio', () => {
    for (const t of ['IDENTIFICAÇÃO', 'EQUIPAMENTO', 'TAG', 'ENSAIO', 'DATA']) {
      expect(c6.croqui).toContain(t);
    }
  });

  it('a legenda explica a convenção, em duas linhas', () => {
    expect(c6.croqui).toContain('TS = tampo superior');
    expect(c6.croqui).toContain('níveis do costado');
    expect(c6.croqui).toContain('sem medição (não é zero)');
    // O último item não pode ser engolido pela margem: a 1ª versão emendava
    // os quatro numa linha só e "maior da região" saía cortado no papel.
    expect(c6.croqui).toContain('maior da região');
  });

  it('a folha do croqui usa o MESMO rodapé das outras — dados da empresa', () => {
    for (const c of [c4, c6, c12]) {
      expect(c.croqui).toContain('ZZ ENGENHARIA DE ENSAIOS LTDA');
      // E o mesmo cabeçalho paginado do documento.
      expect(c.croqui).toContain('RELATÓRIO DE INSPEÇÃO DE SEGURANÇA NR-13');
      expect(c.croqui).toMatch(/Página \d+ de \d+/);
    }
  });
});
