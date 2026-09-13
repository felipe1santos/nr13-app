import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { folhasEfetivas } from './folhasDoAssinante';
import { PAGINAS_PRONTUARIO } from '../prontuarios/tipos';

const MODAL = readFileSync('src/features/cadastros/ModalVerFuncionario.tsx', 'utf8');
const PAGINA = readFileSync('src/pages/Funcionarios.tsx', 'utf8');
const CSS = readFileSync('src/pages/cadastros.css', 'utf8');
const BLOCO = CSS.slice(CSS.indexOf('/* ── VER FUNCIONÁRIO'));
const MOBILE = BLOCO.slice(BLOCO.indexOf('@media (max-width: 640px)'));

/**
 * A parte que pode mentir.
 *
 * `folhasProntuario`/`folhasRelatorio` ausentes NÃO são "nenhuma folha": são a
 * regra padrão do motor de assinatura. Uma tela de leitura que mostrasse "0 de
 * 6" para um cadastro antigo estaria desmentindo o papel, que sai carimbado.
 */
describe('quais folhas o profissional assina de verdade', () => {
  const TODAS = ['A.html', 'B.html', 'C.html'] as const;

  it('cadastro nunca configurado + Engenheiro = TODAS, e a origem é a regra padrão', () => {
    const r = folhasEfetivas(undefined, TODAS, 'Engenheiro');
    expect(r.lista).toEqual(['A.html', 'B.html', 'C.html']);
    expect(r.origem).toBe('padrao');
  });

  it('cadastro nunca configurado + Inspetor = NENHUMA, e a origem é a regra padrão', () => {
    const r = folhasEfetivas(undefined, TODAS, 'Inspetor');
    expect(r.lista).toEqual([]);
    expect(r.origem).toBe('padrao');
  });

  it('lista VAZIA escolhida é diferente de ausente — é escolha do usuário', () => {
    // Um engenheiro que foi configurado para não assinar nada precisa aparecer
    // como "não assina", e não como "assina todas" pela regra padrão.
    const r = folhasEfetivas([], TODAS, 'Engenheiro');
    expect(r.lista).toEqual([]);
    expect(r.origem).toBe('cadastro');
  });

  it('a ordem é a das FOLHAS, não a da marcação', () => {
    const r = folhasEfetivas(['C.html', 'A.html'], TODAS, 'Inspetor');
    expect(r.lista).toEqual(['A.html', 'C.html']);
  });

  it('folha que não existe mais no sistema é descartada, sem quebrar', () => {
    // Cadastro antigo pode citar uma folha que saiu do documento.
    const r = folhasEfetivas(['A.html', 'REMOVIDA.html'], TODAS, 'Engenheiro');
    expect(r.lista).toEqual(['A.html']);
  });

  it('o padrão do Engenheiro cobre as 6 folhas reais do prontuário', () => {
    const r = folhasEfetivas(undefined, PAGINAS_PRONTUARIO, 'Engenheiro');
    expect(r.lista).toHaveLength(PAGINAS_PRONTUARIO.length);
  });

  it('a lista devolvida é uma CÓPIA — mexer nela não altera o catálogo', () => {
    const r = folhasEfetivas(undefined, TODAS, 'Engenheiro');
    r.lista.push('X.html');
    expect(TODAS).toHaveLength(3);
  });
});

