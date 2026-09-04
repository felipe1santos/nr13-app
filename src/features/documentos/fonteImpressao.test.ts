import { describe, expect, it } from 'vitest';
import { fonteDeImpressao, rotuloImpressao } from './fonteImpressao';

const ref = { bucket: 'inspecao', path: 'org/relatorios/x.pdf', mimeType: 'application/pdf', tamanho: 10 };

describe('de onde sai o papel', () => {
  it('documento com pdfRef imprime o ARQUIVO — nunca a tela', () => {
    expect(fonteDeImpressao({ pdfRef: ref })).toBe('arquivo');
  });

  it('o motor NÃO entra na decisão: arquivado no raster imprime o arquivo igual', () => {
    // Um relatório de antes de 04/09/2026 tem bytes gerados pelo html2canvas.
    // Imprimi-lo é servir ESSES bytes, não rasterizar a tela de novo.
    expect(fonteDeImpressao({ pdfRef: ref, motor: 'raster' } as never)).toBe('arquivo');
    expect(fonteDeImpressao({ pdfRef: ref, motor: 'vetorial' } as never)).toBe('arquivo');
  });

  it('rascunho / não emitido é PRÉVIA', () => {
    expect(fonteDeImpressao(null)).toBe('previa');
    expect(fonteDeImpressao(undefined)).toBe('previa');
    expect(fonteDeImpressao({})).toBe('previa');
    expect(fonteDeImpressao({ pdfRef: null })).toBe('previa');
  });

  it('pdfRef sem caminho não é arquivo — é registro pela metade', () => {
    // Deixar isso passar mandaria o download tentar baixar `undefined` e
    // devolver "não foi possível abrir", em vez de imprimir a prévia que existe.
    expect(fonteDeImpressao({ pdfRef: { path: '' } })).toBe('previa');
    expect(fonteDeImpressao({ pdfRef: {} })).toBe('previa');
  });

  it('upload pendente ainda é ARQUIVO: os bytes existem no cofre local', () => {
    expect(fonteDeImpressao({ pdfRef: ref, pdfPendente: true } as never)).toBe('arquivo');
  });

  it('a prévia se anuncia como prévia', () => {
    expect(rotuloImpressao('arquivo')).toBe('Imprimir');
    expect(rotuloImpressao('previa')).toBe('Imprimir pré-visualização');
  });
});
