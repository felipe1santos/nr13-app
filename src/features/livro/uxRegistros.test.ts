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
    // 3ª rodada: a faixa separada virou o cabeçalho ÚNICO. 6ª: ele passou a ser
    // resolvido em DUAS linhas — trilha/ações/foto em cima, identificação
    // embaixo.
    expect(pagina).toContain('className="fj-panel-head livro-topo"');
    expect(pagina).toContain('className="livro-topo-l1"');
    expect(pagina).toContain('className="livro-topo-l2"');
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
    // Só a faixa de ações da LINHA 1 — depois dela vem a foto e, mais abaixo,
    // o "Trancar" primário dos rascunhos, que é outra coisa.
    const barra = pagina.slice(
      pagina.indexOf('className="livro-toolbar-acoes"'),
      pagina.indexOf('className="livro-topo-foto"'),
    );
    expect(barra.match(/fj-btn-primary/g)).toHaveLength(1);
    expect(barra).toContain('Novo registro');
    // As utilitárias continuam ali. "Histórico" SAIU na 4ª rodada: ele trocava
    // de modo de visualização, e agora existe uma lista só.
    for (const t of ['Ver livro completo', 'Exportar PDF']) {
      expect(barra).toContain(t);
    }
    expect(barra).not.toContain('Histórico');
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
    // ESC deixou de fechar ESTE modal no hotfix de 07/09/2026 (formulário
    // longo, gesto acidental). O foco preso e o `aria-modal` ficam — ver
    // `termoModal.test.ts`.
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
    // 4ª rodada: a coluna de apoio virou PRÉVIA + ajuda e passou a ter botões
    // (as abas). Com foco dentro dela, o DOM precisa seguir a leitura — form
    // primeiro, apoio depois — e o `order` do CSS saiu junto.
    expect(modal.indexOf('reg-modal-form')).toBeLessThan(modal.indexOf('reg-modal-lado'));
    expect(modal).toContain('role="tablist"');
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
    expect(pagina).toContain('className="livro-topo-l2"');
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
    // 6ª rodada: a prancheta lê melhor como "documento lavrado" do que o
    // círculo de confirmação, que no sistema significa APROVADO.
    expect(termo).toContain('nome="clipboard"');
  });

  it('os cards de Capa e Termo ficaram mais baixos', () => {
    // 6ª rodada: além de baixos, com largura PRÓPRIA — eles são atalhos, não
    // painéis, e esticavam até o fim da tela num grid `auto-fit`.
    expect(css).toContain('.livro-doc-card {');
    expect(css).toContain('width: 232px;');
    expect(css).toContain('.livro-doc-ic { width: 28px; height: 28px; border-radius: 6px; }');
  });

  it('a integridade virou pílula no resumo, não faixa isolada', () => {
    // A faixa verde ocupava uma linha inteira repetindo a mesma explicação em
    // toda visita. O veredicto foi para o resumo do livro; o porquê, para o "i".
    expect(semComentarios(pagina)).not.toContain('livro-cadeia no-print');
    expect(pagina).toContain('livro-resumo-cadeia');
    expect(pagina).toContain('Cadeia íntegra');
    expect(pagina).toContain('Cadeia não confere');
    expect(pagina).toContain('rotulo="O que é a cadeia de registros"');
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
    // O último bloco de 640px é o da lista única (4ª rodada); a regra do botão
    // "Ver / Imprimir" continua no bloco anterior.
    expect(css).toContain('.livro-timeline-acoes .fj-btn {');
    // Não é mais o ÚLTIMO bloco de 640px do arquivo (o visualizador entrou
    // depois): procura a regra, não a posição dela.
    expect(css).toContain('.livro-timeline-acoes .btn-icone { width: 44px; height: 44px; }');
  });
});

/* ══ Quarta rodada (07/09/2026): uma lista só, prévia viva, termo editável ══ */

const previaTsx = readFileSync('src/features/livro/PreviaRegistro.tsx', 'utf8');
const termoTs = readFileSync('src/features/livro/termoRegistro.ts', 'utf8');
const servico = readFileSync('src/features/relatorios/relatoriosService.ts', 'utf8');

