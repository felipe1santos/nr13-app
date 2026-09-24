import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * 1 EQUIPAMENTO = 1 PRONTUÁRIO VIGENTE + HISTÓRICO (24/09/2026).
 *
 * Política: NOVA VERSÃO. O documento mais atual (gerado OU anexado) é o
 * vigente; os anteriores são histórico; rascunho nunca é vigente; nada é
 * regravado. A ficha e `/prontuarios` resolvem pelo MESMO comparador.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
  semearEquipamentoDetalhado: async () => ({ postas: 0, falhou: false }),
}));
vi.mock('../../../services/leituraDirigida', () => ({ lerLinhaDoServidor: async () => ({ estado: 'indisponivel' }) }));
vi.mock('../../../services/fotos', () => ({
  arquivoPendente: async () => false,
  salvarArquivo: async () => ({}),
  baixarFoto: async () => null,
  blobParaDataUrl: async () => '',
}));
vi.mock('../../../services/auth', () => ({ isTrial: () => false, usuarioLogado: () => null }));

import { agruparPorTag, compararVersoes, resolverProntuarioVigente, ROTULO_ORIGEM } from '../prontuarioVigente';
import ProntuarioDoEquipamento from '../ProntuarioDoEquipamento';
import { anexarProntuarioExistente } from '../anexoProntuario';
import { docDeEmissao, docDeRascunho, type DocumentoProntuario } from '../indiceProntuarios';
import { listarEmissoes, revisaoDe, type EmissaoProntuario } from '../emissaoProntuario';
import { sha256Hex } from '../../relatorios/artefatoRelatorio';

const TAG = 'ZZ-SLOT';
let n = 0;
/** Emissão com `geradoEm` explícito — é ele o relógio da regra. */
const em = (geradoEm: string, origem?: 'anexado', extra: Partial<EmissaoProntuario> = {}): EmissaoProntuario => {
  n += 1;
  const ms = Date.parse(geradoEm);
  return {
    id: `PRONT-${ms}-${origem ? `anexo${n}` : `r${n}`}`,
    tag: TAG,
    numero: `REL-${n}`,
    emissao: '19/09/2026',
    motor: 'vetorial',
    pdfRef: { bucket: 'inspecao', path: `org/relatorios/${n}.pdf`, mimeType: 'application/pdf', tamanho: 10 },
    sha256: `sha-${n}`,
    paginas: 6,
    tamanho: 10,
    geradoEm,
    pdfPendente: false,
    ...(origem ? { origem, arquivoNome: `anexo-${n}.pdf` } : {}),
    ...extra,
  };
};
const FAB = {
  nome: 'PRONTUARIO CALDEIRA.pdf',
  tamanho: 2048,
  enviadoEm: '2026-09-01T10:00:00.000Z',
  pdfBase64: '',
  pdfRef: { bucket: 'inspecao', path: 'org/x.pdf', mimeType: 'application/pdf', tamanho: 2048 },
};
const idx = (e: EmissaoProntuario, rev = 1): DocumentoProntuario => docDeEmissao(e, rev, 'Vaso', 'Cliente');
const slot = () =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProntuarioDoEquipamento, { tag: TAG })));

beforeEach(() => {
  banco.clear();
  n = 0;
});

