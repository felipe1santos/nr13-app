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

  it('a folha de croqui só é emitida para vaso', () => {
    expect(gerador).toContain("const temCroqui = m.tipoEquipamento === 'vaso'");
    expect(gerador).toContain('if (temCroqui) folhaProntCroqui(doc, m)');
  });

  it('a numeração da última folha acompanha a existência do croqui', () => {
    // Sem croqui, o memorial é a seção 4; com croqui, a 5. Um documento que
    // pula de "3" para "5" faz o leitor procurar a folha que não existe.
    expect(gerador).toContain('folhaProntMemorial(doc, m, temCroqui ? 5 : 4)');
  });

  it('as seções acompanham o tipo do equipamento', () => {
    expect(secoesDoProntuario(modelo('vaso'))).toEqual([
      'Identificação do equipamento',
      'Dados técnicos e categorização',
      'Medição de espessura por ultrassom',
      'Croqui 2D cotado e dimensões',
      'Memorial de cálculo',
    ]);
    for (const tipo of ['caldeira', 'autoclave']) {
      expect(secoesDoProntuario(modelo(tipo)), tipo).toEqual([
        'Identificação do equipamento',
        'Dados técnicos e categorização',
        'Medição de espessura por ultrassom',
        'Memorial de cálculo',
      ]);
    }
  });

  it('a folha de croqui existe só uma vez no arquivo de folhas', () => {
    expect((folhas.match(/export function folhaProntCroqui/g) ?? []).length).toBe(1);
  });
});

describe('modelo próprio: compacto, com UMA assinatura no fim', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhasProntuario.ts', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarProntuario.ts', 'utf8');
  const primitivas = readFileSync('src/features/relatorios/pdfVetorial/primitivas.ts', 'utf8');

  it('quatro ou cinco folhas — sem capa e sem sumário', () => {
    // Capa e sumário custavam duas folhas para anunciar quatro. O prontuário é
    // documento de consulta, não de leitura corrida.
    expect(folhas).not.toContain('folhaProntCapa');
    expect(folhas).not.toContain('folhaProntSumario');
    expect(gerador).not.toContain('folhaProntSumario');
    const chamadas = (gerador.match(/folhaPront[A-Za-z]+\(doc, m/g) ?? []).length;
    expect(chamadas).toBe(5); // identificação, dados, ultrassom, croqui, memorial
  });

  it('a assinatura sai UMA vez, na última folha', () => {
    expect((folhas.match(/responsabilidadeTecnica\(doc, m\)/g) ?? []).length).toBe(1);
    const memorial = folhas.slice(folhas.indexOf('export function folhaProntMemorial'));
    expect(memorial).toContain('responsabilidadeTecnica(doc, m)');
  });

  it('as folhas de croqui e de dados derivadas viraram UMA', () => {
    // A folha de dados tinha meia dúzia de campos e custava uma página.
    expect(folhas).not.toContain('folhaProntFolhaDados');
    expect(folhas).toContain('DADOS DERIVADOS DO MODELO');
  });

  it('o cabeçalho diz PRONTUÁRIO — e não relatório de inspeção', () => {
    expect(gerador).toContain("titulo: 'PRONTUÁRIO DO EQUIPAMENTO — NR-13 N°'");
    expect(primitivas).toContain("ctx.cabecalho.titulo ?? 'RELATÓRIO DE INSPEÇÃO DE SEGURANÇA NR-13 N°'");
  });

  it('a grade de espessuras usa o realce e os ângulos do relatório', () => {
    expect(folhas).toContain('extremosDaRegiao');
    expect(folhas).toContain("destaque: 'menor'");
    expect(folhas).toContain("destaque: 'maior'");
  });

  it('o memorial sai em álgebra, não em LaTeX cru', () => {
    expect(folhas).toContain('formulaDoLatex(linha)');
    expect(folhas).toContain('doc.formula(formula');
  });

  it('a prancha põe a vista principal ao lado das auxiliares', () => {
    expect(folhas).toContain('desenharPranchaDeVistas');
    expect(folhas).toContain('faixaEm');
    expect(folhas).toContain('#girado');
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
