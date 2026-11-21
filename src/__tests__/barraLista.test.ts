/**
 * Padrão único das barras de lista (21/11/2026) — ver `src/styles/barra-lista.css`.
 * Estrutura, não pixel: a medição foi feita no navegador (barra em uma linha,
 * 10px de respiro, 16px de recuo em todas as listas).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ler = (p: string) => readFileSync(p, 'utf8');
const CSS = ler('src/styles/barra-lista.css');
const MAIN = ler('src/main.tsx');

describe('barra de lista: padrão único', () => {
  it('é o último CSS global a falar', () => {
    const iBarra = MAIN.indexOf("import './styles/barra-lista.css'");
    expect(iBarra).toBeGreaterThan(MAIN.indexOf("import './styles/cartoes-cobalto.css'"));
  });

  it('o tipo de equipamento é um seletor com caixinha nas três listas por tipo', () => {
    for (const f of [
      'src/features/equipamento/EquipamentosV9.tsx',
      'src/features/inspecoes/InspecoesV9.tsx',
      'src/features/livro/CatalogoLivroV9.tsx',
    ]) {
      const fonte = ler(f);
      expect(fonte).toContain('<SeletorTipo');
      expect(fonte).not.toMatch(/\['caldeira', 'Caldeiras'\]/);
    }
  });

  it('a barra não quebra linha no desktop', () => {
    expect(CSS).toMatch(/\.busca-lista\.compacta \.busca-lista-linha \{\s*flex-wrap: nowrap !important;/);
  });

  it('selecionado é verde petróleo sólido; Clientes em laranja; contador do menu em laranja', () => {
    expect(CSS).toMatch(/\.rel-chips button\[aria-pressed='true'\],[\s\S]*?background: var\(--sel\) !important;/);
    expect(CSS).toMatch(/\.equip-visao-btn\.ativo,[\s\S]*?background: var\(--sel\) !important;/);
    expect(CSS).toMatch(/\.cli-v4 \.cli-seg button\[aria-pressed='true'\] \{ background: var\(--laranja\) !important;/);
    expect(CSS).toMatch(/\.nav-count \{\s*background: var\(--laranja\) !important;/);
    expect(ler('src/styles/tokens.css')).toContain('--sel: #0F766E;');
  });

  it('excluir continua vermelho nas ações de linha', () => {
    expect(CSS).toContain(".rel-cel-acoes .btn-icone:not(.cor-doc):not(.cor-doc-forte):not([title*='xcluir']):hover");
    expect(CSS).toMatch(/\.lc-acoes \.perigo:hover,[\s\S]*?background: #DC2626 !important;/);
  });

  it('Registros: o "Abrindo os registros…" é sobreposto, não empurra a lista', () => {
    const livro = ler('src/pages/LivroRegistro.tsx');
    expect(livro).toContain('className="reg-abrindo"');
    expect(livro).not.toMatch(/className="rel-rodape-carregando" role="status">\s*Abrindo os registros/);
    expect(CSS).toMatch(/\.reg-abrindo \{\s*position: absolute;/);
  });
});
