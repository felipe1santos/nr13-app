/**
 * Fase 6.1 (24/09/2026) · P0 — ABRIR O PRONTUÁRIO NÃO GRAVA A MEDIÇÃO.
 *
 * `Prontuarios.tsx` gravava `nr13_med_grid_<TAG>` e `nr13_med_esp_<TAG>` pelo
 * `salvar` ao ABRIR o prontuário (e ao trocar o container): VAZIAS sem container
 * escolhido, a grade do container com ele. As chaves são do editor de medições
 * do RELATÓRIO — a correção manual, a espessura requerida digitada (7,77 no
 * caso reproduzido no lab) e o aparelho sumiam do servidor.
 *
 * Agora a espessura do container vai ENTREGUE ao gerador (`FontesProntuario`),
 * no padrão da Fase 5.1. Estes testes travam:
 *
 * - o gerador não lê nem grava as duas chaves, e não grava NADA;
 * - o conteúdo técnico é o MESMO que a gravação antiga produzia (paridade);
 * - container A × B trocam o PDF sem tocar na grade global G;
 * - a capa não pega o responsável do último relatório montado;
 * - a página não tem mais caminho de escrita dessas chaves.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const upserts: unknown[] = [];
vi.mock('../../../services/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: async (x: unknown) => {
        upserts.push(x);
        return { error: null };
      },
    }),
    storage: {},
  },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { montarModeloProntuario } from '../../relatorios/pdfVetorial/modeloProntuario';
import { gerarProntuarioVetorial } from '../../relatorios/pdfVetorial/gerarProntuario';
import { zerarCacheFontes } from '../../relatorios/pdfVetorial/carlito';
import { pontosUltrassom } from '../../relatorios/pdfVetorial/modelo';
import {
  espessuraDoContainer,
  espessuraDoProntuarioSalvo,
  itensDoPalcoDaEspessura,
} from '../espessuraProntuario';
import { sobreporItens } from '../../../services/palco';
import type { ContainerInspecao } from '../../inspecoes/tipos';

const TAG = 'ZZ-P61-A';
const TAG_B = 'ZZ-P61-B';

/** A grade GLOBAL do editor do relatório — reconhecível, com requerida manual 7,77. */
const GRADE_G = {
  containerId: 'cont-do-relatorio',
  ts: { angulos: ['0', '90', '180', '270'], linhas: [['10,11', '10,11', '10,11', '10,11']] },
  casco: { angulos: ['0', '90', '180', '270'], linhas: [['9,22', '9,22', '9,22', '9,22']] },
  ti: { angulos: ['0', '90', '180', '270'], linhas: [['8,33', '8,33', '8,33', '8,33']] },
};
const ESP_G = {
  sup: '10,11',
  casco: '9,22',
  inf: '8,33',
  aparelho: 'APARELHO-GLOBAL-G',
  pontos: [{ id: 'c1', espMinRequerida: '7,77' }],
};

function container(id: string, base: number, aparelho: string): ContainerInspecao {
  const v = (d: number) => String(base + d).replace('.', ',');
  return {
    id,
    nome: id,
    criadoEm: '24/09/2026',
    ensaios: ['ultrassom'],
    dados: {
      ultrassom: {
        aparelho,
        medidas: {
          ts: { '0': v(0.01), '90': v(0.02), '180': v(0.03), '270': v(0.04) },
          c1: { '0': v(0.11), '90': v(0.12), '180': v(0.13), '270': v(0.14) },
          ti: { '0': v(0.21), '90': v(0.22), '180': v(0.23), '270': v(0.24) },
        },
      },
    },
  } as unknown as ContainerInspecao;
}
const CONT_A = container('cont-A', 5, 'APARELHO-A');
const CONT_B = container('cont-B', 6, 'APARELHO-B');

