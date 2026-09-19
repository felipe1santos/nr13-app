import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Reestruturação de Calibrações (19/09/2026) · CADASTRE UMA VEZ → REUTILIZE.
 *
 * O formulário da calibração só pede o que muda a cada calibração. Item
 * (componente), padrão (Certificados) e certificado (nº e emissão) são
 * derivados — e este arquivo quebra se voltarem a ser inputs.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));
vi.mock('../../../services/fotos', () => ({ salvarArquivo: async () => ({}) }));

import {
  converterForm,
  faltasDoForm,
  formDeRascunho,
  formDoComponente,
  numeroCertificadoNovo,
} from '../formCalibracao';
import { padraoInicial, padroesCompativeis, situacaoValidade, snapshotPadrao } from '../padraoCalibracao';
import FormularioCalibracao from '../FormularioCalibracao';
import type { ComponenteCal } from '../componentesService';
import type { DadosManometro, DadosPSV } from '../tipos';

const TAG = 'ZZ-UX';
const MAN: ComponenteCal = {
  id: 'comp-man',
  tipo: 'manometro',
  nome: 'ZZ-MAN-01',
  fabricante: 'WIKA',
  modelo: '232.50',
  serie: 'SER-777',
  referencia: '0 a 10',
  unidade: 'bar',
  pontos: ['0', '2', '4', '6', '8', '10'],
  criadoEm: '',
};
const PSV: ComponenteCal = { id: 'comp-psv', tipo: 'psv', nome: 'ZZ-PSV-01', fabricante: 'Niagara', serie: 'P-9', referencia: '0 a 16', unidade: 'bar', pressaoAjuste: '12', criadoEm: '' };
const PADRAO = {
  id: 'rast-1',
  nome: 'ZZ-PADRAO-01',
  aparelho: 'Manômetro digital',
  numeroSerie: 'PS-1556',
  certificadoPadrao: 'LAB-2026-5512',
  validade: '2027-01-31',
  tipoInstrumento: 'manometro',
  pdfBase64: '',
  injetarNoRelatorio: true,
  criadoEm: '01/01/2026',
};

beforeEach(() => {
  banco.clear();
  banco.set('nr13_rastreab_rast-1', PADRAO);
  banco.set('nr13_emp_' + TAG, { razaoSocial: 'Cliente ZZ' });
  banco.set('nr13_lista_phs', [{ id: 'f1', nome: 'Eng ZZ', crea: 'CREA 1', tipo: 'Engenheiro' }]);
});

describe('item calibrado vem do COMPONENTE', () => {
  it('nome, fabricante, modelo, série, faixa e unidade — sem digitar', () => {
    const f = formDoComponente(MAN, TAG);
    expect(f).toMatchObject({
      nome: 'ZZ-MAN-01', instrumento: 'ZZ-MAN-01', fabricante: 'WIKA', modelo: '232.50',
      serie: 'SER-777', referencia: '0 a 10', unidade: 'bar', empresa: 'Cliente ZZ',
    });
    // pontos são DEFAULT do componente; a calibração registra os executados
    expect(f.crescente.map((r) => r.vc)).toEqual(MAN.pontos);
  });
  it('PSV traz a pressão de ajuste do cadastro', () => {
    expect(formDoComponente(PSV, TAG).pressaoAjuste).toBe('12');
  });
});

describe('padrão vem do cadastro de CERTIFICADOS', () => {
  it('um só compatível: pré-selecionado, com série, certificado e validade derivados', () => {
    expect(padraoInicial('manometro')?.id).toBe('rast-1');
    const f = formDoComponente(MAN, TAG);
    expect(f).toMatchObject({
      padraoId: 'rast-1',
      padraoInst: 'ZZ-PADRAO-01 — Manômetro digital',
      padraoSerie: 'PS-1556',
      padraoCert: 'LAB-2026-5512',
      padraoVal: '31/01/2027',
    });
  });
  it('PSV não usa padrão de manômetro', () => {
    expect(padroesCompativeis('psv')).toEqual([]);
    expect(formDoComponente(PSV, TAG).padraoId).toBe('');
  });
  it('vários compatíveis: ninguém é escolhido por conta própria', () => {
    banco.set('nr13_rastreab_rast-2', { ...PADRAO, id: 'rast-2', nome: 'OUTRO' });
    expect(padraoInicial('manometro')).toBeNull();
  });
  it('SNAPSHOT: renovar o certificado do padrão depois não muda a calibração', () => {
    const cal = converterForm(formDoComponente(MAN, TAG), TAG, 'cal-1') as DadosManometro;
    banco.set('nr13_rastreab_rast-1', { ...PADRAO, certificadoPadrao: 'LAB-2027-0001', validade: '2028-01-31' });
    expect(cal).toMatchObject({ padraoId: 'rast-1', padraoCert: 'LAB-2026-5512', padraoVal: '31/01/2027' });
  });
  it('validade: vencido, vence em breve, válido', () => {
    const ref = new Date(2026, 8, 19);
    expect(situacaoValidade('31/08/2026', ref)).toBe('vencido');
    expect(situacaoValidade('10/10/2026', ref)).toBe('vence_em_breve');
    expect(situacaoValidade('31/01/2027', ref)).toBe('valido');
    expect(situacaoValidade('', ref)).toBe('sem_validade');
    expect(snapshotPadrao({ ...PADRAO, validade: '31/01/2027' } as never).padraoVal).toBe('31/01/2027');
  });
});

