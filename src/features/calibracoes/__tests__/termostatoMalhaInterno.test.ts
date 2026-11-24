import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 24/11/2026 · TERMOSTATO e MALHA DE PRESSÃO ganham certificado interno, e o
 * certificado de pressostato/termostato passa a seguir o modelo do engenheiro
 * parceiro (Pressostato.xls, laboratório TEMPCALL): LOCAL do item, Range e
 * Diferencial, e o bloco "características metrológicas" (incerteza, erro
 * fiducial, k, Veff — opcionais, "—" quando vazios).
 *
 * - Termostato = o pressostato em TEMPERATURA (°C), contra padrão de temperatura.
 * - Malha de pressão (tipo `transmissor`) = o manômetro: pontos crescente e
 *   decrescente, contra o manômetro padrão.
 *
 * Massa sintética — nenhum dado de cliente.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', async (original) => {
  const real = await original<typeof import('../../../services/storage')>();
  return {
    ...real,
    ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
    salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
    excluirChave: async (k: string) => void banco.delete(k),
    listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
  };
});
vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return { ...real, salvarArquivo: async () => ({}) };
});

import { INSTRUMENTOS, definicaoDe, unidadesDoInstrumento } from '../instrumentos';
import { converterForm, formDeRascunho, formDoComponente } from '../formCalibracao';
import { padroesCompativeis } from '../padraoCalibracao';
import { arquivoCalibracao, contagemParaRelatorio, folhaDoRelatorio } from '../calibracaoService';
import {
  ITENS_INSPECAO_PRESSOSTATO,
  ehInterna,
  type DadosCalibracao,
  type DadosPressostato,
  type DadosTermostato,
  type DadosTransmissor,
} from '../tipos';
import type { ComponenteCal } from '../componentesService';
import {
  diferencialDoCertificado,
  diferencialDosEnsaios,
  entradaDecimal,
  entradaVeff,
  numeroDecimal,
  veffParaDocumento,
} from '../metrologiaChaveamento';
import {
  NAO_INFORMADO,
  TITULOS,
  TITULO_METROLOGIA,
  camposSemanticos,
  gerarCertificadoCalibracaoPdf,
  modeloCertificado,
} from '../../relatorios/pdfVetorial/certificadoCalibracao';
import { zerarCacheFontes } from '../../relatorios/pdfVetorial/carlito';
import { temTemplateHtml } from '../../relatorios/tipos';
import { montarModeloCaldeira } from '../../relatorios/pdfVetorial/modeloCaldeira';
import type { ModeloRelatorio } from '../../relatorios/pdfVetorial/modelo';

const TAG = 'ZZ-TST';
const TST: ComponenteCal = {
  id: 'comp-tst',
  tipo: 'termostato',
  nome: 'ZZ-TST-01',
  fabricante: 'Danfoss',
  modelo: 'KP-81',
  serie: 'TST-0121',
  referencia: '0 a 150',
  unidade: '°C',
  pressaoAjuste: '121',
  local: 'TS1',
  criadoEm: '',
};
const MALHA: ComponenteCal = {
  id: 'comp-mal',
  tipo: 'transmissor',
  nome: 'ZZ-PT-01',
  fabricante: 'Emerson',
  modelo: '3051',
  serie: 'PT-3051',
  referencia: '0 a 10',
  unidade: 'bar',
  pontos: ['0', '2,5', '5', '7,5', '10'],
  criadoEm: '',
};
const PADRAO = {
  pdfBase64: '',
  injetarNoRelatorio: true,
  criadoEm: '01/01/2026',
  certificadoPadrao: 'RBC-ZZ-1',
  validade: '2027-06-30',
  numeroSerie: 'S-1',
};
const P_MAN = { ...PADRAO, id: 'rast-man', nome: 'MP-01', tipoInstrumento: 'manometro' };
const P_TERM = { ...PADRAO, id: 'rast-term', nome: 'TP-01', aparelho: 'Termômetro padrão', tipoInstrumento: 'termometro' };
const P_TST = { ...PADRAO, id: 'rast-tst', nome: 'TS-PADRAO', tipoInstrumento: 'termostato' };
const P_PRS = { ...PADRAO, id: 'rast-prs', nome: 'PP-01', tipoInstrumento: 'pressostato' };

