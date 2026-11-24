import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 23/11/2026 · CERTIFICADO INTERNO DE PRESSOSTATO.
 *
 * O pressostato deixou de ser "só calibração de laboratório": ganhou o mesmo
 * caminho do manômetro e da PSV — rascunho → emissão vetorial → bytes
 * arquivados. O conteúdo segue o "Relatório de Ensaio" de referência
 * (TP.DS.0090.22): set point, dois ensaios de desarme/rearme, fluido, tempo e
 * inspeção visual de nove itens. O padrão é o MANÔMETRO padrão (ou um
 * "Pressostato padrão" de Certificados).
 *
 * Massa sintética — nenhum dado de cliente.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));
vi.mock('../../../services/fotos', () => ({ salvarArquivo: async () => ({}) }));

import { INSTRUMENTOS, TIPOS_INSTRUMENTO } from '../instrumentos';
import { converterForm, formDeRascunho, formDeRevisao, formDoComponente } from '../formCalibracao';
import { padroesCompativeis } from '../padraoCalibracao';
import { arquivoCalibracao, contagemParaRelatorio, folhaDoRelatorio } from '../calibracaoService';
import { ITENS_INSPECAO_PRESSOSTATO, ehInterna, type DadosPressostato, type DadosCalibracao } from '../tipos';
import type { ComponenteCal } from '../componentesService';
import {
  TITULOS,
  camposSemanticos,
  gerarCertificadoCalibracaoPdf,
  modeloCertificado,
} from '../../relatorios/pdfVetorial/certificadoCalibracao';
import { zerarCacheFontes } from '../../relatorios/pdfVetorial/carlito';
import { temTemplateHtml } from '../../relatorios/tipos';

const TAG = 'ZZ-PRS';
const PRS: ComponenteCal = {
  id: 'comp-prs',
  tipo: 'pressostato',
  nome: 'ZZ-PRS-01',
  fabricante: 'Danfoss',
  modelo: 'KP-35',
  serie: 'PRS-0090',
  referencia: '0 a 300',
  unidade: 'psi',
  pressaoAjuste: '140',
  criadoEm: '',
};
const PADRAO_MAN = {
  id: 'rast-man',
  nome: 'TPMD-4/20',
  aparelho: 'Manômetro padrão',
  numeroSerie: 'MS-420',
  certificadoPadrao: 'RBC-ZZ-420',
  validade: '2027-06-30',
  tipoInstrumento: 'manometro',
  pdfBase64: '',
  injetarNoRelatorio: true,
  criadoEm: '01/01/2026',
};
const PADRAO_PRS = { ...PADRAO_MAN, id: 'rast-prs', nome: 'PP-01', aparelho: 'Pressostato padrão', tipoInstrumento: 'pressostato' };
const PADRAO_VALV = { ...PADRAO_MAN, id: 'rast-valv', nome: 'BANCADA', tipoInstrumento: 'valvula' };

beforeEach(() => {
  banco.clear();
  banco.set('nr13_emp_' + TAG, { razaoSocial: 'Cliente ZZ' });
  banco.set('nr13_lista_phs', [{ id: 'f1', nome: 'Eng ZZ', crea: 'CREA 1', tipo: 'Engenheiro' }]);
});

/** A calibração que o formulário produz, com os resultados de referência preenchidos. */
function calibracaoPreenchida(): DadosPressostato {
  const f = formDoComponente(PRS, TAG);
  f.ensaios = [
    { desarme: '140', rearme: '138' },
    { desarme: '141', rearme: '137' },
  ];
  f.fluido = 'Nitrogênio';
  f.tempoMin = '5';
  f.inspecaoVisual = Object.fromEntries(ITENS_INSPECAO_PRESSOSTATO.map((i) => [i.id, 'aprovado']));
  f.inspecaoVisual.mola = 'reprovado';
  f.statusConclusao = 'aprovado';
  return converterForm(f, TAG, 'cal-prs-1') as DadosPressostato;
}

describe('o pressostato tem modelo interno', () => {
  it('modeloInterno = pressostato; os demais sem folha continuam sem', () => {
    expect(INSTRUMENTOS.pressostato.modeloInterno).toBe('pressostato');
    // 24/11/2026 · transmissor (malha de pressão) e termostato também ganharam o seu.
    expect(TIPOS_INSTRUMENTO.filter((t) => !INSTRUMENTOS[t].modeloInterno)).toEqual(['termometro', 'vacuometro']);
  });
});

