import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BarraAnotacoes, { AVISO_ANOTACOES } from './BarraAnotacoes';
import CamadaAnotacoes from './CamadaAnotacoes';
import type { EstadoAnotacoes } from './contexto';
import type { Anotacao, Ferramenta } from './modelo';

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const nada = () => {};

function estado(ferramenta: Ferramenta | null, lista: Anotacao[] = []): EstadoAnotacoes {
  return {
    lista,
    ferramenta,
    setFerramenta: nada,
    cor: '#DC2626',
    setCor: nada,
    espessura: 0.0025,
    setEspessura: nada,
    selecionada: null,
    setSelecionada: nada,
    adicionar: nada,
    atualizar: nada,
    remover: nada,
    marcarPasso: nada,
    desfazer: nada,
    limpar: nada,
    podeDesfazer: lista.length > 0,
  };
}

describe('barra de anotações', () => {
  it('desligada: Texto e Desenhar com aria-pressed=false, sem cores nem aviso', () => {
    const html = renderToStaticMarkup(createElement(BarraAnotacoes, { estado: estado(null) }));
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).not.toContain('Cor vermelho');
    expect(html).not.toContain('Só na cópia');
  });

  it('Desenhar ligado: aceso, 4 cores, 2 espessuras, Desfazer/Limpar e o aviso de que é só na cópia', () => {
    const html = renderToStaticMarkup(createElement(BarraAnotacoes, { estado: estado('desenhar') }));
    expect(html).toMatch(/aria-pressed="true" aria-label="Desenhar"/);
    expect(html.match(/aria-label="Cor [a-z]+"/g)).toHaveLength(4);
    expect(html).toContain('Traço fina');
    expect(html).toContain('Traço grossa');
    expect(html).toContain('Desfazer a última anotação');
    expect(html).toContain('Limpar todas as anotações');
    expect(html).toContain('Só na cópia');
    expect(AVISO_ANOTACOES).toMatch(/não ficam salvas no relatório/);
  });
});

describe('camada de anotações', () => {
  it('desligada não segura o toque (a rolagem segue); só "Desenhar" usa touch-action none', () => {
    const off = renderToStaticMarkup(createElement(CamadaAnotacoes, { pagina: 1, largura: 600, altura: 848, estado: estado(null) }));
    expect(off).toContain('class="anot-camada"');
    const css = ler('src/features/relatorios/anotacoes/anotacoes.css');
    expect(css).toMatch(/\.anot-camada \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.anot-camada\.is-desenhar \{[^}]*touch-action: none;/);
  });

  it('desenha traços e textos da PRÓPRIA página, na escala atual', () => {
    const lista: Anotacao[] = [
      { id: 't', tipo: 'traco', pagina: 1, cor: '#0C4F9B', espessura: 0.005, pontos: [{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }] },
      { id: 'x', tipo: 'texto', pagina: 1, x: 0.25, y: 0.5, texto: 'Olá', cor: '#111827', tamanho: 0.02 },
      { id: 'o', tipo: 'texto', pagina: 2, x: 0, y: 0, texto: 'outra página', cor: '#111827', tamanho: 0.02 },
    ];
    const html = renderToStaticMarkup(createElement(CamadaAnotacoes, { pagina: 1, largura: 600, altura: 800, estado: estado('texto', lista) }));
    expect(html).toContain('d="M300 400 L600 800"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain('left:150px;top:400px');
    expect(html).toContain('Olá');
    expect(html).not.toContain('outra página');
  });
});

describe('barra do documento: ícones e botão de miniaturas', () => {
  it('Atualizar, O que falta e Predefinições usam os ícones do sprite novos', () => {
    const previa = ler('src/features/relatorios/PreviaVetorial.tsx');
    expect(previa).toContain('<Icone nome="refresh" tam={13} />');
    expect(previa).toContain('<Icone nome="interrogacao" tam={13} /> O que falta');
    expect(previa).toContain('<Icone nome="camadas" tam={13} />');
    expect(previa).not.toContain('nome="book"');
    const sprite = ler('src/components/Icone.tsx');
    for (const n of ['interrogacao', 'camadas', 'paineis', 'texto', 'caneta', 'desfazer']) expect(sprite).toContain(`  ${n}: (`);
  });

  it('miniaturas: aria-pressed e aceso em --destaque com ícone branco', () => {
    const vis = ler('src/components/VisualizadorPdf.tsx');
    expect(vis).toContain('vpdf-btn vpdf-nucleo vpdf-alterna');
    expect(vis).toContain('aria-pressed={miniaturas}');
    expect(vis).not.toContain('☰');
    const css = ler('src/features/relatorios/anotacoes/anotacoes.css');
    expect(css).toMatch(/\.vpdf-alterna\[aria-pressed="true"\][^{]*\{[^}]*background: var\(--destaque[^}]*color: #fff;/);
  });
});