describe('regra do vigente — mais atual vale, origem é só metadado', () => {
  it('A · sem nada: nenhum vigente', () => {
    expect(resolverProntuarioVigente([], null)).toBeNull();
  });

  it('B/C · um anexado → PDF ANEXADO; um gerado → GERADO PELO SISTEMA; histórico zero', () => {
    const a = resolverProntuarioVigente([em('2026-09-01T10:00:00Z', 'anexado')], null)!;
    const g = resolverProntuarioVigente([em('2026-09-01T10:00:00Z')], null)!;
    expect([a.origem, a.outros]).toEqual(['anexado', 0]);
    expect([g.origem, g.outros]).toEqual(['gerado', 0]);
    expect(ROTULO_ORIGEM.anexado).toBe('PDF ANEXADO');
    expect(ROTULO_ORIGEM.gerado).toBe('GERADO PELO SISTEMA');
  });

  it('D · dois gerados: Rev. 02 vigente, Rev. 01 no histórico', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const r2 = em('2026-09-07T10:00:00Z');
    const v = resolverProntuarioVigente([r1, r2], null)!;
    expect(v.emissao!.id).toBe(r2.id);
    expect(v.historico.map((h) => h.emissao!.id)).toEqual([r1.id]);
  });

  it('F · gerado → anexado depois: o ANEXADO é o vigente (não o gerado só por ser gerado)', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const a = em('2026-09-10T10:00:00Z', 'anexado');
    const v = resolverProntuarioVigente([r1, a], null)!;
    expect(v.origem).toBe('anexado');
    expect(v.historico.map((h) => h.emissao!.id)).toEqual([r1.id]);
  });

  it('G · gerado → anexado → novo gerado: o ÚLTIMO válido é o vigente', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const a = em('2026-09-10T10:00:00Z', 'anexado');
    const r2 = em('2026-09-20T10:00:00Z');
    const v = resolverProntuarioVigente([r1, a, r2], null)!;
    expect(v.emissao!.id).toBe(r2.id);
    expect(v.historico.map((h) => h.emissao!.id)).toEqual([a.id, r1.id]); // mais recente primeiro
  });

  it('a ordem do ARRAY não decide: lista embaralhada (merge da Sync V2) dá o mesmo vigente', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const a = em('2026-09-10T10:00:00Z', 'anexado');
    const r2 = em('2026-09-20T10:00:00Z');
    for (const ordem of [[r2, r1, a], [a, r2, r1], [r1, r2, a]]) {
      expect(resolverProntuarioVigente(ordem, null)!.emissao!.id).toBe(r2.id);
    }
  });

  it('determinístico: mesmo geradoEm desempata pelo carimbo do id, depois pela posição', () => {
    const mesmo = '2026-09-10T10:00:00.000Z';
    const x = { ...em(mesmo), id: 'PRONT-1790000000000-r1' };
    const y = { ...em(mesmo, 'anexado'), id: 'PRONT-1790000000500-anexo2' };
    expect(resolverProntuarioVigente([y, x], null)!.emissao!.id).toBe(y.id);
    expect(compararVersoes({ id: 'a', quando: mesmo, posicao: 0 }, { id: 'b', quando: mesmo, posicao: 1 })).toBeLessThan(0);
  });

  it('o NÚMERO da revisão também é cronológico — ficha e índice não podem discordar', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const a = em('2026-09-10T10:00:00Z', 'anexado');
    const r2 = em('2026-09-20T10:00:00Z');
    banco.set(`nr13_pront_emitido_${TAG}`, [r2, a, r1]); // array fora de ordem
    expect(revisaoDe(TAG, r1.id)).toBe(1);
    expect(revisaoDe(TAG, r2.id)).toBe(2);
    expect(revisaoDe(TAG, a.id)).toBe(0); // anexo não é revisão nossa
  });

  it('item removido (tombstone) não conta', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const r2 = { ...em('2026-09-07T10:00:00Z'), removidoEm: '2026-09-08T00:00:00Z' } as EmissaoProntuario;
    expect(resolverProntuarioVigente([r1, r2], null)!.emissao!.id).toBe(r1.id);
  });

  it('I/R · a resolução não altera nada da entrada (pdfRef, SHA, ordem)', () => {
    const lista = [em('2026-09-04T10:00:00Z'), em('2026-09-07T10:00:00Z', 'anexado')];
    const antes = JSON.stringify(lista);
    resolverProntuarioVigente(lista, FAB as never);
    agruparPorTag(lista.map((e) => idx(e)));
    expect(JSON.stringify(lista)).toBe(antes);
  });

  it('J · PDF do fabricante sozinho aparece, como LEGADO', () => {
    const v = resolverProntuarioVigente([], FAB as never)!;
    expect(v.origem).toBe('fabricante');
    expect(ROTULO_ORIGEM.fabricante).toBe('PDF DO FABRICANTE · LEGADO');
  });

  it('LEGADO · A: só o PDF do fabricante → ocupa o slot, e não se passa por versão (legado: null)', () => {
    const v = resolverProntuarioVigente([], FAB as never)!;
    expect([v.origem, v.outros, v.historico.length, v.legado]).toEqual(['fabricante', 0, 0, null]);
  });

  it('LEGADO · B: 1 gerado + legado → gerado vigente, histórico 0, legado À PARTE', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const v = resolverProntuarioVigente([r1], FAB as never)!;
    expect(v.emissao!.id).toBe(r1.id);
    expect([v.outros, v.historico.length]).toEqual([0, 0]);
    expect(v.legado).toEqual(FAB);
  });

  it('LEGADO · C: Rev. 01 + Rev. 02 + legado → Histórico (1), NÃO (2)', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const r2 = em('2026-09-07T10:00:00Z');
    const v = resolverProntuarioVigente([r1, r2], FAB as never)!;
    expect(v.emissao!.id).toBe(r2.id);
    expect(v.outros).toBe(1);
    expect(v.historico.map((h) => h.origem)).toEqual(['gerado']); // nenhum 'fabricante' no histórico
    expect(v.legado).toEqual(FAB);
  });

  it('LEGADO · D: anexado vigente + legado → anexado vigente (mesmo mais antigo que o legado), legado à parte', () => {
    const a = em('2026-08-01T10:00:00Z', 'anexado');
    const v = resolverProntuarioVigente([a], FAB as never)!;
    expect([v.origem, v.outros]).toEqual(['anexado', 0]);
    expect(v.legado).toEqual(FAB);
  });

  it('LEGADO · E: sem legado → legado null (a tela não desenha seção vazia)', () => {
    expect(resolverProntuarioVigente([em('2026-09-04T10:00:00Z')], null)!.legado).toBeNull();
    const modal = readFileSync('src/features/prontuarios/ModalHistoricoProntuario.tsx', 'utf8');
    expect(modal).toContain('{estado.vigente?.legado && (');
  });

  it('LEGADO · o registro do fabricante não é alterado nem convertido', () => {
    const fab = structuredClone(FAB);
    resolverProntuarioVigente([em('2026-09-04T10:00:00Z')], fab as never);
    expect(fab).toEqual(FAB);
    // Sem classificação de conteúdo: o resolvedor nem lê o NOME do arquivo.
    expect(readFileSync('src/features/prontuarios/prontuarioVigente.ts', 'utf8')).not.toContain('.nome');
  });
});