function semear(tag = TAG, containerEnsaioId?: string) {
  localStorage.setItem(`nr13_info_${tag}`, JSON.stringify({ tipo: 'caldeira', descricao: 'CALDEIRA P61' }));
  localStorage.setItem(`nr13_med_grid_${tag}`, JSON.stringify(GRADE_G));
  localStorage.setItem(`nr13_med_esp_${tag}`, JSON.stringify(ESP_G));
  localStorage.setItem(`nr13_docs_${tag}`, JSON.stringify([CONT_A, CONT_B]));
  localStorage.setItem(`nr13_prontuario_${tag}`, JSON.stringify({ tag, containerEnsaioId }));
  localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razaoSocial: 'ZZ ENGENHARIA LTDA' }));
}

function retrato(): Record<string, string> {
  const r: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    r[k] = localStorage.getItem(k)!;
  }
  return r;
}

const valoresDe = (tag: string, e = espessuraDoProntuarioSalvo(tag)) =>
  montarModeloProntuario(tag, { espessura: e }).ultrassom.pontos.flatMap((p) => p.medidas);

beforeEach(() => {
  localStorage.clear();
  upserts.length = 0;
});

describe('A/B/C · o gerador não lê nem grava nr13_med_grid_/nr13_med_esp_', () => {
  it('montar o modelo e gerar a espessura não mudam NENHUMA chave (sem container)', () => {
    semear(TAG);
    const antes = retrato();
    const m = montarModeloProntuario(TAG);
    expect(retrato()).toEqual(antes);
    expect(upserts).toHaveLength(0);
    // Sem container: a seção sai vazia — como sempre saiu —, e a grade global
    // do relatório NÃO aparece no prontuário.
    expect(m.ultrassom.pontos).toEqual([]);
    expect(m.ultrassom.aparelho).toBeNull();
  });

  it('F · a requerida manual 7,77 e a grade G continuam byte a byte', () => {
    semear(TAG, 'cont-A');
    const grid = localStorage.getItem(`nr13_med_grid_${TAG}`);
    const esp = localStorage.getItem(`nr13_med_esp_${TAG}`);
    montarModeloProntuario(TAG);
    montarModeloProntuario(TAG, { espessura: espessuraDoContainer(CONT_B) });
    expect(localStorage.getItem(`nr13_med_grid_${TAG}`)).toBe(grid);
    expect(localStorage.getItem(`nr13_med_esp_${TAG}`)).toBe(esp);
    expect(JSON.parse(esp!).pontos[0].espMinRequerida).toBe('7,77');
  });

  it('o modelo nunca devolve valores de G, com ou sem container', () => {
    semear(TAG, 'cont-A');
    for (const e of [espessuraDoContainer(null), espessuraDoContainer(CONT_A), espessuraDoContainer(CONT_B)]) {
      const vals = valoresDe(TAG, e);
      expect(vals).not.toContain('10,11');
      expect(vals).not.toContain('9,22');
      expect(vals).not.toContain('8,33');
    }
    expect(montarModeloProntuario(TAG).ultrassom.aparelho).not.toBe('APARELHO-GLOBAL-G');
  });
});

describe('D/E · container A × B trocam o documento, não o global', () => {
  it('A mostra A, B mostra B; G intacto', () => {
    semear(TAG, 'cont-A');
    const antes = retrato();
    const a = montarModeloProntuario(TAG, { espessura: espessuraDoContainer(CONT_A) });
    const b = montarModeloProntuario(TAG, { espessura: espessuraDoContainer(CONT_B) });
    expect(a.ultrassom.aparelho).toBe('APARELHO-A');
    expect(b.ultrassom.aparelho).toBe('APARELHO-B');
    expect(a.ultrassom.pontos.flatMap((p) => p.medidas)).toContain('5,11');
    expect(b.ultrassom.pontos.flatMap((p) => p.medidas)).toContain('6,11');
    expect(retrato()).toEqual(antes);
  });

  it('sem fontes, vale o container do prontuário SALVO', () => {
    semear(TAG, 'cont-B');
    expect(montarModeloProntuario(TAG).ultrassom.aparelho).toBe('APARELHO-B');
  });

  it('PARIDADE · o conteúdo é o mesmo que a gravação antiga produzia', () => {
    // O caminho antigo: gravar a grade do container nas chaves e o gerador ler
    // `pontosUltrassom(tag, medEsp, medEsp)` com a grade da chave.
    for (const c of [CONT_A, CONT_B, null]) {
      localStorage.clear();
      const e = espessuraDoContainer(c);
      localStorage.setItem(`nr13_med_grid_${TAG}`, JSON.stringify(e.grade));
      localStorage.setItem(`nr13_med_esp_${TAG}`, JSON.stringify(e.medEsp));
      const antigo = pontosUltrassom(TAG, e.medEsp, e.medEsp);
      localStorage.clear();
      const novo = montarModeloProntuario(TAG, { espessura: e }).ultrassom.pontos;
      expect(novo).toEqual(antigo);
    }
  });
});

