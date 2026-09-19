import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../../services/storage', () => ({ ler: () => null, salvar: async () => {}, excluirChave: async () => {} }));
vi.mock('../../../services/fotos', () => ({ salvarArquivo: async () => ({}) }));

import { rotuloOpcao } from '../quadroInstrumentos';
import type { DadosManometro } from '../tipos';

/**
 * Revisão do engenheiro, fase 2 · os três defeitos que o E2E local achou na
 * CADEIA calibração → inspeção → relatório, travados aqui.
 */
describe('catálogo de Calibrações (o "bug do ZZ-UNID-BAR")', () => {
  const src = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
  it('equipamento sem calibração escondido pelo filtro padrão NÃO é anunciado como inexistente', () => {
    expect(src).toContain('const escondidosPeloFiltro = recorte.soComDocumento ? itens.length - visiveis.length : 0;');
    expect(src).toContain('escondido pelo filtro “Com calibração”');
    // o "não encontrado" só vale quando nada foi escondido
    expect(src.indexOf('escondidosPeloFiltro > 0 ?')).toBeLessThan(src.indexOf('Nenhum equipamento encontrado para'));
  });
});

describe('assistente de criação de relatório', () => {
  it('semeia a TAG antes do passo 2 (containers, lotes e calibrações num aparelho novo)', () => {
    const src = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
    const i = src.indexOf('await carregarEquipamento(tag)');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(src.indexOf('passo: 2,', i));
  });

  it('calibração avulsa sem folha (terceiro, rascunho) não é oferecida como "folha no fim"', () => {
    for (const f of ['src/features/relatorios/ModalCriarRelatorio.tsx', 'src/features/relatorios/ModalNovaInspecao.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('.filter((c) => !c.loteId && folhaDoRelatorio(c) !== null)');
    }
  });
});

describe('quadro · rótulo das opções', () => {
  const base = {
    id: 'c', tag: 'T', tipo: 'manometro', nome: 'PI', criadoEm: '', numeroCertificado: 'N-1',
    dataEmissao: '', empresa: '', endereco: '', instrumento: 'PI', fabricante: '', modelo: '', serie: '',
    referencia: '', dataCalibracao: '', dataProxCalibracao: '', tempAr: '', umidade: '', local: '',
    padraoInst: '', padraoSerie: '', padraoCert: '', padraoVal: '', statusConclusao: '', textoMotivo: '',
    crescente: [], incertezaC: '', coefC: '', decrescente: [], incertezaD: '', coefD: '',
  } as DadosManometro;
  it('legado diz "origem não informada" — não chuta "interna"', () => {
    expect(rotuloOpcao({ componente: null, calibracao: base, selecionavel: true })).toBe('PI · N-1 · origem não informada');
    expect(rotuloOpcao({ componente: null, calibracao: { ...base, origem: 'interna' }, selecionavel: true })).toBe('PI · N-1 · interna');
  });
});
