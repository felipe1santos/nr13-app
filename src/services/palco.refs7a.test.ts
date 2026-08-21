/**
 * FASE 7A — o palco aprende a LER referência de logo e rubrica.
 *
 * A etapa 7A é só leitura: os writers continuam gravando dataURL. O que estes
 * testes protegem é a promessa mais cara da fase — **documento histórico nunca
 * recebe identidade visual errada**. Por isso quase todo caso aqui verifica o
 * que NÃO deve acontecer.
 */
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

const est = vi.hoisted(() => ({ baixadas: [] as string[], indisponiveis: new Set<string>() }));

vi.mock('./fotos', async (original) => {
  const mod = await original<typeof import('./fotos')>();
  return {
    ...mod,
    baixarFoto: vi.fn(async (ref: { path: string }): Promise<Blob | null> => {
      est.baixadas.push(ref.path);
      return est.indisponiveis.has(ref.path) ? null : new Blob(['bytes']);
    }),
    // O dataURL devolvido carrega o caminho, para os testes provarem QUAL
    // arquivo virou imagem.
    blobParaDataUrl: vi.fn(async () => `data:image/png;base64,RESOLVIDA`),
  };
});

import { hidratarFotosDoBucket, refsNoLugarDaChave } from './palco';

const ref = (nome: string) => ({
  bucket: 'inspecao',
  path: `org-1/assinaturas/${nome}.png`,
  mimeType: 'image/png',
  tamanho: 100,
});
const LOGO = { bucket: 'inspecao', path: 'org-1/logos/hashA.jpg', mimeType: 'image/jpeg', tamanho: 200 };

const hidrata = async (chave: string, valor: unknown) => {
  est.baixadas = [];
  const [saida] = await hidratarFotosDoBucket([{ chave, valor: JSON.stringify(valor) }]);
  return JSON.parse(saida.valor);
};

// ---------------------------------------------------------------------------
describe('tabela de refs resolvidas no lugar', () => {
  it('cobre logo da empresa, rubrica do funcionário e o snapshot do relatório', () => {
    expect(refsNoLugarDaChave('nr13_minha_empresa')).toEqual([{ de: 'logoRef', para: 'logo' }]);
    expect(refsNoLugarDaChave('nr13_lista_phs')).toEqual([
      { de: 'assinaturaRef', para: 'assinatura' },
    ]);
    expect(refsNoLugarDaChave('nr13_relatorio_meta_atual')).toEqual([
      { de: 'logoRef', para: 'logo' },
      { de: 'assinaturaRef', para: 'assinatura' },
    ]);
  });

  it('NÃO alcança o livro — ele tem motor próprio, com mapa e entradas lacradas', () => {
    expect(refsNoLugarDaChave('nr13_livro_TAG')).toEqual([]);
  });

  it('NÃO alcança relatório salvo nem chave de foto', () => {
    expect(refsNoLugarDaChave('nr13_rel_REL-1_TAG')).toEqual([]);
    expect(refsNoLugarDaChave('nr13_fotos_TAG')).toEqual([]);
  });
});

describe('logo da empresa', () => {
  it('resolve `logoRef` para o campo `logo` que os 41 templates já leem', async () => {
    const o = await hidrata('nr13_minha_empresa', { razao: 'ACME', logoRef: LOGO });
    expect(o.logo).toBe('data:image/png;base64,RESOLVIDA');
    expect(o.razao).toBe('ACME'); // resto intacto
  });

  it('base64 LEGADO continua funcionando — e nem baixa nada', async () => {
    const o = await hidrata('nr13_minha_empresa', { logo: 'data:image/jpeg;base64,LEGADA' });
    expect(o.logo).toBe('data:image/jpeg;base64,LEGADA');
    expect(est.baixadas).toHaveLength(0);
  });

  it('com os DOIS, a dataURL já presente VENCE — é o conteúdo daquele documento', async () => {
    const o = await hidrata('nr13_minha_empresa', {
      logo: 'data:image/jpeg;base64,CONGELADA',
      logoRef: LOGO,
    });
    expect(o.logo).toBe('data:image/jpeg;base64,CONGELADA');
    expect(est.baixadas).toHaveLength(0);
  });
});

