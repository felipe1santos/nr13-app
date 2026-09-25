/**
 * FASE 6.2 · LIVRO DE REGISTRO + TERMO DE ABERTURA no relatório vetorial.
 *
 * O defeito: `LIVRO-REGISTRO.html` (marcado por padrão no assistente) e o
 * `TERMO-ABERTURA.html` + `CAPA-LIVRO-REGISTRO.html` (auto-injetados na 1ª
 * inspeção do livro) não casavam com seção nenhuma de `FOLHA_DA_SECAO`, e o
 * PDF vetorial saía IGUAL ao de um relatório sem livro. Estes testes geram o
 * PDF de verdade e o leem com pdf.js. Letras = §20 do pedido.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), rpc: async () => ({ data: null, error: null }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import { montarListaComTermoAbertura } from '../relatoriosService';
import { secoesPresentes } from './composicao';
import { secoesDoRelatorio } from './folhas';
import { montarModeloRelatorio } from './modelo';
import { numeroPorExtenso, textoTermoAbertura, textoTermoInspecao } from './livroRegistro';

const TAG = 'ZZ-LIVRO-62';
const g = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const BASE = ['CAPA.html', 'SUMARIO.html', 'PLACA.html', 'VISUAL-EXTERNO.html', 'CONCLUSAO.html'];
const COM_LIVRO = [...BASE, 'LIVRO-REGISTRO.html'];

function semear(livroComEntradas = false) {
  localStorage.clear();
  g(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'VASO 62', numeroSerie: 'SER-62', fabricante: 'FAB 62', codigoProjeto: 'ASME VIII Div. 1' });
  g(`nr13_pref_unidade_${TAG}`, 'SI');
  g(`nr13_calc_${TAG}`, { pmta: 1.2, pth: 1.56 });
  g(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE LIVRO 62 LTDA', cnpj: '00.000.000/0001-62', endereco: 'Rua 62', cidade: 'Vitória', estado: 'ES' });
  g(`nr13_laudo_${TAG}`, { apto: true });
  g(`nr13_livro_config_${TAG}`, { totalFolhas: 100 });
  g('nr13_minha_empresa', { razaoSocial: 'ZZ ENGENHARIA 62' });
  g('nr13_relatorio_meta_atual', {
    codigo: 'REL-62',
    tipoInspecao: 'Inspeção Periódica',
    execucaoInspecao: '2026-09-25',
    phNome: 'ENG LIVRO 62',
    phCrea: 'CREA-62',
    tecnicoNome: 'TEC LIVRO 62',
  });
  const campo = { visual_externo: { itens: { '1': 'nao' }, itemObs: {}, semanticaNc: 1, resultado: 'aprovado' } };
  g('nr13_inspecao_atual', campo);
  g('nr13_injecao_atual', campo);
  g(`nr13_livro_${TAG}`, livroComEntradas ? [{ id: 'e1', data: '2025-01-01', tipo: 'Inspeção Periódica' }] : []);
}

async function paginas(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // `slice`: o pdf.js TRANSFERE o buffer que recebe — sem a cópia, os bytes do
  // resultado ficam vazios e qualquer comparação posterior passa por engano.
  const d = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= d.numPages; i++) {
    out.push(
      (await (await d.getPage(i)).getTextContent()).items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return out;
}
const gerar = async (documentos: string[]) => {
  const r = await gerarRelatorioVetorial(TAG, { documentos });
  return { r, t: await paginas(r.bytes) };
};
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** O sumário é a folha 2; a página que ele aponta para um título. */
const paginaNoSumario = (t: string[], titulo: string) => {
  const m = t[1].match(new RegExp(`${escapar(titulo)} (\\d+)`));
  return m ? Number(m[1]) : null;
};