beforeEach(() => {
  banco.clear();
  banco.set('nr13_emp_' + TAG, { razaoSocial: 'Cliente ZZ' });
  banco.set('nr13_lista_phs', [{ id: 'f1', nome: 'Eng ZZ', crea: 'CREA 1', tipo: 'Engenheiro' }]);
});

function termostatoPreenchido(): DadosTermostato {
  const f = formDoComponente(TST, TAG);
  f.ensaios = [
    { desarme: '121,5', rearme: '118,5' },
    { desarme: '122', rearme: '118' },
  ];
  f.inspecaoVisual = Object.fromEntries(ITENS_INSPECAO_PRESSOSTATO.map((i) => [i.id, 'aprovado']));
  f.incertezaMedicao = '0,5';
  f.erroFiducial = '1,2';
  f.fatorK = '2,00';
  f.veff = '∞';
  f.statusConclusao = 'aprovado';
  return converterForm(f, TAG, 'cal-tst-1') as DadosTermostato;
}

function malhaPreenchida(): DadosTransmissor {
  const f = formDoComponente(MALHA, TAG);
  f.crescente = f.crescente.map((l, i) => ({ ...l, vi: ['0', '2,6', '5,1', '7,4', '10'][i] }));
  f.decrescente = f.decrescente.map((l, i) => ({ ...l, vi: ['0,1', '2,5', '5', '7,6', '10,1'][i] }));
  f.incertezaC = '0,05';
  f.coefC = '2';
  f.statusConclusao = 'aprovado';
  return converterForm(f, TAG, 'cal-mal-1') as DadosTransmissor;
}

// ── Instrumentos ────────────────────────────────────────────────────────────

describe('os dois instrumentos novos', () => {
  it('termostato: temperatura, modelo interno próprio, sem linha no quadro 7.1.1', () => {
    expect(INSTRUMENTOS.termostato).toMatchObject({ rotulo: 'Termostato', grandeza: 'temperatura', modeloInterno: 'termostato', checklist: null });
    expect(unidadesDoInstrumento('termostato')).toContain('°C');
    expect(unidadesDoInstrumento('termostato')).not.toContain('bar');
  });

  it('transmissor vira "Malha de pressão", com modelo interno e o MESMO id do quadro', () => {
    expect(definicaoDe('transmissor')).toMatchObject({
      rotulo: 'Malha de pressão (transmissor)',
      curto: 'Malha de pressão',
      grandeza: 'pressao',
      modeloInterno: 'transmissor',
      checklist: { id: 'inst-trans', calId: 'inst-trans-cal' },
    });
  });
});

// ── Vírgula decimal ─────────────────────────────────────────────────────────

