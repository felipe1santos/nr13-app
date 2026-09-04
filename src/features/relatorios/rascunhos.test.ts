import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mesmo shim dos outros testes deste módulo: a suíte roda contra a v1 do
// despachante (localStorage puro), que é o caminho mais restritivo.
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
  carregarRelatorio,
  chaveIndice,
  chaveRelatorio,
  contarRelatorios,
  excluirRelatorio,
  listarIndice,
  salvarRascunho,
  salvarRelatorio,
  zerarCacheLegado,
} from './historicoRelatorios';
import {
  CHAVE_RASCUNHOS,
  ehRascunhoConhecido,
  filtrarRascunhos,
  listarRascunhos,
  rascunhosDaTag,
  type RascunhoItem,
} from './rascunhos';
import { ehRascunho, type RelatorioSalvo } from './tipos';

const TAG = 'VP01 - COMPRESSOR 427L';

function rel(id: string, status: RelatorioSalvo['status'], tag = TAG): RelatorioSalvo {
  return {
    id,
    tagVaso: tag,
    nome: `Relatorio_${id}.pdf`,
    tipo: 'Inspeção Periódica',
    data: '10/09/2026',
    documentos: ['CAPA.html', 'CONCLUSAO.html'],
    status,
    meta: {
      codigo: id,
      emissao: '10/09/2026',
      validade: '10/09/2027',
      execucaoInspecao: '09/09/2026',
      proximaInspecaoInterna: '10/09/2031',
      proximaInspecaoExterna: '10/09/2028',
      validadeValvula: '',
      tipoInspecao: 'Inspeção Periódica',
      phNome: 'Eng',
      phCrea: '1',
      tecnicoNome: 'Tec',
    } as RelatorioSalvo['meta'],
    // Finalizado tem artefato; rascunho, por definição, não tem.
    ...(status === 'Aprovado'
      ? {
          pdfRef: { bucket: 'inspecao', path: `org/relatorios/${id}.pdf`, mimeType: 'application/pdf', tamanho: 10 },
          sha256: 'abc',
        }
      : {}),
  } as RelatorioSalvo;
}

beforeEach(() => {
  localStorage.clear();
  zerarCacheLegado();
});

describe('rascunho NÃO entra no índice do equipamento', () => {
  it('salvar rascunho grava o registro, e só ele', async () => {
    await salvarRascunho(rel('REL-1', 'Rascunho'));

    expect(localStorage.getItem(chaveRelatorio('REL-1', TAG))).not.toBeNull();
    // A chave do índice nem existe: é dela que saem vencimento, Portal e
    // contagens, e um documento em edição não pode produzir nada disso.
    expect(localStorage.getItem(chaveIndice(TAG))).toBeNull();
    expect(listarIndice(TAG)).toEqual([]);
    expect(contarRelatorios(TAG)).toBe(0);
  });

  it('o REPARO do índice também ignora rascunho', async () => {
    await salvarRascunho(rel('REL-1', 'Rascunho'));
    // `listarIndice` reconstrói o índice a partir dos registros quando ele se
    // perde. Sem o filtro, seria exatamente esse reparo a pôr o rascunho lá.
    expect(listarIndice(TAG)).toEqual([]);
  });

  it('salvar pelo caminho comum com status Rascunho cai no caminho do rascunho', async () => {
    await salvarRelatorio(rel('REL-9', 'Rascunho'));
    expect(listarIndice(TAG)).toEqual([]);
    expect(listarRascunhos().map((r) => r.id)).toEqual(['REL-9']);
  });

  it('relatório FINALIZADO continua entrando no índice, como sempre', async () => {
    await salvarRelatorio(rel('REL-2', 'Aprovado'));
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-2']);
    expect(contarRelatorios(TAG)).toBe(1);
  });
});

