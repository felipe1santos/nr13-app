/**
 * PARIDADE DOS DEMAIS ENSAIOS · avulso × relatório (22/09/2026).
 *
 * `paridadeUltrassom.test.ts` já provava, campo a campo e nos bytes do PDF, que
 * o documento avulso do ULTRASSOM é semanticamente idêntico à seção 7.4 do
 * relatório. Os outros quatro ensaios tinham só a prova ESTRUTURAL
 * (`documentoVetorial.test.ts`: cada um recorta seções reais do relatório, pela
 * mesma tabela `DOCS_POR_FORMULARIO`) — o que garante a fiação, não o conteúdo.
 *
 * Esta é a dívida que eu mesmo declarei na rodada do croqui, quitada aqui:
 * **checklist, visual externo, visual interno e teste hidrostático**.
 *
 * O método é o do ultrassom: gera os DOIS documentos a partir do MESMO dado de
 * container e lê o texto de volta com pdf.js. Nada de comparar o modelo em
 * memória — o que importa é o que sai impresso.
 *
 * O que se compara é SEMÂNTICA, não layout: os valores que o técnico digitou, a
 * identificação do equipamento e os cabeçalhos da seção. A paginação e o número
 * do relatório mudam de propósito (o avulso não tem relatório), e por isso não
 * entram na comparação.
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
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from '../../inspecoes/tipos';

const TAG = 'ZZ-PARIDADE';
const CONTAINER = 'cont-paridade';

/** As folhas do relatório COMPLETO — o ensaio no meio de outras seções. */
const FOLHAS_RELATORIO = [
  'CAPA.html',
  'SUMARIO.html',
  'PLACA.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  'checklist2.html',
  'checklist3.html',
  'FOTOS-DOCUMENTACAO.html',
  'CHECKLIST-FOTOS.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-EXTERNO-FOTOS.html',
  'VISUAL-INTERNO.html',
  'VISUAL-INTERNO-FOTOS.html',
  'TESTE-HIDROSTATICO.html',
  'TESTE-HIDROSTATICO-FOTOS.html',
  'CONCLUSAO.html',
];

/**
 * O dado de campo — um container com os quatro ensaios preenchidos.
 *
 * Os nomes dos campos são os do FORMULÁRIO (o que o técnico grava), não os do
 * modelo: é o dado real que passa pelas duas gerações.
 */
const DADOS = {
  // O checklist grava `respostas`/`observacoes` por ID de pergunta, e as
  // marcações do quadro 7.1.1 em `instrumentos`.
  checklist: {
    inspetor: 'INSPETOR-ZZ',
    instrumentos: { 'inst-man': true, 'inst-man-cal': true, 'inst-psv': true, 'inst-psv-cal': true },
    respostas: { 'v51-prontuario': 'sim' },
    observacoes: { 'v51-prontuario': 'PRONTUARIO-ZZ-CONFERIDO' },
  },
  // Os exames visuais gravam `itens`/`itemObs` com a POSIÇÃO no catálogo como
  // chave ("1", "2"…), não o texto da pergunta. Errar isso foi o que fez a 1ª
  // versão deste teste procurar valores que nunca chegaram ao papel.
  visual_externo: {
    serie: 'SER-PAR-77',
    itens: { '1': 'sim', '2': 'nao' },
    itemObs: { '1': 'CORROSAO-EXTERNA-ZZ-1' },
    observacoes: 'OBS-GERAL-EXTERNO-ZZ',
    semanticaNc: 1,
    resultado: 'reprovado',
  },
  visual_interno: {
    serie: 'SER-PAR-77',
    itens: { '1': 'nao', '2': 'nao' },
    itemObs: { '1': 'COSTADO-INTERNO-ZZ-OK' },
    observacoes: 'OBS-GERAL-INTERNO-ZZ',
    semanticaNc: 1,
    resultado: 'aprovado',
  },
  th: {
    cliente: 'CLIENTE ZZ PARIDADE LTDA',
    equipamento: 'VASO ZZ PARIDADE',
    pressaoTeste: '13,70',
    pressaoProj: '10,50',
    pressaoTrabalho: '9,48',
    unidade: 'TECNICO',
    duracao: '60 min.',
    tempFluido: '22',
    fluido: 'Água potável',
    normas: 'ASME VIII Div.1 / NR-13',
    dataTeste: '2026-09-22',
    resultado: 'aprovado',
    curva: [
      { tempo: '0', pressao: '0,00' },
      { tempo: '1', pressao: '4,00' },
      { tempo: '2', pressao: '9,00' },
    ],
  },
};

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(
      t.items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return out;
}

function semear() {
  localStorage.clear();
  gravar(`nr13_info_${TAG}`, {
    tag: TAG,
    tipo: 'vaso',
    descricao: 'VASO ZZ PARIDADE',
    numeroSerie: 'SER-PAR-77',
    fabricante: 'FAB ZZ',
  });
  gravar(`nr13_pref_unidade_${TAG}`, 'TECNICO');
  gravar(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE ZZ PARIDADE LTDA', cidade: 'Vitória', estado: 'ES' });
  gravar(`nr13_calc_${TAG}`, { pmta: 1.2, pth: 1.56 });
  gravar('nr13_minha_empresa', { razaoSocial: 'ZZ ENGENHARIA PARIDADE LTDA' });
  gravar('nr13_inspecao_atual', DADOS);
  gravar('nr13_injecao_atual', DADOS);
}

/** O documento AVULSO daquele ensaio — o recorte que a tela de Inspeções usa. */
async function avulso(formulario: FormularioEnsaio): Promise<string[]> {
  semear();
  gravar('nr13_relatorio_meta_atual', { containerOrigemId: CONTAINER });
  const r = await gerarRelatorioVetorial(TAG, {
    documentos: DOCS_POR_FORMULARIO[formulario],
    certificados: false,
    modo: 'preview',
  });
  return textoDoPdf(r.bytes);
}

let relatorio: string[];
const docs: Partial<Record<FormularioEnsaio, string[]>> = {};

const ENSAIOS: FormularioEnsaio[] = ['checklist', 'visual_externo', 'visual_interno', 'th'];

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

  for (const e of ENSAIOS) docs[e] = await avulso(e);

  semear();
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-ZZ-PARIDADE',
    containerOrigemId: CONTAINER,
    dataEmissao: '22/09/2026',
  });
  const r = await gerarRelatorioVetorial(TAG, {
    documentos: FOLHAS_RELATORIO,
    certificados: false,
    modo: 'final',
  });
  relatorio = await textoDoPdf(r.bytes);
}, 300_000);