beforeAll(() => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(process.cwd(), 'public', String(url).replace(/^\//, '')));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
});
beforeEach(() => semear());

describe('composição · quando o livro e o termo entram', () => {
  it('1ª inspeção (livro vazio): a lista traz capa + termo + folha do livro', () => {
    expect(montarListaComTermoAbertura(TAG, COM_LIVRO)).toEqual([
      ...BASE,
      'CAPA-LIVRO-REGISTRO.html',
      'TERMO-ABERTURA.html',
      'LIVRO-REGISTRO.html',
    ]);
  });

  it('livro com entradas: só a folha do livro, sem termo', () => {
    semear(true);
    expect(montarListaComTermoAbertura(TAG, COM_LIVRO)).toEqual(COM_LIVRO);
  });

  it('as três folhas casam com seção (era o defeito: nenhuma casava)', () => {
    const tem = secoesPresentes([...BASE, 'CAPA-LIVRO-REGISTRO.html', 'TERMO-ABERTURA.html', 'LIVRO-REGISTRO.html']);
    expect(tem.livro).toBe(true);
    expect(tem.termoAbertura).toBe(true);
  });

  it('sem lista (bancada, "tudo"), o livro NÃO entra — é outro documento', () => {
    const tem = secoesPresentes(undefined);
    expect(tem.livro).toBe(false);
    expect(tem.termoAbertura).toBe(false);
    expect(tem.parecer).toBe(true);
  });
});

describe('PDF · A nenhum / B só livro / C só termo / D ambos', () => {
  it('A · sem livro: nenhuma seção 12, nada residual', async () => {
    const { t } = await gerar(BASE);
    expect(t.join(' ')).not.toMatch(/LIVRO DE REGISTRO|TERMO DE ABERTURA|12\.1 |12\.2 /i);
    expect(t[1]).not.toContain('Livro de registro');
  });

  it('A/J · o corpo do relatório é o mesmo com e sem livro (só sumário e "de Y" mudam)', async () => {
    const sem = await gerar(BASE);
    const com = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const semNumero = (p: string) => p.replace(/Página \d+ de \d+/, '');
    expect(com.t.slice(2, sem.t.length).map(semNumero)).toEqual(sem.t.slice(2).map(semNumero));
    expect(com.t.length).toBe(sem.t.length + 2);
  });

  it('B · só livro (livro já aberto): 12 + 12.2, sem termo', async () => {
    semear(true);
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const tudo = t.join(' ');
    expect(tudo).toContain('12. LIVRO DE REGISTRO DE SEGURANÇA');
    expect(tudo).toContain('12.2 REGISTRO DE SEGURANÇA DESTA INSPEÇÃO');
    expect(tudo).not.toContain('12.1 TERMO DE ABERTURA');
    expect(tudo).toContain('Termo de Inspeção:');
    expect(t[1]).not.toContain('Termo de abertura do livro');
  });

  it('C · só termo na lista: 12 + 12.1, sem a folha do registro', async () => {
    const { t } = await gerar([...BASE, 'CAPA-LIVRO-REGISTRO.html', 'TERMO-ABERTURA.html']);
    const tudo = t.join(' ');
    expect(tudo).toContain('12.1 TERMO DE ABERTURA');
    expect(tudo).not.toContain('12.2 REGISTRO');
  });

  it('D · ambos: termo ANTES do registro, os dois depois do parecer', async () => {
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const tudo = t.join(' ');
    const iParecer = tudo.indexOf('10. PARECER TÉCNICO CONCLUSIVO');
    const iTermo = tudo.indexOf('12.1 TERMO DE ABERTURA');
    const iReg = tudo.indexOf('12.2 REGISTRO DE SEGURANÇA DESTA INSPEÇÃO');
    expect(iParecer).toBeGreaterThan(0);
    expect(iTermo).toBeGreaterThan(iParecer);
    expect(iReg).toBeGreaterThan(iTermo);
  });
});

describe('conteúdo · das fontes que o resto do relatório já usa', () => {
  it('termo de abertura: folhas da config por extenso, identificação da ficha, pressão na unidade', async () => {
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const termo = t.find((p) => p.includes('12.1 TERMO DE ABERTURA'))!;
    expect(termo).toContain('Este livro contém 100 (cem) folhas numeradas tipograficamente de 01 a 100');
    expect(termo).toContain('TAG ZZ-LIVRO-62');
    expect(termo).toContain('CLIENTE LIVRO 62 LTDA');
    expect(termo).toContain('00.000.000/0001-62');
    expect(termo).toMatch(/PMTA 1[.,]200 MPa/);
    expect(termo).toContain('ENG LIVRO 62');
  });

  it('registro: tipo, datas pt-BR da seção 7, laudo do parecer, ensaios da composição, quem realizou', async () => {
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const reg = t.find((p) => p.includes('12.2 REGISTRO'))!;
    expect(reg).toContain('DATA DE INÍCIO 25/09/2026');
    expect(reg).toContain('Em 25/09/2026, executou-se inspeção de segurança periódica');
    expect(reg).toContain('relatório de inspeção n° REL-62 está apto a operar');
    expect(reg).toContain('Situação: APTO');
    expect(reg).toContain('• Exame visual externo');
    expect(reg).not.toContain('Teste hidrostático');
    expect(reg).toContain('Profissional Habilitado: ENG LIVRO 62 — CREA/Registro: CREA-62');
    expect(reg).toContain('Técnico / Inspetor: TEC LIVRO 62');
  });

  it('INAPTO no parecer vira INAPTO no livro — a mesma fonte', () => {
    g(`nr13_laudo_${TAG}`, { apto: false });
    expect(textoTermoInspecao(montarModeloRelatorio(TAG))).toContain('foi considerado INAPTO');
  });

  it('o termo escrito na folha antiga (rascunho) vence o gerado', async () => {
    g(`nr13_termo_livro_${TAG}`, 'TERMO ESCRITO À MÃO 62.');
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    expect(t.join(' ')).toContain('TERMO ESCRITO À MÃO 62.');
  });

  it('quem assina o termo do livro segue a escolha congelada na meta', () => {
    const meta = JSON.parse(localStorage.getItem('nr13_relatorio_meta_atual')!);
    g('nr13_relatorio_meta_atual', { ...meta, assinantes: { assinanteTermoLivro: 'tecnico' } });
    expect(montarModeloRelatorio(TAG).livro.assinanteTermo).toBe('tecnico');
  });

  it('número por extenso e o tipo real do equipamento no termo', () => {
    expect(numeroPorExtenso(50)).toBe('cinquenta');
    expect(numeroPorExtenso(101)).toBe('cento e um');
    expect(numeroPorExtenso(1200)).toBe('mil e duzentos');
    // Descrição que repete o tipo não entra ("Vaso de Pressão VASO 62" — a regra
    // da folha HTML); a que acrescenta informação, entra.
    expect(textoTermoAbertura(montarModeloRelatorio(TAG))).toContain('do Vaso de Pressão, fabricado por FAB 62');
    const info = JSON.parse(localStorage.getItem(`nr13_info_${TAG}`)!);
    g(`nr13_info_${TAG}`, { ...info, descricao: 'COMPRESSOR DE AR' });
    expect(textoTermoAbertura(montarModeloRelatorio(TAG))).toContain('do Vaso de Pressão COMPRESSOR DE AR, fabricado');
  });
});

describe('E sumário / F paginação', () => {
  it('E · o sumário aponta páginas que existem e que têm o título', async () => {
    const { t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    const p12 = paginaNoSumario(t, 'Livro de registro de segurança');
    const p121 = paginaNoSumario(t, 'Termo de abertura do livro');
    const p122 = paginaNoSumario(t, 'Registro de segurança desta inspeção');
    expect(p12).toBe(p121);
    for (const [p, titulo] of [
      [p121, '12.1 TERMO DE ABERTURA'],
      [p122, '12.2 REGISTRO DE SEGURANÇA DESTA INSPEÇÃO'],
    ] as const) {
      expect(p).not.toBeNull();
      expect(p!).toBeLessThanOrEqual(t.length);
      expect(t[p! - 1]).toContain(titulo);
    }
  });

  it('E · o sumário só anuncia o que é emitido', () => {
    const m = montarModeloRelatorio(TAG);
    const semLivro = secoesDoRelatorio(m, secoesPresentes(BASE)).map((s) => s.numero);
    expect(semLivro).not.toContain('12');
    const soLivro = secoesDoRelatorio(m, secoesPresentes(COM_LIVRO)).map((s) => s.numero);
    expect(soLivro).toEqual(expect.arrayContaining(['12', '12.2']));
    expect(soLivro).not.toContain('12.1');
  });

  it('F · "Página X de Y" contínuo, Y = total, um cabeçalho por folha', async () => {
    const { r, t } = await gerar(montarListaComTermoAbertura(TAG, COM_LIVRO));
    t.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${t.length}`));
    t.forEach((p) => expect(p.match(/Página \d+ de \d+/g)).toHaveLength(1));
    expect(r.paginas).toBe(t.length);
  });
});

describe('prévia · o livro não cria pendência', () => {
  it('os únicos campos editáveis que a seção 12 acrescenta são os dois termos', async () => {
    const semLivro = await gerarRelatorioVetorial(TAG, { documentos: BASE, modo: 'preview' });
    const comLivro = await gerarRelatorioVetorial(TAG, {
      documentos: montarListaComTermoAbertura(TAG, COM_LIVRO),
      modo: 'preview',
    });
    const ids = (r: typeof semLivro) => new Set(r.editaveis.map((e) => e.id));
    const novos = [...ids(comLivro)].filter((id) => !ids(semLivro).has(id)).sort();
    expect(novos).toEqual(['livro.abertura', 'livro.termo']);
    // ...e os dois nascem preenchidos (texto gerado), então não contam como falta.
    for (const e of comLivro.editaveis.filter((x) => x.id.startsWith('livro.'))) {
      expect(e.pendencia, e.id).toBe('nenhuma');
    }
  }, 120000);
});

describe('G F5 / H rascunho antigo', () => {
  it('G · a mesma composição gera o mesmo documento (rascunho reaberto)', async () => {
    const docs = montarListaComTermoAbertura(TAG, COM_LIVRO);
    const a = await gerar(docs);
    const b = await gerar([...docs]);
    expect(b.t).toEqual(a.t);
  });

  it('H · rascunho antigo com LIVRO-REGISTRO na lista passa a mostrar o livro', async () => {
    semear(true);
    const { t } = await gerar(COM_LIVRO); // lista persistida antes desta fase
    expect(t.join(' ')).toContain('12.2 REGISTRO DE SEGURANÇA DESTA INSPEÇÃO');
  });

  it('J · a composição das outras seções não muda com o livro', () => {
    const sem = secoesPresentes(BASE);
    const com = secoesPresentes([...BASE, 'CAPA-LIVRO-REGISTRO.html', 'TERMO-ABERTURA.html', 'LIVRO-REGISTRO.html']);
    for (const k of Object.keys(sem) as (keyof typeof sem)[]) {
      if (k === 'livro' || k === 'termoAbertura') continue;
      expect(com[k], k).toBe(sem[k]);
    }
  });
});
