/**
 * DUPLICAR RELATÓRIO (21/10/2026) — o original finalizado não muda; a cópia
 * nasce rascunho, com identidade própria.
 *
 * Roda contra a v1 do despachante (localStorage puro), como os outros testes
 * do histórico. Cada escrita é observada no `setItem`/`removeItem`: é por elas
 * que a fila de sincronização sobe dado ao servidor, então "nenhuma escrita na
 * chave do original" é a prova de que o sync não tem o que sobrescrever lá.
 */
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
  carregarRelatorio,
  chaveIndice,
  chaveRelatorio,
  excluirRelatorio,
  listarIndice,
  RelatorioFinalizadoImutavel,
  salvarRascunho,
  salvarRelatorio,
  zerarCacheLegado,
} from './historicoRelatorios';
import { ehRascunhoConhecido, listarRascunhos } from './rascunhos';
import { chaveOverrides, carregarOverrides, gravarOverrides } from './overridesRelatorio';
import { codigoLivre, duplicarRelatorio, montarDuplicata, overridesDaCopia } from './duplicarRelatorio';
import { ehRascunho, type RelatorioSalvo } from './tipos';

const TAG = 'ZZ-DUP-01';
const AGORA = Date.UTC(2026, 9, 21, 15, 0, 0);

function finalizado(): RelatorioSalvo {
  return {
    id: 'REL-1700000000000',
    tagVaso: TAG,
    nome: 'Relatorio_Inspeção_Periódica_ZZ-DUP-01.pdf',
    tipo: 'Inspeção Periódica',
    data: '10/03/2026',
    documentos: ['CAPA.html', 'ULTRASSOM.html', 'CONCLUSAO.html'],
    status: 'Aprovado',
    pdfRef: { bucket: 'fotos', path: 'org/relatorios/original.pdf' } as unknown as RelatorioSalvo['pdfRef'],
    sha256: 'a'.repeat(64),
    geradoEm: '2026-03-10T12:00:00.000Z',
    paginas: 14,
    livroCorte: { sha256: 'b'.repeat(64), entradas: 3, em: '2026-03-10T12:00:00.000Z' },
    meta: {
      codigo: 'REL-1700000000000',
      emissao: '10/03/2026',
      validade: '10/03/2027',
      execucaoInspecao: '09/03/2026',
      proximaInspecaoInterna: '10/03/2031',
      proximaInspecaoExterna: '10/03/2028',
      validadeValvula: '10/03/2027',
      tipoInspecao: 'Inspeção Periódica',
      phNome: 'Eng. Fulano',
      phCrea: 'CREA-123',
      tecnicoNome: 'Téc. Beltrano',
      art: 'ART-999',
      containerOrigemId: 'cont-campo-1',
      documentos: ['CAPA.html', 'ULTRASSOM.html', 'CONCLUSAO.html'],
      modeloDocumento: 'novo',
      empresa: { razaoSocial: 'EMPRESA ANTIGA', logo: 'data:image/png;base64,AAA' },
      assinantes: {
        engenheiro: { id: 'e1', nome: 'Eng. Fulano', assinatura: 'data:image/png;base64,RUBRICA' } as never,
        tecnico: null,
      },
      certCalibracoes: { c1: { serie: 'X' } },
      rastreabIds: ['rast-1'],
      overrides: { 'capa.validade': { texto: '10/03/2027' } },
    },
  };
}

const FOTO_REF = { bucket: 'inspecao', path: 'org/inspecoes/foto-acumulacao.jpg', mimeType: 'image/jpeg', tamanho: 10 };

/** O container de campo do relatório original — com medição, acumulação e foto. */
function containerOriginal() {
  return {
    id: 'cont-campo-1',
    nome: 'Inspeção periódica 2026',
    criadoEm: '10/03/2026',
    ensaios: ['ultrassom', 'acumulacao'],
    dados: {
      ultrassom: { medidas: { c1: { '0': '9,10', '90': '9,20' } } },
      acumulacao: {
        pressaoMaxima: '10,80',
        pressaoUnidade: 'bar',
        fotos: [{ id: 'f1', ordem: 0, ref: FOTO_REF, descricao: 'MANÔMETRO' }],
      },
    },
  };
}

