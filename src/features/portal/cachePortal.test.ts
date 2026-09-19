/**
 * Cache do Portal: o SERVIDOR é a verdade, o cache só acelera (19/09/2026).
 *
 * O defeito: `semearCache` gravava tudo com versão fixa 1 por `aplicarRemoto`,
 * que só aceita o MAIS NOVO. Depois da primeira visita, nada mais entrava — o
 * navegador que já tinha aberto o Portal não via documento emitido depois. E o
 * que o servidor deixava de mandar (o rascunho que agora a Edge filtra, uma TAG
 * desvinculada) ficava no cache para sempre.
 *
 * Roda sobre o IndexedDB de verdade (fake-indexeddb), no MESMO "navegador": o
 * cache não é zerado entre as cargas, como no E2E.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

const ORG = '22222222-2222-2222-2222-222222222222';
vi.mock('../../services/supabase', async () => {
  const real = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase');
  return { ...real, escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })) };
});

import * as cache from '../../services/cacheLocal';
import { definirArmazenamentoV2, zerarFlagEmMemoria } from '../../services/flag';
import { ler, semearCachePortal } from '../../services/storage';

const lista = (...ids: string[]) => JSON.stringify(ids.map((id) => ({ id, status: 'emitido' })));
const TAG = 'ZZ-P';

beforeEach(() => {
  zerarFlagEmMemoria();
  definirArmazenamentoV2(true);
  localStorage.setItem('nr13_papel', 'cliente');
});

describe('mesmo navegador, cargas sucessivas', () => {
  it('documento novo aparece mesmo com a MESMA versão; o que saiu do retrato some; persiste no disco', async () => {
    const K = `nr13_calibracoes_${TAG}`;
    // 1ª visita: A (+ uma chave que depois deixa de vir)
    await semearCachePortal({ [K]: lista('A'), [`nr13_laudo_${TAG}`]: '{"apto":true}' }, { versoes: { [K]: 1 }, retratoCompleto: true });
    expect((ler<Array<{ id: string }>>(K) ?? []).map((c) => c.id)).toEqual(['A']);

    // 2ª visita, SEM limpar nada: A+B — versão igual de propósito (era o que congelava)
    await semearCachePortal({ [K]: lista('A', 'B') }, { versoes: { [K]: 1 }, retratoCompleto: true });
    expect((ler<Array<{ id: string }>>(K) ?? []).map((c) => c.id)).toEqual(['A', 'B']);
    expect(ler(`nr13_laudo_${TAG}`)).toBeNull();
    expect(cache.obterRegistro(K)?.versao).toBe(1); // versão REAL do servidor, não uma constante

    // "F5 / fechar e reabrir": a memória some, o disco fica
    cache.zerarMemoria();
    await cache.hidratarDoDisco();
    expect((ler<Array<{ id: string }>>(K) ?? []).map((c) => c.id)).toEqual(['A', 'B']);
    expect(ler(`nr13_laudo_${TAG}`)).toBeNull();
  });

  it('rascunho que entrou no cache por uma Edge antiga deixa de ser exposto', async () => {
    const K = `nr13_calibracoes_${TAG}`;
    const comRascunho = JSON.stringify([{ id: 'A', status: 'emitido' }, { id: 'R', status: 'rascunho' }]);
    await semearCachePortal({ [K]: comRascunho }, { versoes: { [K]: 4 }, retratoCompleto: true });
    await semearCachePortal({ [K]: lista('A') }, { versoes: { [K]: 4 }, retratoCompleto: true });
    expect(cache.obterRegistro(K)?.valor).not.toContain('rascunho');
  });

  it('sob demanda NÃO apaga o resto; e só o cliente tem o cache podado', async () => {
    await semearCachePortal({ [`nr13_info_${TAG}`]: '{}' }, { retratoCompleto: true });
    await semearCachePortal({ [`nr13_rel_R_${TAG}`]: '{"id":"R"}' }, { versoes: { [`nr13_rel_R_${TAG}`]: 2 } });
    expect(ler(`nr13_info_${TAG}`)).not.toBeNull();
    expect(ler(`nr13_rel_R_${TAG}`)).not.toBeNull();

    localStorage.setItem('nr13_papel', 'mestre');
    await semearCachePortal({ [`nr13_info_${TAG}`]: '{}' }, { retratoCompleto: true });
    expect(ler(`nr13_rel_R_${TAG}`)).not.toBeNull(); // conta interna: nada é apagado por ausência
  });

  it('sem versão da Edge (Edge anterior) ainda substitui — a versão não é mais o que decide', async () => {
    const K = `nr13_calibracoes_${TAG}`;
    await semearCachePortal({ [K]: lista('A') }, { retratoCompleto: true });
    await semearCachePortal({ [K]: lista('A', 'C') }, { retratoCompleto: true });
    expect((ler<Array<{ id: string }>>(K) ?? []).map((c) => c.id)).toEqual(['A', 'C']);
    expect(cache.obterRegistro(K)?.versao).toBe(0);
  });

  it('a regra no código: nenhuma versão fixa, nenhum aplicarRemoto na semeadura do Portal', () => {
    const src = readFileSync('src/services/storageV2.ts', 'utf8');
    const i = src.indexOf('export async function semearCache(');
    const corpo = src.slice(i, src.indexOf('\n}\n', i));
    expect(corpo).not.toContain('aplicarRemoto');
    expect(corpo).not.toMatch(/versao:\s*1\b/);
    expect(corpo).toContain('opcoes.retratoCompleto && ehCliente()');
  });
});

import { readFileSync } from 'node:fs';
