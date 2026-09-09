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
  layoutDaPlaca,
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
    'TIPO DE EQUIPAMENTO': 'Vaso de Pressão',
    FABRICANTE: 'Metalúrgica X',
    'NÚMERO DE SÉRIE': '12345',
    'ANO DE FABRICAÇÃO': '2019',
    'CÓDIGO DE PROJETO': 'ASME VIII Div. 1',
    'FLUIDO DE OPERAÇÃO': 'Ar comprimido',
    'CLASSE DO FLUIDO': 'Classe C',
    'VOLUME (m³)': '0,2',
    'GRUPO DE RISCO': '4',
    'CATEGORIA DO VASO': 'IV',
  };
  const pressoes = [
    { rotulo: 'PMO — Pressão Máxima de Operação', mpa: '0,8', psi: '116', kgf: '8' },
    { rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', mpa: '1,0', psi: '145', kgf: '10,2' },
    { rotulo: 'PTH — Pressão de Teste Hidrostático', mpa: '1,3', psi: '189', kgf: '13,3' },
  ];
  const datas = { execucao: '21/08/2026', validade: '21/08/2028' };

  const rotulos = (fs: ReturnType<typeof layoutDaPlaca>) =>
    fs.flatMap((f) => f.celulas.map((c) => c.rotulo));

  it('as fieiras seguem a referência, na ordem', () => {
    expect(rotulos(layoutDaPlaca(equipamento, pressoes, datas))).toEqual([
      'IDENTIFICAÇÃO DO EQUIPAMENTO',
      'TIPO DE EQUIPAMENTO',
      'FABRICANTE',
      'NÚMERO DE SÉRIE',
      'ANO DE FABRICAÇÃO',
      'CÓDIGO DE PROJETO',
      'FLUIDO DE OPERAÇÃO',
      'CLASSE',
      'PMTA',
      'PTH',
      'VOLUME (m³)',
      'GRUPO DE RISCO',
      'EXECUÇÃO DA INSPEÇÃO',
      'VALIDADE',
      'CATEGORIA',
    ]);
  });

  it('cada fieira ocupa a largura inteira: os pesos somam 1', () => {
    for (const f of layoutDaPlaca(equipamento, pressoes, datas)) {
      const soma = f.celulas.reduce((t, c) => t + c.peso, 0);
      expect(soma, `fieira ${f.celulas.map((c) => c.rotulo).join(' + ')}`).toBeCloseTo(1, 5);
    }
  });

  it('os valores vêm da ficha, das pressões e das datas do relatório', () => {
    const fs = layoutDaPlaca(equipamento, pressoes, datas);
    const campo = (r: string) => {
      const c = fs.flatMap((f) => f.celulas).find((x) => x.rotulo === r);
      return c && c.tipo === 'campo' ? c.valor : undefined;
    };
    expect(campo('IDENTIFICAÇÃO DO EQUIPAMENTO')).toBe('VP-001');
    expect(campo('TIPO DE EQUIPAMENTO')).toBe('Vaso de Pressão');
    expect(campo('FABRICANTE')).toBe('Metalúrgica X');
    expect(campo('NÚMERO DE SÉRIE')).toBe('12345');
    expect(campo('CLASSE')).toBe('Classe C');
    expect(campo('GRUPO DE RISCO')).toBe('4');
    expect(campo('EXECUÇÃO DA INSPEÇÃO')).toBe('21/08/2026');
    expect(campo('VALIDADE')).toBe('21/08/2028');
    expect(campo('CATEGORIA')).toBe('IV');
  });

  it('PMTA e PTH saem nas TRÊS unidades da referência — e são as pressões certas', () => {
    const fs = layoutDaPlaca(equipamento, pressoes, datas);
    const bloco = (r: string) => {
      const c = fs.flatMap((f) => f.celulas).find((x) => x.rotulo === r);
      return c && c.tipo === 'pressao' ? c.colunas : undefined;
    };
    expect(bloco('PMTA')).toEqual([
      { unidade: 'MPa', valor: '1,0' },
      { unidade: 'psi', valor: '145' },
      { unidade: 'kgf/cm²', valor: '10,2' },
    ]);
    // PTH nunca pode trazer os números da PMTA: é a pressão de ENSAIO.
    expect(bloco('PTH')).toEqual([
      { unidade: 'MPa', valor: '1,3' },
      { unidade: 'psi', valor: '189' },
      { unidade: 'kgf/cm²', valor: '13,3' },
    ]);
  });

  it('a CATEGORIA é a fieira MAIS ALTA — é o destaque da placa', () => {
    const fs = layoutDaPlaca(equipamento, pressoes, datas);
    const maisAlta = [...fs].sort((a, b) => (b.fator ?? 1) - (a.fator ?? 1))[0];
    expect(maisAlta.celulas[0].rotulo).toBe('CATEGORIA');
    // A fieira das PRESSÕES também escapa do 1: ela empilha unidade + valor no
    // mesmo quadro, e com altura comum o número saía com metade do corpo.
    const pressoesFileira = fs.find((f) => f.celulas.some((c) => c.tipo === 'pressao'))!;
    expect(pressoesFileira.fator).toBeGreaterThan(1);
    expect(pressoesFileira.fator!).toBeLessThan(maisAlta.fator!);
  });

  it('dado que não existe fica NULO — a placa não inventa', () => {
    const fs = layoutDaPlaca({}, [], {});
    const valores = fs.flatMap((f) =>
      f.celulas.flatMap((c) => (c.tipo === 'campo' ? [c.valor] : c.colunas.map((x) => x.valor))),
    );
    expect(valores.every((v) => v === null)).toBe(true);
    // E a ESTRUTURA continua completa: placa vazia é uma placa, não um buraco.
    expect(rotulos(fs)).toHaveLength(15);
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