describe('I · duas TAGs não se contaminam', () => {
  it('A, B, A de novo — cada um com o seu container', () => {
    semear(TAG, 'cont-A');
    localStorage.setItem(`nr13_info_${TAG_B}`, JSON.stringify({ tipo: 'caldeira' }));
    localStorage.setItem(`nr13_docs_${TAG_B}`, JSON.stringify([CONT_B]));
    localStorage.setItem(`nr13_prontuario_${TAG_B}`, JSON.stringify({ tag: TAG_B, containerEnsaioId: 'cont-B' }));
    const a1 = montarModeloProntuario(TAG);
    const b = montarModeloProntuario(TAG_B);
    const a2 = montarModeloProntuario(TAG);
    expect(a1.ultrassom.aparelho).toBe('APARELHO-A');
    expect(b.ultrassom.aparelho).toBe('APARELHO-B');
    expect(a2).toEqual(a1);
  });
});

describe('J · o responsável da capa é o engenheiro do PRONTUÁRIO', () => {
  const lista = [
    { id: 'eng-pront', nome: 'ENG DO PRONTUARIO', crea: 'CREA-111', tipo: 'Engenheiro' },
    { id: 'eng-rel', nome: 'ENG DE OUTRO RELATORIO', crea: 'CREA-999', tipo: 'Engenheiro' },
  ];
  const metaDeOutroRelatorio = {
    phNome: 'ENG DE OUTRO RELATORIO',
    phCrea: 'CREA-999',
    assinantes: { engenheiro: { nome: 'ENG DE OUTRO RELATORIO', crea: 'CREA-999' } },
  };

  it('a meta do último relatório montado não vaza para a capa', () => {
    semear(TAG);
    localStorage.setItem('nr13_lista_phs', JSON.stringify(lista));
    localStorage.setItem('nr13_relatorio_meta_atual', JSON.stringify(metaDeOutroRelatorio));
    localStorage.setItem(`nr13_assinantes_pront_${TAG}`, JSON.stringify({ engenheiroId: 'eng-pront', tecnicoId: null }));
    expect(montarModeloProntuario(TAG).responsavel).toEqual({ nome: 'ENG DO PRONTUARIO', registro: 'CREA-111' });
  });

  it('sem engenheiro escolhido: travessão, não o de outro documento', () => {
    semear(TAG);
    localStorage.setItem('nr13_lista_phs', JSON.stringify(lista));
    localStorage.setItem('nr13_relatorio_meta_atual', JSON.stringify(metaDeOutroRelatorio));
    expect(montarModeloProntuario(TAG).responsavel).toEqual({ nome: null, registro: null });
  });
});

