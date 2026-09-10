import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * O RASCUNHO também se renomeia (10/09/2026).
 *
 * Medido em produção: o nome do documento só podia ser escolhido no modal de
 * FINALIZAR. Para identificar um rascunho na lista era preciso finalizá-lo
 * primeiro — o contrário do que o rascunho existe para permitir. A linha
 * emitida tinha "Editar nome"; a do rascunho, não.
 *
 * `renomearRelatorio` já roteava o rascunho para `salvarRascunho` (que
 * reescreve o registro E o índice local). Faltava só a porta na tela.
 */
describe('gate · a linha do rascunho oferece renomear', () => {
  const tela = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
  const linhaRascunho = tela.slice(
    tela.indexOf('title="Continuar editando"'),
    tela.indexOf('title="Excluir rascunho definitivamente"'),
  );

  it('o botão existe entre "continuar editando" e "excluir"', () => {
    expect(linhaRascunho).toContain('title="Editar nome"');
    expect(linhaRascunho).toContain('setRenomeando({ id: r.id, tag: r.tag');
  });

  it('o modal de renome não depende mais do item da PROJEÇÃO', () => {
    // `RascunhoItem` tem `id`; `ItemRelatorio` tem `relatorioId`. Guardar o item
    // inteiro no estado impedia as duas linhas de usarem o mesmo modal.
    expect(tela).toContain('useState<{ id: string; tag: string; nome: string } | null>(null)');
    expect(tela).toContain('renomearRelatorio(renomeando.id, renomeando.tag, nome)');
    expect(tela).not.toContain('renomeando.item');
  });

  it('renomear atualiza as DUAS listas em memória', () => {
    expect(tela).toContain('atuais.map((i) => (i.relatorioId === renomeando.id ? { ...i, nome } : i))');
    expect(tela).toContain('atuais.map((i) => (i.id === renomeando.id ? { ...i, nome } : i))');
  });

  it('a linha emitida continua com o seu renomear', () => {
    expect(tela).toContain('setRenomeando({ id: r.relatorioId, tag: r.tag');
  });
});
