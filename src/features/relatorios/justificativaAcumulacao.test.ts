import { describe, expect, it } from 'vitest';
import { validarParaFinalizar } from './validacaoFinalizacao';
import { validarArt } from './anexoArt';

const meta = { codigo: 'REL-1', documentos: [] } as never;
const DOCS = ['CAPA.html', 'CALD-RELATORIO-INSPECAO.html'];
const campos = (r: ReturnType<typeof validarParaFinalizar>) => r.obrigatorios.map((p) => p.campo);

describe('relatório de caldeira: acumulação não realizada exige justificativa', () => {
  it('sem ensaio e sem justificativa: bloqueia', () => {
    const r = validarParaFinalizar({ meta, documentos: DOCS, laudo: { apto: true }, dadosContainer: {}, overrides: {} });
    expect(campos(r)).toContain('ri.acumulacao.justificativa');
  });

  it('com a justificativa escrita no documento: passa', () => {
    const r = validarParaFinalizar({
      meta,
      documentos: DOCS,
      laudo: { apto: true },
      dadosContainer: {},
      overrides: { 'ri.acumulacao.justificativa': { modo: 'manual', valor: 'Queimador em manutenção', auto: '', em: '2026-10-22' } },
    });
    expect(campos(r)).not.toContain('ri.acumulacao.justificativa');
  });

  it('rascunho de caldeira anterior (INSPECOES/CONCLUSAO) também exige', () => {
    const r = validarParaFinalizar({ meta, documentos: ['CAPA.html', 'INSPECOES.html'], laudo: { apto: true }, dadosContainer: {}, overrides: {}, tipoEquipamento: 'caldeira' });
    expect(campos(r)).toContain('ri.acumulacao.justificativa');
  });

  it('relatório de vaso (sem a folha de caldeira) não ganha a regra', () => {
    const r = validarParaFinalizar({ meta, documentos: ['CAPA.html', 'INSPECOES.html'], laudo: { apto: true }, dadosContainer: {}, overrides: {} });
    expect(campos(r)).not.toContain('ri.acumulacao.justificativa');
  });
});

describe('PDF da ART', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7 ...');
  it('aceita PDF real e recusa arquivo renomeado', () => {
    expect(validarArt({ nome: 'art.pdf', tamanho: pdf.length, mimeType: 'application/pdf' }, pdf).ok).toBe(true);
    const docx = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);
    expect(validarArt({ nome: 'art.pdf', tamanho: 6, mimeType: 'application/pdf' }, docx).ok).toBe(false);
  });
});
