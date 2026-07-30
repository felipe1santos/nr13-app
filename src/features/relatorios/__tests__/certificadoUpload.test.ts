import { describe, expect, it } from 'vitest';
import {
  LIMITE_PDF_BYTES,
  LIMITE_PDF_KB,
  erroCotaLocal,
  tamanhoEmKb,
  validarPdfCertificado,
} from '../certificadoUpload';

const arquivo = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'certificado.pdf',
  type: 'application/pdf',
  size: 400 * 1024,
  ...over,
});

describe('validarPdfCertificado', () => {
  it('aceita PDF normal com MIME correto', () => {
    expect(validarPdfCertificado(arquivo())).toEqual({ ok: true });
  });

  // O bug relatado pelo cliente: seletor de arquivo do celular entrega type=''
  // e a checagem antiga (type !== 'application/pdf') recusava o PDF.
  it('aceita PDF quando o navegador não informa o MIME (type vazio)', () => {
    expect(validarPdfCertificado(arquivo({ type: '' }))).toEqual({ ok: true });
  });

  it('aceita PDF com MIME genérico application/octet-stream', () => {
    expect(validarPdfCertificado(arquivo({ type: 'application/octet-stream' }))).toEqual({ ok: true });
  });

  it('aceita extensão .PDF em maiúsculas', () => {
    expect(validarPdfCertificado(arquivo({ name: 'CERT-2026.PDF', type: '' }))).toEqual({ ok: true });
  });

  it('recusa imagem, mesmo sem MIME', () => {
    const r = validarPdfCertificado(arquivo({ name: 'foto.png', type: '' }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/não é um PDF/);
  });

  it('recusa arquivo vazio', () => {
    const r = validarPdfCertificado(arquivo({ size: 0 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/vazio/);
  });

  it('recusa acima do limite e diz o tamanho real em KB', () => {
    const r = validarPdfCertificado(arquivo({ size: 3 * 1024 * 1024 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain('3072 KB');
    expect(r.ok === false && r.erro).toContain(`${LIMITE_PDF_KB} KB`);
  });

  it('aceita exatamente no limite e recusa 1 byte acima', () => {
    expect(validarPdfCertificado(arquivo({ size: LIMITE_PDF_BYTES })).ok).toBe(true);
    expect(validarPdfCertificado(arquivo({ size: LIMITE_PDF_BYTES + 1 })).ok).toBe(false);
  });
});

describe('tamanhoEmKb / erroCotaLocal', () => {
  it('converte bytes para KB inteiros', () => {
    expect(tamanhoEmKb(1024)).toBe(1);
    expect(tamanhoEmKb(1536)).toBe(2);
  });

  it('erro de cota informa o tamanho já convertido', () => {
    expect(erroCotaLocal(2_800_000)).toContain('2734 KB');
  });
});