/** Grava o original como FINALIZADO pelo caminho real e devolve o JSON cru. */
async function semearOriginal(): Promise<string> {
  localStorage.setItem(`nr13_docs_${TAG}`, JSON.stringify([containerOriginal()]));
  const r = finalizado();
  await salvarRelatorio(r);
  await gravarOverrides(r.id, TAG, {
    'capa.validade': { modo: 'manual', valor: '10/03/2027', auto: '', em: '2026-03-10T00:00:00Z' },
    'inspecao.observacoes': { modo: 'manual', valor: 'Pintura com bolhas no tampo inferior.', auto: '', em: '2026-03-10T00:00:00Z' },
  });
  return localStorage.getItem(chaveRelatorio(r.id, TAG))!;
}

/** As chaves escritas ou apagadas durante `fn`. */
async function escritasDurante(fn: () => Promise<unknown>): Promise<string[]> {
  const chaves: string[] = [];
  const set = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    chaves.push(k);
    set.mockRestore();
    localStorage.setItem(k, v);
    rearmar();
  } as never);
  const rem = vi.spyOn(localStorage, 'removeItem');
  function rearmar() {
    vi.spyOn(localStorage, 'setItem').mockImplementation(function (k: string, v: string) {
      chaves.push(k);
      vi.mocked(localStorage.setItem).mockRestore();
      localStorage.setItem(k, v);
      rearmar();
    } as never);
  }
  try {
    await fn();
  } finally {
    vi.restoreAllMocks();
  }
  return [...chaves, ...rem.mock.calls.map((c) => String(c[0]))];
}

beforeEach(() => {
  localStorage.clear();
  zerarCacheLegado();
});

describe('A · finalizado → duplicar → NOVO RASCUNHO', () => {
  it('cria um rascunho com id novo, gravado, e o original continua finalizado', async () => {
    const antes = await semearOriginal();
    const { relatorio: copia, estado } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);

    expect(estado).toBe('encontrado');
    expect(copia).not.toBeNull();
    expect(copia!.id).not.toBe('REL-1700000000000');
    expect(copia!.id).toBe(`REL-${AGORA}`);
    expect(copia!.meta.codigo).toBe(copia!.id);
    expect(ehRascunho(copia!.status)).toBe(true);
    expect(ehRascunhoConhecido(copia!.id)).toBe(true);
    expect(copia!.tagVaso).toBe(TAG);
    expect(copia!.meta.duplicadoDe).toBe('REL-1700000000000');
    expect(copia!.nome).toBe('Cópia de Relatorio_Inspeção_Periódica_ZZ-DUP-01.pdf');

    // Original: byte a byte o mesmo, ainda finalizado, ainda no índice.
    expect(localStorage.getItem(chaveRelatorio('REL-1700000000000', TAG))).toBe(antes);
    const original = carregarRelatorio('REL-1700000000000', TAG)!;
    expect(ehRascunho(original.status)).toBe(false);
    expect(original.sha256).toBe('a'.repeat(64));
    expect(original.pdfRef).toEqual({ bucket: 'fotos', path: 'org/relatorios/original.pdf' });
    // O rascunho NÃO entra no índice (não gera vencimento nem Portal).
    expect(listarIndice(TAG).map((i) => i.id)).toEqual(['REL-1700000000000']);
  });

  it('a cópia NÃO leva PDF, SHA, pdfRef, snapshots de emissão nem lacre do livro', async () => {
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    for (const campo of ['pdfRef', 'sha256', 'geradoEm', 'paginas', 'pdfPendente', 'livroSnapshot', 'livroCorte'] as const) {
      expect(c![campo]).toBeUndefined();
    }
    for (const campo of ['empresa', 'assinantes', 'certCalibracoes', 'rastreabIds', 'overrides'] as const) {
      expect(c!.meta[campo]).toBeUndefined();
    }
    // Nem no que ficou GRAVADO.
    const gravado = JSON.parse(localStorage.getItem(chaveRelatorio(c!.id, TAG))!);
    expect(gravado.pdfRef).toBeUndefined();
    expect(gravado.sha256).toBeUndefined();
    expect(JSON.stringify(gravado)).not.toContain('RUBRICA');
    expect(JSON.stringify(gravado)).not.toContain('original.pdf');
  });

  it('leva o conteúdo técnico: composição, container, tipo e responsáveis', async () => {
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    expect(c!.documentos).toEqual(['CAPA.html', 'ULTRASSOM.html', 'CONCLUSAO.html']);
    expect(c!.meta.documentos).toEqual(['CAPA.html', 'ULTRASSOM.html', 'CONCLUSAO.html']);
    // 22/10/2026 · container PRÓPRIO, com os dados do original copiados.
    expect(c!.meta.containerOrigemId).toBeDefined();
    expect(c!.meta.containerOrigemId).not.toBe('cont-campo-1');
    const lista = JSON.parse(localStorage.getItem(`nr13_docs_${TAG}`)!) as { id: string; nome: string; dados: unknown }[];
    const copia = lista.find((x) => x.id === c!.meta.containerOrigemId)!;
    expect(copia.nome).toBe('Cópia de Inspeção periódica 2026');
    expect(copia.dados).toEqual(containerOriginal().dados);
    expect(c!.meta.tipoInspecao).toBe('Inspeção Periódica');
    expect(c!.meta.phNome).toBe('Eng. Fulano');
    expect(c!.meta.tecnicoNome).toBe('Téc. Beltrano');
  });
});

