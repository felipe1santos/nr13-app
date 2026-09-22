/**
 * O PRONTUÁRIO SEGUE A UNIDADE DO EQUIPAMENTO (22/09/2026).
 *
 * A folha "PRESSÕES" imprimia as QUATRO unidades lado a lado — `MPa | psi |
 * kgf/cm² | bar` —, uma tabela de conversão. O prontuário é documentação normal
 * do equipamento e segue a unidade FIXA escolhida na criação (§4), como o
 * relatório e o teste hidrostático já seguiam. Era a divergência que o cliente
 * apontou na revisão ("manter sempre a mesma unidade de medida").
 *
 * Este teste gera o PDF de VERDADE nos três sistemas, a partir do MESMO valor
 * canônico em MPa, e lê o texto de volta com pdf.js.
 *
 * Duas coisas que ele também trava:
 *
 * 1. **a CATEGORIA NR-13 não se move** — ela tem unidades normativas próprias
 *    (kPa·m³ e MPa·m³) e é exceção declarada (§17 do pedido, §4 do CLAUDE.md);
 * 2. **nenhuma pressão sai sem unidade** — o número nu era a outra metade da
 *    queixa do cliente.
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

import { gerarProntuarioVetorial } from './gerarProntuario';
import { zerarCacheFontes } from './carlito';
import type { SistemaUnidade } from '../../../calc/unidades';

/** O MESMO equipamento, em MPa — só a unidade de apresentação muda. */
const PMTA_MPA = 1.2;
const PTH_MPA = 1.56;
const PMO_MPA = 0.9;

const CASOS: { unidade: SistemaUnidade; tag: string; rotulo: string; pmta: string; pth: string; pmo: string }[] = [
  { unidade: 'SI', tag: 'ZZ-UN-SI', rotulo: 'MPa', pmta: '1.20', pth: '1.56', pmo: '0.90' },
  { unidade: 'TECNICO', tag: 'ZZ-UN-TEC', rotulo: 'kgf/cm²', pmta: '12.24', pth: '15.91', pmo: '9.18' },
  { unidade: 'PETROBRAS', tag: 'ZZ-UN-BAR', rotulo: 'bar', pmta: '12.00', pth: '15.60', pmo: '9.00' },
];

const paginas: Record<string, string[]> = {};
const compacto = (s: string) => s.replace(/\s+/g, '');

async function textoDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    out.push(
      t.items
        .map((x) => ('str' in x ? x.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return out;
}

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

  for (const c of CASOS) {
    localStorage.clear();
    localStorage.setItem(`nr13_pref_unidade_${c.tag}`, JSON.stringify(c.unidade));
    localStorage.setItem(
      `nr13_info_${c.tag}`,
      JSON.stringify({
        tipo: 'vaso',
        descricao: 'VASO DE UNIDADE',
        numeroSerie: 'S-UN-1',
        fabricante: 'ACME',
        pmoAdotadaMpa: PMO_MPA,
      }),
    );
    // O cálculo é canônico em MPa — é ele que as três apresentações convertem.
    localStorage.setItem(`nr13_calc_${c.tag}`, JSON.stringify({ pmta: PMTA_MPA, pth: PTH_MPA }));
    localStorage.setItem(
      `nr13_cat_${c.tag}`,
      JSON.stringify({ catFinal: 'III', grupo: '2', volume: '1.5', classeFluido: 'C', pvKpa: '1800', pvMpa: '1.8' }),
    );
    localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razaoSocial: 'ZZ ENGENHARIA LTDA' }));

    const r = await gerarProntuarioVetorial(c.tag);
    paginas[c.tag] = await textoDoPdf(r.bytes);
  }
}, 300_000);

/** A folha que traz o quadro PRESSÕES. */
const folhaPressoes = (tag: string) => paginas[tag].find((p) => p.includes('PRESSÕES GRANDEZA')) ?? '';

/**
 * SÓ o quadro PRESSÕES — do cabeçalho até a faixa seguinte.
 *
 * A folha 2 traz também a CATEGORIZAÇÃO, que é exceção normativa e imprime
 * `kPa` e `MPa` de propósito (§17). Procurar "nenhuma outra unidade" na página
 * inteira acusaria justamente a exceção que o teste existe para preservar.
 */