describe('vírgula e ponto valem igual', () => {
  it('numeroDecimal lê "1,1" e "1.1" como 1,1 — nunca 11', () => {
    expect(numeroDecimal('1,1')).toBe(1.1);
    expect(numeroDecimal('1.1')).toBe(1.1);
    expect(numeroDecimal(' 140 ')).toBe(140);
    expect(numeroDecimal('')).toBeNull();
    expect(numeroDecimal('∞')).toBeNull();
    expect(numeroDecimal('abc')).toBeNull();
  });

  it('a entrada mantém o separador digitado e recusa lixo', () => {
    expect(entradaDecimal('1,1')).toBe('1,1');
    expect(entradaDecimal('1.1')).toBe('1.1');
    expect(entradaDecimal('1,1,2')).toBe('1,12');
    expect(entradaDecimal('2a,5%')).toBe('2,5');
  });

  it('Veff aceita número, "∞" e "inf"; no PDF o infinito sai por extenso (a fonte não tem ∞)', () => {
    expect(entradaVeff('50')).toBe('50');
    expect(entradaVeff('∞')).toBe('∞');
    expect(entradaVeff('inf')).toBe('∞');
    expect(entradaVeff('Infinito')).toBe('∞');
    expect(veffParaDocumento('∞')).toBe('infinito');
    expect(veffParaDocumento('')).toBeNull();
  });

  it('diferencial = média de |desarme − rearme|, com vírgula, só nos ensaios completos', () => {
    expect(diferencialDosEnsaios([{ desarme: '121,5', rearme: '118,5' }, { desarme: '122', rearme: '118' }])).toBe(3.5);
    expect(diferencialDosEnsaios([{ desarme: '140', rearme: '138' }, { desarme: '', rearme: '137' }])).toBe(2);
    expect(diferencialDosEnsaios([{ desarme: '', rearme: '' }])).toBeNull();
    expect(diferencialDoCertificado('', [{ desarme: '1,25', rearme: '1' }])).toBe('0,25');
    // o digitado vence, como foi escrito
    expect(diferencialDoCertificado('4,0', [{ desarme: '1,25', rearme: '1' }])).toBe('4,0');
  });

  it('o erro da malha de pressão é calculado com vírgula (2,5 − 2,6 = −0,10)', () => {
    const cal = malhaPreenchida();
    expect(cal.crescente[1]).toEqual({ vc: '2,5', vi: '2,6', erro: '-0,10' });
  });
});

// ── Termostato ──────────────────────────────────────────────────────────────

describe('termostato: formulário → registro', () => {
  it('set point, unidade °C e LOCAL vêm do cadastro do componente', () => {
    const f = formDoComponente(TST, TAG);
    expect(f.tipo).toBe('termostato');
    expect(f.setPoint).toBe('121');
    expect(f.unidade).toBe('°C');
    expect(f.localInstrumento).toBe('TS1');
    expect(f.ensaios).toHaveLength(2);
    expect(Object.keys(f.inspecaoVisual ?? {})).toEqual(ITENS_INSPECAO_PRESSOSTATO.map((i) => i.id));
  });

  it('converterForm grava termostato interno com os campos novos; ida e volta preserva', () => {
    const cal = termostatoPreenchido();
    expect(cal).toMatchObject({
      tipo: 'termostato',
      origem: 'interna',
      status: 'rascunho',
      unidade: '°C',
      localInstrumento: 'TS1',
      incertezaMedicao: '0,5',
      erroFiducial: '1,2',
      fatorK: '2,00',
      veff: '∞',
    });
    expect(cal.diferencial).toBeUndefined();
    expect(ehInterna(cal)).toBe(true);
    const r = formDeRascunho(cal, TAG);
    expect(r.tipo).toBe('termostato');
    expect(r.incertezaMedicao).toBe('0,5');
    expect(converterForm(r, TAG, cal.id)).toEqual({ ...cal, criadoEm: expect.any(String) });
  });

  it('nome padrão "Termostato"; sem unidade cadastrada NÃO inventa kgf/cm²', () => {
    const f = formDoComponente({ ...TST, nome: '', unidade: undefined }, TAG);
    expect(f.unidade).toBe('');
    expect(converterForm(f, TAG, 'x').nome).toBe('Termostato');
  });

  it('padrões: só de TEMPERATURA (termômetro/termostato padrão) — nunca manômetro', () => {
    for (const p of [P_MAN, P_TERM, P_TST, P_PRS]) banco.set('nr13_rastreab_' + p.id, p);
    expect(padroesCompativeis('termostato').map((r) => r.id).sort()).toEqual(['rast-term', 'rast-tst']);
    expect(padroesCompativeis('transmissor').map((r) => r.id)).toEqual(['rast-man']);
    // o pressostato continua como era
    expect(padroesCompativeis('pressostato').map((r) => r.id).sort()).toEqual(['rast-man', 'rast-prs']);
  });
});

