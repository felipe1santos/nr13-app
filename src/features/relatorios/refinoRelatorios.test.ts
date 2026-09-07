/**
 * GATE do refino de `/relatorios` (06/09/2026).
 *
 * ## Por que este gate lê ARQUIVO em vez de renderizar
 *
 * A suíte deste projeto roda em `environment: 'node'`, sem DOM: não há como
 * montar `RelatoriosV9` e clicar. O que dá para travar é a ESTRUTURA — que a
 * célula do nome tenha uma linha só, que a coluna do número exista, que o botão
 * de criar abra um diálogo em vez de navegar. É menos do que um teste de
 * interação e é mais do que nada: cada afirmação aqui é um defeito que já
 * apareceu na tela e não pode voltar em silêncio.
 *
 * O que NÃO está aqui, e por isso foi verificado no navegador: se o modal
 * realmente abre, se o foco fica preso dentro dele e se o editor abre no passo
 * certo. Ver `docs/medicoes/2026-09-06-refino-relatorios.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILTRO_VAZIO, atalhoPeriodo, temAlgumFiltro } from './ModalFiltrosRelatorios';
import { nomeDoDocumento, nomeSugerido } from './nomeDocumento';
import { papelDaTelaLegada } from './rotaRelatorios';

const tela = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
const css = readFileSync('src/pages/relatorios.css', 'utf8');
const rota = readFileSync('src/features/relatorios/rotaRelatorios.ts', 'utf8');
const editor = readFileSync('src/pages/Relatorios.tsx', 'utf8');
const modalFiltro = readFileSync('src/features/relatorios/ModalFiltrosRelatorios.tsx', 'utf8');
const modalConfig = readFileSync('src/features/relatorios/ModalNovaInspecao.tsx', 'utf8');
const catalogo = readFileSync('src/features/relatorios/CatalogoRelatoriosV9.tsx', 'utf8');

describe('1 · /relatorios continua sendo a lista canônica única', () => {
  it('o catálogo de equipamentos só existe DENTRO do modal de criar', () => {
    /*
     * A moldura do modal virou compartilhada com `/prontuarios`, então o
     * catálogo passou a ser montado AQUI, como filho dela — antes ele morava
     * dentro do arquivo do modal. O que precisa continuar verdadeiro é a
     * posição: ele aparece uma vez só, e entre a abertura e o fechamento do
     * modal. No corpo da tela, seria a segunda lista que a auditoria removeu.
     */
    expect((tela.match(/<CatalogoRelatoriosV9/g) ?? []).length).toBe(1);
    const abre = tela.indexOf('<ModalSelecionarEquipamento');
    const fecha = tela.indexOf('</ModalSelecionarEquipamento>');
    const cat = tela.indexOf('<CatalogoRelatoriosV9');
    expect(abre).toBeGreaterThan(-1);
    expect(cat).toBeGreaterThan(abre);
    expect(cat).toBeLessThan(fecha);
  });

  it('o catálogo do modal não pede nem mostra a contagem de relatórios', () => {
    expect(catalogo).toContain('if (ehSelecao.current) return;');
    expect(tela).toContain('modo="selecao"');
  });
});

describe('2 · o nome do relatório ocupa uma linha', () => {
  it('a célula do nome tem só o nome', () => {
    expect(tela).toContain('className="rel-nome-forte"');
    expect(tela).not.toContain('className="rel-cel-meta"');
  });

  it('o texto que não couber some em ellipsis, com o nome inteiro no title', () => {
    expect(css).toContain('.rel-page .rel-nome-forte {');
    expect(css).toMatch(/\.rel-page \.rel-nome-forte \{[^}]*text-overflow: ellipsis;/s);
    expect(css).toMatch(/\.rel-page \.rel-nome-forte \{[^}]*white-space: nowrap;/s);
    expect(tela).toContain('title={r.nome ?? r.codigo ?? \'\'}');
  });
});

