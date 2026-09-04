import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  definirModeloDaEmpresa,
  modeloDaEmpresa,
  modeloDoMotor,
  motorDoModelo,
  motorDoRelatorio,
  normalizarModelo,
} from './modeloDocumento';
import { CHAVE_MOTOR_PDF } from './motorPdf';

beforeEach(() => localStorage.clear());

describe('modelo × motor — duas camadas, uma tradução', () => {
  it('a tradução é 1:1 e mora num lugar só', () => {
    expect(motorDoModelo('classico')).toBe('raster');
    expect(motorDoModelo('novo')).toBe('vetorial');
    expect(modeloDoMotor('raster')).toBe('classico');
    expect(modeloDoMotor('vetorial')).toBe('novo');
  });

  it('só a string exata `novo` escolhe o modelo novo', () => {
    expect(normalizarModelo('novo')).toBe('novo');
    expect(normalizarModelo(' NOVO ')).toBe('novo');
    expect(normalizarModelo('vetorial')).toBe('classico'); // termo técnico NÃO vale como modelo
    expect(normalizarModelo('nova')).toBe('classico');
    expect(normalizarModelo(undefined)).toBe('classico');
    expect(normalizarModelo(null)).toBe('classico');
    expect(normalizarModelo(1)).toBe('classico');
  });
});

describe('a configuração é da ORGANIZAÇÃO', () => {
  it('sem chave nenhuma, o padrão é Clássico', () => {
    expect(modeloDaEmpresa()).toBe('classico');
  });

  it('grava e lê a escolha', async () => {
    await definirModeloDaEmpresa('novo');
    expect(modeloDaEmpresa()).toBe('novo');
    await definirModeloDaEmpresa('classico');
    expect(modeloDaEmpresa()).toBe('classico');
  });

  it('HERDA o motor já configurado quando a chave nova não existe', () => {
    // A organização virada em 04/09/2026 tem `nr13_motor_pdf = vetorial` e
    // NENHUMA chave de modelo. Ler só a chave nova a rebaixaria para Clássico
    // sem ninguém ter pedido — o documento mudaria de cara sozinho.
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    expect(modeloDaEmpresa()).toBe('novo');
  });

  it('a chave nova VENCE o motor herdado', async () => {
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    await definirModeloDaEmpresa('classico');
    expect(modeloDaEmpresa()).toBe('classico');
  });
});

describe('motorDoRelatorio — o modelo congela no rascunho', () => {
  it('rascunho criado no Clássico continua Clássico depois da empresa virar', async () => {
    await definirModeloDaEmpresa('classico');
    const meta = { modeloDocumento: 'classico' };
    await definirModeloDaEmpresa('novo'); // a empresa muda DEPOIS
    expect(motorDoRelatorio(meta)).toBe('raster');
  });

  it('rascunho criado no Novo continua Novo depois da empresa voltar', async () => {
    await definirModeloDaEmpresa('novo');
    const meta = { modeloDocumento: 'novo' };
    await definirModeloDaEmpresa('classico');
    expect(motorDoRelatorio(meta)).toBe('vetorial');
  });

  it('rascunho ANTIGO, sem o campo, segue a configuração atual', async () => {
    await definirModeloDaEmpresa('novo');
    expect(motorDoRelatorio({})).toBe('vetorial');
    expect(motorDoRelatorio(null)).toBe('vetorial');
    await definirModeloDaEmpresa('classico');
    expect(motorDoRelatorio(undefined)).toBe('raster');
  });

  it('`?motor=` na URL vence tudo — é a porta de rollback', async () => {
    await definirModeloDaEmpresa('classico');
    expect(motorDoRelatorio({ modeloDocumento: 'classico' }, '?motor=vetorial')).toBe('vetorial');
    await definirModeloDaEmpresa('novo');
    expect(motorDoRelatorio({ modeloDocumento: 'novo' }, '?motor=raster')).toBe('raster');
  });

  it('parâmetro vazio NÃO conta como decisão', async () => {
    await definirModeloDaEmpresa('novo');
    expect(motorDoRelatorio({}, '?motor=')).toBe('vetorial');
    expect(motorDoRelatorio({}, '?motor=%20')).toBe('vetorial');
  });

  it('valor estranho no campo congelado cai no Clássico, não explode', () => {
    expect(motorDoRelatorio({ modeloDocumento: 'sei-la' })).toBe('raster');
  });
});
