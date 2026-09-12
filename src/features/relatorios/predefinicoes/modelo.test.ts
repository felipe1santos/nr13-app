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

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  CHAVE_PREDEF_LEGADO,
  CHAVE_PREDEF_RELATORIO,
  comPredefinicao,
  dataBr,
  duplicar,
  filtrarPorTexto,
  gravarPredefinicoes,
  idsDoConjunto,
  listarPredefinicoes,
  nomeRepetido,
  ordenarLista,
  predefinicaoVazia,
  resumoPredefinicao,
  sanearLista,
  sanearPredefinicao,
  semPredefinicao,
  type Predefinicao,
} from './modelo';
import { conjuntoSistema, ehDoSistema, listaComSistema } from './conjuntoSistema';
import { escopoDaChave } from '../../../services/familiasChave';
import { GLOBAIS as GLOBAIS_PALCO } from '../../../services/palco';

const P = (nome: string, campos: Record<string, string>, extra: Partial<Predefinicao> = {}): Predefinicao => ({
  id: `id-${nome}`,
  nome,
  descricao: '',
  campos,
  criadoEm: '2026-09-12T00:00:00.000Z',
  atualizadoEm: '2026-09-12T00:00:00.000Z',
  versao: 1,
  ...extra,
});

beforeEach(() => localStorage.clear());

describe('saneamento — a allowlist é aplicada na LEITURA', () => {
  it('id fora da allowlist é descartado, e o resto do conjunto sobrevive', () => {
    // O gate na tela de criação não basta: um registro vindo de outro aparelho,
    // de uma versão futura ou editado à mão no storage chegaria aqui inteiro.
    const p = sanearPredefinicao({
      id: 'x',
      nome: 'Forjada',
      campos: {
        'capa.tag': 'ZZ-FALSA',
        'categoria.pmta': '99',
        'parecer.laudo': 'APTO',
        'recomendacoes.1.texto': 'legítima',
      },
    });
    expect(Object.keys(p!.campos)).toEqual(['recomendacoes.1.texto']);
  });

  it('conjunto que SÓ tem campos proibidos não existe', () => {
    expect(sanearPredefinicao({ nome: 'só proibido', campos: { 'capa.tag': 'x' } })).toBeNull();
  });

  it('sem nome, ou sem campo nenhum, não vira conjunto', () => {
    expect(sanearPredefinicao({ nome: '', campos: { 'objetivo.texto': 'a' } })).toBeNull();
    expect(sanearPredefinicao({ nome: 'vazio', campos: {} })).toBeNull();
    expect(sanearLista([null, 7, 'texto', { nome: 'x' }])).toEqual([]);
  });

  it('valor VAZIO é preservado — é o "deixar em branco no documento"', () => {
    // Um conjunto "Inspeção periódica sem recomendações" existe para LIMPAR as
    // quatro linhas. Descartar a chave vazia tornaria esse conjunto impossível.
    const p = sanearPredefinicao({
      nome: 'sem recomendações',
      campos: { 'recomendacoes.1.texto': '', 'recomendacoes.1.prazo': '' },
    });
    expect(p!.campos['recomendacoes.1.texto']).toBe('');
    expect(idsDoConjunto(p!)).toHaveLength(2);
  });

  it('valor que não é texto é descartado sem derrubar o conjunto', () => {
    const p = sanearPredefinicao({
      nome: 'mista',
      campos: { 'objetivo.texto': 'ok', 'escopo.texto': 42, 'categoria.nota': null },
    });
    expect(idsDoConjunto(p!)).toEqual(['objetivo.texto']);
  });

  it('registro corrompido no storage não derruba a barra do relatório', () => {
    localStorage.setItem(CHAVE_PREDEF_RELATORIO, '{"nao":"e uma lista"}');
    expect(listarPredefinicoes()).toEqual([]);
  });
});