describe('uma única forma de ver os registros', () => {
  it('o modo "Histórico" acabou — estado, botão e bloco', () => {
    const limpo = semComentarios(pagina);
    expect(limpo).not.toContain('setHistorico');
    expect(limpo).not.toContain('lrhist-log');
    expect(limpo).not.toContain("{historico ? (");
  });

  it('os rascunhos entraram NA lista, não numa seção acima', () => {
    expect(semComentarios(pagina)).not.toContain('className="livro-rascunhos"');
    expect(pagina).toContain('const itensDoLivro = useMemo');
    expect(pagina).toContain('itensDoLivro.map(({ entrada, numero, rascunho, i })');
  });

  it('a numeração continua sendo a dos TRANCAMENTOS', () => {
    // O rascunho não recebe número: a posição no livro é definida no
    // trancamento, e numerá-lo agora empurraria o "#000002" de um registro já
    // emitido.
    expect(pagina).toContain('numero: i + 1,');
    expect(pagina).toContain('numero: 0,');
    expect(pagina).toContain('<span className="livro-timeline-rascunho">Rascunho</span>');
  });

  it('a ordem é cronológica, pela mesma regra de data do serviço', () => {
    expect(pagina).toContain('timestampDataLivro(a.entrada.data) - timestampDataLivro(b.entrada.data)');
  });
});

describe('ações por estado do registro', () => {
  it('rascunho: ver, editar, trancar e excluir', () => {
    const bloco = pagina.slice(pagina.indexOf('className="livro-timeline-acoes"'));
    expect(bloco).toContain('Ver o rascunho');
    expect(bloco).toContain('Editar o rascunho');
    expect(bloco).toContain('Trancar');
    expect(bloco).toContain('Excluir o rascunho');
  });

  it('lacrado: só ver/imprimir — a imutabilidade não é opcional', () => {
    // O lápis não aparece para registro trancado. Registro consumado não se
    // edita, se retifica.
    const bloco = pagina.slice(
      pagina.indexOf('className="livro-timeline-acoes"'),
      pagina.indexOf('</li>', pagina.indexOf('className="livro-timeline-acoes"')),
    );
    const semRascunho = bloco.slice(bloco.indexOf(') : ('));
    // "Ver registro" desde a 5ª rodada: o que abre é a FICHA, e a folha A4 fica
    // na aba ao lado — o rótulo antigo prometia impressão como ação primária.
    expect(semRascunho).toContain('Ver registro');
    expect(semRascunho).not.toContain('Editar');
    expect(semRascunho).not.toContain('Trancar');
  });
});

describe('prévia viva do registro', () => {
  it('o modal mostra a prévia, e ela é a aba padrão', () => {
    expect(modal).toContain('<PreviaRegistro dados={previa} />');
    expect(modal).toContain("abaInicial = 'previa'");
    expect(modal).toContain('role="tablist"');
  });

  it('a prévia acompanha o que está sendo digitado', () => {
    // Ela é montada dos campos do formulário, não de algo gravado.
    expect(modal).toContain('const previa: DadosPrevia = {');
    expect(modal).toContain('oQueFoiFeito: form.oQueFoiFeito,');
    expect(modal).toContain('termo: termoEfetivo,');
  });

  it('a prévia não se anuncia como o documento final', () => {
    // Ela não é a folha A4 (moldura, cabeçalho com logo, assinatura impressa).
    // Dizer que é seria prometer fidelidade que este bloco não entrega.
    expect(previaTsx).toContain('A folha para imprimir e colar no livro físico');
  });

  it('o olho da lista abre o rascunho NA prévia', () => {
    expect(pagina).toContain("editarRascunho(entrada, 'previa')");
    expect(pagina).toContain('abaInicial={abaModal}');
  });
});

describe('o termo é editável', () => {
  it('existe campo, com sugestão e restauração', () => {
    expect(modal).toContain('id="oc-termo"');
    expect(modal).toContain('value={termoEfetivo}');
    expect(modal).toContain('restaurar sugestão');
  });

  it('o texto do usuário VENCE a sugestão', () => {
    // Mudar a data depois de escrever não pode reescrever o texto de alguém.
    // A regra virou `null` vs string (o `trim()` fazia a sugestão voltar
    // quando o campo era esvaziado). Ver `termoModal.test.ts`.
    expect(modal).toContain('const termoEfetivo = editouTermo ? (form.termoTexto as string) : sugestao;');
    expect(termoTs).toContain('export function termoSugerido');
  });

  it('a sugestão é a redação da FOLHA, não uma paráfrase', () => {
    // Divergir aqui mostraria uma prévia que não é o documento.
    expect(termoTs).toContain('conforme item 13.5.4 ');
    expect(termoTs).toContain('em obediência à Portaria Mtb nº 3.214');
    expect(termoTs).toContain('foi considerado INAPTO a operar nas condições atuais');
  });

  it('o termo vai GRAVADO no registro, inclusive quando não foi editado', () => {
    // Guardar só o texto editado deixaria a folha remontar a frase com os dados
    // de amanhã (razão social nova) num registro já trancado.
    expect(pagina).toContain('termoTexto: termoDoFormulario(),');
    // O `|| undefined` saiu no hotfix: ele trocava o termo APAGADO por campo
    // ausente, e a folha remontava a frase. Ver `termoModal.test.ts`.
    expect(servico).toContain('termoTexto: dados.termoTexto ?? undefined,');
  });

  it('reabrir o rascunho traz o termo digitado de volta', () => {
    expect(pagina).toContain("termoTexto: (r as { termoTexto?: string }).termoTexto ?? null,");
  });
});

