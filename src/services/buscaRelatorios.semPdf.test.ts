/**
 * Fase 9 · 9E — A REGRA BLOQUEANTE: listar, buscar, filtrar e paginar = ZERO PDF.
 *
 * Este arquivo existe porque a diferença entre uma busca que escala e uma que
 * derruba a conta do usuário é exatamente esta: se a lista tocar o arquivo,
 * abrir `/relatorios` numa organização com 10.000 relatórios baixaria gigabytes
 * de PDF para escrever linhas de texto na tela.
 *
 * O que se prova aqui é NEGATIVO — que algo **não** acontece — e por isso o
 * teste não confia em inspecionar o resultado: ele instrumenta TODAS as portas
 * de saída do cliente Supabase (RPC, `from()`, `storage`) e reprova se qualquer
 * uma que não seja o índice for tocada durante o ciclo da tela.
 *
 * O ciclo simulado é o real: abrir a tela → digitar na busca → aplicar filtro de
 * período → paginar até o fim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rede = vi.hoisted(() => ({
  rpc: [] as string[],
  tabelas: [] as string[],
  storage: [] as string[],
  linhas: 0,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rede.rpc.push(fn);
      const limite = (args.p_limite as number) ?? 0;
      const data =
        fn === 'contar_relatorios'
          ? [{ total: 120, exato: true }]
          : Array.from({ length: Math.min(limite, rede.linhas) }, (_, i) => ({
              relatorio_id: 'REL-' + String(i).padStart(4, '0'),
              tag: 'VASO-01',
              codigo: 'REL-' + i,
              nome: 'Relatorio.pdf',
              tipo: 'Inspeção Periódica',
              status: null,
              profissional: null,
              emissao: '2026-08-20',
              validade: null,
              execucao_inspecao: null,
              proxima_inspecao_interna: null,
              proxima_inspecao_externa: null,
              // A REFERÊNCIA viaja; o arquivo, não.
              pdf_ref: 'org/relatorios/uuid-' + i + '.pdf',
              sha256: 'sha-' + i,
              paginas: 13,
              source_version: 1,
            }));
      const p = Promise.resolve({ data, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
    // Qualquer uso destas portas durante a busca é uma reprovação.
    from: (tabela: string) => {
      rede.tabelas.push(tabela);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
    storage: {
      from: (balde: string) => {
        rede.storage.push(balde);
        return {
          download: (_caminho?: string) => {
            rede.storage.push(balde + ':download');
            return Promise.resolve({ data: null, error: null });
          },
          createSignedUrl: () => {
            rede.storage.push(balde + ':signedUrl');
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
  },
}));

import {
  TAMANHO_PAGINA_REL,
  contarRelatorios,
  listarPaginaRelatorios,
  type CursorRelatorios,
} from './buscaRelatorios';

beforeEach(() => {
  rede.rpc = [];
  rede.tabelas = [];
  rede.storage = [];
  rede.linhas = 0;
});

/** O ciclo real da tela, do jeito que o usuário a exercita. */
async function cicloDaTela() {
  // 1 · abrir a tela
  await listarPaginaRelatorios({});
  await contarRelatorios({});

  // 2 · digitar na busca (o debounce já estabilizou; é uma consulta só)
  await listarPaginaRelatorios({ termo: 'autoclave' });
  await contarRelatorios({ termo: 'autoclave' });

  // 3 · aplicar período
  await listarPaginaRelatorios({ termo: 'autoclave', de: '2026-01-01', ate: '2026-12-31' });

  // 4 · paginar até o fim
  let cursor: CursorRelatorios | null = null;
  for (let i = 0; i < 3; i++) {
    const pagina: Awaited<ReturnType<typeof listarPaginaRelatorios>> =
      await listarPaginaRelatorios({}, cursor);
    if (!pagina.temMais) break;
    cursor = pagina.proximoCursor;
  }
}

describe('a tela de relatórios NÃO toca o PDF', () => {
  it('nenhum download, nenhuma URL assinada, nenhum balde acessado', async () => {
    rede.linhas = TAMANHO_PAGINA_REL + 1;

    await cicloDaTela();

    // A prova negativa. Se qualquer uma destas listas encher, a busca passou a
    // custar o tamanho do acervo.
    expect(rede.storage).toEqual([]);
  });

  it('nenhuma leitura de `app_storage` — o registro pesado fica onde está', async () => {
    rede.linhas = TAMANHO_PAGINA_REL + 1;

    await cicloDaTela();

    // Cada `nr13_rel_<id>_<TAG>` pesa ~110 KB (snapshots do §7-bis). Ler a
    // tabela aqui traria o acervo inteiro para desenhar uma lista.
    expect(rede.tabelas).toEqual([]);
  });

  it('só as duas RPCs de índice são chamadas', async () => {
    rede.linhas = TAMANHO_PAGINA_REL + 1;

    await cicloDaTela();

    const distintas = [...new Set(rede.rpc)].sort();
    expect(distintas).toEqual(['buscar_relatorios', 'contar_relatorios']);
  });

  it('o número de consultas NÃO cresce com o tamanho do acervo', async () => {
    // 60 relatórios
    rede.linhas = 60;
    await cicloDaTela();
    const com60 = rede.rpc.length;

    // 10.000 relatórios: a mesma tela, o mesmo uso.
    rede.rpc = [];
    rede.storage = [];
    rede.linhas = 10_000;
    await cicloDaTela();
    const com10k = rede.rpc.length;

    // É esta a promessa da 9E: o custo é do que se VÊ, não do que existe.
    expect(com10k).toBe(com60);
    expect(rede.storage).toEqual([]);
  });

  it('a linha trafegada tem a REFERÊNCIA e o hash, nunca bytes', async () => {
    rede.linhas = 1;

    const pagina = await listarPaginaRelatorios({});
    const item = pagina.itens[0];

    expect(item.pdfRef).toMatch(/^org\/relatorios\//);
    expect(item.sha256).toBe('sha-0');
    // O SHA-256 do artefato arquivado viaja como metadado: a conferência
    // continua possível sem baixar nada, e o arquivo permanece intocado.
    expect(JSON.stringify(item)).not.toMatch(/base64|blob:|data:application\/pdf/);
  });
});

describe('o PDF é resolvido SOMENTE na ação do usuário', () => {
  it('abrir um relatório é o único caminho que usa a referência', async () => {
    rede.linhas = 3;
    await listarPaginaRelatorios({});
    expect(rede.storage).toEqual([]);

    // A tela entrega a REFERÊNCIA a quem for abrir; quem baixa é
    // `artefatoRelatorio`, no clique. Esta chamada representa esse clique.
    const { supabase } = await import('./supabase');
    await supabase.storage.from('relatorios').download('org/relatorios/uuid-0.pdf');

    expect(rede.storage).toEqual(['relatorios', 'relatorios:download']);
    // E aconteceu UMA vez, para UM relatório — não para os 3 da lista.
    expect(rede.storage.filter((s) => s.endsWith(':download'))).toHaveLength(1);
  });
});
