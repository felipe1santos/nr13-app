import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recomprimirFotosDoValor, maiorFotoDoValor } from './recompressorFoto';
import { ehChaveDeFoto } from './palco';

/**
 * A degradação existe para o documento CABER quando o orçamento de 3.368 KB
 * aperta. Enquanto ela só enxergava `nr13_fotos_`, no aperto recomprimia ~1 KB
 * de foto de capa e ignorava os ~2,7 MB de fotos de campo que chegam por
 * `nr13_inspecao_atual`/`nr13_injecao_atual` — as chaves que realmente pesam.
 */
const PIXEL = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
const MENOR = 'data:image/jpeg;base64,MENOR';

// `redesenhar` depende de canvas; aqui entra um dublê determinístico.
beforeEach(() => {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1200;
      height = 800;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toDataURL: () => MENOR,
  };
  vi.stubGlobal('document', { createElement: () => canvas });
});

describe('quais chaves a degradação alcança', () => {
  it('inclui as chaves de dados de campo, não só nr13_fotos_', () => {
    expect(ehChaveDeFoto('nr13_fotos_ACA 2040')).toBe(true);
    expect(ehChaveDeFoto('nr13_inspecao_atual')).toBe(true);
    expect(ehChaveDeFoto('nr13_injecao_atual')).toBe(true);
  });

  it('NÃO inclui chave de dado estruturado — degradar JSON de memorial corromperia o documento', () => {
    expect(ehChaveDeFoto('nr13_calc_ACA 2040')).toBe(false);
    expect(ehChaveDeFoto('nr13_info_ACA 2040')).toBe(false);
  });
});

describe('recompressão recursiva', () => {
  it('alcança foto aninhada no container de inspeção', async () => {
    const container = JSON.stringify({
      visual_externo: { fotos: [{ base64: PIXEL, descricao: 'trinca' }] },
      checklist: { fotosDocumentacao: [{ src: PIXEL }] },
    });

    const saida = JSON.parse(
      await recomprimirFotosDoValor(container, { qualidade: 0.6, largura: null }),
    );

    expect(saida.visual_externo.fotos[0].base64).toBe(MENOR);
    expect(saida.checklist.fotosDocumentacao[0].src).toBe(MENOR);
    expect(saida.visual_externo.fotos[0].descricao).toBe('trinca'); // resto intacto
  });

  it('continua funcionando no array plano do nr13_fotos_', async () => {
    const saida = JSON.parse(
      await recomprimirFotosDoValor(JSON.stringify([{ id: 1, src: PIXEL, isCapa: true }]), {
        qualidade: 0.6,
        largura: null,
      }),
    );
    expect(saida[0].src).toBe(MENOR);
    expect(saida[0].isCapa).toBe(true);
  });

  it('não toca em string que não é imagem', async () => {
    const saida = JSON.parse(
      await recomprimirFotosDoValor(JSON.stringify({ nome: 'trinca no casco', src: 'x.jpg' }), {
        qualidade: 0.6,
        largura: null,
      }),
    );
    expect(saida.src).toBe('x.jpg');
  });

  it('valor não-JSON volta intacto', async () => {
    expect(await recomprimirFotosDoValor('não é json', { qualidade: 0.6, largura: null })).toBe(
      'não é json',
    );
  });
});

describe('maior foto', () => {
  // 4000 chars de base64 = 3000 bytes de arquivo.
  const BYTES = 3000;

  it('mede os BYTES DO ARQUIVO, não o tamanho da string', () => {
    // O número é comparado com ORCAMENTO_IMG (110 KB), cujo propósito é barrar a
    // imagem que estoura o html2canvas. Medir a string em UTF-16 dava 2,67× o
    // arquivo (base64 infla 33%, UTF-16 dobra), então o teto valia ~41 KB de
    // JPEG. Em produção, 11/08/2026: uma foto de campo já degradada nos seis
    // passos mediu "117 KB" e o documento inteiro foi RECUSADO — o arquivo real
    // tinha ~44 KB e o total cabia no orçamento.
    expect(maiorFotoDoValor(JSON.stringify([{ src: PIXEL }]))).toBe(BYTES);
    expect(maiorFotoDoValor(JSON.stringify([{ src: PIXEL }]))).toBeLessThan(PIXEL.length * 2);
  });

  it('encontra a maior foto aninhada, não só no array plano', () => {
    const container = JSON.stringify({
      visual_interno: { fotos: [{ base64: PIXEL }] },
    });
    expect(maiorFotoDoValor(container)).toBe(BYTES);
  });

  it('a mesma imagem em `src` e `base64` conta UMA vez', () => {
    // A hidratação grava o dataURL nos dois campos; contar duas vezes faria a
    // degradação achar que existe uma foto do dobro do tamanho e degradar mais
    // do que o necessário.
    const um = JSON.stringify([{ src: PIXEL, base64: PIXEL }]);
    expect(maiorFotoDoValor(um)).toBe(BYTES);
  });

  it('desconta o padding do base64', () => {
    const comPad = 'data:image/jpeg;base64,' + 'A'.repeat(6) + '==';
    expect(maiorFotoDoValor(JSON.stringify([{ src: comPad }]))).toBe(4);
  });

  it('sem foto nenhuma devolve 0', () => {
    expect(maiorFotoDoValor('{"pmta":"1.2"}')).toBe(0);
  });
});
