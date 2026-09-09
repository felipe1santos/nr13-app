import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resumirContainer, rotuloConteudo } from '../inspecoes/resumoContainer';
import type { ContainerInspecao } from '../inspecoes/tipos';

/**
 * DENSIDADE DA ETAPA 2 — 10/09/2026.
 *
 * O que motivou: com UM container salvo, a etapa 2 mostrava um cartão de 153 px
 * no celular; com dez, o modal crescia sem fim. A regra que este arquivo trava
 * é a que resolve os dois casos de uma vez — **a linha tem altura fixa e a
 * lista tem teto**. Dez containers e vinte são a mesma linha, mais vezes.
 *
 * A altura em si é medida no navegador (registrada em
 * `docs/medicoes/2026-09-10-ux-mobile.md`); o que se trava aqui é o CSS que a
 * produz, porque é ele que alguém pode desfazer sem perceber.
 */

const css = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');
const componente = readFileSync('src/features/relatorios/ModalCriarRelatorio.tsx', 'utf8');

/** Massa de FIXTURE — nada disto vai para produção (item 24 da rodada). */
function containers(n: number): ContainerInspecao[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cont${i}`,
    nome: `Inspeção periódica ${String(i + 1).padStart(2, '0')} — equipamento de teste`,
    criadoEm: '05/09/2026',
    ensaios: ['checklist', 'ultrassom', 'visual_externo', 'visual_interno', 'teste_hidrostatico'],
    dados: {
      checklist: { respostas: { q1: 'Sim' }, fotos: [{}] },
      ultrassom: { medidas: { p1: { c1: '7,8' } } },
      visual_externo: { itens: { 1: 'sim' } },
      visual_interno: { itens: { 1: 'sim' } },
      th: { curva: [{}] },
    },
  }));
}

describe('a linha não muda de tamanho com a quantidade', () => {
  it('a lista tem TETO e rola por dentro — o modal não cresce', () => {
    const bloco = css.slice(css.indexOf('.wz-containers {'), css.indexOf('.wz-container {'));
    expect(bloco).toContain('overflow-y: auto;');
    expect(bloco).toMatch(/max-height: \d+px;/);
  });

  it('a linha tem altura FIXA, não mínima', () => {
    const bloco = css.slice(css.indexOf('.wz-container {'), css.indexOf('.wz-container:last-child'));
    // `min-height` deixaria o conteúdo esticar a linha — foi o que produziu o
    // cartão de 153 px quando os ícones dos ensaios formavam uma 3ª linha.
    expect(bloco).toContain('height: 64px;');
    expect(bloco).not.toContain('min-height');
  });

  it('cabeçalho, etapas e rodapé ficam FORA da área que rola', () => {
    // O corpo é o único `overflow-y: auto` do modal; a barra de etapas e o
    // rodapé são irmãos dele, não filhos.
    const ordem = ['<ol className="wz-passos"', '<div className="modal-body mni-body">', 'className="modal-actions mni-rodape'];
    let anterior = -1;
    for (const marca of ordem) {
      const i = componente.indexOf(marca);
      expect(i, marca).toBeGreaterThan(anterior);
      anterior = i;
    }
    expect(css).toMatch(/\.mni-rodape \{[^}]*flex: 0 0 auto;/s);
  });

  it('os ícones dos ensaios ficam NA linha da meta, não num bloco próprio', () => {
    const i = componente.indexOf('wz-container-icones');
    const small = componente.lastIndexOf('<small>', i);
    // O `<small>` mais próximo acima tem de ser o pai — se os ícones voltarem a
    // ser irmãos dele, a linha ganha altura de novo.
    expect(small).toBeGreaterThan(-1);
    expect(componente.slice(small, i)).not.toContain('</small>');
  });
});

describe('o texto da linha não estoura com 1, 5, 10 ou 20', () => {
  for (const n of [1, 5, 10, 20]) {
    it(`${n} container(es): toda linha diz a mesma coisa, no mesmo formato`, () => {
      const resumos = containers(n).map(resumirContainer);
      expect(resumos).toHaveLength(n);
      for (const r of resumos) {
        // Uma linha de meta: data · conteúdo (· responsável, quando existe).
        expect(rotuloConteudo(r)).toBe('5 ensaios com dados salvos');
        expect(r.salvos).toHaveLength(5);
        // Nada de contagem que cresça com a lista: o resumo é POR container.
        expect(r.ensaios.length).toBeLessThanOrEqual(5);
      }
    });
  }

  it('o nome longo é reticenciado, não quebrado em duas linhas', () => {
    // É o que mantém a altura fixa quando o técnico dá nome comprido ao
    // container — e acontece, porque o padrão do sistema já é uma frase.
    const bloco = css.slice(css.indexOf('.wz-container-txt strong {'));
    expect(bloco.slice(0, 260)).toContain('white-space: nowrap;');
    expect(bloco.slice(0, 260)).toContain('text-overflow: ellipsis;');
  });
});

describe('celular', () => {
  it('a linha cresce para o dedo, e a lista encolhe o teto', () => {
    const geral = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(geral).toContain('.wz-container { height: 68px;');
    expect(geral).toContain('.wz-containers { max-height: 252px; }');
  });

  it('o olho tem 44 px', () => {
    const geral = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(geral).toContain('.wz-olho { width: 44px; height: 44px; }');
  });
});