describe('G/H · cache sem a TAG: nada é criado', () => {
  it('sem chave nenhuma o modelo sai vazio e não grava vazio', () => {
    const m = montarModeloProntuario(TAG);
    expect(m.ultrassom.pontos).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});

describe('rollback em iframe · a espessura vai só ao PALCO', () => {
  it('sobreporItens troca as duas chaves no que o palco materializa', () => {
    const e = espessuraDoContainer(CONT_A);
    const itens = sobreporItens(
      [
        { chave: `nr13_med_grid_${TAG}`, valor: JSON.stringify(GRADE_G) },
        { chave: `nr13_info_${TAG}`, valor: '{}' },
      ],
      itensDoPalcoDaEspessura(TAG, e),
    );
    expect(itens.filter((i) => i.chave === `nr13_med_grid_${TAG}`)).toEqual([
      { chave: `nr13_med_grid_${TAG}`, valor: JSON.stringify(e.grade) },
    ]);
    expect(itens.find((i) => i.chave === `nr13_med_esp_${TAG}`)?.valor).toBe(JSON.stringify(e.medEsp));
    expect(itens.find((i) => i.chave === `nr13_info_${TAG}`)?.valor).toBe('{}');
  });

  it('sem sobrepor, os itens passam intactos', () => {
    const itens = [{ chave: 'x', valor: '1' }];
    expect(sobreporItens(itens, undefined)).toBe(itens);
  });
});

describe('a página não tem mais caminho de escrita da medição', () => {
  const pagina = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
  const servico = readFileSync('src/features/prontuarios/espessuraProntuario.ts', 'utf8');
  const modelo = readFileSync('src/features/relatorios/pdfVetorial/modeloProntuario.ts', 'utf8');

  it('Prontuarios.tsx não cita as chaves nem importa o salvar do storage', () => {
    expect(pagina).not.toMatch(/nr13_med_(grid|esp)_\$\{/);
    expect(pagina).not.toContain('aplicarEnsaioEspessura');
    // A cópia de trabalho das folhas em iframe também deixou de ser gravada
    // (sincronizada) a cada abertura: vai ao palco, como a espessura.
    expect(pagina).not.toContain('gravarProntuarioAtual');
    expect(pagina).toMatch(/chave: CHAVE_PRONTUARIO_ATUAL, valor: JSON\.stringify\(dados\)/);
    expect(pagina).not.toMatch(/import \{[^}]*\bsalvar\b[^}]*\} from '\.\.\/services\/storage'/);
  });

  it('o serviço da espessura só lê', () => {
    expect(servico).not.toMatch(/\bsalvar\s*\(/);
    expect(servico).not.toContain('localStorage.setItem');
  });

  it('o modelo do prontuário não lê chave de medição nem estado *_atual', () => {
    expect(modelo).not.toMatch(/ler[^;]*nr13_med_(grid|esp)_/);
    expect(modelo).not.toMatch(/ler[^;]*_atual['`]/);
  });

  it('prévia, impressão e emissão entregam a MESMA espessura', () => {
    expect(pagina.match(/gerarProntuarioVetorial\(tag, \{ espessura \}\)/g)).toHaveLength(2);
    expect(pagina).toContain('espessura={espessura}');
  });
});

describe('PDF de verdade · A e B trocam o texto, G nunca aparece', () => {
  const textos: Record<string, string> = {};
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
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const [nome, c] of [['A', CONT_A], ['B', CONT_B], ['nenhum', null]] as const) {
      localStorage.clear();
      semear(TAG, 'cont-A');
      const antes = retrato();
      const r = await gerarProntuarioVetorial(TAG, { espessura: espessuraDoContainer(c) });
      expect(retrato()).toEqual(antes);
      const doc = await pdfjs.getDocument({ data: r.bytes, useSystemFonts: true, verbosity: 0 }).promise;
      let t = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const c2 = await (await doc.getPage(i)).getTextContent();
        t += c2.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
      }
      textos[nome] = t;
    }
  }, 300_000);

  it('A', () => {
    expect(textos.A).toContain('APARELHO-A');
    expect(textos.A).toContain('5,11');
    expect(textos.A).not.toContain('APARELHO-B');
  });
  it('B', () => {
    expect(textos.B).toContain('APARELHO-B');
    expect(textos.B).toContain('6,11');
    expect(textos.B).not.toContain('APARELHO-A');
  });
  it('G não aparece em nenhum', () => {
    for (const t of Object.values(textos)) {
      expect(t).not.toContain('APARELHO-GLOBAL-G');
      expect(t).not.toContain('7,77');
      expect(t).not.toContain('10,11');
    }
  });
});
