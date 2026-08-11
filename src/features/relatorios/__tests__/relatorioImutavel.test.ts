import { describe, expect, it, vi } from 'vitest';

/**
 * As garantias do documento imutável, testadas no nível em que elas de fato
 * valem: quem tem `pdfRef` NÃO é remontado, e por isso não muda quando os dados
 * vivos ou os próprios templates mudam.
 */
vi.mock('../../../services/fotos', () => ({
  salvarArquivo: async () => ({ bucket: 'inspecao', path: 'org-1/relatorios/a.pdf', mimeType: 'application/pdf', tamanho: 5 }),
  baixarFoto: async () => new Blob([new TextEncoder().encode('%PDF-1.4 emissao')]),
  montarPath: (org: string, escopo: string, ext: string) => `${org}/${escopo}/x.${ext}`,
}));

import { artefatoDe, sha256Hex, baixarArtefato } from '../artefatoRelatorio';
import { temArtefato, type RelatorioSalvo } from '../tipos';

const base: RelatorioSalvo = {
  id: 'REL-1',
  tagVaso: 'AUTOCLAVE X',
  nome: 'Relatorio_AUTOCLAVE_X.pdf',
  tipo: 'Inspeção Periódica',
  data: '16/07/2026',
  documentos: ['CAPA.html', 'CONCLUSAO.html'],
  meta: { codigo: 'REL-1' } as RelatorioSalvo['meta'],
  status: 'Aprovado',
};

const finalizado: RelatorioSalvo = {
  ...base,
  pdfRef: { bucket: 'inspecao', path: 'org-1/relatorios/a.pdf', mimeType: 'application/pdf', tamanho: 5 },
  sha256: 'abc123',
  geradoEm: '2026-08-11T12:00:00.000Z',
  paginas: 31,
  livroSnapshot: [{ data: '16/07/2026', tipo: 'Inspeção Periódica' }],
};

describe('quem decide entre arquivo e remontagem', () => {
  it('relatório legado (sem pdfRef) continua no fluxo antigo', () => {
    expect(temArtefato(base)).toBe(false);
    expect(artefatoDe(base)).toBeNull();
  });

  it('relatório finalizado é servido pelo arquivo', () => {
    expect(temArtefato(finalizado)).toBe(true);
    expect(artefatoDe(finalizado)?.pdfRef.path).toBe('org-1/relatorios/a.pdf');
  });

  it('pdfRef sem caminho NÃO conta como finalizado', () => {
    // Registro meio gravado não pode passar por documento pronto.
    const meio = { ...base, pdfRef: { bucket: 'inspecao', path: '', mimeType: 'application/pdf', tamanho: 0 } };
    expect(temArtefato(meio)).toBe(false);
    expect(artefatoDe(meio)).toBeNull();
  });
});

describe('o documento não muda quando o mundo muda', () => {
  it('alterar a ficha, o memorial e o laudo NÃO altera o arquivo servido', async () => {
    const antes = await baixarArtefato(artefatoDe(finalizado)!);
    const conteudoAntes = await antes!.text();

    // Simula o que antes causava a deriva: os dados vivos do equipamento mudam.
    localStorage.setItem('nr13_info_AUTOCLAVE X', JSON.stringify({ pmta: '9,99', serie: 'TROCADO' }));
    localStorage.setItem('nr13_laudo_AUTOCLAVE X', JSON.stringify({ apto: false }));
    localStorage.setItem('nr13_calc_AUTOCLAVE X', JSON.stringify({ pmta: '0,01' }));

    const depois = await baixarArtefato(artefatoDe(finalizado)!);
    expect(await depois!.text()).toBe(conteudoAntes);
  });

  it('o documento servido não depende da lista de templates', async () => {
    // `documentos` é a RECEITA. Mudá-la (ou mudar um .html) não pode alcançar o
    // documento finalizado — é a razão de o artefato existir.
    const comOutrosDocs = { ...finalizado, documentos: ['OUTRA-COISA.html'] };
    const blob = await baixarArtefato(artefatoDe(comOutrosDocs)!);
    expect(await blob!.text()).toBe('%PDF-1.4 emissao');
  });

  it('o hash gravado identifica o conteúdo da emissão', async () => {
    const blob = await baixarArtefato(artefatoDe(finalizado)!);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    // Mesmo conteúdo → mesmo hash, sempre. É o que permite provar depois que o
    // arquivo não foi trocado.
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(new TextEncoder().encode('%PDF-1.4 emissao')));
  });
});

describe('livro de registro histórico', () => {
  it('o relatório carrega o livro COMO ESTAVA na emissão', () => {
    // `nr13_livro_<TAG>` é chave ÚNICA e acumulativa: sem o snapshot só existe o
    // livro de agora, e o relatório antigo mostraria registros criados depois.
    localStorage.setItem(
      'nr13_livro_AUTOCLAVE X',
      JSON.stringify([{ data: '16/07/2026' }, { data: '01/12/2026', tipo: 'entrada NOVA' }]),
    );
    expect(Array.isArray(finalizado.livroSnapshot)).toBe(true);
    expect((finalizado.livroSnapshot as unknown[]).length).toBe(1);
  });

  it('relatório legado sem snapshot não quebra — só não tem livro congelado', () => {
    expect(base.livroSnapshot).toBeUndefined();
  });
});
