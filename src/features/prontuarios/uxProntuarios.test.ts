/**
 * GATE da reforma de UX de `/prontuarios` (06/09/2026).
 *
 * A suíte roda em `environment: 'node'`, sem DOM: o que dá para travar aqui é a
 * ESTRUTURA e as funções puras. O que depende de render — se o modal abre, se o
 * croqui aparece — foi verificado no navegador e está em
 * `docs/medicoes/2026-09-06-ux-prontuarios.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FILTRO_PRONT_PADRAO,
  FILTRO_PRONT_VAZIO,
  temAlgumFiltroPront,
} from './ModalFiltrosProntuarios';
import { dataCurta, situacaoDoItem } from './CatalogoProntuariosV9';
import { dataDoc, rotuloRevisao } from './ListaProntuariosV9';
import {
  RECORTE_PADRAO,
  categoriasDoCatalogo,
  filtrarCatalogo,
  precisaVarrerTudo,
} from '../../services/recorteCatalogo';

const pagina = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
const catalogo = readFileSync('src/features/prontuarios/CatalogoProntuariosV9.tsx', 'utf8');
const css = readFileSync('src/pages/prontuarios.css', 'utf8');
const modalFiltro = readFileSync('src/features/prontuarios/ModalFiltrosProntuarios.tsx', 'utf8');
const modalExcluir = readFileSync('src/features/prontuarios/ModalExcluirProntuario.tsx', 'utf8');
const servico = readFileSync('src/features/prontuarios/prontuarioService.ts', 'utf8');
const lista = readFileSync('src/features/prontuarios/ListaProntuariosV9.tsx', 'utf8');
const maisAcoes = readFileSync('src/features/prontuarios/MaisAcoesProntuario.tsx', 'utf8');

describe('lista canônica única', () => {
  it('a tela de escolher equipamento deixou de ser uma TELA', () => {
    // Era `tela === 'selecao'`, com trilha e botão de voltar — a mesma
    // duplicidade corrigida em /relatorios, um tamanho menor.
    expect(pagina).toContain("type Tela = 'equipamentos' | 'formulario' | 'visualizador';");
    expect(pagina).not.toContain("setTela('selecao')");
    expect(pagina).not.toContain('Para qual equipamento?');
  });

  it('o catálogo em modo seleção só existe dentro do modal', () => {
    expect((pagina.match(/modo="selecao"/g) ?? []).length).toBe(1);
    const abre = pagina.indexOf('<ModalSelecionarEquipamento');
    const cat = pagina.indexOf('modo="selecao"');
    const fecha = pagina.indexOf('</ModalSelecionarEquipamento>');
    expect(abre).toBeGreaterThan(-1);
    expect(cat).toBeGreaterThan(abre);
    expect(cat).toBeLessThan(fecha);
  });

  it('criar abre diálogo, sem trocar de tela', () => {
    expect(pagina).toContain('aria-haspopup="dialog"');
    expect(pagina).toContain('onClick={() => setCriando(true)}');
  });

  it('a moldura do modal é a MESMA de /relatorios', () => {
    // Uma moldura, dois catálogos. Duas moldura quase iguais seria a próxima
    // correção feita em um lugar e esquecida no outro.
    expect(pagina).toContain(
      "import ModalSelecionarEquipamento from '../features/relatorios/ModalSelecionarEquipamento';",
    );
  });
});

describe('toolbar em linha única', () => {
  it('filtro à esquerda, busca no meio, criar à direita', () => {
    const barra = /<BuscaLista[\s\S]*?<\/BuscaLista>/.exec(catalogo)![0];
    expect(barra).toContain('antes={');
    expect(barra.indexOf('pront-btn-filtro')).toBeGreaterThan(barra.indexOf('antes={'));
    // O `acoes` do pai (o botão de criar) entra como children, depois do campo.
    expect(barra.indexOf('{modo === \'lista\' ? acoes : null}')).toBeGreaterThan(
      barra.indexOf('pront-btn-filtro'),
    );
    expect(pagina).toContain('pront-btn-criar');
  });

  it('não sobrou painel de filtros exposto', () => {
    expect(catalogo).not.toContain('rel-filtros-painel');
    expect(catalogo).toContain('<ModalFiltrosProntuarios');
  });

  it('o campo é branco, com foco e caret âmbar', () => {
    // Há mais de uma regra para o campo (largura, depois cor). A que pinta é a
    // que declara `background`.
    const regras = [...css.matchAll(/\.prontuarios-page \.busca-lista-campo \{([\s\S]*?)\}/g)].map(
      (m) => m[1],
    );
    const pintura = regras.find((r) => r.includes('background:'));
    expect(pintura).toBeDefined();
    expect(pintura!).toContain('background: var(--panel');
    expect(pintura!).toContain('caret-color: var(--amber-deep');
    expect(css).toContain('.prontuarios-page .busca-lista-campo:focus-within {');
  });
});

describe('filtro em modal', () => {
  it('é diálogo, com ESC e armadilha de foco', () => {
    expect(modalFiltro).toContain('role="dialog"');
    expect(modalFiltro).toContain('aria-modal="true"');
    expect(modalFiltro).toContain("e.key === 'Escape'");
    expect(modalFiltro).toContain("e.key !== 'Tab'");
  });

  it('tem Limpar, Cancelar e Aplicar — e só aplica no Aplicar', () => {
    expect(modalFiltro).toContain('Limpar filtros');
    expect(modalFiltro).toContain('Cancelar');
    expect(modalFiltro).toContain('onClick={() => aoAplicar(v)}');
  });

  it('o padrão da tela é "com prontuário", e limpar volta a ele', () => {
    // Limpar não pode transformar a lista de prontuários na lista de
    // equipamentos: `/prontuarios` abre mostrando quem TEM prontuário.
    expect(FILTRO_PRONT_PADRAO.situacao).toBe('com');
    expect(temAlgumFiltroPront(FILTRO_PRONT_PADRAO)).toBe(false);
    expect(temAlgumFiltroPront({ ...FILTRO_PRONT_PADRAO, empresa: 'X' })).toBe(true);
    expect(temAlgumFiltroPront({ ...FILTRO_PRONT_PADRAO, categoria: 'III' })).toBe(true);
    expect(temAlgumFiltroPront(FILTRO_PRONT_VAZIO)).toBe(true); // "todos" É um recorte
  });
});

describe('o recorte do catálogo', () => {
  const item = (tag: string, temProntuario: boolean | null, extra = {}) => ({
    tag,
    temProntuario,
    clienteNome: 'ACME',
    categoria: 'III',
    ...extra,
  });

  it('"só com" mantém o não-medido; "só sem" o descarta', () => {
    const itens = [item('A', true), item('B', false), item('C', null)];
    const com = filtrarCatalogo(itens, { ...RECORTE_PADRAO }, (i) => i.temProntuario);
    expect(com.map((i) => i.tag)).toEqual(['A', 'C']);

    // O lado seguro é OPOSTO: dizer que falta prontuário num equipamento que
    // ninguém verificou mandaria refazer um documento que talvez exista.
    const sem = filtrarCatalogo(
      itens,
      { soComDocumento: false, soSemDocumento: true, empresa: '' },
      (i) => i.temProntuario,
    );
    expect(sem.map((i) => i.tag)).toEqual(['B']);
  });

  it('filtra por categoria', () => {
    const itens = [item('A', true), item('B', true, { categoria: 'V' })];
    const r = filtrarCatalogo(
      itens,
      { soComDocumento: false, empresa: '', categoria: 'V' },
      (i) => i.temProntuario,
    );
    expect(r.map((i) => i.tag)).toEqual(['B']);
  });

  it('categoria e "só sem" também obrigam a varrer a lista inteira', () => {
    expect(precisaVarrerTudo({ soComDocumento: false, empresa: '', categoria: 'III' })).toBe(true);
    expect(precisaVarrerTudo({ soComDocumento: false, soSemDocumento: true, empresa: '' })).toBe(true);
    expect(precisaVarrerTudo({ soComDocumento: false, empresa: '' })).toBe(false);
  });

  it('as categorias do seletor saem do próprio catálogo, ordenadas', () => {
    expect(
      categoriasDoCatalogo([
        { categoria: 'V' },
        { categoria: 'I' },
        { categoria: null },
        { categoria: 'V' },
      ]),
    ).toEqual(['I', 'V']);
  });
});

describe('situação da linha', () => {
  it('emitido vence salvo; null continua null', () => {
    expect(situacaoDoItem(true, true)).toBe('emitido');
    expect(situacaoDoItem(false, true)).toBe('emitido'); // há PDF: houve prontuário
    expect(situacaoDoItem(true, false)).toBe('salvo');
    expect(situacaoDoItem(false, false)).toBe('sem');
    // `null` não é `false`: sem selo, porque ninguém verificou.
    expect(situacaoDoItem(null, false)).toBeNull();
    expect(situacaoDoItem(undefined, false)).toBeNull();
  });

  it('a data da emissão é a do documento, e vazio vira travessão', () => {
    expect(dataCurta('2026-09-06T12:00:00.000Z')).toBe('06/09/2026');
    expect(dataCurta(null)).toBe('—');
    expect(dataCurta('')).toBe('—');
    expect(dataCurta('qualquer coisa')).toBe('—');
  });

  it('só o EMITIDO tem fundo — os outros são texto', () => {
    expect(/\.pront-selo-emitido \{[^}]*background:/.test(css)).toBe(true);
    expect(/\.pront-selo-salvo \{[^}]*background:/.test(css)).toBe(false);
    expect(/\.pront-selo-sem \{[^}]*background:/.test(css)).toBe(false);
  });
});

describe('a lista canônica: uma linha por DOCUMENTO', () => {
  /*
   * A rodada anterior fez a lista mostrar um EQUIPAMENTO por linha, com selo
   * "Prontuário OK". Um equipamento com três revisões emitidas era uma linha
   * só, e as duas anteriores — documentos assinados, com pdfRef e SHA próprios
   * — não tinham onde ser vistas. O cabeçalho e a linha migraram para
   * `ListaProntuariosV9`; o catálogo continua sendo o SELETOR de equipamento,
   * dentro do modal de criar.
   */
  it('a página monta a lista de documentos, não o catálogo de equipamentos', () => {
    expect(pagina).toContain('<ListaProntuariosV9');
    // O catálogo só aparece dentro do modal de criar.
    const abre = pagina.indexOf('<ModalSelecionarEquipamento');
    const cat = pagina.indexOf('<CatalogoProntuariosV9');
    const fecha = pagina.indexOf('</ModalSelecionarEquipamento>');
    expect(cat).toBeGreaterThan(abre);
    expect(cat).toBeLessThan(fecha);
  });

  it('tem cabeçalho de colunas, e ele não aparece no cartão do celular', () => {
    expect(lista).toContain('pront-linha pront-linha-cabecalho');
    const movel = css.slice(css.lastIndexOf('@media (max-width: 1023px)'));
    expect(css).toContain('.pront-linha-cabecalho { display: none; }');
    expect(movel).toContain('grid-template-columns: 24px minmax(0, 1fr) auto;');
  });

  it('a coluna de REVISÃO existe e o rascunho não inventa número', () => {
    expect(lista).toContain('<span>Revisão</span>');
    expect(rotuloRevisao({ situacao: 'emitido', revisao: 2 })).toBe('Rev. 02');
    expect(rotuloRevisao({ situacao: 'emitido', revisao: null })).toBe('—');
    // Rascunho ainda não é revisão.
    expect(rotuloRevisao({ situacao: 'rascunho', revisao: null })).toBe('—');
  });

  it('a data vem do documento, e vazio vira travessão', () => {
    expect(dataDoc('2026-09-06T10:00:00.000Z')).toBe('06/09/2026');
    expect(dataDoc(null)).toBe('—');
    expect(dataDoc('')).toBe('—');
  });

  it('a lista não toca PDF para listar', () => {
    // A mesma regra bloqueante de /relatorios: `temArquivo` é booleano, e o
    // arquivo só é resolvido no clique.
    expect(lista).not.toContain('baixarArtefato');
    expect(lista).not.toContain('bytesDaEmissao');
  });

  it('a linha não é um <button> — ela tem botão dentro', () => {
    expect(lista).not.toContain('<button type="button" className="pront-linha"');
    expect(lista).toContain('className={`pront-linha pront-linha-${doc.situacao}`}');
  });
});

