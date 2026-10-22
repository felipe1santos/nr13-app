/**
 * NÃO REGRESSÃO POR TIPO DE EQUIPAMENTO (21/10/2026).
 *
 * O Ensaio de Acumulação e o relatório de caldeira flamotubular valem SÓ para
 * caldeira. Vaso e autoclave não podem mudar um byte. Este teste gera o
 * relatório vetorial de cada tipo — composição completa, composição vazia
 * ("tudo") e o documento avulso de cada ensaio, em prévia e em final — e compara
 * um hash NORMALIZADO com o baseline gravado ANTES de qualquer mudança
 * (commit 20f682a).
 *
 * Normalizar = tirar do PDF o que muda a cada execução sem mudar o documento:
 * `/CreationDate`, `/ModDate` e `/ID`. O relógio é fixo, então datas impressas
 * no corpo também são as mesmas.
 *
 * Caldeira entra no baseline com o gerador ANTIGO; quando o gerador próprio de
 * caldeira existir (Rodada 2), as entradas `caldeira:*` passam a ser checadas
 * contra o seu próprio baseline novo, e a prova de que o PDF de caldeira JÁ
 * EMITIDO não muda é outra (o arquivo arquivado é servido pelos bytes,
 * §7-quater) — ver `caldeiraEmitidaIntacta.test.ts`.
 *
 * Gravar o baseline: `NR13_GRAVAR_BASELINE=1 npx vitest run naoRegressaoTipos`.
 *
 * REGRAVADO EM 22/10/2026 (vaso e autoclave) pela troca da citação da NR-13 para
 * a redação de 2022 — mudança DECIDIDA, que vale para todo tipo. Conferido antes
 * por diff palavra a palavra do texto extraído (pdfjs) das composições completa,
 * vazia e checklist (vaso, autoclave e caldeira), em prévia e final: mesmas páginas, e as ÚNICAS diferenças eram a
 * portaria (1.082/2018 → 1.846/2022 alterada pela 4.219/2022), os subitens
 * (13.5.1.2 → 13.5.1.1/Tabela 1; 13.5.1.8 → 13.5.1.7; "item" → "subitem"), a
 * saída da "Portaria Mtb nº 3.214" e "Profissional Habilitado" → "Profissional
 * Legalmente Habilitado" (e "profissional habilitado" → "profissional legalmente habilitado (PLH)" no checklist). Das entradas de caldeira, só `caldeira:checklist:*` foi regravada; `caldeira:completo/vazio` seguem as do gerador antigo.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

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

const ARQUIVO_BASELINE = resolve(process.cwd(), 'src/features/relatorios/pdfVetorial/__baseline__/naoRegressaoTipos.json');
const GRAVAR = process.env.NR13_GRAVAR_BASELINE === '1';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

const COMPLETO = [
  'CAPA.html',
  'SUMARIO.html',
  'PLACA.html',
  'CLASSIFICACAO-RISCO.html',
  'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html',
  'MEMORIAL.html',
  'INSPECOES.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  'checklist2.html',
  'checklist3.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-EXTERNO-FOTOS.html',
  'VISUAL-INTERNO.html',
  'VISUAL-INTERNO-FOTOS.html',
  'CONCLUSAO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
  'LIVRO-REGISTRO.html',
];

/** As composições medidas: o relatório inteiro, o "tudo" e o avulso de cada ensaio. */
const COMPOSICOES: Record<string, string[]> = {
  completo: COMPLETO,
  vazio: [],
  checklist: ['VERIFICACAO-DOCUMENTACAO.html', 'checklist2.html', 'checklist3.html', 'FOTOS-DOCUMENTACAO.html', 'CHECKLIST-FOTOS.html'],
  visualExterno: ['VISUAL-EXTERNO.html', 'VISUAL-EXTERNO-FOTOS.html'],
  visualInterno: ['VISUAL-INTERNO.html', 'VISUAL-INTERNO-FOTOS.html'],
  ultrassom: ['ULTRASSOM.html'],
  th: ['TESTE-HIDROSTATICO.html', 'TESTE-HIDROSTATICO-FOTOS.html'],
};

type Tipo = 'vaso' | 'autoclave' | 'caldeira';