const juntar = (p: string[]) => p.join(' \n ');
const compacto = (s: string) => s.replace(/\s+/g, '');

/**
 * Os valores que o técnico digitou e que PRECISAM aparecer nos dois documentos.
 *
 * São o teste de "mesma fonte de dados": se o avulso lesse de outro lugar (ou
 * montasse a folha por um caminho próprio), algum destes não sairia igual.
 */
const ESPERADO: Record<FormularioEnsaio, string[]> = {
  checklist: ['PRONTUARIO-ZZ-CONFERIDO'],
  visual_externo: ['CORROSAO-EXTERNA-ZZ-1', 'OBS-GERAL-EXTERNO-ZZ', 'SER-PAR-77'],
  visual_interno: ['COSTADO-INTERNO-ZZ-OK', 'OBS-GERAL-INTERNO-ZZ', 'SER-PAR-77'],
  // `13,70` foi DIGITADO com vírgula e sai `13.70` no papel — o documento
  // normaliza o decimal. O que importa aqui é que os dois normalizam IGUAL.
  th: ['13.70', '10.50', '9.48', 'ASME VIII Div.1 / NR-13', 'Água potável', 'CLIENTE ZZ PARIDADE LTDA'],
  ultrassom: [],
  manometro: [],
  psv: [],
};

/** Cabeçalhos que identificam a seção daquele ensaio nos dois documentos. */
const CABECALHOS: Record<FormularioEnsaio, string[]> = {
  checklist: ['VERIFICAÇÃO DA DOCUMENTAÇÃO'],
  visual_externo: ['EXAME EXTERNO', 'FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?'],
  visual_interno: ['EXAME INTERNO', 'FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?'],
  th: ['REGISTRO DE TESTE HIDROSTÁTICO'],
  ultrassom: [],
  manometro: [],
  psv: [],
};

describe.each(ENSAIOS)('%s — o avulso e o relatório dizem a mesma coisa', (ensaio) => {
  it('o documento avulso existe e é VETORIAL (texto extraível)', () => {
    const p = docs[ensaio]!;
    expect(p.length).toBeGreaterThan(0);
    expect(juntar(p).length).toBeGreaterThan(200);
  });

  it('a seção aparece nos DOIS documentos', () => {
    for (const c of CABECALHOS[ensaio]) {
      expect(juntar(docs[ensaio]!)).toContain(c);
      expect(juntar(relatorio)).toContain(c);
    }
  });

  it.each(ESPERADO[ensaio])('“%s” sai igual nos dois', (valor) => {
    expect(compacto(juntar(docs[ensaio]!))).toContain(compacto(valor));
    expect(compacto(juntar(relatorio))).toContain(compacto(valor));
  });

  it('nada de lixo no papel', () => {
    for (const lixo of ['NaN', 'undefined', '[object Object]']) {
      expect(juntar(docs[ensaio]!)).not.toContain(lixo);
    }
  });
});

describe('o avulso é um RECORTE do relatório, não outro documento', () => {
  it('cada ensaio traz só as folhas dele', () => {
    // O avulso do TH não pode trazer o exame externo, e vice-versa: se
    // trouxesse, a composição teria deixado de ser o recorte.
    expect(juntar(docs.th!)).not.toContain('EXAME EXTERNO');
    expect(juntar(docs.visual_externo!)).not.toContain('REGISTRO DE TESTE HIDROSTÁTICO');
    expect(juntar(docs.visual_interno!)).not.toContain('REGISTRO DE TESTE HIDROSTÁTICO');
    expect(juntar(docs.checklist!)).not.toContain('REGISTRO DE TESTE HIDROSTÁTICO');
  });

  it('nenhum avulso traz a capa nem o sumário do relatório', () => {
    for (const e of ENSAIOS) {
      expect(juntar(docs[e]!)).not.toContain('SUMÁRIO GERAL');
    }
  });

  it('o relatório completo traz TODAS as seções dos quatro', () => {
    const tudo = juntar(relatorio);
    for (const e of ENSAIOS) {
      for (const c of CABECALHOS[e]) expect(tudo).toContain(c);
    }
  });
});

describe('o TH do avulso segue a unidade do equipamento, como no relatório', () => {
  it('equipamento TECNICO: kgf/cm² nos dois, e nenhuma outra unidade', () => {
    for (const p of [juntar(docs.th!), juntar(relatorio)]) {
      const i = p.indexOf('REGISTRO DE TESTE HIDROSTÁTICO');
      const folha = p.slice(i, i + 2500);
      expect(folha).toContain('kgf/cm²');
      expect(folha).not.toContain('MPa');
    }
  });
});
