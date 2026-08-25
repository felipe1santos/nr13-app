/**
 * Fase 9 · 9E — o KEYSET de `/relatorios`, provado por propriedade.
 *
 * A pergunta que estes testes respondem é a única que importa numa paginação:
 * **percorrendo todas as páginas, cada relatório aparece EXATAMENTE uma vez?**
 *
 * Duas maneiras de errar, e as duas já aconteceram neste sistema:
 *
 *   · **pular** — o item existe e o usuário nunca o vê. É o sumiço de dado, o
 *     defeito que a Fase 9 inteira existe para combater;
 *   · **duplicar** — o mesmo relatório em duas páginas, e a contagem mente.
 *
 * O servidor simulado abaixo aplica a MESMA regra do `busca_relatorios.sql`:
 * ordena por `ordem_emissao desc, relatorio_id desc` e corta pelo cursor com
 * uma comparação de TUPLA. Se a regra do cliente (`chaveOrdem`, o cursor
 * composto) divergir da do servidor, estes testes quebram — que é exatamente o
 * ponto: eles travam o CONTRATO entre os dois lados, não a implementação de um.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LinhaFake {
  relatorio_id: string;
  emissao: string | null;
}

const banco = vi.hoisted(() => ({
  linhas: [] as LinhaFake[],
  /** Quantas vezes o servidor foi consultado — uma por página. */
  consultas: 0,
}));

/** A data que ORDENA — espelha `coalesce(emissao, '0001-01-01')` do SQL. */
const ordem = (l: LinhaFake) => l.emissao ?? '0001-01-01';

/**
 * `order by ordem_emissao desc, relatorio_id desc`.
 * Ambas descendo: é o que permite a comparação de tupla do cursor.
 */
function ordenar(a: LinhaFake, b: LinhaFake): number {
  const oa = ordem(a);
  const ob = ordem(b);
  if (oa !== ob) return oa < ob ? 1 : -1;
  return a.relatorio_id < b.relatorio_id ? 1 : a.relatorio_id > b.relatorio_id ? -1 : 0;
}

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      banco.consultas += 1;
      const curData = args.p_cursor_data as string | null;
      const curId = (args.p_cursor_id as string | null) ?? '';
      const limite = args.p_limite as number;

      const visiveis = [...banco.linhas].sort(ordenar).filter((l) => {
        if (curData === null) return true;
        // `(ordem_emissao, relatorio_id) < (cursor_data, cursor_id)` — a mesma
        // comparação de tupla do SQL, aplicada campo a campo.
        const o = ordem(l);
        if (o !== curData) return o < curData;
        return l.relatorio_id < curId;
      });

      const data = visiveis.slice(0, limite).map((l) => ({
        relatorio_id: l.relatorio_id,
        tag: 'VASO-01',
        codigo: l.relatorio_id,
        nome: null,
        tipo: null,
        status: null,
        profissional: null,
        emissao: l.emissao,
        validade: null,
        execucao_inspecao: null,
        proxima_inspecao_interna: null,
        proxima_inspecao_externa: null,
        pdf_ref: 'org/relatorios/' + l.relatorio_id + '.pdf',
        sha256: null,
        paginas: null,
        source_version: 1,
      }));

      const p = Promise.resolve({ data, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import {
  TAMANHO_PAGINA_REL,
  listarPaginaRelatorios,
  type CursorRelatorios,
} from './buscaRelatorios';

/** Percorre TODAS as páginas e devolve os ids na ordem em que apareceram. */
async function percorrerTudo(aoVirarPagina?: (n: number) => void): Promise<string[]> {
  const vistos: string[] = [];
  let cursor: CursorRelatorios | null = null;
  let guarda = 0;

  for (;;) {
    const pagina = await listarPaginaRelatorios({}, cursor);
    vistos.push(...pagina.itens.map((r) => r.relatorioId));
    if (!pagina.temMais) break;
    cursor = pagina.proximoCursor;
    aoVirarPagina?.(vistos.length);
    if (++guarda > 500) throw new Error('paginação não terminou — provável laço');
  }
  return vistos;
}

beforeEach(() => {
  banco.linhas = [];
  banco.consultas = 0;
});

describe('paginação completa', () => {
  it('percorre 3 páginas cheias sem duplicar e sem pular', async () => {
    const total = TAMANHO_PAGINA_REL * 3;
    banco.linhas = Array.from({ length: total }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(5, '0'),
      emissao: `2026-0${(i % 9) + 1}-1${i % 10}`,
    }));

    const vistos = await percorrerTudo();

    expect(vistos).toHaveLength(total);
    expect(new Set(vistos).size).toBe(total); // nenhum duplicado
    expect(new Set(vistos)).toEqual(new Set(banco.linhas.map((l) => l.relatorio_id)));
  });

  it('a última página não pede outra', async () => {
    banco.linhas = Array.from({ length: TAMANHO_PAGINA_REL }, (_, i) => ({
      relatorio_id: 'REL-' + i,
      emissao: '2026-08-20',
    }));

    await percorrerTudo();

    // Exatamente uma consulta: 50 itens cabem numa página, e a linha extra
    // (limite = 51) não veio — logo não há próxima.
    expect(banco.consultas).toBe(1);
  });

  it('organização sem nenhum relatório termina na primeira consulta', async () => {
    expect(await percorrerTudo()).toEqual([]);
    expect(banco.consultas).toBe(1);
  });
});

