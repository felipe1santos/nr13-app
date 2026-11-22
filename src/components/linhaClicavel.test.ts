import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { linhaClicavel } from './linhaClicavel';

/** Elemento falso: só o `closest` que a regra usa. */
function el(controle: boolean, linha?: unknown) {
  return { closest: () => (controle ? { controle: true } : linha ?? null) } as unknown as HTMLElement;
}

describe('linha clicável (Relatórios e Prontuários)', () => {
  it('clique no corpo da linha executa a ação', () => {
    const acao = vi.fn();
    const p = linhaClicavel(acao, 'Abrir');
    p.onClick!({ target: el(false), currentTarget: {} } as unknown as React.MouseEvent<HTMLElement>);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('clique num botão de dentro da linha NÃO dispara a linha', () => {
    const acao = vi.fn();
    const p = linhaClicavel(acao);
    p.onClick!({ target: el(true), currentTarget: {} } as unknown as React.MouseEvent<HTMLElement>);
    expect(acao).not.toHaveBeenCalled();
  });

  it('Enter com o foco na linha abre; Enter vindo de um controle interno não', () => {
    const acao = vi.fn();
    const linha = {};
    const p = linhaClicavel(acao);
    p.onKeyDown!({ key: 'Enter', target: linha, currentTarget: linha, preventDefault() {} } as unknown as React.KeyboardEvent<HTMLElement>);
    p.onKeyDown!({ key: 'Enter', target: {}, currentTarget: linha, preventDefault() {} } as unknown as React.KeyboardEvent<HTMLElement>);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('sem ação, a linha não vira atalho', () => {
    expect(linhaClicavel(undefined)).toEqual({});
  });

  it('as duas listas usam: rascunho abre a edição, salvo/emitido abre a visualização', () => {
    const rel = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
    expect(rel).toContain('linhaClicavel(aoContinuarRascunho ? () => aoContinuarRascunho(r) : undefined');
    expect(rel).toContain('linhaClicavel(() => abrir(r)');
    const pront = readFileSync('src/features/prontuarios/ListaProntuariosV9.tsx', 'utf8');
    expect(pront).toContain('vigente ? () => aoAbrir(vigente) : rascunho ? () => aoAbrir(rascunho) : undefined');
  });
});
