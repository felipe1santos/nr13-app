/**
 * GATE da rodada de onboarding + feedback de salvamento (07/09/2026).
 *
 * Duas telas: o memorial de cálculo (estado antes do cálculo e o retorno do
 * "Salvar") e o modal de criação de prontuário.
 *
 * Estrutura, não render: roda sem DOM. O que depende de pixel está medido em
 * `docs/medicoes/2026-09-07-onboarding-memorial-prontuario.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const log = readFileSync('src/features/memorial/MemorialLog.tsx', 'utf8');
const cssMemorial = readFileSync('src/features/memorial/memorial.css', 'utf8');
const vaso = readFileSync('src/features/memorial/MemorialVaso.tsx', 'utf8');
const caldeira = readFileSync('src/features/memorial/MemorialCaldeira.tsx', 'utf8');
const autoclave = readFileSync('src/features/memorial/MemorialAutoclave.tsx', 'utf8');
const loading = readFileSync('src/app/loadingGlobal.ts', 'utf8');
const overlay = readFileSync('src/app/LoadingGlobalOverlay.tsx', 'utf8');
const modalSel = readFileSync('src/features/relatorios/ModalSelecionarEquipamento.tsx', 'utf8');
const prontuarios = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
const cssModal = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('memorial: o estado ANTES do cálculo', () => {
  it('a linha de prompt virou estado ilustrado', () => {
    // Era `<span className="calc-terminal-prompt">>> Insira os dados…</span>`
    // num painel de meia tela, quase todo vazio.
    expect(log).toContain('memorial-log-vazio');
    expect(log).toContain('/ilustracoes/memorial-calculo.webp');
    expect(log).toContain('<strong>Memorial ainda não gerado</strong>');
    expect(semComentarios(log)).not.toContain('calc-terminal-prompt');
  });

  it('só aparece enquanto NÃO há cálculo', () => {
    // A condição não mudou: `showPlaceholder && log.length === 0`, e as telas
    // passam `calcCount === 0`. Gerado o cálculo, o memorial ocupa a área.
    expect(log).toContain('if (showPlaceholder && log.length === 0) {');
    for (const tela of [vaso, caldeira, autoclave]) {
      expect(tela).toContain('showPlaceholder={calcCount === 0}');
    }
  });

  it('o texto é o de cada equipamento, sem o ">>" do terminal', () => {
    expect(vaso).toContain('Preencha os dados estruturais do equipamento e clique em Gerar Cálculo');
    expect(caldeira).toContain('Preencha os dados da caldeira e clique em Gerar Cálculo');
    for (const tela of [vaso, caldeira, autoclave]) {
      expect(semComentarios(tela)).not.toContain('>> Insira os dados');
    }
  });

  it('a ilustração é leve e não estica', () => {
    const b = readFileSync('public/ilustracoes/memorial-calculo.webp');
    expect(b.slice(8, 12).toString()).toBe('WEBP');
    expect(b.length).toBeLessThan(150_000);
    expect(cssMemorial).toContain('.memorial-vazio-fig img {');
    expect(cssMemorial).toContain('object-fit: contain;');
    expect(log).toContain('loading="lazy"');
  });

  it('tem alt descritivo — não o nome do arquivo', () => {
    const alt = /alt="([^"]+)"/.exec(log)![1];
    expect(alt.length).toBeGreaterThan(40);
    expect(alt).not.toContain('.webp');
  });
});

describe('memorial: o feedback do "Salvar"', () => {
  it('o overlay tem um tempo mínimo na tela', () => {
    // Salvar grava em cache local e volta em poucos milissegundos: o overlay
    // piscava e o usuário ficava sem saber se o clique valeu.
    expect(loading).toContain('minimoMs?: number');
    for (const tela of [vaso, caldeira, autoclave]) {
      expect(tela).toContain('{ minimoMs: 1500 }');
    }
  });

  it('o piso atrasa só o SUCESSO', () => {
    // Em caso de erro o `finally` esconde o overlay na hora: segurar a tela
    // dizendo "salvando" enquanto a gravação já falhou é mentir por 1,5s.
    const corpo = loading.slice(loading.indexOf('export async function comLoadingGlobal'));
    expect(corpo).toMatch(/const r = await fn\(\);[\s\S]*?minimoMs/);
    expect(corpo).toContain('} finally {');
  });

  it('o overlay é central, com spinner circular', () => {
    expect(overlay).toContain('className="nr-save-overlay"');
    expect(overlay).toContain('className="spinner"');
    expect(overlay).toContain('role="status"');
  });

  it('o sucesso virou modal, no lugar do alert nativo', () => {
    for (const tela of [vaso, caldeira, autoclave]) {
      expect(semComentarios(tela)).not.toContain("window.alert('Memorial salvo com sucesso!')");
      expect(tela).toContain("titulo: 'Cálculo salvo'");
      expect(tela).toContain('O memorial de cálculo foi salvo com sucesso no sistema.');
      expect(tela).toContain("variante: 'sucesso'");
    }
  });

  it('erro de gravação NÃO vira popup de sucesso', () => {
    for (const tela of [vaso, caldeira, autoclave]) {
      expect(tela).toContain("titulo: 'Não foi possível salvar'");
      expect(tela).toContain('O memorial NÃO foi salvo:');
      // O sucesso fica ANTES do catch — quem falha nunca chega nele.
      expect(tela.indexOf("titulo: 'Cálculo salvo'")).toBeLessThan(
        tela.indexOf("titulo: 'Não foi possível salvar'"),
      );
    }
  });

  it('a regra de gravação continua a mesma', () => {
    // Nada de fórmula, nada de persistência: o que mudou é o que a tela mostra.
    expect(vaso).toContain('await salvarVaso(tag, vaso, sufixo);');
    expect(vaso).toContain('await salvarResumoVaso(tag, resumoAtual, sufixo);');
    expect(caldeira).toContain('await salvarCaldeira(tag, cald);');
    expect(autoclave).toContain('await salvarDadosAutoclave(tag, subtipo, dados);');
  });
});

describe('prontuário: o modal de criação', () => {
  it('ganhou bloco de abertura com ilustração', () => {
    expect(prontuarios).toContain('className="mcr-intro"');
    expect(prontuarios).toContain('/ilustracoes/escolher-equipamento.webp');
    expect(prontuarios).toContain('<strong>Escolha o equipamento</strong>');
    expect(prontuarios).toContain('Selecione ao lado o equipamento');
    // Os três passos dizem o que acontece DEPOIS da escolha — o que a versão
    // de uma linha só não cabia.
    expect(prontuarios).toContain('className="mcr-intro-passos"');
    expect(prontuarios).toContain('salva como rascunho');
  });

  it('a introdução é OPCIONAL — o modal de relatório não a recebe', () => {
    // Ele abre em cima de uma lista que o usuário acabou de ver.
    expect(modalSel).toContain('intro?: ReactNode');
    const relatorios = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
    expect(relatorios).not.toContain('mcr-intro');
  });

  it('a busca e a lista continuam onde estavam', () => {
    // A introdução entra ANTES do catálogo, dentro do mesmo corpo rolável.
    expect(modalSel).toContain('{intro}');
    expect(modalSel).toContain('{children}');
    expect(prontuarios).toContain('<CatalogoProntuariosV9');
    expect(prontuarios).toContain('modo="selecao"');
    // A busca segue grudada no topo do corpo.
    expect(cssModal).toContain('.mcr-corpo-lista .busca-lista {');
    expect(cssModal).toContain('position: sticky;');
  });

  it('a ilustração é leve, não estica e encolhe no celular', () => {
    const b = readFileSync('public/ilustracoes/escolher-equipamento.webp');
    expect(b.slice(8, 12).toString()).toBe('WEBP');
    expect(b.length).toBeLessThan(150_000);
    expect(cssModal).toContain('aspect-ratio: 620 / 413;');
    expect(cssModal).toContain('object-fit: contain;');
    const movel = cssModal.slice(cssModal.lastIndexOf('@media (max-width: 640px)'));
    expect(movel).toContain('.mcr-intro img { width: 92px; }');
  });

  it('lista à esquerda, apoio à direita — e só a lista rola', () => {
    // A abertura ficava ACIMA da lista e empurrava os equipamentos para fora do
    // modal. Ao lado, a ilustração cabe grande e a lista continua sendo o que o
    // olho encontra primeiro.
    expect(modalSel).toContain('className="mcr-corpo-2col"');
    expect(modalSel).toContain('className="mcr-col-lista mcr-corpo-lista"');
    expect(modalSel).toContain('<aside className="mcr-col-apoio">');
    expect(cssModal).toContain('grid-template-columns: minmax(0, 1fr) 320px;');
    // Se a coluna de apoio rolasse junto, a explicação sumiria no primeiro giro
    // da roda. `ListaVirtualizada` sobe até o ancestral rolável mais próximo,
    // que passa a ser a coluna da lista.
    expect(cssModal).toMatch(/\.mcr-col-lista \{[\s\S]*?overflow-y: auto;/);
  });

  it('a variante de duas colunas é uma CLASSE, não só o seletor :has()', () => {
    // `:has` é recente; a largura do modal não pode depender do navegador.
    expect(modalSel).toContain("intro ? ' mcr-box-2col' : ''");
    expect(cssModal).toContain('.mcr-box-2col { max-width: 1000px; }');
  });

  it('a linha da lista fica compacta dentro do modal', () => {
    // O card da tela de equipamentos tem 92px — ele mostra um parque inteiro.
    // Aqui a pergunta é "qual destes?". A `ListaVirtualizada` MEDE a linha real,
    // então compactar não desalinha a virtualização.
    expect(cssModal).toContain('.mcr-corpo-2col .card-equipamento-horiz {');
    expect(cssModal).toContain('padding: 7px 12px;');
    expect(cssModal).toContain('.mcr-corpo-2col .card-eq-img { width: 40px; height: 40px;');
  });

  it('no tablet e no celular o apoio vai para CIMA, deitado', () => {
    const t = cssModal.slice(cssModal.indexOf('@media (max-width: 900px)'));
    expect(t).toContain('grid-template-columns: 1fr;');
    expect(t).toContain('order: -1;');
    // Deitado (imagem ao lado do texto) e sem os passos: no alto de uma tela
    // estreita, a lista é que precisa do espaço.
    expect(t).toContain('flex-direction: row;');
    expect(t).toContain('.mcr-intro-passos { display: none; }');
  });

  it('o modal continua diálogo, com ESC e armadilha de foco', () => {
    expect(modalSel).toContain('aria-modal="true"');
    expect(modalSel).toContain("e.key === 'Escape'");
    expect(modalSel).toContain("e.key !== 'Tab'");
    expect(modalSel).toContain('aria-label="Fechar"');
  });
});

describe('o modal não vira caixa dentro de caixa', () => {
  it('o painel branco da TELA é neutralizado dentro do modal', () => {
    // O catálogo traz `bloco-dados painel-lista` junto — com borda, raio e um
    // `min-height` de 58vh que abria um vazio embaixo dos equipamentos. No
    // modal, a moldura é o próprio modal.
    const css = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');
    expect(css).toContain('.mcr-corpo-2col .bloco-dados.painel-lista {');
    expect(css).toContain('min-height: 0;');
    expect(css).toContain('.mcr-corpo-2col .lista-virt { padding: 0; }');
  });

  it('a arte de fundo branco vira um cartão, de propósito', () => {
    // Sobre o cinza-azulado da coluna, um PNG/JPG de fundo branco aparece como
    // um retângulo solto. Com borda e raio ele passa a ser um cartão.
    const css = readFileSync('src/features/relatorios/modalCriarRelatorio.css', 'utf8');
    expect(css).toContain('.mcr-col-apoio .mcr-intro img {');
    expect(css).toContain('border-radius: 14px;');
  });
});
