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

describe('o card não repete a mesma informação duas vezes', () => {
  it('a segunda linha é o nome PRÓPRIO; o tipo é só o badge', () => {
    // Medido em produção em 07/09/2026: cadastro sem descrição caía no rótulo
    // do tipo e a linha saía com "Vaso de Pressão" no nome E no badge ao lado.
    expect(catalogo).toContain("const nome = l.descricao?.trim() ?? '';");
    expect(catalogo).toContain('{nome && (');
    expect(semComentarios(catalogo)).not.toContain("l.descricao?.trim() || (l.tipo ?");
  });
});

/* ══ Segunda rodada (07/09/2026): toolbar da tela interna + modal ══ */

const modal = readFileSync('src/features/livro/ModalNovoRegistro.tsx', 'utf8');
const cssModal = readFileSync('src/features/livro/modalNovoRegistro.css', 'utf8');

describe('a tela do equipamento tem UMA barra de ferramentas', () => {
  it('as ações saíram da fileira solta e entraram na faixa', () => {
    // Antes: `<div style={{ display: 'flex', ..., justifyContent: 'flex-end' }}>`
    // no meio da tela, sem moldura, entre os cards e a linha do tempo.
    expect(pagina).toContain('className="livro-toolbar"');
    expect(pagina).toContain('className="livro-toolbar-acoes"');
    expect(semComentarios(pagina)).not.toContain("justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14");
  });

  it('a trilha é a MESMA dos outros módulos', () => {
    // `meta-breadcrumb` + chevron + chip da TAG: /relatorios, /prontuarios,
    // /inspecoes e /calibracoes já leem assim.
    const barra = pagina.slice(pagina.indexOf('className="livro-toolbar"'));
    expect(barra).toContain('className="meta-breadcrumb"');
    expect(barra).toContain('className="breadcrumb-chevron"');
    expect(barra).toContain('className="crumb-tag-chip"');
  });

  it('"Novo registro" é a única primária da barra', () => {
    const barra = pagina.slice(
      pagina.indexOf('className="livro-toolbar-acoes"'),
      pagina.indexOf('Capa e Termo'),
    );
    expect(barra.match(/fj-btn-primary/g)).toHaveLength(1);
    expect(barra).toContain('Novo registro');
    // As utilitárias continuam todas ali — a barra não escondeu ação nenhuma.
    for (const t of ['Histórico', 'Ver livro completo', 'Exportar PDF']) {
      expect(barra).toContain(t);
    }
  });

  it('o botão de voltar saiu do cabeçalho e não ficou duplicado', () => {
    // Sem os comentários: o de cima cita o rótulo ao explicar de onde ele saiu.
    expect(semComentarios(pagina).match(/← Todos os equipamentos/g)).toHaveLength(1);
  });

  it('no celular os botões da barra têm 44px', () => {
    const movel = css.slice(css.indexOf('@media (max-width: 640px)', css.indexOf('.livro-toolbar')));
    expect(movel).toContain('height: 44px;');
  });
});