describe('rubrica do funcionário', () => {
  it('resolve `assinaturaRef` em cada item da lista', async () => {
    const o = await hidrata('nr13_lista_phs', [
      { id: '1', nome: 'Eng', assinaturaRef: ref('hashA') },
      { id: '2', nome: 'Tec', assinatura: 'data:image/png;base64,LEGADA' },
      { id: '3', nome: 'Sem rubrica' },
    ]);
    expect(o[0].assinatura).toBe('data:image/png;base64,RESOLVIDA');
    expect(o[1].assinatura).toBe('data:image/png;base64,LEGADA');
    expect(o[2].assinatura).toBeUndefined();
  });

  it('a MESMA rubrica em dois funcionários é baixada UMA vez', async () => {
    await hidrata('nr13_lista_phs', [
      { id: '1', assinaturaRef: ref('mesmoHash') },
      { id: '2', assinaturaRef: ref('mesmoHash') },
    ]);
    expect(est.baixadas).toEqual(['org-1/assinaturas/mesmoHash.png']);
  });
});

describe('snapshot do relatório em montagem', () => {
  it('resolve logo e rubricas aninhadas na meta', async () => {
    const o = await hidrata('nr13_relatorio_meta_atual', {
      numero: 'REL-1',
      empresa: { razao: 'ACME', logoRef: LOGO },
      assinantes: {
        engenheiro: { nome: 'Eng', assinaturaRef: ref('hashEng') },
        tecnico: { nome: 'Tec', assinatura: 'data:image/png;base64,CONGELADA' },
      },
    });
    expect(o.empresa.logo).toBe('data:image/png;base64,RESOLVIDA');
    expect(o.assinantes.engenheiro.assinatura).toBe('data:image/png;base64,RESOLVIDA');
    expect(o.assinantes.tecnico.assinatura).toBe('data:image/png;base64,CONGELADA');
    expect(o.numero).toBe('REL-1');
  });
});

// ---------------------------------------------------------------------------
// A regra mais cara da fase
// ---------------------------------------------------------------------------
describe('erro de resolução NUNCA vira identidade visual errada', () => {
  it('ref que não resolve deixa o campo COMO ESTAVA — não busca a logo atual', async () => {
    est.indisponiveis.add(LOGO.path);
    const o = await hidrata('nr13_minha_empresa', { razao: 'ACME', logoRef: LOGO });

    // Sem imagem: campo ausente. A folha imprime sem logo — que é MUITO melhor
    // do que imprimir com a logo de outra época.
    expect(o.logo).toBeUndefined();
    expect(o.logoRef).toEqual(LOGO); // a referência continua lá, para a próxima tentativa
    est.indisponiveis.clear();
  });

  it('rubrica indisponível não é substituída pela de outro assinante', async () => {
    est.indisponiveis.add(ref('some').path);
    const o = await hidrata('nr13_relatorio_meta_atual', {
      assinantes: {
        engenheiro: { nome: 'Eng', assinaturaRef: ref('some') },
        tecnico: { nome: 'Tec', assinaturaRef: ref('existe') },
      },
    });
    expect(o.assinantes.engenheiro.assinatura).toBeUndefined();
    expect(o.assinantes.tecnico.assinatura).toBe('data:image/png;base64,RESOLVIDA');
    est.indisponiveis.clear();
  });
});

describe('o que a 7A NÃO pode tocar', () => {
  it('relatório salvo não é alcançado pela resolução no lugar', async () => {
    const snapshot = {
      meta: { empresa: { logo: 'data:image/jpeg;base64,DE-2024' }, assinantes: {} },
    };
    const o = await hidrata('nr13_rel_REL-1_TAG', snapshot);
    expect(o).toEqual(snapshot);
    expect(est.baixadas).toHaveLength(0);
  });

  it('nenhuma URL assinada é persistida — o palco grava dataURL, e ele é efêmero', async () => {
    const o = await hidrata('nr13_minha_empresa', { logoRef: LOGO });
    const bruto = JSON.stringify(o);
    expect(bruto).not.toMatch(/https?:\/\//);
    expect(bruto).not.toMatch(/token=/);
    expect(o.logo.startsWith('data:')).toBe(true);
  });

  it('chave sem ref nenhuma passa intacta e sem custo', async () => {
    est.baixadas = [];
    const itens = [{ chave: 'nr13_minha_empresa', valor: '{"razao":"ACME"}' }];
    const saida = await hidratarFotosDoBucket(itens);
    expect(saida[0]).toBe(itens[0]); // mesma referência: nada foi reconstruído
    expect(est.baixadas).toHaveLength(0);
  });
});
