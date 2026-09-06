import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { extremosDaRegiao } from './folhas';
import { corDeFundo } from './documento';
import { COR } from './documentoA4';

/**
 * A grade de espessuras: o que o leitor precisa achar em um segundo.
 *
 * Numa região com 7 pontos × 4 ângulos são 28 números. A MENOR leitura é a que
 * decide a vida remanescente do equipamento, e ela some no meio dos outros 27.
 * O realce é conteúdo do documento — vale na prévia e no PDF emitido.
 */

describe('a maior e a menor leitura de uma região', () => {
  const regiao = [
    { medidas: ['6,00', '6,04', '5,94', '5,91'] },
    { medidas: ['5,98', '5,93', '6,22', '6,16'] },
    { medidas: ['6,24', '6,20', '6,35', '6,30'] },
  ];

  it('acha os extremos aceitando vírgula e ponto', () => {
    expect(extremosDaRegiao(regiao)).toEqual({ maior: 6.35, menor: 5.91 });
    expect(extremosDaRegiao([{ medidas: ['6.10', '5.80'] }])).toEqual({ maior: 6.1, menor: 5.8 });
  });

  it('célula vazia, travessão ou texto não vira extremo', () => {
    expect(extremosDaRegiao([{ medidas: ['6,00', '', '—', 'n/a', '5,50'] }])).toEqual({ maior: 6, menor: 5.5 });
  });

  it('com uma leitura só não há maior nem menor — destacar tudo não informa nada', () => {
    expect(extremosDaRegiao([{ medidas: ['6,00'] }])).toEqual({ maior: null, menor: null });
    expect(extremosDaRegiao([])).toEqual({ maior: null, menor: null });
  });

  it('os extremos são POR REGIÃO, não do documento inteiro', () => {
    // O desgaste se lê dentro do costado, dentro do tampo. Comparar o tampo com
    // o casco marcaria a região errada como crítica.
    const tampo = extremosDaRegiao([{ medidas: ['6,32', '6,23'] }]);
    const casco = extremosDaRegiao([{ medidas: ['5,92', '5,86'] }]);
    expect(tampo.menor).toBe(6.23);
    expect(casco.menor).toBe(5.86);
  });
});

describe('as cores do realce', () => {
  it('maior: azul-petróleo sobre azul claro; menor: vermelho sobre vermelho claro', () => {
    expect(corDeFundo({ texto: '6,35', valor: true, destaque: 'maior' }, 'final')).toBe(COR.fundoMaiorEspessura);
    expect(corDeFundo({ texto: '5,91', valor: true, destaque: 'menor' }, 'final')).toBe(COR.fundoMenorEspessura);
    expect(COR.textoMaiorEspessura).toBe('#0b4f60');
    expect(COR.textoMenorEspessura).toBe('#a11c1c');
  });

  it('o realce sobrevive ao documento emitido — não é marcação de revisão', () => {
    for (const modo of ['preview', 'final'] as const) {
      expect(corDeFundo({ texto: '6,35', valor: true, destaque: 'maior' }, modo)).toBe(COR.fundoMaiorEspessura);
    }
  });

  it('o realce é desenhado em NEGRITO e com a cor própria', () => {
    const documento = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
    expect(documento).toContain("cel.rotulo || cel.destaque ? 'bold' : 'normal'");
    expect(documento).toContain('COR.textoMaiorEspessura');
    expect(documento).toContain('COR.textoMenorEspessura');
  });
});

describe('a grade vem das Inspeções e é editável no documento', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
  const pagina = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('cada leitura tem id próprio — o clique na célula abre o editor', () => {
    expect(folhas).toContain('${pref}.m${i}');
    expect(folhas).toContain('${pref}.menor');
    expect(folhas).toContain('${pref}.requerida');
  });

  it('o botão "Medições" saiu da barra na prévia vetorial', () => {
    // A grade é PUXADA da seção Inspeções; um botão no topo para redigitá-la
    // criava uma segunda verdade para o mesmo número.
    const trecho = pagina.slice(pagina.indexOf('setModalMedicoes(true)') - 400, pagina.indexOf('setModalMedicoes(true)') + 120);
    expect(trecho).toContain("papelDaPrevia(fluxo) !== 'previa-vetorial'");
  });
});

describe('o respiro das folhas curtas', () => {
  const documento = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');

  it('a sobra é medida na 1ª passagem e distribuída na 2ª — sem passagem nova', () => {
    expect(gerador).toContain('aoFecharSecaoElastica');
    expect(gerador).toContain('respiro');
    // A 2ª passagem recebe o que a 1ª mediu.
    expect(gerador).toContain("opcoes.overrides ?? {}, respiro)");
  });

  it('a distribuição é conservadora: 0,9 da sobra e teto por linha', () => {
    // Distribuir a sobra inteira empurraria conteúdo para uma folha a mais, e
    // aí o "Página X de Y" contado na 1ª passagem passaria a mentir.
    expect(documento).toContain('Math.min(TETO_RESPIRO_LINHA, (medido.sobra * 0.9) / medido.linhas)');
    expect(documento).toContain('const TETO_RESPIRO_LINHA = 10');
  });

  it('as duas folhas curtas do relatório abrem e fecham a seção elástica', () => {
    for (const chave of ['ultrassom', 'documentacao']) {
      expect(folhas).toContain(`doc.abrirSecaoElastica('${chave}')`);
    }
    expect((folhas.match(/doc\.fecharSecaoElastica\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('o respiro nunca cria uma página a mais', () => {
  const documento = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');

  it('só a última folha da seção estica', () => {
    // Primeira versão esticava todas as folhas da seção: o conteúdo empurrado
    // ganhou uma página, e o rodapé — contado na 1ª passagem — passou a dizer
    // "Página 29 de 29" num PDF de 30. Medido em produção em 06/09/2026.
    expect(documento).toContain('medido.folhaFinal === this.folhaDaSecao');
    expect(documento).toContain('linhas: this.linhasNaFolhaAtual');
  });

  it('a folha da seção é contada em novaFolha', () => {
    expect(documento).toContain('this.folhaDaSecao++');
    expect(documento).toContain('this.linhasNaFolhaAtual = 0');
  });
});