describe('termostato: modelo do certificado', () => {
  it('título, °C, ensaios em temperatura, LOCAL, Range, Diferencial e o bloco metrológico', () => {
    const m = modeloCertificado(termostatoPreenchido(), null);
    expect(m.tipo).toBe('termostato');
    expect(m.titulo).toBe('CERTIFICADO DE CALIBRAÇÃO TERMOSTATO');
    expect(m.titulo).toBe(TITULOS.termostato);
    expect(m.item.local).toBe('TS1');
    expect(m.resultados).toMatchObject({
      tipo: 'termostato',
      unidade: '°C',
      setPoint: '121',
      range: '121',
      diferencial: '3,5',
      metrologia: { incerteza: '0,5', erroFiducial: '1,2', k: '2,00', veff: 'infinito' },
    });
    expect(m.definicoes.map((d) => d.termo)).toEqual(expect.arrayContaining(['Temperatura de Desarme:', 'Diferencial:']));
    expect(m.definicoes.map((d) => d.termo)).not.toContain('Pressão de Desarme:');
  });

  it('campos opcionais vazios saem "—"', () => {
    const cal: DadosTermostato = { ...termostatoPreenchido(), ensaios: [{ desarme: '', rearme: '' }] };
    delete cal.incertezaMedicao;
    delete cal.erroFiducial;
    delete cal.fatorK;
    delete cal.veff;
    delete cal.localInstrumento;
    const m = modeloCertificado(cal, null);
    expect(m.resultados).toMatchObject({
      diferencial: NAO_INFORMADO,
      metrologia: { incerteza: '—', erroFiducial: '—', k: '—', veff: '—' },
    });
    expect(m.item.local).toBe('----');
  });
});

// ── Malha de pressão ────────────────────────────────────────────────────────

describe('malha de pressão: o modelo do manômetro', () => {
  it('formulário traz os pontos do cadastro; registro é por pontos', () => {
    const f = formDoComponente(MALHA, TAG);
    expect(f.tipo).toBe('transmissor');
    expect(f.crescente.map((l) => l.vc)).toEqual(MALHA.pontos);
    expect(f.setPoint).toBeUndefined();
    const cal = malhaPreenchida();
    expect(cal.tipo).toBe('transmissor');
    expect(cal.decrescente[3]).toEqual({ vc: '7,5', vi: '7,6', erro: '-0,10' });
    expect(ehInterna(cal)).toBe(true);
    expect(formDeRascunho(cal, TAG).crescente[1]).toEqual({ vc: '2,5', vi: '2,6' });
    expect(converterForm(formDoComponente({ ...MALHA, nome: '' }, TAG), TAG, 'y').nome).toBe('Malha de pressão');
  });

  it('modelo: título MALHA DE PRESSÃO, resultado do manômetro, sem coluna LOCAL', () => {
    const m = modeloCertificado(malhaPreenchida(), null);
    expect(m.tipo).toBe('transmissor');
    expect(m.titulo).toBe('CERTIFICADO DE CALIBRAÇÃO MALHA DE PRESSÃO');
    expect(m.item.local).toBeNull();
    expect(m.resultados.tipo).toBe('manometro');
    expect(m.resultados).toMatchObject({ unidade: 'bar', incertezaC: '0,05', coefC: '2' });
    expect(m.definicoes.map((d) => d.termo)).toContain('Valor Nominal:');
  });
});

// ── Relatório ───────────────────────────────────────────────────────────────

