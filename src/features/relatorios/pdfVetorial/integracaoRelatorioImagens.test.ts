/**
 * FASE 5.2 · o RELATÓRIO DE IMAGENS dentro do relatório NR-13 completo (seção 8.4).
 *
 * Princípio: o avulso e a seção usam a MESMA fonte (as chaves de campo do
 * container → `normalizarFotos`) e o MESMO desenho (`prepararFotosDescritas` →
 * `desenharFotosDescritas`). Aqui isso é provado pelos BYTES: um espião no
 * `addImage` identifica qual foto foi desenhada (cada foto sintética tem um PNG
 * único) e em que tamanho; o pdf.js devolve "Foto NN" + descrição. Os dois
 * documentos precisam desenhar a mesma sequência — e continuar iguais depois de
 * reordenar e de trocar uma descrição no ensaio (o "mutante": uma cópia, um
 * snapshot ou um segundo gerador deixaria um dos dois para trás).
 *
 * Letras = §29 do pedido da 5.2.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), rpc: async () => ({ data: null, error: null }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

// Cada foto tem um PNG próprio; o "cofre" devolve os bytes pelo caminho.
const PNG_POR_PATH = new Map<string, string>();
const DIM_POR_PNG = new Map<string, { w: number; h: number }>();
vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async (ref: { path: string }) => new Blob([ref.path], { type: 'text/plain' }),
    blobParaDataUrl: async (b: Blob) => PNG_POR_PATH.get(await b.text()) ?? '',
  };
});

import { jsPDF } from 'jspdf';
import { pngSintetico } from './pngSintetico.testutil';
import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import { TITULO_SECAO_IMAGENS } from './relatorioImagens';
import { gerarDocumentoImagens } from '../../inspecoes/documentoImagens';
import { normalizarFotos, moverFoto, definirDescricao, type FotoDescrita } from '../../inspecoes/fotosDescritas';
import { documentosFinais, ensaiosRevisaveis } from '../wizardCriacao';
import { resumirContainer } from '../../inspecoes/resumoContainer';
import { DOCUMENTOS_DISPONIVEIS, FOLHAS_RELATORIO_ASSINAVEIS, temTemplateHtml } from '../tipos';
import { impedimentoRelatorioImagens } from '../relatorioImagensNoRelatorio';

const TAG = 'ZZ-INTEGRA-52';
const CONT = 'cont-integra-52';
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

const FORMATOS = [
  { w: 160, h: 90 },
  { w: 90, h: 160 },
  { w: 120, h: 120 },
];
const LONGA =
  'Pontos de corrosão observados no costado, na região inferior próxima à sela de apoio do lado do tampo traseiro. ' +
  'A corrosão é generalizada, com perda de espessura aparente e manchas de óxido, sem indícios de trincas visíveis. ' +
  'Recomenda-se medição de espessura complementar por ultrassom nesta região e reaplicação do sistema de pintura.';
const GIGANTE = Array.from({ length: 26 }, () => LONGA).join(' ');

function fotosSinteticas(n: number, descricao: (i: number) => string = (i) => `Imagem integrada ${i + 1}.`): FotoDescrita[] {
  return normalizarFotos(
    Array.from({ length: n }, (_, i) => {
      const path = `org/${TAG}_imagens/u-${n}-${i}.jpg`;
      const f = FORMATOS[i % 3];
      const png = pngSintetico(f.w, f.h, 200 + n * 7 + i);
      PNG_POR_PATH.set(path, png);
      DIM_POR_PNG.set(png, f);
      return { id: `foto-${n}-${i}`, ordem: i, ref: { bucket: 'inspecao', path, mimeType: 'image/jpeg', tamanho: 1 }, descricao: descricao(i) };
    }),
  );
}

const VISUAL_EXTERNO = { serie: 'SER-52', itens: { '1': 'nao' }, itemObs: {}, observacoes: 'OBS-EXTERNO-52', semanticaNc: 1, resultado: 'aprovado' };

/**
 * O relatório como a tela de Relatórios o monta: container nas DUAS chaves de
 * campo + meta viva com o código e o container de origem (§2 do CLAUDE.md).
 */
