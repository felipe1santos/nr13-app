import { beforeEach, describe, expect, it } from 'vitest';
import { obterOuCriarMeta, gravarCroqui3d, excluirProntuario } from '../prontuarioService';

// vitest roda em node (sem DOM): shim mínimo de localStorage p/ o motor de prontuário.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

describe('meta do prontuário', () => {
  beforeEach(() => localStorage.clear());

  it('cria meta com numero REL- e data pt-BR na primeira chamada', async () => {
    const meta = await obterOuCriarMeta('VASO-01');
    expect(meta.numero).toMatch(/^REL-\d+$/);
    expect(meta.emissao).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(JSON.parse(localStorage.getItem('nr13_prontuario_meta_VASO-01')!)).toEqual(meta);
  });

  it('reusa meta existente (numero estável entre reimpressões)', async () => {
    const primeira = await obterOuCriarMeta('VASO-01');
    const segunda = await obterOuCriarMeta('VASO-01');
    expect(segunda).toEqual(primeira);
  });

  it('grava croqui 3D na chave por TAG', async () => {
    await gravarCroqui3d('VASO-01', 'data:image/png;base64,AAA');
    expect(localStorage.getItem('nr13_croqui3d_VASO-01')).toContain('AAA');
  });

  it('excluirProntuario limpa dados, meta e croqui', async () => {
    localStorage.setItem('nr13_prontuario_VASO-01', '{}');
    await obterOuCriarMeta('VASO-01');
    await gravarCroqui3d('VASO-01', 'x');
    await excluirProntuario('VASO-01');
    expect(localStorage.getItem('nr13_prontuario_VASO-01')).toBeNull();
    expect(localStorage.getItem('nr13_prontuario_meta_VASO-01')).toBeNull();
    expect(localStorage.getItem('nr13_croqui3d_VASO-01')).toBeNull();
  });
});
