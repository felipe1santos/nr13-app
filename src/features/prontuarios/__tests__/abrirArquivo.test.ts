/**
 * A ABA É RESERVADA NO CLIQUE (19/09/2026).
 *
 * O que este arquivo trava: a janela nasce ANTES da busca dos bytes, o arquivo
 * é entregue nela, e um bloqueador que recuse a reserva não deixa o clique sem
 * efeito — vira download.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reservarAba } from '../abrirArquivo';

function janelaFalsa() {
  return {
    closed: false,
    opener: {} as unknown,
    location: { replace: vi.fn() },
    document: { write: vi.fn(), close: vi.fn() },
    close: vi.fn(),
  };
}

const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:zz', revokeObjectURL: vi.fn() });
});

describe('reservarAba', () => {
  it('abre a janela IMEDIATAMENTE, antes de existir qualquer arquivo', () => {
    const j = janelaFalsa();
    const abrir = vi.fn(() => j as unknown as Window);
    reservarAba(abrir);
    expect(abrir).toHaveBeenCalledWith('', '_blank');
    // `noopener` faria `window.open` devolver null: o vínculo é cortado aqui.
    expect(j.opener).toBeNull();
    expect(j.document.write).toHaveBeenCalled();
  });

  it('entrega o arquivo na janela reservada', () => {
    const j = janelaFalsa();
    reservarAba(() => j as unknown as Window).entregar(blob, 'antigo.pdf');
    expect(j.location.replace).toHaveBeenCalledWith('blob:zz');
  });

  it('janela barrada pelo bloqueador vira DOWNLOAD — o clique nunca é inerte', () => {
    const cliques: string[] = [];
    const a = { href: '', download: '', rel: '', click: () => cliques.push('click'), remove: vi.fn() };
    vi.stubGlobal('document', {
      createElement: () => a,
      body: { appendChild: vi.fn() },
    });
    reservarAba(() => null).entregar(blob, 'antigo.pdf');
    expect(cliques).toEqual(['click']);
    expect(a.download).toBe('antigo.pdf');
  });

  it('falha na busca fecha a aba vazia', () => {
    const j = janelaFalsa();
    reservarAba(() => j as unknown as Window).descartar();
    expect(j.close).toHaveBeenCalled();
  });
});
