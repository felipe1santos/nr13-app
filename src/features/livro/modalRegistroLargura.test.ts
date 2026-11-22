/**
 * GATE · o modal "Novo registro" não estica nem corta (22/11/2026).
 *
 * BUG 2 — texto longo esticava o modal para a direita e encolhia o formulário:
 * a prévia morava numa coluna flex (`flex: 0 0 340px`) com `min-width: auto`,
 * e o termo (`white-space: pre-wrap`, sem `overflow-wrap`) com uma palavra
 * longa/URL virava o mínimo da coluna. BUG 1 — o topo ficava fora da tela:
 * caixa centralizada por flex com `max-height` em `vh` maior que a área
 * visível. Estrutura, não pixel: a suíte roda sem DOM.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/features/livro/modalNovoRegistro.css', 'utf8');
const modal = readFileSync('src/features/livro/ModalNovoRegistro.tsx', 'utf8');
const camada = readFileSync('src/features/livro/CamadaModal.tsx', 'utf8');
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const cssLimpo = semComentarios(css);

/** Os corpos (juntos) de toda regra cujo seletor termina em `sel {`. */
function regra(sel: string): string {
  const partes: string[] = [];
  let i = cssLimpo.indexOf(`${sel} {`);
  expect(i, `regra ${sel}`).toBeGreaterThan(-1);
  while (i > -1) {
    partes.push(cssLimpo.slice(i, cssLimpo.indexOf('}', i)));
    i = cssLimpo.indexOf(`${sel} {`, i + 1);
  }
  return partes.join('\n');
}

