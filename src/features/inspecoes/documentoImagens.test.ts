/**
 * FASE 5 · R — o documento AVULSO do Relatório de Imagens, pelo ponto de
 * entrada da tela (`gerarDocumentoImagens`, o que `PreviewDocumento` chama).
 *
 * O container é gravado na chave real (`nr13_docs_<TAG>`), a ficha e a empresa
 * nas chaves de sempre, e o PDF é lido de volta com pdf.js. Prova que:
 *
 * - a ORDEM gravada (não a posição do array) decide "Foto 01, 02…";
 * - a descrição vai com a foto certa;
 * - a identificação vem da FICHA (nada copiado para o ensaio);
 * - foto que não carrega PARA a geração (não renumera);
 * - sem foto não há documento;
 * - Y · gerar não toca em relatório salvo, índice nem histórico.
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

/** PNG 2×1 válido (o jsPDF precisa decodificar de verdade). */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC';
/** Caminhos que o "cofre" NÃO tem — simula foto sem cópia local e sem rede. */
const INDISPONIVEIS = new Set<string>();

vi.mock('../../services/fotos', async (original) => {
  const real = await original<typeof import('../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async (ref: { path: string }) =>
      INDISPONIVEIS.has(ref.path) ? null : new Blob([new Uint8Array([1])], { type: 'image/png' }),
    blobParaDataUrl: async () => PNG,
  };
});

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarDocumentoImagens, FotoIndisponivelErro } from './documentoImagens';
import { zerarCacheFontes } from '../relatorios/pdfVetorial/carlito';

const TAG = 'ZZ-IMG-AVULSO';
const CONT = 'contImg_1';

const ref = (n: number) => ({ bucket: 'inspecao', path: `org/${TAG}_imagens/u-${n}.jpg`, mimeType: 'image/jpeg', tamanho: 1 });

/**
 * Array gravado FORA de ordem de propósito: a ordem é a do campo `ordem`
 * (o técnico moveu a foto "c" para o topo).
 */
const FOTOS = [
  { id: 'foto-a', ordem: 1, ref: ref(1), descricao: 'Vista geral do equipamento.' },
  { id: 'foto-b', ordem: 2, ref: ref(2), descricao: 'Válvula de segurança instalada no equipamento.' },
  { id: 'foto-c', ordem: 0, ref: ref(3), descricao: 'Manômetro instalado na linha de vapor.' },
];

function gravar(fotos: unknown[]) {
  localStorage.setItem(
    `nr13_docs_${TAG}`,
    JSON.stringify([
      {
        id: CONT,
        nome: 'Inspeção de imagens ZZ',
        criadoEm: '24/09/2026',
        ensaios: ['relatorio_imagens'],
        dados: { imagens: { dataRegistro: '2026-09-24', observacoes: 'Registro sintético.', fotos } },
      },
    ]),
  );
}

async function texto(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

let paginas: string[] = [];
let chavesAntes: string[] = [];
let chavesDepois: string[] = [];

beforeAll(async () => {
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

  localStorage.clear();
  localStorage.setItem(
    `nr13_info_${TAG}`,
    JSON.stringify({ tag: TAG, tipo: 'vaso', fabricante: 'FABRICANTE SINTÉTICO', numeroSerie: 'SER-IMG-1', localizacao: 'Casa de caldeiras' }),
  );
  localStorage.setItem(`nr13_emp_${TAG}`, JSON.stringify({ razaoSocial: 'CLIENTE SINTÉTICO LTDA' }));
  localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razaoSocial: 'ZZ ENGENHARIA SINTÉTICA LTDA' }));
  // Um relatório SALVO do mesmo equipamento — o documento avulso não pode tocá-lo.
  localStorage.setItem(`nr13_rel_R1_${TAG}`, JSON.stringify({ id: 'R1', pdfRef: { path: 'org/relatorios/x.pdf' }, sha256: 'abc' }));
  localStorage.setItem(`nr13_historico_indice_${TAG}`, JSON.stringify([{ id: 'R1', sha256: 'abc' }]));
  gravar(FOTOS);

  chavesAntes = [...Array(localStorage.length).keys()].map((i) => localStorage.key(i)!);
  const r = await gerarDocumentoImagens(TAG, CONT);
  paginas = await texto(r.bytes);
  chavesDepois = [...Array(localStorage.length).keys()].map((i) => localStorage.key(i)!);
}, 300_000);

describe('R · documento avulso do Relatório de Imagens', () => {
  it('capa com a identificação vinda da FICHA e do cadastro do cliente', () => {
    const capa = paginas[0];
    expect(capa).toContain('RELATÓRIO DE IMAGENS');
    expect(capa).toContain(TAG);
    expect(capa).toContain('FABRICANTE SINTÉTICO');
    expect(capa).toContain('SER-IMG-1');
    expect(capa).toContain('Casa de caldeiras');
    expect(capa).toContain('CLIENTE SINTÉTICO LTDA');
    expect(capa).toContain('24/09/2026');
    expect(capa).toContain('Registro sintético.');
  });

  it('a ORDEM gravada decide a numeração, e cada descrição vai com a sua foto', () => {
    const fotos = paginas.slice(1).join(' ');
    const p1 = fotos.indexOf('Foto 01 Manômetro instalado na linha de vapor.');
    const p2 = fotos.indexOf('Foto 02 Vista geral do equipamento.');
    const p3 = fotos.indexOf('Foto 03 Válvula de segurança instalada no equipamento.');
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it('rodapé com a empresa executante e paginação', () => {
    for (const [i, p] of paginas.entries()) {
      expect(p).toContain('ZZ ENGENHARIA SINTÉTICA LTDA');
      expect(p).toContain(`Página ${i + 1} de ${paginas.length}`);
    }
  });

  it('Y · gerar não cria nem altera relatório salvo, índice ou histórico', () => {
    const novas = chavesDepois.filter((k) => !chavesAntes.includes(k));
    // A única escrita permitida é a meta viva, zerada (mesma regra do avulso dos ensaios).
    expect(novas.filter((k) => k !== 'nr13_relatorio_meta_atual')).toEqual([]);
    expect(JSON.parse(localStorage.getItem(`nr13_rel_R1_${TAG}`)!)).toEqual({
      id: 'R1',
      pdfRef: { path: 'org/relatorios/x.pdf' },
      sha256: 'abc',
    });
    expect(JSON.parse(localStorage.getItem(`nr13_historico_indice_${TAG}`)!)).toEqual([{ id: 'R1', sha256: 'abc' }]);
  });

  it('gerar não regrava o container (o documento só lê)', () => {
    const c = JSON.parse(localStorage.getItem(`nr13_docs_${TAG}`)!)[0];
    expect(c.dados.imagens.fotos).toEqual(FOTOS);
  });
});

describe('recusas nomeadas', () => {
  it('foto sem cópia local e sem rede PARA a geração e diz qual (não renumera)', async () => {
    INDISPONIVEIS.add(ref(2).path);
    try {
      await expect(gerarDocumentoImagens(TAG, CONT)).rejects.toBeInstanceOf(FotoIndisponivelErro);
      // foto-b tem ordem 2 → é a "Foto 03" do documento
      await expect(gerarDocumentoImagens(TAG, CONT)).rejects.toThrow(/Foto 03/);
    } finally {
      INDISPONIVEIS.clear();
    }
  });

  it('sem foto não há documento — nem prévia', async () => {
    gravar([]);
    await expect(gerarDocumentoImagens(TAG, CONT)).rejects.toThrow(/Nenhuma imagem adicionada/);
    gravar(FOTOS);
  });
});
