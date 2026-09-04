import { beforeEach, describe, expect, it } from 'vitest';
import {
  montarEntradaLivroDoRelatorio,
  montarEntradaLivroManual,
  ensaiosDoRelatorio,
  timestampDataLivro,
  expandirMemorial,
  type LivroEntrada,
} from '../relatoriosService';
import type { RelatorioSalvo } from '../tipos';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão de
// src/services/vencimentos.test.ts).
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

function calcCom(linhas: string[]): string {
  return JSON.stringify({ memorialHTML: '<div class="katex-render">' + linhas.join('<br>') + '</div>' });
}

describe('expandirMemorial — merge do GV do autoclave', () => {
  beforeEach(() => localStorage.clear());

  it('sem chave gv: paginação inalterada (to = nº de linhas do principal)', async () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a', 'linha b']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=3');
  });

  it('com nr13_calc_gv_<TAG>: linhas do GV entram após as do principal', async () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a']));
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=4');
  });

  it('gv sem principal: só as linhas do gv', async () => {
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=2');
  });
});

describe('ensaiosDoRelatorio — derivação dos ensaios das folhas', () => {
  it('mapeia as 4 folhas de ensaio, ignora as demais e a query string', async () => {
    expect(
      ensaiosDoRelatorio([
        'CAPA.html',
        'ULTRASSOM.html',
        'VISUAL-EXTERNO.html?tag=V1',
        'VISUAL-INTERNO.html',
        'TESTE-HIDROSTATICO.html',
        'MEMORIAL.html?part=1&of=2',
      ]),
    ).toEqual([
      'Medição de espessura (ultrassom)',
      'Exame visual externo',
      'Exame visual interno',
      'Teste hidrostático',
    ]);
  });

  it('deduplica e devolve vazio sem folhas de ensaio', async () => {
    expect(ensaiosDoRelatorio(['ULTRASSOM.html', 'ULTRASSOM.html'])).toEqual(['Medição de espessura (ultrassom)']);
    expect(ensaiosDoRelatorio(['CAPA.html'])).toEqual([]);
  });
});

describe('montarEntradaLivroDoRelatorio — MONTA a entrada, e NÃO escreve no livro (10B.2)', () => {
  beforeEach(() => localStorage.clear());

  function relatorioBase(codigo = 'REL-1'): RelatorioSalvo {
    return {
      id: codigo,
      tagVaso: 'V1',
      nome: `Relatorio_Inspecao_Periodica_V1.pdf`,
      tipo: 'Inspeção Periódica',
      data: '12/07/2026',
      documentos: ['CAPA.html', 'ULTRASSOM.html', 'LIVRO-REGISTRO.html'],
      meta: {
        codigo,
        emissao: '12/07/2026',
        validade: '',
        execucaoInspecao: '2026-07-10',
        proximaInspecaoInterna: '',
        proximaInspecaoExterna: '',
        validadeValvula: '',
        tipoInspecao: 'Inspeção Periódica',
        phNome: 'Eng. Teste',
        phCrea: '12345',
        tecnicoNome: 'Téc. Teste',
        documentos: ['CAPA.html', 'ULTRASSOM.html', 'TESTE-HIDROSTATICO.html', 'LIVRO-REGISTRO.html'],
      },
      status: 'Aprovado',
    };
  }

  it('monta tipoInspecao, ensaios (de meta.documentos), tecnicoNome e phId dos assinantes', async () => {
    localStorage.setItem('nr13_assinantes_rel_V1', JSON.stringify({ engenheiroId: 'ph-9', tecnicoId: null }));
    const entrada = (await montarEntradaLivroDoRelatorio(relatorioBase()))!;
    expect(entrada.tipoInspecao).toBe('Inspeção Periódica');
    expect(entrada.ensaios).toEqual(['Medição de espessura (ultrassom)', 'Teste hidrostático']);
    expect(entrada.tecnicoNome).toBe('Téc. Teste');
    expect(entrada.phId).toBe('ph-9');
  });

  it('NÃO grava no livro — finalizar relatório deixou de criar registro', async () => {
    await montarEntradaLivroDoRelatorio(relatorioBase());
    // A chave do livro oficial nem passa a existir. É ela que a projeção conta e
    // que o Portal lê: este é o acoplamento que a 10B.2 removeu.
    expect(localStorage.getItem('nr13_livro_V1')).toBeNull();
  });

  it('a entrada montada nasce RASCUNHO e sem lacre', async () => {
    const entrada = (await montarEntradaLivroDoRelatorio(relatorioBase()))!;
    expect(entrada.estado).toBe('rascunho');
    expect(entrada.lacrado).toBe(false);
    expect(entrada.sha256).toBeUndefined();
  });

  it('apto vem de nr13_laudo_<TAG> quando o relatorioCodigo bate; senão null', async () => {
    localStorage.setItem('nr13_laudo_V1', JSON.stringify({ apto: false, relatorioCodigo: 'REL-1', atualizadoEm: 'x' }));
    expect((await montarEntradaLivroDoRelatorio(relatorioBase('REL-1')))!.apto).toBe(false);
    // laudo de OUTRO relatório não contamina a entrada nova
    expect((await montarEntradaLivroDoRelatorio(relatorioBase('REL-2')))!.apto).toBeNull();
  });

  it('recusa montar quando o livro JÁ tem registro daquele relatório', async () => {
    const entrada = (await montarEntradaLivroDoRelatorio(relatorioBase('REL-1')))!;
    expect(entrada.relatorioCodigo).toBe('REL-1');
    expect(entrada.phNome).toBe('Eng. Teste');
    expect(entrada.origem).toBe('auto');

    // Registro já trancado no livro oficial: a guarda de duplicidade agora
    // RESPONDE `null`, em vez de não fazer nada em silêncio.
    localStorage.setItem('nr13_livro_V1', JSON.stringify([{ ...entrada, estado: 'trancado' }]));
    expect(await montarEntradaLivroDoRelatorio(relatorioBase('REL-1'))).toBeNull();
  });
});

