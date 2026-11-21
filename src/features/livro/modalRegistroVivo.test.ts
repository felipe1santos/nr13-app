/**
 * GATE · o modal "Novo registro" acende (21/11/2026) — pedido do dono: o
 * layout estava "seco, sem vida". Estrutura, não pixel: a suíte roda sem DOM.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/features/livro/modalNovoRegistro.css', 'utf8');
const modal = readFileSync('src/features/livro/ModalNovoRegistro.tsx', 'utf8');
const seletor = readFileSync('src/features/livro/SeletorOcorrencia.tsx', 'utf8');
/** Só o bloco desta rodada, que é o último do arquivo. */
const bloco = css.slice(css.indexOf('21/11/2026 · O MODAL "ACENDE"'));

describe('botões acendem com fundo sólido --sel e texto branco', () => {
  it('abas, salvar e opções de motivo — no hover e no selecionado', () => {
    expect(bloco).toMatch(/\.reg-modal-abas button:hover,\s*\.reg-modal-abas button\.ativa \{\s*background: var\(--sel\);\s*color: #fff;/);
    expect(bloco).toMatch(/\.reg-modal-acoes \.fj-btn-primary:hover,[\s\S]*?background: var\(--sel-hover\);/);
    expect(bloco).toMatch(/\.reg-motivo-opcao:hover,\s*\.reg-motivo-opcao\.ativa \{\s*background: var\(--sel\);/);
  });
});

describe('"Tipo de ocorrência": vermelho no hover e atrás do nome escolhido', () => {
  it('é uma lista própria (o <select> nativo não aceita estilo na lista aberta)', () => {
    expect(modal).toContain('<SeletorOcorrencia');
    expect(modal).not.toMatch(/<select\s+id="oc-tipo"/);
    expect(seletor).toContain('role="listbox"');
    expect(seletor).toContain('role="option"');
    expect(seletor).toContain('aria-selected={t === valor}');
    expect(seletor).toContain('aria-haspopup="listbox"');
    expect(seletor).toContain('aria-activedescendant');
  });

  it('hover em vermelho claro; o escolhido com vermelho SÓ atrás do nome', () => {
    expect(bloco).toMatch(/\.reg-tipo-opcao\.ativa,\s*\.reg-tipo-opcao:hover \{ background: #FEE2E2; color: #B42318; \}/);
    // O fundo vermelho é do SPAN do nome, não do botão/caixa.
    expect(bloco).toMatch(/\.reg-tipo-sel,\s*\.reg-tipo-opcao\.escolhida \.reg-tipo-nome \{[\s\S]*?background: #DC2626;\s*color: #fff;/);
    expect(bloco).not.toMatch(/\.reg-tipo-gatilho[^{]*\{[^}]*#DC2626/);
    expect(seletor).toContain('<span className="reg-tipo-sel">{valor}</span>');
  });
});

describe('preenchido = azul petróleo', () => {
  it('"Quem realizou" e "Responsável técnico" ganham a classe quando têm valor', () => {
    expect(modal).toContain("className={form.quemRealizou.trim() ? 'preenchido' : undefined}");
    expect(modal).toContain("className={form.phId ? 'preenchido' : undefined}");
    expect(modal).toContain('Responsável técnico');
    expect(bloco).toMatch(/#oc-quem\.preenchido,[\s\S]*?#oc-ph\.preenchido \{\s*color: var\(--petroleo\);/);
  });
});
