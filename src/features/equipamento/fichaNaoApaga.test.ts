/**
 * A-F5-02 / decisão A-4 — a ficha do equipamento NÃO apaga arquivo.
 *
 * A regra é fácil de quebrar sem querer: basta alguém "consertar" a ficha
 * chamando `removerFoto` ao trocar ou remover a foto de identificação. Isso
 * apagaria do bucket um arquivo que um relatório LEGADO (sem `pdfRef`) ainda
 * aponta, porque esse relatório é remontado a partir de `CAPA.html`, que lê
 * `nr13_fotos_` VIVO.
 *
 * Por isso o teste é de VARREDURA, no mesmo espírito de
 * `palco.varreduraTemplates.test.ts`: ele olha o arquivo, não o comportamento —
 * a garantia precisa valer para o código, não só para um caminho exercitado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(process.cwd(), 'src', 'features', 'equipamento');
/** Sem comentários: a palavra aparece na documentação de propósito. */
function semComentarios(s: string): string {
  const bloco = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const linha = new RegExp('^\\s*//.*$', 'gm');
  return s.replace(bloco, '').replace(linha, '');
}
const ficha = semComentarios(readFileSync(join(raiz, 'FotoIdentificacao.tsx'), 'utf8'));
const regras = semComentarios(readFileSync(join(raiz, 'identificacaoEquipamento.ts'), 'utf8'));

describe('6 · a ficha nunca apaga arquivo do Storage', () => {
  it('`FotoIdentificacao` não importa nem chama `removerFoto`', () => {
    expect(ficha).not.toMatch(/removerFoto/);
  });

  it('as regras puras também não conhecem remoção de arquivo', () => {
    expect(regras).not.toMatch(/removerFoto|storage\.from|\.remove\(/);
  });

  it('a ficha ainda grava a foto pelo caminho normal — não é uma tela morta', () => {
    expect(ficha).toMatch(/salvarFoto/);
    expect(ficha).toMatch(/nr13_fotos_/);
  });

  it('a ficha não escreve base64: grava referência, como o resto do sistema', () => {
    // `src: ''` é o campo legado, mantido vazio de propósito nas fotos novas.
    expect(ficha).not.toMatch(/toDataURL|readAsDataURL|data:image/);
    expect(ficha).toMatch(/src: ''/);
  });
});
