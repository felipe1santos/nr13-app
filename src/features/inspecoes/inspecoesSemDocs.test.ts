/**
 * Fase 9 · 9F.1 — A REGRA BLOQUEANTE DESTA TELA: listar e buscar = ZERO
 * `nr13_docs_`.
 *
 * `nr13_docs_<TAG>` é o container de inspeção, a estrutura mais pesada do
 * sistema: 11,4 KB por TAG na média medida em produção em 28/08/2026, 71,8 KB no
 * p95 e 117,3 KB no maior. A tela antiga abre esse arquivo **duas vezes por
 * cartão, dentro do render**, só para escrever "N Inspeções" — ~22 MB de parse
 * por quadro com 1.000 equipamentos.
 *
 * O que se prova aqui é NEGATIVO — que algo **não** acontece —, então o teste
 * não olha o resultado: ele instrumenta as portas de saída (RPC, `from()`,
 * `storage`) e a leitura do cache local, e reprova se qualquer uma for tocada
 * fora do que a lista pode usar.
 *
 * O ciclo simulado é o real: abrir a tela → digitar na busca → paginar.
 * Escolher um equipamento é OUTRO caminho, coberto por `catalogoInspecoes.test.ts`
 * — e lá o container é lido de propósito, de UMA TAG, sob demanda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const rede = vi.hoisted(() => ({
  rpc: [] as string[],
  tabelas: [] as string[],
  storage: [] as string[],
  lidas: [] as string[],
  linhas: 0,
}));

vi.mock('../../services/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rede.rpc.push(fn);
      const limite = (args.p_limite as number) ?? 0;
      const data =
        fn === 'contar_equipamentos'
          ? [{ total: 120, exato: true }]
          : Array.from({ length: Math.min(limite, rede.linhas) }, (_, i) => ({
              tag: 'VP-' + String(i).padStart(4, '0'),
              descricao: null, tipo: 'vaso', subtipo: null, categoria: null,
              fabricante: null, numero_serie: null, localizacao: null, ano: null,
              cliente_nome: null, cliente_cidade: null, proxima_inspecao: null,
              tem_foto: false, foto_ref: null, pmta_mpa: null, pth_mpa: null,
              resultado: null, volume_m3: null, fluido: null, classe_fluido: null,
              vida_anos: null, tem_cliente: false, unidade: null, source_version: 1,
              // O NÚMERO viaja; o container, não.
              inspecoes: i % 3,
            }));
      const p = Promise.resolve({ data, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
    // Qualquer uso destas portas durante a busca é uma reprovação.
    from: (tabela: string) => {
      rede.tabelas.push(tabela);
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    },
    storage: {
      from: (balde: string) => {
        rede.storage.push(balde);
        return { download: async () => ({ data: null, error: null }) };
      },
    },
  },
  escopoStorageAtual: async () => ({ coluna: 'org_id', id: 'org-1' }),
  TABELA_STORAGE: 'app_storage',
}));

/** O cache local: registra TODA chave lida durante o ciclo da lista. */
vi.mock('../../services/storage', () => ({
  ler: (chave: string) => {
    rede.lidas.push(chave);
    return null;
  },
  salvar: async () => {},
  lerTudo: async () => {
    rede.lidas.push('lerTudo');
    return {};
  },
}));

import { contar, listarPagina, TAMANHO_PAGINA } from '../../services/buscaIndex';

beforeEach(() => {
  rede.rpc = [];
  rede.tabelas = [];
  rede.storage = [];
  rede.lidas = [];
  rede.linhas = 120;
});

/** O ciclo da LISTA: abrir, buscar, paginar. Sem escolher equipamento. */
async function cicloDaLista() {
  await listarPagina();                                   // abriu a tela
  await contar();                                         // cabeçalho
  await listarPagina({ termo: 'vaso' });                  // digitou
  await contar({ termo: 'vaso' });
  await listarPagina({ termo: 'vaso' }, 'VP-0049');       // rolou
}