describe('o ciclo: rascunho → salvar → sair → voltar → finalizar', () => {
  it('o registro sobrevive e volta com o conteúdo', async () => {
    await salvarRascunho(rel('REL-3', 'Rascunho'));

    // "sair e voltar": o cache em memória do legado é zerado, o registro não.
    zerarCacheLegado();
    const voltou = carregarRelatorio('REL-3', TAG);
    expect(voltou?.documentos).toEqual(['CAPA.html', 'CONCLUSAO.html']);
    expect(ehRascunho(voltou?.status)).toBe(true);
  });

  it('finalizar reescreve o MESMO registro e limpa o índice de rascunhos', async () => {
    await salvarRascunho(rel('REL-4', 'Rascunho'));
    expect(ehRascunhoConhecido('REL-4')).toBe(true);

    await salvarRelatorio(rel('REL-4', 'Aprovado'));

    expect(ehRascunhoConhecido('REL-4')).toBe(false);
    expect(listarRascunhos()).toEqual([]);
    // Um relatório só, não dois: o registro foi reescrito no lugar.
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-4']);
    expect(carregarRelatorio('REL-4', TAG)?.status).toBe('Aprovado');
  });

  it('excluir um rascunho tira o registro e o item do índice de rascunhos', async () => {
    await salvarRascunho(rel('REL-5', 'Rascunho'));
    await excluirRelatorio('REL-5', TAG);

    expect(carregarRelatorio('REL-5', TAG)).toBeNull();
    expect(listarRascunhos()).toEqual([]);
  });
});

describe('índice de rascunhos', () => {
  it('preserva criadoEm ao regravar e atualiza atualizadoEm', async () => {
    await salvarRascunho(rel('REL-6', 'Rascunho'));
    const primeiro = listarRascunhos()[0];
    await new Promise((r) => setTimeout(r, 5));
    await salvarRascunho(rel('REL-6', 'Rascunho'));
    const segundo = listarRascunhos()[0];

    expect(segundo.criadoEm).toBe(primeiro.criadoEm);
    expect(segundo.atualizadoEm >= primeiro.atualizadoEm).toBe(true);
    expect(listarRascunhos()).toHaveLength(1);
  });

  it('mais recentes primeiro, e o recorte por TAG funciona', async () => {
    await salvarRascunho(rel('REL-A', 'Rascunho', 'TAG-1'));
    await new Promise((r) => setTimeout(r, 5));
    await salvarRascunho(rel('REL-B', 'Rascunho', 'TAG-2'));

    expect(listarRascunhos().map((r) => r.id)).toEqual(['REL-B', 'REL-A']);
    expect(rascunhosDaTag('TAG-1').map((r) => r.id)).toEqual(['REL-A']);
  });

  it('valor corrompido na chave não derruba a lista', () => {
    localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify({ nao: 'é array' }));
    expect(listarRascunhos()).toEqual([]);
  });
});

describe('filtro da tela', () => {
  const lista: RascunhoItem[] = [
    { id: 'R1', tag: 'VP-01', nome: 'Relatorio_R1.pdf', tipo: 'Inspeção Periódica', codigo: 'REL-100', criadoEm: '', atualizadoEm: '' },
    { id: 'R2', tag: 'CD-02', nome: 'Relatorio_R2.pdf', tipo: 'Inspeção Inicial', codigo: 'REL-200', criadoEm: '', atualizadoEm: '' },
  ];

  it('termo casa TAG, nome e código', () => {
    expect(filtrarRascunhos(lista, { termo: 'vp-01' }).map((r) => r.id)).toEqual(['R1']);
    expect(filtrarRascunhos(lista, { termo: 'REL-200' }).map((r) => r.id)).toEqual(['R2']);
  });

  it('tipo filtra pelo tipo de inspeção', () => {
    expect(filtrarRascunhos(lista, { tipo: 'Inspeção Inicial' }).map((r) => r.id)).toEqual(['R2']);
  });

  it('sem filtro, devolve tudo', () => {
    expect(filtrarRascunhos(lista, {})).toHaveLength(2);
  });
});

describe('compatibilidade: histórico continua FINALIZADO', () => {
  it('status ausente NÃO é rascunho', () => {
    expect(ehRascunho(undefined)).toBe(false);
    expect(ehRascunho(null)).toBe(false);
    expect(ehRascunho('')).toBe(false);
    expect(ehRascunho('Aprovado')).toBe(false);
    expect(ehRascunho('Rascunho')).toBe(true);
  });

  it('registro antigo sem `status` é reparado para dentro do índice, como sempre foi', async () => {
    const antigo = rel('REL-VELHO', 'Aprovado');
    delete (antigo as Partial<RelatorioSalvo>).status;
    localStorage.setItem(chaveRelatorio('REL-VELHO', TAG), JSON.stringify(antigo));

    // Nada de índice gravado: é o cenário do relatório histórico cujo índice se
    // perdeu. Ele PRECISA voltar — o filtro de rascunho não pode engoli-lo.
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-VELHO']);
  });
});
