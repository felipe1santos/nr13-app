/**
 * PARIDADE DO ULTRASSOM · documento avulso × relatório final (21/09/2026).
 *
 * Gera os DOIS documentos a partir do MESMO dado e lê o texto dos bytes do PDF:
 *
 * 1. a folha 7.4 do avulso é semanticamente idêntica à do relatório — mesmo
 *    equipamento, mesmo ensaio, mesmos pontos, mesmos valores, mesmo
 *    instrumento;
 * 2. os dois trazem a folha 7.4.1 com o croqui, com os mesmos identificadores
 *    de ponto;
 * 3. o PDF é VETORIAL: o texto é extraível por pdf.js, e não uma captura.
 *
 * É o teste que falha se alguém voltar a montar o documento de inspeção por um
 * caminho próprio.
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

const TAG = 'ZZ-US-CROQUI';
const CONTAINER = 'cont-us-1';

/** As folhas do ensaio avulso — o mesmo recorte que `documentoVetorial.ts` usa. */
const FOLHAS_AVULSO = ['ULTRASSOM.html'];
/** Um relatório de verdade, com o ultrassom no meio de outras seções. */
const FOLHAS_RELATORIO = ['CAPA.html', 'SUMARIO.html', 'PLACA.html', 'ULTRASSOM.html', 'CONCLUSAO.html'];

const MEDIDAS = {
  ts: [['9,41', '9,38', '9,45', '9,40']],
  casco: [
    ['8,99', '9,02', '9,00', '8,97'],
    ['8,93', '8,95', '8,90', '8,96'],
    ['9,05', '9,01', '9,03', '9,04'],
    ['8,88', '', '8,91', '8,89'],
  ],
  ti: [['9,30', '9,28', '9,33', '9,31']],
};

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

async function textoDoPdf(bytes: Uint8Array): Promise<{ paginas: string[]; tudo: string }> {
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
  return { paginas, tudo: paginas.join(' \n ') };
}

let avulso: { paginas: string[]; tudo: string };
let relatorio: { paginas: string[]; tudo: string };

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

  localStorage.clear();
  gravar(`nr13_info_${TAG}`, {
    tag: TAG,
    tipo: 'vaso',
    descricao: 'VASO DE PRESSÃO ZZ US',
    numeroSerie: 'SER-US-99',
    fabricante: 'FAB ZZ',
  });
  gravar(`nr13_pref_unidade_${TAG}`, 'SI');
  gravar(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE ZZ US LTDA', cidade: 'Vitória', estado: 'ES' });
  // A grade é a verdade da medição (13D) — a mesma chave que o editor grava.
  gravar(`nr13_med_grid_${TAG}`, {
    containerId: CONTAINER,
    ts: { angulos: ['0', '90', '180', '270'], linhas: MEDIDAS.ts },
    casco: { angulos: ['0', '90', '180', '270'], linhas: MEDIDAS.casco },
    ti: { angulos: ['0', '90', '180', '270'], linhas: MEDIDAS.ti },
  });

  const dadosContainer = {
    ultrassom: {
      equipamento: 'VASO DE PRESSÃO ZZ US',
      serie: 'SER-US-99',
      area: 'COSTADO E TAMPOS',
      // Os nomes são os do FORMULÁRIO de campo (`FormularioUltrassom`), não
      // os do modelo: é o dado real que o técnico grava.
      espNomCasco: '9,50',
      material: 'ASTM A516 Gr.60',
      dataUltrassom: '2026-09-21',
      aparelho: 'DM5E / US-4477',
      acoplante: 'Gel CMC',
      tempSup: '28',
      estadoSup: 'Limpa e escovada',
      cabecote: 'D799 5MHz',
      velSonica: '5920',
      resultado: 'Aprovado',
      instrumento: {
        padrao: 'Bloco padrão V1',
        serie: 'BP-1020',
        certificado: 'LAB-2026-3311',
        validade: '30/06/2027',
      },
    },
  };
  gravar('nr13_inspecao_atual', dadosContainer);
  gravar('nr13_injecao_atual', dadosContainer);

  // O AVULSO: meta quase vazia, com o container de origem — é o que
  // `documentoVetorial.gerarDocumentoDoEnsaio` faz.
  gravar('nr13_relatorio_meta_atual', { containerOrigemId: CONTAINER });
  const a = await gerarRelatorioVetorial(TAG, {
    documentos: FOLHAS_AVULSO,
    certificados: false,
    modo: 'preview',
  });
  avulso = await textoDoPdf(a.bytes);

  // O RELATÓRIO: mesma medição, documento completo.
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-ZZ-US-1',
    containerOrigemId: CONTAINER,
    dataEmissao: '21/09/2026',
  });
  const r = await gerarRelatorioVetorial(TAG, {
    documentos: FOLHAS_RELATORIO,
    certificados: false,
    modo: 'final',
  });
  relatorio = await textoDoPdf(r.bytes);
}, 180_000);

