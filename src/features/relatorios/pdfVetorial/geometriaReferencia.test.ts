import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALTURA_CABECALHO,
  ALTURA_RODAPE,
  BORDA_FINA,
  CAIXA,
  COR,
  FOLHA,
  FONTE,
  MARGEM,
  PT,
  alturaLinha,
} from './documentoA4';

/**
 * Fase 12B · o GATE DE GEOMETRIA contra a referência oficial.
 *
 * ## Por que ler o arquivo, e não copiar os números
 *
 * A referência é `docs/referencias/relatorio-nr13.html` — o mesmo arquivo que o
 * dono entregou, guardado no repo com o SHA registrado. Este teste **abre o
 * arquivo e extrai o CSS**: se alguém trocar a referência, ou mexer numa
 * constante do gerador, o teste quebra na hora, dizendo qual número divergiu.
 *
 * Copiar os valores para dentro do teste transformaria o gate numa cópia da
 * implementação: os dois concordariam para sempre, inclusive quando os dois
 * estivessem errados. É a diferença entre conferir e repetir.
 *
 * ## O que este teste NÃO faz
 *
 * Não compara pixels. Ele mede a GEOMETRIA declarada — folha, margens,
 * cabeçalho, rodapé, tipografia, tabela, fotos, assinaturas — que é onde as
 * diferenças grandes de posição, escala e quebra nascem. Comparação de imagem
 * fica no gate visual, que roda no navegador.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO = resolve(AQUI, '../../../../docs/referencias/relatorio-nr13.html');
const REFERENCIA = readFileSync(CAMINHO, 'utf8');

/**
 * O bloco de uma regra CSS, pelo seletor exato.
 *
 * `ocorrencia = -1` pega a ÚLTIMA declaração. Existe porque a referência declara
 * `.cartao-foto .slot` duas vezes, e é a segunda que fixa a altura de 74mm —
 * ler a primeira devolveria `height: auto` e o gate mediria a regra errada.
 */
function regra(seletor: string, ocorrencia = 0): string {
  const blocos: string[] = [];
  let de = 0;
  for (;;) {
    const i = REFERENCIA.indexOf(`\n${seletor} {`, de);
    if (i < 0) break;
    const abre = REFERENCIA.indexOf('{', i);
    const fecha = REFERENCIA.indexOf('}', abre);
    blocos.push(REFERENCIA.slice(abre + 1, fecha));
    de = fecha;
  }
  if (blocos.length === 0) throw new Error(`regra não encontrada na referência: ${seletor}`);
  return blocos[ocorrencia === -1 ? blocos.length - 1 : ocorrencia];
}

/** O valor de uma propriedade dentro de um bloco, como texto cru. */
function prop(bloco: string, nome: string): string {
  const m = bloco.match(new RegExp(`(?:^|;|\\n)\\s*${nome}\\s*:\\s*([^;}]+)`));
  if (!m) throw new Error(`propriedade ausente: ${nome}`);
  return m[1].trim();
}

