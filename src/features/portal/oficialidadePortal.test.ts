/**
 * Rascunho NUNCA é serializado para o Portal (19/09/2026).
 *
 * Antes, `portal_cliente` devolvia `nr13_calibracoes_<TAG>` inteira e só o
 * `ehOficial` da tela tirava os rascunhos — o dado chegava ao navegador do
 * cliente. Agora a Edge passa cada valor por `sanearParaPortal` antes de
 * serializar, e `portal_arquivo` não autoriza arquivo citado só por rascunho.
 *
 * Este teste quebra se: um rascunho voltar a sair na regra; a regra do servidor
 * divergir de `ehOficial` (vencimentos, 7.1.1, Portal, certificados); as duas
 * cópias da regra (uma por Edge) divergirem; ou alguma leitura das Edges voltar
 * a serializar o valor cru.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ehOficial } from '../calibracoes/tipos';
import {
  calibracaoOficial,
  sanearParaPortal,
} from '../../../supabase/functions/portal_cliente/oficialidade';
import { sanearParaPortal as sanearArquivo } from '../../../supabase/functions/portal_arquivo/oficialidade';

const A = { id: 'A', numeroCertificado: 'CERT-A', status: 'rascunho', origem: 'interna', responsavel: { assinaturaRef: { bucket: 'inspecao', path: 'org/assinaturas/a.png' } } };
const B = { id: 'B', numeroCertificado: 'CERT-B', status: 'emitido', origem: 'interna', emissao: { pdfRef: { bucket: 'inspecao', path: 'org/certificados-calibracao/b.pdf' }, sha256: 'bb' } };
const C = { id: 'C', numeroCertificado: 'EXT-C', origem: 'terceiro', laboratorio: 'Lab', pdfExternoRef: { bucket: 'inspecao', path: 'org/certificados-externos/c.pdf' }, pdfExternoSha256: 'cc' };
const L = { id: 'L', numeroCertificado: 'CAL-LEGADO' }; // legado: sem status nem origem
const RT = { id: 'RT', numeroCertificado: 'EXT-R', origem: 'terceiro', status: 'rascunho', pdfExternoRef: { bucket: 'inspecao', path: 'org/certificados-externos/r.pdf' } };

describe('payload do Portal: a lista de calibrações', () => {
  const bruto = JSON.stringify([A, B, C, L, RT]);
  const saida = sanearParaPortal('nr13_calibracoes_ZZ', bruto)!;

  it('contém B (emitido), C (terceiro) e o legado; NÃO contém A nem o terceiro em rascunho', () => {
    const ids = (JSON.parse(saida) as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(['B', 'C', 'L']);
    // payload BRUTO: nenhum vestígio do rascunho, nem do arquivo dele
    expect(saida).not.toContain('CERT-A');
    expect(saida).not.toContain('EXT-R');
    expect(saida).not.toContain('"rascunho"');
    expect(saida).not.toContain('org/certificados-externos/r.pdf');
  });

  it('lista sem rascunho sai com os MESMOS bytes', () => {
    const limpo = JSON.stringify([B, C, L]);
    expect(sanearParaPortal('nr13_calibracoes_ZZ', limpo)).toBe(limpo);
  });

  it('valor ilegível na lista não sai (sem ler, não há como provar que não há rascunho)', () => {
    expect(sanearParaPortal('nr13_calibracoes_ZZ', '{não é json')).toBeNull();
    expect(sanearParaPortal('nr13_calibracoes_ZZ', '{"id":"x"}')).toBeNull();
    expect(sanearParaPortal('nr13_calibracoes_ZZ', null)).toBeNull();
  });
});

describe('a MESMA regra de ehOficial', () => {
  const casos: Array<Record<string, unknown>> = [
    A, B, C, L, RT,
    { status: 'emitido' },
    { origem: 'interna' },
    { status: '' },
    { status: 'rascunho', origem: 'terceiro' },
  ];
  it.each(casos.map((c, i) => [i, c]))('caso %i', (_i, c) => {
    expect(calibracaoOficial(c)).toBe(ehOficial(c as never));
  });
});

describe('relatórios e livro', () => {
  it('relatório em RASCUNHO pedido sob demanda não é servido; finalizado e legado passam intactos', () => {
    const rasc = JSON.stringify({ id: 'R1', status: 'Rascunho', meta: {} });
    const fin = JSON.stringify({ id: 'R2', status: 'Aprovado', pdfRef: { path: 'x' } });
    const leg = JSON.stringify({ id: 'R3', meta: {} });
    expect(sanearParaPortal('nr13_rel_R1_ZZ', rasc)).toBeNull();
    expect(sanearParaPortal('nr13_rel_R2_ZZ', fin)).toBe(fin);
    expect(sanearParaPortal('nr13_rel_R3_ZZ', leg)).toBe(leg);
  });
  it('índice: entrada em rascunho sai (segunda camada)', () => {
    const idx = JSON.stringify([{ id: 'R1', status: 'Rascunho' }, { id: 'R2', status: 'Aprovado' }]);
    expect(JSON.parse(sanearParaPortal('nr13_historico_indice_ZZ', idx)!)).toEqual([{ id: 'R2', status: 'Aprovado' }]);
  });
  it('livro em rascunho nunca', () => {
    expect(sanearParaPortal('nr13_livro_rascunho_ZZ', '[]')).toBeNull();
  });
  it('as demais famílias passam com os mesmos bytes', () => {
    for (const k of ['nr13_info_ZZ', 'nr13_livro_ZZ', 'nr13_minha_empresa', 'nr13_rastreab_1', 'nr13_lotes_cal_ZZ']) {
      expect(sanearParaPortal(k, '{"a":1}')).toBe('{"a":1}');
    }
  });
});

describe('as Edges usam a regra em TODA leitura que serializa', () => {
  const pc = readFileSync('supabase/functions/portal_cliente/index.ts', 'utf8');
  const pa = readFileSync('supabase/functions/portal_arquivo/index.ts', 'utf8');

  it('as duas cópias da regra são idênticas', () => {
    expect(readFileSync('supabase/functions/portal_arquivo/oficialidade.ts', 'utf8')).toBe(
      readFileSync('supabase/functions/portal_cliente/oficialidade.ts', 'utf8'),
    );
    expect(sanearArquivo('nr13_calibracoes_ZZ', JSON.stringify([A, B]))).toBe(JSON.stringify([B]));
  });

  it('portal_cliente: carga inicial, padrões e sob demanda passam por sanearParaPortal', () => {
    expect(pc).toContain("import { sanearParaPortal } from './oficialidade.ts';");
    expect(pc.match(/sanearParaPortal\(row\.chave as string, row\.valor as string \| null\)/g)).toHaveLength(3);
    // nenhum caminho grava o valor cru no payload
    expect(pc).not.toMatch(/\] = row\.valor as string;/);
  });

  it('portal_cliente devolve a versão REAL de cada chave', () => {
    expect(pc.match(/\.select\('chave, valor, versao'\)/g)).toHaveLength(3);
    expect(pc).toContain('return json({ chaves, versoes, tags });');
    expect(pc).toContain('return json({ chaves: achadas, versoes: versoesAchadas, tags });');
  });

  it('portal_arquivo: path só conta se vier de valor saneado', () => {
    expect(pa).toContain("import { sanearParaPortal } from './oficialidade.ts';");
    const i = pa.indexOf('const autorizados = new Set<string>();');
    const trecho = pa.slice(i, pa.indexOf('// ── 4. Decisão', i));
    expect(trecho).toContain('const oficial = sanearParaPortal(chave, valor);');
    expect(trecho).toContain('coletarPaths(JSON.parse(oficial), autorizados);');
    expect(trecho).not.toContain('JSON.parse(valor)');
  });

  it('o arquivo do rascunho não é autorizado; o do emitido e o do terceiro são', () => {
    // mesma varredura por forma de `portal_arquivo`, sobre o valor saneado
    const paths = new Set<string>();
    const coletar = (v: unknown): void => {
      if (v == null || typeof v !== 'object') return;
      if (Array.isArray(v)) return v.forEach(coletar);
      const o = v as Record<string, unknown>;
      if (typeof o.path === 'string') paths.add(o.path);
      Object.values(o).forEach(coletar);
    };
    coletar(JSON.parse(sanearArquivo('nr13_calibracoes_ZZ', JSON.stringify([A, B, C, RT]))!));
    expect(paths.has('org/certificados-calibracao/b.pdf')).toBe(true);
    expect(paths.has('org/certificados-externos/c.pdf')).toBe(true);
    expect(paths.has('org/certificados-externos/r.pdf')).toBe(false);
    expect(paths.has('org/assinaturas/a.png')).toBe(false);
  });
});