function semear(fotos: FotoDescrita[] | null) {
  nFotos = fotos?.length ?? 0;
  localStorage.clear();
  gravar(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'VASO 52', numeroSerie: 'SER-52', fabricante: 'FAB 52' });
  gravar(`nr13_pref_unidade_${TAG}`, 'SI');
  gravar(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE 52 LTDA' });
  gravar(`nr13_calc_${TAG}`, { pmta: 1.2, pth: 1.56 });
  gravar('nr13_minha_empresa', { razaoSocial: 'ZZ ENGENHARIA 52 LTDA' });
  const dados: Record<string, unknown> = { visual_externo: VISUAL_EXTERNO };
  if (fotos) dados.imagens = { dataRegistro: '2026-09-24', observacoes: '', fotos };
  gravar(`nr13_docs_${TAG}`, [{ id: CONT, nome: 'Container 52', criadoEm: '24/09/2026', ensaios: [], dados }]);
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
  gravar('nr13_relatorio_meta_atual', { codigo: 'REL-INTEGRA-52', containerOrigemId: CONT });
}

const BASE = ['CAPA.html', 'SUMARIO.html', 'PLACA.html', 'VISUAL-EXTERNO.html', 'CONCLUSAO.html'];
const COM = documentosFinais([...BASE, 'RELATORIO-IMAGENS.html'], []);

// ── espião: qual foto (pelos bytes) foi desenhada, em que tamanho ──────────
let desenhos: { png: string; w: number; h: number }[] = [];
let restaurar = () => {};

async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

interface Leitura {
  paginas: string[];
  /** Sequência de fotos DESENHADAS (só as do ensaio), pelo PNG. */
  fotos: { png: string; w: number; h: number }[];
}

/**
 * O gerador desenha em DUAS passagens (a 1ª conta as folhas) e às vezes numa
 * terceira; o espião vê todas. Vale a ÚLTIMA: as N fotos finais.
 */
function ultimaPassagem(lista: { png: string; w: number; h: number }[], n: number) {
  const doEnsaio = lista.filter((d) => DIM_POR_PNG.has(d.png));
  expect(doEnsaio.length % n).toBe(0);
  return doEnsaio.slice(-n);
}

let nFotos = 0;

async function lerAvulso(): Promise<Leitura> {
  desenhos = [];
  const r = await gerarDocumentoImagens(TAG, CONT);
  return { paginas: await paginasDoPdf(r.bytes), fotos: nFotos ? ultimaPassagem(desenhos, nFotos) : [] };
}

async function lerCompleto(documentos: string[]): Promise<Leitura> {
  desenhos = [];
  const r = await gerarRelatorioVetorial(TAG, { documentos, certificados: false, modo: 'final' });
  const doEnsaio = desenhos.filter((d) => DIM_POR_PNG.has(d.png));
  return { paginas: await paginasDoPdf(r.bytes), fotos: doEnsaio.length && nFotos ? ultimaPassagem(desenhos, nFotos) : [] };
}

/** "Foto NN" + descrição, na ordem em que aparecem no texto. */
function legendas(paginas: string[], descricoes: string[]): string[] {
  const tudo = paginas.join(' ').replace(/\s+/g, '');
  return descricoes
    .map((d, i) => ({ i, pos: tudo.indexOf(d.replace(/\s+/g, '')) }))
    .filter((x) => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos)
    .map((x) => descricoes[x.i]);
}

/** As páginas da seção 8.4 no relatório completo. */
function secao(paginas: string[]): { inicio: number; fim: number } {
  const inicio = paginas.findIndex((p) => p.includes(TITULO_SECAO_IMAGENS));
  let fim = inicio;
  while (fim + 1 < paginas.length && paginas[fim + 1].includes(`${TITULO_SECAO_IMAGENS} (continuação)`)) fim++;
  return { inicio, fim };
}

const L: Record<string, Leitura> = {};

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
    set src(v: string) {
      const d = DIM_POR_PNG.get(v);
      if (d) {
        this.naturalWidth = d.w;
        this.naturalHeight = d.h;
      }
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImagemFalsa);
  const api = jsPDF.API as unknown as { addImage: (...a: unknown[]) => unknown };
  const original = api.addImage;
  api.addImage = function (this: unknown, ...args: unknown[]) {
    desenhos.push({ png: String(args[0]), w: args[4] as number, h: args[5] as number });
    return original.apply(this, args);
  };
  restaurar = () => {
    api.addImage = original;
  };

  // A · sem a seção, com e sem imagens no container (a escolha é o que manda).
  semear(null);
  L.semContainerSemFoto = await lerCompleto(BASE);
  semear(fotosSinteticas(6));
  L.semSecaoComFotos = await lerCompleto(BASE);
  // B/D/I · 6 fotos, avulso x completo.
  L.com6 = await lerCompleto(COM);
  L.avulso6 = await lerAvulso();
  // C/E · 1 e 31.
  semear(fotosSinteticas(1));
  L.com1 = await lerCompleto(COM);
  L.avulso1 = await lerAvulso();
  semear(fotosSinteticas(31));
  L.com31 = await lerCompleto(COM);
  L.avulso31 = await lerAvulso();
  // H · descrição longa e gigante (corre para a folha seguinte).
  semear(fotosSinteticas(4, (i) => (i === 1 ? GIGANTE : i === 2 ? LONGA : `Curta ${i + 1}.`)));
  L.comGigante = await lerCompleto(COM);
  L.avulsoGigante = await lerAvulso();
}, 600_000);

