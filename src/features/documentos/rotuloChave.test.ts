import { describe, it, expect } from 'vitest';
import { rotuloDaChave, resumoDoValor } from './rotuloChave';

/**
 * A tela de conflito pede uma decisão sobre dado técnico. Ela só é respondível
 * se disser DE QUE dado se trata — e sem inventar nome para chave que não
 * conhece, porque um rótulo errado faria o usuário decidir sobre outra coisa.
 */

describe('rótulo da chave', () => {
  it('traduz a família e mostra a TAG do equipamento', () => {
    expect(rotuloDaChave('nr13_info_VP-01')).toBe('Ficha do equipamento · VP-01');
    expect(rotuloDaChave('nr13_med_esp_CALD-2')).toBe('Medição de espessura · CALD-2');
  });

  it('usa o prefixo MAIS LONGO — senão o específico vira o genérico', () => {
    expect(rotuloDaChave('nr13_livro_config_VP-01')).toBe('Configuração do livro · VP-01');
    expect(rotuloDaChave('nr13_livro_VP-01')).toBe('Livro de Registro de Segurança · VP-01');
    expect(rotuloDaChave('nr13_vaso_cald_VP-01')).toBe('Memorial da caldeira · VP-01');
    expect(rotuloDaChave('nr13_prontuario_meta_VP-01')).toBe('Metadados do prontuário · VP-01');
  });

  it('chave global não ganha TAG inventada', () => {
    expect(rotuloDaChave('nr13_minha_empresa')).toBe('Dados da minha empresa');
    expect(rotuloDaChave('nr13_lista_phs')).toBe('Funcionários e assinaturas');
  });

  it('família desconhecida devolve a chave crua, não um nome chutado', () => {
    expect(rotuloDaChave('nr13_coisa_nova_X')).toBe('nr13_coisa_nova_X');
  });
});

describe('resumo do valor', () => {
  it('mostra os primeiros campos simples', () => {
    const r = resumoDoValor('{"tag":"VP-01","tipo":"vaso","fabricante":"ACME"}');
    expect(r).toContain('tag: VP-01');
    expect(r).toContain('tipo: vaso');
  });

  it('ignora campos aninhados — não cabem numa linha', () => {
    expect(resumoDoValor('{"tag":"A","componentes":[1,2,3]}')).toBe('tag: A');
  });

  it('lista vira contagem', () => {
    expect(resumoDoValor('[{"a":1},{"a":2}]')).toBe('lista com 2 item(ns)');
  });

  it('valor não-JSON aparece truncado, não some', () => {
    expect(resumoDoValor('texto solto')).toBe('texto solto');
    expect(resumoDoValor('x'.repeat(200))).toHaveLength(121); // 120 + reticência
  });

  it('vazio e ausente são distinguidos de "sem campos"', () => {
    expect(resumoDoValor(null)).toBe('(vazio)');
    expect(resumoDoValor('')).toBe('(vazio)');
    expect(resumoDoValor('{}')).toBe('(sem campos simples)');
  });

  it('campo longo é truncado para o resumo caber', () => {
    const r = resumoDoValor(`{"obs":"${'a'.repeat(100)}"}`);
    expect(r.length).toBeLessThan(60);
    expect(r).toContain('…');
  });
});
