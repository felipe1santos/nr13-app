/**
 * Fase 9 · 9F.5.2 — a REGRA DA DISJUNÇÃO de `carregarPainel`.
 *
 * Até a 9F.5 o painel decidia a fonte por `bootV9Ativo()` — a flag do BOOT.
 * Consequência: desligar o boot leve para consertar um problema de boot mudava
 * também o painel, e ligar o agregado para uma organização obrigava a ligar o
 * boot leve dela junto. Sete telas, seis flags próprias, e esta pendurada na
 * alheia.
 *
 * A flag nova SOMA, não substitui. O teste que carrega o risco é o segundo:
 * com `boot_v9` ON e `vencimentos_v9` OFF o painel PRECISA continuar vindo do
 * servidor. Sob boot leve o cache local não tem a organização — cair no caminho
 * local ali contaria zero equipamentos e diria "tudo em dia" sobre uma conta
 * que nunca foi lida. É o sumiço que esta fase inteira existe para impedir.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const resposta = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
}));

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: resposta.data, error: resposta.error })) },
}));

const flag = vi.hoisted(() => ({ bootV9: false, vencimentosV9: false }));
vi.mock('./flag', () => ({
  bootV9Ativo: () => flag.bootV9,
  vencimentosV9Ativa: () => flag.vencimentosV9,
}));

const local = vi.hoisted(() => ({ chamou: false }));
vi.mock('./vencimentos', async () => {
  const real = await vi.importActual<typeof import('./vencimentos')>('./vencimentos');
  return {
    ...real,
    listarVencimentos: () => {
      local.chamou = true;
      return [];
    },
  };
});

vi.mock('./storage', () => ({ listarChavesComPrefixo: () => ['nr13_info_A', 'nr13_info_B'] }));

import { carregarPainel } from './vencimentosServidor';

const HOJE = new Date(2026, 8, 3);

beforeEach(() => {
  local.chamou = false;
  flag.bootV9 = false;
  flag.vencimentosV9 = false;
  resposta.data = { total_equip: 7, com_prazo: 7, vencidos: 0, a_vencer_30: 0, itens: [] };
  resposta.error = null;
});

describe('carregarPainel · qual fonte responde', () => {
  it('as duas DESLIGADAS: painel calculado no aparelho', async () => {
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('local');
    expect(local.chamou).toBe(true);
  });

  it('vencimentos_v9 LIGADA sozinha: painel do servidor, sem tocar o cache', async () => {
    flag.vencimentosV9 = true;
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('servidor');
    expect(p.kpis.total).toBe(7);
    expect(local.chamou).toBe(false);
  });

  it('boot_v9 LIGADA sozinha AINDA vem do servidor — a disjunção', async () => {
    // O teste que carrega o risco. Sob boot leve o cache NÃO tem a organização:
    // cair no local aqui mostraria a conta vazia.
    flag.bootV9 = true;
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('servidor');
    expect(local.chamou).toBe(false);
  });

  it('as duas LIGADAS: servidor, e uma vez só', async () => {
    flag.bootV9 = true;
    flag.vencimentosV9 = true;
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('servidor');
    expect(local.chamou).toBe(false);
  });

  it('ROLLBACK de vencimentos_v9 numa org COM boot_v9 não derruba o painel', async () => {
    // Desligar a flag da tela não pode devolver a organização ao caminho local
    // enquanto o boot leve continuar ligado — seria trocar um painel certo por
    // um painel vazio.
    flag.bootV9 = true;
    flag.vencimentosV9 = false;
    const p = await carregarPainel(HOJE);
    expect(p.fonte).toBe('servidor');
    expect(local.chamou).toBe(false);
  });
});
