import { beforeEach, describe, expect, it } from 'vitest';
import { ehCliente, papelDaSessao } from '../papelSessao';

describe('papelSessao', () => {
  beforeEach(() => localStorage.clear());

  it('sem papel gravado devolve string vazia e não é cliente', () => {
    expect(papelDaSessao()).toBe('');
    expect(ehCliente()).toBe(false);
  });

  it('reconhece o papel cliente', () => {
    localStorage.setItem('nr13_papel', 'cliente');
    expect(papelDaSessao()).toBe('cliente');
    expect(ehCliente()).toBe(true);
  });

  it('papéis internos não são cliente', () => {
    for (const p of ['mestre', 'gerente', 'funcionario']) {
      localStorage.setItem('nr13_papel', p);
      expect(ehCliente()).toBe(false);
    }
  });

  // Sensível a caixa, como a lista branca das policies (D-04). Um papel gravado
  // com caixa errada não pode virar rota diferente nem acesso acidental.
  it('caixa trocada não vira cliente', () => {
    localStorage.setItem('nr13_papel', 'CLIENTE');
    expect(ehCliente()).toBe(false);
  });

  // Janela anônima / armazenamento bloqueado: ler o papel não pode lançar, senão
  // derruba a resolução de QUALQUER foto — inclusive a do sistema interno.
  it('localStorage indisponível não derruba a leitura', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('armazenamento bloqueado');
    };
    try {
      expect(papelDaSessao()).toBe('');
      expect(ehCliente()).toBe(false);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
