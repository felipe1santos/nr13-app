import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { numeroDoTexto, pontosDaCurva } from '../../relatorios/pdfVetorial/graficoTh';

/**
 * A VÍRGULA NOS CAMPOS DE CAMPO — 10/09/2026.
 *
 * ## O defeito, medido no app
 *
 * Os campos numéricos do teste hidrostático e do ultrassom eram
 * `<input type="number">`. O navegador **recusa a vírgula** nesse tipo: o
 * técnico brasileiro digita `25,5`, o campo fica VAZIO e nada avisa.
 *
 * Consequência medida em produção, no formulário de TH: as três pressões e os
 * oito pontos da curva ficaram em branco. Sem pressão, `pontosDaCurva` devolve
 * `pressao: null` em tudo, `pontos.some(p => p.pressao !== null)` dá falso e
 * **o gráfico não é desenhado** — que era exatamente a queixa ("o TH não
 * chega ao relatório, principalmente o gráfico").
 *
 * A correção é `type="text" inputMode="decimal"`: aceita as duas formas, e o
 * teclado do celular continua abrindo numérico. Quem lê já normaliza.
 */

const TH = readFileSync('src/features/inspecoes/formularios/FormularioTH.tsx', 'utf8');
const US = readFileSync('src/features/inspecoes/formularios/FormularioUltrassom.tsx', 'utf8');

describe('nenhum campo de medição recusa a vírgula', () => {
  it('o teste hidrostático não tem mais `type="number"`', () => {
    expect(TH).not.toContain('type="number"');
  });

  it('o ultrassom não tem mais `type="number"`', () => {
    expect(US).not.toContain('type="number"');
  });

  it('os campos decimais declaram o teclado numérico do celular', () => {
    // `inputMode="decimal"` é o que mantém o teclado certo em campo — sem ele
    // a troca por `text` custaria o teclado alfabético no aparelho.
    for (const [nome, s] of [['TH', TH], ['US', US]] as const) {
      const decimais = (s.match(/inputMode="decimal"/g) ?? []).length;
      expect(decimais, nome).toBeGreaterThan(0);
    }
  });

  it('os cinco campos do TH que alimentam o gráfico aceitam vírgula', () => {
    for (const campo of ['pressaoProj', 'pressaoTrabalho', 'pressaoTeste']) {
      expect(TH, campo).toContain(`inputMode="decimal" value={dados.${campo}}`);
    }
    expect(TH).toContain('inputMode="decimal" value={linha.tempo}');
    expect(TH).toContain('inputMode="decimal" value={linha.pressao}');
  });
});

describe('quem lê aceita as duas formas', () => {
  it('a pressão de teste com vírgula não é truncada', () => {
    // Era `/[\d.]+/`: "25,5" casava só o "25", e a linha tracejada da pressão
    // de teste saía no lugar errado, num gráfico cujos pontos usam a mesma
    // escala.
    expect(numeroDoTexto('25,5')).toBe(25.5);
    expect(numeroDoTexto('25.5')).toBe(25.5);
    expect(numeroDoTexto('25,5 kgf/cm²')).toBe(25.5);
    expect(numeroDoTexto('')).toBeNull();
    expect(numeroDoTexto(null)).toBeNull();
    expect(numeroDoTexto('sem número')).toBeNull();
  });

  it('a curva aceita vírgula, e ponto sem pressão vira furo — não zero', () => {
    const p = pontosDaCurva([
      { tempo: '0', pressao: '0' },
      { tempo: '5', pressao: '8,5' },
      { tempo: '10', pressao: '17.0' },
      { tempo: '15', pressao: '' },
      { tempo: '', pressao: '25,5' },
    ]);
    // O ponto SEM TEMPO não existe para o gráfico.
    expect(p).toHaveLength(4);
    expect(p.map((x) => x.pressao)).toEqual([0, 8.5, 17, null]);
  });

  it('curva inteira com vírgula desenha — era este o gráfico que sumia', () => {
    const curva = [
      ['0', '0'],
      ['5', '8,5'],
      ['10', '17,0'],
      ['15', '25,5'],
      ['20', '25,5'],
      ['30', '25,4'],
      ['40', '17,0'],
      ['50', '0'],
    ].map(([tempo, pressao]) => ({ tempo, pressao }));
    const p = pontosDaCurva(curva);
    expect(p).toHaveLength(8);
    // A condição que decide se o gráfico é desenhado (`folhas.ts`).
    expect(p.some((x) => x.pressao !== null)).toBe(true);
    // E os patamares continuam patamares: a curva não é reta.
    expect(p.map((x) => x.pressao)).toEqual([0, 8.5, 17, 25.5, 25.5, 25.4, 17, 0]);
  });
});