describe('relatório: os dois entram como o pressostato (bytes emitidos)', () => {
  it('folha só vetorial; rascunho fora; emitido entra; contagem nomeia', () => {
    const tst = termostatoPreenchido();
    const mal = malhaPreenchida();
    expect(arquivoCalibracao(tst)).toBe('CERTIFICADO-CAL-TERMOSTATO.html');
    expect(arquivoCalibracao(mal)).toBe('CERTIFICADO-CAL-MALHA-PRESSAO.html');
    expect(temTemplateHtml('CERTIFICADO-CAL-TERMOSTATO.html')).toBe(false);
    expect(temTemplateHtml('CERTIFICADO-CAL-MALHA-PRESSAO.html')).toBe(false);
    expect(folhaDoRelatorio(tst)).toBeNull();
    const e1 = { ...tst, status: 'emitido' } as DadosCalibracao;
    const e2 = { ...mal, status: 'emitido' } as DadosCalibracao;
    expect(folhaDoRelatorio(e1)).toBe('CERTIFICADO-CAL-TERMOSTATO.html?calibId=cal-tst-1');
    expect(folhaDoRelatorio(e2)).toBe('CERTIFICADO-CAL-MALHA-PRESSAO.html?calibId=cal-mal-1');
    expect(contagemParaRelatorio([e1, e2])).toBe('1 termostato, 1 malha de pressão');
  });

  it('caldeira: malha e termostato só ganham linha com calibração OFICIAL da TAG', () => {
    const base = { ultrassom: { instrumento: { padrao: 'X' }, pontos: [] } } as unknown as ModeloRelatorio;
    const nomes = () => montarModeloCaldeira(TAG, base, null, {}).dispositivos.map((d) => d.nome);
    expect(nomes().some((n) => /Malha|Termostato/.test(n))).toBe(false);
    // rascunho não conta
    banco.set(`nr13_calibracoes_${TAG}`, [termostatoPreenchido(), malhaPreenchida()]);
    expect(nomes().some((n) => /Malha|Termostato/.test(n))).toBe(false);
    banco.set(`nr13_calibracoes_${TAG}`, [
      { ...termostatoPreenchido(), status: 'emitido' },
      { ...malhaPreenchida(), status: 'emitido' },
    ]);
    const disp = montarModeloCaldeira(TAG, base, null, {}).dispositivos;
    expect(disp.find((d) => d.nome === 'Malha de pressão - 01')).toMatchObject({ possui: true, numero: expect.any(String) });
    expect(disp.find((d) => d.nome === 'Termostato - 01')).toMatchObject({ possui: true });
    // as linhas de sempre continuam
    expect(disp.map((d) => d.nome)).toEqual(expect.arrayContaining(['Pressostato - 01']));
  });
});

// ── PDF real ────────────────────────────────────────────────────────────────

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(t.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return out.join(' ').replace(/\s+/g, '');
}

function conferirCampos(texto: string, m: ReturnType<typeof modeloCertificado>) {
  for (const [campo, valor] of Object.entries(camposSemanticos(m))) {
    if (valor === '') continue;
    const esperado = campo === 'resultados.unidade' && m.resultados.tipo !== 'manometro' ? valor.toUpperCase() : valor;
    expect(texto, `campo ${campo}`).toContain(esperado.replace(/\s+/g, ''));
  }
}