/** A página que contém a tabela 7.4 em cada documento. */
const paginaDaTabela = (d: { paginas: string[] }) =>
  d.paginas.find((p) => p.includes('MEDIÇÃO DE ESPESSURA POR ULTRASSOM')) ?? '';
/** A página do croqui. */
const paginaDoCroqui = (d: { paginas: string[] }) =>
  d.paginas.find((p) => p.includes('MAPA DOS PONTOS DE MEDIÇÃO')) ?? '';

describe('o PDF é vetorial — texto de verdade, não captura de tela', () => {
  it('o pdf.js extrai o texto das duas folhas do avulso', () => {
    expect(avulso.paginas.length).toBeGreaterThanOrEqual(2);
    expect(avulso.tudo.length).toBeGreaterThan(400);
    expect(paginaDaTabela(avulso)).not.toBe('');
    expect(paginaDoCroqui(avulso)).not.toBe('');
  });
});

describe('PARIDADE — os mesmos dados nos dois documentos', () => {
  const campos = [
    'VASO DE PRESSÃO ZZ US',
    'SER-US-99',
    'COSTADO E TAMPOS',
    '9,50',
    'ASTM A516 Gr.60',
    '21/09/2026',
    'DM5E / US-4477',
    'Gel CMC',
    '28',
    'Limpa e escovada',
    'D799 5MHz',
    '5920',
    'Bloco padrão V1',
    'BP-1020',
    'LAB-2026-3311',
    '30/06/2027',
  ];

  it.each(campos)('“%s” aparece na folha 7.4 dos DOIS documentos', (valor) => {
    expect(paginaDaTabela(avulso)).toContain(valor);
    expect(paginaDaTabela(relatorio)).toContain(valor);
  });

  it('todos os valores medidos saem iguais nos dois', () => {
    const medidos = [...MEDIDAS.ts, ...MEDIDAS.casco, ...MEDIDAS.ti].flat().filter((v) => v !== '');
    for (const v of medidos) {
      expect(paginaDaTabela(avulso)).toContain(v);
      expect(paginaDaTabela(relatorio)).toContain(v);
    }
  });

  it('os rótulos das regiões e a estrutura da tabela são os mesmos', () => {
    for (const t of [
      'INFORMAÇÕES DO COMPONENTE AVALIADO',
      'INFORMAÇÕES PARA O ENSAIO',
      'LOCALIZAÇÃO DOS PONTOS DE MEDIÇÃO',
      'INSTRUMENTO DE MEDIÇÃO UTILIZADO',
      'Tampo superior',
      'Casco',
      'Tampo inferior',
      'ESP. MÍN. REQUERIDA',
    ]) {
      expect(paginaDaTabela(avulso)).toContain(t);
      expect(paginaDaTabela(relatorio)).toContain(t);
    }
  });

  it('célula sem medição sai como travessão — nunca 0,00', () => {
    // A quarta região do casco tem o 90° em branco.
    expect(paginaDaTabela(avulso)).toContain('—');
    expect(paginaDaTabela(avulso)).not.toContain('0,00');
    expect(paginaDaTabela(relatorio)).not.toContain('0,00');
  });
});

