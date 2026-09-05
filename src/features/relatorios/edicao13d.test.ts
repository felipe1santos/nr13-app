import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { carregarMedicoes, salvarMedicoes } from './medicoesEspessura';
import { montarModeloRelatorio } from './pdfVetorial/modelo';
import { celulaVazia, corDeFundo, AMARELO_PREVIA } from './pdfVetorial/documento';
import { oQueFalta } from './oQueFalta';
import { CHAVE_PREVIA, previaAtual, previaConfigurada } from './previaDocumento';

/**
 * 13D · o gate da PRÉVIA QUE É O DOCUMENTO.
 *
 * Três perguntas, e as três já falharam em produção alguma vez:
 *
 * 1. **Paridade do ultrassom.** O que o inspetor edita na grade React aparece na
 *    tabela do Modelo Novo, com os ângulos certos? Até a 13C não aparecia — a
 *    folha desenhava `us.pontos`/`us.medidas` (o container), e a grade
 *    (`nr13_med_grid_`) só alimentava o prontuário. Documento e prontuário
 *    diziam coisas diferentes sobre a mesma medição.
 * 2. **O amarelo não vaza.** Realce de campo vazio é da revisão. Se ele chegar
 *    ao PDF arquivado, o documento assinado sai com marcação de rascunho.
 * 3. **A prévia não emite.** Ela devolve bytes. Não publica artefato, não
 *    calcula SHA oficial, não grava `pdfRef`, não mexe em histórico, vencimento
 *    nem Livro.
 */

const TAG = 'VP-13D';

function gravarCru(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

/** O container de inspeção como o formulário de campo o grava. */
function comContainer() {
  gravarCru('nr13_injecao_atual', {
    ultrassom: {
      colunas: { ts: 2, casco: 4, ti: 2 },
      pontos: [
        { id: 'ts1', rotulo: 'TS-1', regiao: 'ts' },
        { id: 'c1', rotulo: 'C-1', regiao: 'casco' },
        { id: 'c2', rotulo: 'C-2', regiao: 'casco' },
        { id: 'ti1', rotulo: 'TI-1', regiao: 'ti' },
      ],
    },
  });
}

beforeEach(() => localStorage.clear());

describe('paridade: a grade editada no React é a tabela do Modelo Novo', () => {
  it('os valores digitados chegam ao documento', async () => {
    comContainer();
    const grade = carregarMedicoes(TAG).grade;
    grade.casco.linhas[0] = ['6,35', '6,30', '6,10', '6,20'];
    grade.casco.linhas[1] = ['5,90', '5,95', '6,00', '5,85'];
    grade.ts.linhas[0] = ['8,00', '7,90'];
    grade.ti.linhas[0] = ['8,10', '8,05'];
    await salvarMedicoes(TAG, grade);

    const pontos = montarModeloRelatorio(TAG).ultrassom.pontos;
    const c1 = pontos.find((p) => p.ponto === 'C-1');
    expect(c1?.medidas).toEqual(['6,35', '6,30', '6,10', '6,20']);
    expect(c1?.menor).toBe('6,1');
  });

  it('os ÂNGULOS saem da mesma fórmula da folha, região a região', async () => {
    comContainer();
    const grade = carregarMedicoes(TAG).grade;
    grade.casco.linhas[0] = ['6,35', '6,30', '6,10', '6,20'];
    grade.ts.linhas[0] = ['8,00', '7,90'];
    await salvarMedicoes(TAG, grade);

    const pontos = montarModeloRelatorio(TAG).ultrassom.pontos;
    // 4 colunas → 0/90/180/270; 2 colunas → 0/180. `Math.round(i * 360 / n)`.
    expect(pontos.find((p) => p.ponto === 'C-1')?.angulos).toEqual(['0', '90', '180', '270']);
    expect(pontos.find((p) => p.ponto === 'TS-1')?.angulos).toEqual(['0', '180']);
  });

  it('cada ponto do container vira uma linha, na região dele', async () => {
    comContainer();
    const grade = carregarMedicoes(TAG).grade;
    for (const r of ['ts', 'casco', 'ti'] as const) {
      grade[r].linhas = grade[r].linhas.map((l) => l.map(() => '5,00'));
    }
    await salvarMedicoes(TAG, grade);

    const pontos = montarModeloRelatorio(TAG).ultrassom.pontos;
    expect(pontos.map((p) => p.ponto)).toEqual(['TS-1', 'C-1', 'C-2', 'TI-1']);
    expect(pontos.map((p) => p.regiao)).toEqual(['Tampo superior', 'Casco', 'Casco', 'Tampo inferior']);
  });

  it('a espessura requerida continua vindo do container, por id do ponto', async () => {
    gravarCru('nr13_injecao_atual', {
      ultrassom: {
        colunas: { ts: 2, casco: 2, ti: 2 },
        pontos: [{ id: 'c1', rotulo: 'C-1', regiao: 'casco', espMinRequerida: '4,50' }],
      },
    });
    await salvarMedicoes(TAG, carregarMedicoes(TAG).grade);
    expect(montarModeloRelatorio(TAG).ultrassom.pontos[0].requerida).toBe('4,50');
  });

  it('ponto sem medida nenhuma não vira fileira de travessões no papel', async () => {
    comContainer();
    const grade = carregarMedicoes(TAG).grade;
    grade.casco.linhas[0] = ['6,35', '6,30', '6,10', '6,20'];
    await salvarMedicoes(TAG, grade);

    // Regra anterior à 13D, e que continua valendo: linha sem medida e sem
    // espessura requerida não é informação — é papel ocupado.
    expect(montarModeloRelatorio(TAG).ultrassom.pontos.map((p) => p.ponto)).toEqual(['C-1']);
  });

  it('o que o campo mediu no celular aparece mesmo sem ninguém abrir a grade', () => {
    gravarCru('nr13_injecao_atual', {
      ultrassom: {
        colunas: { casco: 2 },
        pontos: [{ id: 'c1', rotulo: 'C-1', regiao: 'casco' }],
        medidas: { c1: { '0': '7.10', '180': '7.05' } },
      },
    });
    expect(montarModeloRelatorio(TAG).ultrassom.pontos[0].medidas).toEqual(['7,10', '7,05']);
  });
});

describe('preview × final: o amarelo é da revisão, nunca do documento', () => {
  const vazia = { texto: '—', valor: true };

  it('campo vazio fica amarelo na prévia', () => {
    expect(corDeFundo(vazia, 'preview')).toBe(AMARELO_PREVIA);
  });

  it('o MESMO campo sai branco no documento final', () => {
    expect(corDeFundo(vazia, 'final')).toBe('#ffffff');
  });

  it('campo preenchido nunca é amarelo, nem na prévia', () => {
    expect(corDeFundo({ texto: '6,35', valor: true }, 'preview')).toBe('#ffffff');
  });

  it('rótulo mantém o cinza da referência nos dois modos', () => {
    const rotulo = { texto: 'PMTA', rotulo: true };
    expect(corDeFundo(rotulo, 'preview')).toBe(corDeFundo(rotulo, 'final'));
    expect(corDeFundo(rotulo, 'preview')).not.toBe(AMARELO_PREVIA);
  });

  it('célula que não é de valor não conta como vazia', () => {
    expect(celulaVazia({ texto: '' })).toBe(false);
    expect(celulaVazia({ texto: '', valor: true })).toBe(true);
    expect(celulaVazia({ texto: '-', valor: true })).toBe(true);
  });
});

describe('a prévia não emite documento', () => {
  const fonte = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
  const previa = fonte.slice(fonte.indexOf('export async function gerarPreviaRelatorio'));

  it('devolve bytes, páginas e tempo — nada mais', () => {
    expect(previa).toMatch(/Promise<\{\s*bytes:[^}]*paginas:[^}]*ms:[^}]*\}>/s);
    expect(previa).not.toMatch(/pdfRef|sha256|publicarArtefato|salvarHistorico/);
  });

  it('roda em modo preview e sem certificados', () => {
    expect(previa).toContain("modo: 'preview'");
    expect(previa).toContain('certificados: false');
  });

  it('o gerador só usa o amarelo quando quem chamou pediu preview', () => {
    expect(fonte).toContain("opcoes.modo ?? 'final'");
  });
});

