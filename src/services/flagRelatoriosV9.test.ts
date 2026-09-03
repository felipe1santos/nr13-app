/**
 * Fase 9 · 9F.6.1 — a flag própria do catálogo de `/relatorios`.
 *
 * OITAVA e ÚLTIMA flag por tela. `/relatorios` era a única lista do sistema sem
 * par: as outras seis telas já tinham a sua, e esta continuava chamando
 * `listarEquipamentos()` — logo `lerTudo()` — sem interruptor nenhum.
 *
 * O degrau de recuo é o que estes testes protegem: entre publicar o bundle e
 * aplicar o SQL o banco tem as colunas ANTIGAS e não a nova, e uma consulta que
 * desistisse no primeiro erro apagaria as SETE anteriores de quem as tem
 * ligadas.
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
  livroV9Ativa,
  relatoriosV9Ativa,
  vencimentosV9Ativa,
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

describe('flag relatorios_v9', () => {
  it('nasce DESLIGADA — o catálogo de todo mundo continua o antigo', () => {
    expect(relatoriosV9Ativa()).toBe(false);
  });

  it('organização SEM linha em org_sync não herda a flag', async () => {
    estado.resposta = { data: null, error: null };
    await sincronizarFlagDoServidor();
    expect(relatoriosV9Ativa()).toBe(false);
  });

  it('liga quando o servidor diz que está ligada para a organização', async () => {
    estado.resposta = { data: { v2_ativa: true, relatorios_v9: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(relatoriosV9Ativa()).toBe(true);
  });

  it('sai na MESMA consulta das outras — nenhum round-trip novo no boot', async () => {
    estado.resposta = { data: { v2_ativa: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(estado.colunas[0]).toContain('relatorios_v9');
    expect(estado.colunas).toHaveLength(1);
  });

  it('BANCO SEM a coluna nova preserva as SETE anteriores', async () => {
    estado.colunasAusentes = ['relatorios_v9'];
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: true,
        boot_v9: true,
        inspecoes_v9: true,
        prontuarios_v9: true,
        calibracoes_v9: true,
        livro_v9: true,
        vencimentos_v9: true,
      },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(relatoriosV9Ativa()).toBe(false);
    expect(vencimentosV9Ativa()).toBe(true);
    expect(livroV9Ativa()).toBe(true);
    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
  });

  it('A ESCADA INTEIRA: sem NENHUMA coluna de tela, a v2 continua sincronizada', async () => {
    estado.colunasAusentes = [
      'relatorios_v9',
      'vencimentos_v9',
      'livro_v9',
      'calibracoes_v9',
      'prontuarios_v9',
      'inspecoes_v9',
      'boot_v9',
      'busca_v9',
    ];
    estado.resposta = { data: { v2_ativa: true }, error: null };

    const v2 = await sincronizarFlagDoServidor();

    expect(v2).toBe(true);
    expect(relatoriosV9Ativa()).toBe(false);
    expect(vencimentosV9Ativa()).toBe(false);
    expect(bootV9Ativo()).toBe(false);
  });

  it('o ROLLBACK desliga só ela: servidor manda false e as outras seguem', async () => {
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: true,
        boot_v9: true,
        livro_v9: true,
        vencimentos_v9: true,
        relatorios_v9: false,
      },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(relatoriosV9Ativa()).toBe(false);
    expect(vencimentosV9Ativa()).toBe(true);
    expect(livroV9Ativa()).toBe(true);
  });
});
