import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { agruparPendencias, contagemPendencias, proximoDoGrupo } from './agruparPendencias';
import type { ItemFaltante } from './oQueFalta';

/**
 * O AGRUPAMENTO É DE APRESENTAÇÃO — 10/09/2026.
 *
 * Os gates aqui provam as sete condições do item 20 da rodada. A mais
 * importante delas é a primeira: **nada some**. A detecção campo a campo
 * continua sendo a de `oQueFalta`, e o gate de cobertura
 * (`emissaoVetorial.test.ts`) continua provando que todo amarelo crítico tem
 * pendência. Aqui só se prova que a lista mostrada não perde nem inventa.
 */

const item = (id: string, secao: string, extras: Partial<ItemFaltante> = {}): ItemFaltante => ({
  nome: id,
  onde: null,
  id,
  pagina: 1,
  secao,
  ...extras,
});

const AMOSTRA: ItemFaltante[] = [
  item('capa.art', 'Capa', { nome: 'Nº da A.R.T. (CREA)', onde: 'configuracoes', campoConfig: 'art' }),
  item('capa.validade', 'Capa', { nome: 'Validade da inspeção', onde: 'configuracoes', campoConfig: 'validade' }),
  item('escopo.texto', 'Escopo', { nome: 'Escopo e observações da inspeção', pagina: 2 }),
  item('th.duracao', 'Teste hidrostático', { pagina: 4 }),
  item('th.pressao-teste', 'Teste hidrostático', { pagina: 4 }),
  item('th.parecer', 'Teste hidrostático', { pagina: 4 }),
  item('ultrassom.p1', 'Ultrassom', { pagina: 5 }),
  item('ultrassom.p2', 'Ultrassom', { pagina: 5 }),
  item('datas.validade', 'Datas', { nome: 'Validade da inspeção', onde: 'configuracoes', campoConfig: 'validade' }),
  item('inspecao.art', 'Exames realizados', { nome: 'Nº da A.R.T. (CREA)', onde: 'configuracoes', campoConfig: 'art' }),
];

describe('A · nada some, B · todo campo pertence a um grupo', () => {
  it('a soma dos grupos é exatamente o conjunto de entrada', () => {
    const grupos = agruparPendencias(AMOSTRA);
    const dentro = grupos.flatMap((g) => g.itens.map((i) => i.id));
    expect(dentro.sort()).toEqual(AMOSTRA.map((i) => i.id).sort());
    // Nenhum campo em dois grupos.
    expect(new Set(dentro).size).toBe(AMOSTRA.length);
  });

  it('10 campos viram 5 ações', () => {
    // art (2 campos) · validade (2) · escopo (1) · TH (3) · ultrassom (2)
    const grupos = agruparPendencias(AMOSTRA);
    expect(grupos).toHaveLength(5);
    expect(contagemPendencias(AMOSTRA)).toEqual({ grupos: 5, campos: 10 });
  });
});

describe('C · nenhum grupo sem campo · D · preencher esvazia o grupo', () => {
  it('grupo vazio não existe', () => {
    for (const g of agruparPendencias(AMOSTRA)) expect(g.itens.length).toBeGreaterThan(0);
    expect(agruparPendencias([])).toEqual([]);
  });

  it('preencher dois dos três campos do TH deixa o grupo com um', () => {
    const restante = AMOSTRA.filter((i) => i.id !== 'th.duracao' && i.id !== 'th.pressao-teste');
    const th = agruparPendencias(restante).find((g) => g.itens[0].secao === 'Teste hidrostático')!;
    expect(th.itens).toHaveLength(1);
    // Com um campo só, o grupo passa a se chamar pelo CAMPO — "Teste
    // hidrostático (1)" diria menos do que o nome do que falta.
    expect(th.titulo).toBe('th.parecer');
    expect(th.detalhe).toBeNull();
  });

  it('preencher o último faz o grupo DESAPARECER', () => {
    const semTh = AMOSTRA.filter((i) => i.secao !== 'Teste hidrostático');
    expect(agruparPendencias(semTh).some((g) => g.titulo === 'Teste hidrostático')).toBe(false);
  });
});

