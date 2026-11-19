/**
 * GATE da rodada de UX de /equipamentos e /calibracoes (07/09/2026).
 *
 * Estrutura, não render: roda sem DOM. O que depende de pixel está medido em
 * `docs/medicoes/2026-09-07-ux-equipamentos-calibracoes.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const equip = readFileSync('src/features/equipamento/EquipamentosV9.tsx', 'utf8');
const cssEquip = readFileSync('src/features/equipamento/equipamento.css', 'utf8');
const modalEquip = readFileSync('src/features/equipamento/ModalFiltrosEquipamentos.tsx', 'utf8');
const cal = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
const cssCal = readFileSync('src/features/calibracoes/ilustracoes.css', 'utf8');
const recorte = readFileSync('src/services/recorteCatalogo.ts', 'utf8');

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('/equipamentos: uma barra só', () => {
  it('o cabeçalho separado saiu', () => {
    // Eram duas faixas: título + visualização + dois botões, e abaixo a busca
    // com dois selects abertos.
    const limpo = semComentarios(equip);
    expect(limpo).not.toContain('fj-page-head equip-head');
    expect(limpo).not.toContain('equip-head-acoes');
  });

  it('contexto e visualização entram pelo `antes` da busca', () => {
    expect(equip).toContain('className="equip-barra-esq"');
    expect(equip).toContain('className="equip-barra-titulo"');
    expect(equip).toContain('className="equip-visao"');
    // A alternância grade/lista continua funcionando como antes.
    expect(equip).toContain("setVisao('grade')");
    expect(equip).toContain("setVisao('lista')");
  });

  it('filtro e criar ficam à direita, na mesma linha', () => {
    expect(equip).toContain('equip-btn-filtro');
    expect(equip).toContain('equip-btn-criar');
    expect(equip).toContain('aria-haspopup="dialog"');
  });

  it('"Importar planilha" saiu da barra', () => {
    const limpo = semComentarios(equip);
    expect(limpo).not.toContain('Importar planilha');
    expect(limpo).not.toContain('function abrirImportacao');
    // O texto do estado vazio também parou de oferecer a planilha.
    expect(limpo).not.toContain('arraste uma planilha aqui');
  });

  it('os selects de tipo e categoria saíram da barra', () => {
    const limpo = semComentarios(equip);
    expect(limpo).not.toContain('Tipo · Todos');
    expect(limpo).not.toContain('Categoria · Todas');
    expect(limpo).not.toContain('fj-fselect');
  });
});

describe('/equipamentos: o modal de filtro', () => {
  it('é diálogo central, com ESC e armadilha de foco', () => {
    expect(modalEquip).toContain('role="dialog"');
    expect(modalEquip).toContain('aria-modal="true"');
    expect(modalEquip).toContain("e.key === 'Escape'");
    expect(modalEquip).toContain("e.key !== 'Tab'");
  });

  it('tem aplicar, limpar e cancelar — e é rascunho até o aplicar', () => {
    expect(modalEquip).toContain('Aplicar');
    expect(modalEquip).toContain('Limpar filtros');
    expect(modalEquip).toContain('Cancelar');
    expect(modalEquip).toContain('const [v, setV] = useState<ValoresFiltroEquip>(valores);');
  });

  it('filtra por tipo, categoria, cliente e fabricante', () => {
    for (const t of ['Tipo do equipamento', 'Categoria de risco', 'Cliente', 'Fabricante']) {
      expect(modalEquip).toContain(t);
    }
  });

  it('diz quais filtros são da consulta e quais são recorte do cliente', () => {
    // Filtro que esconde linha calado é relato de dado sumido com outro nome.
    expect(modalEquip).toContain('Cliente e fabricante são recortados sobre os equipamentos já carregados');
    expect(modalEquip).toContain('varreduraIncompleta');
    expect(equip).toContain('const varreduraIncompleta =');
  });

  it('tipo e categoria continuam na URL; empresa e fabricante, no estado', () => {
    // A URL não pode guardar um filtro que a consulta não sabe aplicar.
    expect(equip).toContain("novos.set('tipo', v.tipo)");
    expect(equip).toContain("novos.set('categoria', v.categoria)");
    expect(equip).toContain('setRecorte({ empresa: v.empresa, fabricante: v.fabricante })');
  });

  it('o funil acende em roxo, e o pulso é curto', () => {
    expect(cssEquip).toContain('.equip-btn-filtro.filtro-ativo {');
    expect(cssEquip).toContain('var(--purple, #7c5cfc)');
    expect(cssEquip).toContain('@keyframes equip-filtro-pulso');
    // Quem pediu menos movimento não recebe o pulso.
    expect(cssEquip).toContain('.equip-btn-filtro:active { animation: none; }');
  });

  it('no celular sobram os ícones, com 44px de alvo', () => {
    const movel = cssEquip.slice(cssEquip.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('.equip-btn-rotulo { display: none; }');
    expect(movel).toContain('width: 44px;');
  });
});

describe('recorte por fabricante', () => {
  it('entra na mesma família de empresa e categoria', () => {
    expect(recorte).toContain('fabricante?: string;');
    expect(recorte).toContain("if (recorte.fabricante && (i.fabricante ?? '').trim() !== recorte.fabricante) return false;");
    expect(recorte).toContain('!!recorte.fabricante');
    expect(recorte).toContain('export function fabricantesDoCatalogo');
  });
});

describe('/calibracoes: lista do protótipo (Cobalto)', () => {
  it('colunas do protótipo: TAG, equipamento, cliente, acessórios, próximo vencimento e prazo', () => {
    for (const col of ['<span>TAG</span>', '<span>Equipamento</span>', '>Cliente</span>', '<span>Acessórios</span>', '<span>Próximo vencimento</span>', '<span>Prazo</span>']) {
      expect(cal).toContain(col);
    }
    expect(cal).toContain('aria-label="Situação das calibrações"');
  });

  it('prazo e acessórios vêm do AGREGADO do servidor, não do cache por TAG', () => {
    expect(cal).toContain('usePainelVencimentos()');
    expect(cal).toContain("it.origem !== 'calibracao'");
    expect(cal).toContain('rotuloCalibracoes(item.calibracoes)');
  });

  it('nenhum campo é inventado: o que falta vira travessão', () => {
    expect(cal).toContain("<b className=\"vazio\">—</b>");
    expect(cal).toContain("rotuloCalibracoes(item.calibracoes) || '—'");
  });
});

describe('/calibracoes: colunas', () => {
  it('as colunas somem por largura, na ordem certa', () => {
    // Fabricante sai primeiro: é o campo mais longo e o menos usado para
    // ESCOLHER o equipamento que vai calibrar.
    expect(cssCal).toContain('@media (max-width: 1180px)');
    expect(cssCal).toContain('.cal-card-info .eq-col:nth-child(3) { display: none; }');
    expect(cssCal).toContain('@media (max-width: 860px)');
  });
});

describe('o recorte precisa chegar à LISTA, não só ao contador', () => {
  it('a lista desenha `visiveis`', () => {
    // Visto em produção em 07/09/2026: com `itens`, o contador dizia "1
    // resultado" e a grade continuava mostrando os cinco equipamentos.
    expect(equip).toContain('itens={visiveis}');
    expect(equip).not.toContain('itens={itens}');
  });

  it('filtro novo devolve a rolagem ao topo', () => {
    expect(equip).toContain('chaveDoConjunto={`${termo}|${fTipo}|${fCategoria}|${recorte.empresa}|${recorte.fabricante}`}');
  });
});
