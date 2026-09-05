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

import { calibIdDoDocumento, chavesDaFolha } from './hostCertificado';
import { contarFolhasDeCertificado, ehFolhaDeCertificado, indicesDeCertificado } from './certificados';

/**
 * 13B · a folha de calibração deixou de depender da TELA.
 *
 * O gerador lia `.relatorio-preview .pagina-relatorio-a4` para achar a folha de
 * certificado. Isso amarrava a emissão do PDF ao que estava montado: sem os 27
 * iframes do relatório abertos, o certificado sumia do documento — e a contagem
 * de páginas prometia menos folhas do que o arquivo teria.
 *
 * O que estes testes travam é a REGRA, não o pixel: nenhum caminho do gerador
 * pode voltar a perguntar à tela quantas folhas existem ou onde elas estão.
 */

beforeEach(() => localStorage.clear());

describe('a decisão vem da LISTA de documentos, nunca do DOM', () => {
  const docs = [
    'CAPA.html',
    'ULTRASSOM.html',
    'CERTIFICADO-CAL-MANOMETRO.html?calibId=abc',
    'CERTIIFCADO-CAL-PSV.html?calibId=def',
  ];

  it('reconhece a folha de certificado pelo nome do arquivo', () => {
    expect(ehFolhaDeCertificado('CERTIFICADO-CAL-MANOMETRO.html?calibId=abc')).toBe(true);
    // "CERTIIFCADO" é o nome real no repositório — erro de digitação preservado
    // porque renomear quebraria relatórios já emitidos.
    expect(ehFolhaDeCertificado('CERTIIFCADO-CAL-PSV.html?calibId=def')).toBe(true);
    expect(ehFolhaDeCertificado('CAPA.html')).toBe(false);
    expect(ehFolhaDeCertificado('ULTRASSOM.html')).toBe(false);
  });

  it('acha as posições sem olhar a tela', () => {
    expect(indicesDeCertificado(docs)).toEqual([2, 3]);
  });

  it('a contagem NÃO chama o DOM da tela', () => {
    // Se alguém devolver a dependência, este espião pega: `querySelectorAll`
    // com `.relatorio-preview` era exatamente a chamada que existia aqui.
    const chamadas: string[] = [];
    (globalThis as Record<string, unknown>).document = {
      querySelectorAll: (s: string) => {
        chamadas.push(s);
        return [];
      },
    };
    try {
      contarFolhasDeCertificado(docs);
      expect(chamadas).toEqual([]);
    } finally {
      delete (globalThis as Record<string, unknown>).document;
    }
  });

  it('sem navegador não há host, então não há página a contar', () => {
    expect(contarFolhasDeCertificado(docs)).toBe(0);
  });

  it('relatório SEM calibração não tem nada a anexar', () => {
    expect(indicesDeCertificado(['CAPA.html', 'CONCLUSAO.html'])).toEqual([]);
  });
});

describe('o host monta só o que a folha precisa', () => {
  it('lê o `calibId` da própria URL da folha', () => {
    expect(calibIdDoDocumento('CERTIFICADO-CAL-MANOMETRO.html?calibId=abc')).toBe('abc');
    expect(calibIdDoDocumento('CERTIIFCADO-CAL-PSV.html?page=2&calibId=xyz')).toBe('xyz');
    expect(calibIdDoDocumento('CERTIFICADO-CAL-MANOMETRO.html')).toBeNull();
    expect(calibIdDoDocumento('CERTIFICADO-CAL-MANOMETRO.html?calibId=')).toBeNull();
  });

  it('as chaves são as QUATRO que a folha lê — não o documento inteiro', () => {
    const chaves = chavesDaFolha('CERTIFICADO-CAL-MANOMETRO.html?calibId=abc');
    expect(chaves).toEqual([
      'nr13_minha_empresa',
      'nr13_relatorio_meta_atual',
      'nr13_injecao_atual',
      'nr13_calibracao_item_abc',
    ]);
    // Nada de foto, memorial, checklist ou histórico: o palco de um documento
    // inteiro tem orçamento de 3.368 KB, e a folha de calibração não precisa
    // de nada disso para se desenhar.
    expect(chaves.some((c) => c.startsWith('nr13_fotos_'))).toBe(false);
    expect(chaves.some((c) => c.startsWith('nr13_calc_'))).toBe(false);
  });

  it('folha sem `calibId` leva só as globais', () => {
    expect(chavesDaFolha('CERTIFICADO-CAL-MANOMETRO.html')).toEqual([
      'nr13_minha_empresa',
      'nr13_relatorio_meta_atual',
      'nr13_injecao_atual',
    ]);
  });
});
