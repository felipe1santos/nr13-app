/**
 * NR-13 2022 · alínea "n" do conteúdo mínimo do relatório (22/10/2026):
 * "número do certificado de inspeção e teste da válvula de segurança"
 * (caldeira 13.4.4.12; vaso 13.5.4.11 — "da(s) válvula(s)").
 *
 * Decisão do dono: AVISO na finalização, nunca bloqueio.
 */
import { describe, expect, it } from 'vitest';
import { temCertificadoPsv, validarParaFinalizar } from './validacaoFinalizacao';
import type { RelatorioMeta } from './tipos';

const META = { codigo: 'REL-1', emissao: '22/10/2026', tipoInspecao: 'Inspeção Periódica' } as RelatorioMeta;
const aviso = (r: ReturnType<typeof validarParaFinalizar>) => r.opcionais.find((p) => p.campo === 'certificadoPsv');

describe('aviso do certificado da PSV', () => {
  it('sem certificado de PSV em lugar nenhum: AVISA — e não bloqueia', () => {
    const r = validarParaFinalizar({ meta: META, documentos: ['CAPA.html'], laudo: null, dadosContainer: {} });
    expect(aviso(r)).toBeDefined();
    expect(r.obrigatorios.map((p) => p.campo)).not.toContain('certificadoPsv');
  });

  it('cita o subitem do TIPO: caldeira 13.4.4.12, vaso 13.5.4.11 — sempre a alínea "n"', () => {
    const cald = validarParaFinalizar({ meta: META, documentos: [], laudo: null, dadosContainer: {}, tipoEquipamento: 'caldeira' });
    const vaso = validarParaFinalizar({ meta: META, documentos: [], laudo: null, dadosContainer: {}, tipoEquipamento: 'vaso' });
    expect(aviso(cald)!.texto).toContain('subitem 13.4.4.12, alínea "n"');
    expect(aviso(vaso)!.texto).toContain('subitem 13.5.4.11, alínea "n"');
  });

  it('a folha de calibração da PSV na composição basta', () => {
    expect(temCertificadoPsv(['CAPA.html', 'CERTIIFCADO-CAL-PSV.html?calibId=cal-9'], META, {})).toBe(true);
  });

  it('o snapshot congelado na meta, com número, basta', () => {
    const meta = { ...META, certCalibracoes: { 'cal-9': { tipo: 'psv', numeroCertificado: 'TP.DS.0086.22' } } } as RelatorioMeta;
    expect(temCertificadoPsv([], meta, {})).toBe(true);
    const semNumero = { ...META, certCalibracoes: { 'cal-9': { tipo: 'psv', numeroCertificado: '  ' } } } as RelatorioMeta;
    expect(temCertificadoPsv([], semNumero, {})).toBe(false);
  });

  it('o quadro 7.1.1 apontando para uma calibração de PSV com número basta; de manômetro, não', () => {
    const psv = { checklist: { instrumentosRef: { 'inst-psv': { snapshot: { tipo: 'psv', numeroCertificado: 'ABSI 208519/22' } } } } };
    const man = { checklist: { instrumentosRef: { 'inst-man': { snapshot: { tipo: 'manometro', numeroCertificado: 'TP.MN.0084.22' } } } } };
    expect(temCertificadoPsv([], META, psv)).toBe(true);
    expect(temCertificadoPsv([], META, man)).toBe(false);
  });

  it('com certificado, nenhum aviso', () => {
    const r = validarParaFinalizar({
      meta: META,
      documentos: ['CERTIIFCADO-CAL-PSV.html?calibId=cal-9'],
      laudo: null,
      dadosContainer: {},
    });
    expect(aviso(r)).toBeUndefined();
  });
});
