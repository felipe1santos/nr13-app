import { describe, it, expect } from 'vitest';
import { CAMPOS_PESADOS, campoPesadoDe, dividirPesado, podar } from './camposPesados';

const PDF = 'JVBERi0xLjQK' + 'A'.repeat(50_000);

describe('camposPesados', () => {
  it('reconhece a chave do prefixo registrado', () => {
    expect(campoPesadoDe('nr13_rastreab_abc')?.campo).toBe('pdfBase64');
    expect(campoPesadoDe('nr13_info_VP01')).toBeUndefined();
  });

  it('separa o pdf e deixa os marcadores no lugar dele', () => {
    const valor = JSON.stringify({ nome: 'Ultrassom', numeroSerie: '123', pdfBase64: PDF });
    const { leve, pesado } = dividirPesado('nr13_rastreab_1', valor);

    expect(pesado).toBe(PDF);
    const obj = JSON.parse(leve);
    expect(obj.pdfBase64).toBe('');
    expect(obj.temPdf).toBe(true);
    expect(obj.pdfBytes).toBe(PDF.length);
    // Os metadados que os templates leem seguem intactos.
    expect(obj.nome).toBe('Ultrassom');
    expect(obj.numeroSerie).toBe('123');
    expect(leve.length).toBeLessThan(valor.length / 10);
  });

  it('é idempotente: podar duas vezes não muda nada e não reinventa marcadores', () => {
    const valor = JSON.stringify({ nome: 'Ultrassom', pdfBase64: PDF });
    const uma = podar('nr13_rastreab_1', valor);
    expect(podar('nr13_rastreab_1', uma)).toBe(uma);
  });

  it('não mexe em chave de outro prefixo, nem em valor não-JSON', () => {
    const valor = JSON.stringify({ pdfBase64: PDF });
    expect(podar('nr13_info_VP01', valor)).toBe(valor);
    expect(podar('nr13_rastreab_1', 'texto solto')).toBe('texto solto');
  });

  it('registro sem o campo pesado sai pela identidade (sem reserializar)', () => {
    const valor = JSON.stringify({ nome: 'Ultrassom', temPdf: true, pdfBytes: 10 });
    expect(podar('nr13_rastreab_1', valor)).toBe(valor);
    expect(dividirPesado('nr13_rastreab_1', valor).pesado).toBeNull();
  });

  it('a tabela só contém campo que nenhum template de public/ lê', () => {
    // Trava de intenção: acrescentar um prefixo aqui obriga a conferir a
    // varredura de `public/` antes (ver o cabeçalho do módulo).
    expect(CAMPOS_PESADOS).toEqual([{ prefixo: 'nr13_rastreab_', campo: 'pdfBase64' }]);
  });
});