describe('formulário → registro (ida e volta)', () => {
  it('formDoComponente traz o set point do cadastro, dois ensaios vazios e os nove itens sem avaliação', () => {
    const f = formDoComponente(PRS, TAG);
    expect(f.tipo).toBe('pressostato');
    expect(f.setPoint).toBe('140');
    expect(f.unidade).toBe('psi');
    expect(f.ensaios).toEqual([
      { desarme: '', rearme: '' },
      { desarme: '', rearme: '' },
    ]);
    expect(Object.keys(f.inspecaoVisual ?? {})).toEqual(ITENS_INSPECAO_PRESSOSTATO.map((i) => i.id));
  });

  it('converterForm grava tipo pressostato, interno, rascunho, com ensaios e inspeção', () => {
    const cal = calibracaoPreenchida();
    expect(cal.tipo).toBe('pressostato');
    expect(cal.origem).toBe('interna');
    expect(cal.status).toBe('rascunho');
    expect(cal.setPoint).toBe('140');
    expect(cal.ensaios).toEqual([
      { desarme: '140', rearme: '138' },
      { desarme: '141', rearme: '137' },
    ]);
    expect(cal.fluido).toBe('Nitrogênio');
    expect(cal.tempoMin).toBe('5');
    expect(cal.inspecaoVisual.diafragma).toBe('aprovado');
    expect(cal.inspecaoVisual.mola).toBe('reprovado');
    expect(cal.responsavel?.nome).toBe('Eng ZZ');
    expect(ehInterna(cal)).toBe(true);
  });

  it('nome padrão "Pressostato" quando o componente não tem nome', () => {
    const f = formDoComponente({ ...PRS, nome: '' }, TAG);
    expect(converterForm(f, TAG, 'x').nome).toBe('Pressostato');
  });

  it('rascunho e revisão voltam ao formulário com os mesmos resultados', () => {
    const cal = calibracaoPreenchida();
    const r = formDeRascunho(cal, TAG);
    expect(r.tipo).toBe('pressostato');
    expect(r.ensaios).toEqual(cal.ensaios);
    expect(r.inspecaoVisual?.mola).toBe('reprovado');
    expect(r.numeroCertificado).toBe(cal.numeroCertificado);
    const rev = formDeRevisao({ ...cal, status: 'emitido' }, TAG);
    expect(rev.substitui).toBe(cal.id);
    expect(rev.setPoint).toBe('140');
    // de volta ao registro, idêntico nos resultados
    const de_novo = converterForm(r, TAG, cal.id) as DadosPressostato;
    expect(de_novo.ensaios).toEqual(cal.ensaios);
    expect(de_novo.inspecaoVisual).toEqual(cal.inspecaoVisual);
  });
});

describe('padrões compatíveis', () => {
  it('pressostato aceita o manômetro padrão e o pressostato padrão — nunca a válvula', () => {
    banco.set('nr13_rastreab_rast-man', PADRAO_MAN);
    banco.set('nr13_rastreab_rast-prs', PADRAO_PRS);
    banco.set('nr13_rastreab_rast-valv', PADRAO_VALV);
    expect(padroesCompativeis('pressostato').map((r) => r.id).sort()).toEqual(['rast-man', 'rast-prs']);
    // manômetro e PSV inalterados
    expect(padroesCompativeis('manometro').map((r) => r.id)).toEqual(['rast-man']);
    expect(padroesCompativeis('psv').map((r) => r.id)).toEqual(['rast-valv']);
  });

  it('um só compatível (o manômetro padrão): pré-selecionado no formulário', () => {
    banco.set('nr13_rastreab_rast-man', PADRAO_MAN);
    expect(formDoComponente(PRS, TAG)).toMatchObject({ padraoId: 'rast-man', padraoCert: 'RBC-ZZ-420', padraoVal: '30/06/2027' });
  });
});

