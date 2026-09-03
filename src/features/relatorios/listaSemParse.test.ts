/**
 * Fase 9 · 9F.6 — **O CATÁLOGO NOVO NÃO HIDRATA E NÃO PAGA POR CARTÃO.**
 *
 * ## O defeito que este arquivo impede de voltar
 *
 * `Relatorios.tsx` montava o seletor com `listarEquipamentos()` — que começa com
 * `await lerTudo()` — e depois `montarResumo(tag)` por equipamento.
 * `montarResumo` lê CINCO chaves: `nr13_info_`, `nr13_cat_`, `nr13_calc_`,
 * `nr13_pref_unidade_` e **`nr13_fotos_`**, a família mais pesada do sistema
 * (92 KB numa TAG medida). E a contagem do selo saía de
 * `listarIndice(tag).length`, mais um `JSON.parse` por cartão.
 *
 * "Tirei" não é um estado: é uma decisão que a próxima edição desfaz sem querer.
 * Alguém acrescenta uma coluna no cartão, precisa de um dado, e chama o serviço
 * ali mesmo. O defeito volta **sem erro nenhum** — a tela fica correta e fica
 * lenta, e ninguém percebe até o parque crescer.
 *
 * ## O que NÃO é violação
 *
 * `Relatorios.tsx` **ainda tem** `listarEquipamentos` e `listarHistorico`, e
 * deve mesmo: é o caminho de rollback, e com a flag desligada o comportamento
 * precisa ser exatamente o de hoje. O que este teste exige é que ele esteja
 * atrás da guarda — se alguém apagar `deveHidratarListaLegada` daqui, a tela
 * legada volta a hidratar mesmo com a flag ligada, e fica vermelho.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'src/features/relatorios');

/** Só o CÓDIGO — comentários explicam o defeito e citariam os nomes proibidos. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const CATALOGO = semComentarios(readFileSync(join(RAIZ, 'CatalogoRelatoriosV9.tsx'), 'utf8'));
const SERVICO = semComentarios(readFileSync(join(RAIZ, 'catalogoRelatorios.ts'), 'utf8'));
const TELA = semComentarios(
  readFileSync(join(process.cwd(), 'src/pages/Relatorios.tsx'), 'utf8'),
);

describe('CatalogoRelatoriosV9 não hidrata a organização', () => {
  it('NÃO chama `lerTudo`', () => {
    expect(CATALOGO).not.toMatch(/lerTudo/);
  });

  it('NÃO chama `listarEquipamentos` — a lista vem da projeção', () => {
    expect(
      CATALOGO,
      'A lista precisa vir de `buscaIndex.listarPagina`. `listarEquipamentos()` começa com ' +
        '`await lerTudo()` e devolve a hidratação integral que a 9F.6 removeu.',
    ).not.toMatch(/listarEquipamentos/);
  });

  it('NÃO chama `montarResumo` — seriam CINCO leituras por cartão', () => {
    expect(CATALOGO).not.toMatch(/montarResumo/);
  });

  it('NÃO toca `nr13_fotos_` — a capa vem como referência do bucket', () => {
    expect(
      CATALOGO,
      'A capa precisa vir de `item.fotoRef`. Ler `nr13_fotos_` aqui traz a foto em base64 de ' +
        'todo equipamento da página só para desenhar a miniatura.',
    ).not.toMatch(/nr13_fotos_/);
  });

  it('NÃO conta relatórios por cartão — a contagem vem da página inteira', () => {
    expect(
      CATALOGO,
      'A contagem precisa vir de `contagensPorTag`, UMA chamada para as 50 TAGs. ' +
        '`listarIndice`/`contarRelatorios` por cartão devolve o N+1 que esta fase remove.',
    ).not.toMatch(/listarIndice|contarRelatorios\(/);
  });

  it('NÃO importa `services/storage`', () => {
    expect(CATALOGO).not.toMatch(/services\/storage/);
  });
});

describe('catalogoRelatorios (serviço) não hidrata', () => {
  it('NÃO chama `lerTudo` nem `listarEquipamentos`', () => {
    expect(SERVICO).not.toMatch(/lerTudo/);
    expect(SERVICO).not.toMatch(/listarEquipamentos/);
  });

  it('semeia UMA TAG por vez, por `carregarEquipamento`', () => {
    expect(SERVICO).toMatch(/carregarEquipamento/);
  });
});

describe('9G.3 — o caminho antigo SAIU de Relatorios.tsx', () => {
  // Estes testes existiam invertidos até 03/09/2026: garantiam que o legado
  // ficasse enquanto desligar a flag era o rollback. Com as oito flags em 30/30
  // e o gate global verde, a remoção foi autorizada — e a mesma disciplina que
  // segurava o legado agora impede que ele volte por descuido.
  it('a tela NÃO chama mais `listarEquipamentos` — a hidratação integral saiu', () => {
    expect(
      TELA,
      '`listarEquipamentos()` começa com `await lerTudo()`. Aqui ele baixaria a ' +
        'organização inteira só para desenhar o seletor de equipamentos.',
    ).not.toMatch(/listarEquipamentos/);
  });

  it('e não resta guarda de flag (`deveHidratarListaLegada`, `relatoriosV9Ativa`)', () => {
    expect(TELA).not.toMatch(/deveHidratarListaLegada/);
    expect(TELA).not.toMatch(/relatoriosV9Ativa/);
    expect(TELA).not.toMatch(/buscaV9Ativa/);
  });

  it('semeia a TAG ao escolher — a ordem que impede o histórico vazio', () => {
    expect(TELA).toMatch(/abrirEquipamentoParaRelatorio/);
  });

  it('mas a SAÍDA para a tela antiga continua existindo', () => {
    // `legado=1` é o único caminho que remonta relatório anterior ao §7-quater,
    // que não tem PDF arquivado. Removê-la junto com a flag deixaria esse
    // documento inalcançável.
    expect(TELA).toMatch(/modoRelatorios/);
  });
});