describe('BUG 2 · a largura do modal não depende do texto digitado', () => {
  it('não há mais coluna lateral disputando a largura', () => {
    expect(semComentarios(modal)).not.toContain('reg-modal-lado');
    expect(cssLimpo).not.toMatch(/flex:\s*0 0 3\d\dpx/);
  });

  it('a caixa tem largura própria e fixa (não cresce com o conteúdo)', () => {
    const caixa = regra('.fj-modal-box.reg-modal');
    expect(caixa).toContain('width: 100%;');
    expect(caixa).toContain('max-width: 680px;');
    expect(caixa).toContain('min-width: 0;');
  });

  it('corpo, formulário, grupos e campos podem encolher (min-width: 0)', () => {
    for (const sel of ['.reg-modal-corpo', '.reg-modal-form', '.reg-modal-grupo', '.reg-modal-linha']) {
      expect(regra(sel)).toContain('min-width: 0;');
    }
    expect(cssLimpo).toMatch(/\.reg-modal-linha > \*,\s*\.reg-modal-form \.fj-field \{ min-width: 0; \}/);
    // O corpo nunca rola na horizontal.
    expect(regra('.reg-modal-corpo')).toContain('overflow-x: hidden;');
  });

  it('a grade de dois campos tem mínimo que não passa de 100%', () => {
    expect(regra('.reg-modal-linha')).toContain('minmax(min(210px, 100%), 1fr)');
    expect(cssLimpo).not.toMatch(/minmax\(210px,\s*1fr\)/);
  });

  it('campos ocupam a largura do contêiner, e o texto quebra em qualquer ponto', () => {
    expect(cssLimpo).toMatch(/\.reg-modal-form \.fj-field textarea \{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*box-sizing: border-box;/);
    expect(regra('.reg-modal-form .fj-field textarea')).toContain('overflow-wrap: anywhere;');
  });

  it('a ficha da prévia quebra palavra longa — inclusive no visualizador da página', () => {
    expect(regra('.ficha-reg')).toContain('overflow-wrap: anywhere;');
    expect(regra('.ficha-reg')).toContain('min-width: 0;');
    const p = regra('.ficha-reg-bloco p');
    expect(p).toContain('white-space: pre-wrap;');
    expect(p).toContain('overflow-wrap: anywhere;');
  });

  it('a camada da prévia também não cresce com o conteúdo', () => {
    expect(regra('.reg-camada')).toContain('min-width: 0;');
    expect(regra('.reg-camada-corpo')).toContain('overflow-x: hidden;');
  });
});

describe('BUG 1 · o topo do modal nunca fica fora da tela', () => {
  it('a caixa se centraliza por margem automática, não pelo overlay', () => {
    expect(regra('.fj-modal-overlay.reg-modal-overlay')).toContain('align-items: flex-start;');
    expect(regra('.fj-modal-overlay.reg-modal-overlay')).toContain('overflow-y: auto;');
    expect(regra('.fj-modal-box.reg-modal')).toContain('margin: auto;');
  });

  it('a altura é a da área VISÍVEL (dvh) menos o respiro do overlay', () => {
    expect(regra('.fj-modal-box.reg-modal')).toContain('max-height: calc(100dvh - 48px);');
    expect(regra('.fj-modal-overlay.reg-modal-overlay')).toContain('padding: 24px;');
  });

  it('cabeçalho e rodapé fixos; só o corpo rola', () => {
    expect(regra('.fj-modal-box.reg-modal')).toContain('overflow: hidden;');
    expect(regra('.reg-modal-head')).toContain('flex-shrink: 0;');
    expect(regra('.reg-modal-acoes')).toContain('flex-shrink: 0;');
    const corpo = regra('.reg-modal-corpo');
    expect(corpo).toContain('flex: 1 1 auto;');
    expect(corpo).toContain('min-height: 0;');
    expect(corpo).toContain('overflow-y: auto;');
  });

  it('modal e camadas vão para o body por portal', () => {
    expect(modal).toContain("import { createPortal } from 'react-dom';");
    expect(modal).toContain('document.body,');
    expect(camada).toContain('createPortal(');
  });
});

describe('o comportamento que NÃO mudou', () => {
  it('o fundo do formulário não fecha; o da camada (só leitura) fecha', () => {
    expect(modal).toContain('<div className="fj-modal-overlay reg-modal-overlay">');
    expect(camada).toContain('e.target === e.currentTarget && aoFechar()');
  });

  it('com uma camada aberta, a armadilha de foco do formulário se desliga', () => {
    expect(modal).toContain("if (e.key !== 'Tab' || !caixa.current || camadaAberta.current) return;");
  });

  it('o ESC da camada para nela, sem chegar ao formulário', () => {
    expect(camada).toContain("document.addEventListener('keydown', tecla, true);");
    expect(camada).toContain('e.stopPropagation();');
  });

  it('a tag do tipo segue o VERMELHO PADRÃO', () => {
    const tag = regra('.reg-tipo-sel,\n.reg-tipo-opcao.escolhida .reg-tipo-nome'.replace(/\n/g, css.includes('\r\n') ? '\r\n' : '\n'));
    for (const d of ['padding: 3px 9px;', 'border-radius: 4px;', 'background: #DC2626;', 'color: #fff;', 'font-weight: 600;', 'line-height: 1.35;']) {
      expect(tag).toContain(d);
    }
  });
});

describe('Ver livro completo: as folhas encolhem até caber, nunca ampliam', () => {
  it('escalaParaCaber', async () => {
    const { escalaParaCaber } = await import('./escalaDocumento');
    expect(escalaParaCaber(1200)).toBe(1);
    expect(escalaParaCaber(397)).toBeCloseTo(0.5, 2);
    expect(escalaParaCaber(0)).toBe(1);
    expect(escalaParaCaber(50)).toBe(0.25);
  });

  it('a caixa tem a altura da tela e só o corpo rola', () => {
    const lista = readFileSync('src/features/livro/listaRegistros.css', 'utf8');
    const bloco = lista.slice(lista.indexOf('VER LIVRO COMPLETO'));
    expect(bloco).toContain('height: calc(100dvh - 32px);');
    expect(bloco).toMatch(/\.fj-modal-box\.livro-completo \{[^}]*overflow: hidden;/);
    expect(bloco).toMatch(/\.livro-completo-corpo \{[^}]*overflow-y: auto;[^}]*overflow-x: hidden;/);
    const pagina = readFileSync('src/pages/LivroRegistro.tsx', 'utf8');
    expect(pagina).toContain('<DocumentoAjustado');
    expect(pagina).not.toContain("<div style={{ padding: 16, overflowX: 'auto' }}>");
  });

  it('os três atalhos do livro ficam na mesma linha no desktop', () => {
    const lista = readFileSync('src/features/livro/listaRegistros.css', 'utf8');
    expect(lista).toContain('.livro-fixos .livro-fixos-docs { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }');
    expect(lista).toContain('.livro-fixos-docs .livro-doc-ic.abrir { background: var(--sel, #0f766e); color: #fff; }');
  });
});