describe('relatório: só entra o emitido, pelos bytes', () => {
  it('folha só-vetorial: rascunho fora, emitido entra, contagem diz "pressostato"', () => {
    const cal = calibracaoPreenchida();
    expect(arquivoCalibracao(cal)).toBe('CERTIFICADO-CAL-PRESSOSTATO.html');
    expect(temTemplateHtml('CERTIFICADO-CAL-PRESSOSTATO.html')).toBe(false);
    expect(folhaDoRelatorio(cal)).toBeNull();
    const emitido = { ...cal, status: 'emitido' } as DadosCalibracao;
    expect(folhaDoRelatorio(emitido)).toBe('CERTIFICADO-CAL-PRESSOSTATO.html?calibId=cal-prs-1');
    expect(contagemParaRelatorio([emitido])).toBe('1 pressostato');
  });

  it('o anexo ao relatório nunca monta iframe para folha sem template', () => {
    const src = readFileSync('src/features/relatorios/pdfVetorial/certificados.ts', 'utf8');
    expect(src).toContain('if (!temTemplateHtml(documentos[i]))');
  });
});

describe('modelo do certificado', () => {
  it('título, set point, ensaios, inspeção e definições próprias', () => {
    const m = modeloCertificado(calibracaoPreenchida(), null);
    expect(m.tipo).toBe('pressostato');
    expect(m.titulo).toBe(TITULOS.pressostato);
    expect(m.titulo).toBe('CERTIFICADO DE CALIBRAÇÃO PRESSOSTATO');
    expect(m.resultados).toMatchObject({
      tipo: 'pressostato',
      unidade: 'psi',
      setPoint: '140',
      ensaios: [
        { desarme: '140', rearme: '138' },
        { desarme: '141', rearme: '137' },
      ],
      fluido: 'Nitrogênio',
      tempoMin: '5',
    });
    const r = m.resultados as Extract<typeof m.resultados, { tipo: 'pressostato' }>;
    expect(r.inspecao.map((l) => l.item)).toEqual(ITENS_INSPECAO_PRESSOSTATO.map((i) => i.rotulo));
    expect(r.inspecao.find((l) => l.item === 'Mola')?.condicao).toBe('REPROVADO');
    expect(r.inspecao.find((l) => l.item === 'Diafragma')?.condicao).toBe('APROVADO');
    expect(m.definicoes.map((d) => d.termo)).toContain('Pressão de Desarme:');
    expect(m.rascunho).toBe(true);
  });

  it('sem fluido/tempo: as colunas não saem; ensaio vazio vira ----', () => {
    const cal = { ...calibracaoPreenchida(), fluido: '', tempoMin: '', ensaios: [{ desarme: '', rearme: '' }] };
    const r = modeloCertificado(cal, null).resultados as Extract<
      ReturnType<typeof modeloCertificado>['resultados'],
      { tipo: 'pressostato' }
    >;
    expect(r.fluido).toBeNull();
    expect(r.tempoMin).toBeNull();
    expect(r.ensaios).toEqual([{ desarme: '----', rearme: '----' }]);
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

describe('PDF vetorial do pressostato', () => {
  beforeAll(() => {
    zerarCacheFontes();
    vi.stubGlobal('fetch', async (url: string) => {
      const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
      return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('o texto extraído traz título, desarme/rearme, set point, inspeção e todos os campos', async () => {
    const cal = { ...calibracaoPreenchida(), status: 'emitido' as const };
    const m = modeloCertificado(cal, { razao: 'ZZ ENGENHARIA SINTETICA LTDA' });
    const r = await gerarCertificadoCalibracaoPdf(m, { logo: null, rubrica: null, selo: null });
    const texto = await textoDoPdf(r.bytes);
    expect(texto).toContain('PRESSOSTATO');
    expect(texto).toContain('DESARME');
    expect(texto).toContain('REARME');
    expect(texto).toContain('SETPOINT(PSI)');
    expect(texto).toContain('Diafragma');
    expect(texto).toContain('Nitrogênio');
    for (const [campo, valor] of Object.entries(camposSemanticos(m))) {
      if (valor === '') continue;
      const esperado = campo === 'resultados.unidade' ? valor.toUpperCase() : valor;
      expect(texto, `campo ${campo}`).toContain(esperado.replace(/\s+/g, ''));
    }
    // nada abaixo do rodapé
    for (const fundo of r.geometria.fundoConteudo) expect(fundo).toBeLessThanOrEqual(r.geometria.limiteConteudo + 0.01);
    expect(r.paginas).toBe(1);
  });
});
