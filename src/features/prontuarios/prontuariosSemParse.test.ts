/**
 * Fase 9 · 9F.2 — A REGRA BLOQUEANTE DESTA TELA: listar e buscar = ZERO
 * `nr13_prontuario_`.
 *
 * `carregarProntuario(tag)` é `JSON.parse` do prontuário INTEIRO. A tela antiga
 * o chama DENTRO do render, uma vez por cartão, para decidir entre "Prontuário
 * OK" e "Sem Prontuário". Medido em produção em 29/08/2026: 15 chaves em 10
 * organizações, **média de 6,6 KB** por TAG e **máximo de 25,7 KB** — com 1.000
 * equipamentos, ~6,6 MB de parse por quadro para escrever um booleano.
 *
 * O que se prova aqui é NEGATIVO — que algo **não** acontece —, então o teste
 * instrumenta as portas de saída (RPC, `from()`, `storage`) e a leitura do cache
 * e reprova se alguma for tocada durante o ciclo da lista.
 *
 * Escolher um equipamento é OUTRO caminho, coberto por
 * `catalogoProntuarios.test.ts` — e lá o prontuário É lido de propósito, de UMA
 * TAG, depois da semeadura.
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
              inspecoes: null,
              // O BOOLEANO viaja; o prontuário, não.
              tem_prontuario: i % 2 === 0,
            }));
      const p = Promise.resolve({ data, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
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
  await listarPagina();
  await contar();
  await listarPagina({ termo: 'vaso' });
  await contar({ termo: 'vaso' });
  await listarPagina({ termo: 'vaso' }, 'VP-0049');
}

describe('a lista de /prontuarios não abre prontuário nenhum', () => {
  it('NENHUMA chave nr13_prontuario_ é lida no ciclo inteiro', async () => {
    await cicloDaLista();
    expect(rede.lidas.filter((c) => c.startsWith('nr13_prontuario_'))).toEqual([]);
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

  it('o badge chega pronto na linha, sem custo por cartão', async () => {
    const pagina = await listarPagina();
    expect(pagina.itens).toHaveLength(TAMANHO_PAGINA);
    expect(pagina.itens.slice(0, 4).map((i) => i.temProntuario)).toEqual([true, false, true, false]);
    expect(rede.lidas).toEqual([]);
  });
});

/**
 * O BLOCO ACIMA PROVA O SERVIÇO, NÃO A TELA. A suíte roda em
 * `environment: 'node'`, sem DOM: nenhum teste aqui renderiza o componente. A
 * defesa possível deste lado é ESTRUTURAL — varrer o próprio arquivo e reprovar
 * as chamadas que trariam o problema de volta.
 *
 * A prova de comportamento, com número, é o gate de navegador em 1k/10k/50k.
 */
describe('o catálogo novo não pode voltar a varrer a organização', () => {
  // COMENTÁRIO FORA: o cabeçalho do arquivo CITA `listarEquipamentos`,
  // `lerTudo` e `carregarProntuario` para explicar o que a tela deixou de
  // fazer. Varrer o arquivo cru reprovaria a própria documentação.
  const fonte = readFileSync(new URL('./CatalogoProntuariosV9.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('não importa `listarEquipamentos` — é ele que começa com lerTudo()', () => {
    expect(fonte).not.toMatch(/listarEquipamentos/);
  });

  it('não chama `lerTudo` em lugar nenhum', () => {
    expect(fonte).not.toMatch(/lerTudo/);
  });

  it('não chama `carregarProntuario` — o parse por cartão é o defeito', () => {
    expect(fonte).not.toMatch(/carregarProntuario/);
  });

  it('não monta chave `nr13_prontuario_` na mão', () => {
    expect(fonte).not.toMatch(/nr13_prontuario_/);
  });

  it('o badge sai do serviço, onde a regra `null ≠ false` tem teste', () => {
    expect(fonte).toMatch(/rotuloProntuario/);
  });
});
