import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * 1 EQUIPAMENTO = 1 PRONTUÁRIO VIGENTE (24/09/2026).
 *
 * A ficha mostra UM slot no card do topo. O que vai nele é resolvido das
 * fontes que já existem — nenhuma emissão sai do histórico, nenhum arquivo muda
 * de lugar.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
  semearEquipamentoDetalhado: async () => ({ postas: 0, falhou: false }),
}));
vi.mock('../../../services/fotos', () => ({
  arquivoPendente: async () => false,
  salvarArquivo: async () => ({}),
  baixarFoto: async () => null,
  blobParaDataUrl: async () => '',
}));
vi.mock('../../../services/auth', () => ({ isTrial: () => false }));

import { resolverProntuarioVigente, ROTULO_ORIGEM } from '../prontuarioVigente';
import ProntuarioDoEquipamento from '../ProntuarioDoEquipamento';
import type { EmissaoProntuario } from '../emissaoProntuario';

const TAG = 'ZZ-SLOT';
const emissao = (id: string, origem?: 'anexado' | 'sistema', extra: Partial<EmissaoProntuario> = {}): EmissaoProntuario => ({
  id,
  tag: TAG,
  numero: 'REL-1',
  emissao: '19/09/2026',
  motor: 'vetorial',
  pdfRef: { bucket: 'inspecao', path: `org/relatorios/${id}.pdf`, mimeType: 'application/pdf', tamanho: 10 },
  sha256: `sha-${id}`,
  paginas: 6,
  tamanho: 10,
  geradoEm: '2026-09-19T20:00:00.000Z',
  pdfPendente: false,
  ...(origem ? { origem } : {}),
  ...extra,
});
const FAB = { nome: 'PRONTUARIO CALDEIRA.pdf', tamanho: 2048, enviadoEm: '2026-09-01T10:00:00.000Z', pdfBase64: '', pdfRef: { bucket: 'inspecao', path: 'org/x.pdf', mimeType: 'application/pdf', tamanho: 2048 } };

const slot = () =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProntuarioDoEquipamento, { tag: TAG })));

beforeEach(() => banco.clear());

describe('resolverProntuarioVigente — um documento no slot, histórico preservado', () => {
  it('sem nada: nenhum vigente', () => {
    expect(resolverProntuarioVigente([], null)).toBeNull();
  });

  it('gerado sozinho → GERADO PELO SISTEMA; anexado sozinho → PDF ANEXADO', () => {
    expect(resolverProntuarioVigente([emissao('r1')], null)?.origem).toBe('gerado');
    expect(resolverProntuarioVigente([emissao('a1', 'anexado')], null)?.origem).toBe('anexado');
    expect(ROTULO_ORIGEM.gerado).toBe('GERADO PELO SISTEMA');
    expect(ROTULO_ORIGEM.anexado).toBe('PDF ANEXADO');
  });

  it('várias emissões: vale a ÚLTIMA gravada, as outras contam como histórico', () => {
    const lista = [emissao('r1'), emissao('r2')];
    const v = resolverProntuarioVigente(lista, null)!;
    expect(v.emissao!.id).toBe('r2');
    expect(v.outros).toBe(1);
    // e a lista de entrada não é tocada
    expect(lista.map((e) => e.id)).toEqual(['r1', 'r2']);
  });

  it('PDF do fabricante é LEGADO: só ocupa o slot quando não há emissão', () => {
    expect(resolverProntuarioVigente([], FAB as never)?.origem).toBe('fabricante');
    const comEmissao = resolverProntuarioVigente([emissao('a1', 'anexado')], FAB as never)!;
    expect(comEmissao.origem).toBe('anexado');
    expect(comEmissao.outros).toBe(1); // o do fabricante continua existindo, como histórico
  });
});

describe('o slot na ficha', () => {
  it('SEM prontuário: estado compacto com Anexar e Criar em Prontuários — nenhuma área de envio', () => {
    const h = slot();
    expect(h).toContain('pde-slot-vazio');
    expect(h).toContain('Anexar prontuário');
    expect(h).toContain('Criar em Prontuários');
    expect(h).not.toMatch(/dropzone|type="file"/);
  });

  it('SEM prontuário e com RASCUNHO: o atalho diz Continuar', () => {
    banco.set(`nr13_prontuario_${TAG}`, { tag: TAG, descricao: 'Vaso' });
    expect(slot()).toContain('Continuar em Prontuários');
  });

  it('com PDF ANEXADO: Abrir e Baixar, sem "anexar outro"', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [emissao('a1', 'anexado', { arquivoNome: 'antigo.pdf', tamanho: 771 })]);
    const h = slot();
    expect(h).toContain('PDF ANEXADO');
    expect(h).toContain('antigo.pdf');
    expect(h).toContain('Abrir');
    expect(h).toContain('Baixar');
    expect(h).not.toContain('Anexar prontuário');
  });

  it('com prontuário GERADO em /prontuarios: aparece sem nenhum upload pela ficha', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [emissao('r1'), emissao('r2', undefined, { numero: 'REL-99' })]);
    const h = slot();
    expect(h).toContain('GERADO PELO SISTEMA');
    expect(h).toContain('REL-99');
    expect(h).toContain('Rev. 02');
    expect(h).toContain('+ 1 documento anterior em Prontuários');
    expect(h).not.toContain('Anexar prontuário');
  });

  it('só PDF do fabricante (legado): aparece como PDF DO FABRICANTE', () => {
    banco.set(`nr13_pront_fab_${TAG}`, FAB);
    const h = slot();
    expect(h).toContain('PDF DO FABRICANTE');
    expect(h).toContain('PRONTUARIO CALDEIRA.pdf');
    expect(h).not.toContain('Anexar prontuário');
  });
});

describe('a ficha tem UM slot, no card do topo', () => {
  const ficha = readFileSync('src/pages/Equipamento.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('o slot está dentro do card principal, ao lado da foto de identificação', () => {
    const card = ficha.slice(ficha.indexOf('equipamento-header-card'), ficha.indexOf('equipamento-foto-principal'));
    expect(card).toContain('<FotoIdentificacao tag={tag} />');
    expect(card).toContain('<ProntuarioDoEquipamento tag={tag}');
    expect(ficha.match(/<ProntuarioDoEquipamento\b/g)).toHaveLength(1);
  });

  it('os blocos grandes de baixo saíram — e o PDF do fabricante NÃO foi apagado de lugar nenhum', () => {
    expect(ficha).not.toContain('<ProntuarioFabricante');
    expect(ficha).not.toContain('data-secao="fabricante"');
    // As leituras do documento continuam: /prontuarios, Portal e recuperação.
    expect(readFileSync('src/pages/Prontuarios.tsx', 'utf8')).toContain('lerProntuarioFabricante(tag)');
    expect(readFileSync('src/pages/portal/PortalAtivo.tsx', 'utf8')).toContain('lerProntuarioFabricante(tag)');
    expect(readFileSync('src/services/recuperacaoArquivos.ts', 'utf8')).toContain("prefixo: 'nr13_pront_fab_'");
  });
});
