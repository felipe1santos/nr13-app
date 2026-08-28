/**
 * Fase 9 · 9F.1.4 — a flag própria de `/inspecoes`.
 *
 * Uma flag POR TELA é o que permite ligar uma e deixar as outras quietas, e o
 * que faz o rollback ser "desligar aquela", sem tocar em `busca_v9` nem em
 * `boot_v9`. Foi assim na 9C e na 9E; aqui é a terceira.
 *
 * O degrau de recuo é a parte que estes testes protegem de verdade: em 24/08 o
 * banco tinha `busca_v9` e ainda não tinha `boot_v9`, e uma consulta que
 * desistisse no primeiro erro **desligaria a busca de quem já a tinha ligada** —
 * uma flag derrubando a outra sem ninguém pedir. Agora são três colunas, e o
 * mesmo risco vale para a nova.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  colunas: [] as string[],
  colunasAusentes: [] as string[],
  resposta: { data: null as unknown, error: null as unknown },
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
  inspecoesV9Ativa,
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

describe('flag inspecoes_v9', () => {
  it('nasce DESLIGADA — a tela de todo mundo continua a antiga', async () => {
    estado.resposta = { data: { v2_ativa: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(inspecoesV9Ativa()).toBe(false);
  });

  it('liga quando o servidor diz que a organização está na tela nova', async () => {
    estado.resposta = { data: { v2_ativa: true, inspecoes_v9: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(inspecoesV9Ativa()).toBe(true);
  });

  it('organização SEM linha em org_sync não herda a tela nova', async () => {
    // "Sem linha = organização nova = v2" vale só para `v2_ativa`, que conserta
    // um defeito conhecido. Ligar tela nova é ato explícito, sempre.
    estado.resposta = { data: null, error: null };
    await sincronizarFlagDoServidor();
    expect(inspecoesV9Ativa()).toBe(false);
  });

  it('vem na MESMA consulta das outras — nenhum round-trip novo no boot', async () => {
    estado.resposta = { data: { v2_ativa: true, inspecoes_v9: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(estado.colunas[0]).toContain('inspecoes_v9');
  });

  it('banco AINDA SEM a coluna nova não derruba busca_v9 e boot_v9 junto', async () => {
    // O degrau. Um recuo que pulasse para a consulta mais antiga apagaria as
    // duas flags que já estão em produção — de novo, uma flag desligando outra.
    estado.colunasAusentes.push('inspecoes_v9');
    estado.resposta = { data: { v2_ativa: true, busca_v9: true, boot_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
    expect(inspecoesV9Ativa()).toBe(false);
  });

  it('consulta que falha por completo deixa a tela nova DESLIGADA', async () => {
    estado.resposta = { data: null, error: { message: 'offline' } };
    await sincronizarFlagDoServidor();
    expect(inspecoesV9Ativa()).toBe(false);
  });
});
