import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 09/09/2026 · O MODAL "CONFIGURAR NOVO RELATÓRIO" e o vocabulário de cor da lista.
 *
 * Rodada de UX. O que ela NÃO pode ter mexido — e é isso que a maior parte
 * deste arquivo trava:
 *
 *  - a lista de documentos disponíveis (nenhum item some da escolha);
 *  - o que nasce marcado;
 *  - o que `gerar()` entrega a `onGerar`;
 *  - a semântica das ações da lista (arquivar continua arquivando).
 *
 * O bloco azul é uma VISTA sobre os dois estados que já existiam. Marcar um
 * ensaio ali é marcar exatamente a mesma caixa que estava na lista — e é por
 * isso que ele não pode ganhar estado próprio.
 */

const modal = readFileSync('src/features/relatorios/ModalNovaInspecao.tsx', 'utf8');
const css = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');
const lista = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
const cssLista = readFileSync('src/pages/relatorios.css', 'utf8');

describe('o modal segue a referência sem ganhar regra nova', () => {
  it('tem as quatro seções da referência, nesta ordem', () => {
    const ordem = [
      'Configurar Novo Relatório',
      'Tipo de Inspeção',
      'Injeção Automática de Dados (Containers)',
      'Documentos a agrupar',
      'Gerar Documento',
    ];
    let cursor = -1;
    for (const trecho of ordem) {
      const i = modal.indexOf(trecho, cursor + 1);
      expect(i, `"${trecho}" fora de ordem ou ausente`).toBeGreaterThan(cursor);
      cursor = i;
    }
  });

  it('a instrução verde continua ao lado de "Documentos a agrupar"', () => {
    expect(modal).toContain('texto-ajuda-modal-inline');
    expect(modal).toContain('↓ Selecione os documentos abaixo que irão compor o seu relatório');
  });

  it('o rodapé fica FORA do corpo rolável', () => {
    // Com a lista longa, um rodapé dentro do corpo empurrava "Gerar Documento"
    // para baixo da dobra do modal.
    const corpo = modal.indexOf('mni-body');
    const fimCorpo = modal.indexOf('</div>\n\n        {/* O rodapé saiu do corpo');
    const rodape = modal.indexOf('mni-rodape');
    expect(corpo).toBeGreaterThan(0);
    expect(rodape).toBeGreaterThan(fimCorpo);
  });
});

describe('o bloco azul NÃO inventa dado nem cria estado', () => {
  it('um ensaio só entra no bloco se existir container com o formulário PREENCHIDO', () => {
    // `dados[form] !== undefined` é o mesmo critério do resto do sistema para
    // "o técnico salvou este formulário". Container criado e nunca aberto não
    // pode prometer injeção.
    expect(modal).toContain('c.dados && c.dados[form] !== undefined');
    expect(modal).toContain('if (comDado.length === 0) continue;');
  });

  it('a origem exibida é o container REAL, e diz quando há mais de um', () => {
    expect(modal).toContain('`Container: ${recente.nome}');
    expect(modal).toContain('extras > 0 ? ` (+${extras})` : \'\'');
  });

  it('marcar no bloco azul mexe nos MESMOS estados de sempre', () => {
    // Nenhum `useState` novo: o item automático delega para `toggle` (documento)
    // ou `toggleCalib` (calibração), que são os de antes.
    expect(modal).toContain('alternar: () => toggle(doc)');
    expect(modal).toContain('alternar: () => toggleCalib(i.id)');
    const estados = modal.match(/useState</g) ?? [];
    expect(estados).toHaveLength(3); // tipo, marcados, calibSelecionados
  });

  it('o que sobe para o bloco SAI da lista — a mesma caixa não aparece duas vezes', () => {
    expect(modal).toContain('const naLista = DOCUMENTOS_DISPONIVEIS.filter((d) => !origens.has(d));');
  });

  it('sem nada encontrado, o bloco não é desenhado', () => {
    // Um painel dizendo "o sistema localizou formulários salvos" com nada
    // dentro afirmaria o contrário do que é verdade.
    expect(modal).toContain('{automaticos.length > 0 && (');
  });
});

