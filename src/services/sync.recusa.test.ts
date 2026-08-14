import { describe, expect, it } from 'vitest';
import { classificar } from './errosSync';

const ctx = { chave: 'nr13_livro_VP01', mutationId: 'm1', dispositivo: 'd1', quando: 'agora' };

/**
 * A recusa do trigger `livro_imutavel.sql` precisa ser reconhecida como
 * DEFINITIVA. Antes, ela caía em `desconhecido` e a fila retentava para sempre,
 * exibindo "⚠ 1 falha" na topbar indefinidamente (medido em 14/08/2026 ao
 * excluir um equipamento que já tinha relatório salvo).
 */
describe('recusa definitiva do livro imutável', () => {
  const MENSAGEM =
    'nr13_livro_imutavel: registro do Livro de Segurança já emitido não pode ser alterado, removido nem reordenado (chave nr13_livro_VP01).';

  it('é classificada como recusa_definitiva, não como desconhecido', () => {
    expect(classificar({ message: MENSAGEM }, ctx).categoria).toBe('recusa_definitiva');
    expect(classificar(new Error(MENSAGEM), ctx).categoria).toBe('recusa_definitiva');
  });

  it('não oferece ação: não existe estado futuro em que a operação passe', () => {
    expect(classificar({ message: MENSAGEM }, ctx).acao).toBeNull();
  });

  it('a mensagem crua fica INTEIRA nos detalhes técnicos', () => {
    expect(classificar({ message: MENSAGEM }, ctx).detalhe.mensagemOriginal).toBe(MENSAGEM);
  });

  it('não confunde com as categorias que se resolvem sozinhas', () => {
    expect(classificar({ message: 'Failed to fetch' }, ctx).categoria).toBe('offline');
    expect(classificar({ message: 'nr13_escrita_direta_bloqueada' }, ctx).categoria).toBe('permissao');
    expect(classificar({ message: 'nr13_versao_obsoleta' }, ctx).categoria).toBe('obsoleto');
  });
});