describe('L/M · /prontuarios: uma linha por TAG, o MESMO vigente da ficha', () => {
  it('L · ficha (emissões) e lista (índice) escolhem o mesmo documento', () => {
    const r1 = em('2026-09-04T10:00:00Z');
    const a = em('2026-09-10T10:00:00Z', 'anexado');
    const r2 = em('2026-09-20T10:00:00Z');
    const daFicha = resolverProntuarioVigente([a, r2, r1], null)!.emissao!.id;
    const [grupo] = agruparPorTag([idx(r2, 2), idx(r1, 1), idx(a)]);
    expect(grupo.vigente!.id).toBe(daFicha);
    expect(grupo.historico.map((d) => d.id)).toEqual([a.id, r1.id]);
  });

  it('M · várias TAGs e documentos → uma linha por TAG; só-rascunho também aparece', () => {
    const docs: DocumentoProntuario[] = [
      idx({ ...em('2026-09-04T10:00:00Z'), tag: 'A' }),
      idx({ ...em('2026-09-07T10:00:00Z'), tag: 'A' }, 2),
      idx({ ...em('2026-09-05T10:00:00Z', 'anexado'), tag: 'B' }),
      docDeRascunho('C', { descricao: 'Vaso C' }, null, '2026-09-09T10:00:00Z'),
    ];
    const g = agruparPorTag(docs);
    expect(g.map((x) => x.tag).sort()).toEqual(['A', 'B', 'C']);
    const c = g.find((x) => x.tag === 'C')!;
    expect(c.vigente).toBeNull();
    expect(c.rascunho).not.toBeNull();
  });

  it('E · gerado + rascunho: o finalizado CONTINUA vigente', () => {
    const r2 = em('2026-09-07T10:00:00Z');
    const [g] = agruparPorTag([idx(r2, 2), docDeRascunho(TAG, { descricao: 'Vaso' }, null, '2026-09-23T10:00:00Z')]);
    expect(g.vigente!.id).toBe(r2.id); // o rascunho é mais novo e NÃO ganha
    expect(g.rascunho).not.toBeNull();
  });

  it('a lista é agrupada na TELA, e o índice continua com um documento por linha', () => {
    const lista = readFileSync('src/features/prontuarios/ListaProntuariosV9.tsx', 'utf8');
    expect(lista).toContain('agruparPorTag(docs)');
    expect(lista).toContain('<ModalHistoricoProntuario');
    expect(readFileSync('src/features/prontuarios/indiceProntuarios.ts', 'utf8')).toContain('export interface DocumentoProntuario');
  });
});