describe('as duas regras de fusão', () => {
  it('o mesmo campo do painel vira UMA ação, mesmo em folhas diferentes', () => {
    // `capa.art` (p.1) e `inspecao.art` (Exames realizados) são um dado só.
    const grupos = agruparPendencias(AMOSTRA);
    const art = grupos.find((g) => g.id === 'cfg:art')!;
    expect(art.itens.map((i) => i.id)).toEqual(['capa.art', 'inspecao.art']);
    expect(art.titulo).toBe('Nº da A.R.T. (CREA)');
    // Campo de painel NÃO mostra contagem: é uma ação só, num lugar só.
    expect(art.detalhe).toBeNull();
  });

  it('a seção com vários campos mostra o nome da SEÇÃO e a contagem', () => {
    const th = agruparPendencias(AMOSTRA).find((g) => g.id === 'sec:Teste hidrostático')!;
    expect(th.titulo).toBe('Teste hidrostático');
    expect(th.detalhe).toBe('3 campos');
  });

  it('a seção com UM campo mostra o nome do campo', () => {
    const escopo = agruparPendencias(AMOSTRA).find((g) => g.id === 'sec:Escopo')!;
    expect(escopo.titulo).toBe('Escopo e observações da inspeção');
    expect(escopo.detalhe).toBeNull();
  });

  it('a ORDEM é a das folhas, não a da contagem', () => {
    const ids = agruparPendencias(AMOSTRA).map((g) => g.id);
    expect(ids).toEqual(['cfg:art', 'cfg:validade', 'sec:Escopo', 'sec:Teste hidrostático', 'sec:Ultrassom']);
  });
});

describe('F · o clique acha página e coordenada válidas', () => {
  it('o grupo leva ao PRIMEIRO campo, que é o mais acima', () => {
    const th = agruparPendencias(AMOSTRA).find((g) => g.id === 'sec:Teste hidrostático')!;
    expect(th.primeiro.id).toBe('th.duracao');
    expect(th.primeiro.pagina).toBe(4);
  });

  it('clicar de novo avança e dá a volta', () => {
    const th = agruparPendencias(AMOSTRA).find((g) => g.id === 'sec:Teste hidrostático')!;
    expect(proximoDoGrupo(th, null).id).toBe('th.duracao');
    expect(proximoDoGrupo(th, 'th.duracao').id).toBe('th.pressao-teste');
    expect(proximoDoGrupo(th, 'th.pressao-teste').id).toBe('th.parecer');
    // Fecha o ciclo em vez de travar no último.
    expect(proximoDoGrupo(th, 'th.parecer').id).toBe('th.duracao');
    // Id que não pertence ao grupo volta para o começo.
    expect(proximoDoGrupo(th, 'coisa.nenhuma').id).toBe('th.duracao');
  });
});

describe('G · o agrupamento não depende de texto visual nem de posição', () => {
  const fonte = readFileSync('src/features/relatorios/agruparPendencias.ts', 'utf8');

  it('a chave sai de `campoConfig` e `secao`, que são semânticos', () => {
    expect(fonte).toContain('it.campoConfig ? `cfg:${it.campoConfig}` : `sec:${it.secao}`');
  });

  it('nada de ler rótulo, pixel, cor ou coordenada para agrupar', () => {
    // Alvos de CÓDIGO, não de comentário: o cabeçalho do arquivo fala do
    // amarelo de propósito, e um teste que proíbe a palavra proíbe explicar.
    for (const proibido of ['innerText', 'textContent', 'getBoundingClientRect', '.rotuloCampo', 'querySelector']) {
      expect(fonte.includes(proibido), proibido).toBe(false);
    }
  });
});

describe('E · o opcional não entra — a fronteira é anterior', () => {
  const oQue = readFileSync('src/features/relatorios/oQueFalta.ts', 'utf8');

  it('só o crítico chega ao agrupamento', () => {
    // O filtro vive em `oQueFalta`, e é ele que o gate de cobertura trava. O
    // agrupamento nunca vê um opcional — e não pode ganhar um filtro próprio,
    // senão passariam a existir duas definições de "pendência".
    expect(oQue).toContain("if (c.pendencia !== 'critica') continue;");
    // E o agrupamento NÃO reclassifica: ele não toca em `pendencia` nem em
    // 'critica'/'opcional'. Se passar a tocar, existem duas definições.
    const agrupa = readFileSync('src/features/relatorios/agruparPendencias.ts', 'utf8');
    expect(agrupa).not.toContain("'critica'");
    expect(agrupa).not.toContain("'opcional'");
    expect(agrupa).not.toContain('.pendencia');
  });
});

describe('a tela usa os GRUPOS no contador', () => {
  const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');

  it('o botão conta ações, não células', () => {
    expect(previa).toContain('O que falta{grupos.length > 0 ?');
    expect(previa).not.toContain('O que falta{faltando.length > 0 ?');
  });

  it('a detecção campo a campo continua alimentando a barra', () => {
    expect(previa).toContain('setFaltando(oQueFalta(r.editaveis))');
    expect(previa).toContain('agruparPendencias(faltando)');
  });
});
