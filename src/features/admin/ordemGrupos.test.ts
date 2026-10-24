import { describe, it, expect } from 'vitest';
import { ORDEM_TAG, TAGS, agruparPorTag, type TagConta } from './classificarConta';

const c = (id: string, tag: TagConta) => ({ id, tag });

describe('agruparPorTag', () => {
  it('ordena interna → vitalício → pagante → suspenso', () => {
    const grupos = agruparPorTag([c('a', 'suspenso'), c('b', 'pagante'), c('c', 'interna'), c('d', 'vitalicio')]);
    expect(grupos.map((g) => g.tag)).toEqual(['interna', 'vitalicio', 'pagante', 'suspenso']);
  });

  it('preserva a ordem recebida dentro do grupo', () => {
    const grupos = agruparPorTag([c('p2', 'pagante'), c('s1', 'suspenso'), c('p1', 'pagante')]);
    expect(grupos[0].contas.map((x) => x.id)).toEqual(['p2', 'p1']);
  });

  it('omite grupo vazio', () => {
    expect(agruparPorTag([c('p', 'pagante')]).map((g) => g.tag)).toEqual(['pagante']);
    expect(agruparPorTag([])).toEqual([]);
  });

  it('a ordem cobre todas as tags — nenhuma conta some da lista', () => {
    expect([...ORDEM_TAG].sort()).toEqual([...TAGS].sort());
  });
});