describe('rascunho e emitido, na tela', () => {
  it('salvar grava a linha de rascunho no índice', () => {
    expect(pagina).toContain('await registrarDocumento(docDeRascunho(tag, dados, meta.numero ?? null));');
  });

  it('emitir grava a revisão e encerra o rascunho', () => {
    expect(pagina).toContain('docDeEmissao(emitida, revisao, ');
    expect(pagina).toContain('await encerrarRascunho(tag);');
    // A posição na lista É a revisão — `registrarEmissao` nunca sobrescreve.
    expect(pagina).toContain('listarEmissoes(tag).findIndex((x) => x.id === emitida.id) + 1');
  });

  it('abrir da lista respeita o estado: rascunho edita, emitido serve o arquivo', () => {
    expect(pagina).toContain("await abrirPorTag(doc.tag, { editar: doc.situacao === 'rascunho' });");
  });
});

describe('a exclusão saiu da barra', () => {
  it('não há mais botão de excluir em destaque no visualizador', () => {
    // Era um botão vermelho na linha principal, do mesmo tamanho dos outros,
    // que virava "Confirmar Exclusão" no primeiro clique.
    // Fora de comentário: o que conta é o texto RENDERIZADO. O comentário que
    // explica a remoção cita os rótulos antigos, e deve poder citá-los.
    const semComentarios = pagina
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(semComentarios).not.toContain('Excluir Prontuário');
    expect(semComentarios).not.toContain('Confirmar Exclusão');
    expect(pagina).not.toContain('function handleExcluir');
  });

  it('ela vive no menu "Mais ações", separada e por último', () => {
    expect(maisAcoes).toContain('Excluir prontuário…');
    expect(maisAcoes).toContain('mais-acoes-sep');
    const sep = maisAcoes.indexOf('mais-acoes-sep');
    const excluir = maisAcoes.indexOf('Excluir prontuário…');
    expect(excluir).toBeGreaterThan(sep);
  });

  it('e continua abrindo o modal que diz o que NÃO é apagado', () => {
    expect(pagina).toContain('<ModalExcluirProntuario');
    expect(modalExcluir).toContain('O que continua salvo');
  });
});