describe('migração do modelo antigo (itens[] de recomendações)', () => {
  it('a chave legada é lida e convertida para campos', () => {
    localStorage.setItem(
      CHAVE_PREDEF_LEGADO,
      JSON.stringify([
        {
          id: 'velho',
          nome: 'Padrão MDK',
          criadoEm: '2026-09-10T00:00:00.000Z',
          itens: [
            { texto: 'Primeira', prazo: '30 dias' },
            { texto: 'Segunda', prazo: '' },
          ],
        },
      ]),
    );
    const [p] = listarPredefinicoes();
    expect(p.nome).toBe('Padrão MDK');
    expect(p.campos['recomendacoes.1.texto']).toBe('Primeira');
    expect(p.campos['recomendacoes.1.prazo']).toBe('30 dias');
    expect(p.campos['recomendacoes.2.texto']).toBe('Segunda');
    expect(p.campos['recomendacoes.2.prazo']).toBe('');
  });

  it('item sem TEXTO não vira linha — prazo sem recomendação não diz nada', () => {
    const p = sanearPredefinicao({
      nome: 'x',
      itens: [{ prazo: 'só prazo' }, { texto: 'vale', prazo: '60 dias' }],
    });
    expect(p!.campos['recomendacoes.1.texto']).toBe('vale');
    expect(p!.campos['recomendacoes.2.texto']).toBeUndefined();
  });

  it('a lista legada corta nas 4 linhas que a tabela tem', () => {
    const p = sanearPredefinicao({
      nome: 'longa',
      itens: ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => ({ texto: t, prazo: '' })),
    });
    expect(p!.campos['recomendacoes.4.texto']).toBe('d');
    expect(p!.campos['recomendacoes.5.texto']).toBeUndefined();
  });

  it('a chave NOVA tem precedência, e a antiga não é apagada', async () => {
    localStorage.setItem(
      CHAVE_PREDEF_LEGADO,
      JSON.stringify([{ id: 'v', nome: 'Antiga', itens: [{ texto: 'a', prazo: '' }] }]),
    );
    await gravarPredefinicoes([P('Nova', { 'objetivo.texto': 'novo' })]);
    expect(listarPredefinicoes().map((p) => p.nome)).toEqual(['Nova']);
    // O legado continua lá: é o backup de quem ainda não rodou o código novo.
    expect(localStorage.getItem(CHAVE_PREDEF_LEGADO)).not.toBeNull();
  });
});

describe('criar, editar, duplicar e excluir', () => {
  it('criar entra na lista; editar substitui POR ID e sobe a versão', () => {
    const a = P('Conformidade', { 'objetivo.texto': 'v1' });
    const lista = comPredefinicao([], a);
    expect(lista).toHaveLength(1);
    expect(lista[0].versao).toBe(1);

    const editada = comPredefinicao(lista, { ...lista[0], nome: 'Conformidade padrão' });
    expect(editada).toHaveLength(1);
    expect(editada[0].nome).toBe('Conformidade padrão');
    expect(editada[0].versao).toBe(2);
  });

  it('trocar o NOME numa edição não apaga um conjunto homônimo de outra pessoa', () => {
    // O modelo antigo substituía pelo nome. Com Editar na tela, isso apagaria o
    // conjunto de outro usuário no momento em que alguém renomeasse o seu.
    const outro = P('Não conformidade', { 'escopo.texto': 'do colega' });
    const meu = P('Rascunho', { 'objetivo.texto': 'meu' });
    const lista = comPredefinicao([outro, meu], { ...meu, nome: 'Não conformidade' });
    expect(lista).toHaveLength(2);
    expect(lista.filter((p) => p.nome === 'Não conformidade')).toHaveLength(2);
  });

  it('nome repetido é AVISO, não bloqueio', () => {
    const a = P('Padrão', { 'objetivo.texto': 'a' });
    const b = P('padrão  ', { 'escopo.texto': 'b' });
    expect(nomeRepetido([a], b)).toBe(true);
    expect(nomeRepetido([a], a)).toBe(false);
    expect(nomeRepetido([a], P('', {}))).toBe(false);
  });

  it('duplicar cria um conjunto INDEPENDENTE, com id e nome novos', () => {
    const orig = P('Base', { 'objetivo.texto': 'texto' });
    const copia = duplicar(orig, [orig]);
    expect(copia.id).not.toBe(orig.id);
    expect(copia.nome).toBe('Base (cópia)');
    expect(copia.campos).toEqual(orig.campos);
    copia.campos['objetivo.texto'] = 'mudou';
    expect(orig.campos['objetivo.texto']).toBe('texto');
  });

  it('duplicar duas vezes não produz dois rótulos iguais', () => {
    const orig = P('Base', { 'objetivo.texto': 'a' });
    const c1 = duplicar(orig, [orig]);
    const c2 = duplicar(orig, [orig, c1]);
    expect(c2.nome).toBe('Base (cópia 2)');
  });

  it('excluir tira só a apontada', () => {
    const lista = [P('A', { 'objetivo.texto': 'a' }), P('B', { 'escopo.texto': 'b' })];
    expect(semPredefinicao(lista, 'id-A').map((p) => p.nome)).toEqual(['B']);
  });

  it('a lista se ordena por nome, e não pula de lugar a cada edição', () => {
    const lista = ordenarLista([P('Zebra', { 'objetivo.texto': 'z' }), P('Arara', { 'escopo.texto': 'a' })]);
    expect(lista.map((p) => p.nome)).toEqual(['Arara', 'Zebra']);
  });

  it('vai e volta do storage pelo caminho oficial', async () => {
    await gravarPredefinicoes([
      P('Padrão MDK', { 'recomendacoes.1.texto': 'Manter calibração.', 'recomendacoes.1.prazo': 'Contínuo' }),
    ]);
    const [lida] = listarPredefinicoes();
    expect(lida.nome).toBe('Padrão MDK');
    expect(lida.campos['recomendacoes.1.prazo']).toBe('Contínuo');
  });
});

