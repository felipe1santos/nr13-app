import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shim de localStorage: os testes rodam contra a v1 do dispatcher (flag desligada),
// que é `localStorage` puro. Isso é de propósito — é o caminho mais restritivo
// (tem cota) e o que ainda roda nas organizações antigas.
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
  CHAVE_LEGADO,
  carregarRelatorio,
  chaveIndice,
  chaveRelatorio,
  contarRelatorios,
  excluirRelatorio,
  idSeguro,
  listarIndice,
  migrarHistoricoRelatorios,
  resumir,
  salvarRelatorio,
  zerarCacheLegado,
} from './historicoRelatorios';
import { tagDaChave, escopoDaChave } from '../../services/familiasChave';
import type { RelatorioSalvo } from './tipos';

const TAG = 'VP01 - COMPRESSOR 427L';
const OUTRA = 'CALD-02';

/** Rubrica/logo base64: o peso real de um relatório salvo (§7-bis). */
const RUBRICA = 'data:image/png;base64,' + 'A'.repeat(40_000);
const LOGO = 'data:image/jpeg;base64,' + 'B'.repeat(30_000);

function rel(id: string, tag = TAG, emissao = '10/08/2026'): RelatorioSalvo {
  return {
    id,
    tagVaso: tag,
    nome: `Relatorio_${id}`,
    tipo: 'Inspeção Periódica',
    data: emissao,
    documentos: ['CAPA.html', 'SUMARIO.html', 'PLACA.html'],
    status: 'Aprovado',
    meta: {
      codigo: id,
      emissao,
      validade: '10/08/2027',
      execucaoInspecao: emissao,
      proximaInspecaoInterna: '10/08/2028',
      proximaInspecaoExterna: '10/08/2027',
      validadeValvula: '10/08/2027',
      tipoInspecao: 'Inspeção Periódica',
      phNome: 'Eng',
      phCrea: '123',
      tecnicoNome: 'Tec',
      // Os snapshots congelados que faziam o array único pesar.
      empresa: { razao: 'ACME', logo: LOGO },
      assinantes: {
        engenheiro: { nome: 'Eng', assinatura: RUBRICA },
        tecnico: { nome: 'Tec', assinatura: RUBRICA },
      },
      certCalibracoes: {},
      rastreabIds: [],
    },
    pdfRef: { bucket: 'inspecao', path: `org/relatorios/${id}.pdf`, mimeType: 'application/pdf', tamanho: 1234 },
    sha256: 'abc123',
    geradoEm: '2026-08-10T12:00:00.000Z',
    paginas: 27,
    livroSnapshot: [{ id: 'e1', descricao: 'x'.repeat(2000) }],
  };
}

beforeEach(() => {
  localStorage.clear();
  zerarCacheLegado();
});

describe('chaves', () => {
  it('a TAG fica no FIM — é assim que o Portal do Cliente acha o relatório', () => {
    // A Edge Function `portal_cliente` filtra por `chave.endsWith('_' + tag)`.
    expect(chaveRelatorio('REL-1', TAG).endsWith(`_${TAG}`)).toBe(true);
    expect(chaveIndice(TAG).endsWith(`_${TAG}`)).toBe(true);
  });

  it('o prefixo NÃO colide com nr13_relatorio_meta_atual', () => {
    // Se colidisse, qualquer filtro por prefixo (FORA_DO_PALCO) levaria junto a
    // 2ª chave mais lida do sistema — o bug da CAPA com "Nº RELATÓRIO: -".
    expect('nr13_relatorio_meta_atual'.startsWith('nr13_rel_')).toBe(false);
    expect(escopoDaChave('nr13_relatorio_meta_atual')).toBe('global');
  });

  it('familiasChave extrai a TAG certa da chave do registro', () => {
    expect(tagDaChave(chaveRelatorio('REL-1755000000000', TAG))).toBe(TAG);
    expect(tagDaChave(chaveIndice(TAG))).toBe(TAG);
    expect(escopoDaChave(chaveRelatorio('REL-1', TAG))).toBe('tag');
  });

  it('id com underscore não move a fronteira da TAG', () => {
    expect(idSeguro('REL_2026_01')).toBe('REL-2026-01');
    expect(tagDaChave(chaveRelatorio('REL_2026_01', TAG))).toBe(TAG);
  });
});