describe('painel "o que falta" — complementar ao amarelo, mesma fonte', () => {
  it('lista os campos vazios do MESMO modelo que desenha o PDF', () => {
    comContainer();
    const itens = oQueFalta(montarModeloRelatorio(TAG));
    const nomes = itens.map((i) => i.nome);
    expect(nomes).toContain('Número do relatório');
    expect(nomes).toContain('Laudo (apto / inapto)');
  });

  it('cada item vazio aponta para onde se preenche, quando é dentro do relatório', () => {
    comContainer();
    const itens = oQueFalta(montarModeloRelatorio(TAG));
    expect(itens.find((i) => i.nome === 'Número do relatório')?.onde).toBe('configuracoes');
    expect(itens.find((i) => i.nome === 'Laudo (apto / inapto)')?.onde).toBe('laudo');
  });

  it('campo preenchido sai da lista', () => {
    comContainer();
    gravarCru(`nr13_laudo_${TAG}`, { apto: true });
    const nomes = oQueFalta(montarModeloRelatorio(TAG)).map((i) => i.nome);
    expect(nomes).not.toContain('Laudo (apto / inapto)');
  });

  it('sem ponto de medição nenhum, aponta a grade — e não uma linha por ponto', () => {
    const itens = oQueFalta({
      ...montarModeloRelatorio(TAG),
      ultrassom: { ...montarModeloRelatorio(TAG).ultrassom, pontos: [] },
    });
    expect(itens.filter((i) => i.onde === 'medicoes').map((i) => i.nome)).toEqual(['Medições de espessura']);
  });
});

describe('rollback: a prévia antiga continua a um passo', () => {
  it('sem configuração, a prévia é a de sempre (iframe)', () => {
    expect(previaConfigurada()).toBe('iframe');
    expect(previaAtual('')).toBe('iframe');
  });

  it('a chave da organização escolhe a prévia nova', () => {
    gravarCru(CHAVE_PREVIA, { previa: 'vetorial' });
    expect(previaAtual('')).toBe('vetorial');
  });

  it('a URL vence a chave, nos dois sentidos', () => {
    gravarCru(CHAVE_PREVIA, { previa: 'vetorial' });
    expect(previaAtual('?previa=iframe')).toBe('iframe');
    localStorage.clear();
    expect(previaAtual('?previa=vetorial')).toBe('vetorial');
  });

  it('valor desconhecido cai no caminho antigo, não em tela em branco', () => {
    expect(previaAtual('?previa=holograma')).toBe('iframe');
    gravarCru(CHAVE_PREVIA, { previa: 42 });
    expect(previaConfigurada()).toBe('iframe');
  });
});
