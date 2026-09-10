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

/**
 * ...e o nome sobrevive ao "Salvar rascunho" seguinte.
 *
 * Medido em produção em 10/09/2026: o rascunho renomeado para "RELATORIO DA IA"
 * voltou a "Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf" no PRIMEIRO save depois
 * de reabrir, sem aviso nenhum. `nomeEscolhido` só era preenchido no modal de
 * finalizar; reabrir deixava o estado em `null`, e `montarRegistro` remontava o
 * registro com `nomeDoDocumento(null, ...)` — o nome automático. Renomear virava
 * trabalho que se perde sozinho.
 */
describe('gate · o nome escolhido volta com o documento', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('abrir um relatório recupera o nome gravado', () => {
    const abrir = tela.slice(tela.indexOf('let r = carregarRelatorio(item.id, item.tagVaso);'));
    const corpo = abrir.slice(0, abrir.indexOf('async function duplicar('));
    expect(corpo).toContain("setNomeEscolhido(r.nome?.trim() ? r.nome : null)");
    // ...e antes do bump de versão que remonta a tela.
    expect(corpo.indexOf('setNomeEscolhido')).toBeLessThan(corpo.indexOf('setVersao((v) => v + 1)'));
  });

  it('relatório NOVO e DUPLICADO nascem sem rótulo herdado', () => {
    expect(tela).toContain('// Nome AUTOMÁTICO: relatório novo não herda o rótulo de nenhum outro.');
    expect(tela).toContain('// O rótulo NÃO vem junto: o duplicado é outro documento, e herdar o nome');
    // Três chamadas: a de abrir e as duas que zeram.
    expect((tela.match(/setNomeEscolhido\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