describe('índice', () => {
  it('resumir não leva nenhum snapshot pesado', () => {
    const r = resumir(rel('REL-1'));
    const json = JSON.stringify(r);
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('livroSnapshot');
    expect(json).not.toContain('CAPA.html');
    // Mas leva o que a lista mostra e o que o Dashboard calcula.
    expect(r.codigo).toBe('REL-1');
    expect(r.proximaInspecaoExterna).toBe('10/08/2027');
    expect(r.pdfRef?.path).toContain('REL-1.pdf');
    expect(r.sha256).toBe('abc123');
    expect(json.length).toBeLessThan(1_000);
  });

  it('salvar grava DUAS chaves e nunca reescreve os relatórios anteriores', async () => {
    await salvarRelatorio(rel('REL-1'));
    const depoisDoPrimeiro = localStorage.getItem(chaveRelatorio('REL-1', TAG));

    await salvarRelatorio(rel('REL-2'));

    // O registro do REL-1 saiu INTACTO da segunda gravação.
    expect(localStorage.getItem(chaveRelatorio('REL-1', TAG))).toBe(depoisDoPrimeiro);
    expect(listarIndice(TAG).map((i) => i.id).sort()).toEqual(['REL-1', 'REL-2']);
  });

  it('a listagem não carrega os relatórios completos', async () => {
    await salvarRelatorio(rel('REL-1'));
    await salvarRelatorio(rel('REL-2'));
    const bytesIndice = localStorage.getItem(chaveIndice(TAG))!.length;
    const bytesUmRegistro = localStorage.getItem(chaveRelatorio('REL-1', TAG))!.length;
    // O índice inteiro (2 relatórios) cabe numa fração de UM registro.
    expect(bytesIndice).toBeLessThan(bytesUmRegistro / 20);
  });

  it('carregarRelatorio traz UM relatório, completo', async () => {
    await salvarRelatorio(rel('REL-1'));
    const r = carregarRelatorio('REL-1', TAG)!;
    expect(r.meta.assinantes?.engenheiro?.assinatura).toBe(RUBRICA);
    expect(r.documentos).toEqual(['CAPA.html', 'SUMARIO.html', 'PLACA.html']);
    expect(carregarRelatorio('REL-INEXISTENTE', TAG)).toBeNull();
  });

  it('ordena do mais recente para o mais antigo', async () => {
    await salvarRelatorio(rel('REL-A', TAG, '01/01/2025'));
    await salvarRelatorio(rel('REL-C', TAG, '10/08/2026'));
    await salvarRelatorio(rel('REL-B', TAG, '05/03/2026'));
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-C', 'REL-B', 'REL-A']);
  });

  it('não mistura equipamentos', async () => {
    await salvarRelatorio(rel('REL-1', TAG));
    await salvarRelatorio(rel('REL-9', OUTRA));
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-1']);
    expect(listarIndice(OUTRA).map((i) => i.id)).toEqual(['REL-9']);
    expect(contarRelatorios(TAG)).toBe(1);
  });
});

describe('concorrência', () => {
  it('índice sobrescrito por outro aparelho: o registro sobrevive e a lista se conserta', async () => {
    await salvarRelatorio(rel('REL-1'));
    await salvarRelatorio(rel('REL-2'));

    // Simula a corrida: outro aparelho gravou o índice sem conhecer o REL-2.
    localStorage.setItem(chaveIndice(TAG), JSON.stringify([resumir(rel('REL-1'))]));

    // O relatório NÃO sumiu da tela — `listarIndice` repara pelo registro.
    expect(listarIndice(TAG).map((i) => i.id).sort()).toEqual(['REL-1', 'REL-2']);
    expect(carregarRelatorio('REL-2', TAG)).not.toBeNull();
  });

  it('índice apagado por completo: a lista continua inteira', async () => {
    await salvarRelatorio(rel('REL-1'));
    await salvarRelatorio(rel('REL-2'));
    localStorage.removeItem(chaveIndice(TAG));
    expect(listarIndice(TAG)).toHaveLength(2);
  });

  it('índice corrompido não derruba a listagem', async () => {
    await salvarRelatorio(rel('REL-1'));
    localStorage.setItem(chaveIndice(TAG), 'não é json');
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-1']);
  });
});

