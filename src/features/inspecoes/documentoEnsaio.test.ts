import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCS_POR_FORMULARIO } from './tipos';

const CONTAINER = readFileSync('src/pages/InspecaoContainer.tsx', 'utf8');
const MODAL = readFileSync('src/features/inspecoes/ModalDocumentoEnsaio.tsx', 'utf8');
const PREVIEW = readFileSync('src/features/inspecoes/PreviewDocumento.tsx', 'utf8');
const FORMULARIO = readFileSync('src/pages/InspecaoFormulario.tsx', 'utf8');
const CSS = readFileSync('src/pages/inspecoes.css', 'utf8');
const BLOCO = CSS.slice(CSS.indexOf('/* ── MODAL "VER DOCUMENTO"'));

describe('o botão "Ver documento" no container', () => {
  it('existe e abre o modal, sem navegar para outra página', () => {
    expect(CONTAINER).toContain('Ver documento');
    expect(CONTAINER).toContain('setDocumentoAberto(f)');
    expect(CONTAINER).toContain('<ModalDocumentoEnsaio');
  });

  it('fica à ESQUERDA de "Ver preenchido"', () => {
    // Ancorado no COMPORTAMENTO de cada botão, não no rótulo: o rótulo "Ver
    // preenchido" também aparece no comentário que explica a ordem, e casar por
    // texto encontraria o comentário primeiro.
    const doc = CONTAINER.indexOf('setDocumentoAberto(f)');
    const preenchido = CONTAINER.indexOf('?visualizar=1');
    expect(doc).toBeGreaterThan(0);
    expect(preenchido).toBeGreaterThan(doc);
  });

  it('só aparece quando o ensaio está preenchido', () => {
    const i = CONTAINER.indexOf('setDocumentoAberto(f)');
    // A guarda mais próxima acima do botão tem de ser a de preenchido.
    const guarda = CONTAINER.lastIndexOf('{preenchido && (', i);
    const abreLista = CONTAINER.lastIndexOf('formularios.map', i);
    expect(guarda).toBeGreaterThan(abreLista);
  });
});

describe('a folha montada com os dados do container', () => {
  it('grava as DUAS chaves de injeção antes de montar os iframes', () => {
    // §2 do CLAUDE.md: os templates não são uniformes — uns leem
    // `nr13_inspecao_atual`, outros `nr13_injecao_atual`. `gravarInspecaoOrigemAtual`
    // escreve as duas; montar o iframe antes dela mostraria a inspeção anterior.
    expect(PREVIEW).toContain('gravarInspecaoOrigemAtual');
    const iGrava = PREVIEW.indexOf('gravarInspecaoOrigemAtual');
    const iFrame = PREVIEW.indexOf('<iframe');
    expect(iGrava).toBeLessThan(iFrame);
    expect(PREVIEW).toContain('if (!pronto) return');
  });

  it('zera a meta, senão o cabeçalho sai com dados de OUTRO relatório', () => {
    expect(PREVIEW).toContain('gravarMetaAtual({} as RelatorioMeta)');
  });

  it('não monta nada quando o tipo não tem folha', () => {
    expect(PREVIEW).toContain('docs.length === 0');
  });

  it('todo tipo de ensaio tem folha declarada, ou cai no aviso', () => {
    for (const [tipo, docs] of Object.entries(DOCS_POR_FORMULARIO)) {
      expect(Array.isArray(docs), tipo).toBe(true);
      for (const d of docs) expect(d.endsWith('.html'), `${tipo}: ${d}`).toBe(true);
    }
  });

  it('avisa que é prévia — a folha tem cabeçalho de relatório e engana', () => {
    expect(MODAL).toContain('não é o documento emitido');
  });
});

describe('a prévia não ficou duplicada', () => {
  it('a página do formulário usa o MESMO componente, não uma cópia', () => {
    expect(FORMULARIO).toContain("import PreviewDocumento from '../features/inspecoes/PreviewDocumento'");
    expect(FORMULARIO).toContain('<PreviewDocumento');
    // A cópia local saiu junto com os imports que só ela usava.
    expect(FORMULARIO).not.toContain('function PreviewDocumento');
    expect(FORMULARIO).not.toContain('gravarInspecaoOrigemAtual');
    expect(FORMULARIO).not.toContain('DOCS_POR_FORMULARIO');
  });
});

describe('gate · responsividade do modal do documento', () => {
  it('o modal é largo: uma folha A4 reduzida não se confere', () => {
    expect(BLOCO).toMatch(/\.doc-modal\s*\{[^}]*max-width: 980px/);
  });

  it('cabeçalho e rodapé fixos, corpo rolando por dentro', () => {
    expect(BLOCO).toMatch(/\.doc-cab\s*\{[^}]*flex: 0 0 auto/);
    expect(BLOCO).toMatch(/\.doc-corpo\s*\{[^}]*min-height: 0/);
    expect(BLOCO).toMatch(/\.doc-cab-txt \{ flex: 1; min-width: 0; \}/);
  });

  it('no celular vira folha inferior com alvo de 44px', () => {
    const mobile = BLOCO.slice(BLOCO.indexOf('@media (max-width: 640px)'));
    expect(mobile).toMatch(/min-height: 44px/);
    expect(mobile).toMatch(/\.doc-modal\s*\{[^}]*height: 95vh/);
  });

  it('o foco fica preso no modal', () => {
    expect(MODAL).toContain('useFocoPreso');
    expect(MODAL).toContain('aria-modal="true"');
  });
});
