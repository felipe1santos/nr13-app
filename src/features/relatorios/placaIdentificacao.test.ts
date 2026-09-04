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

import { salvar } from '../../services/storage';
import {
  camposDaPlaca,
  chavePlaca,
  lerPlacaReal,
  removerPlacaReal,
  temPlacaReal,
  type PlacaReal,
} from './placaIdentificacao';
import { FORA_DO_PALCO } from '../../services/palco';
import { escopoDaChave, tagDaChave } from '../../services/familiasChave';

const TAG = 'VP-PLACA';

const REGISTRO: PlacaReal = {
  ref: { bucket: 'inspecao', path: 'org/placa/abc.jpg', mimeType: 'image/jpeg', tamanho: 120_000 },
  proporcao: 2.4,
  enviadoEm: '2026-09-04T21:00:00.000Z',
};

beforeEach(() => localStorage.clear());

describe('placa RECONSTRUÍDA: dados reais, nada inventado', () => {
  const equipamento = {
    'IDENTIFICAÇÃO / T.A.G.': 'VP-001',
    FABRICANTE: 'Metalúrgica X',
    'NÚMERO DE SÉRIE': '12345',
    'ANO DE FABRICAÇÃO': '2019',
    'CÓDIGO DE PROJETO': 'ASME VIII Div. 1',
    'FLUIDO DE OPERAÇÃO': 'Ar comprimido',
    'VOLUME (m³)': '0,2',
    'CATEGORIA DO VASO': 'IV',
  };
  const pressoes = [
    { rotulo: 'PMO — Pressão Máxima de Operação', kgf: '8' },
    { rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', kgf: '10,2' },
    { rotulo: 'PTH — Pressão de Teste Hidrostático', kgf: '13,3' },
  ];

  it('traz os campos que uma placa real traz, na ordem', () => {
    const campos = camposDaPlaca(equipamento, pressoes);
    expect(campos.map((c) => c[0])).toEqual([
      'FABRICANTE',
      'IDENTIFICAÇÃO / TAG',
      'Nº DE SÉRIE',
      'ANO DE FABRICAÇÃO',
      'CÓDIGO DE PROJETO',
      'FLUIDO',
      'PMTA (kgf/cm²)',
      'PTH (kgf/cm²)',
      'VOLUME (m³)',
      'CATEGORIA NR-13',
    ]);
  });

  it('os valores vêm da ficha, e a pressão vem da tabela de pressões', () => {
    const campos = Object.fromEntries(camposDaPlaca(equipamento, pressoes));
    expect(campos['FABRICANTE']).toBe('Metalúrgica X');
    expect(campos['Nº DE SÉRIE']).toBe('12345');
    expect(campos['PMTA (kgf/cm²)']).toBe('10,2');
    expect(campos['PTH (kgf/cm²)']).toBe('13,3');
    expect(campos['CATEGORIA NR-13']).toBe('IV');
  });

  it('dado que não existe fica NULO — a placa não inventa', () => {
    const campos = Object.fromEntries(camposDaPlaca({}, []));
    expect(campos['FABRICANTE']).toBeNull();
    expect(campos['PMTA (kgf/cm²)']).toBeNull();
    expect(campos['ANO DE FABRICAÇÃO']).toBeNull();
    // Nenhum valor "de exemplo" escapou para a placa.
    expect(Object.values(campos).every((v) => v === null)).toBe(true);
  });
});

describe('placa REAL: existe, prevalece e some', () => {
  it('sem registro, a placa é a reconstruída', () => {
    expect(lerPlacaReal(TAG)).toBeNull();
    expect(temPlacaReal(TAG)).toBe(false);
  });

  it('com registro, a real prevalece', async () => {
    await salvar(chavePlaca(TAG), REGISTRO);
    expect(temPlacaReal(TAG)).toBe(true);
    expect(lerPlacaReal(TAG)!.ref.path).toBe('org/placa/abc.jpg');
    expect(lerPlacaReal(TAG)!.proporcao).toBe(2.4);
  });

  it('REMOVER devolve a reconstruída, sem passo extra', async () => {
    await salvar(chavePlaca(TAG), REGISTRO);
    await removerPlacaReal(TAG);
    expect(lerPlacaReal(TAG)).toBeNull();
    expect(temPlacaReal(TAG)).toBe(false);
  });

  it('registro pela metade não conta como placa real', async () => {
    // Sem `path` não há arquivo a servir; tratar como real deixaria a folha sem
    // placa NENHUMA — nem a foto, nem a reconstrução.
    await salvar(chavePlaca(TAG), { ...REGISTRO, ref: { ...REGISTRO.ref, path: '' } });
    expect(lerPlacaReal(TAG)).toBeNull();
  });

  it('a chave é por TAG e o registro NÃO guarda base64', async () => {
    await salvar(chavePlaca(TAG), REGISTRO);
    expect(chavePlaca(TAG)).toBe(`nr13_placa_${TAG}`);
    expect(escopoDaChave(chavePlaca(TAG))).toBe('tag');
    expect(tagDaChave(chavePlaca(TAG))).toBe(TAG);
    const cru = localStorage.getItem(chavePlaca(TAG)) ?? '';
    expect(cru).not.toContain('data:image');
    expect(cru).toContain('org/placa/abc.jpg');
  });

  it('a família fica FORA do palco: nenhuma folha de public/ lê a placa', () => {
    expect(FORA_DO_PALCO).toContain('nr13_placa_');
  });
});