describe('datas IGUAIS — o caso que quebra keyset sem desempate', () => {
  it('120 relatórios na MESMA data: todos aparecem, uma vez cada', async () => {
    // Sem `relatorio_id` no cursor, a segunda página recomeçaria do mesmo ponto
    // (a data não avança) e a paginação ou repetiria para sempre ou pularia o
    // resto do dia.
    banco.linhas = Array.from({ length: 120 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(4, '0'),
      emissao: '2026-08-20',
    }));

    const vistos = await percorrerTudo();

    expect(vistos).toHaveLength(120);
    expect(new Set(vistos).size).toBe(120);
  });

  it('a ordem entre itens da mesma data é determinística (id decrescente)', async () => {
    banco.linhas = [
      { relatorio_id: 'REL-A', emissao: '2026-08-20' },
      { relatorio_id: 'REL-C', emissao: '2026-08-20' },
      { relatorio_id: 'REL-B', emissao: '2026-08-20' },
    ];

    expect(await percorrerTudo()).toEqual(['REL-C', 'REL-B', 'REL-A']);
  });
});

describe('relatórios SEM data', () => {
  it('aparecem no fim, e não travam a paginação', async () => {
    banco.linhas = [
      { relatorio_id: 'REL-COM-DATA', emissao: '2026-08-20' },
      { relatorio_id: 'REL-SEM-1', emissao: null },
      { relatorio_id: 'REL-SEM-2', emissao: null },
    ];

    const vistos = await percorrerTudo();

    expect(vistos[0]).toBe('REL-COM-DATA');
    expect(vistos.slice(1).sort()).toEqual(['REL-SEM-1', 'REL-SEM-2']);
  });

  it('60 sem data + 60 com data: 120 itens, nenhum perdido na fronteira', async () => {
    // A fronteira entre "tem data" e "não tem" é onde um `nulls last` sem
    // cuidado perderia itens: o cursor cruza de um grupo para o outro no meio
    // de uma página.
    banco.linhas = [
      ...Array.from({ length: 60 }, (_, i) => ({
        relatorio_id: 'COM-' + String(i).padStart(3, '0'),
        emissao: '2026-08-' + String((i % 28) + 1).padStart(2, '0'),
      })),
      ...Array.from({ length: 60 }, (_, i) => ({
        relatorio_id: 'SEM-' + String(i).padStart(3, '0'),
        emissao: null,
      })),
    ];

    const vistos = await percorrerTudo();

    expect(vistos).toHaveLength(120);
    expect(new Set(vistos).size).toBe(120);
    expect(vistos.filter((id) => id.startsWith('SEM-'))).toHaveLength(60);
  });

  it('TODOS sem data ainda paginam', async () => {
    banco.linhas = Array.from({ length: 75 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(3, '0'),
      emissao: null,
    }));

    const vistos = await percorrerTudo();

    expect(vistos).toHaveLength(75);
    expect(new Set(vistos).size).toBe(75);
  });
});