describe('datas — identidade nova, inspeção em branco', () => {
  it('emissão VAZIA (é ato da finalização); execução, validade, próximas, válvula e ART vazias', async () => {
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    const hoje = new Date(AGORA).toLocaleDateString('pt-BR');
    expect(c!.meta.emissao).toBe('');
    expect(c!.data).toBe(hoje);
    expect(c!.meta.execucaoInspecao).toBe('');
    expect(c!.meta.validade).toBe('');
    expect(c!.meta.proximaInspecaoInterna).toBe('');
    expect(c!.meta.proximaInspecaoExterna).toBe('');
    expect(c!.meta.validadeValvula).toBe('');
    expect(c!.meta.art).toBe('');
  });

  it('as correções de texto passam, menos as de data, ART e laudo', async () => {
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    const ovr = carregarOverrides(c!.id, TAG);
    expect(Object.keys(ovr)).toEqual(['inspecao.observacoes']);
    // A do original continua com as duas.
    expect(Object.keys(carregarOverrides('REL-1700000000000', TAG)).sort()).toEqual([
      'capa.validade',
      'inspecao.observacoes',
    ]);
    expect(Object.keys(overridesDaCopia({ 'parecer.laudo': {} as never, 'datas.execucao': {} as never }))).toEqual([]);
    const da = (id: string) => Object.keys(overridesDaCopia({ [id]: {} as never })).length === 0;
    for (const id of ['capa.n-do-relatorio', 'capa.data-da-inspecao', 'inspecao.data-inicio', 'proximas.externa', 'th.resultado', 'ri.laudo-final', 'ri.acumulacao.justificativa', 'acumulacao.laudo']) expect(da(id), id).toBe(true);
    expect(da('capa.cliente')).toBe(false);
  });
});