describe('3 e 4 · a rastreabilidade tem coluna própria', () => {
  it('existe o cabeçalho e a célula', () => {
    expect(tela).toContain('<span role="columnheader">Nº relatório</span>');
    expect(tela).toContain('className="rel-cel-codigo"');
  });

  it('a grade tem as dez colunas, na ordem pedida', () => {
    // A declaração que vale é a ÚLTIMA fora de `@media` — este arquivo tem
    // camadas de refino empilhadas e a cascata resolve pela ordem. Ela se
    // identifica pela primeira coluna, a marca do arquivo.
    const grade = [...css.matchAll(/grid-template-columns:\s*30px([\s\S]*?);/g)].pop();
    expect(grade).toBeDefined();
    // `minmax(190px, 2.4fr)` tem espaço dentro: separar por espaço partiria a
    // coluna em duas. O token é a função inteira, ou uma palavra sem espaço.
    const colunas = ('30px' + grade![1])
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .match(/minmax\([^)]*\)|\S+/g)!;
    // marca, nome, nº, TAG, tipo, criação, validade, próxima, situação, ações
    expect(colunas.length).toBe(10);
    expect(colunas[0]).toBe('30px');
    expect(colunas[9]).toBe('92px');
  });

  it('o cabeçalho da lista tem as mesmas dez colunas', () => {
    const bloco = /rel-linha rel-linha-cabecalho[\s\S]*?<\/div>/.exec(tela)![0];
    expect((bloco.match(/role="columnheader"/g) ?? []).length).toBe(10);
  });
});

describe('5, 6 e 7 · situação e tipo sem mancha de cor', () => {
  it('finalizado é texto, sem fundo e sem pílula', () => {
    const regra = /\.rel-page \.rel-selo-finalizado \{([\s\S]*?)\}/.exec(css)![1];
    expect(regra).toContain('background: none');
    expect(regra).toContain('padding: 0');
  });

  it('rascunho mantém destaque, em roxo', () => {
    const regra = /\.rel-page \.rel-selo-rascunho \{([\s\S]*?)\}/.exec(css)![1];
    expect(regra).toContain('#f1ecfb');
    expect(regra).toContain('#5b21b6');
  });

  it('o tipo perdeu o fundo azul preenchido', () => {
    expect(tela).toContain('className="rel-cel-tipo"');
    const regra = /\.rel-page \.rel-linha \.badge-tipo-inspecao \{([\s\S]*?)\}/.exec(css)![1];
    expect(regra).toContain('background: none');
    const tipo = /\.rel-page \.rel-cel-tipo \{([\s\S]*?)\}/.exec(css)![1];
    expect(tipo).toContain('var(--blue2');
    expect(tipo).toContain('font-weight: 650');
  });
});

