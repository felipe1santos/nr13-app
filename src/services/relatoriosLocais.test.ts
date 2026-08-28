/**
 * Fase 9 · 9E — o modo OFFLINE de `/relatorios`.
 *
 * A política tem duas metades, e o que estes testes protegem é a fronteira
 * entre elas: responder com o que o aparelho JÁ TEM (sem baixar nada) e nunca
 * apresentar esse subconjunto como se fosse o acervo inteiro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cache = vi.hoisted(() => ({ dados: {} as Record<string, unknown> }));

vi.mock('./storage', () => ({
  listarChavesComPrefixo: (p: string) => Object.keys(cache.dados).filter((k) => k.startsWith(p)),
  ler: (k: string) => cache.dados[k] ?? null,
}));

import { contarLocais, paraIso, relatoriosLocais } from './relatoriosLocais';

function reg(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tagVaso: 'VP-01',
    nome: 'Relatorio_' + id + '.pdf',
    tipo: 'Inspeção Periódica',
    data: '20/08/2026',
    status: 'Aprovado',
    codigo: 'REL-1786493933522',
    emissao: '20/08/2026',
    validade: '20/08/2027',
    execucaoInspecao: '',
    proximaInspecaoInterna: '',
    proximaInspecaoExterna: '',
    validadeValvula: '',
    ...extra,
  };
}

beforeEach(() => {
  cache.dados = {};
});

describe('paraIso — o índice guarda DD/MM/AAAA, a projeção usa AAAA-MM-DD', () => {
  it('converte a data brasileira', () => {
    expect(paraIso('20/08/2026')).toBe('2026-08-20');
  });

  it('aceita ISO que já venha pronto', () => {
    expect(paraIso('2026-08-20')).toBe('2026-08-20');
  });

  it('vazio e lixo viram null, nunca uma data inventada', () => {
    expect(paraIso('')).toBeNull();
    expect(paraIso(null)).toBeNull();
    expect(paraIso('sem data')).toBeNull();
  });
});

describe('relatoriosLocais — só o que o aparelho já tem', () => {
  it('lê os índices de TODAS as TAGs em cache', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [reg('A'), reg('B')];
    cache.dados['nr13_historico_indice_VP-02'] = [reg('C', { tagVaso: 'VP-02' })];

    expect(relatoriosLocais().map((r) => r.relatorioId).sort()).toEqual(['A', 'B', 'C']);
  });

  it('cache vazio devolve lista vazia — e quem chama tem de saber a diferença', () => {
    // "Não há relatórios" e "este aparelho não os tem" são frases diferentes.
    // Esta função não distingue: ela só reporta o que achou. A TELA distingue.
    expect(relatoriosLocais()).toEqual([]);
  });

  it('ignora chave com conteúdo inesperado, sem derrubar a lista', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [reg('A')];
    cache.dados['nr13_historico_indice_QUEBRADO'] = { nao: 'é array' };

    expect(relatoriosLocais().map((r) => r.relatorioId)).toEqual(['A']);
  });

  it('ordena como o banco: data desc, e no empate id desc', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [
      reg('REL-A', { emissao: '10/08/2026' }),
      reg('REL-C', { emissao: '20/08/2026' }),
      reg('REL-B', { emissao: '20/08/2026' }),
    ];

    expect(relatoriosLocais().map((r) => r.relatorioId)).toEqual(['REL-C', 'REL-B', 'REL-A']);
  });

  it('relatório sem data vai para o fim, não some', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [
      reg('SEM', { emissao: '' }),
      reg('COM', { emissao: '20/08/2026' }),
    ];

    expect(relatoriosLocais().map((r) => r.relatorioId)).toEqual(['COM', 'SEM']);
  });
});

describe('o filtro offline procura o mesmo que o online', () => {
  beforeEach(() => {
    cache.dados['nr13_historico_indice_AUTOCLAVE-1'] = [
      reg('A', { tagVaso: 'AUTOCLAVE-1', codigo: 'REL-1786493933522', nome: 'Periodica.pdf' }),
    ];
    cache.dados['nr13_historico_indice_VP-02'] = [
      reg('B', { tagVaso: 'VP-02', codigo: 'REL-9999', nome: 'Inicial.pdf', tipo: 'Inspeção Inicial' }),
    ];
  });

  it('acha por TAG', () => {
    expect(relatoriosLocais({ termo: 'autoclave' }).map((r) => r.relatorioId)).toEqual(['A']);
  });

  it('acha pelo código INTEIRO', () => {
    expect(relatoriosLocais({ termo: 'REL-1786493933522' }).map((r) => r.relatorioId)).toEqual(['A']);
  });

  it('acha só pelos DÍGITOS do código — o número que o usuário lê no papel', () => {
    expect(relatoriosLocais({ termo: '1786493933522' }).map((r) => r.relatorioId)).toEqual(['A']);
  });

  it('acha pelo nome do arquivo', () => {
    expect(relatoriosLocais({ termo: 'inicial' }).map((r) => r.relatorioId)).toEqual(['B']);
  });

  it('filtra por tipo', () => {
    expect(relatoriosLocais({ tipo: 'Inspeção Inicial' }).map((r) => r.relatorioId)).toEqual(['B']);
  });

  it('termo sem resultado devolve vazio', () => {
    expect(relatoriosLocais({ termo: 'zzzznadaexiste' })).toEqual([]);
  });
});

describe('período offline segue a mesma regra do servidor', () => {
  beforeEach(() => {
    cache.dados['nr13_historico_indice_VP-01'] = [
      reg('JAN', { emissao: '15/01/2026' }),
      reg('JUN', { emissao: '15/06/2026' }),
      reg('SEM', { emissao: '' }),
    ];
  });

  it('recorta o intervalo pedido', () => {
    const r = relatoriosLocais({ de: '2026-06-01', ate: '2026-06-30' });
    expect(r.map((x) => x.relatorioId)).toEqual(['JUN']);
  });

  it('relatório SEM data fica de fora do período — a sentinela não é um fato', () => {
    // Mesmo com um intervalo que abrange o ano 1, o sem-data não entra: ele não
    // tem data, e inventar uma o colocaria num mês em que nada aconteceu.
    const r = relatoriosLocais({ de: '0001-01-01', ate: '2030-01-01' });
    expect(r.map((x) => x.relatorioId)).not.toContain('SEM');
  });

  it('sem período, o sem-data aparece', () => {
    expect(relatoriosLocais().map((x) => x.relatorioId)).toContain('SEM');
  });
});

describe('contarLocais', () => {
  it('conta o que o filtro devolve, sempre exato — é local', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [reg('A'), reg('B'), reg('C')];
    expect(contarLocais()).toBe(3);
    expect(contarLocais({ termo: 'zzz' })).toBe(0);
  });
});

describe('o offline NÃO toca o PDF', () => {
  // O campo da `RefFoto` é `path`. Este teste nasceu com `caminho` e PASSAVA,
  // porque o código lia a mesma chave errada — dois erros iguais se cancelando.
  // Só a medição em produção (25/08/2026) mostrou o efeito: `pdf_ref` nulo em
  // todo relatório finalizado.
  it('o item local carrega a referência, quando o índice a tem', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [
      reg('A', { pdfRef: { bucket: 'inspecao', path: 'org/relatorios/uuid.pdf' } }),
    ];

    const item = relatoriosLocais()[0];
    expect(item.pdfRef).toBe('org/relatorios/uuid.pdf');
    // Offline, abrir o PDF depende de ele já estar no cache de arquivos — e
    // quem resolve isso é `artefatoRelatorio`, no clique, não a listagem.
    expect(JSON.stringify(item)).not.toMatch(/base64|blob:/);
  });

  it('índice sem referência não inventa uma', () => {
    cache.dados['nr13_historico_indice_VP-01'] = [reg('A')];
    expect(relatoriosLocais()[0].pdfRef).toBeNull();
  });
});
