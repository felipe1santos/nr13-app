import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classificarUso,
  medir,
  ultimaMedida,
  garantirPersistencia,
  zerarEstadoPersistencia,
  zerarMedidas,
  permiteOperacao,
  LIMIAR_AVISO,
  LIMIAR_CRITICO,
} from './quotaDispositivo';

/** Substitui navigator.storage. `undefined` remove o navigator inteiro. */
function comStorage(storage: unknown | undefined): void {
  const nav = storage === undefined ? undefined : { storage };
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
}

const navReal = globalThis.navigator;

beforeEach(() => {
  zerarEstadoPersistencia();
  zerarMedidas();
  Object.defineProperty(globalThis, 'navigator', {
    value: navReal,
    configurable: true,
    writable: true,
  });
});

describe('classificarUso — limiares exatos', () => {
  it('79,99% -> normal', () => {
    expect(classificarUso(7999, 10000).estado).toBe('normal');
  });

  it('exatamente 80% -> aviso', () => {
    expect(classificarUso(8000, 10000).estado).toBe('aviso');
  });

  it('94,99% -> aviso', () => {
    expect(classificarUso(9499, 10000).estado).toBe('aviso');
  });

  it('exatamente 95% -> critico', () => {
    expect(classificarUso(9500, 10000).estado).toBe('critico');
  });

  it('acima de 95% -> critico', () => {
    expect(classificarUso(9999, 10000).estado).toBe('critico');
  });

  it('0% -> normal', () => {
    expect(classificarUso(0, 10000).estado).toBe('normal');
  });

  it('os limiares publicados são 0.8 e 0.95', () => {
    expect(LIMIAR_AVISO).toBe(0.8);
    expect(LIMIAR_CRITICO).toBe(0.95);
  });
});

describe('classificarUso — valores inconsistentes viram desconhecido', () => {
  const casos: Array<[string, number | null | undefined, number | null | undefined]> = [
    ['usage ausente', undefined, 10000],
    ['quota ausente', 5000, undefined],
    ['ambos ausentes', undefined, undefined],
    ['usage nulo', null, 10000],
    ['quota nula', 5000, null],
    ['quota zero', 500, 0],
    ['usage maior que quota', 12000, 10000],
    ['usage negativo', -1, 10000],
    ['quota negativa', 500, -10],
    ['usage NaN', Number.NaN, 10000],
    ['quota Infinity', 500, Number.POSITIVE_INFINITY],
  ];

  for (const [nome, usage, quota] of casos) {
    it(`${nome} -> desconhecido, sem percentual`, () => {
      const m = classificarUso(usage as number, quota as number);
      expect(m.estado).toBe('desconhecido');
      expect(m.percentual).toBeNull();
    });
  }

  it('desconhecido NÃO é apresentado como espaço suficiente', () => {
    const m = classificarUso(500, 0);
    expect(m.estado).not.toBe('normal');
    expect(m.percentual).toBeNull();
  });
});

describe('medir — suporte ausente é tratado caso a caso', () => {
  it('sem navigator -> desconhecido, sem lançar', async () => {
    comStorage(undefined);
    const m = await medir('boot');
    expect(m.estado).toBe('desconhecido');
    expect(m.persistencia).toBe('indisponivel');
  });

  it('navigator sem storage -> desconhecido', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect((await medir('boot')).estado).toBe('desconhecido');
  });

  it('storage sem estimate -> desconhecido, mas não quebra', async () => {
    comStorage({ persist: async () => true });
    const m = await medir('boot');
    expect(m.estado).toBe('desconhecido');
    expect(m.usage).toBeNull();
  });

  it('estimate() rejeitando -> desconhecido com motivo técnico', async () => {
    comStorage({
      estimate: async () => {
        throw new Error('SecurityError: acesso negado');
      },
    });
    const m = await medir('boot');
    expect(m.estado).toBe('desconhecido');
    expect(m.motivo).not.toBeNull();
    expect(m.motivo?.detalhe.mensagemOriginal).toContain('SecurityError');
  });

  it('estimate normal -> mede e calcula o percentual', async () => {
    comStorage({ estimate: async () => ({ usage: 8_500, quota: 10_000 }) });
    const m = await medir('boot');
    expect(m.estado).toBe('aviso');
    expect(m.usage).toBe(8_500);
    expect(m.quota).toBe(10_000);
    expect(m.percentual).toBeCloseTo(0.85);
  });

  it('ultimaMedida guarda o resultado (não precisa medir a cada tecla)', async () => {
    comStorage({ estimate: async () => ({ usage: 100, quota: 10_000 }) });
    expect(ultimaMedida()).toBeNull();
    await medir('boot');
    expect(ultimaMedida()?.estado).toBe('normal');
    expect(ultimaMedida()?.motivoDaMedicao).toBe('boot');
  });
});