describe('H · atualizar com o MESMO arquivo não cria versão', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a]);
  const OUTRO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32, 0x0a]);
  const arquivo = { nome: 'p.pdf', tamanho: 7, mimeType: 'application/pdf' };
  const publicador = () => {
    const enviados: Uint8Array[] = [];
    return {
      enviados,
      publicar: async (bytes: Uint8Array, paginas: number) => {
        enviados.push(bytes);
        return {
          pdfRef: { bucket: 'inspecao', path: `org/relatorios/${enviados.length}.pdf`, mimeType: 'application/pdf', tamanho: bytes.length },
          sha256: await sha256Hex(bytes),
          geradoEm: new Date(Date.UTC(2026, 8, 20 + enviados.length)).toISOString(),
          paginas,
          pendente: false,
        };
      },
    };
  };

  it('mesmo SHA do VIGENTE: "já é o vigente", nenhuma versão, nenhum upload', async () => {
    const pub = publicador();
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    expect([r.jaAnexado, r.jaVigente]).toEqual([true, true]);
    expect(pub.enviados).toHaveLength(1);
    expect(listarEmissoes(TAG)).toHaveLength(1);
  });

  it('SHA de uma versão do HISTÓRICO: "já está no histórico", sem duplicar nem promover', async () => {
    const pub = publicador();
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: OUTRO }, { publicar: pub.publicar }); // nova versão
    const antes = JSON.stringify(listarEmissoes(TAG));
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    expect([r.jaAnexado, r.jaVigente]).toEqual([true, false]);
    expect(pub.enviados).toHaveLength(2);
    expect(JSON.stringify(listarEmissoes(TAG))).toBe(antes);
    // o vigente segue sendo a versão nova
    expect(resolverProntuarioVigente(listarEmissoes(TAG), null)!.emissao!.sha256).toBe(await sha256Hex(OUTRO));
  });

  it('I/R · atualizar com arquivo NOVO acrescenta; o antigo fica intacto no histórico', async () => {
    const pub = publicador();
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    const antigo = structuredClone(listarEmissoes(TAG)[0]);
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: OUTRO }, { publicar: pub.publicar });
    const lista = listarEmissoes(TAG);
    expect(lista).toHaveLength(2);
    expect(lista.find((e) => e.id === antigo.id)).toEqual(antigo); // pdfRef e SHA inalterados
    const v = resolverProntuarioVigente(lista, null)!;
    expect(v.emissao!.id).not.toBe(antigo.id);
    expect(v.historico[0].emissao).toEqual(antigo);
  });
});

