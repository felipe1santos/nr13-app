/**
 * O QUADRO 7.1.1 NO PAPEL — filtro, override e paridade (22/09/2026).
 *
 * `idsInstrumentos.test.ts` prova a tradução e a estabilidade dos ids sobre a
 * função pura. Aqui o PDF é gerado de verdade e o texto lido de volta com
 * pdf.js, que é onde "a linha vazia não sai" pode ser verdade ou mentira.
 *
 * Os três cenários são os que o documento precisa acertar:
 *
 * A. três instrumentos declarados → três linhas, e só;
 * B. nenhum declarado → a seção CONTINUA, com a frase de que nada foi
 *    declarado (esconder a seção ou escrever "não possui" seria o sistema
 *    inferindo sobre o mundo físico);
 * C. instrumento NÃO declarado, mas com override manual → a linha continua
 *    visível, com o texto do engenheiro.
 *
 * E o mesmo quadro sai igual no documento avulso da inspeção e no relatório
 * final — é o recorte, não outro documento.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import { DOCS_POR_FORMULARIO } from '../../inspecoes/tipos';
import type { MapaOverrides } from '../overridesRelatorio';

const TAG = 'ZZ-QUADRO';
const CONTAINER = 'cont-quadro';
const FOLHAS_CHECKLIST = DOCS_POR_FORMULARIO.checklist;
const FOLHAS_RELATORIO = ['CAPA.html', 'SUMARIO.html', 'PLACA.html', ...FOLHAS_CHECKLIST, 'CONCLUSAO.html'];

const NOMES = {
  manometro: 'Manômetro',
  termometro: 'Termômetro',
  vacuometro: 'Vacuômetro',
  pressostato: 'Pressostato',
  transmissor: 'Transmissor de pressão',
  psv: 'Válvula de segurança (PSV)',
} as const;

const manual = (valor: string) => ({ modo: 'manual' as const, valor, auto: '', em: '2026-09-22T00:00:00.000Z' });

const gravar = (chave: string, valor: unknown) => localStorage.setItem(chave, JSON.stringify(valor));

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      t.items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return paginas.join(' \n ');
}

/** SÓ o quadro — da faixa até a próxima seção. */
function quadro(texto: string): string {
  const i = texto.indexOf('INSTRUMENTOS E DISPOSITIVOS DE SEGURANÇA INSTALADOS');
  if (i < 0) return '';
  const j = texto.indexOf('Observações', i);
  return texto.slice(i, j < 0 ? i + 1200 : j);
}

function semear(checklist: Record<string, unknown>) {
  localStorage.clear();
  gravar(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'VASO ZZ QUADRO', numeroSerie: 'S-Q-1' });
  gravar(`nr13_pref_unidade_${TAG}`, 'SI');
  gravar('nr13_minha_empresa', { razaoSocial: 'ZZ ENGENHARIA QUADRO LTDA' });
  const dados = { checklist };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
  gravar('nr13_relatorio_meta_atual', { codigo: 'REL-ZZ-QUADRO', containerOrigemId: CONTAINER });
}

async function gerar(
  checklist: Record<string, unknown>,
  overrides: MapaOverrides = {},
  documentos = FOLHAS_CHECKLIST,
): Promise<string> {
  semear(checklist);
  const r = await gerarRelatorioVetorial(TAG, { documentos, certificados: false, modo: 'preview', overrides });
  return textoDoPdf(r.bytes);
}

/** Cenário A · manômetro, pressostato e PSV declarados; os outros três, nada. */
const CHECKLIST_A = {
  instrumentos: {
    'inst-man': true,
    'inst-man-cal': true,
    'inst-press': true,
    'inst-press-cal': true,
    'inst-psv': true,
    'inst-psv-cal': true,
  },
};

let a = '';
let b = '';
let c = '';
let relatorioA = '';

beforeAll(async () => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });

  a = await gerar(CHECKLIST_A);
  b = await gerar({ instrumentos: {} });
  c = await gerar(
    { instrumentos: {} },
    { 'instrumentos.termometro.certificado': manual('Não instalado — não aplicável') },
  );
  relatorioA = await gerar(CHECKLIST_A, {}, FOLHAS_RELATORIO);
}, 300_000);

