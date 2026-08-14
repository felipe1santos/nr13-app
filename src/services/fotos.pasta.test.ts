import { describe, expect, it } from 'vitest';
import { pastaSegura } from './fotos';

/**
 * A linha estava inline em dois lugares e numa delas o `\w` perdeu a barra,
 * virando `[^w.-]`: "assinaturas" foi sanitizado para "_" e todas as rubricas
 * subiram para uma pasta chamada `_`. Não quebra leitura — o path é o path —
 * mas é permanente e deixa o bucket ilegível. Pego só porque o caminho gravado
 * foi conferido no servidor depois do teste de ponta a ponta.
 */
describe('pastaSegura', () => {
  it('preserva letras, números, ponto, hífen e underscore', () => {
    expect(pastaSegura('assinaturas')).toBe('assinaturas');
    expect(pastaSegura('certificados')).toBe('certificados');
    expect(pastaSegura('prontuario-fabricante')).toBe('prontuario-fabricante');
    expect(pastaSegura('VP01_2026.v2')).toBe('VP01_2026.v2');
  });

  it('troca o que não serve para caminho, colapsando sequências', () => {
    expect(pastaSegura('VP01 - COMPRESSOR 427L')).toBe('VP01_-_COMPRESSOR_427L');
    expect(pastaSegura('a///b')).toBe('a_b');
    expect(pastaSegura('acentuação e çedilha')).toBe('acentua_o_e_edilha');
  });

  it('nunca devolve vazio e limita o tamanho', () => {
    expect(pastaSegura('')).toBe('geral');
    // '_' já é nome válido: o fallback 'geral' é para string vazia.
    expect(pastaSegura('///')).toBe('_');
    expect(pastaSegura('x'.repeat(200))).toHaveLength(60);
  });
});
