import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  adquirirTrava,
  liberarTrava,
  renovarTrava,
  donoAtual,
  ehDono,
  travaExpirada,
  temWebLocks,
  zerarPosseEmMemoria,
  definirRelogio,
  restaurarRelogio,
  CHAVE_DONO,
  TTL_TRAVA_MS,
  type ContextoMontagem,
} from './palcoTrava';

const ORG = '11111111-1111-1111-1111-111111111111';

const ctx = (tabId: string, relatorioId = 'rel-1', tag = 'ACA 2040'): ContextoMontagem => ({
  orgId: ORG,
  tabId,
  relatorioId,
  tag,
  nonce: `nonce-${tabId}-${relatorioId}`,
});

const navReal = globalThis.navigator;

function semWebLocks(): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  zerarPosseEmMemoria();
  restaurarRelogio();
  Object.defineProperty(globalThis, 'navigator', {
    value: navReal,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  zerarPosseEmMemoria();
  restaurarRelogio();
});

describe('trava — posse identificada', () => {
  it('registra organização, aba, relatório, TAG e nonce', async () => {
    const c = ctx('aba-1');
    expect(await adquirirTrava(c)).toMatchObject({ obtida: true });

    const d = donoAtual()!;
    expect(d.orgId).toBe(ORG);
    expect(d.tabId).toBe('aba-1');
    expect(d.relatorioId).toBe('rel-1');
    expect(d.tag).toBe('ACA 2040');
    expect(d.nonce).toBe(c.nonce);
    expect(d.expiraEm).toBeGreaterThan(Date.now());
  });

  it('ehDono exige os cinco campos, nonce inclusive', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);

    expect(ehDono(c)).toBe(true);
    expect(ehDono({ ...c, nonce: 'outro' })).toBe(false);
    expect(ehDono({ ...c, tabId: 'aba-2' })).toBe(false);
    expect(ehDono({ ...c, tag: 'OUTRA' })).toBe(false);
    expect(ehDono({ ...c, relatorioId: 'rel-2' })).toBe(false);
    expect(ehDono({ ...c, orgId: 'outra-org' })).toBe(false);
  });
});

describe('trava — duas abas', () => {
  it('a segunda aba é RECUSADA e o registro do dono não muda', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    const antes = localStorage.getItem(CHAVE_DONO);

    const r = await adquirirTrava(ctx('aba-2', 'rel-2'), { esperaMs: 0 });

    expect(r.obtida).toBe(false);
    if (!r.obtida) {
      expect(r.motivo).toBe('ocupado');
      expect(r.dono?.tabId).toBe('aba-1');
    }
    expect(localStorage.getItem(CHAVE_DONO)).toBe(antes); // intocado
  });

  it('a mesma aba pode remontar o mesmo relatório (recarregou a página)', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    expect(await adquirirTrava(a, { esperaMs: 0 })).toMatchObject({ obtida: true });
  });

  it('depois de liberada, a outra aba consegue', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    expect(liberarTrava(a)).toBe(true);
    zerarPosseEmMemoria();

    expect(await adquirirTrava(ctx('aba-2', 'rel-2'), { esperaMs: 0 })).toMatchObject({
      obtida: true,
    });
  });
});

describe('trava — limpeza só pelo dono', () => {
  it('a aba proprietária libera', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    expect(liberarTrava(a)).toBe(true);
    expect(donoAtual()).toBeNull();
  });

  it('outra aba é RECUSADA ao tentar liberar, e o registro permanece', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);

    expect(liberarTrava(ctx('aba-2', 'rel-2'))).toBe(false);
    expect(donoAtual()?.tabId).toBe('aba-1');
  });

  it('nonce diferente na mesma aba também é recusado', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    expect(liberarTrava({ ...a, nonce: 'nonce-falso' })).toBe(false);
    expect(donoAtual()).not.toBeNull();
  });
});

describe('trava — expiração (aba que morreu sem liberar)', () => {
  it('registro vencido é considerado expirado', () => {
    expect(travaExpirada({ ...ctx('aba-1'), expiraEm: Date.now() - 1 })).toBe(true);
    expect(travaExpirada({ ...ctx('aba-1'), expiraEm: Date.now() + 10_000 })).toBe(false);
    expect(travaExpirada(null)).toBe(true);
  });

  it('trava abandonada é tomada pela aba nova', async () => {
    let t = 1_000_000;
    definirRelogio(() => t);

    await adquirirTrava(ctx('aba-morta'));
    expect(donoAtual()?.tabId).toBe('aba-morta');

    // Aba morreu: ninguém renova e ninguém responde ao broadcast.
    zerarPosseEmMemoria();
    t += TTL_TRAVA_MS + 1;

    const r = await adquirirTrava(ctx('aba-nova', 'rel-2'), { esperaMs: 0 });
    expect(r.obtida).toBe(true);
    expect(donoAtual()?.tabId).toBe('aba-nova');
  });

  it('renovar estende o prazo e impede a tomada', async () => {
    let t = 1_000_000;
    definirRelogio(() => t);

    const a = ctx('aba-1');
    await adquirirTrava(a);

    t += TTL_TRAVA_MS - 1_000;
    expect(renovarTrava(a)).toBe(true);

    t += 2_000; // passaria do prazo original, mas foi renovado
    expect(travaExpirada(donoAtual())).toBe(false);
  });

  it('renovar de outra aba é recusado', async () => {
    const a = ctx('aba-1');
    await adquirirTrava(a);
    expect(renovarTrava(ctx('aba-2', 'rel-2'))).toBe(false);
  });
});

describe('trava — fallback sem Web Locks', () => {
  it('o ambiente de teste tem Web Locks (shim do setup)', () => {
    expect(temWebLocks()).toBe(true);
  });

  it('sem Web Locks a trava ainda funciona pelo registro', async () => {
    semWebLocks();
    expect(temWebLocks()).toBe(false);

    const a = ctx('aba-1');
    expect(await adquirirTrava(a, { esperaMs: 0 })).toMatchObject({ obtida: true });
    expect(donoAtual()?.tabId).toBe('aba-1');
  });

  it('sem Web Locks, a segunda aba continua sendo recusada', async () => {
    semWebLocks();
    await adquirirTrava(ctx('aba-1'), { esperaMs: 0 });
    const r = await adquirirTrava(ctx('aba-2', 'rel-2'), { esperaMs: 0 });
    expect(r.obtida).toBe(false);
  });

  it('sem Web Locks, uma aba VIVA responde ao broadcast e impede a tomada', async () => {
    semWebLocks();
    let t = 1_000_000;
    definirRelogio(() => t);

    // Aba 1 toma posse e CONTINUA viva (não zeramos a posse em memória).
    await adquirirTrava(ctx('aba-1'), { esperaMs: 0 });

    // Prazo venceu, mas ela ainda está lá para responder.
    t += TTL_TRAVA_MS + 1;

    const r = await adquirirTrava(ctx('aba-2', 'rel-2'), { esperaMs: 200 });
    expect(r.obtida).toBe(false);
    expect(donoAtual()?.tabId).toBe('aba-1');
  });
});

describe('trava — registro corrompido não trava o app para sempre', () => {
  it('JSON inválido é tratado como ausente', async () => {
    localStorage.setItem(CHAVE_DONO, 'lixo{{{');
    expect(donoAtual()).toBeNull();
    expect(await adquirirTrava(ctx('aba-1'), { esperaMs: 0 })).toMatchObject({ obtida: true });
  });
});