describe('a rodada de UX não tocou na regra', () => {
  it('a lista de documentos disponíveis é a mesma, e inteira', () => {
    // `naLista` filtra apenas o que subiu para o bloco; a fonte continua sendo
    // o catálogo, e nada é excluído por outro critério.
    expect(modal).toContain("import { DOCUMENTOS_DISPONIVEIS, type TipoInspecao } from './tipos';");
    expect(modal).not.toMatch(/DOCUMENTOS_DISPONIVEIS\.slice|DOCUMENTOS_DISPONIVEIS\.filter\(\(d\) => d !==/);
  });

  it('o que nasce marcado não mudou: tudo menos os ensaios de campo', () => {
    expect(modal).toContain('DOCUMENTOS_DISPONIVEIS.filter((d) => !ENSAIOS.has(d)),');
  });

  it('`gerar()` entrega exatamente o que entregava', () => {
    expect(modal).toContain('const ordenados = DOCUMENTOS_DISPONIVEIS.filter((d) => marcados.includes(d));');
    expect(modal).toContain('onGerar(tipo, [...ordenados, ...calibDocs]);');
    expect(modal).toContain('vincularProximoRelatorio: true');
  });
});

describe('o CSS do modal não vaza para as outras telas', () => {
  // O bloco do modal termina onde começa o do assistente (09/09/2026), que tem
  // o seu próprio prefixo e o seu próprio teste logo abaixo.
  const inicioWizard = css.indexOf('O ASSISTENTE DE CRIAÇÃO');
  const bloco = css.slice(css.indexOf('MODAL "CONFIGURAR NOVO RELATÓRIO"'), inicioWizard);

  it('toda regra do modal é escopada em .mni-', () => {
    // `.modal-content`, `.btn-primario` e `.item-documento-check` são
    // compartilhados por dezenas de telas: uma regra solta aqui mudaria o
    // cadastro de equipamento junto.
    const seletores = [...bloco.matchAll(/^\.([a-z][\w-]*)/gm)].map((m) => m[1]);
    for (const s of seletores) {
      expect(s.startsWith('mni-'), `seletor global no bloco do modal: .${s}`).toBe(true);
    }
  });

  it('toda regra do assistente é escopada em .wz-', () => {
    // Mesma regra, mesmo motivo: o assistente reaproveita `.modal-content`,
    // `.item-documento-check` e `.btn-primario`, que são de todo mundo.
    const wizard = css.slice(inicioWizard);
    expect(wizard.length, 'o bloco do assistente sumiu do CSS').toBeGreaterThan(500);
    const seletores = [...wizard.matchAll(/^\.([a-z][\w-]*)/gm)].map((m) => m[1]);
    for (const s of seletores) {
      expect(s.startsWith('wz-'), `seletor global no bloco do assistente: .${s}`).toBe(true);
    }
  });

  it('a lista é compacta e a caixa rola', () => {
    expect(bloco).toContain('.mni-modal .lista-documentos-scroll');
    expect(bloco).toMatch(/\.mni-modal \.item-documento-check \{[^}]*padding: 8px 12px;/);
    expect(bloco).toMatch(/max-height: 264px;/);
  });

  it('o checkbox é azul nas duas listas', () => {
    expect(bloco).toMatch(/\.mni-modal \.item-documento-check input\[type='checkbox'\][^}]*accent-color: var\(--blue2/);
    expect(bloco).toMatch(/\.mni-auto-item input\[type='checkbox'\][^}]*accent-color: var\(--blue2/);
  });

  it('o celular ganha alvo de 44px e o rodapé continua visível', () => {
    const movel = bloco.slice(bloco.indexOf('@media (max-width: 640px)'));
    expect(movel).toContain('min-height: 44px;');
    expect(movel).toContain('.mni-modal { max-width: none; max-height: 92vh; }');
  });
});

describe('as ações da lista: cor nova, semântica velha', () => {
  it('o olho do documento usa o vermelho da marca do PDF', () => {
    expect(lista).toMatch(/className="btn-icone cor-doc"\s*\n\s*title="Visualizar"/);
    expect(cssLista).toContain('.rel-page .btn-icone.cor-doc { color: #b42318; }');
  });

  it('o lápis é neutro — ele renomeia rótulo, não toca no documento', () => {
    expect(lista).not.toMatch(/className="btn-icone cor-azul"\s*\n\s*title="Continuar editando"/);
    expect(cssLista).toContain('.rel-page .rel-cel-acoes .btn-icone:not(.cor-doc):not(.cor-doc-forte) { color: var(--text-muted); }');
  });

  it('vermelho forte só no gesto que RETIRA', () => {
    expect(lista).toContain("className={`btn-icone${arquivados.has(r.relatorioId) ? '' : ' cor-doc-forte'}`}");
    expect(lista).toMatch(/className="btn-icone cor-doc-forte"\s*\n\s*title="Excluir rascunho definitivamente"/);
  });

  it('a REGRA das ações não mudou: finalizado arquiva, rascunho exclui', () => {
    expect(lista).toContain('setArquivando(r)');
    expect(lista).toContain('void desarquivar(r.relatorioId)');
    expect(lista).toContain('setExcluindoRascunho(r)');
    // Relatório finalizado continua sem caminho de exclusão.
    expect(lista).not.toContain('setExcluindoRelatorio(');
  });

  it('a cor nova é escopada — Prontuários e Calibrações continuam com o azul', () => {
    for (const regra of cssLista.split('\n').filter((l) => l.includes('cor-doc'))) {
      if (regra.trim().startsWith('*') || regra.trim().startsWith('/*')) continue;
      if (!regra.trim().startsWith('.')) continue;
      expect(regra.startsWith('.rel-page'), `regra sem escopo: ${regra}`).toBe(true);
    }
  });
});
