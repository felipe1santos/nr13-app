import { describe, it, expect, beforeEach } from 'vitest';

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

import { CHAVE_FILA_V1, descartarFilaV1, lerFilaV1, purgarCacheV1 } from './migracaoV1';

beforeEach(() => localStorage.clear());

describe('fila herdada da v1', () => {
  it('lê as operações que a v1 não conseguiu enviar', () => {
    // Como a v1 grava: escritas recusadas pela guarda do servidor.
    localStorage.setItem(
      CHAVE_FILA_V1,
      JSON.stringify([
        { op: 'set', chave: 'nr13_info_ACA 2002', valor: '{"tag":"ACA 2002"}' },
        { op: 'del', chave: 'nr13_info_VELHO' },
      ]),
    );

    expect(lerFilaV1()).toEqual([
      { op: 'set', chave: 'nr13_info_ACA 2002', valor: '{"tag":"ACA 2002"}' },
      { op: 'del', chave: 'nr13_info_VELHO' },
    ]);
  });

  it('descarta entrada malformada sem derrubar as boas', () => {
    localStorage.setItem(
      CHAVE_FILA_V1,
      JSON.stringify([
        { op: 'set', chave: 'nr13_info_A', valor: '{}' },
        { op: 'set', chave: 'nr13_info_B' }, // set sem valor: não dá para reenviar
        { op: 'zzz', chave: 'nr13_info_C' },
        null,
        { chave: '' },
      ]),
    );

    expect(lerFilaV1().map((o) => o.chave)).toEqual(['nr13_info_A']);
  });

  it('conteúdo corrompido não vira exceção nem fila fantasma', () => {
    localStorage.setItem(CHAVE_FILA_V1, '{isso não é json');
    expect(lerFilaV1()).toEqual([]);
  });

  it('descartarFilaV1 remove a chave', () => {
    localStorage.setItem(CHAVE_FILA_V1, '[]');
    descartarFilaV1();
    expect(localStorage.getItem(CHAVE_FILA_V1)).toBeNull();
  });
});

describe('purga do cache da v1', () => {
  it('remove dados e preserva sessão, identidade do aparelho e fila', () => {
    localStorage.setItem('nr13_info_ACA 2002', '{"tag":"ACA 2002"}');
    localStorage.setItem('nr13_fotos_ACA 2002', 'x'.repeat(1000));
    localStorage.setItem('nr13_calc_ACA 2002', '{}');
    localStorage.setItem('nr13_minha_empresa', '{}');
    localStorage.setItem('nr13_usuario_logado', 'cmam.caldeiras@gmail.com');
    localStorage.setItem('nr13_org_id', 'org-1');
    localStorage.setItem('nr13_sessao_token', 'tok');
    localStorage.setItem('nr13_dispositivo_id', 'dev-1');
    localStorage.setItem('nr13_armazenamento_v2', '1');
    localStorage.setItem(CHAVE_FILA_V1, '[]');
    localStorage.setItem('nr13_manifesto_pendencias_org-1', '[]');
    localStorage.setItem('nr13_demo_seed', '{"v":1}');
    localStorage.setItem('chave_de_outro_app', 'fica');

    const removidas = purgarCacheV1();

    expect(removidas).toBe(4);
    expect(localStorage.getItem('nr13_info_ACA 2002')).toBeNull();
    expect(localStorage.getItem('nr13_fotos_ACA 2002')).toBeNull();
    expect(localStorage.getItem('nr13_minha_empresa')).toBeNull();
    // Apagar qualquer uma destas derrubaria a sessão, a fila ou o palco.
    expect(localStorage.getItem('nr13_usuario_logado')).toBe('cmam.caldeiras@gmail.com');
    expect(localStorage.getItem('nr13_org_id')).toBe('org-1');
    expect(localStorage.getItem('nr13_sessao_token')).toBe('tok');
    expect(localStorage.getItem('nr13_dispositivo_id')).toBe('dev-1');
    expect(localStorage.getItem('nr13_armazenamento_v2')).toBe('1');
    expect(localStorage.getItem(CHAVE_FILA_V1)).toBe('[]');
    expect(localStorage.getItem('nr13_manifesto_pendencias_org-1')).toBe('[]');
    expect(localStorage.getItem('nr13_demo_seed')).toBe('{"v":1}');
    expect(localStorage.getItem('chave_de_outro_app')).toBe('fica');
  });

  it('não mexe em nada enquanto houver palco montado e VIVO', () => {
    // As chaves do palco são indistinguíveis do cache antigo; apagá-las no meio
    // da montagem sai como folha em branco no documento.
    localStorage.setItem('nr13_palco_manifesto', '{"chaves":[]}');
    localStorage.setItem(
      'nr13_palco_dono',
      JSON.stringify({ tabId: 'aba-1', expiraEm: Date.now() + 60_000 }),
    );
    localStorage.setItem('nr13_info_ACA 2002', '{"tag":"ACA 2002"}');

    expect(purgarCacheV1()).toBe(0);
    expect(localStorage.getItem('nr13_info_ACA 2002')).not.toBeNull();
  });

  it('palco ÓRFÃO (trava vencida) não bloqueia a purga — e sai junto', () => {
    // Aba fechada no meio do relatório deixa o manifesto para trás e nenhuma
    // outra aba pode limpá-lo. Sem esta regra, um manifesto de dias atrás — de
    // outra organização, inclusive — trancava a purga para sempre.
    localStorage.setItem('nr13_palco_manifesto', '{"chaves":[]}');
    localStorage.setItem(
      'nr13_palco_dono',
      JSON.stringify({ tabId: 'aba-morta', expiraEm: Date.now() - 60_000 }),
    );
    localStorage.setItem('nr13_info_ACA 2002', '{"tag":"ACA 2002"}');

    expect(purgarCacheV1()).toBe(3);
    expect(localStorage.getItem('nr13_info_ACA 2002')).toBeNull();
    expect(localStorage.getItem('nr13_palco_manifesto')).toBeNull();
    expect(localStorage.getItem('nr13_palco_dono')).toBeNull();
  });

  it('manifesto sem registro de dono também é órfão', () => {
    localStorage.setItem('nr13_palco_manifesto', '{"chaves":[]}');
    localStorage.setItem('nr13_info_ACA 2002', '{"tag":"ACA 2002"}');

    expect(purgarCacheV1()).toBe(2); // manifesto + a chave de dado
    expect(localStorage.getItem('nr13_info_ACA 2002')).toBeNull();
  });
});
