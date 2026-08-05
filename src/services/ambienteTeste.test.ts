import { describe, it, expect } from 'vitest';

// Fumaça do setup central (vitest.setup.ts). O Vitest roda em environment
// 'node': sem estes shims, metade do armazenamento offline-first não é
// testável — e um teste que "passa" porque a API não existe é pior que nenhum.
describe('ambiente de teste', () => {
  it('tem IndexedDB disponível', () => {
    expect(typeof indexedDB).toBe('object');
    expect(typeof indexedDB.open).toBe('function');
  });

  it('IndexedDB abre, grava e lê de volta', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('nr13_smoke', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('s');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('s', 'readwrite');
      tx.objectStore('s').put({ v: 1 }, 'k');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const lido = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('s', 'readonly');
      const req = tx.objectStore('s').get('k');
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });

    expect(lido).toEqual({ v: 1 });
    db.close();
  });

  it('tem localStorage disponível', () => {
    localStorage.setItem('x', '1');
    expect(localStorage.getItem('x')).toBe('1');
    localStorage.clear();
  });

  it('BroadcastChannel entrega entre duas instâncias (simula duas abas)', async () => {
    const a = new BroadcastChannel('nr13_smoke_canal');
    const b = new BroadcastChannel('nr13_smoke_canal');
    const recebida = new Promise<unknown>((resolve) => {
      b.onmessage = (e) => resolve(e.data);
    });
    a.postMessage({ oi: true });
    expect(await recebida).toEqual({ oi: true });
    a.close();
    b.close();
  });

  it('BroadcastChannel não devolve a mensagem para quem postou', async () => {
    const a = new BroadcastChannel('nr13_smoke_eco');
    let recebeu = false;
    a.onmessage = () => {
      recebeu = true;
    };
    a.postMessage({ x: 1 });
    await Promise.resolve();
    expect(recebeu).toBe(false);
    a.close();
  });

  it('Web Locks concede a trava livre', async () => {
    const r = await navigator.locks.request('nr13_smoke_lock', { ifAvailable: true }, (lock) => {
      expect(lock).not.toBeNull();
      return 'ok';
    });
    expect(r).toBe('ok');
  });

  it('Web Locks recusa (lock null) quando já está ocupada — é como a 2ª aba descobre', async () => {
    await navigator.locks.request('nr13_smoke_ocupada', { ifAvailable: true }, async () => {
      const interno = await navigator.locks.request(
        'nr13_smoke_ocupada',
        { ifAvailable: true },
        (lock) => lock === null,
      );
      expect(interno).toBe(true);
    });
  });
});