describe('o modal é de LEITURA', () => {
  it('não tem campo de entrada nenhum', () => {
    expect(MODAL).not.toMatch(/<input/);
    expect(MODAL).not.toMatch(/<textarea/);
    expect(MODAL).not.toMatch(/<select/);
    expect(MODAL).not.toMatch(/contentEditable/i);
  });

  it('não grava: nenhuma chamada de salvar/excluir', () => {
    expect(MODAL).not.toMatch(/salvarFuncionario|excluirFuncionario|\bsalvar\(/);
    expect(MODAL).not.toContain("from '../../services/storage'");
    expect(MODAL).not.toContain('cadastroService');
  });

  it('declara a nota da regra padrão, e ela cita as duas metades da regra', () => {
    expect(MODAL).toContain('Nunca configurado neste cadastro');
    expect(MODAL).toContain('engenheiro assina todas, inspetor nenhuma');
  });

  it('avisa quando não há rubrica, porque a folha sai assim mesmo', () => {
    expect(MODAL).toContain('Sem assinatura cadastrada');
  });

  it('prende o foco e fecha no Esc', () => {
    expect(MODAL).toContain('useFocoPreso(caixa, onFechar)');
    expect(MODAL).toContain('aria-modal="true"');
  });
});

describe('o olho no card', () => {
  it('existe, abre a leitura e NÃO abre o formulário', () => {
    expect(PAGINA).toContain('nome="eye"');
    expect(PAGINA).toContain('onClick={() => setVendo(f)}');
    expect(PAGINA).toContain('title="Ver dados cadastrados"');
  });

  it('vem ANTES do lápis — conferir é o gesto mais frequente', () => {
    const olho = PAGINA.indexOf('nome="eye"');
    const lapis = PAGINA.indexOf('nome="pencil"', olho);
    expect(olho).toBeGreaterThan(0);
    expect(lapis).toBeGreaterThan(olho);
  });

  it('o modal recebe os catálogos REAIS de folhas, não uma cópia', () => {
    expect(PAGINA).toContain('folhasProntuario={PAGINAS_PRONTUARIO}');
    expect(PAGINA).toContain('folhasRelatorio={FOLHAS_RELATORIO_ASSINAVEIS}');
  });

  it('o botão Editar do modal leva ao formulário daquele profissional', () => {
    expect(PAGINA).toContain('editarFuncionario(alvo)');
  });
});

describe('gate · responsividade do modal', () => {
  it('nenhuma largura fixa maior que a tela de 386px', () => {
    // `max-width` fica DE FORA de propósito: é teto, não largura — o modal pode
    // ter `max-width: 560px` e ainda encolher até 386. O que estoura a tela é
    // `width`/`min-width` grandes. O `[^-]` é o que exclui `max-width`.
    const larguras = [...BLOCO.matchAll(/(?:^|[^-])(?:min-)?width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(larguras.filter((n) => n > 386)).toEqual([]);
  });

  it('o cabeçalho pode espremer o nome sem empurrar o × para fora', () => {
    expect(BLOCO).toMatch(/\.verfunc-cab-txt\s*\{[^}]*min-width: 0/);
  });

  it('cabeçalho e rodapé fixos, corpo rolando por dentro', () => {
    expect(BLOCO).toMatch(/\.verfunc-cab\s*\{[^}]*flex: 0 0 auto/);
    expect(BLOCO).toMatch(/\.verfunc-rodape\s*\{[^}]*flex: 0 0 auto/);
    expect(BLOCO).toMatch(/\.verfunc-corpo\s*\{[^}]*min-height: 0/);
    expect(BLOCO).toMatch(/\.verfunc-corpo\s*\{[^}]*overflow-x: hidden/);
  });

  it('a rubrica escala pelos próprios bytes — nada de dimensão fixa', () => {
    expect(BLOCO).toMatch(/\.verfunc-rubrica img\s*\{[^}]*max-width: 100%/);
    expect(BLOCO).toMatch(/\.verfunc-rubrica img\s*\{[^}]*object-fit: contain/);
    expect(BLOCO).not.toMatch(/\.verfunc-rubrica img\s*\{[^}]*[^-]height:\s*\d+px/);
  });

  it('texto longo quebra em vez de empurrar', () => {
    for (const s of ['.verfunc-cab-txt h3', '.verfunc-dados dd', '.verfunc-folhas li']) {
      expect(BLOCO).toMatch(new RegExp(`\\${s}\\s*\\{[^}]*overflow-wrap: anywhere`));
    }
  });

  it('no celular os botões do rodapé chegam a 44px', () => {
    expect(MOBILE).toMatch(/min-height: 44px/);
  });

  it('olho e lápis têm o mesmo alvo de 36px dentro do card', () => {
    expect(BLOCO).toMatch(/\.cad-item-acoes \.btn-editar-pencil\s*\{[^}]*width: 36px/);
    expect(BLOCO).toMatch(/\.cad-item-acoes \.btn-editar-pencil\s*\{[^}]*height: 36px/);
  });
});