describe('A · só os instrumentos declarados', () => {
  it('as três linhas declaradas aparecem', () => {
    const q = quadro(a);
    expect(q).toContain(NOMES.manometro);
    expect(q).toContain(NOMES.pressostato);
    expect(q).toContain(NOMES.psv);
  });

  it('as três NÃO declaradas somem — era a queixa do cliente', () => {
    const q = quadro(a);
    expect(q).not.toContain(NOMES.termometro);
    expect(q).not.toContain(NOMES.vacuometro);
    expect(q).not.toContain(NOMES.transmissor);
  });

  it('a seção continua com cabeçalho e as quatro colunas', () => {
    const q = quadro(a);
    for (const col of ['INSTRUMENTO', 'POSSUI', 'CALIBRADO', 'Nº DO CERTIFICADO / VALIDADE']) {
      expect(q).toContain(col);
    }
  });

  it('nenhuma linha ficou deslocada: cada nome com a sua marcação', () => {
    // As três declaradas estão marcadas; a ordem no papel é a da lista.
    const q = quadro(a);
    const iMan = q.indexOf(NOMES.manometro);
    const iPress = q.indexOf(NOMES.pressostato);
    const iPsv = q.indexOf(NOMES.psv);
    expect(iMan).toBeGreaterThan(0);
    expect(iPress).toBeGreaterThan(iMan);
    expect(iPsv).toBeGreaterThan(iPress);
  });
});

describe('B · nenhum instrumento declarado', () => {
  it('a SEÇÃO continua — não some em silêncio', () => {
    expect(b).toContain('INSTRUMENTOS E DISPOSITIVOS DE SEGURANÇA INSTALADOS');
  });

  it('traz a frase do que foi registrado, e não "não possui"', () => {
    const q = quadro(b);
    expect(q).toContain('Nenhum instrumento/dispositivo foi declarado como encontrado nesta inspeção.');
    // "Não possui" seria uma inferência do sistema sobre o mundo físico.
    expect(q).not.toContain('Não possui');
  });

  it('nenhum nome de instrumento é impresso', () => {
    const q = quadro(b);
    for (const n of Object.values(NOMES)) expect(q).not.toContain(n);
  });
});

describe('C · não declarado, mas com override manual', () => {
  it('a linha do termômetro CONTINUA visível', () => {
    expect(quadro(c)).toContain(NOMES.termometro);
  });

  it('e o texto que o engenheiro escreveu está lá', () => {
    expect(quadro(c)).toContain('Não instalado — não aplicável');
  });

  it('os outros não declarados continuam fora', () => {
    const q = quadro(c);
    expect(q).not.toContain(NOMES.vacuometro);
    expect(q).not.toContain(NOMES.pressostato);
  });

  it('a frase de "nenhum declarado" NÃO aparece — há uma linha', () => {
    expect(quadro(c)).not.toContain('Nenhum instrumento/dispositivo foi declarado');
  });
});

describe('o override legado POSICIONAL chega ao instrumento certo no papel', () => {
  it('`instrumentos.1.certificado` imprime na linha do TERMÔMETRO', async () => {
    // O id antigo é traduzido na leitura (`sanear` → `comIdsEstaveis`), então o
    // documento de um rascunho anterior à mudança abre com o valor no lugar.
    const texto = await gerar(
      { instrumentos: {} },
      { 'instrumentos.1.certificado': manual('LEGADO-TERMOMETRO') } as unknown as MapaOverrides,
    );
    const q = quadro(texto);
    expect(q).toContain(NOMES.termometro);
    expect(q).toContain('LEGADO-TERMOMETRO');
    // E não foi parar no manômetro (posição 0) nem no vacuômetro (posição 2).
    expect(q).not.toContain(NOMES.manometro);
    expect(q).not.toContain(NOMES.vacuometro);
  });

  it('`instrumentos.5.certificado` imprime na PSV, não no transmissor', async () => {
    const texto = await gerar(
      { instrumentos: {} },
      { 'instrumentos.5.certificado': manual('LEGADO-PSV') } as unknown as MapaOverrides,
    );
    const q = quadro(texto);
    expect(q).toContain(NOMES.psv);
    expect(q).toContain('LEGADO-PSV');
    expect(q).not.toContain(NOMES.transmissor);
  });
});

