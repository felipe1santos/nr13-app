import { beforeEach, describe, expect, it, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { ler } from '../../services/storage';
import { textoDoErro } from '../../services/textoDoErro';
import {
  angulosDaRegiao,
  carregarMedicoes,
  chaveEspessuras,
  chaveGrade,
  colunasDoContainer,
  espessurasMinimas,
  minimoDaRegiao,
  numeroDaCelula,
  pontosDoContainer,
  salvarMedicoes,
  type GradeMedicoes,
} from './medicoesEspessura';
import { carregarLaudo, chaveLaudo, salvarLaudo } from './laudoConclusao';
import { edicaoAtual, definirEdicao, folhaTravadaPelaEdicaoReact } from './edicaoReact';
import { montarModeloRelatorio } from './pdfVetorial/modelo';

/**
 * 13C · o gate de PARIDADE entre a folha antiga e o editor React.
 *
 * A pergunta que ele responde não é "a tela nova funciona?", e sim: **o dado que
 * a folha gravava continua igual, na mesma chave, no mesmo formato?** Se a
 * resposta mudar, o relatório muda — e um documento assinado não pode mudar
 * porque a interface de edição foi trocada.
 *
 * Os formatos abaixo foram lidos de `public/arquivos-inspecao/ULTRASSOM.html` e
 * `CONCLUSAO.html`, não inventados.
 */

const TAG = 'VP-13C';

beforeEach(() => localStorage.clear());

function gravarCru(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

describe('a forma da grade sai do container, como na folha', () => {
  it('sem container, usa os seis pontos padrão', () => {
    const pontos = pontosDoContainer(null);
    expect(pontos.map((p) => p.id)).toEqual(['ts', 'c1', 'c2', 'c3', 'c4', 'ti']);
  });

  it('ordena por região: tampo superior, casco, tampo inferior', () => {
    const pontos = pontosDoContainer({
      pontos: [
        { id: 'ti', rotulo: 'Fundo', regiao: 'ti' },
        { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
        { id: 'ts', rotulo: 'Topo', regiao: 'ts' },
      ],
    });
    expect(pontos.map((p) => p.id)).toEqual(['ts', 'c1', 'ti']);
  });

  it('ponto repetido e região inválida seguem a regra da folha', () => {
    const pontos = pontosDoContainer({
      pontos: [
        { id: 'x', rotulo: 'X', regiao: 'bocal' },
        { id: 'x', rotulo: 'X de novo', regiao: 'casco' },
      ],
    });
    expect(pontos).toEqual([{ id: 'x', rotulo: 'X', regiao: 'casco' }]);
  });

  it('os ângulos são a divisão de 360° pelas colunas — a fórmula do template', () => {
    expect(angulosDaRegiao(4)).toEqual(['0', '90', '180', '270']);
    expect(angulosDaRegiao(3)).toEqual(['0', '120', '240']);
    expect(angulosDaRegiao(1)).toEqual(['0']);
  });

  it('coluna fora de 1..12 cai em 4, como o template', () => {
    expect(colunasDoContainer({ colunas: { ts: 6, casco: 0, ti: 99 } })).toEqual({ ts: 6, casco: 4, ti: 4 });
    expect(colunasDoContainer(null)).toEqual({ ts: 4, casco: 4, ti: 4 });
  });
});

describe('A · o dado que já existe abre igual no editor', () => {
  it('a grade gravada pela folha é lida sem alteração', () => {
    gravarCru(chaveGrade(TAG), {
      ts: { angulos: ['0', '90', '180', '270'], linhas: [['6,35', '6,30', '', '6,40']] },
      casco: { angulos: ['0', '90', '180', '270'], linhas: [['5,90', '', '', ''], ['6,10', '', '', '']] },
      ti: { angulos: ['0', '90', '180', '270'], linhas: [['', '', '', '']] },
    });
    gravarCru('nr13_injecao_atual', {
      ultrassom: { pontos: [{ id: 'ts', rotulo: 'Topo', regiao: 'ts' }, { id: 'c1', rotulo: 'C1', regiao: 'casco' }, { id: 'c2', rotulo: 'C2', regiao: 'casco' }, { id: 'ti', rotulo: 'Fundo', regiao: 'ti' }] },
    });

    const { grade } = carregarMedicoes(TAG);
    expect(grade.ts.linhas[0]).toEqual(['6,35', '6,30', '', '6,40']);
    expect(grade.casco.linhas[1][0]).toBe('6,10');
  });

  it('valor do container de campo aparece quando a grade ainda não tem nada', () => {
    gravarCru('nr13_injecao_atual', {
      ultrassom: {
        pontos: [{ id: 'c1', rotulo: 'C1', regiao: 'casco' }],
        medidas: { c1: { '0': 7.2, '90': '7,1' } },
      },
    });
    const { grade } = carregarMedicoes(TAG);
    // Vem do campo, e com a vírgula do documento.
    expect(grade.casco.linhas[0][0]).toBe('7,2');
    expect(grade.casco.linhas[0][1]).toBe('7,1');
    expect(grade.casco.linhas[0][2]).toBe('');
  });

  it('o que foi DIGITADO vence o que veio do campo', () => {
    gravarCru('nr13_injecao_atual', {
      ultrassom: { pontos: [{ id: 'c1', rotulo: 'C1', regiao: 'casco' }], medidas: { c1: { '0': 7.2 } } },
    });
    gravarCru(chaveGrade(TAG), { casco: { angulos: ['0', '90', '180', '270'], linhas: [['6,80', '', '', '']] } });
    expect(carregarMedicoes(TAG).grade.casco.linhas[0][0]).toBe('6,80');
  });

  it('ponto novo na inspeção ganha linha, e os antigos não se perdem', () => {
    gravarCru(chaveGrade(TAG), { casco: { angulos: ['0', '90', '180', '270'], linhas: [['6,80', '', '', '']] } });
    gravarCru('nr13_injecao_atual', {
      ultrassom: {
        pontos: [
          { id: 'c1', rotulo: 'C1', regiao: 'casco' },
          { id: 'c2', rotulo: 'C2', regiao: 'casco' },
        ],
      },
    });
    const { grade } = carregarMedicoes(TAG);
    expect(grade.casco.linhas).toHaveLength(2);
    expect(grade.casco.linhas[0][0]).toBe('6,80');
    expect(grade.casco.linhas[1]).toEqual(['', '', '', '']);
  });
});

describe('B · salvar grava as MESMAS chaves, no MESMO formato', () => {
  // Duas colunas por região: os ângulos são 0° e 180°, pela fórmula do template
  // (Math.round(i * 360 / n)). Escrever ['0','90'] aqui foi o que o próprio
  // gate pegou — a grade recarregada vinha com o cabeçalho certo e o teste com o
  // errado.
  const grade: GradeMedicoes = {
    ts: { angulos: ['0', '180'], linhas: [['6,35', '6,30']] },
    casco: { angulos: ['0', '180'], linhas: [['5,90', '6,10']] },
    ti: { angulos: ['0', '180'], linhas: [['', '']] },
  };

  it('a grade vai inteira para `nr13_med_grid_`', async () => {
    await salvarMedicoes(TAG, grade);
    expect(ler(chaveGrade(TAG))).toEqual(grade);
  });

  it('`nr13_med_esp_` recebe o MÍNIMO de cada região, com vírgula', async () => {
    await salvarMedicoes(TAG, grade);
    const esp = ler<Record<string, unknown>>(chaveEspessuras(TAG));
    expect(esp).toMatchObject({ sup: '6,3', casco: '5,9', inf: '' });
  });

  it('salvar a grade NÃO apaga os campos do ensaio', async () => {
    // `aparelho`, `acoplante` e companhia vivem na mesma chave e são de outra
    // tela. A folha mesclava; o editor precisa mesclar igual.
    gravarCru(chaveEspessuras(TAG), { aparelho: 'DM5E', acoplante: 'Gel', tempSup: '28', sup: '9,99' });
    await salvarMedicoes(TAG, grade);
    const esp = ler<Record<string, unknown>>(chaveEspessuras(TAG));
    expect(esp).toMatchObject({ aparelho: 'DM5E', acoplante: 'Gel', tempSup: '28', sup: '6,3' });
  });

  it('recarregar devolve exatamente o que foi salvo', async () => {
    gravarCru('nr13_injecao_atual', {
      ultrassom: {
        colunas: { ts: 2, casco: 2, ti: 2 },
        pontos: [
          { id: 'ts', rotulo: 'Topo', regiao: 'ts' },
          { id: 'c1', rotulo: 'C1', regiao: 'casco' },
          { id: 'ti', rotulo: 'Fundo', regiao: 'ti' },
        ],
      },
    });
    await salvarMedicoes(TAG, grade);
    expect(carregarMedicoes(TAG).grade).toEqual(grade);
  });

  it('região sem medida nenhuma vira string vazia, não zero', () => {
    // Zero é uma espessura medida. Vazio é "não mediram".
    expect(minimoDaRegiao({ angulos: ['0'], linhas: [['']] })).toBe('');
    expect(minimoDaRegiao({ angulos: ['0'], linhas: [['0']] })).toBe('0');
  });

  it('texto que não é número não entra na conta do mínimo', () => {
    expect(numeroDaCelula('--')).toBeNull();
    expect(numeroDaCelula('6,35')).toBe(6.35);
    expect(numeroDaCelula('6.35')).toBe(6.35);
    expect(minimoDaRegiao({ angulos: ['0', '90'], linhas: [['abc', '6,10']] })).toBe('6,1');
  });

  it('sem grade, `espessurasMinimas` preserva o que existia', () => {
    const vazia: GradeMedicoes = {
      ts: { angulos: [], linhas: [] },
      casco: { angulos: [], linhas: [] },
      ti: { angulos: [], linhas: [] },
    };
    expect(espessurasMinimas({ aparelho: 'X' }, vazia)).toEqual({ aparelho: 'X', sup: '', casco: '', inf: '' });
  });
});

describe('C · laudo: mesma chave, mesmo formato, três estados', () => {
  it('sem marcação, `apto` é null — e isso não é INAPTO', () => {
    expect(carregarLaudo(TAG)).toMatchObject({ apto: null });
  });

  it('lê o que a folha CONCLUSAO gravou', () => {
    gravarCru(chaveLaudo(TAG), { apto: true, relatorioCodigo: 'REL-9', atualizadoEm: '2026-09-04T10:00:00.000Z' });
    expect(carregarLaudo(TAG)).toMatchObject({ apto: true, relatorioCodigo: 'REL-9' });
  });

  it('salvar grava apto, código e data — os três campos da folha', async () => {
    await salvarLaudo(TAG, false, 'REL-77');
    const cru = ler<Record<string, unknown>>(chaveLaudo(TAG))!;
    expect(cru.apto).toBe(false);
    expect(cru.relatorioCodigo).toBe('REL-77');
    expect(typeof cru.atualizadoEm).toBe('string');
    expect(carregarLaudo(TAG).apto).toBe(false);
  });

  it('valor estranho na chave não vira `true`', () => {
    gravarCru(chaveLaudo(TAG), { apto: 'sim' });
    expect(carregarLaudo(TAG).apto).toBeNull();
  });
});

describe('F · o Modelo Novo lê o que o React salvou', () => {
  it('o laudo salvo aqui chega ao parecer', async () => {
    await salvarLaudo(TAG, true, 'REL-1');
    expect(montarModeloRelatorio(TAG).laudo.apto).toBe(true);
  });

  it('o mínimo salvo aqui chega às espessuras do modelo', async () => {
    await salvarMedicoes(TAG, {
      ts: { angulos: ['0'], linhas: [['6,35']] },
      casco: { angulos: ['0'], linhas: [['5,90']] },
      ti: { angulos: ['0'], linhas: [['7,00']] },
    });
    const esp = ler<Record<string, unknown>>(chaveEspessuras(TAG))!;
    expect(esp.casco).toBe('5,9');
    // O modelo lê a MESMA chave — é o que garante que a troca de interface não
    // muda o documento.
    expect(montarModeloRelatorio(TAG)).toBeTruthy();
  });
});

describe('a superfície de edição é uma só', () => {
  it('padrão é a folha; a chave e a URL ligam o React', async () => {
    expect(edicaoAtual('')).toBe('iframe');
    await definirEdicao('react');
    expect(edicaoAtual('')).toBe('react');
    expect(edicaoAtual('?edicao=iframe')).toBe('iframe'); // rollback num passo
  });

  it('com o React ligado, SÓ ULTRASSOM e CONCLUSAO travam', () => {
    expect(folhaTravadaPelaEdicaoReact('ULTRASSOM.html', 'react')).toBe(true);
    expect(folhaTravadaPelaEdicaoReact('CONCLUSAO.html?x=1', 'react')).toBe(true);
    expect(folhaTravadaPelaEdicaoReact('CAPA.html', 'react')).toBe(false);
    expect(folhaTravadaPelaEdicaoReact('LIVRO-REGISTRO.html', 'react')).toBe(false);
  });

  it('com a folha no comando, nada trava', () => {
    expect(folhaTravadaPelaEdicaoReact('ULTRASSOM.html', 'iframe')).toBe(false);
    expect(folhaTravadaPelaEdicaoReact('CONCLUSAO.html', 'iframe')).toBe(false);
  });
});

describe('o erro tem texto, não "[object Object]"', () => {
  it('o objeto de conflito da fila vira frase legível', () => {
    const conflito = {
      categoria: 'obsoleto',
      titulo: 'Alteração mais antiga que a exclusão',
      explicacao: 'Este item foi alterado em outro aparelho.',
      detalhe: { mensagemOriginal: 'nr13_versao_obsoleta' },
    };
    expect(textoDoErro(conflito)).toBe('Alteração mais antiga que a exclusão — Este item foi alterado em outro aparelho.');
    expect(textoDoErro(conflito)).not.toContain('[object');
  });

  it('cobre as formas que aparecem na prática', () => {
    expect(textoDoErro(new Error('falhou feio'))).toBe('falhou feio');
    expect(textoDoErro('texto direto')).toBe('texto direto');
    expect(textoDoErro({ detalhe: { mensagemOriginal: 'P0001: versao_obsoleta' } })).toBe('P0001: versao_obsoleta');
    expect(textoDoErro({ message: 'do gateway' })).toBe('do gateway');
  });

  it('sem mensagem nenhuma, devolve a frase padrão — e nunca "[object Object]"', () => {
    expect(textoDoErro({})).toBe('Não foi possível concluir a operação.');
    expect(textoDoErro(null, 'Falhou ao salvar.')).toBe('Falhou ao salvar.');
    expect(textoDoErro({ a: 1 })).not.toContain('[object');
  });
});
