import { beforeEach, describe, expect, it } from 'vitest';
import {
  adicionarEntradaLivroAuto,
  adicionarEntradaLivroManual,
  ensaiosDoRelatorio,
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

describe('adicionarEntradaLivroAuto — campos novos da entrada', () => {
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

  it('grava tipoInspecao, ensaios (de meta.documentos), tecnicoNome e phId dos assinantes', async () => {
    localStorage.setItem('nr13_assinantes_rel_V1', JSON.stringify({ engenheiroId: 'ph-9', tecnicoId: null }));
    await adicionarEntradaLivroAuto(relatorioBase());
    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro).toHaveLength(1);
    expect(livro[0].tipoInspecao).toBe('Inspeção Periódica');
    expect(livro[0].ensaios).toEqual(['Medição de espessura (ultrassom)', 'Teste hidrostático']);
    expect(livro[0].tecnicoNome).toBe('Téc. Teste');
    expect(livro[0].phId).toBe('ph-9');
  });

  it('apto vem de nr13_laudo_<TAG> quando o relatorioCodigo bate; senão null', async () => {
    localStorage.setItem('nr13_laudo_V1', JSON.stringify({ apto: false, relatorioCodigo: 'REL-1', atualizadoEm: 'x' }));
    await adicionarEntradaLivroAuto(relatorioBase('REL-1'));
    let livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro[0].apto).toBe(false);

    // laudo de OUTRO relatório não contamina a entrada nova
    await adicionarEntradaLivroAuto(relatorioBase('REL-2'));
    livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro[1].apto).toBeNull();
  });

  it('não duplica entrada do mesmo relatório e mantém campos antigos', async () => {
    await adicionarEntradaLivroAuto(relatorioBase('REL-1'));
    await adicionarEntradaLivroAuto(relatorioBase('REL-1'));
    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro).toHaveLength(1);
    expect(livro[0].relatorioCodigo).toBe('REL-1');
    expect(livro[0].phNome).toBe('Eng. Teste');
    expect(livro[0].origem).toBe('auto');
  });
});

describe('adicionarEntradaLivroManual — ocorrência manual no livro', () => {
  beforeEach(() => localStorage.clear());

  function ocorrenciaBase(sobrescrever: Partial<Parameters<typeof adicionarEntradaLivroManual>[1]> = {}) {
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
    const entrada = await adicionarEntradaLivroManual('V1', ocorrenciaBase({ phId: 'ph-7' }));

    expect(entrada.origem).toBe('manual');
    expect(entrada.tipo).toBe('Manutenção corretiva');
    expect(entrada.descricao).toBe('Troca da válvula de segurança — Válvula apresentava vazamento no assento.');
    expect(entrada.relatorioCodigo).toBe('');
    expect(entrada.quemRealizou).toBe('Manutenção Industrial XYZ Ltda.');
    expect(entrada.phId).toBe('ph-7');
    expect(entrada.phNome).toBe('Eng. Manual');
    expect(entrada.phCrea).toBe('CREA-777');

    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro).toHaveLength(1);
    expect(livro[0].id).toBe(entrada.id);
    // Sem laudo de inspeção: entrada manual não tem apto nem ensaios.
    expect(livro[0].apto).toBeUndefined();
    expect(livro[0].ensaios).toBeUndefined();
  });

  it('sem phId (ou phId inexistente): sem assinatura, phNome/phCrea vazios', async () => {
    const semPh = await adicionarEntradaLivroManual('V1', ocorrenciaBase({ phId: null }));
    expect(semPh.phNome).toBe('');
    expect(semPh.phCrea).toBe('');
    expect(semPh.phId).toBeUndefined();

    const phFantasma = await adicionarEntradaLivroManual('V1', ocorrenciaBase({ phId: 'nao-existe' }));
    expect(phFantasma.phNome).toBe('');
    expect(phFantasma.phId).toBeUndefined();
  });

  it('entra cronologicamente entre entradas automáticas (aceita dd/mm/aaaa e aaaa-mm-dd)', async () => {
    localStorage.setItem(
      'nr13_livro_V1',
      JSON.stringify([entradaAutoFake('10/01/2026', 'REL-1'), entradaAutoFake('2026-06-20', 'REL-2')]),
    );
    await adicionarEntradaLivroManual('V1', ocorrenciaBase({ data: '2026-03-15' }));

    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro).toHaveLength(3);
    expect(livro[0].relatorioCodigo).toBe('REL-1');
    expect(livro[1].origem).toBe('manual'); // 15/03 fica entre 10/01 e 20/06
    expect(livro[2].relatorioCodigo).toBe('REL-2');
  });

  it('data inválida vai para o fim da lista, sem quebrar', async () => {
    localStorage.setItem(
      'nr13_livro_V1',
      JSON.stringify([entradaAutoFake('2026-06-20', 'REL-2'), entradaAutoFake('10/01/2026', 'REL-1')]),
    );
    const entrada = await adicionarEntradaLivroManual('V1', ocorrenciaBase({ data: 'data-quebrada' }));
    expect(entrada.origem).toBe('manual');

    const livro = JSON.parse(localStorage.getItem('nr13_livro_V1')!) as LivroEntrada[];
    expect(livro).toHaveLength(3);
    // Ordenação também reordena as autos por data crescente; a inválida fica por último.
    expect(livro[0].relatorioCodigo).toBe('REL-1');
    expect(livro[1].relatorioCodigo).toBe('REL-2');
    expect(livro[2].origem).toBe('manual');
  });
});