describe('PDF vetorial', () => {
  beforeAll(() => {
    zerarCacheFontes();
    vi.stubGlobal('fetch', async (url: string) => {
      const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
      return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('termostato: título, °C, Range/Diferencial, bloco metrológico — numa folha', async () => {
    const m = modeloCertificado({ ...termostatoPreenchido(), status: 'emitido' }, { razao: 'ZZ ENGENHARIA SINTETICA LTDA' });
    const r = await gerarCertificadoCalibracaoPdf(m, { logo: null, rubrica: null, selo: null });
    // `NR13_DUMP_PDF=<prefixo>` grava o PDF para a conferência visual.
    if (process.env.NR13_DUMP_PDF) writeFileSync(`${process.env.NR13_DUMP_PDF}-termostato.pdf`, r.bytes);
    const texto = await textoDoPdf(r.bytes);
    expect(texto).toContain('TERMOSTATO');
    expect(texto).toContain('TEMPERATURADEDESARME(°C)');
    expect(texto).toContain('TEMPERATURADEREARME(°C)');
    expect(texto).toContain('RANGE—SETPOINT(°C)');
    expect(texto).toContain('DIFERENCIAL(°C)');
    expect(texto).toContain(TITULO_METROLOGIA.replace(/\s+/g, ''));
    expect(texto).toContain('ERROFIDUCIAL(ÍNDICEDEEXATIDÃO)');
    expect(texto).toContain('VEFF');
    expect(texto).toContain('infinito');
    expect(texto).toContain('LOCAL');
    expect(texto).toContain('TS1');
    conferirCampos(texto, m);
    for (const fundo of r.geometria.fundoConteudo) expect(fundo).toBeLessThanOrEqual(r.geometria.limiteConteudo + 0.01);
    expect(r.paginas).toBe(1);
  }, 30_000);

  it('malha de pressão: título e as duas tabelas do manômetro', async () => {
    const m = modeloCertificado({ ...malhaPreenchida(), status: 'emitido' }, { razao: 'ZZ ENGENHARIA SINTETICA LTDA' });
    const r = await gerarCertificadoCalibracaoPdf(m, { logo: null, rubrica: null, selo: null });
    if (process.env.NR13_DUMP_PDF) writeFileSync(`${process.env.NR13_DUMP_PDF}-malha.pdf`, r.bytes);
    const texto = await textoDoPdf(r.bytes);
    expect(texto).toContain('MALHADEPRESSÃO');
    expect(texto).toContain('SENTIDOCRESCENTE(bar)');
    expect(texto).toContain('SENTIDODECRESCENTE(bar)');
    conferirCampos(texto, m);
    expect(r.paginas).toBe(1);
  }, 30_000);

  it('pressostato LEGADO (sem os campos novos, sem status) continua gerando', async () => {
    const legado = {
      id: 'cal-prs-velho',
      tag: TAG,
      tipo: 'pressostato',
      nome: 'PS antigo',
      criadoEm: '01/11/2026',
      numeroCertificado: 'CERT-1',
      dataEmissao: '01/11/2026',
      empresa: 'Cliente ZZ',
      endereco: '',
      instrumento: 'PS antigo',
      fabricante: '',
      modelo: '',
      serie: '',
      referencia: '',
      dataCalibracao: '01/11/2026',
      dataProxCalibracao: '01/11/2027',
      tempAr: '',
      umidade: '',
      local: '',
      padraoInst: '',
      padraoSerie: '',
      padraoCert: '',
      padraoVal: '',
      statusConclusao: 'aprovado',
      textoMotivo: '',
      unidade: 'bar',
      setPoint: '8',
      ensaios: [
        { desarme: '8,2', rearme: '7,6' },
        { desarme: '8,1', rearme: '7,7' },
      ],
      inspecaoVisual: {},
    } as DadosPressostato;
    const m = modeloCertificado(legado, null);
    expect(m.titulo).toBe(TITULOS.pressostato);
    expect(m.responsavel).toBeNull();
    expect(m.item.local).toBe('----');
    expect(m.resultados).toMatchObject({
      tipo: 'pressostato',
      range: '8',
      diferencial: '0,5',
      metrologia: { incerteza: '—', erroFiducial: '—', k: '—', veff: '—' },
    });
    const r = await gerarCertificadoCalibracaoPdf(m, { logo: null, rubrica: null, selo: null });
    const texto = await textoDoPdf(r.bytes);
    expect(texto).toContain('PRESSÃODEDESARME(BAR)');
    expect(texto).toContain('DIFERENCIAL(BAR)');
    conferirCampos(texto, m);
    expect(r.paginas).toBe(1);
  }, 30_000);
});