/** Todos os números de uma propriedade, na ordem — `9mm 15mm 7mm 15mm` → [9,15,7,15]. */
function numeros(valor: string): number[] {
  return (valor.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

function mm(bloco: string, nome: string): number {
  return numeros(prop(bloco, nome))[0];
}

describe('a referência é a que foi validada', () => {
  it('o arquivo guardado no repo é o que o dono entregou', () => {
    const sha = createHash('sha256').update(readFileSync(CAMINHO)).digest('hex');
    expect(sha).toBe('52392e60347ca025e9ad98113cd931a9d959e0d1c75a676267bce06efbc21e95');
    expect(readFileSync(CAMINHO).byteLength).toBe(101_290);
  });
});

describe('folha e margens', () => {
  const folha = regra('.folha');

  it('A4 exato', () => {
    expect(mm(folha, 'width')).toBe(FOLHA.largura);
    expect(mm(folha, 'min-height')).toBe(FOLHA.altura);
  });

  it('margens externas 9 / 15 / 7 / 15 mm', () => {
    const [topo, direita, baixo, esquerda] = numeros(prop(folha, 'padding'));
    expect([topo, direita, baixo, esquerda]).toEqual([MARGEM.topo, MARGEM.direita, MARGEM.baixo, MARGEM.esquerda]);
  });

  it('a caixa útil sai das margens, não de um número solto', () => {
    expect(CAIXA.largura).toBe(FOLHA.largura - MARGEM.esquerda - MARGEM.direita);
    expect(CAIXA.largura).toBe(180);
    expect(CAIXA.altura).toBe(FOLHA.altura - MARGEM.topo - MARGEM.baixo);
  });
});

describe('cabeçalho', () => {
  const cab = regra('.cab');
  const logo = regra('.cab .logo-slot');

  it('a altura reservada = logo + respiro + régua', () => {
    const alturaLogo = mm(logo, 'height');
    const respiro = mm(cab, 'padding-bottom');
    const abaixoDaRegua = mm(cab, 'margin-bottom');
    expect(alturaLogo).toBe(14);
    expect(ALTURA_CABECALHO).toBe(alturaLogo + respiro + abaixoDaRegua);
  });

  it('a régua do cabeçalho é .6pt', () => {
    expect(numeros(prop(cab, 'border-bottom'))[0] * PT).toBeCloseTo(BORDA_FINA, 6);
    expect(prop(cab, 'border-bottom')).toContain('#808080');
    expect(COR.reguaCabecalho.toLowerCase()).toBe('#808080');
  });

  it('número do documento e "Página X de Y" nos tamanhos da referência', () => {
    expect(mm(regra('.cab .titulo-cab'), 'font-size')).toBe(FONTE.cabecalho);
    expect(mm(regra('.cab .titulo-cab .num-doc'), 'font-size')).toBe(FONTE.numDoc);
    expect(mm(regra('.cab .titulo-cab .pagina'), 'font-size')).toBe(FONTE.pagina);
  });
});

describe('rodapé', () => {
  const rod = regra('.rod');

  it('régua, respiro e três linhas — com o line-height da referência', () => {
    const acima = mm(rod, 'margin-top');
    const abaixo = mm(rod, 'padding-top');
    const tamanho = mm(rod, 'font-size');
    const fator = numeros(prop(rod, 'line-height'))[0];
    expect(tamanho).toBe(FONTE.rodape);
    // A altura reservada precisa caber as TRÊS linhas do rodapé no espaçamento
    // da referência (1.35), senão o texto encosta na borda do papel.
    expect(ALTURA_RODAPE).toBeCloseTo(acima + abaixo + 3 * alturaLinha(tamanho, fator), 4);
  });
});

describe('tipografia', () => {
  it('corpo do documento em 10pt', () => {
    expect(mm(regra('body'), 'font-size')).toBe(FONTE.base);
  });

  it('capa: título, subtítulo e sigla', () => {
    expect(mm(regra('h1.titulo-doc'), 'font-size')).toBe(FONTE.tituloDoc);
    expect(mm(regra('h2.subtitulo-doc'), 'font-size')).toBe(FONTE.subtituloDoc);
    expect(mm(regra('p.doc-sigla'), 'font-size')).toBe(FONTE.sigla);
  });

  it('seções e subtítulos', () => {
    expect(mm(regra('h3.secao'), 'font-size')).toBe(FONTE.secao);
    expect(mm(regra('h4.sub'), 'font-size')).toBe(9.5);
  });

  it('banner e faixa', () => {
    expect(mm(regra('.banner'), 'font-size')).toBe(FONTE.banner);
    expect(mm(regra('.faixa'), 'font-size')).toBe(FONTE.faixa);
  });

  it('nota e mini', () => {
    expect(mm(regra('.nota'), 'font-size')).toBe(FONTE.nota);
    expect(mm(regra('.mini'), 'font-size')).toBe(FONTE.mini);
  });
});

describe('espaçamento vertical de banner e faixa', () => {
  it('o banner tem 3mm acima e 1.2mm abaixo', () => {
    const [acima, , abaixo] = numeros(prop(regra('.banner'), 'margin'));
    expect(acima).toBe(3);
    expect(abaixo).toBe(1.2);
  });

  it('a faixa tem 2.4mm acima e nada abaixo', () => {
    const [acima, , abaixo] = numeros(prop(regra('.faixa'), 'margin'));
    expect(acima).toBe(2.4);
    expect(abaixo).toBe(0);
  });

  it('a seção tem 3.4mm acima e 1.2mm abaixo', () => {
    const [acima, , abaixo] = numeros(prop(regra('h3.secao'), 'margin'));
    expect(acima).toBe(3.4);
    expect(abaixo).toBe(1.2);
  });
});

describe('tabelas', () => {
  const celula = regra('table.tb th, table.tb td');
  const compacta = regra('table.tb.compacta th, table.tb.compacta td');

  it('padding da célula: .6mm × 1.4mm', () => {
    const [py, px] = numeros(prop(celula, 'padding'));
    expect([py, px]).toEqual([0.6, 1.4]);
  });

  it('padding da célula compacta: .45mm × 1.2mm', () => {
    const [py, px] = numeros(prop(compacta, 'padding'));
    expect([py, px]).toEqual([0.45, 1.2]);
  });

  it('tamanhos de fonte da tabela', () => {
    expect(mm(celula, 'font-size')).toBe(FONTE.tabela);
    expect(mm(compacta, 'font-size')).toBe(FONTE.tabelaCompacta);
  });

  it('borda .6pt e as três cores da grade', () => {
    expect(numeros(prop(celula, 'border'))[0] * PT).toBeCloseTo(BORDA_FINA, 6);
    expect(prop(celula, 'border')).toContain('#808080');
    expect(prop(regra('table.tb th'), 'background')).toBe('#d9d9d9');
    expect(prop(regra('table.tb td.rotulo'), 'background')).toBe('#f2f2f2');
    expect(COR.bordaTabela.toLowerCase()).toBe('#808080');
    expect(COR.fundoCabecalhoTabela.toLowerCase()).toBe('#d9d9d9');
    expect(COR.fundoRotulo.toLowerCase()).toBe('#f2f2f2');
  });

  it('a coluna de rótulo ocupa 38% da tabela', () => {
    expect(numeros(prop(regra('table.tb td.rotulo'), 'width'))[0]).toBe(38);
  });
});

describe('cor dos valores e dos campos vazios', () => {
  it('valor preenchido em azul-escuro', () => {
    expect(prop(regra('.campo'), 'color')).toBe('#1B3A6B');
    expect(COR.valor).toBe('#1B3A6B');
  });

  it('campo vazio em amarelo-claro — e só na tela', () => {
    expect(prop(regra('.campo.vazio'), 'background')).toBe('#FFF8C4');
    // Na impressão a referência apaga o fundo. A mesma regra vale para nós.
    const impressao = REFERENCIA.slice(REFERENCIA.indexOf('@media print'));
    expect(impressao).toContain('.campo, .campo:focus { background: transparent !important; }');
  });
});

describe('áreas de foto e assinatura', () => {
  it('as alturas de foto da referência', () => {
    expect(mm(regra('.foto-capa'), 'height')).toBe(92);
    expect(mm(regra('.foto-larga'), 'height')).toBe(62);
    expect(mm(regra('.cartao-foto .slot', -1), 'height')).toBe(74);
    expect(mm(regra('.slot-assin'), 'height')).toBe(16);
  });

  it('a grade de fotos é 2 colunas com 4mm de gap', () => {
    expect(prop(regra('.grade-fotos'), 'grid-template-columns')).toBe('1fr 1fr');
    expect(mm(regra('.grade-fotos'), 'gap')).toBe(4);
  });

  it('assinaturas: duas colunas, 8mm de gap, 6mm acima', () => {
    const assin = regra('.assinaturas');
    expect(prop(assin, 'grid-template-columns')).toBe('1fr 1fr');
    expect(mm(assin, 'gap')).toBe(8);
    expect(mm(assin, 'margin-top')).toBe(6);
  });

  it('a moldura da foto é .6pt e cinza-claro', () => {
    expect(prop(regra('.slot.tem-img'), 'border')).toContain('#d0d0d0');
    expect(COR.bordaFoto.toLowerCase()).toBe('#cfcfcf');
  });
});
