import { describe, expect, it } from 'vitest';
import { limparNomeDocumento, nomeDoDocumento, nomeSugerido } from './nomeDocumento';

describe('nomeSugerido', () => {
  it('monta Relatorio_<Tipo>_<TAG>.pdf com os espaços do tipo trocados', () => {
    expect(nomeSugerido('Inspeção Periódica', 'ZZ-FASE3')).toBe(
      'Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf',
    );
  });

  it('não quebra sem tipo nem TAG — o nome é etiqueta, não pode faltar', () => {
    expect(nomeSugerido('', '')).toBe('Relatorio_Inspecao_SEM-TAG.pdf');
  });
});

describe('limparNomeDocumento', () => {
  it('tira o que o sistema de arquivos recusa', () => {
    // A barra é o caso caro: em `<a download>` ela é separador de diretório.
    expect(limparNomeDocumento('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.pdf');
  });

  it('acrescenta a extensão quando falta e não duplica quando existe', () => {
    // O hífen FICA: toda TAG deste sistema tem um (ZZ-FASE3, V-101).
    expect(limparNomeDocumento('Vaso V-101')).toBe('Vaso V-101.pdf');
    expect(limparNomeDocumento('Vaso.pdf')).toBe('Vaso.pdf');
    expect(limparNomeDocumento('Vaso.PDF')).toBe('Vaso.pdf');
  });

  it('não deixa ponto duplo ao completar a extensão', () => {
    expect(limparNomeDocumento('meu relatório.')).toBe('meu relatório.pdf');
  });

  it('devolve null no vazio — nunca um nome inventado', () => {
    expect(limparNomeDocumento('')).toBeNull();
    expect(limparNomeDocumento('   ')).toBeNull();
    expect(limparNomeDocumento('///')).toBeNull();
    expect(limparNomeDocumento('.pdf')).toBeNull();
  });

  it('corta em 120 caracteres contando a extensão', () => {
    const saida = limparNomeDocumento('X'.repeat(400))!;
    expect(saida.length).toBeLessThanOrEqual(120);
    expect(saida.endsWith('.pdf')).toBe(true);
  });
});

describe('nomeDoDocumento', () => {
  it('usa o que o usuário escolheu', () => {
    expect(nomeDoDocumento('Laudo do vaso 101', 'Inspeção Periódica', 'V-101')).toBe(
      'Laudo do vaso 101.pdf',
    );
  });

  it('cai no sugerido quando não há escolha — e quando a escolha some ao limpar', () => {
    expect(nomeDoDocumento(null, 'Inspeção Inicial', 'V-101')).toBe(
      'Relatorio_Inspeção_Inicial_V-101.pdf',
    );
    expect(nomeDoDocumento('   ', 'Inspeção Inicial', 'V-101')).toBe(
      'Relatorio_Inspeção_Inicial_V-101.pdf',
    );
  });
});