describe('a lista de /inspecoes não abre container nenhum', () => {
  it('NENHUMA chave nr13_docs_ é lida no ciclo inteiro', async () => {
    await cicloDaLista();
    expect(rede.lidas.filter((c) => c.startsWith('nr13_docs_'))).toEqual([]);
  });

  it('nem sequer toca o cache local — a lista inteira vem da projeção', async () => {
    await cicloDaLista();
    expect(rede.lidas).toEqual([]);
  });

  it('não chama lerTudo: o boot leve continua leve', async () => {
    await cicloDaLista();
    expect(rede.lidas).not.toContain('lerTudo');
  });

  it('só as duas RPCs do índice são usadas', async () => {
    await cicloDaLista();
    expect([...new Set(rede.rpc)].sort()).toEqual(['buscar_equipamentos', 'contar_equipamentos']);
  });

  it('nenhuma leitura direta de app_storage e nenhum download de arquivo', async () => {
    await cicloDaLista();
    expect(rede.tabelas).toEqual([]);
    expect(rede.storage).toEqual([]);
  });

  it('a contagem de inspeções chega pronta na linha, sem custo por cartão', async () => {
    const pagina = await listarPagina();
    expect(pagina.itens).toHaveLength(TAMANHO_PAGINA);
    // 0, 1, 2, 0, 1, 2… — o número veio do servidor, e nenhuma chave foi lida.
    expect(pagina.itens.slice(0, 4).map((i) => i.inspecoes)).toEqual([0, 1, 2, 0]);
    expect(rede.lidas).toEqual([]);
  });
});

/**
 * O BLOCO ACIMA PROVA O SERVIÇO, NÃO A TELA — e essa distinção é honesta, não
 * conveniente: a suíte roda em `environment: 'node'`, sem DOM, então nenhum
 * teste aqui renderiza `InspecoesV9`. Uma tela que voltasse a chamar
 * `listarContainers` no render passaria pelos testes acima sem tocá-los.
 *
 * A defesa possível deste lado é ESTRUTURAL: varrer o próprio arquivo da tela e
 * reprovar as três chamadas que trariam o problema de volta. É o mesmo recurso
 * de `palco.varreduraTemplates.test.ts`, que varre `public/` para pegar chave
 * nova sem cobertura.
 *
 * A prova de comportamento, com número, é o gate de navegador em 1k/10k/50k —
 * declarado no plano, e ainda não executado.
 */
describe('a tela nova não pode voltar a varrer a organização', () => {
  // COMENTÁRIO FORA. O cabeçalho da tela CITA `listarEquipamentos`, `lerTudo` e
  // `nr13_docs_` — é ali que está explicado o que ela deixou de fazer. Varrer o
  // arquivo cru reprovaria a própria documentação, e o caminho para o teste
  // passar seria apagar a explicação. O que se proíbe é a CHAMADA.
  const fonte = readFileSync(new URL('./InspecoesV9.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('não importa `listarEquipamentos` — é ele que começa com lerTudo()', () => {
    expect(fonte).not.toMatch(/listarEquipamentos/);
  });

  it('não chama `lerTudo` em lugar nenhum', () => {
    expect(fonte).not.toMatch(/lerTudo/);
  });

  it('não monta chave `nr13_docs_` na mão', () => {
    expect(fonte).not.toMatch(/nr13_docs_/);
  });

  it('só toca container pelo caminho sob demanda, e nos handlers de criar/excluir', () => {
    // `listarContainers` aparece nos dois handlers (depois de criar e depois de
    // excluir), onde a TAG já está escolhida e o cache já foi semeado. Se esse
    // número crescer, alguém pôs a leitura de volta na lista.
    const usos = fonte.match(/listarContainers\(/g) ?? [];
    expect(usos).toHaveLength(2);
    expect(fonte).toMatch(/abrirEquipamentoParaInspecao\(tag\)/);
  });
});