describe('o modal ficou mais reto', () => {
  it('menos caixa: o pré-preenchimento virou filete', () => {
    expect(cssModal).toContain('border-left: 3px solid var(--blue, #457dc1);');
    expect(cssModal).toContain('background: transparent;');
  });

  it('raio menor, de software corporativo', () => {
    expect(cssModal).toContain('.reg-modal { border-radius: 10px; }');
    expect(cssModal).toContain('.reg-modal-form .fj-field textarea { border-radius: 6px; }');
  });
});

describe('detalhes vistos na prévia, em produção', () => {
  it('a data aparece em português, não no formato do input', () => {
    expect(previaTsx).toContain('dataParaBR(dados.data)');
  });

  it('a sugestão de ocorrência não sai com ponto duplicado', () => {
    expect(termoTs).toContain('/[.!?]$/.test(bruta)');
  });

  it('o palco é refeito quando o livro muda', () => {
    // Trancar e clicar em "Ver / Imprimir" abria a folha com o palco montado
    // ANTES do trancamento: sem a entrada nova e sem o termo digitado.
    expect(pagina).toContain('livro-${tagDoPalco}-v${versaoLivro}');
    expect(pagina).toContain('setVersaoLivro((v) => v + 1)');
  });
});

/* ══ Quinta rodada (07/09/2026): ficha eletrônica primeiro, A4 ao lado ══ */

describe('a ficha eletrônica é a visualização principal', () => {
  it('o registro salvo abre na FICHA, com a folha A4 ao lado', () => {
    // O clique da lista guarda a ENTRADA e escolhe a ficha. Sem isso o
    // visualizador abre VAZIO — a ficha não tem dado e o A4 está escondido
    // (visto em produção em 07/09/2026, quando o patch não pegou este botão).
    expect(pagina).toContain('setRegistroAberto({ entrada, numero })');
    expect(pagina).toContain("setModoVisual('ficha')");
    expect(pagina).toContain('livro-visual-modos');
    expect(pagina).toContain('Folha A4');
    expect(pagina).toContain('<PreviaRegistro');
  });

  it('capa e termo de abertura abrem direto em A4 — não têm ficha', () => {
    // São documentos de papel: não existe "registro eletrônico" deles.
    const capa = pagina.slice(pagina.indexOf("'CAPA-LIVRO-REGISTRO.html', titulo") - 220, pagina.indexOf("'CAPA-LIVRO-REGISTRO.html', titulo"));
    expect(capa).toContain("setModoVisual('a4')");
  });

  it('imprimir e baixar PDF só aparecem no modo A4', () => {
    // Imprimir a ficha não é o que ninguém quer; o botão ali só confundiria.
    expect(pagina).toContain("{modoVisual === 'a4' && (");
  });

  it('o iframe da folha continua montado, só escondido', () => {
    // Ele mede a altura do conteúdo no `onLoad`; desmontar faria a medição
    // recomeçar a cada troca de aba.
    expect(pagina).toContain("display: modoVisual === 'a4' ? undefined : 'none'");
  });

  it('a ficha de um registro antigo não fica sem termo', () => {
    // `termoTexto` ausente = entrada anterior ao campo (ou automática): a ficha
    // mostra a MESMA frase que a folha montaria, pela mesma regra.
    expect(pagina).toContain('function dadosDaEntrada');
    expect(pagina).toContain('termo ||');
  });
});

describe('a ficha tem hierarquia de leitura, não cara de papel', () => {
  it('data em azul escuro, tipo em petróleo, descrição em cinza', () => {
    expect(cssModal).toContain('.ficha-reg-data {');
    expect(cssModal).toContain('color: var(--blue2, #0c4f9b);');
    expect(cssModal).toContain('.ficha-reg-tipo { font-size: 14px; color: var(--petroleo, #0a5a6e); }');
    expect(cssModal).toContain('.ficha-reg-desc { color: var(--muted, #7a8790); }');
  });

  it('o selo diz o estado do registro na própria ficha', () => {
    expect(previaTsx).toContain("selo?: { texto: string; tom: 'rascunho' | 'lacrado' }");
    expect(cssModal).toContain('.ficha-reg-selo.lacrado');
    expect(cssModal).toContain('.ficha-reg-selo.rascunho');
  });

  it('a ficha não se apresenta como o documento legal', () => {
    expect(previaTsx).toContain('Esta é a ficha do registro no sistema');
  });

  it('o modal ficou mais reto ainda: 6px', () => {
    expect(cssModal).toContain('.reg-modal { border-radius: 6px; }');
    expect(cssModal).toContain('.reg-modal-prefill select { border-radius: 4px; }');
  });
});

