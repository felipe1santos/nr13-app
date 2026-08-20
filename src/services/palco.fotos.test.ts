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

const mockBaixar = vi.hoisted(() =>
  vi.fn(async (ref: { path: string }): Promise<Blob | null> => {
    baixadasRef.lista.push(ref.path);
    return new Blob(['bytes-da-imagem']);
  }),
);
// `baixadas` é uma const de módulo e não pode ser tocada de dentro de um
// `vi.hoisted` (ele roda antes). O indireto resolve sem mudar os testes que já
// liam `baixadas`.
const baixadasRef = vi.hoisted(() => ({ lista: [] as string[] }));
vi.mock('./fotos', async (original) => {
  const mod = await original<typeof import('./fotos')>();
  return {
    ...mod,
    baixarFoto: mockBaixar,
    blobParaDataUrl: vi.fn(async () => 'data:image/jpeg;base64,SGVsbG8='),
  };
});

/** Mesma referência de array — os testes que já liam `baixadas` seguem iguais. */
const baixadas = baixadasRef.lista;

import { hidratarFotosDoBucket, CHAVE_RUBRICAS_PALCO } from './palco';

describe('palco — hidratação das fotos para os templates', () => {
  it('a galeria recebe SÓ `src` — é o único campo que a CAPA lê', async () => {
    // Gravar os dois custava a imagem inteira em dobro dentro de um orçamento
    // de 3.368 KB. `CAPA.html` é a única folha que lê `nr13_fotos_`, e lê
    // `fotoCapa.src` — conferido por varredura em `palco.camposFoto.test.ts`.
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
    expect(fotos[0].base64).toBeUndefined();
  });

  it('chave de campo recebe SÓ `base64`, e o valor fica pela metade do peso', async () => {
    const ref = { bucket: 'inspecao', path: 'org-1/tag/ve.jpg' };
    const [saida] = await hidratarFotosDoBucket([
      { chave: 'nr13_injecao_atual', valor: JSON.stringify({ ve: { fotos: [{ ref }] } }) },
    ]);
    const obj = JSON.parse(saida.valor);
    expect(obj.ve.fotos[0].base64).toBe('data:image/jpeg;base64,SGVsbG8=');
    expect(obj.ve.fotos[0].src).toBeUndefined();
  });

  it('chave DESCONHECIDA ainda recebe os dois — faltar é o defeito silencioso', async () => {
    const ref = { bucket: 'inspecao', path: 'org-1/tag/x.jpg' };
    const [saida] = await hidratarFotosDoBucket([
      { chave: 'nr13_familia_nova_atual', valor: JSON.stringify([{ ref }]) },
    ]);
    const obj = JSON.parse(saida.valor);
    expect(obj[0].src).toContain('data:image');
    expect(obj[0].base64).toContain('data:image');
  });

  it('alcança fotos aninhadas dentro do container de inspeção', async () => {
    const container = {
      visual_externo: {
        fotos: [{ ref: { bucket: 'inspecao', path: 'org-1/tag/ve.jpg' }, descricao: 'trinca' }],
      },
      checklist: { fotosDocumentacao: [{ ref: { bucket: 'inspecao', path: 'org-1/tag/doc.jpg' }, descricao: '' }] },
    };

    const [injecao] = await hidratarFotosDoBucket([
      { chave: 'nr13_injecao_atual', valor: JSON.stringify(container) },
    ]);
    const [inspecao] = await hidratarFotosDoBucket([
      { chave: 'nr13_inspecao_atual', valor: JSON.stringify(container) },
    ]);

    // Cada grupo é embutido na chave cuja folha imprime as fotos dele — ver a
    // partição em `grupoVaiNaChave`.
    expect(JSON.parse(injecao.valor).visual_externo.fotos[0].base64).toContain('data:image');
    expect(JSON.parse(inspecao.valor).checklist.fotosDocumentacao[0].base64).toContain('data:image');
    expect(JSON.parse(injecao.valor).visual_externo.fotos[0].descricao).toBe('trinca'); // resto intacto
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

describe('palco — partição das fotos entre as duas chaves de campo', () => {
  const ref = (n: string) => ({ bucket: 'inspecao', path: `org-1/tag/${n}.jpg` });
  const container = () =>
    JSON.stringify({
      checklist: { fotos: [{ ref: ref('chk') }], fotosDocumentacao: [{ ref: ref('doc') }] },
      visual_externo: { fotos: [{ ref: ref('ve') }] },
      visual_interno: { fotos: [{ ref: ref('vi') }] },
      th: { fotos: [{ ref: ref('th') }] },
    });

  const temImagem = (v: unknown) => typeof (v as { base64?: string })?.base64 === 'string';

  it('inspecao_atual embute só as fotos do checklist', async () => {
    const [saida] = await hidratarFotosDoBucket([{ chave: 'nr13_inspecao_atual', valor: container() }]);
    const o = JSON.parse(saida.valor);
    expect(temImagem(o.checklist.fotos[0])).toBe(true);
    expect(temImagem(o.checklist.fotosDocumentacao[0])).toBe(true);
    // Os outros grupos seguem só com a `ref` — nenhuma folha que leia esta
    // chave imprime as fotos deles.
    expect(temImagem(o.visual_externo.fotos[0])).toBe(false);
    expect(o.visual_externo.fotos[0].ref.path).toContain('ve.jpg'); // o dado NÃO some
    expect(temImagem(o.th.fotos[0])).toBe(false);
  });

  it('injecao_atual embute visual externo/interno e TH, mas não o checklist', async () => {
    const [saida] = await hidratarFotosDoBucket([{ chave: 'nr13_injecao_atual', valor: container() }]);
    const o = JSON.parse(saida.valor);
    expect(temImagem(o.visual_externo.fotos[0])).toBe(true);
    expect(temImagem(o.visual_interno.fotos[0])).toBe(true);
    expect(temImagem(o.th.fotos[0])).toBe(true);
    expect(temImagem(o.checklist.fotos[0])).toBe(false);
    expect(o.checklist.fotos[0].ref.path).toContain('chk.jpg');
  });

  it('cada foto é embutida UMA vez somando as duas chaves', async () => {
    const saida = await hidratarFotosDoBucket([
      { chave: 'nr13_inspecao_atual', valor: container() },
      { chave: 'nr13_injecao_atual', valor: container() },
    ]);
    let embutidas = 0;
    const contar = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(contar);
      if (typeof n !== 'object' || n === null) return;
      if (temImagem(n)) embutidas++;
      Object.values(n).forEach(contar);
    };
    saida.forEach((s) => contar(JSON.parse(s.valor)));
    expect(embutidas).toBe(5); // 5 fotos distintas, nenhuma em dobro
  });

  it('grupo desconhecido é embutido nas DUAS — faltar é pior que gastar', async () => {
    const valor = JSON.stringify({ ensaio_novo: { fotos: [{ ref: ref('novo') }] } });
    for (const chave of ['nr13_inspecao_atual', 'nr13_injecao_atual']) {
      const [saida] = await hidratarFotosDoBucket([{ chave, valor }]);
      expect(temImagem(JSON.parse(saida.valor).ensaio_novo.fotos[0])).toBe(true);
    }
  });
});

describe('palco — rubrica do livro materializada UMA vez', () => {
  const ref = { bucket: 'inspecao', path: 'org-1/assinaturas/abc123.png' };
  const outra = { bucket: 'inspecao', path: 'org-1/assinaturas/def456.png' };
  const IMG = 'data:image/jpeg;base64,SGVsbG8=';

  it('a imagem vai para o MAPA, não para dentro de cada entrada', async () => {
    const livro = JSON.stringify([
      { id: 'LIV-1', descricao: 'x', assinaturaRef: ref },
      { id: 'LIV-2', descricao: 'y', assinaturaRef: ref },
    ]);
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_livro_VP01', valor: livro }]);

    const mapa = saida.find((s) => s.chave === CHAVE_RUBRICAS_PALCO)!;
    expect(JSON.parse(mapa.valor)).toEqual({ [ref.path]: IMG });

    // A entrada NÃO engorda: segue com a referência e sem imagem embutida.
    const entradas = JSON.parse(saida.find((s) => s.chave === 'nr13_livro_VP01')!.valor);
    expect(entradas[0].assinaturaImg).toBeUndefined();
    expect(entradas[0].assinaturaRef.path).toBe(ref.path);
  });

  it('20 entradas com a mesma rubrica custam UMA cópia', async () => {
    baixadas.length = 0;
    const livro = JSON.stringify(
      Array.from({ length: 20 }, (_, i) => ({ id: `LIV-${i}`, assinaturaRef: ref })),
    );
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_livro_VP01', valor: livro }]);

    expect(baixadas.filter((p) => p === ref.path)).toHaveLength(1);
    const mapa = JSON.parse(saida.find((s) => s.chave === CHAVE_RUBRICAS_PALCO)!.valor);
    expect(Object.keys(mapa)).toHaveLength(1);
    // Era isto que pesava: embutir por entrada daria 20 cópias da imagem.
    // A prova é que a dataURL não aparece NENHUMA vez dentro do livro.
    const livroSaida = saida.find((s) => s.chave === 'nr13_livro_VP01')!.valor;
    expect(livroSaida).not.toContain('data:image');
    expect((mapa[ref.path].match(/data:image/g) ?? []).length).toBe(1);
  });

  it('rubricas DIFERENTES viram entradas diferentes do mapa', async () => {
    const livro = JSON.stringify([{ assinaturaRef: ref }, { assinaturaRef: outra }]);
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_livro_VP01', valor: livro }]);
    expect(Object.keys(JSON.parse(saida.find((s) => s.chave === CHAVE_RUBRICAS_PALCO)!.valor))).toEqual([
      ref.path,
      outra.path,
    ]);
  });

  it('sem rubrica por referência, o mapa nem existe', async () => {
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_info_VP01', valor: '{"tag":"A"}' }]);
    expect(saida.some((s) => s.chave === CHAVE_RUBRICAS_PALCO)).toBe(false);
  });

  it('entrada LEGADA com assinaturaImg em base64 segue intacta e sem mapa', async () => {
    const legado = JSON.stringify([{ id: 'LIV-1', assinaturaImg: 'data:image/png;base64,VELHA' }]);
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_livro_VP01', valor: legado }]);
    expect(saida.find((s) => s.chave === 'nr13_livro_VP01')!.valor).toBe(legado);
    expect(saida.some((s) => s.chave === CHAVE_RUBRICAS_PALCO)).toBe(false);
  });

  it('a referência nomeada NÃO vaza para outras famílias de chave', async () => {
    const valor = JSON.stringify([{ assinaturaRef: ref }]);
    const saida = await hidratarFotosDoBucket([{ chave: 'nr13_info_VP01', valor }]);
    expect(saida.some((s) => s.chave === CHAVE_RUBRICAS_PALCO)).toBe(false);
    expect(JSON.parse(saida[0].valor)[0].assinaturaImg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — a regressão que degradaria documento assinado
// ---------------------------------------------------------------------------
describe('o palco NUNCA usa a miniatura', () => {
  it('com miniatura disponível, o documento ainda baixa a PRINCIPAL', async () => {
    // A miniatura tem 400 px e existe para card e lista. A folha A4 é impressa a
    // 300 dpi e pede ~1.060 px de largura útil. Se a miniatura vazasse para cá,
    // o relatório sairia borrado — assinado por engenheiro, e sem erro nenhum
    // na tela para avisar.
    baixadas.length = 0;
    const ref = {
      bucket: 'inspecao',
      path: 'org-1/ACA_2002/principal.jpg',
      mimeType: 'image/jpeg',
      tamanho: 112000,
      thumb: {
        bucket: 'inspecao',
        path: 'org-1/ACA_2002/principal.thumb.jpg',
        mimeType: 'image/jpeg',
        tamanho: 16000,
      },
    };

    await hidratarFotosDoBucket([
      { chave: 'nr13_fotos_ACA 2002', valor: JSON.stringify([{ id: 1, src: '', ref, isCapa: true }]) },
      { chave: 'nr13_injecao_atual', valor: JSON.stringify({ ve: { fotos: [{ ref }] } }) },
    ]);

    expect(baixadas).toContain('org-1/ACA_2002/principal.jpg');
    expect(baixadas.some((p) => p.includes('.thumb.'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A-F5-02 — a ficha guarda histórico; a CAPA imprime UMA
// ---------------------------------------------------------------------------
/**
 * A regra NÃO é inventada aqui: é a de `CAPA.html`, linhas 322-333.
 *
 *   let fotoCapa = fotos.find(f => f.isCapa);
 *   if (fotoCapa && fotoCapa.src)              -> fotoCapa.src
 *   else if (fotos.length > 0 && fotos[0].src) -> fotos[0].src
 *   else                                       -> nr13_vaso_<TAG>.imagemPrint
 */
describe('palco — só a foto de identificação da ficha vira imagem', () => {
  const ref = (n: string) => ({ bucket: 'inspecao', path: `org-1/TAG/${n}.jpg`, mimeType: 'image/jpeg', tamanho: 100 });
  const foto = (id: number, nome: string, isCapa = false) => ({ id, src: '', ref: ref(nome), isCapa });
  const hidrata = async (arr: unknown[]) => {
    const [saida] = await hidratarFotosDoBucket([{ chave: 'nr13_fotos_TAG', valor: JSON.stringify(arr) }]);
    return JSON.parse(saida.valor) as Array<Record<string, unknown>>;
  };

  it('1 · ficha com UMA foto: a CAPA recebe essa foto', async () => {
    const r = await hidrata([foto(1, 'unica', true)]);
    expect(r[0].src).toBe('data:image/jpeg;base64,SGVsbG8=');
  });

  it('2 · ficha com histórico: SÓ a de identificação recebe imagem', async () => {
    baixadas.length = 0;
    const r = await hidrata([foto(1, 'velha1'), foto(2, 'velha2'), foto(3, 'atual', true)]);

    expect(r[2].src).toBe('data:image/jpeg;base64,SGVsbG8=');
    expect(r[0].src).toBe('');
    expect(r[1].src).toBe('');
    // E o que não é impresso não é nem BAIXADO — é onde o custo morava.
    expect(baixadas).toEqual(['org-1/TAG/atual.jpg']);
  });

  it('3 · trocar a foto: a CAPA usa a nova', async () => {
    const r = await hidrata([foto(1, 'antiga'), foto(2, 'nova', true)]);
    expect(r[1].src).toContain('data:image');
    expect(r[0].src).toBe('');
  });

  it('4 · sem nenhuma marcada, cai em fotos[0] — o fallback do template', async () => {
    const r = await hidrata([foto(1, 'primeira'), foto(2, 'segunda')]);
    expect(r[0].src).toContain('data:image');
    expect(r[1].src).toBe('');
  });

  it('4-bis · marcada SEM imagem disponível: hidrata fotos[0], como o template faria', async () => {
    // `&& fotoCapa.src` é a razão de a cadeia inteira ser repetida no palco.
    baixadas.length = 0;
    const original = mockBaixar.getMockImplementation()!;
    mockBaixar.mockImplementation(async (r: { path: string }) => {
      baixadas.push(r.path);
      return r.path.includes('sumida') ? null : new Blob(['bytes']);
    });

    const r = await hidrata([foto(1, 'primeira'), foto(2, 'sumida', true)]);
    expect(r[1].src).toBe('');
    expect(r[0].src).toContain('data:image');

    mockBaixar.mockImplementation(original);
  });

  it('5 · o array REAL continua inteiro — nada é removido do palco', async () => {
    const arr = [foto(1, 'a'), foto(2, 'b'), foto(3, 'c', true), foto(4, 'd')];
    const r = await hidrata(arr);

    expect(r).toHaveLength(4);
    expect(r.map((f) => f.id)).toEqual([1, 2, 3, 4]);
    // As referências históricas continuam lá, inclusive as que não viraram imagem.
    expect(r.every((f) => (f.ref as { path: string }).path)).toBe(true);
  });

  it('8 · o palco não converte foto histórica: 18 entradas, 1 imagem', async () => {
    baixadas.length = 0;
    const historico = Array.from({ length: 18 }, (_, i) => foto(i + 1, `h${i + 1}`, i === 17));
    const r = await hidrata(historico);

    expect(r).toHaveLength(18);
    expect(r.filter((f) => String(f.src).startsWith('data:'))).toHaveLength(1);
    expect(baixadas).toHaveLength(1);
  });

  it('10 · nada de base64 é criado onde não havia — as demais seguem com `src` vazio', async () => {
    const r = await hidrata([foto(1, 'a'), foto(2, 'b', true), foto(3, 'c')]);
    const comImagem = r.filter((f) => String(f.src).startsWith('data:'));
    expect(comImagem).toHaveLength(1);
    expect(r[0].base64).toBeUndefined();
    expect(r[2].base64).toBeUndefined();
  });

  it('base64 LEGADO na identificação é respeitado, e nada é baixado', async () => {
    baixadas.length = 0;
    const legado = { id: 1, src: 'data:image/jpeg;base64,LEGADO', isCapa: true, ref: ref('x') };
    const r = await hidrata([legado, foto(2, 'outra')]);

    expect(r[0].src).toBe('data:image/jpeg;base64,LEGADO');
    expect(baixadas).toHaveLength(0);
  });

  it('7 · as fotos das INSPEÇÕES continuam todas — outra família de chave', async () => {
    baixadas.length = 0;
    const container = { ve: { fotos: [{ ref: ref('ve1') }, { ref: ref('ve2') }, { ref: ref('ve3') }] } };
    const [saida] = await hidratarFotosDoBucket([
      { chave: 'nr13_injecao_atual', valor: JSON.stringify(container) },
    ]);
    const obj = JSON.parse(saida.valor);

    expect(obj.ve.fotos.map((f: Record<string, string>) => f.base64)).toEqual([
      'data:image/jpeg;base64,SGVsbG8=',
      'data:image/jpeg;base64,SGVsbG8=',
      'data:image/jpeg;base64,SGVsbG8=',
    ]);
    expect(baixadas).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Medição A-F5-02: o mesmo caso de produção, antes × depois
// ---------------------------------------------------------------------------
describe('medição — 18 fotos na ficha', () => {
  it('o peso da chave cai na proporção de 18 imagens para 1', async () => {
    // Em produção (20/08) a chave pesou 1.100,9 KB com 18 dataURLs de ~61 KB
    // cada, já degradadas a 900 px pelo palco. Aqui a dataURL é o dublê, então
    // o que se mede é a PROPORÇÃO — que é o que a correção muda.
    const IMAGEM = 'data:image/jpeg;base64,' + 'A'.repeat(60 * 1024);
    mockBaixar.mockImplementation(async (r: { path: string }) => {
      baixadas.push(r.path);
      return new Blob(['bytes']);
    });
    const mod = await import('./fotos');
    const espiao = vi.spyOn(mod, 'blobParaDataUrl').mockResolvedValue(IMAGEM);

    const historico = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      src: '',
      ref: { bucket: 'inspecao', path: `org-1/TAG/h${i + 1}.jpg`, mimeType: 'image/jpeg', tamanho: 100 },
      isCapa: i === 17,
    }));

    const [saida] = await hidratarFotosDoBucket([
      { chave: 'nr13_fotos_TAG', valor: JSON.stringify(historico) },
    ]);
    const kb = saida.valor.length / 1024;
    const arr = JSON.parse(saida.valor) as Array<Record<string, unknown>>;

    expect(arr).toHaveLength(18);
    expect(arr.filter((f) => String(f.src).startsWith('data:'))).toHaveLength(1);
    // Antes seriam 18 imagens; agora é uma. O teto confirma a ordem de grandeza.
    expect(kb).toBeLessThan(90);
    espiao.mockRestore();
  });
});
