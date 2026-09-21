/**
 * O LAUDO PRECISA TER ONDE SER MARCADO (21/09/2026).
 *
 * ## O defeito, medido em produção
 *
 * O APTO/INAPTO mora em `nr13_laudo_<TAG>` e a finalização o exige quando o
 * relatório traz a folha de conclusão. Ele tinha duas superfícies: a folha
 * `CONCLUSAO.html` (clique no SIM/NÃO) e o painel React.
 *
 * A 13C amarrou o BOTÃO do painel à chave `nr13_edicao_react`, cujo padrão é
 * `iframe`. A 13E tornou a prévia VETORIAL o padrão — e parou de montar os
 * iframes. Na configuração padrão, nenhuma das duas superfícies existia:
 *
 *   prévia vetorial (padrão) + edição iframe (padrão) = laudo sem lugar
 *
 * Resultado no cliente: o botão "Finalizar relatório" some, sobra "Voltar e
 * revisar", e o relatório fica preso. Pior, quem clicava no quadro do parecer
 * dentro do documento escrevia "APTO" como TEXTO — o PDF passava a dizer APTO,
 * `nr13_laudo_` continuava vazio e o campo sumia de "O que falta", fechando o
 * último caminho de conserto.
 *
 * Este arquivo trava as duas pontas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fluxoDaTela, precisaPainelDeLaudo } from './fluxoDocumento';
import { DESTINO_POR_CAMPO, editaSoPeloPainel } from './destinoPendencia';
import { previaConfigurada } from './previaDocumento';
import { edicaoConfigurada } from './edicaoReact';

describe('sem folha para clicar, o painel do laudo é obrigatório', () => {
  it('o cruzamento PADRÃO (prévia vetorial + edição iframe) mostra o botão', () => {
    // É exatamente a configuração de quem nunca mexeu em nenhuma das chaves.
    const previa = previaConfigurada();
    const edicao = edicaoConfigurada();
    expect(previa).toBe('vetorial');
    expect(edicao).toBe('iframe');
    expect(precisaPainelDeLaudo(fluxoDaTela(previa, false), edicao)).toBe(true);
  });

  it('no fluxo de iframes o botão só aparece com a edição React — a folha resolve', () => {
    expect(precisaPainelDeLaudo('iframes', 'iframe')).toBe(false);
    expect(precisaPainelDeLaudo('iframes', 'react')).toBe(true);
  });

  it('no fluxo vetorial o botão aparece sempre', () => {
    expect(precisaPainelDeLaudo('vetorial', 'iframe')).toBe(true);
    expect(precisaPainelDeLaudo('vetorial', 'react')).toBe(true);
  });

  it('a tela usa a regra, e não a chave de edição sozinha', () => {
    const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    expect(tela).toContain('precisaPainelDeLaudo(fluxo, superficieEdicao)');
    // O botão do laudo não pode voltar para dentro do bloco que só existe na
    // superfície React.
    const i = tela.indexOf('precisaPainelDeLaudo(fluxo, superficieEdicao)');
    const trecho = tela.slice(i, i + 400);
    expect(trecho).toContain('setModalLaudo(true)');
  });
});

describe('o APTO/INAPTO não se escreve como texto no documento', () => {
  it('o campo do parecer é de painel, não de digitação', () => {
    expect(editaSoPeloPainel('parecer.laudo')).toBe(true);
    expect(editaSoPeloPainel('inspecao.resultado-ensaios')).toBe(true);
    expect(DESTINO_POR_CAMPO['parecer.laudo'].onde).toBe('laudo');
  });

  it('campo comum continua editável no documento', () => {
    expect(editaSoPeloPainel('parecer.justificativa')).toBe(false);
    expect(editaSoPeloPainel('objetivo.texto')).toBe(false);
    expect(editaSoPeloPainel('capa.art')).toBe(false);
  });

  it('a prévia roteia o clique desses campos para o painel', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    expect(previa).toContain('editaSoPeloPainel(c.id)');
    // E o editor de texto continua sendo o destino de todos os outros.
    expect(previa).toContain('setEmEdicao(c);');
  });
});