describe('o slot na ficha', () => {
  it('SEM prontuário: Anexar + Criar em Prontuários — nenhuma área de envio', () => {
    const h = slot();
    expect(h).toContain('pde-slot-vazio');
    expect(h).toContain('Anexar prontuário');
    expect(h).toContain('Criar em Prontuários');
    expect(h).not.toMatch(/dropzone|type="file"/);
  });

  it('SÓ RASCUNHO: "ainda não emitido" + Continuar (e anexar continua possível)', () => {
    banco.set(`nr13_prontuario_${TAG}`, { tag: TAG, descricao: 'Vaso' });
    const h = slot();
    expect(h).toContain('Prontuário ainda não emitido.');
    expect(h).toContain('Continuar');
    expect(h).toContain('Anexar prontuário');
  });

  it('com vigente: Abrir, Baixar e ATUALIZAR — nunca "anexar outro"', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [em('2026-09-01T10:00:00Z', 'anexado', { arquivoNome: 'antigo.pdf', tamanho: 771 })]);
    const h = slot();
    expect(h).toContain('PDF ANEXADO');
    expect(h).toContain('antigo.pdf');
    for (const t of ['Abrir', 'Baixar', 'Atualizar prontuário']) expect(h).toContain(t);
    expect(h).not.toContain('Anexar prontuário');
    expect(h).not.toContain('Ver histórico');
  });

  it('D na ficha · Rev. 02 vigente com "Ver histórico (1)" — nunca duas caixas', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [em('2026-09-04T10:00:00Z'), em('2026-09-07T10:00:00Z', undefined, { numero: 'REL-99' })]);
    const h = slot();
    expect(h).toContain('GERADO PELO SISTEMA');
    expect(h).toContain('REL-99');
    expect(h).toContain('Rev. 02');
    expect(h).toContain('Ver histórico (1)');
    expect(h.match(/data-teste="prontuario-slot"/g)).toHaveLength(1);
  });

  it('E na ficha · vigente + rascunho da próxima revisão: vigente continua, e há "Continuar nova revisão"', async () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [em('2026-09-07T10:00:00Z', undefined, { numero: 'REL-2' })]);
    banco.set('nr13_pront_indice', [docDeRascunho(TAG, { descricao: 'Vaso' }, null, '2026-09-23T10:00:00Z')]);
    const h = slot();
    expect(h).toContain('REL-2');
    expect(h).toContain('Continuar nova revisão');
    expect(h).not.toContain('ainda não emitido');
  });

  it('só PDF do fabricante: aparece como legado, com Atualizar', () => {
    banco.set(`nr13_pront_fab_${TAG}`, FAB);
    const h = slot();
    expect(h).toContain('PDF DO FABRICANTE · LEGADO');
    expect(h).toContain('PRONTUARIO CALDEIRA.pdf');
    expect(h).toContain('Atualizar prontuário');
    expect(h).not.toContain('Documento legado'); // é ele o que está no slot
  });

  it('LEGADO · C na ficha: Rev. 01 + Rev. 02 + legado → "Ver histórico (1)" e, à parte, "Documento legado"', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [em('2026-09-04T10:00:00Z'), em('2026-09-07T10:00:00Z', undefined, { numero: 'REL-02' })]);
    banco.set(`nr13_pront_fab_${TAG}`, FAB);
    const h = slot();
    expect(h).toContain('REL-02');
    expect(h).toContain('Ver histórico (1)');
    expect(h).not.toContain('Ver histórico (2)');
    expect(h).toContain('Documento legado');
    expect(h).not.toContain('PDF DO FABRICANTE'); // o selo do slot é o do vigente
  });

  it('LEGADO · E na ficha: sem legado, nenhum link de documento legado', () => {
    banco.set(`nr13_pront_emitido_${TAG}`, [em('2026-09-04T10:00:00Z')]);
    expect(slot()).not.toContain('Documento legado');
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
    expect(readFileSync('src/pages/Prontuarios.tsx', 'utf8')).toContain('lerProntuarioFabricante(tag)');
    expect(readFileSync('src/pages/portal/PortalAtivo.tsx', 'utf8')).toContain('lerProntuarioFabricante(tag)');
    expect(readFileSync('src/services/recuperacaoArquivos.ts', 'utf8')).toContain("prefixo: 'nr13_pront_fab_'");
  });

  it('o modal de anexar não diz mais que "os dois convivem" — agora é nova versão', () => {
    const modal = readFileSync('src/features/prontuarios/ModalAnexarProntuario.tsx', 'utf8');
    expect(modal).not.toContain('os dois convivem');
    expect(modal).toContain('O novo documento se tornará o');
    expect(modal).toContain('O documento atual será preservado no');
  });
});

describe('alvo de toque do slot no celular', () => {
  it('a regra de 44px do celular vence a regra "quieta" de 32px do desktop', () => {
    const css = readFileSync('src/features/prontuarios/prontuarioDoEquipamento.css', 'utf8').replace(/\r\n/g, '\n');
    const movel = css.slice(css.indexOf('@media (max-width: 560px)'));
    // mesma especificidade (dois seletores de classe), e vem DEPOIS no arquivo
    expect(movel).toMatch(/\.pde-slot \.pde-slot-btn \{[^}]*min-height: 44px/);
    expect(css.indexOf('@media (max-width: 560px)')).toBeGreaterThan(css.indexOf('.pde-slot .pde-slot-btn {'));
  });
});
