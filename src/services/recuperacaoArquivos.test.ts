/**
 * Fase 6 — recuperação do fallback base64.
 *
 * O teste central desta suíte não é "converteu?". É **"em toda falha anterior
 * ao commit definitivo, o base64 original continua byte a byte preservado?"**.
 * Por isso quase todo teste captura o registro ANTES e compara depois.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const est = vi.hoisted(() => ({
  banco: new Map<string, unknown>(),
  bloqueado: false,
  uploads: [] as string[],
  pendentes: new Set<string>(),
  falharSalvarArquivo: false,
  tamanhoForcado: null as number | null,
  falharConfirmacao: false,
}));

vi.mock('./storage', () => ({
  ler: vi.fn(<T,>(c: string): T | null => (est.banco.has(c) ? (est.banco.get(c) as T) : null)),
  salvar: vi.fn(async (c: string, v: unknown) => void est.banco.set(c, v)),
  listarChavesComPrefixo: vi.fn((p: string) => [...est.banco.keys()].filter((k) => k.startsWith(p))),
  bloqueadoParaEscrita: vi.fn(() => est.bloqueado),
}));

vi.mock('./fotos', () => ({
  salvarArquivo: vi.fn(async (blob: Blob, escopo: string, ext: string, mime: string) => {
    if (est.falharSalvarArquivo) throw new Error('sem organização ativa');
    const path = `org-1/${escopo}/uuid-${est.uploads.length + 1}.${ext}`;
    est.uploads.push(path);
    return { bucket: 'inspecao', path, mimeType: mime, tamanho: est.tamanhoForcado ?? blob.size };
  }),
  arquivoPendente: vi.fn(async (path: string) => {
    if (est.falharConfirmacao) throw new Error('cofre indisponível');
    return est.pendentes.has(path);
  }),
}));

import {
  recuperarChave,
  recuperarPendentes,
  recuperarArquivosEmSegundoPlano,
  _zerarGatilho,
  FAMILIAS_RECUPERAVEIS,
  dataUrlParaBlob,
  ehDataUrl,
  TETO_POR_SESSAO,
  type FamiliaRecuperavel,
} from './recuperacaoArquivos';

/** `navigator` no Node 22 é somente-leitura: sobrescreve só a propriedade. */
function definirOnline(v: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: v, configurable: true });
}

const RASTREAB = FAMILIAS_RECUPERAVEIS.find((f) => f.prefixo === 'nr13_rastreab_')!;
const COMPONENTES = FAMILIAS_RECUPERAVEIS.find((f) => f.prefixo === 'nr13_componentes_cal_')!;

/** dataURL de PDF pequeno, mas com bytes de verdade. */
const PDF64 = 'data:application/pdf;base64,' + btoa('%PDF-1.4 conteudo do certificado');
const JPG64 = 'data:image/jpeg;base64,' + btoa('bytes-da-foto-do-componente');

function registro(extra: Record<string, unknown> = {}) {
  return { id: 'r1', nome: 'Bloco padrão', pdfBase64: PDF64, ...extra };
}

beforeEach(() => {
  est.banco.clear();
  est.bloqueado = false;
  est.uploads = [];
  est.pendentes.clear();
  est.falharSalvarArquivo = false;
  est.tamanhoForcado = null;
  est.falharConfirmacao = false;
  _zerarGatilho();
  definirOnline(true);
});

// ---------------------------------------------------------------------------
describe('helpers', () => {
  it('dataUrlParaBlob preserva os bytes e o mime', async () => {
    const b = dataUrlParaBlob(PDF64);
    expect(b.type).toBe('application/pdf');
    expect(await b.text()).toBe('%PDF-1.4 conteudo do certificado');
  });

  it('ehDataUrl distingue dataURL de string vazia e de referência', () => {
    expect(ehDataUrl(PDF64)).toBe(true);
    expect(ehDataUrl('')).toBe(false);
    expect(ehDataUrl({ path: 'x' })).toBe(false);
  });
});