describe('a folha 7.4.1 — o croqui — existe nos dois e é a mesma', () => {
  it('sai logo DEPOIS da tabela, nos dois documentos', () => {
    for (const d of [avulso, relatorio]) {
      const iTabela = d.paginas.findIndex((p) => p.includes('MEDIÇÃO DE ESPESSURA POR ULTRASSOM'));
      const iCroqui = d.paginas.findIndex((p) => p.includes('MAPA DOS PONTOS DE MEDIÇÃO'));
      expect(iTabela).toBeGreaterThanOrEqual(0);
      expect(iCroqui).toBe(iTabela + 1);
    }
  });

  it('identifica o equipamento e a inspeção — a folha impressa sozinha se explica', () => {
    for (const d of [avulso, relatorio]) {
      const p = paginaDoCroqui(d);
      expect(p).toContain('VASO DE PRESSÃO ZZ US');
      expect(p).toContain(TAG);
      expect(p).toContain('SER-US-99');
      expect(p).toContain('CLIENTE ZZ US LTDA');
      expect(p).toContain('Medição de espessura por ultrassom');
      expect(p).toContain('DM5E / US-4477');
    }
  });

  it('traz as três vistas e os identificadores de ponto do dado', () => {
    for (const d of [avulso, relatorio]) {
      const p = paginaDoCroqui(d);
      expect(p).toContain('TAMPO SUPERIOR');
      expect(p).toContain('COSTADO');
      expect(p).toContain('TAMPO INFERIOR');
      // Quatro regiões de casco no dado → C1..C4 no desenho, e nenhum C5.
      for (const id of ['TS-0', 'C1-0', 'C2-90', 'C3-180', 'C4-270', 'TI-90']) {
        expect(p).toContain(id);
      }
      expect(p).not.toContain('C5-');
    }
  });

  it('o ponto sem leitura aparece como NÃO MEDIDO, e não como zero', () => {
    for (const d of [avulso, relatorio]) {
      expect(paginaDoCroqui(d)).toContain('não medido');
      expect(paginaDoCroqui(d)).not.toContain('0,00 mm');
    }
  });

  it('a legenda explica a convenção dos identificadores', () => {
    const p = paginaDoCroqui(avulso);
    expect(p).toContain('TS = tampo superior');
    expect(p).toContain('ponto vazado');
  });
});

describe('o relatório continua inteiro', () => {
  it('a folha nova não engoliu as outras seções nem a paginação', () => {
    expect(relatorio.tudo).toContain('SUMÁRIO GERAL');
    expect(relatorio.tudo).toContain('7.4.1');
    // O sumário aponta a seção nova.
    expect(relatorio.tudo).toContain('Mapa dos pontos de medição de espessura');
    const ultima = relatorio.paginas[relatorio.paginas.length - 1];
    expect(ultima).toContain(`Página ${relatorio.paginas.length} de ${relatorio.paginas.length}`);
  });
});

/**
 * §24 · os OUTROS ensaios que passaram a sair pelo motor vetorial.
 *
 * O recorte de cada um é a sua própria seção do relatório. O que se prova aqui
 * é que o recorte PRODUZ documento — folha com o banner daquela seção — e que
 * ele não traz de carona seções de outros ensaios.
 */
describe('os demais documentos avulsos saem do mesmo gerador', () => {
  const casos: { ensaio: string; folhas: string[]; banner: RegExp; naoTem: RegExp }[] = [
    {
      ensaio: 'visual_externo',
      folhas: ['VISUAL-EXTERNO.html', 'VISUAL-EXTERNO-FOTOS.html'],
      banner: /EXAME EXTERNO|7\.2/,
      naoTem: /MEDIÇÃO DE ESPESSURA POR ULTRASSOM/,
    },
    {
      ensaio: 'visual_interno',
      folhas: ['VISUAL-INTERNO.html', 'VISUAL-INTERNO-FOTOS.html'],
      banner: /EXAME INTERNO|7\.3/,
      naoTem: /MEDIÇÃO DE ESPESSURA POR ULTRASSOM/,
    },
    {
      ensaio: 'th',
      folhas: ['TESTE-HIDROSTATICO.html', 'TESTE-HIDROSTATICO-FOTOS.html'],
      banner: /TESTE HIDROSTÁTICO|7\.5/,
      naoTem: /MAPA DOS PONTOS/,
    },
    {
      ensaio: 'checklist',
      folhas: ['VERIFICACAO-DOCUMENTACAO.html', 'checklist2.html', 'checklist3.html'],
      banner: /VERIFICAÇÃO DA DOCUMENTAÇÃO|7\.1/,
      naoTem: /MAPA DOS PONTOS/,
    },
  ];

  it.each(casos)('$ensaio produz documento vetorial, só com a sua seção', async ({ folhas, banner, naoTem }) => {
    localStorage.setItem('nr13_relatorio_meta_atual', JSON.stringify({ containerOrigemId: CONTAINER }));
    const r = await gerarRelatorioVetorial(TAG, { documentos: folhas, certificados: false, modo: 'preview' });
    const { tudo } = await textoDoPdf(r.bytes);
    expect(r.paginas).toBeGreaterThan(0);
    expect(tudo).toMatch(banner);
    expect(tudo).not.toMatch(naoTem);
    // Vetorial: o texto é extraível, não é uma imagem da página.
    expect(tudo.length).toBeGreaterThan(200);
  }, 60_000);
});
