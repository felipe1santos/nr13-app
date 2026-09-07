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
    // O `<h2>` agora abriga o "i" da sessão, então o rótulo e a tag ficam em
    // linhas diferentes.
    expect(pagina).toMatch(/<h2>\s*Registros de Segurança/);
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

  it('a lista fica num `painel-lista`, como nas outras telas', () => {
    // O CABEÇALHO do painel saiu na 3ª rodada (repetia o título da tela e a
    // contagem que a busca já mostra). O painel fica pelo piso de altura, que é
    // o que impede a caixa branca de virar uma tira com dois equipamentos.
    expect(catalogo).toContain('className="bloco-dados painel-lista reg-painel"');
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
    // O texto agora vive no popover do título; o que ele diz continua sendo o
    // ciclo real: rascunho → trancado → cadeia de integridade.
    expect(pagina).toContain('numeração do livro e passa a integrar a cadeia de integridade');
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
const popoverAjuda = readFileSync('src/features/livro/PopoverAjuda.tsx', 'utf8');

describe('a tela do equipamento tem UMA barra de ferramentas', () => {
  it('as ações saíram da fileira solta e entraram na faixa', () => {
    // Antes: `<div style={{ display: 'flex', ..., justifyContent: 'flex-end' }}>`
    // no meio da tela, sem moldura, entre os cards e a linha do tempo.
    // 3ª rodada: a faixa separada virou o cabeçalho ÚNICO — identificação,
    // ações e foto no mesmo bloco.
    expect(pagina).toContain('className="fj-panel-head livro-topo"');
    expect(pagina).toContain('className="livro-toolbar-acoes"');
    expect(semComentarios(pagina)).not.toContain("justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14");
  });

  it('a trilha é a MESMA dos outros módulos', () => {
    // `meta-breadcrumb` + chevron + chip da TAG: /relatorios, /prontuarios,
    // /inspecoes e /calibracoes já leem assim.
    const barra = pagina.slice(pagina.indexOf('className="fj-panel-head livro-topo"'));
    expect(barra).toContain('meta-breadcrumb livro-topo-trilha');
    expect(barra).toContain('className="breadcrumb-chevron"');
    // O chip da TAG saiu da trilha na 3ª rodada: a TAG é o `<h2>` logo abaixo,
    // e repeti-la 6px acima gastava a linha que o eyebrow da norma ocupa.
    expect(barra).toContain('NR-13 · 13.4.1.9 · Livro de Registro de Segurança');
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
    // O botão virou `PopoverAjuda` na 3ª rodada; o modal declara o rótulo.
    expect(modal).toContain('rotulo="O que é pré-preencher"');
    expect(popoverAjuda).toContain('aria-expanded={aberto}');
    expect(popoverAjuda).toContain('aria-controls={idPop}');
    expect(popoverAjuda).toContain('role="note"');
  });

  it('o ESC fecha o POPOVER sem derrubar o modal', () => {
    // Sem o `stopPropagation`, um ESC para fechar a explicação fecharia o modal
    // inteiro e levaria junto o que já tinha sido digitado.
    expect(popoverAjuda).toContain('e.stopPropagation();');
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

describe('os passos do modal cabem na coluna certa', () => {
  it('título e texto ficam na segunda coluna da grade', () => {
    // Visto em produção em 07/09/2026: sem esta regra o `<span>` era
    // auto-posicionado na linha de baixo, na coluna de 22px do número, e o
    // texto saía com UMA PALAVRA POR LINHA. Não transborda nada — por isso a
    // medição de transbordo não pegava, e a de largura do texto pega.
    expect(cssModal).toContain('.reg-modal-passos li > b,');
    expect(cssModal).toContain('.reg-modal-passos li > span { grid-column: 2; }');
  });
});

describe('o pré-preenchimento entrega o que o texto promete', () => {
  it('a data do relatório é convertida para o formato do campo', () => {
    // `<input type="date">` só aceita `aaaa-mm-dd`. A entrada montada traz a
    // data do relatório, que pode vir `dd/mm/aaaa`: atribuída direto, o campo
    // ficava VAZIO sem erro nenhum — medido em produção em 07/09/2026.
    expect(pagina).toContain('function paraISO(data: string): string {');
    expect(pagina).toContain('data: paraISO(String(entrada.data ?? ');
  });

  it('o tipo vindo do relatório aparece no select', () => {
    // "Inspeção Periódica" não está entre as ocorrências manuais. Sem entrar na
    // lista, o campo obrigatório ficava em branco depois de pré-preencher e o
    // "Salvar rascunho" recusava.
    expect(modal).toContain('const tipos = TIPOS_OCORRENCIA.includes(form.tipoOcorrencia)');
    expect(modal).toContain('[form.tipoOcorrencia, ...TIPOS_OCORRENCIA]');
    expect(modal).toContain('{tipos.map((t) => (');
  });
});

/* ══ Terceira rodada (07/09/2026): refino final das duas telas ══ */

const popover = readFileSync('src/features/livro/PopoverAjuda.tsx', 'utf8');
const busca = readFileSync('src/features/livro/buscaLivro.ts', 'utf8');

describe('tela principal, refinada', () => {
  it('o cabeçalho "Equipamentos com registros" saiu', () => {
    const limpo = semComentarios(catalogo);
    expect(limpo).not.toContain('Equipamentos com registros');
    expect(limpo).not.toContain('painel-lista-head');
    // O painel fica: é o piso de altura que impede a caixa virar uma tira.
    expect(catalogo).toContain('bloco-dados painel-lista reg-painel');
  });

  it('o parágrafo do topo virou o "i" ao lado do título', () => {
    const limpo = semComentarios(pagina);
    expect(limpo).not.toContain('em ordem\n              cronológica, com cada registro lacrado');
    expect(pagina).toContain('rotulo="Como funcionam os Registros de Segurança"');
    expect(pagina).toContain('<PopoverAjuda');
  });

  it('o "i" é um só componente, usado nos três lugares', () => {
    // Modal (pré-preencher), título da sessão e selo da cadeia. Três cópias
    // seriam três comportamentos de ESC diferentes daqui a um mês.
    expect(popover).toContain('export default function PopoverAjuda');
    expect(popover).toContain('e.stopPropagation();');
    expect(modal).toContain("from './PopoverAjuda'");
    expect(pagina).toContain("from '../features/livro/PopoverAjuda'");
  });

  it('a foto do equipamento entra no card, em miniatura', () => {
    expect(catalogo).toContain('className="reg-card-foto"');
    expect(catalogo).toContain('variante="thumb"');
    // Sem foto, o chip do tipo continua identificando o equipamento.
    expect(catalogo).toContain('className="reg-card-ic"');
    expect(css).toContain('object-fit: cover;');
  });

  it('a foto vem da projeção que JÁ tem a coluna — sem migração', () => {
    // `buscar_livros` não devolve `foto_ref`, e trocar a assinatura da RPC em
    // produção por causa de uma miniatura custaria o rollout do §13 do
    // CLAUDE.md. `equipamentos_index` já tem a coluna, o grant e a mesma RLS.
    expect(busca).toContain("from('equipamentos_index')");
    expect(busca).toContain("select('tag,foto_ref')");
    expect(busca).toContain('.in(');
    // Enfeite não derruba a lista: a função engole o erro.
    expect(busca).toContain('return {};');
  });

  it('o hover da linha é sutil — fundo, não salto', () => {
    expect(css).toContain('.reg-card:hover { background: var(--bg-faint, #fbfaf7); }');
  });
});

describe('tela interna, refinada', () => {
  it('identificação, ações e foto no MESMO bloco', () => {
    expect(pagina).toContain('className="fj-panel-head livro-topo"');
    expect(pagina).toContain('className="livro-topo-id"');
    expect(pagina).toContain('className="livro-topo-foto"');
    // A faixa separada de ferramentas saiu: eram três faixas empilhadas.
    expect(semComentarios(pagina)).not.toContain('<div className="livro-toolbar">');
  });

  it('a foto é a REAL do equipamento, do cache já semeado', () => {
    expect(pagina).toContain('identificacaoDe(fotos)');
    expect(pagina).toContain('nr13_fotos_${tagAberta}');
    expect(pagina).toContain('variante="thumb"');
    // Legado: as fotos anteriores ao bucket moram em `src`.
    expect(pagina).toContain('base64: capa.src');
  });

  it('os ícones de Capa e Termo dizem o que cada folha é', () => {
    // A partir da classe do chip, e não até o rótulo: o comentário acima do JSX
    // cita os dois nomes, e a fatia "até o rótulo" sairia vazia.
    const capa = pagina.slice(pagina.indexOf('livro-doc-ic capa'), pagina.indexOf('livro-doc-ic capa') + 90);
    const termo = pagina.slice(pagina.indexOf('livro-doc-ic termo'), pagina.indexOf('livro-doc-ic termo') + 90);
    expect(capa).toContain('nome="book"');
    expect(termo).toContain('nome="checkcircle"');
  });

  it('os cards de Capa e Termo ficaram mais baixos', () => {
    expect(css).toContain('.livro-doc-card { padding: 10px 13px; gap: 10px; }');
    expect(css).toContain('.livro-doc-ic { width: 32px; height: 32px;');
  });

  it('o selo da cadeia cabe numa linha, com o porquê no "i"', () => {
    expect(pagina).toContain('className={`livro-cadeia no-print');
    expect(pagina).toContain('<strong>Cadeia íntegra</strong>');
    expect(pagina).toContain('rotulo="O que é a cadeia de registros"');
    // O ALERTA continua inteiro: esconder o motivo da quebra atrás de um clique
    // seria esconder justamente o que importa.
    expect(pagina).toContain('A cadeia de registros não confere.');
  });
});

describe('linha do tempo', () => {
  it('acende no hover — fundo, marco e ação', () => {
    expect(css).toContain('.livro-timeline-item:hover {');
    expect(css).toContain('.livro-timeline-item:hover .livro-timeline-marco {');
    expect(css).toContain('.livro-timeline-item:hover .fj-btn-ghost {');
    // Transição curta: 160ms, dentro da faixa pedida (150–200ms).
    expect(css).toContain('transition: background 0.16s ease, border-color 0.16s ease;');
  });

  it('o número do registro identifica a entrada, no cabeçalho dela', () => {
    expect(pagina).toContain('<span className="livro-timeline-num">#{numeroRegistro}</span>');
    expect(semComentarios(pagina)).not.toContain('selo-flat info2">Registro nº');
  });

  it('LACRADO é status; ÍNTEGRO é verde discreto; SHA é metadado', () => {
    // Os dois NÃO são a mesma coisa: um é a presença do selo, o outro é o
    // veredicto de recalculá-lo. Trocar um pelo outro afirmaria verificação
    // onde há só hash gravado.
    expect(pagina).toContain('className="livro-timeline-lacre"');
    expect(pagina).toContain('className="livro-timeline-integro"');
    expect(pagina).toContain('selo-flat crypto');
    expect(css).toContain('.livro-timeline-integro {');
  });

  it('no celular a ação da linha tem 44px', () => {
    const movel = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('.livro-timeline-acoes .fj-btn {');
    expect(movel).toContain('height: 44px;');
  });
});