describe('o conjunto do SISTEMA', () => {
  it('vem primeiro e está marcado', () => {
    const lista = listaComSistema([P('Arara', { 'objetivo.texto': 'a' })]);
    expect(ehDoSistema(lista[0])).toBe(true);
    expect(lista[0].nome).toMatch(/Exemplo do sistema/);
    expect(ehDoSistema(lista[1])).toBe(false);
  });

  it('NÃO é persistido — gravar o descarta', async () => {
    // Persistido, ele viraria uma cópia congelada por organização: corrigir uma
    // vírgula exigiria migração, e quem tivesse editado perderia a edição.
    await gravarPredefinicoes([conjuntoSistema(), P('Minha', { 'objetivo.texto': 'x' })]);
    const gravadas = listarPredefinicoes();
    expect(gravadas.map((p) => p.nome)).toEqual(['Minha']);
    expect(gravadas.some(ehDoSistema)).toBe(false);
  });

  it('registro forjado que se diz do sistema perde a marca no saneamento', () => {
    // Sem isto, um registro inapagável entraria na lista e ninguém conseguiria
    // removê-lo pela tela.
    const p = sanearPredefinicao({ nome: 'Falso', sistema: true, campos: { 'objetivo.texto': 'x' } });
    expect(p!.sistema).toBeUndefined();
    expect(ehDoSistema(p)).toBe(false);
  });

  it('só há um conjunto com o id do sistema, mesmo se a organização gravar um homônimo', () => {
    const impostor = { ...P('Impostor', { 'objetivo.texto': 'x' }), id: conjuntoSistema().id };
    const lista = listaComSistema([impostor]);
    expect(lista.filter((p) => p.id === conjuntoSistema().id)).toHaveLength(1);
    expect(ehDoSistema(lista[0])).toBe(true);
  });

  it('todos os campos do exemplo estão na allowlist (ele passa pelo saneamento inteiro)', () => {
    const sistema = conjuntoSistema();
    const saneado = sanearPredefinicao(sistema);
    expect(Object.keys(saneado!.campos).sort()).toEqual(Object.keys(sistema.campos).sort());
  });
});

