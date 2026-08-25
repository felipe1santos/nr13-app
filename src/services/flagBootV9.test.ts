/**
 * Fase 9 · 9D.4 — a flag `boot_v9`, que tira a organização inteira do boot.
 *
 * É SEPARADA da `busca_v9` de propósito: a busca lê a projeção e não muda o que
 * está no `Map`; a `boot_v9` muda QUANDO o `Map` é preenchido. Uma flag só,
 * para as duas, tiraria o rollback independente — e a 9D é a etapa de maior
 * risco da fase.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

type Linha = { v2_ativa?: boolean; busca_v9?: boolean; boot_v9?: boolean } | null;

const estado = vi.hoisted(() => ({
  resposta: { data: null as Linha, error: null as unknown },
  /** Colunas que este "banco" NÃO tem — a consulta que as pedir dá erro. */
  colunasAusentes: [] as string[],
  colunas: [] as string[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((colunas: string) => {
        estado.colunas.push(colunas);
        const faltando = estado.colunasAusentes.find((c) => colunas.includes(c));
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () =>
              faltando
                ? { data: null, error: { message: `column ${faltando} does not exist` } }
                : estado.resposta,
            ),
          })),
        };
      }),
    })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: 'org-1' })),
}));

import {
  bootV9Ativo,
  buscaV9Ativa,
  sincronizarFlagDoServidor,
  zerarFlagEmMemoria,
} from './flag';

beforeEach(() => {
  localStorage.clear();
  zerarFlagEmMemoria();
  estado.colunas.length = 0;
  estado.colunasAusentes.length = 0;
  estado.resposta = { data: null, error: null };
});

describe('flag boot_v9', () => {
  it('nasce DESLIGADA — organização sem a flag continua com a hidratação integral', async () => {
    estado.resposta = { data: { v2_ativa: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(bootV9Ativo()).toBe(false);
  });

  it('liga quando o servidor diz que a organização está no boot leve', async () => {
    estado.resposta = { data: { v2_ativa: true, boot_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(bootV9Ativo()).toBe(true);
  });

  it('vem na MESMA consulta das outras flags — nenhum round-trip novo no boot', async () => {
    estado.resposta = { data: { v2_ativa: true, boot_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(estado.colunas[0]).toContain('boot_v9');
  });

  it('fica DESLIGADA numa organização que ainda está na v1', async () => {
    // O boot leve é feito de `hidratarEssencial` + `carregarEquipamento`, e as
    // duas só existem na v2. Ligada contra a v1, a tela abriria sem nada no
    // cache e concluiria "conta vazia" — o sumiço que a v2 conserta.
    estado.resposta = { data: { v2_ativa: false, boot_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(bootV9Ativo()).toBe(false);
  });

  it('consulta que falha deixa o boot leve DESLIGADO — o lado barato', async () => {
    estado.resposta = { data: null, error: { message: 'coluna inexistente' } };

    await sincronizarFlagDoServidor();

    expect(bootV9Ativo()).toBe(false);
  });

  it('banco AINDA SEM a coluna boot_v9 não derruba a busca_v9 junto', async () => {
    // O estado exato da produção em 24/08/2026: `busca_v9` existe, `boot_v9`
    // ainda não. Se o recuo pulasse direto para a consulta mais antiga, toda
    // organização com a busca ligada a perderia no boot seguinte — uma flag
    // desligando outra, sem ninguém pedir.
    estado.colunasAusentes.push('boot_v9');
    estado.resposta = { data: { v2_ativa: true, busca_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(false);
  });

  it('banco sem NENHUMA das duas colunas ainda sincroniza a v2', async () => {
    // A razão de o recuo existir: deixar de sincronizar `v2_ativa` foi o que
    // custou uma semana na conta cmam.caldeiras.
    estado.colunasAusentes.push('boot_v9', 'busca_v9');
    estado.resposta = { data: { v2_ativa: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(buscaV9Ativa()).toBe(false);
    expect(bootV9Ativo()).toBe(false);
  });
});
