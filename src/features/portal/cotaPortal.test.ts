/**
 * Fase 4 — cota estourada é ERRO, não aviso.
 *
 * Antes, `carregarDadosPortal` engolia a falha de `localStorage.setItem` num `catch` e só
 * logava. O Portal seguia abrindo e o cliente via o ativo **sem o documento** — concluindo
 * que o documento não existe, quando na verdade faltou espaço no navegador.
 *
 * É o mesmo princípio do palco (I-23): documento recusado é melhor que documento incompleto,
 * porque o incompleto ninguém percebe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('../../services/storage', () => ({
  ler: vi.fn(() => null),
  semearCachePortal: vi.fn(async () => 0),
}));

import { carregarDadosPortal, ErroCotaPortal } from './portalService';

const RESPOSTA = {
  data: {
    tags: ['ATIVO-A'],
    chaves: { 'nr13_info_ATIVO-A': '{"tag":"ATIVO-A"}', 'nr13_minha_empresa': '{}' },
  },
  error: null,
};

let setItemOriginal: typeof localStorage.setItem;

beforeEach(() => {
  invoke.mockReset();
  setItemOriginal = localStorage.setItem;
});
afterEach(() => {
  localStorage.setItem = setItemOriginal;
});

describe('falha de cota no Portal', () => {
  it('LANÇA quando uma chave não cabe — não segue em silêncio', async () => {
    invoke.mockResolvedValue(RESPOSTA);
    localStorage.setItem = vi.fn(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });

    await expect(carregarDadosPortal()).rejects.toBeInstanceOf(ErroCotaPortal);
  });

  it('a mensagem diz o que houve e o que fazer — o cliente não é engenheiro', async () => {
    invoke.mockResolvedValue(RESPOSTA);
    localStorage.setItem = vi.fn(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });

    const erro = await carregarDadosPortal().catch((e) => e);
    expect(erro.message).toMatch(/armazenamento do navegador está cheio/i);
    expect(erro.message).toMatch(/recarregue a página/i);
  });

  it('sem falha de cota, devolve as tags e NÃO lança', async () => {
    invoke.mockResolvedValue(RESPOSTA);
    localStorage.setItem = vi.fn(() => undefined);

    const r = await carregarDadosPortal();
    expect(r.tags).toEqual(['ATIVO-A']);
    expect(r.falhasDeCota).toBe(0);
  });

  it('erro da Edge continua propagando', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'edge fora do ar' } });
    await expect(carregarDadosPortal()).rejects.toThrow(/edge fora do ar/i);
  });
});