describe('a barra do visualizador é uma linha', () => {
  it('as ações principais são duas; o resto está no menu', () => {
    const barra = /<div className="pront-barra">[\s\S]*?<\/div>\n          <\/div>/.exec(pagina)![0];
    expect(barra).toContain('Editar');
    expect(barra).toContain('<MaisAcoesProntuario');
    // Imprimir e abrir o emitido saíram da linha principal.
    expect(barra).not.toContain('Abrir documento emitido');
  });

  it('os assinantes ficam recolhidos', () => {
    expect(pagina).toContain('<details className="pront-assinantes-caixa">');
    expect(pagina).toContain('pront-assinantes-resumo');
  });

  it('no celular a barra quebra em duas linhas organizadas', () => {
    const movel = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('.pront-barra-id { flex: 1 1 100%; order: 2; }');
  });
});

describe('integridade: o que a exclusão NÃO apaga', () => {
  it('emissões arquivadas e croqui ficam fora de `excluirProntuario`', () => {
    const corpo = /export async function excluirProntuario[\s\S]*?\n\}/.exec(servico)![0];
    // O PDF emitido é arquivo imutável (Fase 12) e o croqui 2D é do
    // equipamento, não do documento. Nenhum dos dois some ao excluir o
    // cadastro — e o modal diz isso para quem clica.
    expect(corpo).not.toContain('nr13_pront_emitido');
    expect(corpo).not.toContain('chaveEmissao');
    expect(corpo).not.toContain('croqui2d');
    expect(corpo).not.toContain('modelo3d');
    expect(modalExcluir).toContain('O que continua salvo');
    expect(modalExcluir).toContain('croqui 2D');
  });

  it('a exclusão pela lista usa a MESMA função de sempre', () => {
    expect(pagina).toContain('await excluirProntuario(excluindoTag)');
  });
});
