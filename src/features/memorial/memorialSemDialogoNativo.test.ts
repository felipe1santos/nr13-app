import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 07/09/2026 · O GATE **NENHUM DIÁLOGO NATIVO NO SALVAR DO MEMORIAL**.
 *
 * ## O que motivou, medido
 *
 * `alert()` e `confirm()` não são "um popup feio": eles **param o renderer**.
 * Enquanto a caixa está aberta, o React não pinta, o CDP não responde, a
 * automação dá timeout e a aba inteira parece travada. No E2E de 07/09/2026
 * isso custou três tentativas de salvar o memorial — e o sintoma que chega ao
 * usuário de campo, com o celular na mão, é "o sistema travou", não "faltou
 * preencher um campo".
 *
 * As três telas de memorial tinham o mesmo trio: um `alert` para "gere o
 * cálculo antes", um `alert` listando os campos faltantes e um `confirm`
 * perguntando se era para salvar mesmo.
 *
 * ## A regra
 *
 * O aviso continua existindo, com a MESMA mensagem, pelo caminho que o próprio
 * arquivo já usava no sucesso e no erro (`emitirAviso` → `ModalAviso`). E a
 * validação continua **impedindo** o salvamento — o que muda é como ela avisa,
 * não o que ela decide.
 *
 * ## Por que varredura de fonte
 *
 * A suíte roda em `environment: 'node'`, sem DOM: não há como abrir a tela e
 * afirmar que ela não congelou. O que dá para travar é a causa — a chamada
 * nativa não pode voltar ao arquivo.
 */

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TELAS = ['MemorialVaso', 'MemorialCaldeira', 'MemorialAutoclave'] as const;
const fontes = Object.fromEntries(
  TELAS.map((t) => [t, semComentarios(readFileSync(`src/features/memorial/${t}.tsx`, 'utf8'))]),
) as Record<(typeof TELAS)[number], string>;

const aviso = semComentarios(readFileSync('src/features/memorial/avisoMemorial.ts', 'utf8'));

/** O corpo de `async function salvar() { … }` — o fluxo que este gate protege. */
function corpoDoSalvar(fonte: string): string {
  const i = fonte.indexOf('async function salvar()');
  expect(i).toBeGreaterThan(-1);
  const fim = fonte.indexOf('\n  }', i);
  return fonte.slice(i, fim === -1 ? undefined : fim);
}

describe('o salvar do memorial não abre diálogo nativo', () => {
  it.each(TELAS)('%s: nenhum alert/confirm dentro de salvar()', (tela) => {
    const corpo = corpoDoSalvar(fontes[tela]);
    expect(corpo).not.toMatch(/(^|[^.\w])alert\s*\(/);
    expect(corpo).not.toMatch(/confirm\s*\(/);
  });

  it.each(TELAS)('%s: a validação continua IMPEDINDO o salvamento', (tela) => {
    // O aviso mudou de forma; a decisão não. Sem o `return` a tela avisaria e
    // salvaria assim mesmo — que é pior do que o alert.
    const corpo = corpoDoSalvar(fontes[tela]);
    expect(corpo).toContain('avisarGereOCalculo();');
    expect(corpo).toContain('avisarCamposFaltando(erros);');
    expect(corpo.match(/return;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it.each(TELAS)('%s: a mensagem REAL continua aparecendo', (tela) => {
    expect(fontes[tela]).toContain("import { avisarCamposFaltando, avisarGereOCalculo } from './avisoMemorial'");
  });

  it('o texto das duas mensagens não se perdeu na troca', () => {
    expect(aviso).toContain('Gere o cálculo antes de salvar');
    expect(aviso).toContain('Preencha os seguintes campos antes de salvar');
    // A lista de campos é o conteúdo útil do aviso — sem ela o usuário sabe que
    // falta algo e não sabe o quê.
    expect(aviso).toContain('erros.join');
  });

  it('o aviso sai pelo modal do app, não por caixa do navegador', () => {
    expect(aviso).toContain("import { emitirAviso } from '../../services/eventos'");
    expect(aviso).toContain("variante: 'alerta'");
    expect(semComentarios(aviso)).not.toMatch(/(^|[^.\w])alert\s*\(/);
    expect(semComentarios(aviso)).not.toMatch(/confirm\s*\(/);
  });

  it('o sucesso e o erro continuam como estavam (nenhuma regressão)', () => {
    for (const tela of TELAS) {
      expect(fontes[tela]).toContain("titulo: 'Cálculo salvo'");
      expect(fontes[tela]).toContain("titulo: 'Não foi possível salvar'");
    }
  });
});
