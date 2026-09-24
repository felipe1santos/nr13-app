/**
 * FASE 5.1 · ABRIR UM DOCUMENTO AVULSO É LEITURA PURA (24/09/2026).
 *
 * O defeito: "Ver documento" de um ensaio (e o Relatório de Imagens) GRAVAVA as
 * chaves vivas do relatório em montagem — `nr13_relatorio_meta_atual`,
 * `nr13_inspecao_atual` e `nr13_injecao_atual` — para o modelo lê-las. Quem
 * estivesse montando um relatório noutra aba perdia a meta (código, datas,
 * assinantes, empresa congelada) e os dados de campo, e o sync levava a
 * sobrescrita aos outros aparelhos.
 *
 * O cenário é o das DUAS ABAS: a "aba A" deixa as três chaves preenchidas com
 * um relatório em montagem; a "aba B" gera os seis avulsos de um OUTRO
 * container. Depois:
 *
 * - o storage inteiro é idêntico ao de antes, chave a chave (nada gravado);
 * - nenhuma chamada saiu para o servidor (nada entrou em fila nem subiu);
 * - cada avulso traz só a seção do seu ensaio, com os dados do container dele
 *   — nunca a meta nem o campo da aba A;
 * - e o relatório COMPLETO, que continua lendo as chaves vivas, segue igual.
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

const chamadasServidor: string[] = [];
vi.mock('../../services/supabase', () => ({
  supabase: {
    from: (t: string) => {
      chamadasServidor.push(`from:${t}`);
      return { upsert: async () => ({ error: null }) };
    },
    rpc: async (f: string) => {
      chamadasServidor.push(`rpc:${f}`);
      return { data: null, error: null };
    },
    storage: {},
  },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC';
vi.mock('../../services/fotos', async (original) => {
  const real = await original<typeof import('../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
    blobParaDataUrl: async () => PNG,
  };
});

import { gerarDocumentoDoEnsaio } from './documentoVetorial';
import { gerarDocumentoImagens } from './documentoImagens';
import { gerarRelatorioVetorial } from '../relatorios/pdfVetorial/gerarRelatorio';
import { zerarCacheFontes } from '../relatorios/pdfVetorial/carlito';
import { angulosDaRegiao } from '../relatorios/medicoesEspessura';
import type { FormularioEnsaio } from './tipos';

const TAG = 'ZZ-AVULSO-51';
const CONT_B = 'cont-aba-b';
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

// ── ABA A: o relatório em montagem (as três chaves vivas) ─────────────────
const META_A = {
  codigo: 'REL-ABA-A-0042',
  containerOrigemId: 'cont-aba-a',
  execucaoInspecao: '2026-09-20',
  art: 'ART-ABA-A-777',
  empresa: { razaoSocial: 'EMPRESA SNAPSHOT DA ABA A' },
  assinantes: { engenheiro: { nome: 'ENGENHEIRO DA ABA A', crea: 'CREA-ABA-A' } },
  documentos: ['CAPA.html', 'VISUAL-EXTERNO.html'],
};
const CAMPO_A = {
  visual_externo: { serie: 'SER-A', itens: { '1': 'sim' }, itemObs: { '1': 'OBS-ITEM-DA-ABA-A' }, observacoes: 'OBS-GERAL-DA-ABA-A', semanticaNc: 1, resultado: 'reprovado' },
};

// ── ABA B: o container cujo avulso é aberto ───────────────────────────────
const ang = angulosDaRegiao(4);
const DADOS_B = {
  checklist: {
    inspetor: 'INSPETOR-B',
    instrumentos: { 'inst-man': true, 'inst-man-cal': true },
    respostas: { 'v51-prontuario': 'sim' },
    observacoes: { 'v51-prontuario': 'PRONTUARIO-CONTAINER-B' },
  },
  visual_externo: { serie: 'SER-B', itens: { '1': 'nao' }, itemObs: { '1': 'ITEM-EXTERNO-B' }, observacoes: 'OBS-EXTERNO-B', semanticaNc: 1, resultado: 'aprovado' },
  visual_interno: { serie: 'SER-B', itens: { '1': 'nao' }, itemObs: { '1': 'ITEM-INTERNO-B' }, observacoes: 'OBS-INTERNO-B', semanticaNc: 1, resultado: 'aprovado' },
  th: {
    cliente: 'CLIENTE B', equipamento: 'VASO B', pressaoTeste: '13,70', pressaoProj: '10,50', pressaoTrabalho: '9,48',
    unidade: 'SI', duracao: '60 min.', fluido: 'Água potável', normas: 'NORMA-TH-B', dataTeste: '2026-09-22', resultado: 'aprovado',
    curva: [{ tempo: '0', pressao: '0,00' }, { tempo: '1', pressao: '9,00' }],
  },
  ultrassom: {
    equipamento: 'VASO B', serie: 'SER-B', dataUltrassom: '2026-09-22', aparelho: 'APARELHO-US-B',
    pontos: [{ id: 'c1', rotulo: 'Casco 1', regiao: 'casco' }],
    colunas: { ts: 4, casco: 4, ti: 4 },
    medidas: { c1: Object.fromEntries(ang.map((a, i) => [a, `8,9${i}`])) },
  },
  imagens: {
    dataRegistro: '2026-09-24',
    observacoes: 'OBS-IMAGENS-B',
    fotos: [{ id: 'foto-1', ordem: 0, ref: { bucket: 'inspecao', path: 'org/x/1.jpg', mimeType: 'image/jpeg', tamanho: 1 }, descricao: 'DESCRICAO-IMAGEM-B' }],
  },
};

const SECAO: Record<Exclude<FormularioEnsaio, 'manometro' | 'psv' | 'imagens'>, string> = {
  checklist: 'VERIFICAÇÃO DA DOCUMENTAÇÃO',
  ultrassom: 'MEDIÇÃO DE ESPESSURA POR ULTRASSOM',
  visual_externo: 'EXAME EXTERNO',
  visual_interno: 'EXAME INTERNO',
  th: 'REGISTRO DE TESTE HIDROSTÁTICO',
};
const ENSAIOS = Object.keys(SECAO) as (keyof typeof SECAO)[];

/**
 * O que SÓ a seção daquele ensaio imprime. Título sozinho não serve: o
 * checklist tem um subtítulo "EXAME EXTERNO" (item 7.1) que não é a seção do
 * exame visual. Então: o dado do container que só aquela seção imprime.
 */
