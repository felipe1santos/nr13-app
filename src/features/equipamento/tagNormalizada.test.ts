import { describe, expect, it } from 'vitest';
import { normalizarTag } from './tagNormalizada';

describe('normalizarTag', () => {
  it('remove TAB e quebra de linha coladas do Excel', () => {
    expect(normalizarTag('VP-01\t')).toBe('VP-01');
    expect(normalizarTag('VP-01\r\n')).toBe('VP-01');
    expect(normalizarTag('VP\t01')).toBe('VP 01');
  });

  it('remove espaço-duro e caractere de largura zero', () => {
    // NBSP e ZWSP entram por copiar/colar de página web ou PDF. São INVISÍVEIS:
    // a TAG parece igual na tela e nunca casa com a digitada à mão.
    expect(normalizarTag('VP 01')).toBe('VP 01');
    expect(normalizarTag('VP​-01')).toBe('VP-01');
    expect(normalizarTag('﻿VP-01')).toBe('VP-01');
  });

  it('junta espaços repetidos e apara as pontas', () => {
    expect(normalizarTag('  VP   01  ')).toBe('VP 01');
  });

  it('mantém o que o comportamento antigo já fazia: caixa alta', () => {
    expect(normalizarTag('vp-01')).toBe('VP-01');
  });

  it('NÃO mexe na barra nem em outro caractere legítimo da placa', () => {
    // A barra é nome de ativo (`V8-15/200L` é o modelo do compressor) e a rota
    // já a codifica. Tirá-la aqui renomearia o equipamento do usuário.
    expect(normalizarTag('COMPRESSOR V8-15/200L')).toBe('COMPRESSOR V8-15/200L');
    expect(normalizarTag('TQ #3 (50%)')).toBe('TQ #3 (50%)');
  });

  it('TAG que era só lixo invisível vira string vazia', () => {
    // Quem chama trata vazio como "TAG vazia" — a rejeição que já existe.
    expect(normalizarTag('​\t \r\n')).toBe('');
  });
});
