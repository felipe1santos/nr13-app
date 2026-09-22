/**
 * O CROQUI É DERIVADO DA MEDIÇÃO (21/09/2026).
 *
 * O que este arquivo trava:
 *  · o número de níveis do desenho é o número de REGIÕES do dado — 1, 3 ou 8,
 *    nunca o `N1/N2/N3` da referência;
 *  · os ângulos são os REAIS da região, e não quatro fixos;
 *  · cada ponto do desenho aponta para a linha certa da tabela 7.4;
 *  · célula vazia NÃO vira zero, e `0` informado não vira vazio;
 *  · o destaque usa a MESMA regra da tabela (`destaqueMedida.ts`).
 */
import { describe, expect, it } from 'vitest';
import { anguloDoTexto, modeloCroqui, regiaoDaLinha, type LinhaMedicao } from './croquiEspessura';
import { destaqueDaMedida, extremosDaRegiao, temMedida } from './destaqueMedida';

const linha = (p: Partial<LinhaMedicao> & { ponto: string }): LinhaMedicao => ({
  regiao: 'Casco',
  regiaoId: 'casco',
  angulos: ['0', '90', '180', '270'],
  medidas: ['', '', '', ''],
  menor: null,
  requerida: null,
  ...p,
});

describe('A · mínimo: uma região de casco, quatro pontos', () => {
  const m = modeloCroqui([linha({ ponto: 'Casco 1', medidas: ['9,12', '9,08', '9,15', '9,10'] })]);

  it('desenha UM nível, com os quatro pontos', () => {
    expect(m.casco).toHaveLength(1);
    expect(m.ts).toHaveLength(0);
    expect(m.ti).toHaveLength(0);
    expect(m.pontos).toHaveLength(4);
    expect(m.temAlgo).toBe(true);
  });

  it('cada ponto carrega id, ângulo e o valor como a tabela o imprime', () => {
    expect(m.pontos.map((p) => p.id)).toEqual(['C1-0', 'C1-90', 'C1-180', 'C1-270']);
    expect(m.pontos.map((p) => p.angulo)).toEqual([0, 90, 180, 270]);
    expect(m.pontos.map((p) => p.valor)).toEqual(['9,12', '9,08', '9,15', '9,10']);
    expect(m.pontos.every((p) => p.ponto === 'Casco 1')).toBe(true);
  });
});

describe('B · típico: tampo, três cascos e tampo inferior', () => {
  const linhas: LinhaMedicao[] = [
    linha({ regiao: 'Tampo superior', regiaoId: 'ts', ponto: 'Tampo Superior', medidas: ['9,41', '9,38', '9,45', '9,40'] }),
    linha({ ponto: 'Casco 1', medidas: ['8,99', '9,02', '9,00', '8,97'] }),
    linha({ ponto: 'Casco 2', medidas: ['8,93', '8,95', '8,90', '8,96'] }),
    linha({ ponto: 'Casco 3', medidas: ['9,05', '9,01', '9,03', '9,04'] }),
    linha({ regiao: 'Tampo inferior', regiaoId: 'ti', ponto: 'Tampo Inferior', medidas: ['9,30', '9,28', '9,33', '9,31'] }),
  ];
  const m = modeloCroqui(linhas);

  it('o croqui tem exatamente as regiões do dado', () => {
    expect(m.ts).toHaveLength(1);
    expect(m.casco).toHaveLength(3);
    expect(m.ti).toHaveLength(1);
    expect(m.casco.map((n) => n.sigla)).toEqual(['C1', 'C2', 'C3']);
  });

  it('QUANTIDADE DE PONTOS do desenho = quantidade de leituras da tabela', () => {
    const naTabela = linhas.flatMap((l) => l.medidas.filter(temMedida)).length;
    const noDesenho = m.pontos.filter((p) => p.valor !== null).length;
    expect(noDesenho).toBe(naTabela);
    expect(noDesenho).toBe(20);
  });

  it('a associação região/ângulo → id é inequívoca', () => {
    const achar = (id: string) => m.pontos.find((p) => p.id === id);
    expect(achar('C2-90')?.valor).toBe('8,95');
    expect(achar('C2-90')?.ponto).toBe('Casco 2');
    expect(achar('TS-180')?.valor).toBe('9,45');
    expect(achar('TI-270')?.valor).toBe('9,31');
    // Ids únicos: sem isso o croqui apontaria dois lugares para a mesma célula.
    expect(new Set(m.pontos.map((p) => p.id)).size).toBe(m.pontos.length);
  });
});