const EXCLUSIVO: Record<keyof typeof SECAO, string> = {
  checklist: 'PRONTUARIO-CONTAINER-B',
  ultrassom: 'MEDIÇÃO DE ESPESSURA POR ULTRASSOM',
  visual_externo: 'OBS-EXTERNO-B',
  visual_interno: 'OBS-INTERNO-B',
  th: 'REGISTRO DE TESTE HIDROSTÁTICO',
};

async function texto(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return out.join(' \n ').replace(/\s+/g, ' ');
}

const retrato = () =>
  Object.fromEntries([...Array(localStorage.length).keys()].map((i) => localStorage.key(i)!).map((k) => [k, localStorage.getItem(k)]));

const papel: Record<string, string> = {};
let antes: Record<string, string | null> = {};
let depois: Record<string, string | null> = {};
let chamadasDuranteAvulsos: string[] = [];
let relatorioCompleto = '';

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
  gravar(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'VASO B', numeroSerie: 'SER-B', fabricante: 'FAB B' });
  gravar(`nr13_pref_unidade_${TAG}`, 'SI');
  gravar(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE CADASTRADO LTDA' });
  gravar(`nr13_calc_${TAG}`, { pmta: 1.2, pth: 1.56 });
  gravar('nr13_minha_empresa', { razaoSocial: 'EMPRESA CADASTRO VIVO LTDA' });
  gravar(`nr13_docs_${TAG}`, [{ id: CONT_B, nome: 'Container B', criadoEm: '24/09/2026', ensaios: [], dados: DADOS_B }]);
  // Aba A deixa o relatório em montagem nas chaves vivas.
  gravar('nr13_relatorio_meta_atual', META_A);
  gravar('nr13_inspecao_atual', CAMPO_A);
  gravar('nr13_injecao_atual', CAMPO_A);

  antes = retrato();
  chamadasServidor.length = 0;
  // Aba B abre os seis avulsos.
  for (const e of ENSAIOS) papel[e] = await texto((await gerarDocumentoDoEnsaio(TAG, CONT_B, e)).bytes);
  papel.imagens = await texto((await gerarDocumentoImagens(TAG, CONT_B)).bytes);
  depois = retrato();
  chamadasDuranteAvulsos = [...chamadasServidor];

  // O relatório COMPLETO continua lendo as chaves vivas (aba A).
  relatorioCompleto = await texto(
    (await gerarRelatorioVetorial(TAG, { documentos: ['CAPA.html', 'VISUAL-EXTERNO.html'], certificados: false, modo: 'final' })).bytes,
  );
}, 300_000);

describe('duas abas · a meta viva da aba A sobrevive aos avulsos da aba B', () => {
  it('nr13_relatorio_meta_atual: MESMO valor, byte a byte', () => {
    expect(depois.nr13_relatorio_meta_atual).toBe(antes.nr13_relatorio_meta_atual);
    expect(JSON.parse(depois.nr13_relatorio_meta_atual!)).toEqual(META_A);
  });

  it('nr13_inspecao_atual e nr13_injecao_atual: mesmos valores', () => {
    expect(depois.nr13_inspecao_atual).toBe(antes.nr13_inspecao_atual);
    expect(depois.nr13_injecao_atual).toBe(antes.nr13_injecao_atual);
  });

  it('o storage INTEIRO é idêntico — nenhuma chave criada, alterada ou removida', () => {
    expect(depois).toEqual(antes);
  });

  it('nenhuma chamada ao servidor: nada entrou em fila nem subiu', () => {
    expect(chamadasDuranteAvulsos).toEqual([]);
  });
});

