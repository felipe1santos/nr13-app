/**
 * GATE da reforma de UX de Calibrações e Certificados (06/09/2026).
 *
 * Estrutura, não render: a suíte roda sem DOM. O que depende de render está
 * verificado no navegador, em `docs/medicoes/2026-09-06-ux-calibracoes.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
const catalogo = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
const certificados = readFileSync('src/pages/Certificados.tsx', 'utf8');
const modalComp = readFileSync('src/features/calibracoes/ModalComponente.tsx', 'utf8');
const modalAjuda = readFileSync('src/features/calibracoes/ModalAjudaCalibracoes.tsx', 'utf8');
const cssIlustra = readFileSync('src/features/calibracoes/ilustracoes.css', 'utf8');

/** O código, sem comentários — eles citam os rótulos antigos de propósito. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('adicionar componente: modal central, não caixa embaixo', () => {
  it('o formulário inline saiu', () => {
    // Ele nascia embaixo do painel: clicar em "+ Adicionar" empurrava os lotes
    // para baixo e, no celular, abria os campos fora da primeira tela.
    expect(semComentarios(pagina)).not.toContain('className="cal-comp-form"');
    expect(pagina).toContain('<ModalComponente');
  });

  it('o modal é diálogo, com ESC e armadilha de foco', () => {
    expect(modalComp).toContain('role="dialog"');
    expect(modalComp).toContain('aria-modal="true"');
    expect(modalComp).toContain("e.key === 'Escape'");
    expect(modalComp).toContain("e.key !== 'Tab'");
  });

  it('a regra de salvar é a MESMA — nome obrigatório, `salvarComponente`', () => {
    expect(modalComp).toContain("const podeSalvar = c.nome.trim() !== '';");
    expect(pagina).toContain('await salvarComponente(tag, c);');
  });

  it('trocar a foto continua zerando a `fotoRef` antiga', () => {
    // Manter a referência velha faria `salvarComponente` gravar a foto antiga e
    // descartar em silêncio a que o usuário acabou de escolher.
    expect(modalComp).toContain('fotoRef: undefined');
  });
});

describe('o texto explicativo virou ajuda contextual', () => {
  it('Calibrações troca o parágrafo fixo por "Como funciona"', () => {
    expect(semComentarios(pagina)).not.toContain('cal-eq-sub');
    expect(pagina).toContain('Como funciona');
    expect(pagina).toContain('<ModalAjudaCalibracoes');
  });

  it('Certificados troca os três parágrafos por uma linha', () => {
    const limpo = semComentarios(certificados);
    expect(limpo).not.toContain('Aqui você injeta o');
    expect(limpo).not.toContain('cert-intro-nota');
    expect(certificados).toContain('cert-intro-compacta');
    expect(certificados).toContain('<ModalAjudaCalibracoes');
  });

  it('o texto foi REAPROVEITADO, não jogado fora', () => {
    // As quatro ideias do texto antigo continuam ali, em passos numerados.
    expect(modalAjuda).toContain('certificado de calibração de cada instrumento');
    expect(modalAjuda).toContain('rastreabilidade');
    expect(modalAjuda).toContain('um certificado por padrão');
    expect(modalAjuda).toContain('anexa o PDF do padrão');
  });

  it('a ajuda é um diálogo, fechável pelo ESC', () => {
    expect(modalAjuda).toContain('role="dialog"');
    expect(modalAjuda).toContain("e.key === 'Escape'");
  });
});

describe('ilustrações', () => {
  it('são SVG no componente — sem arquivo, sem requisição, sem dependência', () => {
    expect(modalAjuda).toContain('<svg');
    expect(modalAjuda).not.toContain('<img');
    expect(modalAjuda).not.toMatch(/from '(?!\.|react)/);
  });

  it('têm rótulo para leitor de tela', () => {
    expect(modalAjuda).toContain('role="img"');
    expect(modalAjuda).toContain('aria-label=');
  });

  it('usam as variáveis do tema, e cor só onde a atenção deve cair', () => {
    expect(cssIlustra).toContain('stroke: var(--muted');
    expect(cssIlustra).toContain('.il-marca,');
    expect(cssIlustra).toMatch(/\.il-marca \{ fill: var\(--amber/);
  });
});

describe('a barra de Calibrações', () => {
  it('filtro e busca na mesma linha; o painel exposto saiu', () => {
    const barra = /<BuscaLista[\s\S]*?\/>/.exec(catalogo)![0];
    expect(barra).toContain('antes={');
    expect(barra).toContain('compacto');
    expect(semComentarios(catalogo)).not.toContain('rel-filtros-painel');
    expect(catalogo).toContain('<ModalFiltrosProntuarios');
  });

  it('reusa o MESMO modal de filtro dos prontuários', () => {
    // São a mesma pergunta em duas telas. Dois modais quase iguais seriam a
    // próxima correção feita num lugar e esquecida no outro.
    expect(catalogo).toContain("from '../prontuarios/ModalFiltrosProntuarios'");
    expect(catalogo).toContain('modo="equipamentos"');
  });

  it('o cabeçalho "Selecione o Equipamento" saiu', () => {
    expect(semComentarios(pagina)).not.toContain('Selecione o Equipamento');
  });

  it('no celular o botão de filtro fica quadrado, com altura declarada', () => {
    const movel = cssIlustra.slice(cssIlustra.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('.calibracoes-page .pront-btn-rotulo { display: none; }');
    // Sem rótulo e com `padding: 0`, um botão sem altura declarada mede 2px.
    expect(movel).toContain('height: 44px;');
  });
});

describe('nada de diálogo nativo nos fluxos tocados', () => {
  it('o cadastro de componente não usa prompt nem alert', () => {
    expect(modalComp).not.toContain('window.prompt');
    expect(modalComp).not.toContain('window.alert');
    expect(modalAjuda).not.toContain('window.alert');
  });
});