afterAll(() => restaurar());

const DESC6 = Array.from({ length: 6 }, (_, i) => `Imagem integrada ${i + 1}.`);

describe('A/Q · relatório SEM a seção 8.4 escolhida', () => {
  it('não traz título, sumário nem foto do ensaio — mesmo com imagens no container', () => {
    const p = L.semSecaoComFotos.paginas.join(' ');
    expect(p).not.toContain('RELATÓRIO DE IMAGENS');
    expect(p).not.toContain('Relatório de imagens');
    expect(p).not.toContain('Imagem integrada');
    expect(L.semSecaoComFotos.fotos).toEqual([]);
  });

  it('é o MESMO documento de um container sem Relatório de Imagens: mesmas páginas, mesmo texto', () => {
    expect(L.semSecaoComFotos.paginas).toEqual(L.semContainerSemFoto.paginas);
  });
});

describe('B/D · relatório COM a seção 8.4 (6 fotos)', () => {
  it('a seção aparece uma vez, depois dos ensaios e antes do parecer, com o sumário apontando a página', () => {
    const { paginas } = L.com6;
    const { inicio } = secao(paginas);
    expect(inicio).toBeGreaterThan(0);
    const externo = paginas.findIndex((p) => p.includes('EXAME EXTERNO'));
    const parecer = paginas.findIndex((p) => p.includes('9. RECOMENDAÇÕES DE SEGURANÇA'));
    expect(externo).toBeLessThan(inicio);
    expect(parecer).toBeGreaterThan(inicio);
    const sumario = paginas.find((p) => p.includes('SUMÁRIO GERAL'))!;
    expect(sumario).toMatch(new RegExp(`8\\.4\\s*Relatório de imagens[ .]*${inicio + 1}\\b`));
  });

  it('SEM capa do avulso dentro do relatório (nem a tabela de identificação dele)', () => {
    const p = L.com6.paginas.join(' ');
    expect(p).not.toContain('QUANTIDADE DE IMAGENS');
    expect(p).not.toContain('RELATÓRIO DE IMAGENS — T.A.G.');
    // a capa do avulso é uma folha com o título grande e a T.A.G. em subtítulo
    expect(p).not.toMatch(/RELATÓRIO DE IMAGENSs+T.A.G./);
  });

  it('paginação GLOBAL: toda folha da seção diz "Página X de Y" do relatório inteiro', () => {
    const { paginas } = L.com6;
    const { inicio, fim } = secao(paginas);
    for (let i = inicio; i <= fim; i++) expect(paginas[i]).toContain(`Página ${i + 1} de ${paginas.length}`);
    // cabeçalho do RELATÓRIO, não o do avulso
    expect(paginas[inicio]).toContain('REL-INTEGRA-52');
    expect(paginas[inicio]).not.toContain('RELATÓRIO DE IMAGENS — T.A.G.');
  });
});

describe('I/F/G · paridade avulso × integrado (6 fotos)', () => {
  it('mesmas fotos, na mesma ordem, no mesmo tamanho (orientação) — pelos BYTES', () => {
    expect(L.com6.fotos).toHaveLength(6);
    expect(L.com6.fotos).toEqual(L.avulso6.fotos);
  });

  it('mesmas legendas "Foto NN" + descrição, na mesma ordem', () => {
    const { inicio, fim } = secao(L.com6.paginas);
    const noCompleto = legendas(L.com6.paginas.slice(inicio, fim + 1), DESC6);
    expect(noCompleto).toEqual(DESC6);
    expect(legendas(L.avulso6.paginas, DESC6)).toEqual(noCompleto);
    const sec = L.com6.paginas.slice(inicio, fim + 1).join(' ');
    for (let i = 1; i <= 6; i++) expect(sec).toContain(`Foto ${String(i).padStart(2, '0')}`);
  });

  it('paginação INTERNA igual: a seção tem tantas folhas quanto o avulso tem de fotos', () => {
    const { inicio, fim } = secao(L.com6.paginas);
    expect(fim - inicio + 1).toBe(L.avulso6.paginas.length - 1); // avulso = capa + folhas de fotos
  });
});