describe('PARIDADE · o quadro do avulso é o do relatório', () => {
  it('as mesmas linhas nos dois documentos', () => {
    const noAvulso = quadro(a);
    const noRelatorio = quadro(relatorioA);
    for (const n of [NOMES.manometro, NOMES.pressostato, NOMES.psv]) {
      expect(noAvulso).toContain(n);
      expect(noRelatorio).toContain(n);
    }
    for (const n of [NOMES.termometro, NOMES.vacuometro, NOMES.transmissor]) {
      expect(noAvulso).not.toContain(n);
      expect(noRelatorio).not.toContain(n);
    }
  });

  it('o mesmo cabeçalho de colunas', () => {
    expect(quadro(relatorioA)).toContain('Nº DO CERTIFICADO / VALIDADE');
  });
});

/**
 * §12 · CALIBRAÇÃO INTERNA e DE TERCEIRO, sem redigitação.
 *
 * O inspetor escolhe a calibração registrada e a inspeção guarda REFERÊNCIA +
 * SNAPSHOT (`instrumentosRef`). O relatório lê o snapshot — nunca o registro
 * vivo —, então corrigir a calibração depois não muda uma inspeção já feita.
 *
 * Aqui o que se prova é que a linha sai completa nos dois casos, e que o
 * laboratório externo aparece marcado como externo.
 */
describe('interna e terceiro chegam à linha sem digitação', () => {
  const snap = (over: Record<string, unknown>) => ({
    calibracaoId: 'cal-1',
    origem: 'interna',
    tipo: 'manometro',
    instrumento: 'MAN-01',
    fabricante: 'ACME',
    modelo: 'Analógico',
    serie: 'S-1',
    faixa: '0 a 17 bar',
    unidade: 'bar',
    numeroCertificado: 'CERT-INT-001',
    dataCalibracao: '01/09/2026',
    validade: '01/09/2027',
    emissor: 'ZZ ENGENHARIA QUADRO LTDA',
    statusConclusao: 'aprovado',
    emitido: true,
    ...over,
  });

  let texto = '';

  beforeAll(async () => {
    texto = await gerar({
      dataInspecao: '2026-09-22',
      instrumentos: {},
      instrumentosRef: {
        'inst-man': {
          calibracaoId: 'cal-1',
          selecionadoEm: '2026-09-22T00:00:00.000Z',
          snapshot: snap({}),
        },
        'inst-psv': {
          calibracaoId: 'cal-2',
          selecionadoEm: '2026-09-22T00:00:00.000Z',
          snapshot: snap({
            calibracaoId: 'cal-2',
            origem: 'terceiro',
            tipo: 'psv',
            instrumento: 'PSV-08',
            numeroCertificado: 'CERT-EXT-777',
            validade: '30/06/2027',
            emissor: 'LABORATORIO ZZ EXTERNO',
            emitido: false,
          }),
        },
      },
    });
  }, 120_000);

  it('A · manômetro com calibração INTERNA: possui, calibrado, certificado e validade', () => {
    const q = quadro(texto);
    expect(q).toContain(NOMES.manometro);
    expect(q).toContain('CERT-INT-001');
    expect(q).toContain('val. 01/09/2027');
  });

  it('B · PSV de TERCEIRO: certificado, validade e o laboratório marcado como externo', () => {
    const q = quadro(texto);
    expect(q).toContain(NOMES.psv);
    expect(q).toContain('CERT-EXT-777');
    expect(q).toContain('val. 30/06/2027');
    expect(q).toContain('LABORATORIO ZZ EXTERNO (externo)');
  });

  it('a linha aparece pela CALIBRAÇÃO, mesmo sem o POSSUI marcado à mão', () => {
    // `instrumentos` está vazio: quem torna a linha visível é o vínculo
    // estruturado. Fonte estruturada tem prioridade (§11).
    const q = quadro(texto);
    expect(q).toContain(NOMES.manometro);
    expect(q).toContain(NOMES.psv);
  });

  it('e os sem calibração continuam fora', () => {
    const q = quadro(texto);
    expect(q).not.toContain(NOMES.vacuometro);
    expect(q).not.toContain(NOMES.transmissor);
  });
});