describe('caminho feliz', () => {
  it('converte: ganha a referência e o base64 sai — na MESMA escrita', async () => {
    est.banco.set('nr13_rastreab_1', registro());

    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r).toEqual({ convertidos: 1, adiados: 0, jaMigrados: 0 });
    const depois = est.banco.get('nr13_rastreab_1') as Record<string, unknown>;
    expect(depois.pdfBase64).toBe('');
    expect((depois.pdfRef as { path: string }).path).toContain('/certificados/');
    // O resto do registro é preservado.
    expect(depois.nome).toBe('Bloco padrão');
  });

  it('o arquivo sobe para a MESMA pasta que o caminho feliz do serviço usa', async () => {
    est.banco.set('nr13_rastreab_1', registro());
    await recuperarChave('nr13_rastreab_1', RASTREAB);
    expect(est.uploads[0]).toContain('/certificados/');
    expect(est.uploads[0]).toMatch(/\.pdf$/);
  });

  it('lista (componentes): converte só os itens com base64 e mantém a ordem', async () => {
    est.banco.set('nr13_componentes_cal_ZZ', [
      { id: 'c1', nome: 'PSV', foto: JPG64 },
      { id: 'c2', nome: 'Manômetro', foto: '', fotoRef: { bucket: 'inspecao', path: 'org-1/componentes/ja.jpg' } },
      { id: 'c3', nome: 'Sem foto', foto: '' },
    ]);

    const r = await recuperarChave('nr13_componentes_cal_ZZ', COMPONENTES);

    expect(r).toEqual({ convertidos: 1, adiados: 0, jaMigrados: 1 });
    const arr = est.banco.get('nr13_componentes_cal_ZZ') as Array<Record<string, unknown>>;
    expect(arr.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(arr[0].foto).toBe('');
    expect((arr[0].fotoRef as { path: string }).path).toContain('/componentes/');
    expect((arr[1].fotoRef as { path: string }).path).toBe('org-1/componentes/ja.jpg'); // intocado
  });
});

