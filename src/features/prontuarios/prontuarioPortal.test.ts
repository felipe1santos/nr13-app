import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Abrir o prontuário no PORTAL DO CLIENTE.
 *
 * Encontrado em produção em 19/08/2026, com a conta `ipiranga@gmail.com`: o
 * botão "Visualizar" do prontuário não abria nada. No console:
 *
 *   ErroBloqueado: Alteração não salva: assinatura suspensa ou acesso somente
 *   leitura.  ...  at onClick
 *
 * `abrirProntuario` chamava `gravarProntuarioAtual`, que é `salvar()` — a
 * escrita que enfileira mutação para o servidor. O papel `cliente` é somente
 * leitura por desenho, o gate recusou, a exceção subiu e o visualizador nunca
 * montou. Vale para QUALQUER equipamento; não tem relação com a TAG.
 *
 * `nr13_prontuario_atual` não é dado do usuário: é insumo de RENDERIZAÇÃO que
 * os templates em iframe leem no `DOMContentLoaded`. No Portal eles leem do
 * `localStorage` semeado pela Edge (`portalService`), então é lá que a chave
 * precisa estar — sem passar pela fila de sincronização.
 */

const salvar = vi.fn(async (..._a: unknown[]) => {
  throw new Error('salvar() não pode ser chamado no Portal: o cliente é somente leitura');
});

vi.mock('../../services/storage', () => ({
  salvar: (chave: string, valor: unknown) => salvar(chave, valor),
  ler: vi.fn(() => null),
  excluirChave: vi.fn(async () => undefined),
}));

import { materializarProntuarioAtual, CHAVE_PRONTUARIO_ATUAL } from './prontuarioService';
import type { ProntuarioDados } from './tipos';

// Só os campos que o teste observa; o resto do ProntuarioDados não participa.
const DADOS = { tag: 'COMPRESSOR V8-15/200L', razaoSocial: 'Posto Ipiranga' } as unknown as ProntuarioDados;

beforeEach(() => {
  localStorage.clear();
  salvar.mockClear();
});

describe('materializar o prontuário para os templates', () => {
  it('grava no localStorage, que é de onde o iframe lê', () => {
    materializarProntuarioAtual(DADOS);

    expect(JSON.parse(localStorage.getItem(CHAVE_PRONTUARIO_ATUAL) ?? 'null')).toEqual(DADOS);
  });

  it('NÃO passa pela escrita sincronizada — era ela que o gate recusava', () => {
    materializarProntuarioAtual(DADOS);

    expect(salvar).not.toHaveBeenCalled();
  });

  it('cota estourada não derruba a abertura do documento', () => {
    // Documento incompleto é ruim; documento que não abre, com exceção crua na
    // cara do cliente, é pior. A falha vira console.error em `portalService`.
    // Espiona a INSTÂNCIA, não Storage.prototype — a lição do 37b3a4e:
    // o ambiente de teste nem sempre expõe o prototype.
    const espiao = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => materializarProntuarioAtual(DADOS)).not.toThrow();
    } finally {
      espiao.mockRestore();
    }
  });
});
