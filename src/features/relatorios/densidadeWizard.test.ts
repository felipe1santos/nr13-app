import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resumirContainer, rotuloConteudo } from '../inspecoes/resumoContainer';
import type { ContainerInspecao } from '../inspecoes/tipos';

/**
 * DENSIDADE DO ASSISTENTE — 10/09/2026, revisto em 23/11/2026.
 *
 * 10/09/2026: um container ocupava 153 px no celular e dez faziam o modal
 * crescer sem fim; a resposta foi uma LINHA DE ALTURA FIXA (64 px) com o nome
 * reticenciado. 23/11/2026: o dono reclamou exatamente disso — "bugado cortando
 * informações". A altura fixa cortava o nome e escondia os ensaios atrás de
 * ícones sem texto. Agora o cartão QUEBRA LINHA (nome, meta, etiquetas com
 * texto) e quem rola é o corpo do modal; o topo (progresso + etapas) e o
 * rodapé continuam fixos, fora da área que rola.
 */

const css = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');
const componente = readFileSync('src/features/relatorios/ModalCriarRelatorio.tsx', 'utf8');
const wizard = css.slice(css.indexOf('O ASSISTENTE DE CRIAÇÃO'));

/** O corpo de uma regra de topo (sem media query), pelo seletor exato. */
function regra(seletor: string): string {
  const i = wizard.indexOf(`\n${seletor} {`);
  expect(i, `regra ${seletor} ausente`).toBeGreaterThan(-1);
  return wizard.slice(i, wizard.indexOf('}', i));
}

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

describe('o cartão de container não corta informação', () => {
  it('sem altura fixa e sem reticências no cartão, no nome e na meta', () => {
    for (const s of ['.wz-container', '.wz-container-nome', '.wz-container-meta', '.wz-container-txt']) {
      const r = regra(s);
      expect(r, s).not.toMatch(/(^|[\s;{])height:/);
      expect(r, s).not.toContain('text-overflow: ellipsis');
      expect(r, s).not.toContain('white-space: nowrap');
    }
    // E nenhuma regra do assistente volta a reticenciar o cartão.
    expect(wizard).not.toMatch(/\.wz-container[\w-]*[^{]*\{[^}]*text-overflow: ellipsis/);
  });

  it('os ensaios salvos aparecem como etiquetas com TEXTO e a cor do ensaio', () => {
    expect(componente).toContain('className={`wz-chip ens-${e.ensaio}`}');
    expect(componente).toContain('{e.rotulo}');
    const chip = regra('.wz-chip');
    expect(chip).toContain('padding: 3px 9px;');
    expect(chip).toContain('border-radius: 4px;');
    expect(chip).toContain('var(--ens-bg');
  });

  // 23/11/2026 · seleção no AZUL de destaque (pedido do dono); o verde ficou
  // só para "com dados".
  it('selecionado = borda de 2 px no azul de destaque + fundo claro', () => {
    const sel = regra('.wz-container.is-sel');
    expect(sel).toContain('border: 2px solid var(--destaque');
    expect(sel).toContain('background: var(--destaque-bg');
  });

  it('o olho tem 44 px de alvo', () => {
    const olho = regra('.wz-olho');
    expect(olho).toContain('width: 44px;');
    expect(olho).toContain('height: 44px;');
  });

  it('"Não usar container" continua sendo o último cartão', () => {
    const sem = componente.indexOf('wz-container-sem');
    expect(sem).toBeGreaterThan(componente.indexOf('{resumos.map((r) => ('));
    expect(componente.indexOf('wz-container ', sem + 1)).toBe(-1);
  });
});

describe('topo e rodapé ficam FORA da área que rola', () => {
  it('progresso → cabeçalho → etapas → corpo → rodapé, nesta ordem', () => {
    const ordem = [
      'className="wz-progresso"',
      'className="modal-header mni-header wz-header"',
      '<ol className="wz-passos"',
      '<div className="modal-body mni-body">',
      'className="modal-actions mni-rodape',
    ];
    let anterior = -1;
    for (const marca of ordem) {
      const i = componente.indexOf(marca);
      expect(i, marca).toBeGreaterThan(anterior);
      anterior = i;
    }
  });

  it('só o corpo rola; o topo e o rodapé não encolhem', () => {
    expect(css).toMatch(/\.mni-body \{[^}]*overflow-y: auto;/s);
    expect(css).toMatch(/\.mni-rodape \{[^}]*flex: 0 0 auto;/s);
    for (const s of ['.wz-progresso', '.wz-passos']) expect(regra(s), s).toContain('flex: 0 0 auto;');
    // A lista de containers não tem mais rolagem própria: rola com o corpo.
    expect(regra('.wz-containers')).not.toContain('overflow-y');
  });

  it('a barra de progresso anima por transform e respeita menos movimento', () => {
    expect(componente).toContain('transform: `scaleX(${progressoDoPasso(passo)})`');
    expect(regra('.wz-progresso-fill')).toContain('background: var(--vermelho-padrao');
    expect(wizard).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.wz-progresso-fill \{ transition: none; \}/);
  });
});

describe('o texto do cartão não estoura com 1, 5, 10 ou 20', () => {
  for (const n of [1, 5, 10, 20]) {
    it(`${n} container(es): toda linha diz a mesma coisa, no mesmo formato`, () => {
      const resumos = containers(n).map(resumirContainer);
      expect(resumos).toHaveLength(n);
      for (const r of resumos) {
        expect(rotuloConteudo(r)).toBe('5 ensaios com dados salvos');
        expect(r.salvos).toHaveLength(5);
        expect(r.ensaios.length).toBeLessThanOrEqual(5);
      }
    });
  }
});

describe('celular (até 600 px)', () => {
  const movel = wizard.slice(wizard.indexOf('@media (max-width: 600px)'));

  it('vira folha de altura total, com rótulos curtos nas etapas', () => {
    expect(movel).toContain('height: 100dvh;');
    expect(movel).toContain('.wz-passo-rot { display: none; }');
    expect(movel).toContain('.wz-passo-rot-curto { display: inline;');
  });

  it('engrenagem e botões do rodapé passam de 44 px', () => {
    expect(movel).toContain('.wz-engrenagem { width: 44px; height: 44px; }');
    expect(movel).toMatch(/\.wz-modal \.mni-rodape \.btn-secundario \{ flex: 1 1 0; height: 44px; \}/);
  });
});
