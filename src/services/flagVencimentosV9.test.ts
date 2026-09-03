/**
 * Fase 9 · 9F.5.1 — a flag própria de `/vencimentos` e `/dashboard`.
 *
 * SÉTIMA flag por tela. Esta etapa é diferente das seis anteriores: o agregado
 * do servidor JÁ EXISTE e JÁ ESTÁ EM PRODUÇÃO desde 25/08 — só que atrás de
 * `boot_v9`, a flag do BOOT. Desligar o boot leve para consertar um problema de
 * boot mudava também o painel; ligar para o painel mudava também o boot.
 *
 * O que estes testes protegem é a REGRA DA DISJUNÇÃO: a flag nova NÃO substitui
 * `boot_v9`, ela SOMA. Sob `boot_v9` o cache não tem a organização, e um painel
 * que caísse no caminho local ali mostraria a conta VAZIA — o sumiço que este
 * projeto conserta.
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
  calibracoesV9Ativa,
  inspecoesV9Ativa,
  livroV9Ativa,
  prontuariosV9Ativa,
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

describe('flag vencimentos_v9', () => {
  it('nasce DESLIGADA — o painel de todo mundo continua o de antes', () => {
    expect(vencimentosV9Ativa()).toBe(false);
  });

  it('organização SEM linha em org_sync não herda a flag', async () => {
    estado.resposta = { data: null, error: null };
    await sincronizarFlagDoServidor();
    expect(vencimentosV9Ativa()).toBe(false);
  });

  it('liga quando o servidor diz que está ligada para a organização', async () => {
    estado.resposta = {
      data: { v2_ativa: true, vencimentos_v9: true },
      error: null,
    };
    await sincronizarFlagDoServidor();
    expect(vencimentosV9Ativa()).toBe(true);
  });

  it('sai na MESMA consulta das outras — nenhum round-trip novo no boot', async () => {
    estado.resposta = { data: { v2_ativa: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(estado.colunas[0]).toContain('vencimentos_v9');
    expect(estado.colunas).toHaveLength(1);
  });

  it('BANCO SEM a coluna nova preserva as SEIS anteriores', async () => {
    // O estado entre publicar o bundle e aplicar o SQL — o normal de todo deploy.
    estado.colunasAusentes = ['vencimentos_v9'];
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: true,
        boot_v9: true,
        inspecoes_v9: true,
        prontuarios_v9: true,
        calibracoes_v9: true,
        livro_v9: true,
      },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(vencimentosV9Ativa()).toBe(false);
    expect(livroV9Ativa()).toBe(true);
    expect(calibracoesV9Ativa()).toBe(true);
    expect(prontuariosV9Ativa()).toBe(true);
    expect(inspecoesV9Ativa()).toBe(true);
    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
  });

  it('A ESCADA INTEIRA: sem NENHUMA coluna de tela, a v2 continua sincronizada', async () => {
    estado.colunasAusentes = [
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
    expect(vencimentosV9Ativa()).toBe(false);
    expect(livroV9Ativa()).toBe(false);
    expect(bootV9Ativo()).toBe(false);
  });

  it('o ROLLBACK desliga só ela: servidor manda false e as outras seguem', async () => {
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: true,
        boot_v9: true,
        inspecoes_v9: true,
        prontuarios_v9: true,
        calibracoes_v9: true,
        livro_v9: true,
        vencimentos_v9: false,
      },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(vencimentosV9Ativa()).toBe(false);
    expect(livroV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
  });
});