describe('certificado da calibração: número e emissão gerados', () => {
  it('nº gerado pelo sistema; rascunho mantém o MESMO nº ao continuar', () => {
    expect(numeroCertificadoNovo(123)).toBe('CERT-123');
    const f = formDoComponente(MAN, TAG);
    expect(f.numeroCertificado).toMatch(/^CERT-\d+$/);
    const cal = converterForm(f, TAG, 'cal-9') as DadosManometro;
    expect(formDeRascunho(cal, TAG).numeroCertificado).toBe(f.numeroCertificado);
  });
  it('a emissão carimba a data de emissão (não se digita)', () => {
    const src = readFileSync('src/features/calibracoes/emissaoCertificado.ts', 'utf8');
    expect(src).toContain("dataEmissao: new Date().toLocaleDateString('pt-BR')");
  });
  it('datas da calibração são as únicas obrigatórias do evento', () => {
    expect(faltasDoForm({ ...formDoComponente(MAN, TAG), dataCalibracao: '' })).toEqual(['data da calibração']);
  });
});

describe('o FORMULÁRIO renderizado não tem input para dado derivado', () => {
  function html(comp: ComponenteCal) {
    return renderToStaticMarkup(
      createElement(FormularioCalibracao, {
        tag: TAG,
        titulo: 'Nova calibração',
        inicial: formDoComponente(comp, TAG),
        componente: comp,
        lotes: [],
        loteInicial: '',
        aoSalvar: async () => {},
        aoFechar: () => {},
      }),
    );
  }
  const valoresDosInputs = (h: string) => [...h.matchAll(/<input[^>]*value="([^"]*)"/g)].map((m) => m[1]);

  it('manômetro: série/certificado/validade do padrão e fabricante/modelo/série do item são TEXTO', () => {
    const h = html(MAN);
    const valores = valoresDosInputs(h);
    for (const derivado of ['PS-1556', 'LAB-2026-5512', '31/01/2027', 'WIKA', '232.50', 'SER-777', '0 a 10']) {
      expect(valores, derivado).not.toContain(derivado);
      expect(h, derivado).toContain(derivado); // aparece — como texto
    }
    // o nº do certificado desta calibração também é texto
    expect(valores.some((v) => /^CERT-/.test(v))).toBe(false);
    // inputs de texto que sobram = só o evento: 2 datas + temperatura, umidade, local
    expect((h.match(/<input/g) ?? []).length).toBe(5);
  });

  it('PSV: mesma regra, e sem padrão cadastrado oferece o cadastro em vez de inventar', () => {
    const h = html(PSV);
    expect(valoresDosInputs(h)).not.toContain('Niagara');
    expect(h).toContain('Nenhum padrão de válvula cadastrado');
    expect(h).toContain('Informar manualmente');
  });

  it('a janela tem modo tela cheia e não fecha com clique fora', () => {
    const src = readFileSync('src/features/calibracoes/JanelaCalibracao.tsx', 'utf8');
    expect(src).toContain("data-modo={cheia ? 'cheia' : 'modal'}");
    expect(src).not.toMatch(/onClick=\{\(e\) => e\.target === e\.currentTarget/);
    expect(src).toContain('Há alterações não salvas nesta calibração.');
  });
});

describe('a página: Nova calibração e sem página inteira para calibrar', () => {
  const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
  it('CTA na lista e no equipamento; o formulário é a janela, não uma tela', () => {
    expect(pagina.match(/Nova calibração\n/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(pagina).toContain('<FormularioCalibracao');
    expect(pagina).not.toContain("tela === 'formulario'");
    expect(pagina).toContain('modo="selecao"');
  });
  it('o seletor de equipamento semeia só a TAG escolhida', () => {
    expect(pagina).toContain('const aberto = await abrirEquipamentoParaCalibracoes(t);');
  });
});

describe('registro gravado: mesmos campos de sempre (compatibilidade)', () => {
  it('manômetro e PSV gravam o snapshot nos campos lidos pelo template', () => {
    const m = converterForm(formDoComponente(MAN, TAG), TAG, 'c1') as DadosManometro;
    expect(m).toMatchObject({ tipo: 'manometro', fabricante: 'WIKA', padraoSerie: 'PS-1556', status: 'rascunho', origem: 'interna' });
    const p = converterForm(formDoComponente(PSV, TAG), TAG, 'c2') as DadosPSV;
    expect(p).toMatchObject({ tipo: 'psv', pressaoAjuste: '12', fabricante: 'Niagara' });
  });
});