function quadroPressoes(tag: string): string {
  const f = folhaPressoes(tag);
  const i = f.indexOf('PRESSÕES GRANDEZA');
  const j = f.indexOf('ASPECTOS OPERACIONAIS', i);
  return i < 0 ? '' : f.slice(i, j < 0 ? undefined : j);
}

/** SÓ o bloco da categorização. */
function blocoCategoria(tag: string): string {
  const f = paginas[tag].find((p) => p.includes('CATEGORIZAÇÃO DO EQUIPAMENTO')) ?? '';
  const i = f.indexOf('CATEGORIZAÇÃO DO EQUIPAMENTO');
  const j = f.indexOf('PROCEDIMENTOS DE INSPEÇÃO', i);
  return i < 0 ? '' : f.slice(i, j < 0 ? undefined : j);
}

describe('a folha PRESSÕES sai na unidade do equipamento', () => {
  it.each(CASOS)('$unidade: cabeçalho da coluna é $rotulo', (c) => {
    const f = folhaPressoes(c.tag);
    expect(f).not.toBe('');
    expect(f).toContain('GRANDEZA');
    expect(f).toContain(c.rotulo);
  });

  it.each(CASOS)('$unidade: PMO, PMTA e PTH com o valor convertido', (c) => {
    const f = compacto(quadroPressoes(c.tag));
    expect(f).toContain(compacto(c.pmo));
    expect(f).toContain(compacto(c.pmta));
    expect(f).toContain(compacto(c.pth));
  });

  it.each(CASOS)('$unidade: NENHUMA outra unidade de pressão no QUADRO', (c) => {
    const f = quadroPressoes(c.tag);
    // `psi` saiu de vez: não era nem a unidade do equipamento nem norma.
    expect(f).not.toContain('psi');
    for (const outra of ['MPa', 'kgf/cm²', 'bar']) {
      if (outra === c.rotulo) continue;
      expect(f).not.toContain(outra);
    }
  });

  it.each(CASOS)('$unidade: nenhuma pressão com número nu', (c) => {
    // Cada linha da tabela tem rótulo + valor COM unidade.
    const f = quadroPressoes(c.tag);
    for (const v of [c.pmo, c.pmta, c.pth]) {
      expect(f).toMatch(new RegExp(`${v.replace('.', '\\.')}\\s*${c.rotulo.replace(/[²/]/g, '.')}`));
    }
  });
});

describe('o MESMO equipamento, três apresentações', () => {
  it('a PMTA é fisicamente a mesma nos três (1,2 MPa)', () => {
    // 1,2 MPa = 12,24 kgf/cm² = 12,00 bar. Se algum fator estivesse escrito à
    // mão em vez de vir de `FATORES_CONVERSAO`, um destes não fecharia.
    expect(compacto(quadroPressoes('ZZ-UN-SI'))).toContain('1.20');
    expect(compacto(quadroPressoes('ZZ-UN-TEC'))).toContain('12.24');
    expect(compacto(quadroPressoes('ZZ-UN-BAR'))).toContain('12.00');
  });
});

describe('a CATEGORIA NR-13 continua nas unidades da NORMA', () => {
  it.each(CASOS)('$unidade: enquadramento em kPa e grupo em MPa, sem conversão', (c) => {
    const tudo = paginas[c.tag].join(' ');
    expect(tudo).toContain('kPa');
    expect(tudo).toContain('MPa');
  });

  it('o BLOCO da categorização é idêntico nos três documentos', () => {
    // O bloco, não a página: a mesma folha traz o quadro PRESSÕES, que MUDA de
    // unidade de propósito. Comparar a página inteira mediria a mudança que o
    // teste ao lado exige.
    const si = blocoCategoria('ZZ-UN-SI');
    expect(si).not.toBe('');
    expect(si).toContain('P (kPa) × V (m³)');
    expect(si).toContain('P (MPa) × V (m³)');
    expect(blocoCategoria('ZZ-UN-TEC')).toBe(si);
    expect(blocoCategoria('ZZ-UN-BAR')).toBe(si);
  });
});

describe('nada de lixo no papel', () => {
  it.each(CASOS)('$unidade: sem NaN, undefined ou [object Object]', (c) => {
    const tudo = paginas[c.tag].join(' ');
    for (const lixo of ['NaN', 'undefined', '[object Object]', 'null']) {
      expect(tudo).not.toContain(lixo);
    }
  });
});
