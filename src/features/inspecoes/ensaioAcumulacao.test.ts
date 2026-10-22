/**
 * ENSAIO DE ACUMULAÇÃO — Rodada 1 (21/10/2026). Só caldeira.
 *
 * Os números de referência são os do laudo CAL-25/5340 (TP.EA.0193.22):
 * 10,80 bar → 1,080 MPa · 1080 kPa · 157 psi · 11,01 kgf/cm² · 10,80 bar,
 * PMTA 1,10 MPa, ensaio em 08/06/2022 com manômetro de validade 29/03/2022
 * (o erro que o laudo tinha e que aqui vira alerta).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  FATOR_LIMITE_ACUMULACAO,
  LAUDO_PADRAO,
  NORMAS_PADRAO,
  PROCEDIMENTO_PADRAO,
  dadosPadraoAcumulacao,
  instrumentoDoEnsaio,
  prefillAcumulacao,
  pressaoMaximaMpa,
  pressaoNasCincoUnidades,
  rastreavelAcumulacao,
  verificarAcumulacao,
  type DadosAcumulacao,
} from './acumulacao';
import { FATORES_CONVERSAO } from '../../calc/unidades';
import { POR_MPA } from '../../calc/pressaoCincoUnidades';
import { DOCUMENTOS_DISPONIVEIS } from '../relatorios/tipos';
import { ENSAIOS_DISPONIVEIS } from './tipos';
import { documentosDoTipo, ensaiosDoTipo } from '../equipamento/perfilEquipamento';
import { resumirContainer } from './resumoContainer';
import { documentosFinais } from '../relatorios/wizardCriacao';
import { validarParaFinalizar } from '../relatorios/validacaoFinalizacao';
import { secoesPresentes } from '../relatorios/pdfVetorial/composicao';
import { gerarRelatorioVetorial } from '../relatorios/pdfVetorial/gerarRelatorio';
import { zerarCacheFontes } from '../relatorios/pdfVetorial/carlito';
import type { RelatorioMeta } from '../relatorios/tipos';

const ensaio = (parcial: Partial<DadosAcumulacao>): DadosAcumulacao => ({ ...dadosPadraoAcumulacao('2022-06-08'), ...parcial });

describe('pressão em cinco unidades', () => {
  it('10,80 bar do laudo de referência → 1,080 · 1080 · 157 · 11,01 · 10,80', () => {
    expect(pressaoNasCincoUnidades({ pressaoMaxima: '10,80', pressaoUnidade: 'bar' })).toEqual({
      MPa: '1,080',
      kPa: '1080',
      psi: '157',
      'kgf/cm²': '11,01',
      bar: '10,80',
    });
  });

  it('digitar em qualquer unidade dá o mesmo valor técnico', () => {
    const emBar = pressaoMaximaMpa({ pressaoMaxima: '10,8', pressaoUnidade: 'bar' })!;
    expect(pressaoMaximaMpa({ pressaoMaxima: '1080', pressaoUnidade: 'kPa' })).toBeCloseTo(emBar, 9);
    expect(pressaoMaximaMpa({ pressaoMaxima: '1.08', pressaoUnidade: 'MPa' })).toBeCloseTo(emBar, 9);
    expect(pressaoMaximaMpa({ pressaoMaxima: '156.6417', pressaoUnidade: 'psi' })).toBeCloseTo(emBar, 4);
  });

  it('kgf/cm² e bar usam os MESMOS fatores do resto do sistema', () => {
    expect(POR_MPA['kgf/cm²']).toBe(FATORES_CONVERSAO.TECNICO.mult);
    expect(POR_MPA.bar).toBe(FATORES_CONVERSAO.PETROBRAS.mult);
  });

  it('sem número, sem conversão — nada de zero inventado', () => {
    expect(pressaoNasCincoUnidades({ pressaoMaxima: '', pressaoUnidade: 'bar' })).toBeNull();
    expect(pressaoNasCincoUnidades({ pressaoMaxima: '0', pressaoUnidade: 'bar' })).toBeNull();
  });
});

describe('validações', () => {
  const PMTA = 1.1;

  it('término antes ou igual ao início é ERRO', () => {
    expect(verificarAcumulacao(ensaio({ horaInicio: '10:10', horaTermino: '09:47' }), { pmtaMpa: PMTA })).toContainEqual(
      expect.objectContaining({ campo: 'horaTermino', nivel: 'erro' }),
    );
    expect(verificarAcumulacao(ensaio({ horaInicio: '09:47', horaTermino: '09:47' }), { pmtaMpa: PMTA }).map((a) => a.campo)).toContain('horaTermino');
    expect(verificarAcumulacao(ensaio({ horaInicio: '09:47', horaTermino: '10:10' }), { pmtaMpa: PMTA }).map((a) => a.campo)).not.toContain('horaTermino');
  });

  it('não conformidade SIM sem justificativa é ERRO; com justificativa, não', () => {
    expect(verificarAcumulacao(ensaio({ ncEncontrada: 'sim' }), { pmtaMpa: PMTA })).toContainEqual(
      expect.objectContaining({ campo: 'justificativaNc', nivel: 'erro' }),
    );
    expect(verificarAcumulacao(ensaio({ ncEncontrada: 'sim', justificativaNc: 'Vazamento no flange.' }), { pmtaMpa: PMTA })).toEqual([]);
  });

  it('o caso do laudo (10,80 bar contra PMTA 11,00 bar) NÃO alerta', () => {
    const avisos = verificarAcumulacao(ensaio({ pressaoMaxima: '10,80', pressaoUnidade: 'bar' }), { pmtaMpa: PMTA });
    expect(avisos.map((a) => a.campo)).not.toContain('pressaoMaxima');
  });

  it('acima de 1,06 × PMTA ALERTA (nunca erro), citando o PG-67.2 e o PLH', () => {
    const avisos = verificarAcumulacao(ensaio({ pressaoMaxima: '11,7', pressaoUnidade: 'bar' }), { pmtaMpa: PMTA });
    const a = avisos.find((x) => x.campo === 'pressaoMaxima')!;
    expect(a.nivel).toBe('alerta');
    expect(a.texto).toContain('PG-67.2');
    expect(a.texto).toContain('Profissional Legalmente Habilitado');
  });

  it('exatamente 1,06 × PMTA não alerta; um pouco acima, alerta — comparação numérica em MPa', () => {
    const limiteMpa = PMTA * FATOR_LIMITE_ACUMULACAO; // 1,166 MPa
    const igual = verificarAcumulacao(ensaio({ pressaoMaxima: String(limiteMpa), pressaoUnidade: 'MPa' }), { pmtaMpa: PMTA });
    expect(igual.map((x) => x.campo)).not.toContain('pressaoMaxima');
    const acima = verificarAcumulacao(ensaio({ pressaoMaxima: String(limiteMpa + 0.0001), pressaoUnidade: 'MPa' }), { pmtaMpa: PMTA });
    expect(acima.map((x) => x.campo)).toContain('pressaoMaxima');
  });

  it('sem PMTA no cadastro não há como comparar — e não se inventa alerta', () => {
    expect(verificarAcumulacao(ensaio({ pressaoMaxima: '50', pressaoUnidade: 'bar' }), { pmtaMpa: null })).toEqual([]);
  });

  it('validade da calibração ANTERIOR à data do ensaio alerta — o erro do laudo de referência', () => {
    const avisos = verificarAcumulacao(ensaio({ instrumentoValidade: '2022-03-29' }), { pmtaMpa: PMTA });
    expect(avisos).toContainEqual(expect.objectContaining({ campo: 'instrumento', nivel: 'alerta' }));
    expect(verificarAcumulacao(ensaio({ instrumentoValidade: '2023-03-29' }), { pmtaMpa: PMTA })).toEqual([]);
  });

  it('com calibração vinculada vale a validade do SNAPSHOT, não a digitada', () => {
    const d = ensaio({
      instrumentoValidade: '2030-01-01',
      instrumentoRef: {
        calibracaoId: 'cal-1',
        selecionadoEm: '2022-06-08T10:00:00Z',
        snapshot: {
          calibracaoId: 'cal-1', origem: 'terceiro', tipo: 'manometro', instrumento: 'Manômetro', fabricante: 'Stewarts',
          modelo: '', serie: 'PI-CAL-25/5340', faixa: '0 a 20', unidade: 'bar', numeroCertificado: 'TP.MN.0084.22',
          dataCalibracao: '29/03/2022', validade: '29/03/2022', emissor: 'Tecno Pressure', statusConclusao: 'aprovado', emitido: false,
        },
      },
    });
    const inst = instrumentoDoEnsaio(d);
    expect(inst.vinculado).toBe(true);
    expect(inst.identificacao).toBe('PI-CAL-25/5340');
    expect(inst.escala).toBe('0 a 20 bar');
    expect(verificarAcumulacao(d, { pmtaMpa: PMTA })).toContainEqual(expect.objectContaining({ campo: 'instrumento' }));
  });
});

describe('padrões, preenchimento e rastreável', () => {
  it('os padrões do laudo de referência', () => {
    const d = dadosPadraoAcumulacao('2026-10-21');
    expect(d.procedimento).toBe(PROCEDIMENTO_PADRAO);
    expect(PROCEDIMENTO_PADRAO).toBe('POP-TP-003');
    expect(d.normas).toBe(NORMAS_PADRAO);
    expect(NORMAS_PADRAO).toBe('NBR 12177 / NR-13');
    expect(d.laudo).toBe(LAUDO_PADRAO);
    expect(d.instrumento).toBe('Manômetro');
  });

  it('identificação, série, tipo, fabricante e cliente vêm do cadastro — sem redigitar', () => {
    const p = prefillAcumulacao(
      'CAL-25/5340',
      { tag: 'CAL-25/5340', tipo: 'caldeira', subtipo: 'flamotubular', fabricante: 'COCHRAN Ltd.', numeroSerie: '25/5340' },
      { razaoSocial: 'SCHLUMBERGER SERVIÇOS DE PETRÓLEO', endereco: 'Rua Internacional, 500', bairro: 'Novo Cavaleiro', cidade: 'Macaé', estado: 'RJ' },
    );
    expect(p).toEqual({
      contratante: 'SCHLUMBERGER SERVIÇOS DE PETRÓLEO',
      endereco: 'Rua Internacional, 500, Novo Cavaleiro, Macaé/RJ',
      identificacao: 'CAL-25/5340',
      serie: '25/5340',
      tipoEquipamento: 'Caldeira Flamotubular',
      fabricante: 'COCHRAN Ltd.',
    });
  });

  it('o nº rastreável é o do relatório + "/EA"; no avulso não há número inventado', () => {
    expect(rastreavelAcumulacao('REL-1790000000000')).toBe('REL-1790000000000/EA');
    expect(rastreavelAcumulacao(null)).toBeNull();
    expect(rastreavelAcumulacao('  ')).toBeNull();
  });
});

describe('isolamento por tipo — vaso e autoclave não mudam', () => {
  it('vaso e autoclave recebem a MESMA lista de ensaios e de folhas de sempre', () => {
    expect(ensaiosDoTipo('vaso')).toBe(ENSAIOS_DISPONIVEIS);
    expect(ensaiosDoTipo('autoclave')).toBe(ENSAIOS_DISPONIVEIS);
    expect(ensaiosDoTipo(null)).toBe(ENSAIOS_DISPONIVEIS);
    expect(documentosDoTipo('vaso')).toBe(DOCUMENTOS_DISPONIVEIS);
    expect(documentosDoTipo('autoclave')).toBe(DOCUMENTOS_DISPONIVEIS);
    expect(ENSAIOS_DISPONIVEIS.map((e) => e.value)).not.toContain('acumulacao');
    expect(DOCUMENTOS_DISPONIVEIS).not.toContain('ENSAIO-ACUMULACAO.html');
  });

  it('caldeira oferece o ensaio; no relatório de caldeira ele é END (2.2), antes do teste de sobrepressão (3)', () => {
    expect(ensaiosDoTipo('caldeira').map((e) => e.value)).toContain('acumulacao');
    const docs = documentosDoTipo('caldeira');
    expect(docs.indexOf('ENSAIO-ACUMULACAO.html')).toBe(docs.indexOf('ULTRASSOM.html') + 1);
    expect(docs.indexOf('TESTE-HIDROSTATICO.html')).toBeGreaterThan(docs.indexOf('ENSAIO-ACUMULACAO.html'));
  });

  it('a ordem final do assistente é a do tipo; sem tipo, a de sempre', () => {
    const marcados = ['ENSAIO-ACUMULACAO.html', 'TESTE-HIDROSTATICO.html', 'CAPA.html'];
    expect(documentosFinais(marcados, [], documentosDoTipo('caldeira'))).toEqual(['CAPA.html', 'ENSAIO-ACUMULACAO.html', 'TESTE-HIDROSTATICO.html']);
    expect(documentosFinais(marcados, [])).toEqual(['CAPA.html', 'TESTE-HIDROSTATICO.html']);
  });

  it('a composição vazia ("tudo") NÃO inclui a acumulação — é seção só explícita', () => {
    expect(secoesPresentes([]).acumulacao).toBe(false);
    expect(secoesPresentes(['ENSAIO-ACUMULACAO.html']).acumulacao).toBe(true);
  });

  it('o resumo do container reconhece o ensaio salvo, e o container de vaso não muda', () => {
    const base = { id: 'c1', nome: 'C1', criadoEm: '2026-10-21' };
    const vaso = resumirContainer({ ...base, ensaios: ['checklist'], dados: {} });
    expect(vaso.ensaios.map((e) => e.ensaio)).toEqual(['checklist']);
    const cald = resumirContainer({
      ...base,
      ensaios: ['acumulacao'],
      dados: { acumulacao: ensaio({ pressaoMaxima: '10,80', resultado: 'aprovado' }) },
    });
    const r = cald.ensaios.find((e) => e.ensaio === 'acumulacao')!;
    expect(r.salvo).toBe(true);
    expect(r.rotulo).toBe('Ensaio de Acumulação');
    expect(r.data).toBe('08/06/2022');
  });
});

describe('finalização', () => {
  const meta = { codigo: 'REL-1', emissao: '21/10/2026', tipoInspecao: 'Inspeção Periódica' } as RelatorioMeta;

  it('folha escolhida e ensaio vazio impede finalizar', () => {
    const v = validarParaFinalizar({ meta, documentos: ['ENSAIO-ACUMULACAO.html'], laudo: null, dadosContainer: {} });
    expect(v.obrigatorios.map((p) => p.campo)).toContain('acumulacao');
  });

  it('erro do ensaio impede; alerta só avisa', () => {
    const v = validarParaFinalizar({
      meta,
      documentos: ['ENSAIO-ACUMULACAO.html'],
      laudo: null,
      dadosContainer: { acumulacao: ensaio({ pressaoMaxima: '13', horaInicio: '10:10', horaTermino: '09:00', resultado: 'aprovado' }) },
      pmtaMpa: 1.1,
    });
    expect(v.obrigatorios.map((p) => p.campo)).toContain('acumulacao.horaTermino');
    expect(v.opcionais.map((p) => p.campo)).toContain('acumulacao.pressaoMaxima');
    expect(v.obrigatorios.map((p) => p.campo)).not.toContain('acumulacao.pressaoMaxima');
  });

  it('sem a folha, nada sobre acumulação é cobrado', () => {
    const v = validarParaFinalizar({ meta, documentos: ['CAPA.html'], laudo: null, dadosContainer: {} });
    expect([...v.obrigatorios, ...v.opcionais].some((p) => p.campo.startsWith('acumulacao'))).toBe(false);
  });
});

// ── O PDF de verdade ────────────────────────────────────────────────────────

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const gravar = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

function montar(tipo: 'caldeira' | 'vaso', tag: string, codigo: string | null) {
  localStorage.clear();
  gravar(`nr13_info_${tag}`, {
    tag, tipo, subtipo: tipo === 'caldeira' ? 'flamotubular' : '', fabricante: 'COCHRAN Ltd.', numeroSerie: '25/5340',
    pmtaAdotadaMpa: '1.10',
  });
  gravar(`nr13_pref_unidade_${tag}`, 'SI');
  gravar(`nr13_emp_${tag}`, { razaoSocial: 'CLIENTE ACUMULACAO LTDA', cidade: 'Macaé', estado: 'RJ' });
  gravar('nr13_minha_empresa', { razao: 'EXECUTANTE', cidade: 'Macaé' });
  const meta = codigo ? { codigo, emissao: '21/10/2026', tipoInspecao: 'Inspeção Periódica', containerOrigemId: 'c-acum' } : null;
  if (meta) gravar('nr13_relatorio_meta_atual', meta);
  const dados = {
    acumulacao: ensaio({
      contratante: 'CLIENTE ACUMULACAO LTDA',
      identificacao: tag,
      tipoEquipamento: 'Caldeira Flamotubular',
      instrumentoFabricante: 'Stewarts',
      instrumentoTipo: 'Analógico',
      instrumentoIdentificacao: 'PI-CAL-25/5340',
      instrumentoEscala: '0 a 20 bar',
      instrumentoValidade: '2023-03-29',
      tempoEstabilizacaoMin: '5',
      horaInicio: '09:47',
      horaTermino: '10:10',
      pressaoMaxima: '10,80',
      pressaoUnidade: 'bar',
      valvulasSuficientes: 'sim',
      ncEncontrada: 'nao',
      resultado: 'aprovado',
      observacoes: 'OBS-ACUMULACAO-E2E',
      fotos: [
        { id: 'f1', ordem: 0, base64: PIXEL, descricao: 'PAINEL DE COMANDO' },
        { id: 'f2', ordem: 1, base64: PIXEL, descricao: 'MANÔMETRO' },
      ],
    }),
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
}

async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

describe('o documento — prévia e emissão', () => {
  beforeAll(() => {
    zerarCacheFontes();
    vi.stubGlobal('fetch', async (url: string) => {
      const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
      return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
    class ImagemFalsa {
      naturalWidth = 4;
      naturalHeight = 3;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', ImagemFalsa);
  });

  it.each(['preview', 'final'] as const)('%s · caldeira: seção 7.6, cinco unidades, rastreável único nas duas folhas', async (modo) => {
    montar('caldeira', 'CAL-25-5340', 'REL-1790000000000');
    const r = await gerarRelatorioVetorial('CAL-25-5340', {
      documentos: ['SUMARIO.html', 'INSPECOES.html', 'ENSAIO-ACUMULACAO.html'],
      certificados: false,
      modo,
    });
    if (process.env.NR13_DUMP_PDF) (await import('node:fs')).writeFileSync(`${process.env.NR13_DUMP_PDF}-${modo}.pdf`, r.bytes);
    const p = await paginasDoPdf(r.bytes);
    const tudo = p.join(' \n ');
    // Relatório COMPLETO de caldeira (tem sumário/seção 7) → gerador de caldeira: 2.2.
    const secao = p.find((x) => x.includes('2.2 ENSAIO DE ACUMULAÇÃO'))!;
    const fotos = p.find((x) => x.includes('2.2.1 REGISTRO FOTOGRÁFICO'))!;
    expect(secao).toBeDefined();
    expect(fotos).toBeDefined();
    for (const v of ['1,080', '1080', '157', '11,01', '10,80', 'POP-TP-003', 'NBR 12177 / NR-13', LAUDO_PADRAO, 'Caldeira Flamotubular', 'PI-CAL-25/5340']) {
      expect(secao).toContain(v);
    }
    // O MESMO rastreável nas duas folhas — o laudo de referência imprimia TP.VI na de fotos.
    expect(secao).toContain('REL-1790000000000/EA');
    expect(fotos).toContain('REL-1790000000000/EA');
    expect(tudo).not.toMatch(/TP\.VI/);
    // Seção 7: a grade de ensaios ganha a linha; o sumário lista a seção.
    expect(tudo).toContain('ENSAIO DE ACUMULAÇÃO');
    expect(tudo).toContain('Ensaio de acumulação');
  }, 120_000);

  it('vaso com dado de acumulação no container (não deveria acontecer) NÃO imprime nada', async () => {
    montar('vaso', 'VASO-ACUM', 'REL-1790000000001');
    const r = await gerarRelatorioVetorial('VASO-ACUM', {
      documentos: ['INSPECOES.html', 'ENSAIO-ACUMULACAO.html'],
      certificados: false,
      modo: 'final',
    });
    const tudo = (await paginasDoPdf(r.bytes)).join(' ');
    expect(tudo).not.toContain('ACUMULAÇÃO');
  }, 120_000);

  it('documento avulso (sem relatório): seção sai, rastreável não é inventado', async () => {
    montar('caldeira', 'CAL-AVULSO', null);
    const r = await gerarRelatorioVetorial('CAL-AVULSO', {
      documentos: ['ENSAIO-ACUMULACAO.html'],
      certificados: false,
      modo: 'preview',
      fontes: { meta: null, inspecao: {}, injecao: JSON.parse(localStorage.getItem('nr13_injecao_atual')!) },
    });
    const tudo = (await paginasDoPdf(r.bytes)).join(' ');
    expect(tudo).toContain('7.6 ENSAIO DE ACUMULAÇÃO');
    expect(tudo).not.toContain('/EA');
  }, 120_000);
});

describe('Duplicar relatório leva o ensaio de acumulação', () => {
  it('a montagem da cópia mantém a folha e a referência ao container (o serviço troca pelo container copiado)', async () => {
    const { montarDuplicata } = await import('../relatorios/duplicarRelatorio');
    const copia = montarDuplicata(
      {
        id: 'REL-1',
        tagVaso: 'CAL-25-5340',
        nome: 'Relatorio.pdf',
        tipo: 'Inspeção Periódica',
        data: '08/06/2022',
        documentos: ['CAPA.html', 'TESTE-HIDROSTATICO.html', 'ENSAIO-ACUMULACAO.html'],
        status: 'Aprovado',
        meta: { codigo: 'REL-1', containerOrigemId: 'c-acum', documentos: ['CAPA.html', 'ENSAIO-ACUMULACAO.html'] } as RelatorioMeta,
      },
      { codigo: 'REL-2', hojeBr: '21/10/2026', modeloDocumento: 'novo' },
    );
    expect(copia.documentos).toContain('ENSAIO-ACUMULACAO.html');
    expect(copia.meta.containerOrigemId).toBe('c-acum');
    // O rastreável é DERIVADO do código: a cópia ganha o seu, nunca o do original.
    expect(rastreavelAcumulacao(copia.meta.codigo)).toBe('REL-2/EA');
  });
});
