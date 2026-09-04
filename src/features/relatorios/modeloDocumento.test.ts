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
  MODELOS_OFERECIDOS,
  MODELOS_VISIVEIS,
  definirModeloDaEmpresa,
  modeloDaEmpresa,
  modeloDoMotor,
  modeloEfetivo,
  modeloGravado,
  modeloOferecido,
  motorDoModelo,
  motorDoRelatorio,
  normalizarModelo,
} from './modeloDocumento';
import { CHAVE_MOTOR_PDF } from './motorPdf';

beforeEach(() => localStorage.clear());

describe('modelo × motor — duas camadas, uma tradução', () => {
  it('a tradução mora num lugar só', () => {
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

describe('NENHUM modelo oferecido pode sair pelo raster', () => {
  // A regra do gate de 04/09/2026, e o teste que a torna difícil de quebrar por
  // acidente: devolver um modelo à lista sem lhe dar um layout vetorial quebra
  // aqui — não em produção, num relatório assinado.
  it('todo modelo da lista oferecida gera pelo motor vetorial', () => {
    expect(MODELOS_OFERECIDOS.length).toBeGreaterThan(0);
    for (const m of MODELOS_OFERECIDOS) {
      expect(motorDoModelo(m)).toBe('vetorial');
    }
  });

  it('a tela mostra exatamente os modelos oferecidos', () => {
    expect(MODELOS_VISIVEIS.map((m) => m.valor)).toEqual(MODELOS_OFERECIDOS);
    expect(MODELOS_VISIVEIS.every((m) => m.rotulo && m.descricao)).toBe(true);
  });

  it('o Clássico está fora da oferta enquanto só existir em raster', () => {
    expect(modeloOferecido('classico')).toBe(false);
    expect(modeloOferecido('novo')).toBe(true);
  });

  it('modelo retirado cai no oferecido — e não no raster', () => {
    expect(modeloEfetivo('classico')).toBe('novo');
    expect(motorDoModelo('classico')).toBe('vetorial');
  });

  it('o raster continua alcançável — mas SÓ pela porta de rollback', () => {
    expect(motorDoRelatorio({ modeloDocumento: 'novo' }, '?motor=raster')).toBe('raster');
    expect(motorDoRelatorio(null, '?motor=raster')).toBe('raster');
  });
});

describe('a configuração é da ORGANIZAÇÃO', () => {
  it('o que está GRAVADO e o que VALE são coisas separadas', async () => {
    // Uma org pode ter `classico` gravado — ela não perdeu a escolha, está
    // esperando o layout Clássico vetorial existir. Mas o que sai no PDF hoje é
    // o modelo oferecido.
    await definirModeloDaEmpresa('classico');
    expect(modeloGravado()).toBe('classico');
    expect(modeloDaEmpresa()).toBe('novo');
  });

  it('grava e lê a escolha', async () => {
    await definirModeloDaEmpresa('novo');
    expect(modeloGravado()).toBe('novo');
    expect(modeloDaEmpresa()).toBe('novo');
    await definirModeloDaEmpresa('classico');
    expect(modeloGravado()).toBe('classico');
  });

  it('HERDA o motor já configurado quando a chave nova não existe', () => {
    // A organização virada em 04/09/2026 tem `nr13_motor_pdf = vetorial` e
    // NENHUMA chave de modelo. Ler só a chave nova a rebaixaria para Clássico
    // sem ninguém ter pedido — o documento mudaria de cara sozinho.
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    expect(modeloGravado()).toBe('novo');
    expect(modeloDaEmpresa()).toBe('novo');
  });

  it('a chave nova VENCE o motor herdado', async () => {
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    await definirModeloDaEmpresa('classico');
    expect(modeloGravado()).toBe('classico');
  });

  it('sem chave nenhuma, o gravado é Clássico e o efetivo é o oferecido', () => {
    expect(modeloGravado()).toBe('classico');
    expect(modeloDaEmpresa()).toBe('novo');
  });
});

describe('motorDoRelatorio — o modelo congela no rascunho', () => {
  it('rascunho criado no Novo continua Novo depois da empresa mudar', async () => {
    await definirModeloDaEmpresa('novo');
    const meta = { modeloDocumento: 'novo' };
    await definirModeloDaEmpresa('classico');
    expect(motorDoRelatorio(meta)).toBe('vetorial');
  });

  it('rascunho congelado num modelo RETIRADO sai pelo oferecido, não pelo raster', async () => {
    // Abre mão de parte do congelamento de propósito: congelar serve para o
    // desenho não mudar debaixo do usuário, não para manter vivo um desenho que
    // o sistema retirou. A alternativa seria emitir a fotografia.
    await definirModeloDaEmpresa('novo');
    expect(motorDoRelatorio({ modeloDocumento: 'classico' })).toBe('vetorial');
  });

  it('rascunho ANTIGO, sem o campo, segue a configuração atual', async () => {
    await definirModeloDaEmpresa('novo');
    expect(motorDoRelatorio({})).toBe('vetorial');
    expect(motorDoRelatorio(null)).toBe('vetorial');
    expect(motorDoRelatorio(undefined)).toBe('vetorial');
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

  it('valor estranho no campo congelado não explode — e não vira raster', () => {
    expect(motorDoRelatorio({ modeloDocumento: 'sei-la' })).toBe('vetorial');
  });
});