function montar(tipo: Tipo, tag: string): void {
  localStorage.clear();
  gravar(`nr13_info_${tag}`, {
    tag,
    tipo,
    subtipo: tipo === 'vaso' ? '' : tipo === 'autoclave' ? 'cilindrica' : 'flamotubular',
    descricao: `EQUIPAMENTO ${tipo.toUpperCase()}`,
    fabricante: 'FABRICANTE-BASE',
    ano: '2011',
    numeroSerie: 'SERIE-BASE',
    codigoProjeto: tipo === 'caldeira' ? 'ASME Seção I' : 'ASME Seção VIII Div. 1',
    edicao: '2010',
    adenda: '---',
    localizacao: 'CONTÊINER',
    pmtaAdotadaMpa: '1.10',
    pmoAdotadaMpa: '0.99',
    pthAdotadaMpa: tipo === 'caldeira' ? '1.65' : '1.43',
  });
  gravar(`nr13_pref_unidade_${tag}`, 'SI');
  gravar(`nr13_emp_${tag}`, {
    razaoSocial: 'CLIENTE-BASE LTDA',
    cnpj: '00.000.000/0001-00',
    endereco: 'RUA BASE, 1',
    cidade: 'MACAÉ',
    estado: 'RJ',
  });
  gravar(`nr13_cat_${tag}`, {
    classe: 'C', grupo: 4, PV_cat: '1.0', PV_enq: '1000.0', isEnquadrado: true, catFinal: 'IV',
    volInput: 1, presInput: 1, unidInput: 'SI', fluidoInput: 'C - Vapor de água',
  });
  gravar(`nr13_calc_${tag}`, {
    pmta: '1.10',
    pth: tipo === 'caldeira' ? '1.65' : '1.43',
    memorialHTML: '',
    componentes: [
      { nome: 'Casco Cilíndrico', pmtaMpa: 1.1, tReqMm: 9.256, tNom: 10.24, E: 0.9, S: 108, D: 1510, raio: 755, ca: 0.75, material: 'SA-516 Gr.65', formulaT: 't = P·D/(2·S·E+2·y·P)+C', formulaP: 'PMTA = P' },
    ],
  });
  if (tipo === 'caldeira') {
    gravar(`nr13_vaso_cald_${tag}`, {
      tag, P: 1.1, temp: 184,
      costado: { mat: 'SA-516 Gr.65', S: 108, E: 0.9, D: 1510, C: 0.75, y: 0.4, espEncontrada: 10.24 },
      tubo: { mat: 'SA-106 B', S: 118, D: 60.3, espEncontrada: 3.9 },
      espelho: { mat: 'SA-516 Gr.65', S: 108, p: 148, C: 2.2, espEncontrada: 18.62 },
    });
  } else {
    gravar(`nr13_vaso_${tag}`, {
      tag, P: 1.1, D: 1000,
      componentes: [{ id: 'casco', nome: 'Casco Cilíndrico', tipo: 'cilindrico', dados: { mat: 'SA-516 Gr.70', ca: '1,6', temp: '120' } }],
    });
  }
  gravar(`nr13_fotos_${tag}`, [{ id: 1, src: PIXEL, isCapa: true }]);
  gravar('nr13_minha_empresa', { razao: 'EXECUTANTE-BASE', endereco: 'AV BASE, 1', cidade: 'MACAÉ', cnpj: '11.111.111/0001-11' });
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-1790000000000',
    emissao: '21/10/2026',
    validade: '21/10/2027',
    execucaoInspecao: '20/10/2026',
    proximaInspecaoInterna: '20/10/2027',
    proximaInspecaoExterna: '20/10/2027',
    validadeValvula: '20/10/2027',
    tipoInspecao: 'Inspeção Periódica',
    phNome: 'ENG BASE',
    phCrea: 'CREA-0001',
    tecnicoNome: 'TEC BASE',
    art: 'ART-0001',
    containerOrigemId: 'cont-base',
  });
  gravar(`nr13_laudo_${tag}`, { apto: true, relatorioCodigo: 'REL-1790000000000', atualizadoEm: '2026-10-21' });
  const exame = (m: string) => ({
    serie: `SERIE-${m}`, itens: { '1': 'nao', '2': 'nao' }, semanticaNc: 1,
    observacoes: `OBS-${m}`, conclusao: `CONCLUSAO-${m}`, resultado: 'aprovado',
    fotos: [{ id: `f-${m}`, ordem: 1, base64: PIXEL, descricao: `FOTO-${m}` }],
  });
  const dados = {
    checklist: { dataInspecao: '2026-10-20', inspetor: 'INSP', respostas: { '1': 'sim' }, observacoes: {}, instrumentos: {}, fotosDocumentacao: [], fotos: [] },
    visual_externo: exame('VE'),
    visual_interno: exame('VI'),
    ultrassom: {
      equipamento: 'EQ', dataUltrassom: '2026-10-20', aparelho: 'AP', acoplante: 'AC', resultado: 'aprovado',
      pontos: [
        { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
        { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
        { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
      ],
      colunas: { ts: 4, casco: 4, ti: 4 },
      medidas: {
        ts: { '0': '10,4', '90': '10,5', '180': '10,3', '270': '10,6' },
        c1: { '0': '10,24', '90': '10,4', '180': '10,5', '270': '10,3' },
        ti: { '0': '10,4', '90': '10,7', '180': '10,3', '270': '10,6' },
      },
    },
    th: {
      dataTeste: '2026-10-20', pressaoTeste: '16,5', fluido: 'Água', duracao: '30 min', resultado: 'aprovado',
      curva: [{ tempo: '0', pressao: '0' }, { tempo: '10', pressao: '16,5' }], fotos: [],
    },
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
}

function hashNormalizado(bytes: Uint8Array): string {
  const txt = Buffer.from(bytes).toString('latin1')
    .replace(/\/CreationDate \([^)]*\)/g, '')
    .replace(/\/ModDate \([^)]*\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '');
  return createHash('sha256').update(Buffer.from(txt, 'latin1')).digest('hex');
}

const medidos: Record<string, string> = {};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
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
});

