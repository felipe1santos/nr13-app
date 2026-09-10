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

import {
  CHAVE_PREDEF_RECOMENDACOES,
  LINHAS_RECOMENDACAO,
  aplicarPredefinicao,
  comPredefinicao,
  gravarPredefinicoes,
  idRecomendacao,
  listarPredefinicoes,
  recomendacoesDoDocumento,
  resumoPredefinicao,
  sanearPredefinicoes,
  semPredefinicao,
  type PredefinicaoRecomendacoes,
} from './predefinicoes';
import { escopoDaChave } from '../../services/familiasChave';
import { GLOBAIS as GLOBAIS_PALCO } from '../../services/palco';

/**
 * A biblioteca de recomendações da empresa.
 *
 * Medido no E2E do "RELATORIO DA IA": das 28 células digitadas depois do
 * documento montado, 8 são as recomendações e seus prazos — e se repetem quase
 * sem mudança de uma inspeção para a outra.
 */
const PREF = (nome: string, itens: { texto: string; prazo: string }[]): PredefinicaoRecomendacoes => ({
  id: `id-${nome}`,
  nome,
  criadoEm: '2026-09-10T00:00:00.000Z',
  itens,
});

beforeEach(() => localStorage.clear());

describe('aplicar: escreve de cima para baixo e LIMPA o que sobra', () => {
  it('cada item vira o par texto+prazo daquela linha', () => {
    const v = aplicarPredefinicao(
      PREF('padrão', [
        { texto: 'Solicitar o relatório de inspeção inicial.', prazo: '90 dias' },
        { texto: 'Manter os instrumentos calibrados.', prazo: 'Contínuo' },
      ]),
    );
    expect(v[idRecomendacao(1, 'texto')]).toBe('Solicitar o relatório de inspeção inicial.');
    expect(v[idRecomendacao(1, 'prazo')]).toBe('90 dias');
    expect(v[idRecomendacao(2, 'texto')]).toBe('Manter os instrumentos calibrados.');
  });

  it('as linhas que sobram vão VAZIAS — não fica resto da vez anterior', () => {
    // Aplicar duas sobre um documento que tinha quatro deixaria as duas últimas
    // do relatório passado misturadas com as novas, e ninguém revisa uma tabela
    // que parece já preenchida.
    const v = aplicarPredefinicao(PREF('curta', [{ texto: 'Uma só.', prazo: '30 dias' }]));
    expect(v[idRecomendacao(2, 'texto')]).toBe('');
    expect(v[idRecomendacao(2, 'prazo')]).toBe('');
    expect(v[idRecomendacao(4, 'texto')]).toBe('');
  });

  it('escreve exatamente as 4 linhas da tabela do documento — nem mais, nem menos', () => {
    const v = aplicarPredefinicao(PREF('x', [{ texto: 'a', prazo: 'b' }]));
    expect(Object.keys(v)).toHaveLength(LINHAS_RECOMENDACAO * 2);
    expect(v[idRecomendacao(LINHAS_RECOMENDACAO + 1, 'texto')]).toBeUndefined();
  });

  it('o id do campo é o MESMO que o gerador registra', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain('id: `recomendacoes.${n}.texto`');
    expect(folhas).toContain('id: `recomendacoes.${n}.prazo`');
    // ...e a tabela do documento tem as mesmas 4 linhas que este módulo assume.
    expect(folhas).toContain('linhas: [1, 2, 3, 4].map((n) => [');
    expect(LINHAS_RECOMENDACAO).toBe(4);
  });
});

describe('guardar o que está no documento', () => {
  it('pega só as linhas com TEXTO', () => {
    const itens = recomendacoesDoDocumento({
      'recomendacoes.1.texto': 'Primeira',
      'recomendacoes.1.prazo': '60 dias',
      'recomendacoes.2.texto': '   ',
      'recomendacoes.2.prazo': '90 dias',
      'recomendacoes.3.texto': 'Terceira',
      'recomendacoes.3.prazo': '',
    });
    // A linha 2 tem prazo e não tem recomendação: no papel ela não existe.
    expect(itens).toEqual([
      { texto: 'Primeira', prazo: '60 dias' },
      { texto: 'Terceira', prazo: '' },
    ]);
  });

  it('documento sem recomendação nenhuma não vira predefinição', () => {
    expect(recomendacoesDoDocumento({})).toEqual([]);
  });
});

