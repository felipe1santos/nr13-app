import { describe, expect, it } from 'vitest';
import {
  FILTRO_DOC_VAZIO,
  passaNoFiltro,
  periodoDe,
  temFiltroDoc,
} from './ModalFiltrosDocumentos';
import type { DocumentoProntuario } from './indiceProntuarios';
import { iniciaisDe, tomDoNome } from '../cadastros/AvatarPessoa';

const doc = (p: Partial<DocumentoProntuario> = {}): DocumentoProntuario => ({
  id: 'P-1',
  tag: 'VP-01',
  equipamento: 'Vaso pulmão',
  cliente: 'ACME',
  tipo: 'Vaso de Pressão',
  categoria: 'III',
  situacao: 'emitido',
  revisao: 1,
  numero: 'REL-1',
  atualizadoEm: '2026-09-06T10:00:00.000Z',
  temArquivo: true,
  paginas: 4,
  pdfPendente: false,
  ...p,
});

describe('o filtro de documentos', () => {
  it('o vazio não filtra nada', () => {
    expect(temFiltroDoc(FILTRO_DOC_VAZIO)).toBe(false);
    expect(passaNoFiltro(doc(), FILTRO_DOC_VAZIO)).toBe(true);
  });

  it('acende quando qualquer campo é preenchido', () => {
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, situacao: 'rascunho' })).toBe(true);
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, de: '2026-09-01' })).toBe(true);
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, revisao: '2' })).toBe(true);
  });

  it('recorta por período pelo DIA, não pelo instante', () => {
    const f = { ...FILTRO_DOC_VAZIO, de: '2026-09-06', ate: '2026-09-06' };
    // Mesmo dia, hora diferente: entra. Comparar ISO inteiro deixaria de fora
    // tudo que foi emitido depois das 00:00 do dia final.
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-06T23:59:00.000Z' }), f)).toBe(true);
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-05T23:59:00.000Z' }), f)).toBe(false);
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-07T00:01:00.000Z' }), f)).toBe(false);
  });

  it('documento SEM data só sai quando o recorte é de data', () => {
    const semData = doc({ atualizadoEm: '' });
    expect(passaNoFiltro(semData, FILTRO_DOC_VAZIO)).toBe(true);
    expect(passaNoFiltro(semData, { ...FILTRO_DOC_VAZIO, cliente: 'ACME' })).toBe(true);
    // Pedindo período, ele não tem como provar que está dentro.
    expect(passaNoFiltro(semData, { ...FILTRO_DOC_VAZIO, de: '2026-09-01' })).toBe(false);
  });

  it('recorta por cliente, TAG, tipo, categoria, situação e revisão', () => {
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, cliente: 'OUTRA' })).toBe(false);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, tag: 'VP-01' })).toBe(true);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, tipo: 'Caldeira' })).toBe(false);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, categoria: 'III' })).toBe(true);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, situacao: 'rascunho' })).toBe(false);
    expect(passaNoFiltro(doc({ revisao: 2 }), { ...FILTRO_DOC_VAZIO, revisao: '2' })).toBe(true);
  });

  it('entrada antiga sem tipo/categoria não é escondida por acaso', () => {
    // O índice anterior a 07/09/2026 não guardava os dois campos. Sem filtro
    // deles, a linha continua aparecendo.
    const antiga = doc({ tipo: undefined, categoria: undefined });
    expect(passaNoFiltro(antiga, FILTRO_DOC_VAZIO)).toBe(true);
    // Com filtro, ela sai — e é por isso que o seletor só aparece quando há
    // valor para oferecer.
    expect(passaNoFiltro(antiga, { ...FILTRO_DOC_VAZIO, tipo: 'Vaso de Pressão' })).toBe(false);
  });
});

describe('atalhos de período', () => {
  const hoje = new Date(2026, 8, 7); // 07/09/2026

  it('hoje é o mesmo dia nos dois extremos', () => {
    expect(periodoDe('hoje', hoje)).toEqual({ de: '2026-09-07', ate: '2026-09-07' });
  });

  it('7 dias INCLUI hoje — são 7, não 8', () => {
    expect(periodoDe('7', hoje)).toEqual({ de: '2026-09-01', ate: '2026-09-07' });
  });

  it('30 dias idem', () => {
    expect(periodoDe('30', hoje)).toEqual({ de: '2026-08-09', ate: '2026-09-07' });
  });
});

describe('avatar do funcionário', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciaisDe('João Silva')).toBe('JS');
    expect(iniciaisDe('Maria')).toBe('M');
  });

  it('ignora partículas — "João da Silva" é JS, não JD', () => {
    expect(iniciaisDe('João da Silva')).toBe('JS');
    expect(iniciaisDe('Ana dos Santos')).toBe('AS');
  });

  it('sem nome não inventa letra', () => {
    expect(iniciaisDe('')).toBe('');
    expect(iniciaisDe('   ')).toBe('');
  });

  it('a cor é estável para a mesma pessoa', () => {
    // É o que faz o avatar ajudar a achar alguém na lista, em vez de ser só
    // um círculo colorido.
    expect(tomDoNome('João Silva')).toBe(tomDoNome('João Silva'));
    expect(tomDoNome('João Silva')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
