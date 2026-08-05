// Setup central dos testes. O Vitest deste repo roda em `environment: 'node'`
// (ver vite.config.ts), onde não existe localStorage, IndexedDB, BroadcastChannel
// nem navigator.locks — todos usados pelo armazenamento offline-first.
//
// Os arquivos de teste que já instalavam o shim de localStorage à mão
// (storage.gate.test.ts, vencimentos.test.ts, auth.test.ts) checam
// `typeof === 'undefined'` antes, então continuam funcionando sem alteração.
import 'fake-indexeddb/auto';

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

// BroadcastChannel: canais por nome, compartilhados dentro do processo. É o que
// permite simular DUAS ABAS num teste — duas instâncias do mesmo nome conversam.
if (typeof globalThis.BroadcastChannel === 'undefined') {
  interface CanalFalso {
    name: string;
    onmessage: ((e: { data: unknown }) => void) | null;
  }
  const canais = new Map<string, Set<CanalFalso>>();
  (globalThis as Record<string, unknown>).BroadcastChannel = class implements CanalFalso {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor(public name: string) {
      if (!canais.has(name)) canais.set(name, new Set());
      canais.get(name)!.add(this);
    }
    postMessage(data: unknown): void {
      for (const outro of canais.get(this.name) ?? []) {
        // O canal que postou não recebe a própria mensagem (igual ao navegador).
        if (outro !== this) outro.onmessage?.({ data });
      }
    }
    close(): void {
      canais.get(this.name)?.delete(this);
    }
  };
}

if (typeof globalThis.navigator === 'undefined') {
  (globalThis as Record<string, unknown>).navigator = {};
}

// Web Locks: trava exclusiva por nome. `ifAvailable: true` com a trava ocupada
// chama a função com null — é assim que a segunda aba descobre que o palco já
// tem dono, em vez de ficar esperando.
if (!(globalThis.navigator as Navigator & { locks?: unknown }).locks) {
  const travados = new Set<string>();
  (globalThis.navigator as unknown as Record<string, unknown>).locks = {
    async request(
      nome: string,
      opcoes: { ifAvailable?: boolean },
      fn: (lock: unknown) => unknown,
    ): Promise<unknown> {
      if (travados.has(nome)) {
        if (opcoes?.ifAvailable) return fn(null);
        return undefined;
      }
      travados.add(nome);
      try {
        return await fn({ name: nome });
      } finally {
        travados.delete(nome);
      }
    },
  };
}