describe('a lista da empresa', () => {
  it('o mesmo NOME substitui, não duplica', () => {
    const a = PREF('Padrão', [{ texto: 'velha', prazo: '30 dias' }]);
    const b = { ...PREF('padrão  ', [{ texto: 'nova', prazo: '60 dias' }]), id: 'outro' };
    const lista = comPredefinicao([a], b);
    expect(lista).toHaveLength(1);
    expect(lista[0].itens[0].texto).toBe('nova');
  });

  it('a mais recente fica no topo', () => {
    const lista = comPredefinicao([PREF('A', [{ texto: 'a', prazo: '' }])], PREF('B', [{ texto: 'b', prazo: '' }]));
    expect(lista.map((p) => p.nome)).toEqual(['B', 'A']);
  });

  it('excluir tira só a apontada', () => {
    const lista = [PREF('A', [{ texto: 'a', prazo: '' }]), PREF('B', [{ texto: 'b', prazo: '' }])];
    expect(semPredefinicao(lista, 'id-A').map((p) => p.nome)).toEqual(['B']);
  });

  it('vai e volta do storage', async () => {
    await gravarPredefinicoes([PREF('Padrão', [{ texto: 'Manter calibração.', prazo: 'Contínuo' }])]);
    const lida = listarPredefinicoes();
    expect(lida).toHaveLength(1);
    expect(lida[0].nome).toBe('Padrão');
    expect(lida[0].itens[0].prazo).toBe('Contínuo');
  });

  it('registro corrompido não derruba a barra do relatório', () => {
    localStorage.setItem(CHAVE_PREDEF_RECOMENDACOES, '{"nao":"e uma lista"}');
    expect(listarPredefinicoes()).toEqual([]);
    expect(sanearPredefinicoes([null, 7, { nome: '' }, { nome: 'sem itens', itens: [] }])).toEqual([]);
  });

  it('item sem texto é descartado, e a lista corta em 4', () => {
    const [p] = sanearPredefinicoes([
      {
        id: 'x',
        nome: 'n',
        itens: [
          { texto: 'a' },
          { prazo: 'só prazo' },
          { texto: 'b' },
          { texto: 'c' },
          { texto: 'd' },
          { texto: 'e' },
        ],
      },
    ]);
    expect(p.itens.map((i) => i.texto)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('o resumo conta certo no singular', () => {
    expect(resumoPredefinicao(PREF('x', [{ texto: 'a', prazo: '' }]))).toBe('1 recomendação');
    expect(resumoPredefinicao(PREF('x', [{ texto: 'a', prazo: '' }, { texto: 'b', prazo: '' }]))).toBe(
      '2 recomendações',
    );
  });
});

describe('gate · onde a chave mora e como o botão aplica', () => {
  it('é GLOBAL da organização — a biblioteca é da empresa', () => {
    // Se caísse em escopo de TAG, a lista criada num equipamento não apareceria
    // no relatório do equipamento seguinte, que é o ponto todo.
    expect(escopoDaChave(CHAVE_PREDEF_RECOMENDACOES)).toBe('global');
  });

  it('NÃO vai para o palco: nenhuma folha de public/ a lê', () => {
    expect(GLOBAIS_PALCO).not.toContain(CHAVE_PREDEF_RECOMENDACOES);
  });

  it('o botão fica ao lado do "O que falta"', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    const barra = previa.slice(previa.indexOf('const controles = ('));
    const trecho = barra.slice(0, barra.indexOf('const irAtePendencia'));
    expect(trecho.indexOf('O que falta')).toBeLessThan(trecho.indexOf('Predefinições'));
  });

  it('aplicar entra pelo caminho oficial dos overrides, numa gravação só', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    const fn = previa.slice(previa.indexOf('const usarPredefinicao = useCallback('));
    const corpo = fn.slice(0, fn.indexOf('const camposPorPagina'));
    expect(corpo).toContain('overrideDeTexto(texto, auto)');
    // UMA chamada a `aplicar`, fora do laço: aplicar campo a campo redesenharia
    // o documento oito vezes.
    expect((corpo.match(/await aplicar\(/g) ?? []).length).toBe(1);
  });
});