afterAll(() => {
  vi.useRealTimers();
  if (GRAVAR) {
    mkdirSync(dirname(ARQUIVO_BASELINE), { recursive: true });
    // MESCLA, nunca substitui: as entradas `caldeira:*` são as do gerador ANTIGO
    // (d2b97da) e `caldeiraEmitidaIntacta.test.ts` depende delas — regravar só
    // vaso e autoclave não pode apagá-las (22/10/2026).
    const anterior = existsSync(ARQUIVO_BASELINE) ? JSON.parse(readFileSync(ARQUIVO_BASELINE, 'utf8')) : {};
    writeFileSync(ARQUIVO_BASELINE, JSON.stringify({ ...anterior, ...medidos }, null, 2) + '\n');
  }
});

const baseline: Record<string, string> = existsSync(ARQUIVO_BASELINE)
  ? JSON.parse(readFileSync(ARQUIVO_BASELINE, 'utf8'))
  : {};

/** Tipos cujo documento NÃO pode mudar um byte. */
const IMUTAVEIS: Tipo[] = ['vaso', 'autoclave'];

/**
 * CALDEIRA muda DE PROPÓSITO, e só onde foi decidido:
 * - Rodada 1 (21/10/2026): a grade "Ensaios realizados" da seção 7 ganha a
 *   linha "Ensaio de acumulação" — muda toda composição que tem a seção 7
 *   ('completo' e 'vazio'); o avulso de cada ensaio fica igual.
 * O documento de caldeira JÁ EMITIDO não muda: é servido pelos bytes
 * (`caldeiraEmitidaIntacta.test.ts`, com o PDF do gerador antigo como fixture).
 */
const CALDEIRA_MUDA: ReadonlySet<string> = new Set(['completo', 'vazio']);

describe('o relatório de cada tipo sai idêntico ao baseline', () => {
  for (const tipo of IMUTAVEIS) {
    for (const [nome, documentos] of Object.entries(COMPOSICOES)) {
      for (const modo of ['preview', 'final'] as const) {
        const chave = `${tipo}:${nome}:${modo}`;
        it(chave, async () => {
          const tag = `ZZ-BASE-${tipo.toUpperCase()}`;
          montar(tipo, tag);
          const r = await gerarRelatorioVetorial(tag, { documentos, certificados: false, modo });
          const h = hashNormalizado(r.bytes);
          medidos[chave] = h;
          if (!GRAVAR) {
            expect(baseline[chave], `baseline ausente para ${chave}`).toBeDefined();
            expect(h).toBe(baseline[chave]);
          }
        }, 120_000);
      }
    }
  }

  {
    for (const [nome, documentos] of Object.entries(COMPOSICOES)) {
      for (const modo of ['preview', 'final'] as const) {
        const chave = `caldeira:${nome}:${modo}`;
        const muda = CALDEIRA_MUDA.has(nome);
        it(`${chave} — ${muda ? 'MUDA (decidido)' : 'igual'}`, async () => {
          montar('caldeira', 'ZZ-BASE-CALDEIRA');
          const r = await gerarRelatorioVetorial('ZZ-BASE-CALDEIRA', { documentos, certificados: false, modo });
          const h = hashNormalizado(r.bytes);
          if (GRAVAR) {
            // As que MUDAM ficam com o hash do gerador antigo (é a entrada da
            // caldeira emitida); só as "igual" acompanham o texto novo da norma.
            if (!muda) medidos[chave] = h;
            return;
          }
          if (muda) expect(h).not.toBe(baseline[chave]);
          else expect(h).toBe(baseline[chave]);
        }, 120_000);
      }
    }
  }

  it('o hash normalizado é estável entre duas gerações seguidas', async () => {
    montar('vaso', 'ZZ-BASE-VASO');
    const a = await gerarRelatorioVetorial('ZZ-BASE-VASO', { documentos: COMPLETO, certificados: false, modo: 'final' });
    const b = await gerarRelatorioVetorial('ZZ-BASE-VASO', { documentos: COMPLETO, certificados: false, modo: 'final' });
    expect(hashNormalizado(a.bytes)).toBe(hashNormalizado(b.bytes));
  }, 120_000);
});