describe('C/E · 1 e 31 fotos', () => {
  it.each([
    ['1', 1],
    ['31', 31],
  ])('%s: todas, na ordem, iguais ao avulso', (n, qtd) => {
    const com = L[`com${n}`];
    const av = L[`avulso${n}`];
    expect(com.fotos).toHaveLength(qtd);
    expect(com.fotos).toEqual(av.fotos);
    const { inicio, fim } = secao(com.paginas);
    expect(fim - inicio + 1).toBe(av.paginas.length - 1);
    for (let i = inicio; i <= fim; i++) expect(com.paginas[i]).toContain(`Página ${i + 1} de ${com.paginas.length}`);
  });
});

describe('H · descrição longa e continuação no cabeçalho/rodapé globais', () => {
  it('texto inteiro nos dois, e cada folha de continuação repete o título da 8.4', () => {
    const compacto = (s: string) => s.replace(/\s+/g, '');
    const { inicio, fim } = secao(L.comGigante.paginas);
    expect(fim).toBeGreaterThan(inicio);
    const moldura = /Página\d+de\d+/g;
    const sec = compacto(L.comGigante.paginas.slice(inicio, fim + 1).join(' ')).replace(moldura, '');
    expect(sec).toContain(compacto(LONGA));
    for (let i = inicio + 1; i <= fim; i++) {
      expect(L.comGigante.paginas[i]).toContain(`${TITULO_SECAO_IMAGENS} (continuação)`);
      expect(L.comGigante.paginas[i]).toContain(`Página ${i + 1} de ${L.comGigante.paginas.length}`);
    }
    expect(L.comGigante.fotos).toEqual(L.avulsoGigante.fotos);
    expect(fim - inicio + 1).toBe(L.avulsoGigante.paginas.length - 1);
    expect(sec).not.toContain('…');
  });
});

describe('J · MUTANTE — reordenar e re-descrever no ENSAIO muda os dois juntos', () => {
  it('troca de ordem + descrição nova: avulso e integrado refletem, idênticos entre si', async () => {
    let fotos = fotosSinteticas(6);
    // o técnico move a 6ª para o topo e reescreve a descrição da 3ª (por id)
    fotos = moverFoto(moverFoto(moverFoto(moverFoto(moverFoto(fotos, 'foto-6-5', -1), 'foto-6-5', -1), 'foto-6-5', -1), 'foto-6-5', -1), 'foto-6-5', -1);
    fotos = definirDescricao(fotos, 'foto-6-2', 'DESCRICAO-TROCADA-NO-ENSAIO');
    semear(fotos);
    const com = await lerCompleto(COM);
    const av = await lerAvulso();
    const esperado = fotos.map((f) => f.descricao);
    expect(esperado[0]).toBe('Imagem integrada 6.');
    const { inicio, fim } = secao(com.paginas);
    expect(legendas(com.paginas.slice(inicio, fim + 1), esperado)).toEqual(esperado);
    expect(legendas(av.paginas, esperado)).toEqual(esperado);
    expect(com.fotos).toEqual(av.fotos);
    // a 1ª foto desenhada É a antiga 6ª (pelos bytes), nos dois
    expect(com.fotos[0].png).toBe(PNG_POR_PATH.get(`org/${TAG}_imagens/u-6-5.jpg`));
    expect(com.paginas.join(' ')).not.toContain('Imagem integrada 3.');
  });
});

describe('K/L · composição do rascunho', () => {
  it('K · rascunho antigo (lista sem a folha) NÃO ganha a seção porque o container agora tem imagens', () => {
    expect(L.semSecaoComFotos.paginas.join(' ')).not.toContain(TITULO_SECAO_IMAGENS);
  });

  it('L · escolhida, a folha fica na lista do relatório na posição canônica (depois do TH, antes do Livro)', () => {
    const d = documentosFinais(['LIVRO-REGISTRO.html', 'RELATORIO-IMAGENS.html', 'TESTE-HIDROSTATICO.html'], []);
    expect(d).toEqual(['TESTE-HIDROSTATICO.html', 'RELATORIO-IMAGENS.html', 'LIVRO-REGISTRO.html']);
  });

  it('a revisão do assistente oferece a 8.4 só para container COM foto', () => {
    semear(fotosSinteticas(2));
    const c = JSON.parse(localStorage.getItem(`nr13_docs_${TAG}`)!)[0];
    expect(ensaiosRevisaveis(resumirContainer(c)).map((x) => x.doc)).toContain('RELATORIO-IMAGENS.html');
    const semFoto = { ...c, dados: { ...c.dados, imagens: { observacoes: 'só texto', fotos: [] } } };
    expect(ensaiosRevisaveis(resumirContainer(semFoto)).map((x) => x.doc)).not.toContain('RELATORIO-IMAGENS.html');
  });
});