describe('independência — editar, excluir, finalizar a cópia', () => {
  it('editar e salvar a cópia não altera o original', async () => {
    const antes = await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    await salvarRascunho({ ...c!, meta: { ...c!.meta, execucaoInspecao: '20/10/2026', art: 'ART-NOVA' } });
    expect(carregarRelatorio(c!.id, TAG)!.meta.art).toBe('ART-NOVA');
    expect(localStorage.getItem(chaveRelatorio('REL-1700000000000', TAG))).toBe(antes);
  });

  it('excluir a cópia não toca o original — e o original continua inexcluível', async () => {
    const antes = await semearOriginal();
    const ovrAntes = localStorage.getItem(chaveOverrides('REL-1700000000000', TAG));
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);

    const mexidas = await escritasDurante(() => excluirRelatorio(c!.id, TAG));
    expect(mexidas).not.toContain(chaveRelatorio('REL-1700000000000', TAG));
    expect(mexidas).not.toContain(chaveOverrides('REL-1700000000000', TAG));
    expect(mexidas.some((k) => k.startsWith('nr13_docs_') || k.startsWith('nr13_fotos_'))).toBe(false);

    expect(carregarRelatorio(c!.id, TAG)).toBeNull();
    expect(localStorage.getItem(chaveRelatorio('REL-1700000000000', TAG))).toBe(antes);
    expect(localStorage.getItem(chaveOverrides('REL-1700000000000', TAG))).toBe(ovrAntes);
    await expect(excluirRelatorio('REL-1700000000000', TAG)).rejects.toBeInstanceOf(RelatorioFinalizadoImutavel);
  });

  it('finalizar a cópia gera um documento NOVO: outro id, outro PDF, outro SHA', async () => {
    const antes = await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    await salvarRelatorio({
      ...c!,
      status: 'Aprovado',
      pdfRef: { bucket: 'fotos', path: 'org/relatorios/copia.pdf' } as unknown as RelatorioSalvo['pdfRef'],
      sha256: 'c'.repeat(64),
    });
    const ids = listarIndice(TAG).map((i) => i.id).sort();
    expect(ids).toEqual(['REL-1700000000000', c!.id].sort());
    expect(listarIndice(TAG).find((i) => i.id === c!.id)?.sha256).toBe('c'.repeat(64));
    expect(listarIndice(TAG).find((i) => i.id === 'REL-1700000000000')?.sha256).toBe('a'.repeat(64));
    expect(localStorage.getItem(chaveRelatorio('REL-1700000000000', TAG))).toBe(antes);
  });
});

describe('várias cópias, recarga e sync', () => {
  it('duplicar o mesmo original três vezes no mesmo milissegundo dá três rascunhos distintos', async () => {
    await semearOriginal();
    const a = (await duplicarRelatorio('REL-1700000000000', TAG, AGORA)).relatorio!;
    const b = (await duplicarRelatorio('REL-1700000000000', TAG, AGORA)).relatorio!;
    const d = (await duplicarRelatorio('REL-1700000000000', TAG, AGORA)).relatorio!;
    expect(new Set([a.id, b.id, d.id]).size).toBe(3);
    await salvarRascunho({ ...a, meta: { ...a.meta, art: 'SÓ-NA-A' } });
    expect(carregarRelatorio(b.id, TAG)!.meta.art).toBe('');
    expect(carregarRelatorio(d.id, TAG)!.meta.art).toBe('');
  });

  it('F5: a cópia está gravada — sobrevive a reler o storage do zero', async () => {
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    zerarCacheLegado();
    const relido = carregarRelatorio(c!.id, TAG);
    expect(relido?.status).toBe('Rascunho');
    expect(relido?.meta.duplicadoDe).toBe('REL-1700000000000');
    expect(listarRascunhos().map((r) => r.id)).toContain(c!.id);
  });

  it('sync: duplicar NÃO escreve nenhuma chave do original (registro, índice, overrides, container)', async () => {
    await semearOriginal();
    let novoId = '';
    const escritas = await escritasDurante(async () => {
      novoId = (await duplicarRelatorio('REL-1700000000000', TAG, AGORA)).relatorio!.id;
    });
    expect(escritas).not.toContain(chaveRelatorio('REL-1700000000000', TAG));
    expect(escritas).not.toContain(chaveOverrides('REL-1700000000000', TAG));
    expect(escritas).not.toContain(chaveIndice(TAG));
    // A lista de containers recebe a CÓPIA (acréscimo); o container original
    // continua idêntico, e nenhuma chave de foto é tocada.
    expect(escritas.some((k) => k.startsWith('nr13_fotos_'))).toBe(false);
    const lista = JSON.parse(localStorage.getItem(`nr13_docs_${TAG}`)!) as { id: string }[];
    expect(lista.find((x) => x.id === 'cont-campo-1')).toEqual(containerOriginal());
    expect(lista).toHaveLength(2);
    expect(escritas).toContain(chaveRelatorio(novoId, TAG));
  });

  it('o código novo nunca colide com um registro existente', () => {
    const existentes = new Set(['REL-10', 'REL-11']);
    expect(codigoLivre(10, (c) => existentes.has(c))).toBe('REL-12');
  });
});