describe('montarEntradaLivroManual — ocorrência manual no livro', () => {
  beforeEach(() => localStorage.clear());

  function ocorrenciaBase(sobrescrever: Partial<Parameters<typeof montarEntradaLivroManual>[0]> = {}) {
    return {
      data: '2026-07-12',
      tipoOcorrencia: 'Manutenção corretiva',
      oQueFoiFeito: 'Troca da válvula de segurança',
      descricao: 'Válvula apresentava vazamento no assento.',
      quemRealizou: 'Manutenção Industrial XYZ Ltda.',
      phId: null as string | null,
      ...sobrescrever,
    };
  }

  function entradaAutoFake(data: string, codigo: string): LivroEntrada {
    return {
      id: `LIV-${codigo}`,
      data,
      tipo: 'Inspeção Periódica',
      descricao: `Relatório de inspeção gerado: ${codigo}`,
      relatorioCodigo: codigo,
      phNome: 'Eng. Teste',
      phCrea: '12345',
      origem: 'auto',
      criadoEm: '2026-01-01T00:00:00.000Z',
    };
  }

  it('grava com origem manual, descrição combinada, sem relatorioCodigo e resolve phNome/phCrea do phId', async () => {
    localStorage.setItem(
      'nr13_lista_phs',
      JSON.stringify([{ id: 'ph-7', nome: 'Eng. Manual', crea: 'CREA-777', tipo: 'Engenheiro' }]),
    );
    const entrada = await montarEntradaLivroManual(ocorrenciaBase({ phId: 'ph-7' }));

    expect(entrada.origem).toBe('manual');
    expect(entrada.tipo).toBe('Manutenção corretiva');
    expect(entrada.descricao).toBe('Troca da válvula de segurança — Válvula apresentava vazamento no assento.');
    expect(entrada.relatorioCodigo).toBe('');
    expect(entrada.quemRealizou).toBe('Manutenção Industrial XYZ Ltda.');
    expect(entrada.phId).toBe('ph-7');
    expect(entrada.phNome).toBe('Eng. Manual');
    expect(entrada.phCrea).toBe('CREA-777');

    // Sem laudo de inspeção: entrada manual não tem apto nem ensaios.
    expect(entrada.apto).toBeUndefined();
    expect(entrada.ensaios).toBeUndefined();
    // 10B.2: montar NÃO grava. Quem grava é o rascunho, e depois o trancamento.
    expect(localStorage.getItem('nr13_livro_V1')).toBeNull();
  });

  it('sem phId (ou phId inexistente): sem assinatura, phNome/phCrea vazios', async () => {
    const semPh = await montarEntradaLivroManual(ocorrenciaBase({ phId: null }));
    expect(semPh.phNome).toBe('');
    expect(semPh.phCrea).toBe('');
    expect(semPh.phId).toBeUndefined();

    const phFantasma = await montarEntradaLivroManual(ocorrenciaBase({ phId: 'nao-existe' }));
    expect(phFantasma.phNome).toBe('');
    expect(phFantasma.phId).toBeUndefined();
  });

  it('NÃO toca no livro oficial — nem quando ele já tem entradas', async () => {
    const antes = JSON.stringify([entradaAutoFake('10/01/2026', 'REL-1'), entradaAutoFake('2026-06-20', 'REL-2')]);
    localStorage.setItem('nr13_livro_V1', antes);
    await montarEntradaLivroManual(ocorrenciaBase({ data: '2026-03-15' }));

    // Antes da 10B.2 esta chamada empurrava a entrada para dentro do array E O
    // REORDENAVA por data. As duas coisas saíram: reordenar um array com
    // entradas lacradas é recusado pelo gatilho `livro_imutavel.sql`, que exige
    // que a sequência lacrada nova comece exatamente pela antiga.
    expect(localStorage.getItem('nr13_livro_V1')).toBe(antes);
  });

  it('a ordenação por data continua existindo, para EXIBIR (não para gravar)', () => {
    // A tela ordena a timeline; o array guarda a ordem de TRANCAMENTO.
    expect(timestampDataLivro('10/01/2026')).toBeLessThan(timestampDataLivro('2026-06-20'));
    expect(timestampDataLivro('data-quebrada')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