/* ══ Sexta rodada (07/09/2026): a tela do equipamento, mais baixa ══ */

describe('cabeçalho em duas linhas', () => {
  it('linha 1 tem trilha, ações e foto; linha 2, a identificação', () => {
    const l1 = pagina.slice(pagina.indexOf('livro-topo-l1'), pagina.indexOf('livro-topo-l2'));
    expect(l1).toContain('meta-breadcrumb livro-topo-trilha');
    expect(l1).toContain('livro-toolbar-acoes');
    expect(l1).toContain('livro-topo-foto');
    const l2 = pagina.slice(pagina.indexOf('livro-topo-l2'));
    expect(l2).toContain('<h2>{linhaAberta.tag}</h2>');
    expect(l2).toContain('livro-topo-tipo');
    expect(l2).toContain('livro-topo-cat');
  });

  it('a categoria acompanha o nome, e não uma terceira linha de badges', () => {
    expect(semComentarios(pagina)).not.toContain('livro-topo-badges');
    expect(css).toContain('.livro-topo-l2 {');
  });
});

describe('faixa utilitária: documentos à esquerda, estado à direita', () => {
  it('os cards viraram atalhos de largura própria', () => {
    expect(pagina).toContain('className="livro-fixos-docs"');
    expect(css).toContain('.livro-fixos-docs { display: flex; gap: 10px; flex-wrap: wrap; }');
    expect(css).toContain('width: 232px;');
  });

  it('o resumo do livro fica no canto direito da MESMA faixa', () => {
    expect(pagina).toContain('className="livro-resumo"');
    expect(pagina).toContain('livro-resumo-num');
    expect(pagina).toContain('lacrado');
    expect(pagina).toContain('rascunho');
    expect(css).toContain('.livro-resumo {');
    expect(css).toContain('margin-left: auto;');
  });

  it('o veredicto da cadeia só aparece havendo registro lacrado', () => {
    // Dizer "íntegra" sobre livro vazio não afirma nada.
    expect(pagina).toContain('{cadeiaOk !== null && linhaAberta.entradas.length > 0 && (');
  });

  it('o título "Registros do livro" saiu', () => {
    const limpo = semComentarios(pagina);
    expect(limpo).not.toContain('Registros do livro');
    expect(limpo).not.toContain('livro-lista-head');
  });
});

describe('metadados da lista sem adesivo colorido', () => {
  it('o tipo é texto colorido, não badge com fundo', () => {
    expect(pagina).toContain('className={`livro-timeline-tipo t-${cor}`}');
    expect(semComentarios(pagina)).not.toContain('className={`fj-badge ${cor}`}');
    expect(css).toContain('.livro-timeline-tipo.t-info { color: var(--blue, #457dc1); }');
  });

  it('LACRADO virou cadeado verde, sem cápsula roxa', () => {
    expect(pagina).toContain('<Icone nome="cadeado" tam={11} /> Lacrado');
    const bloco = css.slice(css.lastIndexOf('.livro-timeline-lacre {'));
    expect(bloco).toContain('background: none;');
    expect(bloco).toContain('color: var(--ok, #1fa971);');
  });

  it('APTO/INAPTO e "manual" também perderam o fundo', () => {
    expect(pagina).toContain('className="livro-timeline-origem"');
    expect(pagina).toContain('livro-timeline-laudo');
    expect(semComentarios(pagina)).not.toContain('selo-flat manual');
  });
});

describe('ações do rascunho na horizontal', () => {
  it('a faixa de ações não empilha', () => {
    // Empilhadas, elas faziam o card do rascunho crescer e a lista virava uma
    // coluna de blocos altos.
    expect(css).toContain('.livro-timeline-acoes { flex-direction: row; flex-wrap: nowrap; }');
  });

  it('no celular elas continuam numa linha, com alvo de 44px', () => {
    const movel = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('overflow-x: auto;');
    expect(movel).toContain('.livro-timeline-acoes .btn-icone { width: 44px; height: 44px; flex: 0 0 auto; }');
  });
});