describe('fotos e anexos — a cópia não copia nem apaga arquivo', () => {
  it('editar medição, acumulação e foto NA CÓPIA não muda o container do original', async () => {
    const { salvarDadosFormulario, carregarContainer } = await import('../inspecoes/inspecaoService');
    await semearOriginal();
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    const idCopia = c!.meta.containerOrigemId!;
    // A foto é a MESMA referência ao bucket nos dois — nenhum arquivo copiado.
    const fotoCopia = (carregarContainer(TAG, idCopia)!.dados.acumulacao as { fotos: { ref: unknown }[] }).fotos[0].ref;
    expect(fotoCopia).toEqual(FOTO_REF);

    await salvarDadosFormulario(TAG, idCopia, 'ultrassom', { medidas: { c1: { '0': '5,00', '90': '5,10' } } });
    await salvarDadosFormulario(TAG, idCopia, 'acumulacao', { pressaoMaxima: '12,50', pressaoUnidade: 'bar', fotos: [] });

    expect(carregarContainer(TAG, 'cont-campo-1')).toEqual(containerOriginal());
    expect((carregarContainer(TAG, idCopia)!.dados.acumulacao as { pressaoMaxima: string }).pressaoMaxima).toBe('12,50');
  });

  it('container de origem que não existe mais: a cópia nasce SEM container, nunca com o de outro', async () => {
    await semearOriginal();
    localStorage.setItem(`nr13_docs_${TAG}`, JSON.stringify([]));
    const { relatorio: c } = await duplicarRelatorio('REL-1700000000000', TAG, AGORA);
    expect(c!.meta.containerOrigemId).toBeUndefined();
  });

  it('montagem pura: o PDF do original é outro objeto e a cópia não o leva', async () => {
    await semearOriginal();
    const c = montarDuplicata(finalizado(), { codigo: 'REL-2', hojeBr: '21/10/2026', modeloDocumento: 'novo' });
    expect(c.meta.containerOrigemId).toBe('cont-campo-1');
    expect(c.pdfRef).toBeUndefined();
    // A montagem é pura: mexer na cópia não alcança o objeto do original.
    const original = finalizado();
    const copia = montarDuplicata(original, { codigo: 'REL-3', hojeBr: '21/10/2026', modeloDocumento: 'novo' });
    copia.documentos.push('EXTRA.html');
    copia.meta.documentos!.push('EXTRA.html');
    expect(original.documentos).not.toContain('EXTRA.html');
    expect(original.meta.documentos).not.toContain('EXTRA.html');
  });

  it('original inexistente: nada é gravado', async () => {
    const escritas = await escritasDurante(() => duplicarRelatorio('REL-NAO-EXISTE', TAG, AGORA));
    expect(escritas.filter((k) => k.startsWith('nr13_rel_'))).toEqual([]);
  });
});

describe('a lista principal oferece o botão', () => {
  it('RelatoriosV9 tem "Duplicar relatório" na linha do finalizado e usa o serviço', async () => {
    const { readFileSync } = await import('node:fs');
    const v9 = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
    expect(v9).toContain('title="Duplicar relatório"');
    expect(v9).toContain('<Icone nome="copy" tam={14} />');
    expect(v9).toContain('duplicarRelatorio(duplicando.relatorioId, duplicando.tag)');
    // O histórico por TAG usa a MESMA regra — não existe segunda duplicação.
    const legado = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    expect(legado).toContain('await duplicarRelatorio(item.id, item.tagVaso)');
    expect(legado).not.toContain('copiarOverrides(');
  });
});
