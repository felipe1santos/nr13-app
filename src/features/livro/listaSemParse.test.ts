/**
 * Fase 9 · 9F.4 — **A LISTA NOVA NÃO HIDRATA E NÃO FAZ PARSE DE LIVRO.**
 *
 * ## O defeito que este arquivo impede de voltar
 *
 * `LivroRegistro.tsx` chamava (e a tela LEGADA ainda chama, de propósito)
 * `lerTudo()` — a hidratação INTEGRAL da organização. Esta era a ÚLTIMA tela do
 * sistema a fazer isso. Medido em produção em 02/09/2026: a organização de 39
 * equipamentos com UM livro baixava **780 KB** para desenhar UMA linha de
 * tabela; o pior caso proporcional gastava 308 KB para 553 bytes.
 *
 * E `montarLinhas()` fazia três `JSON.parse` por equipamento — `nr13_info_`,
 * `nr13_livro_` e `nr13_cat_` — para depois descartar 38 dos 39 no `filter`.
 *
 * A 9F.4 tira isso do caminho novo. Mas "tirei" não é um estado: é uma decisão
 * que a próxima edição desfaz sem querer — alguém precisa de um dado na tabela e
 * chama `ler()` ali mesmo. O defeito volta **sem erro nenhum**: a tela fica
 * correta e fica lenta, e ninguém percebe até o parque crescer.
 *
 * Então este teste lê os ARQUIVOS do caminho novo e exige que eles não toquem em
 * nada que custe caro. É o irmão do `listaSemParse.test.ts` da 9F.3.
 *
 * ## O que NÃO é violação
 *
 * A tela legada continua chamando `lerTudo` e `montarLinhas`, e deve mesmo: com
 * a flag desligada o comportamento tem que ser exatamente o de hoje. Este teste
 * olha só os arquivos da flag LIGADA.
 *
 * `catalogoLivro.ts` PODE chamar `ler()` — é ele que lê o livro da verdade,
 * depois de semear, ao ABRIR um equipamento. Uma vez por abertura, não por
 * cartão, e é justamente o que preserva o livro como fonte autoritativa.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'src/features/livro');

/** Só o CÓDIGO — comentários explicam o defeito e citariam os nomes proibidos. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const CATALOGO = semComentarios(readFileSync(join(RAIZ, 'CatalogoLivroV9.tsx'), 'utf8'));
const BUSCA = semComentarios(readFileSync(join(RAIZ, 'buscaLivro.ts'), 'utf8'));

describe('CatalogoLivroV9 não hidrata nem paga por linha', () => {
  it('NÃO chama `lerTudo` — era o último da fase, e não pode voltar', () => {
    expect(
      CATALOGO.includes('lerTudo'),
      'A lista nova voltou a hidratar a organização inteira.',
    ).toBe(false);
  });

  it('NÃO faz `JSON.parse` de nada', () => {
    expect(CATALOGO.includes('JSON.parse')).toBe(false);
  });

  it('NÃO lê `nr13_livro_` do cache — a contagem vem da projeção', () => {
    expect(
      CATALOGO.includes('nr13_livro_'),
      'A lista voltou a abrir o livro de cada equipamento para contar entradas.',
    ).toBe(false);
  });

  it('NÃO importa o `storage` — nem `ler`, nem `listarChavesComPrefixo`', () => {
    expect(CATALOGO).not.toMatch(/from\s+['"].*services\/storage['"]/);
    expect(CATALOGO.includes('listarChavesComPrefixo')).toBe(false);
  });

  it('NÃO chama `montarLinhas` (a varredura da organização inteira)', () => {
    expect(CATALOGO.includes('montarLinhas')).toBe(false);
  });

  it('a busca vai pela RPC dedicada, com keyset', () => {
    expect(BUSCA.includes('buscar_livros')).toBe(true);
    expect(BUSCA.includes('p_cursor')).toBe(true);
  });

  it('a camada de busca também não toca no armazenamento local', () => {
    expect(BUSCA.includes('lerTudo')).toBe(false);
    expect(BUSCA).not.toMatch(/from\s+['"].*services\/storage['"]/);
  });
});

describe('9G.3 — o caminho legado SAIU da tela', () => {
  const TELA = semComentarios(
    readFileSync(join(process.cwd(), 'src/pages/LivroRegistro.tsx'), 'utf8'),
  );

  // Estes dois testes existiam invertidos até 03/09/2026: eles garantiam que o
  // legado CONTINUASSE na tela durante o rollout, porque desligar a flag era o
  // rollback. Com as oito flags em 30/30 e o gate global verde, o dono autorizou
  // a remoção — e a mesma disciplina que segurava o legado agora impede que ele
  // volte por descuido.
  it('a tela NÃO chama mais `lerTudo` — a hidratação integral saiu', () => {
    expect(
      TELA.includes('lerTudo'),
      'A lista do Livro vem de `buscar_livros`. `lerTudo()` aqui baixaria a ' +
        'organização inteira e desfaria o boot leve na primeira visita.',
    ).toBe(false);
  });

  it('e não resta guarda de flag (`deveHidratarListaLegada`, `livroV9Ativa`)', () => {
    expect(TELA.includes('deveHidratarListaLegada')).toBe(false);
    expect(TELA.includes('livroV9Ativa')).toBe(false);
    expect(TELA.includes('bootV9Ativo')).toBe(false);
  });

  it('a lista vem do catálogo do servidor, e só dele', () => {
    expect(TELA.includes('CatalogoLivroV9')).toBe(true);
    // `montarLinhas` (plural) varria o cache inteiro; morreu junto com o legado.
    expect(TELA.includes('montarLinhas')).toBe(false);
  });

  it('e a abertura pela lista semeia antes de montar a linha', () => {
    expect(TELA.includes('abrirEquipamentoParaLivro')).toBe(true);
    const corpo = TELA.slice(TELA.indexOf('const abrirPorTag'));
    const fim = corpo.indexOf('\n  };');
    const funcao = corpo.slice(0, fim);
    expect(funcao.indexOf('await abrirEquipamentoParaLivro')).toBeLessThan(
      funcao.indexOf('montarLinha('),
    );
  });
});