describe('cada avulso traz SÓ o seu ensaio, com os dados do container dele', () => {
  it.each(ENSAIOS)('%s', (e) => {
    expect(papel[e]).toContain(SECAO[e]);
    expect(papel[e]).toContain(EXCLUSIVO[e]);
    for (const outro of ENSAIOS.filter((x) => x !== e)) {
      expect(papel[e], `${e} trouxe ${outro}`).not.toContain(EXCLUSIVO[outro]);
    }
    // A pergunta das NC só existe nas seções dos exames visuais.
    if (e !== 'visual_externo' && e !== 'visual_interno') {
      expect(papel[e]).not.toContain('FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?');
    }
    expect(papel[e]).not.toContain('SUMÁRIO GERAL');
    expect(papel[e]).not.toContain('RELATÓRIO DE IMAGENS');
  });

  it('Relatório de Imagens: só ele, sem seção de ensaio nenhum', () => {
    expect(papel.imagens).toContain('RELATÓRIO DE IMAGENS');
    expect(papel.imagens).toContain('DESCRICAO-IMAGEM-B');
    for (const e of ENSAIOS) expect(papel.imagens).not.toContain(EXCLUSIVO[e]);
  });

  it('nenhum avulso herda a meta, a empresa congelada nem o campo da aba A', () => {
    for (const [nome, p] of Object.entries(papel)) {
      for (const da of ['REL-ABA-A-0042', 'ART-ABA-A-777', 'EMPRESA SNAPSHOT DA ABA A', 'ENGENHEIRO DA ABA A', 'OBS-GERAL-DA-ABA-A', 'OBS-ITEM-DA-ABA-A']) {
        expect(p, `${nome} trouxe ${da}`).not.toContain(da);
      }
    }
  });

  it('os dados são os do container B e a empresa é o cadastro vivo', () => {
    expect(papel.visual_externo).toContain('OBS-EXTERNO-B');
    expect(papel.visual_interno).toContain('OBS-INTERNO-B');
    expect(papel.checklist).toContain('PRONTUARIO-CONTAINER-B');
    expect(papel.th).toContain('NORMA-TH-B');
    expect(papel.ultrassom).toContain('8,90');
    for (const p of Object.values(papel)) expect(p).toContain('EMPRESA CADASTRO VIVO LTDA');
  });
});

describe('relatório completo · sem regressão', () => {
  it('continua lendo a meta e o campo VIVOS da aba A (código, ART, empresa congelada, observação)', () => {
    expect(relatorioCompleto).toContain('REL-ABA-A-0042');
    expect(relatorioCompleto).toContain('EMPRESA SNAPSHOT DA ABA A');
    expect(relatorioCompleto).toContain('OBS-GERAL-DA-ABA-A');
    expect(relatorioCompleto).not.toContain('OBS-EXTERNO-B');
  });

  it('relatório completo SEM a seção 8.4 escolhida não traz o Relatório de Imagens (Fase 5.2: só entra se escolhido)', () => {
    expect(relatorioCompleto).not.toContain('RELATÓRIO DE IMAGENS');
    expect(relatorioCompleto).not.toContain('DESCRICAO-IMAGEM-B');
  });
});

describe('gate · as portas do avulso não gravam chave viva', () => {
  for (const arq of ['src/features/inspecoes/documentoVetorial.ts', 'src/features/inspecoes/documentoImagens.ts']) {
    it(arq, () => {
      const s = readFileSync(arq, 'utf8');
      expect(s).not.toMatch(/gravarMetaAtual\s*\(/);
      expect(s).not.toMatch(/gravarInspecaoOrigemAtual\s*\(/);
      expect(s).not.toMatch(/\bsalvar\s*\(/);
    });
  }
});

/**
 * URL DIRETA num aparelho que ainda não semeou a TAG (P2, anterior à fase).
 *
 * O formulário abre vazio porque o container não está no cache. O que importa
 * é que isso NÃO vire gravação: salvar recusa (e o autosave engole a recusa),
 * e o documento não sai como se houvesse dado.
 */
describe('URL direta com a TAG não carregada · nada é gravado por cima', () => {
  it('salvar o formulário vazio é RECUSADO e o storage não muda', async () => {
    const { salvarDadosFormulario } = await import('./inspecaoService');
    const TAG_FRIA = 'ZZ-NAO-SEMEADA';
    const r0 = retrato();
    await expect(salvarDadosFormulario(TAG_FRIA, 'cont-qualquer', 'imagens', { fotos: [] })).rejects.toThrow(
      /não encontrado no cache/,
    );
    await expect(salvarDadosFormulario(TAG, 'cont-inexistente', 'visual_externo', {})).rejects.toThrow(
      /não encontrado no cache/,
    );
    expect(retrato()).toEqual(r0);
  });

  it('o Relatório de Imagens sem container não gera documento', async () => {
    await expect(gerarDocumentoImagens('ZZ-NAO-SEMEADA', 'cont-qualquer')).rejects.toThrow(/Nenhuma imagem adicionada/);
  });
});
