/**
 * Fase 9 · 9F.3 — **A LISTA NOVA NÃO CONTA NO RENDER.**
 *
 * ## O defeito que este arquivo impede de voltar
 *
 * `Calibracoes.tsx` tinha (e a tela LEGADA ainda tem, de propósito)
 * `const qtd = listarCalibracoes(eq.tag).length;` DENTRO do `.map()` do render:
 * um `JSON.parse` da lista inteira por cartão, a cada quadro — 2,1 KB por TAG na
 * média medida em produção em 31/08/2026, 8,9 KB na maior. E `proprietarioDe`,
 * que é `ler('nr13_emp_' + tag)`, era chamado TRÊS vezes no mesmo quadro.
 *
 * A 9F.3 tira isso do caminho novo trazendo a contagem pronta do servidor. Mas
 * "tirei" não é um estado: é uma decisão que a próxima edição desfaz sem querer
 * — alguém acrescenta uma coluna no cartão, precisa de um dado, e chama o
 * serviço ali mesmo. O defeito volta **sem erro nenhum**: a tela fica correta e
 * fica lenta, e ninguém percebe até o parque crescer.
 *
 * Então este teste lê o ARQUIVO da lista nova e exige que ele não toque em nada
 * que custe caro por cartão. É o irmão do `prontuariosSemParse.test.ts` da 9F.2.
 *
 * ## O que NÃO é violação
 *
 * A tela legada continua chamando `listarCalibracoes` no render, e deve mesmo:
 * com a flag desligada o comportamento tem que ser exatamente o de hoje. Este
 * teste olha só o componente da flag LIGADA.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'src/features/calibracoes');

/** Só o CÓDIGO — comentários explicam o defeito e citariam os nomes proibidos. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const CATALOGO = semComentarios(readFileSync(join(RAIZ, 'CatalogoCalibracoesV9.tsx'), 'utf8'));

describe('CatalogoCalibracoesV9 não paga por cartão', () => {
  it('NÃO chama `listarCalibracoes` — a contagem vem da projeção', () => {
    expect(
      CATALOGO,
      'A contagem do cartão precisa vir de `item.calibracoes`. Chamar `listarCalibracoes` ' +
        'aqui devolve o `JSON.parse` por cartão que a 9F.3 removeu — e ainda daria um número ' +
        'DIFERENTE do painel de vencimentos, porque item sem `id` não entra em calibracoes_index.',
    ).not.toMatch(/listarCalibracoes/);
  });

  it('NÃO chama `listarComponentes` nem `listarLotes`', () => {
    expect(CATALOGO).not.toMatch(/listarComponentes/);
    expect(CATALOGO).not.toMatch(/listarLotes/);
  });

  it('NÃO lê `nr13_emp_` — o proprietário vem na mesma linha da projeção', () => {
    expect(
      CATALOGO,
      'A tela antiga lê `nr13_emp_<TAG>` três vezes por quadro (dois useMemo + o corpo do map). ' +
        'O `clienteNome`/`clienteCidade` da projeção existe para acabar com isso.',
    ).not.toMatch(/nr13_emp_/);
  });

  it('NÃO chama `ler(` do storage — nada de leitura de cache por cartão', () => {
    expect(CATALOGO).not.toMatch(/\bler\s*</);
    expect(CATALOGO).not.toMatch(/\bler\s*\(/);
  });

  it('NÃO chama `lerTudo` nem `listarEquipamentos` — é o mount que a etapa remove', () => {
    expect(CATALOGO).not.toMatch(/lerTudo/);
    expect(CATALOGO).not.toMatch(/listarEquipamentos/);
  });

  it('não importa nada de `pages/` — a 9G remove o caminho antigo sem levar este junto', () => {
    expect(CATALOGO).not.toMatch(/from\s+['"][^'"]*pages\//);
  });

  it('usa `rotuloCalibracoes`, que é onde a regra `null` ≠ `0` mora e tem teste', () => {
    expect(CATALOGO).toMatch(/rotuloCalibracoes/);
  });
});

describe('o contrato de abertura também não conta por conta própria', () => {
  const CONTRATO = semComentarios(readFileSync(join(RAIZ, 'catalogoCalibracoes.ts'), 'utf8'));

  it('semeia com `carregarEquipamento` antes de qualquer leitura', () => {
    const iSemear = CONTRATO.indexOf('carregarEquipamento');
    const iLer = CONTRATO.indexOf('listarCalibracoes(');
    expect(iSemear).toBeGreaterThan(-1);
    expect(iLer).toBeGreaterThan(-1);
    expect(
      iSemear,
      'Ler antes de semear abre o histórico VAZIO e sem erro nenhum — a forma cara de errar.',
    ).toBeLessThan(iLer);
  });

  it('NÃO chama `lerTudo` — o ponto da etapa é justamente não hidratar a organização', () => {
    expect(CONTRATO).not.toMatch(/lerTudo/);
  });
});