describe('busca e apresentação', () => {
  const lista = [
    P('Não conformidade', { 'objetivo.texto': 'a' }),
    P('Vaso de ar comprimido', { 'escopo.texto': 'b' }, { descricao: 'padrão do cliente X' }),
  ];

  it('filtra por nome, sem acento nem caixa', () => {
    expect(filtrarPorTexto(lista, 'NAO CONFORM').map((p) => p.nome)).toEqual(['Não conformidade']);
    expect(filtrarPorTexto(lista, 'vaso').map((p) => p.nome)).toEqual(['Vaso de ar comprimido']);
  });

  it('filtra também pela descrição, e termo vazio devolve tudo', () => {
    expect(filtrarPorTexto(lista, 'cliente X')).toHaveLength(1);
    expect(filtrarPorTexto(lista, '   ')).toHaveLength(2);
    expect(filtrarPorTexto(lista, 'nada disso')).toHaveLength(0);
  });

  it('o resumo conta campos, no singular certo', () => {
    expect(resumoPredefinicao(P('x', { 'objetivo.texto': 'a' }))).toBe('1 campo configurado');
    expect(resumoPredefinicao(P('x', { 'objetivo.texto': 'a', 'escopo.texto': 'b' }))).toBe(
      '2 campos configurados',
    );
  });

  it('data inválida não imprime "Invalid Date" na linha da lista', () => {
    expect(dataBr('')).toBe('');
    expect(dataBr('não é data')).toBe('');
    expect(dataBr('2026-09-12T00:00:00.000Z')).toMatch(/2026/);
  });

  it('um conjunto novo nasce vazio, com id próprio', () => {
    const a = predefinicaoVazia();
    const b = predefinicaoVazia();
    expect(a.id).not.toBe(b.id);
    expect(a.campos).toEqual({});
    expect(a.nome).toBe('');
  });
});

/**
 * MULTI-TENANCY.
 *
 * O isolamento não é implementado neste módulo — ele é HERDADO do caminho
 * oficial de persistência, em três camadas independentes. Este bloco prova que
 * a chave entra por esse caminho; as camadas em si são testadas onde vivem.
 */
describe('gate · isolamento por organização', () => {
  it('a chave é GLOBAL da organização, não do equipamento', () => {
    // Em escopo de TAG, a lista criada num equipamento não apareceria no
    // relatório do equipamento seguinte — que é o ponto todo da funcionalidade.
    expect(escopoDaChave(CHAVE_PREDEF_RELATORIO)).toBe('global');
    expect(escopoDaChave(CHAVE_PREDEF_LEGADO)).toBe('global');
  });

  it('NÃO vai para o palco: nenhuma folha de public/ a lê', () => {
    expect(GLOBAIS_PALCO).not.toContain(CHAVE_PREDEF_RELATORIO);
    expect(GLOBAIS_PALCO).not.toContain(CHAVE_PREDEF_LEGADO);
  });

  it('grava e lê pelo despachante oficial — nunca por supabase.from direto', () => {
    const fonte = readFileSync('src/features/relatorios/predefinicoes/modelo.ts', 'utf8');
    expect(fonte).toContain("from '../../../services/storage'");
    expect(fonte).toMatch(/\bawait salvar\(CHAVE_PREDEF_RELATORIO/);
    // Nada de atalho pelo cliente do Supabase: é o despachante que decide v1/v2,
    // enfileira, versiona e resolve conflito.
    expect(fonte).not.toMatch(/supabase\s*\.\s*from\(/);
    expect(fonte).not.toContain('services/supabase');
  });

  it('a RPC de escrita NÃO aceita org_id do cliente — a organização vem do servidor', () => {
    // Esta é a camada que impede a organização A de escrever (ou ler) o que é da
    // B mesmo que o bundle seja adulterado: não existe parâmetro para mentir.
    const sql = readFileSync('supabase/armazenamento_v2.sql', 'utf8');
    expect(sql).toMatch(/NAO EXISTE PARAMETRO org_id/i);
    expect(sql).toMatch(/org_id = public\.org_atual\(\)/);
  });

  it('o cache local é um banco POR organização', () => {
    const db = readFileSync('src/services/db.ts', 'utf8');
    expect(db).toMatch(/nr13_dados_<org_id>|nr13_dados_/);
  });
});