describe('migração do array legado', () => {
  function semearLegado(entradas: RelatorioSalvo[]) {
    localStorage.setItem(CHAVE_LEGADO, JSON.stringify(entradas));
    zerarCacheLegado();
  }

  it('antes de migrar, a lista JÁ funciona pelo legado', () => {
    semearLegado([rel('REL-1'), rel('REL-2', OUTRA)]);
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-1']);
    expect(carregarRelatorio('REL-1', TAG)?.meta.empresa).toBeDefined();
  });

  it('converte tudo, valida a contagem e NÃO apaga o legado', async () => {
    semearLegado([rel('REL-1'), rel('REL-2', TAG, '01/01/2025'), rel('REL-3', OUTRA)]);

    const res = await migrarHistoricoRelatorios();
    expect(res.relatorios).toBe(3);
    expect(res.tags).toBe(2);
    expect(res.divergentes).toEqual([]);

    // Registros individuais criados, com o conteúdo íntegro.
    expect(carregarRelatorio('REL-1', TAG)?.meta.assinantes?.tecnico?.assinatura).toBe(RUBRICA);
    // E o array antigo continua lá: é o backup desta migração.
    expect(localStorage.getItem(CHAVE_LEGADO)).not.toBeNull();
  });

  it('é idempotente: rodar de novo não converte nada nem duplica', async () => {
    semearLegado([rel('REL-1'), rel('REL-2')]);
    await migrarHistoricoRelatorios();

    const antes = localStorage.getItem(chaveRelatorio('REL-1', TAG));
    const segunda = await migrarHistoricoRelatorios();

    expect(segunda.relatorios).toBe(0);
    expect(segunda.jaExistiam).toBe(2);
    expect(localStorage.getItem(chaveRelatorio('REL-1', TAG))).toBe(antes);
    expect(listarIndice(TAG)).toHaveLength(2);
  });

  it('legado corrompido não impede nada', () => {
    localStorage.setItem(CHAVE_LEGADO, '{isso não é um array}');
    zerarCacheLegado();
    expect(listarIndice(TAG)).toEqual([]);
  });

  it('excluir tira do índice E do legado — senão o relatório volta', async () => {
    semearLegado([rel('REL-1'), rel('REL-2')]);
    await migrarHistoricoRelatorios();

    await excluirRelatorio('REL-1', TAG);

    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-2']);
    expect(carregarRelatorio('REL-1', TAG)).toBeNull();
    // Releitura do zero (outra sessão): continua excluído.
    zerarCacheLegado();
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-2']);
  });
});

describe('volume: centenas de relatórios', () => {
  const N = 400;

  it('o custo de salvar NÃO cresce com o histórico', async () => {
    for (let i = 0; i < N; i++) {
      await salvarRelatorio(rel(`REL-${1000 + i}`, TAG, '10/08/2026'));
    }
    expect(contarRelatorios(TAG)).toBe(N);

    // Bytes REESCRITOS ao salvar o próximo relatório = 1 registro + 1 índice.
    // No modelo antigo seria o array inteiro: N × ~140 KB.
    const bytesRegistro = JSON.stringify(rel('REL-NOVO')).length;
    const bytesIndice = localStorage.getItem(chaveIndice(TAG))!.length;
    const reescritoAgora = bytesRegistro + bytesIndice;

    const bytesArrayAntigo = N * bytesRegistro;
    expect(reescritoAgora).toBeLessThan(bytesArrayAntigo / 10);

    // E o índice de 400 relatórios continua sendo uma fração de UM relatório
    // por entrada: ~300 B contra ~140 KB.
    expect(bytesIndice / N).toBeLessThan(bytesRegistro / 100);
  });

  it('abrir o histórico não materializa nenhum snapshot', async () => {
    for (let i = 0; i < N; i++) await salvarRelatorio(rel(`REL-${2000 + i}`));

    const lista = listarIndice(TAG);
    expect(lista).toHaveLength(N);
    expect(JSON.stringify(lista)).not.toContain('data:image');
  });

  it('abrir UM relatório carrega só ele', async () => {
    for (let i = 0; i < N; i++) await salvarRelatorio(rel(`REL-${3000 + i}`));

    const r = carregarRelatorio('REL-3007', TAG)!;
    expect(r.id).toBe('REL-3007');
    expect(r.meta.empresa).toBeDefined();
  });

  it('migração de 400 relatórios legados converte todos e confere a contagem', async () => {
    const entradas = Array.from({ length: N }, (_, i) => rel(`REL-${4000 + i}`));
    localStorage.setItem(CHAVE_LEGADO, JSON.stringify(entradas));
    zerarCacheLegado();

    const res = await migrarHistoricoRelatorios();
    expect(res.relatorios).toBe(N);
    expect(res.divergentes).toEqual([]);
    expect(contarRelatorios(TAG)).toBe(N);
  });
});
