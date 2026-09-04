import { describe, expect, it } from 'vitest';
import {
  RECORTE_PADRAO,
  empresasDoCatalogo,
  filtrarCatalogo,
  possuiDocumento,
  precisaVarrerTudo,
} from './recorteCatalogo';

const itens = [
  { tag: 'VP-01', temProntuario: true, calibracoes: 3, clienteNome: 'Alfa' },
  { tag: 'VP-02', temProntuario: false, calibracoes: 0, clienteNome: 'Alfa' },
  { tag: 'CD-01', temProntuario: null, calibracoes: null, clienteNome: 'Beta' },
  { tag: 'AU-01', temProntuario: true, calibracoes: 1, clienteNome: null },
];

describe('null não é zero', () => {
  it('não contado responde COM documento — ausência não medida não some da tela', () => {
    expect(possuiDocumento(null)).toBe(true);
    expect(possuiDocumento(undefined)).toBe(true);
  });

  it('zero e false são ausência MEDIDA', () => {
    expect(possuiDocumento(0)).toBe(false);
    expect(possuiDocumento(false)).toBe(false);
  });

  it('qualquer contagem positiva conta', () => {
    expect(possuiDocumento(1)).toBe(true);
    expect(possuiDocumento(42)).toBe(true);
    expect(possuiDocumento(true)).toBe(true);
  });
});

describe('recorte da lista', () => {
  it('prontuários: esconde só quem comprovadamente não tem', () => {
    const r = filtrarCatalogo(itens, RECORTE_PADRAO, (i) => i.temProntuario);
    expect(r.map((i) => i.tag)).toEqual(['VP-01', 'CD-01', 'AU-01']);
  });

  it('calibrações: 0 sai, null fica', () => {
    const r = filtrarCatalogo(itens, RECORTE_PADRAO, (i) => i.calibracoes);
    expect(r.map((i) => i.tag)).toEqual(['VP-01', 'CD-01', 'AU-01']);
  });

  it('recorte desligado devolve tudo', () => {
    const r = filtrarCatalogo(itens, { soComDocumento: false, empresa: '' }, (i) => i.calibracoes);
    expect(r).toHaveLength(4);
  });

  it('empresa filtra pelo nome exato do cliente', () => {
    const r = filtrarCatalogo(itens, { soComDocumento: false, empresa: 'Alfa' }, (i) => i.calibracoes);
    expect(r.map((i) => i.tag)).toEqual(['VP-01', 'VP-02']);
  });

  it('empresa e documento se combinam', () => {
    const r = filtrarCatalogo(itens, { soComDocumento: true, empresa: 'Alfa' }, (i) => i.calibracoes);
    expect(r.map((i) => i.tag)).toEqual(['VP-01']);
  });
});

describe('lista de empresas e varredura', () => {
  it('distinta, ordenada em pt-BR e sem vazios', () => {
    expect(empresasDoCatalogo([...itens, { clienteNome: '   ' }])).toEqual(['Alfa', 'Beta']);
  });

  it('qualquer recorte do cliente obriga a varrer a lista inteira', () => {
    expect(precisaVarrerTudo(RECORTE_PADRAO)).toBe(true);
    expect(precisaVarrerTudo({ soComDocumento: false, empresa: 'Alfa' })).toBe(true);
    expect(precisaVarrerTudo({ soComDocumento: false, empresa: '' })).toBe(false);
  });
});
