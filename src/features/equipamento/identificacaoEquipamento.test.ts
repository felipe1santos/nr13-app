/**
 * Fase 5 — a ficha do equipamento tem UMA foto de identificação, e o histórico
 * não é destruído para acomodar isso.
 */
import { describe, it, expect } from 'vitest';
import {
  identificacaoDe,
  comNovaIdentificacao,
  semIdentificacao,
} from './identificacaoEquipamento';
import type { FotoEquipamento } from './tipos';

const foto = (id: number, isCapa = false): FotoEquipamento => ({
  id,
  src: '',
  ref: { bucket: 'inspecao', path: `org/TAG/${id}.jpg`, mimeType: 'image/jpeg', tamanho: 100 },
  isCapa,
});

describe('identificacaoDe — o mesmo critério de sempre', () => {
  it('a marcada como capa', () => {
    expect(identificacaoDe([foto(1), foto(2, true), foto(3)])?.id).toBe(2);
  });

  it('sem marca, a primeira — é o que `CAPA.html` faz', () => {
    expect(identificacaoDe([foto(7), foto(8)])?.id).toBe(7);
  });

  it('lista vazia não vira erro', () => {
    expect(identificacaoDe([])).toBeNull();
  });
});

describe('trocar a foto de identificação', () => {
  it('a nova identifica e a anterior CONTINUA na lista', () => {
    const antes = [foto(1, true)];
    const depois = comNovaIdentificacao(antes, foto(2));

    expect(depois).toHaveLength(2);
    expect(identificacaoDe(depois)?.id).toBe(2);
    // A anterior segue registrada: o relatório LEGADO remonta `CAPA.html` a
    // partir desta chave, e o arquivo dela precisa continuar existindo.
    expect(depois.find((f) => f.id === 1)).toBeDefined();
    expect(depois.find((f) => f.id === 1)?.ref?.path).toBe('org/TAG/1.jpg');
  });

  it('só UMA fica marcada, mesmo com equipamento antigo de várias fotos', () => {
    const legado = [foto(1, true), foto(2), foto(3)];
    const depois = comNovaIdentificacao(legado, foto(9));

    expect(depois.filter((f) => f.isCapa)).toHaveLength(1);
    expect(depois).toHaveLength(4);
  });

  it('não muda a lista original', () => {
    const antes = [foto(1, true)];
    comNovaIdentificacao(antes, foto(2));
    expect(antes).toHaveLength(1);
    expect(antes[0].isCapa).toBe(true);
  });
});

describe('remover a foto de identificação', () => {
  it('equipamento com uma foto fica sem identificação', () => {
    expect(semIdentificacao([foto(1, true)])).toEqual([]);
  });

  it('equipamento ANTIGO: a anterior volta a identificar, e nada some do resto', () => {
    const legado = [foto(1), foto(2), foto(3, true)];
    const depois = semIdentificacao(legado);

    expect(depois).toHaveLength(2);
    expect(identificacaoDe(depois)?.id).toBe(2);
    expect(depois.map((f) => f.id)).toEqual([1, 2]);
  });

  it('lista vazia não vira erro', () => {
    expect(semIdentificacao([])).toEqual([]);
  });

  it('nunca deixa duas marcadas', () => {
    const depois = semIdentificacao([foto(1, true), foto(2, true), foto(3)]);
    expect(depois.filter((f) => f.isCapa)).toHaveLength(1);
  });
});
