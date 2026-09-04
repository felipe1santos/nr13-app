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

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  CAIXA,
  CORPO,
  FOLHA,
  LIMITE_CORPO,
  MARGEM,
  PT,
  alturaLinha,
} from './documentoA4';
import {
  FOTOS_POR_FOLHA,
  converterPressao,
  folhasDeFotos,
  montarModelo,
  textoOu,
} from './ponteDados';

const TAG = 'VP-01';

beforeEach(() => localStorage.clear());

describe('geometria da folha — os números vêm do CSS da referência', () => {
  it('A4 exato e caixa útil de 180 mm', () => {
    expect(FOLHA).toEqual({ largura: 210, altura: 297 });
    expect(MARGEM).toEqual({ topo: 9, direita: 15, baixo: 7, esquerda: 15 });
    expect(CAIXA.largura).toBe(180);
    expect(CAIXA.x).toBe(15);
  });

  it('o corpo cabe entre cabeçalho e rodapé, e o limite fica dentro da folha', () => {
    expect(CORPO.y).toBeGreaterThan(MARGEM.topo);
    expect(LIMITE_CORPO).toBeLessThan(FOLHA.altura - MARGEM.baixo + 0.001);
    expect(CORPO.altura).toBeGreaterThan(200); // sobra folha de verdade para conteúdo
  });

  it('1 pt = 0,3528 mm e a entrelinha usa o fator 1,3 da referência', () => {
    expect(PT).toBeCloseTo(0.3528, 4);
    expect(alturaLinha(10)).toBeCloseTo(10 * PT * 1.3, 6);
  });
});

describe('4 fotos por folha — a regra do §5, sem exceção', () => {
  it('quatro fotos = uma folha; a QUINTA abre a segunda', () => {
    expect(FOTOS_POR_FOLHA).toBe(4);
    expect(folhasDeFotos(4)).toBe(1);
    expect(folhasDeFotos(5)).toBe(2);
    expect(folhasDeFotos(8)).toBe(2);
    expect(folhasDeFotos(9)).toBe(3);
  });

  it('sem foto nenhuma ainda existe UMA folha — a folha do registro fotográfico', () => {
    expect(folhasDeFotos(0)).toBe(1);
  });
});

describe('conversão de pressão — leitura, não recálculo', () => {
  it('MPa → kgf/cm² e bar com o fator do sistema', () => {
    const p = converterPressao(1);
    expect(p.mpa).toBe('1.000');
    expect(p.kgf).toBe('10.20');
    expect(p.bar).toBe('10.00');
  });

  it('ausente continua ausente — não vira zero', () => {
    expect(converterPressao(null)).toEqual({ mpa: null, kgf: null, bar: null });
    expect(converterPressao(Number.NaN).mpa).toBeNull();
  });
});

describe('campo sem dado NÃO vira dado inventado', () => {
  it('textoOu devolve o travessão, e o vazio configurável', () => {
    expect(textoOu(null)).toBe('—');
    expect(textoOu('   ')).toBe('—');
    expect(textoOu('', '')).toBe('');
    expect(textoOu(' ACME ')).toBe('ACME');
  });
});

describe('ponte de dados — lê a verdade que já existe', () => {
  it('modelo vazio não quebra: todo campo ausente vira null', () => {
    const m = montarModelo(TAG);
    expect(m.tag).toBe(TAG);
    expect(m.equipamento['FABRICANTE']).toBeNull();
    expect(m.pressoes[0].mpa).toBeNull();
    expect(m.fotos).toEqual([]);
    expect(m.laudo.apto).toBeNull();
  });

  it('lê ficha, categoria, memorial, meta e laudo das chaves reais', () => {
    localStorage.setItem(
      'nr13_info_VP-01',
      JSON.stringify({ fabricante: 'ACME', numeroSerie: 'S-9', tipo: 'Vaso de Pressão' }),
    );
    localStorage.setItem('nr13_cat_VP-01', JSON.stringify({ catFinal: 'III', grupo: '2', volume: 1.5 }));
    localStorage.setItem('nr13_calc_VP-01', JSON.stringify({ pmta: 1.2, pth: 1.56 }));
    localStorage.setItem('nr13_laudo_VP-01', JSON.stringify({ apto: true }));
    localStorage.setItem(
      'nr13_relatorio_meta_atual',
      JSON.stringify({
        codigo: 'REL-7',
        emissao: '04/09/2026',
        tipoInspecao: 'Inspeção Periódica',
        proximaInspecaoInterna: '04/09/2031',
        proximaInspecaoExterna: '04/09/2028',
        phNome: 'Eng. Teste',
        phCrea: 'CREA-1',
      }),
    );

    const m = montarModelo(TAG);
    expect(m.equipamento['FABRICANTE']).toBe('ACME');
    expect(m.equipamento['CATEGORIA DO VASO']).toBe('III');
    expect(m.pressoes[0].kgf).toBe('12.24');
    expect(m.numeroRelatorio).toBe('REL-7');
    expect(m.laudo.apto).toBe(true);
    // A próxima inspeção vem da META — a MESMA fonte do vencimento oficial.
    // Se algum dia isto for recalculado aqui, este teste é o que quebra.
    expect(m.proximas.interna).toBe('04/09/2031');
    expect(m.assinantes[0].nome).toBe('Eng. Teste');
  });

  it('prefere o SNAPSHOT congelado da empresa ao dado vivo (§7-bis)', () => {
    localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razaoSocial: 'VIVA LTDA' }));
    localStorage.setItem(
      'nr13_relatorio_meta_atual',
      JSON.stringify({ codigo: 'REL-8', empresa: { razaoSocial: 'CONGELADA LTDA' } }),
    );
    expect(montarModelo(TAG).empresa.razao).toBe('CONGELADA LTDA');
  });

  it('descarta foto que não é imagem — nada de string solta virando raster', () => {
    localStorage.setItem(
      'nr13_injecao_atual',
      JSON.stringify({
        visual_externo: {
          fotos: [
            { base64: 'data:image/jpeg;base64,AAA', descricao: 'ok' },
            { base64: 'lixo', descricao: 'ruim' },
            { descricao: 'sem base64' },
          ],
        },
      }),
    );
    const m = montarModelo(TAG);
    expect(m.fotos).toHaveLength(1);
    expect(m.fotos[0].descricao).toBe('ok');
  });
});