describe('C · oito regiões de casco', () => {
  const m = modeloCroqui(
    Array.from({ length: 8 }, (_, i) =>
      linha({ ponto: `Casco ${i + 1}`, medidas: ['8,50', '8,52', '8,49', '8,51'] }),
    ),
  );

  it('desenha oito níveis — nada de N1/N2/N3 fixo', () => {
    expect(m.casco).toHaveLength(8);
    expect(m.casco.map((n) => n.sigla)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
    expect(m.pontos).toHaveLength(32);
  });
});

describe('D e E · vazio não é zero, e zero não é vazio', () => {
  it('célula em branco vira ponto SEM valor, nunca 0,00', () => {
    const m = modeloCroqui([linha({ ponto: 'Casco 1', medidas: ['9,12', '', '—', '9,10'] })]);
    expect(m.pontos.map((p) => p.valor)).toEqual(['9,12', null, null, '9,10']);
    // O ponto continua existindo no desenho: a malha tem quatro posições.
    expect(m.pontos).toHaveLength(4);
    expect(m.pontos.filter((p) => p.valor === null)).toHaveLength(2);
  });

  it('zero DIGITADO é um valor informado, e aparece como tal', () => {
    const m = modeloCroqui([linha({ ponto: 'Casco 1', medidas: ['0', '', '9,10', '9,20'] })]);
    const zero = m.pontos[0];
    expect(zero.valor).toBe('0');
    expect(m.pontos[1].valor).toBeNull();
    // Mas ele NÃO entra no destaque: a regra da tabela só considera positivos,
    // e um zero virar "menor leitura" apontaria a parede inteira como crítica.
    expect(zero.destaque).toBeNull();
  });

  it('malha inteira sem leitura não produz folha', () => {
    const m = modeloCroqui([linha({ ponto: 'Casco 1' }), linha({ ponto: 'Casco 2' })]);
    expect(m.pontos).toHaveLength(8);
    expect(m.temAlgo).toBe(false);
  });
});

describe('ângulos reais, não quatro fixos', () => {
  it('três colunas viram 0°, 120° e 240°', () => {
    const m = modeloCroqui([
      linha({ ponto: 'Casco 1', angulos: ['0', '120', '240'], medidas: ['9,10', '9,20', '9,30'] }),
    ]);
    expect(m.casco[0].angulos).toEqual([0, 120, 240]);
    expect(m.pontos.map((p) => p.id)).toEqual(['C1-0', 'C1-120', 'C1-240']);
  });

  it('oito colunas viram os oito ângulos da referência', () => {
    const angulos = ['0', '45', '90', '135', '180', '225', '270', '315'];
    const m = modeloCroqui([linha({ ponto: 'Tampo Superior', regiao: 'Tampo superior', regiaoId: 'ts', angulos, medidas: angulos.map(() => '5,8') })]);
    expect(m.ts[0].angulos).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('ângulo ilegível não vira ponto inventado', () => {
    const m = modeloCroqui([linha({ ponto: 'Casco 1', angulos: ['0', 'x', '180'], medidas: ['9,1', '9,2', '9,3'] })]);
    expect(m.pontos.map((p) => p.id)).toEqual(['C1-0', 'C1-180']);
  });

  it('normaliza o texto do ângulo', () => {
    expect(anguloDoTexto('90')).toBe(90);
    expect(anguloDoTexto('90°')).toBe(90);
    expect(anguloDoTexto('360')).toBe(0);
    expect(anguloDoTexto('-90')).toBe(270);
    expect(anguloDoTexto('abc')).toBeNull();
  });
});

describe('o destaque é a MESMA regra da tabela', () => {
  const linhas = [
    linha({ ponto: 'Casco 1', medidas: ['9,12', '9,08', '9,15', '9,10'] }),
    linha({ ponto: 'Casco 2', medidas: ['8,93', '8,95', '8,90', '8,96'] }),
  ];
  const m = modeloCroqui(linhas);

  it('menor e maior do croqui coincidem com os da tabela', () => {
    const { maior, menor } = extremosDaRegiao(linhas);
    for (const p of m.pontos) {
      const daTabela = destaqueDaMedida(p.valor, maior, menor).destaque ?? null;
      expect(p.destaque).toBe(daTabela);
    }
    expect(m.pontos.filter((p) => p.destaque === 'menor').map((p) => p.id)).toEqual(['C2-180']);
    expect(m.pontos.filter((p) => p.destaque === 'maior').map((p) => p.id)).toEqual(['C1-180']);
  });

  it('abaixo da espessura mínima requerida é marcado como crítico', () => {
    const m2 = modeloCroqui([
      linha({ ponto: 'Casco 1', medidas: ['9,12', '7,90', '9,15', '9,10'], requerida: '8,00' }),
    ]);
    expect(m2.pontos.filter((p) => p.critico).map((p) => p.id)).toEqual(['C1-90']);
  });

  it('sem espessura requerida, nada é crítico — não se inventa reprovação', () => {
    const m2 = modeloCroqui([linha({ ponto: 'Casco 1', medidas: ['1,00', '2,00', '3,00', '4,00'] })]);
    expect(m2.pontos.some((p) => p.critico)).toBe(false);
  });
});

describe('espessura mínima na legenda', () => {
  it('sai por região quando a região inteira tem o mesmo valor', () => {
    const m = modeloCroqui([
      linha({ ponto: 'Casco 1', medidas: ['9,1', '9,2', '9,3', '9,4'], requerida: '8,00' }),
      linha({ ponto: 'Casco 2', medidas: ['9,1', '9,2', '9,3', '9,4'], requerida: '8,00' }),
    ]);
    expect(m.requeridas).toEqual([{ regiao: 'casco', rotulo: 'Costado', valor: '8,00' }]);
  });

  it('requeridas DIFERENTES na mesma região não viram um número só', () => {
    const m = modeloCroqui([
      linha({ ponto: 'Casco 1', medidas: ['9,1', '9,2', '9,3', '9,4'], requerida: '8,00' }),
      linha({ ponto: 'Casco 2', medidas: ['9,1', '9,2', '9,3', '9,4'], requerida: '7,50' }),
    ]);
    expect(m.requeridas).toEqual([]);
  });

  it('tampo e casco com mínimos diferentes saem separados', () => {
    const m = modeloCroqui([
      linha({ regiao: 'Tampo superior', regiaoId: 'ts', ponto: 'Tampo Superior', medidas: ['5,8', '5,7', '5,2', '5,2'], requerida: '4,50' }),
      linha({ ponto: 'Casco 1', medidas: ['8,0', '8,1', '8,0', '8,0'], requerida: '6,20' }),
    ]);
    expect(m.requeridas).toEqual([
      { regiao: 'ts', rotulo: 'Tampo superior', valor: '4,50' },
      { regiao: 'casco', rotulo: 'Costado', valor: '6,20' },
    ]);
  });
});

describe('relatório antigo, sem `regiaoId`', () => {
  it('a região sai do título impresso — o croqui não perde o tampo', () => {
    expect(regiaoDaLinha({ regiao: 'Tampo superior', ponto: '', angulos: [], medidas: [], menor: null, requerida: null })).toBe('ts');
    expect(regiaoDaLinha({ regiao: 'TAMPO INFERIOR', ponto: '', angulos: [], medidas: [], menor: null, requerida: null })).toBe('ti');
    expect(regiaoDaLinha({ regiao: 'Casco', ponto: '', angulos: [], medidas: [], menor: null, requerida: null })).toBe('casco');
  });
});
