import { describe, it, expect, beforeEach } from 'vitest';
import { abrirDb, apagarDb, fecharDb, aplicarAtomico, listarTudo } from './db';

/**
 * O upgrade do schema é o ÚNICO passo não reversível da Fase 3: `indexedDB.open`
 * com versão menor falha, então um aparelho que subiu para v2 não volta para v1.
 * Ele é seguro por ser puramente ADITIVO — mas "puramente aditivo" é uma
 * afirmação sobre o código, e afirmação sobre código se prova com teste.
 *
 * O que este arquivo garante: abrir na versão nova não perde nada do que já
 * estava gravado. Perder a store `fila` aqui significaria perder inspeção feita
 * offline que ainda não subiu.
 */

const ORG = '44444444-4444-4444-4444-444444444444';

/** Abre o banco na versão ANTIGA, como um aparelho que ainda não atualizou. */
function abrirV1(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(`nr13_dados_${ORG}`, 1);
    req.onupgradeneeded = () => {
      for (const s of ['dados', 'fila', 'tombstones', 'meta']) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function gravarV1(db: IDBDatabase, store: string, chave: string, valor: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valor, chave);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

beforeEach(async () => {
  fecharDb();
  await apagarDb(ORG);
});

describe('upgrade do schema v1 → v2', () => {
  it('preserva dados, fila, tombstones e meta', async () => {
    const v1 = await abrirV1();
    await gravarV1(v1, 'dados', 'nr13_info_A', { valor: '{"tag":"A"}', versao: 3 });
    await gravarV1(v1, 'fila', 'mut-1', { mutationId: 'mut-1', chave: 'nr13_info_A' });
    await gravarV1(v1, 'tombstones', 'nr13_info_B', { chave: 'nr13_info_B', versao: 2 });
    await gravarV1(v1, 'meta', 'marca', '2026-08-01T00:00:00.000Z');
    v1.close();

    // Agora o aparelho atualiza: abrirDb usa a versão nova.
    const db = await abrirDb(ORG);

    expect(db.version).toBe(2);
    expect(await listarTudo<{ versao: number }>(ORG, 'dados')).toEqual([
      { chave: 'nr13_info_A', valor: { valor: '{"tag":"A"}', versao: 3 } },
    ]);
    expect(await listarTudo<unknown>(ORG, 'fila')).toHaveLength(1);
    expect(await listarTudo<unknown>(ORG, 'tombstones')).toHaveLength(1);
    expect(await listarTudo<unknown>(ORG, 'meta')).toHaveLength(1);
  });

  it('cria a store `conflitos`, vazia', async () => {
    const v1 = await abrirV1();
    v1.close();

    const db = await abrirDb(ORG);

    expect([...db.objectStoreNames]).toContain('conflitos');
    expect(await listarTudo<unknown>(ORG, 'conflitos')).toEqual([]);
  });

  it('a store nova aceita escrita atômica junto com as antigas', async () => {
    await abrirDb(ORG);
    await aplicarAtomico(ORG, [
      { store: 'dados', acao: 'put', chave: 'k', valor: { valor: 'v', versao: 1 } },
      { store: 'conflitos', acao: 'put', chave: 'k', valor: { chave: 'k' } },
    ]);

    expect(await listarTudo<unknown>(ORG, 'conflitos')).toHaveLength(1);
  });

  it('banco novo (sem v1 anterior) nasce direto com as cinco stores', async () => {
    const db = await abrirDb(ORG);
    for (const s of ['dados', 'fila', 'tombstones', 'meta', 'conflitos']) {
      expect([...db.objectStoreNames]).toContain(s);
    }
  });
});