/**
 * O RASCUNHO REAL `REL-1789004119133_ZZ-FASE3`, com os dados do banco.
 *
 * Copiados da auditoria somente-leitura de 22/09/2026:
 *
 * - checklist declara manômetro, pressostato e PSV;
 * - o mapa de overrides tem certificado nas SEIS posições antigas, três delas
 *   com "Não instalado — não aplicável" — escritas à mão justamente nas linhas
 *   que o filtro removeria.
 *
 * É o pior caso da mudança, e o que o cliente vai reabrir: se a tradução ou o
 * filtro errarem, ou some texto do engenheiro, ou um certificado aparece no
 * instrumento errado.
 */
describe('rascunho real ZZ-FASE3 · 6 overrides posicionais + 3 declarados', () => {
  let texto = '';

  beforeAll(async () => {
    texto = await gerar(
      {
        // Exatamente o que está em `nr13_docs_ZZ-FASE3`, container "Inspeção da IA".
        instrumentos: {
          'inst-man': true,
          'inst-man-cal': true,
          'inst-press': true,
          'inst-press-cal': true,
          'inst-psv': true,
          'inst-psv-cal': true,
        },
      },
      // Exatamente o que está em `nr13_ovr_REL-1789004119133_ZZ-FASE3`.
      {
        'instrumentos.0.certificado': manual('CAL-2026/1187 — validade 12/03/2027'),
        'instrumentos.1.certificado': manual('Não instalado — não aplicável'),
        'instrumentos.2.certificado': manual('Não instalado — não aplicável'),
        'instrumentos.3.certificado': manual('CAL-2026/1188 — validade 12/03/2027'),
        'instrumentos.4.certificado': manual('Não instalado — não aplicável'),
        'instrumentos.5.certificado': manual('CAL-PSV-2026/0442 — validade 20/05/2027'),
      } as unknown as MapaOverrides,
    );
  }, 120_000);

  it('as SEIS linhas continuam — nenhuma sumiu levando texto junto', () => {
    const q = quadro(texto);
    for (const n of Object.values(NOMES)) expect(q).toContain(n);
  });

  it('cada certificado no SEU instrumento, sem deslocamento', () => {
    const q = quadro(texto);
    const pos = (s: string) => q.indexOf(s);
    // manômetro < termômetro < vacuômetro < pressostato < transmissor < PSV
    expect(pos('CAL-2026/1187')).toBeGreaterThan(pos(NOMES.manometro));
    expect(pos('CAL-2026/1187')).toBeLessThan(pos(NOMES.termometro));
    expect(pos('CAL-2026/1188')).toBeGreaterThan(pos(NOMES.pressostato));
    expect(pos('CAL-2026/1188')).toBeLessThan(pos(NOMES.transmissor));
    expect(pos('CAL-PSV-2026/0442')).toBeGreaterThan(pos(NOMES.psv));
  });

  it('os três "Não instalado — não aplicável" continuam no papel', () => {
    const q = quadro(texto);
    expect((q.match(/Não instalado — não aplicável/g) ?? []).length).toBe(3);
  });

  it('e o documento não perdeu nenhum dos seis valores', () => {
    const q = quadro(texto);
    for (const v of [
      'CAL-2026/1187 — validade 12/03/2027',
      'CAL-2026/1188 — validade 12/03/2027',
      'CAL-PSV-2026/0442 — validade 20/05/2027',
    ]) {
      expect(q).toContain(v);
    }
  });
});

describe('nada de lixo no papel', () => {
  it.each([
    ['A', () => a],
    ['B', () => b],
    ['C', () => c],
  ])('cenário %s: sem NaN, undefined ou [object Object]', (_n, pega) => {
    for (const lixo of ['NaN', 'undefined', '[object Object]']) {
      expect(pega()).not.toContain(lixo);
    }
  });
});
