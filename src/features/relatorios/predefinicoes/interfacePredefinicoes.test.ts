import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS = readFileSync('src/pages/relatorios.css', 'utf8');
const MODAL = readFileSync('src/features/relatorios/predefinicoes/ModalPredefinicoes.tsx', 'utf8');
const EDITOR = readFileSync('src/features/relatorios/predefinicoes/EditorPredefinicao.tsx', 'utf8');
const AJUDA = readFileSync('src/features/relatorios/predefinicoes/ComoFunciona.tsx', 'utf8');
const REVISAO = readFileSync('src/features/relatorios/predefinicoes/RevisaoAplicacao.tsx', 'utf8');

/** O bloco de CSS do gerenciador, isolado do resto da folha. */
const BLOCO = CSS.slice(CSS.indexOf('/* ── GERENCIADOR DE PREDEFINIÇÕES'));

/** As regras de dentro de `@media (max-width: 640px)` no bloco do gerenciador. */
const MOBILE = BLOCO.slice(BLOCO.indexOf('@media (max-width: 640px)'));

/**
 * O CÓDIGO do modal, sem o comentário de cabeçalho.
 *
 * O cabeçalho cita o nome antigo de propósito — é o registro do que mudou. O
 * que não pode é o nome antigo continuar aparecendo na TELA.
 */
const MODAL_CODIGO = MODAL.slice(MODAL.indexOf('*/') + 2);

describe('o conceito mudou, e a tela diz isso', () => {
  it('o título não é mais "Recomendações predefinidas"', () => {
    expect(MODAL_CODIGO).not.toContain('Recomendações predefinidas');
    expect(MODAL).toContain('Predefinições do relatório');
    expect(MODAL).toContain('Conjuntos reutilizáveis desta organização');
  });

  it('o subtítulo explicativo é curto e não é um parágrafo fixo no corpo', () => {
    expect(MODAL).toContain(
      'Crie conjuntos reutilizáveis para preencher automaticamente campos recorrentes deste relatório.',
    );
    // O texto longo mudou de lugar: foi para o modal de ajuda.
    expect(AJUDA).toContain('Como funcionam as predefinições');
  });

  it('não existe mais o "Guardar as recomendações deste relatório" no rodapé', () => {
    expect(MODAL).not.toContain('Guardar as recomendações');
    // A capacidade não sumiu: virou um caminho de CRIAÇÃO, na barra da lista.
    expect(MODAL).toContain('A partir deste relatório');
    expect(MODAL).toContain('camposDoDocumento(editaveis, idPermitido)');
  });
});

describe('"Como funciona" é um botão, e abre uma segunda camada', () => {
  it('tem aparência clicável — borda, fundo e ícone, não texto solto', () => {
    expect(MODAL).toContain('className="predef-como"');
    expect(BLOCO).toMatch(/\.predef-como\s*\{[^}]*border:/);
    expect(BLOCO).toMatch(/\.predef-como\s*\{[^}]*cursor: pointer/);
  });

  it('o overlay de cima tem z-index maior que o de baixo', () => {
    const base = Number(/\.predef-overlay\s*\{[^}]*z-index:\s*(\d+)/.exec(BLOCO)?.[1]);
    const topo = Number(/\.predef-overlay-topo\s*\{[^}]*z-index:\s*(\d+)/.exec(BLOCO)?.[1]);
    expect(topo).toBeGreaterThan(base);
  });

  it('o foco fica preso no diálogo de cima, e o Esc fecha só ele', () => {
    expect(AJUDA).toContain('useFocoPreso(caixa, onFechar)');
    expect(AJUDA).toContain('aria-modal="true"');
    const hook = readFileSync('src/components/useFocoPreso.ts', 'utf8');
    expect(hook).toContain("e.key === 'Escape'");
    expect(hook).toContain('e.stopPropagation()');
  });

  it('explica os quatro passos', () => {
    for (const passo of ['Crie um conjunto', 'Escolha os campos', 'Defina os valores', 'Revise e aplique']) {
      expect(AJUDA).toContain(passo);
    }
  });
});

