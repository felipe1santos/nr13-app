/**
 * RELATÓRIO DE CALDEIRA JÁ EMITIDO NÃO MUDA (21/10/2026).
 *
 * As rodadas da caldeira mudam o que o gerador produz para CALDEIRA (Rodada 1:
 * a linha "Ensaio de acumulação" na grade da seção 7; Rodada 2: o relatório
 * próprio). Isso só pode alcançar rascunho e emissão NOVA. O documento já
 * emitido é um ARQUIVO (§7-quater): abre, imprime e baixa pelos bytes
 * arquivados, com o SHA da emissão.
 *
 * A fixture `__baseline__/caldeira-emitida-d2b97da.pdf` foi gerada pelo código
 * ANTERIOR às mudanças (commit d2b97da, worktree separada) com a mesma massa de
 * `naoRegressaoTipos.test.ts` — o hash normalizado dela é a entrada
 * `caldeira:completo:final` do baseline. Este teste prova:
 *   1. o caminho de reabertura serve ESSES bytes, e o SHA confere;
 *   2. o gerador de hoje produziria outro documento — ou seja, se a reabertura
 *      regenerasse, o emitido mudaria; e ela não regenera.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURE = resolve(process.cwd(), 'src/features/relatorios/pdfVetorial/__baseline__/caldeira-emitida-d2b97da.pdf');
const BYTES = new Uint8Array(readFileSync(FIXTURE));
const SHA_EMISSAO = 'f27bed14d2cc910625cdebee1d1371fe0ea7dd77f8ea49cc496431c6e775a561';

vi.mock('../../../services/fotos', () => ({
  // O cofre/bucket devolve o arquivo arquivado na emissão.
  baixarFoto: async () => new Blob([BYTES], { type: 'application/pdf' }),
  salvarArquivo: async () => {
    throw new Error('reabrir não pode publicar arquivo nenhum');
  },
  arquivoPendente: async () => false,
  montarPath: (org: string, escopo: string, ext: string) => `${org}/${escopo}/uuid.${ext}`,
  BUCKET: 'inspecao',
}));

import { artefatoDe, baixarArtefato, verificarIntegridade } from '../artefatoRelatorio';
import type { RelatorioSalvo } from '../tipos';

function normalizado(b: Uint8Array): string {
  const t = Buffer.from(b)
    .toString('latin1')
    .replace(/\/CreationDate \([^)]*\)/g, '')
    .replace(/\/ModDate \([^)]*\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '');
  return createHash('sha256').update(Buffer.from(t, 'latin1')).digest('hex');
}

const EMITIDO: RelatorioSalvo = {
  id: 'REL-1790000000000',
  tagVaso: 'ZZ-BASE-CALDEIRA',
  nome: 'Relatorio_Inspeção_Periódica_ZZ-BASE-CALDEIRA.pdf',
  tipo: 'Inspeção Periódica',
  data: '21/10/2026',
  documentos: ['CAPA.html', 'INSPECOES.html'],
  status: 'Aprovado',
  pdfRef: { bucket: 'inspecao', path: 'org/relatorios/caldeira-emitida.pdf', mimeType: 'application/pdf', tamanho: BYTES.length },
  sha256: SHA_EMISSAO,
  geradoEm: '2026-10-21T15:00:00.000Z',
  paginas: 14,
  meta: { codigo: 'REL-1790000000000' } as RelatorioSalvo['meta'],
};

describe('caldeira emitida antes das mudanças continua idêntica', () => {
  it('a fixture É o documento do gerador antigo (bate com o baseline)', () => {
    const baseline = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/features/relatorios/pdfVetorial/__baseline__/naoRegressaoTipos.json'), 'utf8'),
    ) as Record<string, string>;
    expect(normalizado(BYTES)).toBe(baseline['caldeira:completo:final']);
    expect(createHash('sha256').update(BYTES).digest('hex')).toBe(SHA_EMISSAO);
  });

  it('reabrir serve os bytes arquivados, e o SHA da emissão confere', async () => {
    const art = artefatoDe(EMITIDO);
    expect(art).not.toBeNull();
    const blob = await baixarArtefato(art!);
    const servidos = new Uint8Array(await blob!.arrayBuffer());
    expect(Buffer.compare(Buffer.from(servidos), Buffer.from(BYTES))).toBe(0);
    expect(await verificarIntegridade(art!)).toBe(true);
  });

  it('a tela abre o ARQUIVO antes de qualquer remontagem — relatório com pdfRef não chama o gerador', () => {
    const tela = readFileSync(resolve(process.cwd(), 'src/pages/Relatorios.tsx'), 'utf8');
    const corpo = tela.slice(tela.indexOf('async function visualizar('));
    const arquivo = corpo.indexOf('if (temArtefato(r)) {');
    const retorno = corpo.indexOf('return true;', arquivo);
    const remontagem = corpo.indexOf('await gravarInspecaoOrigemAtual(dadosContainer);');
    expect(arquivo).toBeGreaterThan(-1);
    expect(retorno).toBeLessThan(remontagem);
    const v9 = readFileSync(resolve(process.cwd(), 'src/features/relatorios/RelatoriosV9.tsx'), 'utf8');
    expect(v9).toContain('if (artefatoDoItemBuscado(r)) setAberto(r);');
  });

});
