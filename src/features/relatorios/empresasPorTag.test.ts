import { describe, expect, it } from 'vitest';
import { filtrarPorEmpresa, montarMapaEmpresas } from './empresasPorTag';

const catalogo = [
  { tag: 'VP-01', clienteNome: 'Metalúrgica Alfa' },
  { tag: 'VP-02', clienteNome: 'metalúrgica alfa' },
  { tag: 'CD-01', clienteNome: 'Beta Alimentos' },
  { tag: 'AU-01', clienteNome: null },
  { tag: 'AU-02', clienteNome: '   ' },
];

describe('mapa TAG → empresa', () => {
  it('ignora TAG sem cliente e sem nome útil', () => {
    const m = montarMapaEmpresas(catalogo);
    expect(m.porTag.has('AU-01')).toBe(false);
    expect(m.porTag.has('AU-02')).toBe(false);
    expect(m.porTag.get('VP-01')).toBe('Metalúrgica Alfa');
  });

  it('lista de empresas é distinta e ordenada em pt-BR', () => {
    const m = montarMapaEmpresas(catalogo);
    expect(m.empresas).toEqual(['Beta Alimentos', 'Metalúrgica Alfa', 'metalúrgica alfa']);
  });

  it('nasce completo, e o teto marca incompleto', () => {
    expect(montarMapaEmpresas(catalogo).completo).toBe(true);
    expect(montarMapaEmpresas(catalogo, false).completo).toBe(false);
  });
});

describe('filtro por empresa', () => {
  const mapa = montarMapaEmpresas(catalogo);
  const relatorios = [
    { tag: 'VP-01', relatorioId: 'r1' },
    { tag: 'CD-01', relatorioId: 'r2' },
    { tag: 'ZZ-99', relatorioId: 'r3' }, // TAG fora do catálogo (equipamento excluído)
  ];

  it('empresa vazia não filtra nada', () => {
    expect(filtrarPorEmpresa(relatorios, mapa, '')).toHaveLength(3);
  });

  it('devolve só os relatórios da empresa escolhida', () => {
    expect(filtrarPorEmpresa(relatorios, mapa, 'Metalúrgica Alfa').map((r) => r.relatorioId))
      .toEqual(['r1']);
  });

  it('relatório de TAG desconhecida sai quando há empresa escolhida', () => {
    expect(filtrarPorEmpresa(relatorios, mapa, 'Beta Alimentos').map((r) => r.relatorioId))
      .toEqual(['r2']);
  });
});