// ---------------------------------------------------------------------------
// O QUE MAIS IMPORTA: nenhuma falha pode custar o base64
// ---------------------------------------------------------------------------
describe('em TODA falha antes do commit, o base64 fica byte a byte', () => {
  const conferirIntacto = (antes: unknown) => {
    expect(est.banco.get('nr13_rastreab_1')).toEqual(antes);
    expect((est.banco.get('nr13_rastreab_1') as Record<string, unknown>).pdfBase64).toBe(PDF64);
  };

  it('1 · falha ao CONVERTER (base64 corrompido)', async () => {
    const antes = { id: 'r1', pdfBase64: 'data:application/pdf;base64,%%%nao-e-base64%%%' };
    est.banco.set('nr13_rastreab_1', { ...antes });

    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r.convertidos).toBe(0);
    expect(r.adiados).toBe(1);
    expect(est.banco.get('nr13_rastreab_1')).toEqual(antes);
    expect(est.uploads).toHaveLength(0); // nem tentou subir
  });

  it('2 · falha no UPLOAD', async () => {
    const antes = registro();
    est.banco.set('nr13_rastreab_1', { ...antes });
    est.falharSalvarArquivo = true;

    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r.adiados).toBe(1);
    conferirIntacto(antes);
  });

  it('3 · upload fica PENDENTE (offline no meio)', async () => {
    const antes = registro();
    est.banco.set('nr13_rastreab_1', { ...antes });
    // tudo que subir fica pendente
    est.pendentes.add('org-1/certificados/uuid-1.pdf');

    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r.adiados).toBe(1);
    conferirIntacto(antes);
  });

  it('3-bis · a CONFIRMAÇÃO em si falha → trata como pendente', async () => {
    const antes = registro();
    est.banco.set('nr13_rastreab_1', { ...antes });
    est.falharConfirmacao = true;

    expect((await recuperarChave('nr13_rastreab_1', RASTREAB)).adiados).toBe(1);
    conferirIntacto(antes);
  });

  it('4 · validação de TAMANHO falha antes de gravar a referência', async () => {
    const antes = registro();
    est.banco.set('nr13_rastreab_1', { ...antes });
    est.tamanhoForcado = 999999; // servidor confirmou outra coisa

    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r.adiados).toBe(1);
    conferirIntacto(antes);
  });

  it('5 · RETRY depois da falha converte, sem duplicar registro', async () => {
    const antes = registro();
    est.banco.set('nr13_rastreab_1', { ...antes });
    est.falharSalvarArquivo = true;
    await recuperarChave('nr13_rastreab_1', RASTREAB);
    conferirIntacto(antes);

    est.falharSalvarArquivo = false;
    const r = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(r.convertidos).toBe(1);
    expect((est.banco.get('nr13_rastreab_1') as Record<string, unknown>).pdfBase64).toBe('');
  });

  it('6 · rodar de novo DEPOIS de migrado não faz nada — nem sobe arquivo', async () => {
    est.banco.set('nr13_rastreab_1', registro());
    await recuperarChave('nr13_rastreab_1', RASTREAB);
    const depoisDaPrimeira = est.banco.get('nr13_rastreab_1');
    const uploadsDepoisDaPrimeira = est.uploads.length;

    const segunda = await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(segunda).toEqual({ convertidos: 0, adiados: 0, jaMigrados: 1 });
    expect(est.banco.get('nr13_rastreab_1')).toEqual(depoisDaPrimeira);
    expect(est.uploads).toHaveLength(uploadsDepoisDaPrimeira); // NENHUM arquivo novo
  });

  it('não grava nada quando nenhum item mudou', async () => {
    const { salvar } = await import('./storage');
    est.banco.set('nr13_rastreab_1', registro({ pdfRef: { bucket: 'inspecao', path: 'org-1/certificados/x.pdf' } }));
    vi.mocked(salvar).mockClear();

    await recuperarChave('nr13_rastreab_1', RASTREAB);

    expect(vi.mocked(salvar)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('varredura', () => {
  it('respeita o teto por sessão', async () => {
    for (let i = 1; i <= 6; i++) est.banco.set(`nr13_rastreab_${i}`, registro({ id: `r${i}` }));

    const r = await recuperarPendentes({ teto: 2 });

    expect(r.chavesVisitadas).toBe(2);
    expect(r.convertidos).toBe(2);
    expect(r.interrompidaPorTeto).toBe(true);
    // As 4 restantes continuam com o base64 — voltam na próxima sessão.
    expect((est.banco.get('nr13_rastreab_6') as Record<string, unknown>).pdfBase64).toBe(PDF64);
  });

  it('o teto padrão é 3', () => {
    expect(TETO_POR_SESSAO).toBe(3);
  });

  it('conta SOMENTE LEITURA não converte nada', async () => {
    est.banco.set('nr13_rastreab_1', registro());
    est.bloqueado = true;

    const r = await recuperarPendentes();

    expect(r.naoExecutou).toBe('somente-leitura');
    expect(r.convertidos).toBe(0);
    expect((est.banco.get('nr13_rastreab_1') as Record<string, unknown>).pdfBase64).toBe(PDF64);
  });

  it('OFFLINE não converte nada', async () => {
    est.banco.set('nr13_rastreab_1', registro());
    definirOnline(false);

    const r = await recuperarPendentes();

    expect(r.naoExecutou).toBe('offline');
    expect(est.uploads).toHaveLength(0);
  });

  it('uma chave problemática não segura as outras', async () => {
    est.banco.set('nr13_rastreab_1', 'isto não é objeto');
    est.banco.set('nr13_rastreab_2', registro({ id: 'r2' }));

    const r = await recuperarPendentes({ teto: 10 });

    expect(r.convertidos).toBe(1);
  });

  it('o gatilho de background roda uma vez por sessão', async () => {
    est.banco.set('nr13_rastreab_1', registro());
    recuperarArquivosEmSegundoPlano();
    recuperarArquivosEmSegundoPlano();
    await new Promise((r) => setTimeout(r, 10));
    expect(est.uploads).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A lista de famílias é a fronteira da fase. Se ela crescer errado, um
// documento assinado é reescrito.
// ---------------------------------------------------------------------------
describe('fronteira da Fase 6', () => {
  const proibidas = [
    'nr13_rel_',            // snapshots congelados — §7-bis, imutáveis
    'nr13_minha_empresa',   // logo — Fase 7
    'nr13_lista_phs',       // rubrica — Fase 7
    'nr13_livro_',          // rubrica do livro — já tem motor próprio, e as lacradas são intocáveis
    'nr13_fotos_',          // base64 legado de foto — compatibilidade permanente (I-26)
    'nr13_historico_relatorios',
    'nr13_prontuario_',
    'nr13_relatorio_meta_atual',
  ];

  it('NENHUMA família fora do A-10 entra na varredura', () => {
    for (const p of proibidas) {
      expect(FAMILIAS_RECUPERAVEIS.map((f) => f.prefixo)).not.toContain(p);
    }
  });

  it('são exatamente as 3 famílias do A-10', () => {
    expect(FAMILIAS_RECUPERAVEIS.map((f) => f.prefixo).sort()).toEqual([
      'nr13_componentes_cal_',
      'nr13_pront_fab_',
      'nr13_rastreab_',
    ]);
  });

  it('um snapshot de relatório nunca é alcançado pela varredura', async () => {
    const snapshot = { meta: { empresa: { logo: 'data:image/jpeg;base64,AAAA' } } };
    est.banco.set('nr13_rel_REL-1_TAG', snapshot);

    await recuperarPendentes({ teto: 50 });

    expect(est.banco.get('nr13_rel_REL-1_TAG')).toEqual(snapshot);
    expect(est.uploads).toHaveLength(0);
  });

  it('cada família aponta para a pasta que o serviço já usa', () => {
    const porPrefixo = Object.fromEntries(FAMILIAS_RECUPERAVEIS.map((f: FamiliaRecuperavel) => [f.prefixo, f]));
    expect(porPrefixo['nr13_rastreab_'].escopo).toBe('certificados');
    expect(porPrefixo['nr13_pront_fab_'].escopo).toBe('prontuario-fabricante');
    expect(porPrefixo['nr13_componentes_cal_'].escopo).toBe('componentes');
  });
});