describe('regra de emissão também no relatório completo', () => {
  it('seção escolhida com foto sem descrição BLOQUEIA a finalização, nomeando a foto', () => {
    const fotos = definirDescricao(fotosSinteticas(3), 'foto-3-1', '  ');
    const msg = impedimentoRelatorioImagens(COM, { imagens: { fotos } });
    expect(msg).toMatch(/Foto 02 está sem descrição/);
  });

  it('seção escolhida sem foto nenhuma bloqueia', () => {
    expect(impedimentoRelatorioImagens(COM, { imagens: { fotos: [] } })).toMatch(/ao menos uma imagem/);
  });

  it('seção NÃO escolhida não cobra nada (relatório sem imagens segue como era)', () => {
    expect(impedimentoRelatorioImagens(BASE, { imagens: { fotos: [] } })).toBeNull();
    expect(impedimentoRelatorioImagens(BASE, null)).toBeNull();
  });

  it('tudo descrito libera', () => {
    expect(impedimentoRelatorioImagens(COM, { imagens: { fotos: fotosSinteticas(2) } })).toBeNull();
  });
});

describe('fiação · uma lista, um desenho, sem template fantasma', () => {
  it('a folha é selecionável, fica fora dos iframes e fora do carimbo por folha', () => {
    expect(DOCUMENTOS_DISPONIVEIS).toContain('RELATORIO-IMAGENS.html');
    expect(temTemplateHtml('RELATORIO-IMAGENS.html')).toBe(false);
    expect(temTemplateHtml('VISUAL-EXTERNO.html')).toBe(true);
    expect(FOLHAS_RELATORIO_ASSINAVEIS).not.toContain('RELATORIO-IMAGENS.html');
  });

  it('o gerador do relatório desenha a 8.4 pela seção compartilhada, e ela pelo desenho do avulso', () => {
    const ger = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
    expect(ger).toContain('secaoRelatorioImagens(doc, m.relatorioImagens.desenho)');
    expect(ger).toContain('await prepararFotosDescritas(modelo.relatorioImagens.fotos)');
    const ri = readFileSync('src/features/relatorios/pdfVetorial/relatorioImagens.ts', 'utf8');
    const corpoSecao = ri.slice(ri.indexOf('export function secaoRelatorioImagens'), ri.indexOf('export interface EntradaRelatorioImagens'));
    expect(corpoSecao).toContain('desenharFotosDescritas(doc, fotos');
    const avulso = ri.slice(ri.indexOf('function emitir('), ri.indexOf('export async function gerarRelatorioImagensPdf'));
    expect(avulso).toContain('desenharFotosDescritas(doc, e.fotos');
    const modelo = readFileSync('src/features/relatorios/pdfVetorial/modelo.ts', 'utf8');
    expect(modelo).toContain('fotos: normalizarFotos((inj.imagens as { fotos?: unknown } | undefined)?.fotos)');
    const doc = readFileSync('src/features/inspecoes/documentoImagens.ts', 'utf8');
    expect(doc).toContain('await prepararFotosDescritas(fotos)');
  });
});

describe('a pendência aparece no modal de finalização, antes do clique', () => {
  it('validarParaFinalizar lista a 8.4 como OBRIGATÓRIA e não deixa finalizar', async () => {
    const { validarParaFinalizar } = await import('../validacaoFinalizacao');
    const fotos = definirDescricao(fotosSinteticas(2), 'foto-2-0', '');
    const meta = { codigo: 'R', emissao: '2026-09-24', tipoInspecao: 'Inspeção Periódica', phNome: 'ENG' } as never;
    const r = validarParaFinalizar({ meta, documentos: COM, laudo: { apto: true }, dadosContainer: { imagens: { fotos } } });
    expect(r.podeFinalizar).toBe(false);
    expect(r.obrigatorios.find((p) => p.campo === 'relatorioImagens')?.texto).toMatch(/Foto 01 está sem descrição/);
    const ok = validarParaFinalizar({ meta, documentos: BASE, laudo: { apto: true }, dadosContainer: { imagens: { fotos } } });
    expect(ok.obrigatorios.find((p) => p.campo === 'relatorioImagens')).toBeUndefined();
  });
});
