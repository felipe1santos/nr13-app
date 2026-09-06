import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { previaProntuarioAtual, previaProntuarioConfigurada, CHAVE_PREVIA_PRONTUARIO } from '../previaProntuario';
import { secoesDoProntuario } from '../../relatorios/pdfVetorial/folhasProntuario';
import type { ModeloProntuario } from '../../relatorios/pdfVetorial/modeloProntuario';

/**
 * O prontuário no layout do relatório — e o croqui que só existe para vaso.
 *
 * O documento passou a ter capa, sumário com página real, o mesmo cabeçalho
 * (trocando só a linha que diz qual documento é), a mesma grade de espessuras
 * com realce e o memorial em álgebra. O que muda em relação ao relatório é a
 * ORDEM e o conteúdo — o desenho é o mesmo, porque os dois documentos saem da
 * mesma empresa para o mesmo equipamento.
 */

const modelo = (tipo: string): ModeloProntuario =>
  ({
    tipoEquipamento: tipo,
    croqui: { longitudinal: '<svg/>', transversal: '<svg/>', detalheTampo: null },
  }) as unknown as ModeloProntuario;

describe('o croqui 2D é do VASO — caldeira e autoclave ficam sem ele', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhasProntuario.ts', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarProntuario.ts', 'utf8');

  it('as folhas de croqui e de dados só são emitidas para vaso', () => {
    expect(gerador).toContain("if (m.tipoEquipamento === 'vaso')");
    const trecho = gerador.slice(gerador.indexOf("if (m.tipoEquipamento === 'vaso')"), gerador.indexOf('secao(() => folhaProntProntuario'));
    expect(trecho).toContain('folhaProntCroqui');
    expect(trecho).toContain('folhaProntFolhaDados');
  });

  it('o desenho na folha de ultrassom também é condicionado ao tipo', () => {
    // Um equipamento que já foi vaso e virou caldeira ainda tem
    // `nr13_croqui2d_<TAG>` gravado. Sem a condição, o desenho antigo apareceria
    // num prontuário de caldeira — geometria que não é a do equipamento.
    expect(folhas).toContain("if (m.tipoEquipamento === 'vaso' && m.croqui.longitudinal)");
  });

  it('o sumário não anuncia croqui em caldeira nem em autoclave', () => {
    expect(secoesDoProntuario(modelo('vaso'))).toContain('Croqui 2D cotado');
    expect(secoesDoProntuario(modelo('vaso'))).toContain('Folha de dados');
    for (const tipo of ['caldeira', 'autoclave']) {
      const s = secoesDoProntuario(modelo(tipo));
      expect(s, tipo).not.toContain('Croqui 2D cotado');
      expect(s, tipo).not.toContain('Folha de dados');
      // O que sobra continua completo: ultrassom, prontuário, procedimentos e
      // memorial saem para todo tipo de equipamento.
      expect(s).toEqual([
        'Medição de espessura por ultrassom',
        'Prontuário do equipamento',
        'Procedimentos e dispositivos de segurança',
        'Resumo dos cálculos',
      ]);
    }
  });
});

describe('o mesmo design do relatório', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhasProntuario.ts', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarProntuario.ts', 'utf8');
  const primitivas = readFileSync('src/features/relatorios/pdfVetorial/primitivas.ts', 'utf8');

  it('tem capa e sumário, emitidos nessa ordem', () => {
    expect(folhas).toContain('export function folhaProntCapa');
    expect(folhas).toContain('export function folhaProntSumario');
    const i = gerador.indexOf('folhaProntCapa(doc, m)');
    const j = gerador.indexOf('folhaProntSumario(doc, m, paginas)');
    const k = gerador.indexOf('secao(() => folhaProntUltrassom');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
  });

  it('o cabeçalho diz PRONTUÁRIO — e não relatório de inspeção', () => {
    expect(gerador).toContain("titulo: 'PRONTUÁRIO DO EQUIPAMENTO — NR-13 N°'");
    // O default do cabeçalho continua o do relatório: nada muda lá.
    expect(primitivas).toContain("ctx.cabecalho.titulo ?? 'RELATÓRIO DE INSPEÇÃO DE SEGURANÇA NR-13 N°'");
  });

  it('a grade de espessuras usa o realce e os ângulos do relatório', () => {
    expect(folhas).toContain('extremosDaRegiao');
    expect(folhas).toContain("destaque: 'menor'");
    expect(folhas).toContain("destaque: 'maior'");
    expect(folhas).toContain('MENOR VALOR');
    expect(folhas).toContain('ESP. MÍN. REQUERIDA');
  });

  it('o memorial sai em álgebra, não em LaTeX cru', () => {
    expect(folhas).toContain('formulaDoLatex(linha)');
    expect(folhas).toContain('doc.formula(formula');
  });

  it('o respiro existe, e não nas folhas que terminam em assinatura', () => {
    // O bloco de responsabilidade técnica pede 30 mm contíguos: crescer as
    // linhas de uma folha assinada empurra a assinatura para uma página só
    // dela — foi o que apareceu no prontuário do vaso em 06/09/2026.
    expect(folhas).toContain("doc.abrirSecaoElastica('pront-sumario')");
    expect(folhas).not.toContain("doc.abrirSecaoElastica('pront-ultrassom')");
    expect(folhas).not.toContain("doc.abrirSecaoElastica('pront-dados')");
    expect(gerador).toContain('aoFecharSecaoElastica');
    expect(gerador).toContain("new Documento(p, cab, totalDoRodape, 'final', {}, respiro)");
  });

  it('o sumário recebe a página real, colhida na 1ª passagem', () => {
    expect(gerador).toContain('paginasDasSecoes');
    expect(gerador).toContain('registrar.set(titulos[i], inicio)');
  });
});

describe('a prévia da tela é o documento', () => {
  const pagina = readFileSync('src/pages/Prontuarios.tsx', 'utf8');

  it('sem chave, a prévia é vetorial', () => {
    localStorage.clear();
    expect(previaProntuarioConfigurada()).toBe('vetorial');
    expect(previaProntuarioAtual('')).toBe('vetorial');
  });

  it('o rollback é um passo, e só a palavra exata', () => {
    expect(previaProntuarioAtual('?previaPront=iframe')).toBe('iframe');
    localStorage.setItem(CHAVE_PREVIA_PRONTUARIO, JSON.stringify({ previa: 'iframe' }));
    expect(previaProntuarioConfigurada()).toBe('iframe');
    // A URL vence a chave — é como se volta para o documento novo numa sessão.
    expect(previaProntuarioAtual('?previaPront=vetorial')).toBe('vetorial');
    localStorage.setItem(CHAVE_PREVIA_PRONTUARIO, JSON.stringify({ previa: 'qualquer' }));
    expect(previaProntuarioConfigurada()).toBe('vetorial');
  });

  it('com prévia vetorial a tela não monta iframe nem palco', () => {
    expect(pagina).toContain("{ pular: previaPront === 'vetorial' }");
    expect(pagina).toContain("previaPront === 'vetorial' ? (");
    expect(pagina).toContain('PreviaProntuarioVetorial');
  });

  it('imprimir sem emissão usa o MESMO gerador da emissão', () => {
    const trecho = pagina.slice(pagina.indexOf('async function prepararEImprimir'), pagina.indexOf('EMITIR: o prontuário vira ARQUIVO'));
    expect(trecho).toContain('gerarProntuarioVetorial(tag)');
    expect(trecho).toContain('abrirPdfEmAba');
  });
});