describe('persistência — tentativa, nunca garantia', () => {
  it('concedida quando persist() devolve true', async () => {
    comStorage({ persist: async () => true, persisted: async () => false });
    expect(await garantirPersistencia()).toBe('concedida');
  });

  it('recusada quando persist() devolve false — e não bloqueia nada', async () => {
    comStorage({ persist: async () => false, persisted: async () => false });
    expect(await garantirPersistencia()).toBe('recusada');
    comStorage({
      persist: async () => false,
      persisted: async () => false,
      estimate: async () => ({ usage: 10, quota: 10_000 }),
    });
    const m = await medir('boot');
    expect(m.podeGravarPesado).toBe(true); // recusa não impede o uso do app
  });

  it('API ausente -> indisponivel', async () => {
    comStorage({});
    expect(await garantirPersistencia()).toBe('indisponivel');
  });

  it('sem navigator -> indisponivel', async () => {
    comStorage(undefined);
    expect(await garantirPersistencia()).toBe('indisponivel');
  });

  it('persist() lançando -> desconhecida, sem derrubar o boot', async () => {
    comStorage({
      persist: async () => {
        throw new Error('bloqueado');
      },
      persisted: async () => false,
    });
    expect(await garantirPersistencia()).toBe('desconhecida');
  });

  it('já concedida antes: consulta persisted() e NÃO pede de novo', async () => {
    const persist = vi.fn(async () => true);
    comStorage({ persist, persisted: async () => true });
    expect(await garantirPersistencia()).toBe('concedida');
    expect(persist).not.toHaveBeenCalled();
  });

  it('não fica solicitando repetidamente: pede uma vez por sessão', async () => {
    const persist = vi.fn(async () => false);
    comStorage({ persist, persisted: async () => false });

    await garantirPersistencia();
    await garantirPersistencia();
    await garantirPersistencia();

    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('permiteOperacao — crítico não pode travar o resgate', () => {
  it('estado crítico bloqueia gravação pesada', () => {
    expect(permiteOperacao('pesada', 'critico')).toBe(false);
  });

  it('estado crítico PERMITE operação leve (dado estrutural, fila)', () => {
    expect(permiteOperacao('leve', 'critico')).toBe(true);
  });

  it('estado crítico PERMITE sincronizar — é como o espaço é liberado', () => {
    expect(permiteOperacao('sincronizacao', 'critico')).toBe(true);
  });

  it('estado crítico PERMITE excluir e liberar espaço', () => {
    expect(permiteOperacao('liberacao', 'critico')).toBe(true);
  });

  it('aviso não bloqueia nada', () => {
    for (const op of ['leve', 'pesada', 'sincronizacao', 'liberacao'] as const) {
      expect(permiteOperacao(op, 'aviso')).toBe(true);
    }
  });

  it('desconhecido não bloqueia: sem medida, o navegador é quem recusa na hora', () => {
    expect(permiteOperacao('pesada', 'desconhecido')).toBe(true);
  });

  it('podeGravarPesado da medida acompanha o estado', async () => {
    comStorage({ estimate: async () => ({ usage: 9_800, quota: 10_000 }) });
    const m = await medir('antes_gravacao_pesada');
    expect(m.estado).toBe('critico');
    expect(m.podeGravarPesado).toBe(false);
  });
});

describe('o módulo NUNCA apaga nada por conta própria', () => {
  it('nenhuma função toca em deleteDatabase, clear ou removeItem', async () => {
    // O ambiente de teste roda em node: localStorage é um objeto simples,
    // sem a classe Storage do navegador. Espiona a instância direto.
    const del = vi.spyOn(indexedDB, 'deleteDatabase');
    const clear = vi.spyOn(localStorage, 'clear');
    const remove = vi.spyOn(localStorage, 'removeItem');

    comStorage({
      estimate: async () => ({ usage: 9_999, quota: 10_000 }), // crítico
      persist: async () => false,
      persisted: async () => false,
    });

    await medir('boot');
    await medir('apos_quota_excedida');
    await garantirPersistencia();
    permiteOperacao('pesada', 'critico');
    classificarUso(9_999, 10_000);

    expect(del).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    del.mockRestore();
    clear.mockRestore();
    remove.mockRestore();
  });
});
