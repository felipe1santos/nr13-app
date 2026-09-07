/**
 * GATE da rodada "Registros de Segurança" (07/09/2026).
 *
 * A primeira tela de `/livro-registro` era uma `fj-table` crua enquanto a de
 * dentro já falava o idioma aprovado (chips tingidos, cards com realce, badge
 * de contagem). Esta suíte trava as duas coisas que a rodada decidiu: o NOME na
 * interface e o desenho da lista.
 *
 * Estrutura, não render: roda sem DOM. O que depende de pixel está medido em
 * `docs/medicoes/2026-09-07-ux-registros-seguranca.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const menu = readFileSync('src/app/menu.ts', 'utf8');
const pagina = readFileSync('src/pages/LivroRegistro.tsx', 'utf8');
const catalogo = readFileSync('src/features/livro/CatalogoLivroV9.tsx', 'utf8');
const css = readFileSync('src/features/livro/listaRegistros.css', 'utf8');
const permissoes = readFileSync('src/services/permissoes.ts', 'utf8');

/** O código, sem comentários — eles citam os rótulos antigos de propósito. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a seção se chama "Registros de Segurança"', () => {
  it('no menu, no título da página e na lista de permissões', () => {
    expect(menu).toContain("label: 'Registros de Segurança'");
    expect(menu).toContain("titulo: 'Registros de Segurança'");
    expect(permissoes).toContain("livro: 'Registros de Segurança'");
    expect(semComentarios(permissoes)).not.toContain("'Livro Registro'");
  });

  it('o cabeçalho da primeira tela e a ação da linha trocaram', () => {
    expect(pagina).toContain('<h2>Registros de Segurança</h2>');
    expect(semComentarios(pagina)).not.toContain('Livros de Registro de Segurança');
    expect(catalogo).toContain('Abrir registros');
    expect(semComentarios(catalogo)).not.toContain('Abrir livro');
  });

  it('a ROTA não mudou — link emitido não pode virar 404', () => {
    // O rótulo é de interface; `/livro-registro` é endereço.
    expect(menu).toContain("to: '/livro-registro'");
  });

  it('o nome do DOCUMENTO continua o da norma, na tela de dentro', () => {
    // "Livro de Registro de Segurança" é como a NR-13 chama a peça, e é o que
    // a fiscalização procura. Renomear o documento junto com a seção seria
    // trocar o nome de um registro legal por conta de uma rodada de UX.
    expect(pagina).toContain('NR-13 · 13.4.1.9 · Livro de Registro de Segurança');
    expect(pagina).toContain('Capa do Livro de Registro');
  });
});

describe('a lista deixou de ser tabela', () => {
  it('a `fj-table` saiu e entraram cards de linha', () => {
    const limpo = semComentarios(catalogo);
    expect(limpo).not.toContain('fj-table');
    expect(limpo).not.toContain('<thead>');
    expect(catalogo).toContain('className="reg-card"');
    expect(catalogo).toContain('className="reg-lista"');
  });

  it('o card é UM botão — nada de botão dentro de botão', () => {
    // A linha inteira é o alvo do clique; "Abrir registros" é o afordamento
    // visual dessa mesma ação, num `span`. Um `<button>` ali dentro seria HTML
    // inválido e um segundo alvo competindo com o primeiro.
    // Do `className="reg-card"` até o `</button>` que o fecha: se houvesse um
    // botão aninhado, ele apareceria nesse trecho.
    const dentro = catalogo.slice(
      catalogo.indexOf('className="reg-card"'),
      catalogo.indexOf('</button>', catalogo.indexOf('className="reg-card"')),
    );
    expect(dentro).not.toContain('<button');
    expect(catalogo).toContain('<span className="reg-card-acao" aria-hidden>');
  });

  it('mostra o que a rodada pediu: TAG, nome, tipo, categoria, contagem e data', () => {
    expect(catalogo).toContain('reg-card-tag');
    expect(catalogo).toContain('reg-card-nome');
    expect(catalogo).toContain('ROTULO_TIPO[l.tipo]');
    expect(catalogo).toContain('Cat. {l.categoria}');
    expect(catalogo).toContain('metricaRegistros');
    expect(catalogo).toContain('último registro');
  });

  it('o cabeçalho da lista é o `painel-lista` das outras telas', () => {
    // Mesmo filete âmbar e mesma contagem de /relatorios e /prontuarios —
    // idioma existente, não vocabulário novo.
    expect(catalogo).toContain('className="bloco-dados painel-lista reg-painel"');
    expect(catalogo).toContain('painel-lista-contagem');
  });

  it('o realce do card é o MESMO do card da tela de dentro', () => {
    expect(css).toContain('box-shadow: 0 4px 12px rgba(12, 79, 155, 0.1);');
  });

  it('a barra de busca continua compacta, numa linha só', () => {
    const barra = /<BuscaLista[\s\S]*?\/>/.exec(catalogo)![0];
    expect(barra).toContain('compacto');
  });
});

describe('responsividade declarada', () => {
  it('tem faixa de tablet e de celular', () => {
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).toContain('@media (max-width: 640px)');
  });

  it('no celular a ação do card tem 44px de altura', () => {
    const movel = css.slice(css.indexOf('/* ── CELULAR'));
    expect(movel).toContain('height: 44px;');
  });

  it('nada de largura fixa que estoure a tela', () => {
    // A identidade é `minmax(0, 1fr)` nas três faixas: é o que deixa o nome do
    // equipamento encolher com reticências em vez de empurrar o card.
    expect(css).toContain('grid-template-columns: 44px minmax(0, 1fr) auto auto auto;');
    expect(css).toContain('grid-template-columns: 40px minmax(0, 1fr);');
    expect(css).not.toMatch(/\.reg-card \{[^}]*width: \d+px/);
  });
});

describe('o texto de abertura descreve o comportamento de HOJE', () => {
  it('não promete mais o preenchimento automático que a 10B.2 removeu', () => {
    // Até 04/09/2026 salvar um relatório criava a entrada sozinho. O rodapé da
    // tela ainda dizia isso — e mandava procurar um botão "Adicionar
    // ocorrência" que hoje se chama "Novo registro".
    const limpo = semComentarios(pagina);
    expect(limpo).not.toContain('preenchido automaticamente');
    expect(limpo).not.toContain('Adicionar ocorrência');
    expect(pagina).toContain('cada registro lacrado no momento em que é trancado');
  });

  it('o vazio separa "a busca não achou" de "ainda não existe"', () => {
    expect(catalogo).toContain('Nenhum equipamento encontrado para');
    expect(catalogo).toContain('Nenhum registro de segurança ainda');
  });
});