describe('8 · a barra na ordem filtro → busca → criar', () => {
  it('o filtro vai no slot `antes` e o criar depois do campo', () => {
    const barra = /<BuscaLista[\s\S]*?<\/BuscaLista>/.exec(tela)![0];
    const posFiltro = barra.indexOf('rel-btn-filtro');
    const posCriar = barra.indexOf('rel-btn-criar');
    const posAntes = barra.indexOf('antes={');
    expect(posAntes).toBeGreaterThan(-1);
    expect(posFiltro).toBeGreaterThan(posAntes);
    expect(posCriar).toBeGreaterThan(posFiltro);
  });

  it('o campo é branco e o foco é âmbar — anel, não borda piscando', () => {
    // Há mais de uma regra para o campo (largura, depois cor). A que pinta é
    // a que declara `background`.
    const regras = [...css.matchAll(/\.rel-page \.busca-lista-campo \{([\s\S]*?)\}/g)].map(
      (m) => m[1],
    );
    const pintura = regras.find((r) => r.includes('background:'));
    expect(pintura).toBeDefined();
    expect(pintura!).toContain('background: var(--panel');
    expect(pintura!).toContain('caret-color: var(--amber-deep');
    expect(css).toContain('.rel-page .busca-lista-campo:focus-within {');
    // Nada de animação no contorno: só o caret pisca, que é o do navegador.
    expect(css).not.toMatch(/\.busca-lista-campo[^{]*\{[^}]*animation:/);
  });

  it('a busca anuncia os campos que alcança', () => {
    expect(tela).toContain('Buscar por TAG, equipamento, nome ou nº do relatório…');
  });
});

describe('9 · o filtro abre em modal', () => {
  it('não sobrou painel embaixo da barra', () => {
    expect(tela).not.toContain('rel-filtros-painel');
    expect(tela).toContain('<ModalFiltrosRelatorios');
  });

  it('o modal é diálogo, com ESC e armadilha de foco', () => {
    expect(modalFiltro).toContain('role="dialog"');
    expect(modalFiltro).toContain('aria-modal="true"');
    expect(modalFiltro).toContain("e.key === 'Escape'");
    expect(modalFiltro).toContain("e.key !== 'Tab'");
  });

  it('tem Limpar, Cancelar e Aplicar — e só aplica no Aplicar', () => {
    expect(modalFiltro).toContain('Limpar filtros');
    expect(modalFiltro).toContain('Cancelar');
    expect(modalFiltro).toContain('Aplicar');
    expect(modalFiltro).toContain('onClick={aoFechar}');
    // O estado é rascunho: `aoAplicar` recebe o objeto inteiro de uma vez.
    expect(modalFiltro).toContain('onClick={() => aoAplicar(v)}');
    expect(tela).toContain('function aplicarFiltro(v: ValoresFiltro)');
  });

  it('o recorte vazio é o padrão, e o "tem filtro" concorda com ele', () => {
    expect(temAlgumFiltro(FILTRO_VAZIO)).toBe(false);
    expect(temAlgumFiltro({ ...FILTRO_VAZIO, tipo: 'Inspeção Periódica' })).toBe(true);
    expect(temAlgumFiltro({ ...FILTRO_VAZIO, situacao: 'rascunho' })).toBe(true);
    expect(temAlgumFiltro({ ...FILTRO_VAZIO, escopo: 'todos' })).toBe(true);
  });

  it('os atalhos de período devolvem AAAA-MM-DD coerentes', () => {
    const hoje = new Date(2026, 8, 6); // 06/09/2026
    expect(atalhoPeriodo('mes', hoje)).toEqual({ de: '2026-09-01', ate: '2026-09-06' });
    expect(atalhoPeriodo('ano', hoje)).toEqual({ de: '2026-01-01', ate: '2026-09-06' });
    expect(atalhoPeriodo('12m', hoje)).toEqual({ de: '2025-09-06', ate: '2026-09-06' });
  });
});

describe('10, 11, 12 e 13 · criar sem sair da rota', () => {
  it('o botão criar abre diálogo, não navega', () => {
    const barra = /<BuscaLista[\s\S]*?<\/BuscaLista>/.exec(tela)![0];
    expect(barra).toContain('aria-haspopup="dialog"');
    expect(barra).toContain("onClick={() => setCriacao({ passo: 1 })}");
    expect(barra).not.toContain('navigate(');
  });

  it('escolher o equipamento leva ao passo 2, no mesmo lugar', () => {
    expect(tela).toContain("criacao?.passo === 1");
    expect(tela).toContain("criacao?.passo === 2");
    // Sem casar a indentação: o catálogo mudou de arquivo para dentro do modal
    // e o bloco andou dois níveis. O que importa é a transição, não o recuo.
    expect(tela).toMatch(/setCriacao\(\{\s*passo: 2,/);
  });

  it('o passo 2 é o MESMO modal de configuração de sempre', () => {
    // Nada de um segundo formulário de tipo/documentos: é o componente que o
    // editor já usava, com um cabeçalho a mais.
    expect(tela).toContain('<ModalNovaInspecao');
    expect(modalConfig).toContain('Configurar novo relatório');
    expect(modalConfig).toContain('DOCUMENTOS_DISPONIVEIS.map');
  });

  it('dá para trocar de equipamento sem fechar o fluxo', () => {
    expect(modalConfig).toContain('← Trocar equipamento');
    expect(tela).toContain('aoVoltar={() => setCriacao({ passo: 1 })}');
  });
});

describe('14 · confirmar abre o editor com a escolha pronta', () => {
  it('a configuração viaja no state da navegação, não na URL', () => {
    expect(editor).toContain("navigate(urlDoEditor(escolha.tag), { state: escolha })");
    expect(editor).toContain('const escolhaPronta = useRef(');
    expect(editor).toContain('avancarParaEtapaContainer(pronta.tipo, pronta.documentos)');
  });

  it('`urlDoEditor` continua sendo a mesma rota de sempre', () => {
    expect(rota).toContain("const p = new URLSearchParams({ editor: '1' });");
  });
});

describe('o backdrop da criação NÃO é o histórico da TAG', () => {
  /**
   * HISTÓRICO DESTE TESTE — ele já falhou duas vezes, de dois jeitos.
   *
   * 1ª tentativa (06/09, manhã): a tela decidia seu papel por
   *    `alvoLegadoDaUrl(search) === null`, ou seja "tem `tag` na URL?". O modal
   *    de criar passou a mandar a TAG, a resposta virou "sim", e o fluxo caiu
   *    no ramo do legado.
   * 2ª tentativa (06/09, tarde): passou-se a aceitar também "veio com a escolha
   *    pronta". Isso cobria o caminho de CRIAR e deixava de fora o de
   *    CONTINUAR RASCUNHO — `?editor=1&tag=…&rel=…`, que navega sem `state`.
   *    Era essa a URL do bug relatado.
   *
   * A correção definitiva não é mais uma condição: é a rota DIZER o papel.
   * `?editor=1` é editor, `?legado=1` é legado, e nenhuma das duas se deduz do
   * resto da query.
   */
  it('o papel vem da ROTA, não de heurística sobre a query', () => {
    expect(rota).toContain("export function papelDaTelaLegada(search: string): 'editor' | 'legado' {");
    expect(editor).toContain('const papel = useRef(papelDaTelaLegada(window.location.search));');
    // A pergunta que errou duas vezes não decide mais nada.
    expect(editor).not.toContain('alvoLegadoDaUrl(window.location.search) === null');
  });

  it('`?editor=1` é editor com ou sem tag e rel', () => {
    expect(papelDaTelaLegada('?editor=1')).toBe('editor');
    expect(papelDaTelaLegada('?editor=1&tag=ZZ-TESTE-P2')).toBe('editor');
    // A URL exata do bug relatado.
    expect(papelDaTelaLegada('?editor=1&tag=ZZ-TESTE-P2&rel=REL-1788571268261')).toBe('editor');
  });

  it('`?legado=1` continua sendo legado', () => {
    expect(papelDaTelaLegada('?legado=1&tag=ZZ-TESTE-P2')).toBe('legado');
    expect(papelDaTelaLegada('?legado=1&tag=X&rel=REL-1')).toBe('legado');
  });

  it('o resumo do passo 2 mostra o tipo por extenso, não o valor cru', () => {
    expect(tela).toContain('ROTULO_TIPO[item.tipo] ?? item.tipo');
    expect(catalogo).toContain('export const ROTULO_TIPO');
  });
});

describe('a segunda lista não existe no fluxo moderno', () => {
  it('o "Histórico de Relatórios" só renderiza no papel legado', () => {
    // Guarda ESTRUTURAL: mesmo que `tela` chegue a 'historico' por outro
    // caminho, no papel editor o bloco não é montado.
    expect(editor).toContain("{tela === 'historico' && papel.current === 'legado' && (");
    // E o título existe uma vez só no arquivo — não há uma segunda cópia.
    expect((editor.match(/<h3>Histórico de Relatórios<\/h3>/g) ?? []).length).toBe(1);
  });

  it('o segundo "+ Criar Relatório" saiu', () => {
    // Fora de comentário: o que conta é o texto RENDERIZADO. Os comentários
    // que explicam a remoção citam o rótulo antigo, e devem poder citá-lo.
    const semComentarios = editor
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(semComentarios).not.toContain('+ Criar Relatório');
    // Criar é ação da lista canônica, e lá o botão continua.
    expect(tela).toContain('Criar relatório');
  });

  it('abrir o equipamento não decide mais a tela sozinho', () => {
    // Era `abrirEquipamento` que fazia `setTela('historico')` no fim, e por
    // isso TODO caminho que carregasse um equipamento passava pela segunda
    // lista. Agora quem chama diz por que está abrindo.
    const corpo = /async function abrirEquipamento\([\s\S]*?\n  \}/.exec(editor)![0];
    expect(corpo).not.toContain("setTela('historico')");
    expect(corpo).not.toContain("setTela('criacao')");
    expect(editor).toContain('async function escolherEquipamento(novaTag: string)');
  });

  it('a lista canônica não tem outra tabela de relatórios dentro', () => {
    expect(tela).not.toContain('meta-table');
    expect((tela.match(/rel-tabela-v9/g) ?? []).length).toBeGreaterThan(0);
  });
});

describe('`rel=` aponta para um documento, e o destino é o documento', () => {
  it('não resolvendo, o editor volta para a lista canônica', () => {
    // ANTES: `visualizar` retornava cedo, em silêncio, e a tela FICAVA no
    // histórico por TAG. Uma lista que aparece quando algo falha é pior do que
    // um erro — ela parece um destino.
    expect(editor).toContain('async function abrirDocumentoDaUrl(tagAlvo: string, rel: string)');
    expect(editor).toContain('if (item && (await visualizar(item))) return;');
    expect(editor).toContain("navegar('/relatorios', { replace: true });");
  });

  it('`visualizar` informa quando o registro não existe', () => {
    const corpo = /async function visualizar\(item: RelatorioIndiceItem\): Promise<boolean> \{[\s\S]*?\n    if \(!r\) return false;/.exec(
      editor,
    );
    expect(corpo).not.toBeNull();
  });

  it('sem `rel`, o editor não fica numa lista', () => {
    expect(editor).toContain("if (papel.current === 'legado') setTela('historico');");
    expect(editor).toContain("else navegar('/relatorios', { replace: true });");
  });
});

describe('quem gera as URLs do editor e do legado', () => {
  it('só o dispatcher navega, e cada verbo tem seu destino', () => {
    // Quatro produtores, e nenhum outro arquivo do app monta essas rotas.
    expect(editor).toContain('aoAbrir={(r) => navigate(urlDoLegado(r.tag, r.relatorioId))}');
    expect(editor).toContain('aoContinuarRascunho={(r) => navigate(urlDoEditor(r.tag, r.id))}');
    expect(editor).toContain('navigate(urlDoEditor(escolha.tag), { state: escolha })');
    expect(editor).toContain('navigate(urlDoEditor())');
  });

  it('a lista canônica abre o finalizado nela mesma, sem navegar', () => {
    // `abrir` resolve o artefato no próprio visualizador; `aoAbrir` só é
    // chamado para o legado SEM arquivo. É o que impede o clique em
    // "visualizar" de virar uma volta pelo histórico.
    expect(tela).toContain('if (artefatoDoItemBuscado(r)) setAberto(r);');
  });
});

describe('15 · o legado continua alcançável', () => {
  it('`?legado=1` ainda leva à tela antiga', () => {
    expect(rota).toContain("return new URLSearchParams(search).get('legado') === '1' ? 'legado' : 'v9';");
    expect(rota).toContain('export function urlDoLegado(tag: string, rel: string): string {');
  });

  it('a tela nova continua delegando o relatório SEM arquivo', () => {
    expect(editor).toContain('aoAbrir={(r) => navigate(urlDoLegado(r.tag, r.relatorioId))}');
  });

  it('o fluxo normal de criação não usa `legado=1`', () => {
    const bloco = /aoEscolherEquipamento=\{[\s\S]*?\}\n/.exec(editor)![0];
    expect(bloco).toContain('urlDoEditor');
    expect(bloco).not.toContain('urlDoLegado');
  });
});

describe('nome do documento · etiqueta, nunca identidade', () => {
  it('o campo existe no modal de finalizar', () => {
    const mf = readFileSync('src/features/relatorios/ModalFinalizar.tsx', 'utf8');
    expect(mf).toContain('id="mf-nome-doc"');
    expect(mf).toContain('Nome do documento');
    // Sem `window.prompt` em lugar nenhum deste fluxo.
    expect(mf).not.toContain('window.prompt');
    expect(editor).not.toContain('window.prompt');
  });

  it('um lugar só decide o nome — lista, registro e arquivo não divergem', () => {
    expect(editor).toContain('nomeDoDocumento(nomeEscolhido, meta.tipoInspecao, tag)');
    expect(editor).toContain('nomeDoDocumento(nomeEscolhido, m.tipoInspecao, tag)');
    // O template escrito à mão não pode voltar.
    expect(editor).not.toContain("`Relatorio_${meta.tipoInspecao.replace(/ /g, '_')}_${tag}.pdf`");
  });

  it('o id do registro continua sendo o CÓDIGO, não o nome', () => {
    expect(editor).toContain('id: m.codigo,');
  });

  it('trocar o nome não inventa nome vazio', () => {
    expect(nomeDoDocumento('', 'Inspeção Periódica', 'V-1')).toBe(
      nomeSugerido('Inspeção Periódica', 'V-1'),
    );
  });
});

describe('18 e 19 · ícones e ações', () => {
  /** Os blocos de ação de cada linha (finalizado e rascunho). */
  const blocos = [...tela.matchAll(/className="rel-cel-acoes"([\s\S]*?)<\/span>/g)].map((m) => m[1]);

  it('todo ícone vem do sprite do sistema — nenhum SVG solto na lista', () => {
    expect(tela).not.toContain('<svg');
    expect(tela).toContain('import { Icone }');
  });

  it('os ícones de AÇÃO têm todos o mesmo tamanho', () => {
    // O `eye` saía com 15 e os vizinhos com 14 — 1px de diferença, que aparece
    // justamente porque os três ficam encostados um no outro.
    expect(blocos.length).toBeGreaterThan(0);
    for (const b of blocos) {
      const tam = [...b.matchAll(/tam=\{(\d+)\}/g)].map((m) => m[1]);
      expect(tam.length).toBeGreaterThan(0);
      expect(new Set(tam).size).toBe(1);
      expect(tam[0]).toBe('14');
    }
  });

  it('toda ação tem tooltip e rótulo para leitor de tela', () => {
    for (const b of blocos) {
      const botoes = (b.match(/<button/g) ?? []).length;
      expect((b.match(/title=/g) ?? []).length).toBe(botoes);
      expect((b.match(/aria-label=/g) ?? []).length).toBe(botoes);
    }
  });

  it('as ações ficam numa linha só, alinhadas à direita', () => {
    expect(css).toContain(
      '.rel-page .rel-cel-acoes { display: flex; justify-content: flex-end; gap: 2px; flex-wrap: nowrap; }',
    );
  });
});

describe('20 e 21 · densidade e celular', () => {
  it('a linha do desktop tem 6px de respiro — 38px com o conteúdo', () => {
    expect(css).toMatch(/\.rel-page \.rel-linha \{[\s\S]*?padding: 6px 10px 6px 9px;/);
    expect(css).toMatch(/\.rel-page \.rel-linha \{[\s\S]*?align-items: center;/);
  });

  it('no celular a linha vira cartão de três colunas, não dez', () => {
    const movel = css.slice(css.lastIndexOf('@media (max-width: 1023px)'));
    expect(movel).toContain('grid-template-columns: 26px repeat(3, minmax(0, 1fr));');
    // O rótulo dos botões só some em 640px: num tablet os três cabem com texto.
    const barraMovel = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    expect(barraMovel).toContain('.rel-page .rel-btn-rotulo { display: none; }');
  });

  it('o alvo de toque das ações continua acima de 32px no cartão', () => {
    const movel = css.slice(css.lastIndexOf('@media (max-width: 1023px)'));
    const acoes = /\.rel-page \.rel-cel-acoes \.btn-icone \{([\s\S]*?)\}/.exec(movel)![1];
    const alt = /height: (\d+)px/.exec(acoes)![1];
    expect(Number(alt)).toBeGreaterThanOrEqual(34);
  });
});