describe('inserção concorrente durante a paginação', () => {
  it('relatório NOVO (data futura) não faz item já visto reaparecer', async () => {
    // O caso real: o usuário está rolando o histórico e outro aparelho salva um
    // relatório. Um `offset` clássico deslocaria tudo e duplicaria uma linha
    // inteira; o keyset ancora na posição, não no número da linha.
    banco.linhas = Array.from({ length: TAMANHO_PAGINA_REL * 2 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(4, '0'),
      emissao: '2026-05-' + String((i % 28) + 1).padStart(2, '0'),
    }));

    const vistos = await percorrerTudo((quantos) => {
      if (quantos === TAMANHO_PAGINA_REL) {
        // Emitido AGORA: entra no topo, que já ficou para trás.
        banco.linhas.push({ relatorio_id: 'REL-NOVO', emissao: '2026-12-31' });
      }
    });

    expect(new Set(vistos).size).toBe(vistos.length); // nada duplicado
    // O item novo nasceu acima do cursor: não aparece nesta varredura, e é o
    // comportamento correto — quem o mostra é `fundirRelatoriosLocais` (§6.4).
    expect(vistos).not.toContain('REL-NOVO');
  });

  it('relatório ANTIGO inserido no meio aparece, sem deslocar os já vistos', async () => {
    banco.linhas = Array.from({ length: TAMANHO_PAGINA_REL * 2 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(4, '0'),
      // Todos em 2026-06; o novo entrará em 2020, bem abaixo do cursor.
      emissao: '2026-06-15',
    }));

    const vistos = await percorrerTudo((quantos) => {
      if (quantos === TAMANHO_PAGINA_REL) {
        banco.linhas.push({ relatorio_id: 'REL-ANTIGO', emissao: '2020-01-01' });
      }
    });

    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).toContain('REL-ANTIGO');
    expect(vistos[vistos.length - 1]).toBe('REL-ANTIGO'); // no fim, como a data manda
  });

  it('exclusão durante a paginação não pula o vizinho', async () => {
    banco.linhas = Array.from({ length: TAMANHO_PAGINA_REL * 2 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(4, '0'),
      emissao: '2026-07-10',
    }));

    const vistos = await percorrerTudo((quantos) => {
      if (quantos === TAMANHO_PAGINA_REL) {
        // Some um item que AINDA NÃO foi visto. A ordenação é decrescente, então
        // a primeira página trouxe REL-0099..REL-0050 — o alvo tem de estar
        // abaixo disso. Com offset, o vizinho seguinte seria PULADO; com keyset,
        // apenas o excluído deixa de aparecer.
        banco.linhas = banco.linhas.filter((l) => l.relatorio_id !== 'REL-0030');
      }
    });

    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).not.toContain('REL-0030');
    expect(vistos).toContain('REL-0029');
    expect(vistos).toContain('REL-0031');
  });
});

describe('o servidor é quem filtra — nada de `.filter()` no cliente', () => {
  it('cada página é UMA consulta, e o cliente não recebe o histórico inteiro', async () => {
    banco.linhas = Array.from({ length: TAMANHO_PAGINA_REL * 4 }, (_, i) => ({
      relatorio_id: 'REL-' + String(i).padStart(4, '0'),
      emissao: '2026-08-20',
    }));

    await percorrerTudo();

    // 200 itens ÷ 50 = 4 páginas cheias + 1 consulta que confirma o fim.
    expect(banco.consultas).toBe(4);
  });
});
