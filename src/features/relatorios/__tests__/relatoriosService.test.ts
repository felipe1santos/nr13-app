import { beforeEach, describe, expect, it } from 'vitest';
import { adicionarEntradaLivroAuto, ensaiosDoRelatorio, expandirMemorial, type LivroEntrada } from '../relatoriosService';
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

  it('sem chave gv: paginação inalterada (to = nº de linhas do principal)', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a', 'linha b']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=3');
  });

  it('com nr13_calc_gv_<TAG>: linhas do GV entram após as do principal', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a']));
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=4');
  });

  it('gv sem principal: só as linhas do gv', () => {
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=2');
  });
});

describe('ensaiosDoRelatorio — derivação dos ensaios das folhas', () => {
  it('mapeia as 4 folhas de ensaio, ignora as demais e a query string', () => {
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

  it('deduplica e devolve vazio sem folhas de ensaio', () => {
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