describe('o modal "Novo registro"', () => {
  it('virou componente próprio, com diálogo, ESC e armadilha de foco', () => {
    expect(pagina).toContain('<ModalNovoRegistro');
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby={idTitulo}');
    expect(modal).toContain("e.key === 'Escape'");
    expect(modal).toContain("e.key !== 'Tab'");
  });

  it('a regra de gravação NÃO mudou de lugar', () => {
    // O modal só desenha: quem valida e grava o rascunho continua sendo a
    // página, com `montarEntradaLivroManual` + `salvarRascunhoLivro`.
    expect(pagina).toContain('await salvarRascunhoLivro(linhaAberta.tag,');
    expect(modal).not.toContain('salvarRascunhoLivro');
    expect(modal).not.toContain('montarEntradaLivro');
  });

  it('usa a ilustração desta sessão, leve e sem esticar', () => {
    expect(modal).toContain('/ilustracoes/registro-seguranca.webp');
    expect(modal).toContain('loading="lazy"');
    const b = readFileSync('public/ilustracoes/registro-seguranca.webp');
    expect(b.slice(8, 12).toString()).toBe('WEBP');
    expect(b.length).toBeLessThan(150_000);
    expect(cssModal).toContain('aspect-ratio: 1 / 1;');
    expect(cssModal).toContain('object-fit: contain;');
  });

  it('a ilustração tem alt descritivo — não o nome do arquivo', () => {
    const alt = /alt="([^"]+)"/.exec(modal)![1];
    expect(alt.length).toBeGreaterThan(40);
    expect(alt).not.toContain('.webp');
  });

  it('explica o ciclo do registro: rascunho → continuar → trancar', () => {
    expect(modal).toContain('Salve como rascunho');
    expect(modal).toContain('continuar depois');
    expect(modal).toContain('Tranque quando estiver certo');
    // O que o rascunho NÃO é — a dúvida que o parágrafo cinza antigo não tirava.
    expect(modal).toContain('não conta como registro');
    expect(modal).toContain('não pode mais ser editado');
  });

  it('no desktop o formulário fica à esquerda e o apoio à direita', () => {
    // A coluna de apoio vem antes no DOM (é o que se lê primeiro) e vai para a
    // direita pelo `order` — sem nada focável dentro, a tabulação não muda.
    expect(cssModal).toContain('order: 2;');
    expect(modal.indexOf('reg-modal-lado')).toBeLessThan(modal.indexOf('reg-modal-form'));
  });

  it('empilha no tablet e no celular, com botões de 44px', () => {
    expect(cssModal).toContain('@media (max-width: 900px)');
    expect(cssModal).toContain('flex-direction: column;');
    const movel = cssModal.slice(cssModal.indexOf('@media (max-width: 640px)'));
    expect(movel).toContain('height: 44px;');
  });
});

describe('o campo "Pré-preencher a partir de um relatório finalizado"', () => {
  it('tem o "i" com popover acessível', () => {
    expect(modal).toContain('aria-label="O que é pré-preencher"');
    expect(modal).toContain('aria-expanded={aberto}');
    expect(modal).toContain('aria-controls={idPop}');
    expect(modal).toContain('role="note"');
  });

  it('o ESC fecha o POPOVER sem derrubar o modal', () => {
    // Sem o `stopPropagation`, um ESC para fechar a explicação fecharia o modal
    // inteiro e levaria junto o que já tinha sido digitado.
    expect(modal).toContain('e.stopPropagation();');
  });

  it('o texto descreve o que `preencherDeRelatorio` faz DE VERDADE', () => {
    // Conferido no código: copia data, tipo, descrição e responsável para o
    // formulário, que continua editável, e não grava nada sozinho.
    expect(modal).toContain('copia para os campos abaixo');
    expect(modal).toContain('Tudo continua');
    expect(modal).toContain('revise e complete antes de salvar');
  });

  it('a opção padrão deixou de ser "— preencher à mão —"', () => {
    expect(modal).toContain('Preencher manualmente');
    expect(semComentarios(modal)).not.toContain('preencher à mão');
    expect(semComentarios(pagina)).not.toContain('preencher à mão');
  });

  it('"sem assinatura" também perdeu os travessões', () => {
    expect(modal).toContain('<option value="">Sem assinatura</option>');
  });
});

describe('hierarquia do formulário', () => {
  it('os campos estão agrupados, com dois por linha no desktop', () => {
    expect(modal).toContain('<h3>Ocorrência</h3>');
    expect(modal).toContain('<h3>Responsáveis</h3>');
    expect(cssModal).toContain('grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));');
  });

  it('o obrigatório é uma marca no rótulo, não um asterisco solto', () => {
    expect(modal).toContain('<em>obrigatório</em>');
    expect(semComentarios(modal)).not.toContain('*</label>');
  });

  it('o rodapé diz o que o botão faz antes de ele ser clicado', () => {
    expect(modal).toContain('Salva como rascunho — você tranca depois.');
    expect(modal).toContain('Salvar rascunho');
    expect(modal).toContain('Cancelar');
  });
});
