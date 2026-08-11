import { describe, it, expect, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

vi.mock('./supabase', () => ({
  supabase: { storage: { from: vi.fn() } },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id' as const, id: 'org-1' })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

const baixadas: string[] = [];
vi.mock('./fotos', async (original) => {
  const mod = await original<typeof import('./fotos')>();
  return {
    ...mod,
    baixarFoto: vi.fn(async (ref: { path: string }) => {
      baixadas.push(ref.path);
      return new Blob(['bytes-da-imagem']);
    }),
    blobParaDataUrl: vi.fn(async () => 'data:image/jpeg;base64,SGVsbG8='),
  };
});

import { hidratarFotosDoBucket } from './palco';

describe('palco — hidratação das fotos para os templates', () => {
  it('devolve a imagem embutida nos campos que os templates leem', async () => {
    // CAPA.html lê `.src`; as folhas de fotos leem `.base64`. Os dois precisam
    // existir, porque os templates nunca foram uniformes.
    const itens = [
      {
        chave: 'nr13_fotos_ACA 2002',
        valor: JSON.stringify([
          { id: 1, src: '', ref: { bucket: 'inspecao', path: 'org-1/ACA_2002/a.jpg' }, isCapa: true },
        ]),
      },
    ];

    const saida = await hidratarFotosDoBucket(itens);
    const fotos = JSON.parse(saida[0].valor) as Array<Record<string, string>>;

    expect(fotos[0].src).toBe('data:image/jpeg;base64,SGVsbG8=');
    expect(fotos[0].base64).toBe('data:image/jpeg;base64,SGVsbG8=');
  });

  it('alcança fotos aninhadas dentro do container de inspeção', async () => {
    const container = {
      visual_externo: {
        fotos: [{ ref: { bucket: 'inspecao', path: 'org-1/tag/ve.jpg' }, descricao: 'trinca' }],
      },
      checklist: { fotosDocumentacao: [{ ref: { bucket: 'inspecao', path: 'org-1/tag/doc.jpg' }, descricao: '' }] },
    };

    const saida = await hidratarFotosDoBucket([
      { chave: 'nr13_injecao_atual', valor: JSON.stringify(container) },
    ]);
    const obj = JSON.parse(saida[0].valor);

    expect(obj.visual_externo.fotos[0].base64).toContain('data:image');
    expect(obj.checklist.fotosDocumentacao[0].base64).toContain('data:image');
    expect(obj.visual_externo.fotos[0].descricao).toBe('trinca'); // resto intacto
  });

  it('não toca em chave sem foto — nem gasta download', async () => {
    baixadas.length = 0;
    const itens = [{ chave: 'nr13_calc_ACA 2002', valor: '{"pmta":"1.2","memorialHTML":"<p>x</p>"}' }];

    const saida = await hidratarFotosDoBucket(itens);

    expect(saida[0]).toBe(itens[0]); // mesma referência: nada foi reconstruído
    expect(baixadas).toHaveLength(0);
  });

  it('baixa UMA vez a foto repetida em chaves diferentes', async () => {
    baixadas.length = 0;
    const ref = { bucket: 'inspecao', path: 'org-1/tag/repetida.jpg' };

    await hidratarFotosDoBucket([
      { chave: 'nr13_fotos_A', valor: JSON.stringify([{ ref }]) },
      { chave: 'nr13_injecao_atual', valor: JSON.stringify({ fotos: [{ ref }] }) },
    ]);

    expect(baixadas.filter((p) => p === ref.path)).toHaveLength(1);
  });

  it('foto LEGADA em base64 atravessa sem alteração', async () => {
    const legado = JSON.stringify([{ id: 1, src: 'data:image/jpeg;base64,VELHA', isCapa: true }]);
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_fotos_ANTIGO', valor: legado }]);
    expect(saida[0].valor).toBe(legado);
  });

  it('valor não-JSON não derruba a montagem', async () => {
    const itens = [{ chave: 'nr13_qualquer', valor: 'isto "ref" não é json' }];
    const saida = await hidratarFotosDoBucket(itens);
    expect(saida[0].valor).toBe('isto "ref" não é json');
  });
});
