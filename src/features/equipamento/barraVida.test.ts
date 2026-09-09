import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COR_VIDA, corDaVida, pctDaVida, vidaDaBarra } from './barraVida';

/**
 * 09/09/2026 · A BARRA DE VIDA REMANESCENTE, com a faixa azul.
 *
 * O dono pediu que acima de 75% a vida apareça em `#0078b7`. A regra estava
 * COPIADA em dois cartões — `CardEquipamento` (lê `nr13_vida_` do cache) e
 * `CardCatalogo` (recebe a linha da projeção) —, e o portão P9.2 exige que os
 * dois mostrem a mesma coisa com a flag ligada e desligada. Mudar a cor em um
 * só é exatamente como eles divergem.
 *
 * Este arquivo trava a regra e trava a fonte única.
 */

describe('as faixas de cor', () => {
  it('acima de 75% é o azul pedido', () => {
    expect(corDaVida(76)).toBe('#0078b7');
    expect(corDaVida(100)).toBe('#0078b7');
    expect(COR_VIDA.folgada).toBe('#0078b7');
  });

  it('as faixas de antes continuam como eram', () => {
    expect(corDaVida(75)).toBe('var(--ok)');
    expect(corDaVida(51)).toBe('var(--ok)');
    expect(corDaVida(50)).toBe('var(--warn)');
    expect(corDaVida(26)).toBe('var(--warn)');
    expect(corDaVida(25)).toBe('var(--crit)');
    expect(corDaVida(0)).toBe('var(--crit)');
  });

  it('as bordas não se sobrepõem — nenhum valor cai em duas faixas', () => {
    // Cada limite pertence à faixa DE BAIXO: `> 75`, e não `>= 75`.
    for (const [pct, cor] of [
      [75, 'var(--ok)'],
      [75.1, '#0078b7'],
      [50, 'var(--warn)'],
      [50.1, 'var(--ok)'],
      [25, 'var(--crit)'],
      [25.1, 'var(--warn)'],
    ] as const) {
      expect(corDaVida(pct), `pct ${pct}`).toBe(cor);
    }
  });
});

describe('a barra a partir dos anos', () => {
  it('dez anos enchem a barra, e o excedente não estoura', () => {
    expect(pctDaVida(10)).toBe(100);
    expect(pctDaVida(25)).toBe(100);
    expect(pctDaVida(-3)).toBe(0);
  });

  it('mais de 7,5 anos já é a faixa azul', () => {
    expect(vidaDaBarra(7.6)?.cor).toBe('#0078b7');
    expect(vidaDaBarra(7.5)?.cor).toBe('var(--ok)');
    expect(vidaDaBarra(12)?.cor).toBe('#0078b7');
  });

  it('o texto sai em anos, com uma casa', () => {
    expect(vidaDaBarra(7.64)?.texto).toBe('7,6 anos');
    expect(vidaDaBarra(12)?.texto).toBe('12 anos');
  });

  it('sem cálculo é `null` — não é zero', () => {
    // Zero pintaria a barra de vermelho e afirmaria que o equipamento está no
    // fim, sem ninguém ter calculado nada.
    expect(vidaDaBarra(null)).toBeNull();
    expect(vidaDaBarra(undefined)).toBeNull();
    expect(vidaDaBarra(NaN)).toBeNull();
    expect(vidaDaBarra(Infinity)).toBeNull();
  });

  it('zero anos É um resultado, e ele é crítico', () => {
    expect(vidaDaBarra(0)?.pct).toBe(0);
    expect(vidaDaBarra(0)?.cor).toBe('var(--crit)');
  });
});

describe('os dois cartões usam a MESMA regra', () => {
  const catalogo = readFileSync('src/features/equipamento/CardCatalogo.tsx', 'utf8');
  const cache = readFileSync('src/features/equipamento/CardEquipamento.tsx', 'utf8');

  it.each([
    ['CardCatalogo', catalogo],
    ['CardEquipamento', cache],
  ])('%s importa de `barraVida`', (_nome, fonte) => {
    expect(fonte).toContain("from './barraVida'");
    expect(fonte).toContain('vidaDaBarra(');
  });

  it.each([
    ['CardCatalogo', catalogo],
    ['CardEquipamento', cache],
  ])('%s não tem mais a regra copiada', (_nome, fonte) => {
    expect(fonte).not.toContain("pct > 50 ? 'var(--ok)'");
    expect(fonte).not.toContain('Math.round((anos / 10) * 100)');
    // Nem o cinza solto do "não calculado".
    expect(fonte).not.toContain("'#AEB4B9'");
  });
});

describe('o botão de teste de 48h saiu do login', () => {
  const login = readFileSync('src/pages/Login.tsx', 'utf8');

  it('a tela de login não oferece mais o trial', () => {
    // Sem os comentários: o texto do botão é citado no comentário que explica a
    // remoção, e um `toContain` cru acusaria o próprio registro da mudança.
    const semComentarios = login.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
    expect(semComentarios).not.toContain('Teste grátis por 48h');
    expect(semComentarios).not.toContain("irPara('trial')");
    expect(semComentarios).not.toContain('btn-trial');
  });

  it('o FLUXO do trial continua no código, intocado', () => {
    // Sai a oferta, não a funcionalidade: quem quiser reativar devolve o botão.
    expect(login).toContain("type ModoLogin = 'entrar' | 'cadastrar' | 'recuperar' | 'trial';");
    expect(login).toContain("if (modo === 'trial') {");
    expect(login).toContain('handleTrialCadastro');
  });

  it('"Esqueci / trocar senha" continua na tela', () => {
    // O outro link da mesma grade não podia ir junto no caminho.
    expect(login).toContain('Esqueci / trocar senha');
  });
});