describe('a lista continua uma lista', () => {
  it('a linha mostra nome, contagem e data — nunca os valores', () => {
    expect(MODAL).toContain('predef-linha-nome');
    expect(MODAL).toContain('resumoPredefinicao(p)');
    expect(MODAL).toContain('dataBr(p.atualizadoEm)');
    // O detalhe de cada conjunto é outra VISTA, não um acordeão dentro da linha.
    expect(MODAL).toContain("setVista('detalhe')");
  });

  it('cabeçalho e rodapé são fixos e o corpo rola', () => {
    expect(BLOCO).toMatch(/\.predef-cab\s*\{[^}]*flex: 0 0 auto/);
    expect(BLOCO).toMatch(/\.predef-rodape\s*\{[^}]*flex: 0 0 auto/);
    expect(BLOCO).toMatch(/\.predef-corpo\s*\{[^}]*overflow-y: auto/);
    // `min-height: 0` é o que permite o item flex encolher e o corpo rolar
    // por dentro em vez de a janela inteira crescer.
    expect(BLOCO).toMatch(/\.predef-corpo\s*\{[^}]*min-height: 0/);
  });

  it('a busca aparece quando há conjuntos o bastante para justificá-la', () => {
    expect(MODAL).toContain('completa.length > 4');
    expect(MODAL).toContain('filtrarPorTexto');
  });

  it('criar não usa window.prompt', () => {
    for (const fonte of [MODAL, EDITOR]) {
      expect(fonte).not.toMatch(/window\.prompt|\bprompt\(/);
      expect(fonte).not.toMatch(/window\.confirm|\bconfirm\(/);
      expect(fonte).not.toMatch(/window\.alert|\balert\(/);
    }
  });

  it('excluir confirma, e a confirmação diz o que NÃO acontece', () => {
    expect(MODAL).toContain('Excluir esta predefinição?');
    expect(MODAL).toContain(
      'Esta ação remove apenas o conjunto salvo. Relatórios em que ela já foi utilizada não',
    );
  });
});

describe('o formulário usa o tipo certo de cada campo', () => {
  it('há textarea, input e select — não tudo em textarea', () => {
    expect(EDITOR).toContain('<textarea');
    expect(EDITOR).toContain('<select');
    expect(EDITOR).toMatch(/campo\.tipo === 'opcao'/);
    expect(EDITOR).toMatch(/campo\.tipo === 'textoLongo'/);
  });

  it('mostra o resumo do conjunto antes de salvar', () => {
    expect(EDITOR).toContain('Resumo da predefinição');
    expect(EDITOR).toContain('campo{ids.length === 1');
  });

  it('o sucesso só é anunciado DEPOIS do await da persistência', () => {
    const fn = MODAL.slice(MODAL.indexOf('async function persistir('));
    const corpo = fn.slice(0, fn.indexOf('function abrirNova'));
    expect(corpo.indexOf('await gravarPredefinicoes(nova)')).toBeLessThan(
      corpo.indexOf('setSucesso(mensagem)'),
    );
  });
});

describe('a revisão mostra o que muda antes de confirmar', () => {
  it('o conflito sai como valor atual → valor da predefinição', () => {
    expect(REVISAO).toContain('valor atual');
    expect(REVISAO).toContain('valor da predefinição');
    expect(REVISAO).toContain("nome=\"arrowright\"");
  });

  it('o modo padrão é preencher só os vazios', () => {
    expect(REVISAO).toContain("useState<ModoAplicacao>('vazios')");
    expect(REVISAO).toContain('Preencher apenas os campos vazios');
  });

  it('a escolha de substituir diz quantos campos serão sobrescritos', () => {
    expect(REVISAO).toContain('Substituir também');
    expect(REVISAO).toContain('plano.totalConflitos');
  });
});

/**
 * MOBILE (validado em 386px de largura).
 *
 * Estes testes não substituem a medição no navegador — eles travam as regras
 * que, quando somem numa refatoração, devolvem a rolagem horizontal.
 */
describe('gate · 386px sem rolagem horizontal', () => {
  it('nada no bloco usa largura fixa maior que a tela', () => {
    const larguras = [...BLOCO.matchAll(/(?:^|[^-])(?:min-)?width:\s*(\d+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(larguras.every((n) => n <= 386)).toBe(true);
  });

  it('todo contêiner que pode espremer texto declara min-width: 0', () => {
    // Um item de flex/grid tem largura mínima automática igual ao conteúdo: sem
    // `min-width: 0` o nome longo empurra a linha e a tela rola de lado.
    for (const seletor of [
      '.predef-cab-txt',
      '.predef-linha-alvo',
      '.predef-linha-txt',
      '.predef-busca',
      '.predef-check-txt',
    ]) {
      const regra = new RegExp(`\\${seletor}\\s*\\{[^}]*min-width: 0`);
      expect(BLOCO).toMatch(regra);
    }
  });

  it('o fieldset do formulário zera a largura mínima intrínseca', () => {
    // Um `<fieldset>` ignora o contêiner por padrão — é a causa clássica de
    // rolagem horizontal em formulário dentro de modal estreito.
    expect(BLOCO).toMatch(/\.predef-bloco\s*\{[^}]*min-width: 0/);
    expect(BLOCO).toMatch(/\.predef-modos\s*\{[^}]*min-width: 0/);
  });

  it('a grade antes → depois usa minmax(0, 1fr), e não 1fr puro', () => {
    // `1fr` não encolhe abaixo do conteúdo; o texto longo estoura a coluna.
    expect(BLOCO).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)');
    expect(MOBILE).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('texto longo quebra em vez de empurrar', () => {
    for (const seletor of ['.predef-linha-nome', '.predef-resumo-lista dd', '.predef-rev-valor']) {
      const regra = new RegExp(`\\${seletor}\\s*\\{[^}]*overflow-wrap: anywhere`);
      expect(BLOCO).toMatch(regra);
    }
  });

  it('o corpo do modal não rola na horizontal', () => {
    expect(BLOCO).toMatch(/\.predef-corpo\s*\{[^}]*overflow-x: hidden/);
  });

  it('os alvos de toque chegam a 44px no celular', () => {
    expect(MOBILE).toMatch(/\.predef-rodape \.fj-btn\s*\{[^}]*min-height: 44px/);
    expect(MOBILE).toMatch(/\.predef-barra \.fj-btn\s*\{[^}]*min-height: 44px/);
    expect(MOBILE).toMatch(/\.predef-menu-btn\s*\{[^}]*width: 40px/);
  });

  it('a linha da lista empilha em vez de espremer nome, Usar e o menu', () => {
    expect(MOBILE).toMatch(/\.predef-linha\s*\{[^}]*flex-wrap: wrap/);
    expect(MOBILE).toMatch(/\.predef-linha-alvo\s*\{[^}]*flex: 1 1 100%/);
  });
});
