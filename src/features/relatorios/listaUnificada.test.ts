import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  rotuloSituacao,
  situacaoDaLinha,
  totalNaTela,
  unificarLista,
  proximaInspecaoIso,
  qualProxima,
} from './listaUnificada';
import type { ItemRelatorio } from '../../services/buscaRelatorios';
import type { RascunhoItem } from './rascunhos';

/**
 * Hotfix de UX · `/relatorios` tinha DUAS listagens empilhadas e parecia
 * clonada. Este gate guarda a lista única: rascunho e emitido no mesmo lugar,
 * com a diferença num selo — e não numa segunda tabela.
 *
 * O que ele NÃO deixa passar de volta: contagem que ignora o rascunho (a tela
 * anunciaria menos linhas do que mostra) e relatório sem arquivo apresentado
 * como "finalizado" (quem clica espera o documento, e ali só existe a receita).
 */

const rascunho = (id: string, quando = '2026-09-05T10:00:00Z'): RascunhoItem => ({
  id,
  tag: 'VP-1',
  nome: `Rascunho ${id}`,
  tipo: 'Inspeção Periódica',
  codigo: `REL-${id}`,
  atualizadoEm: quando,
  criadoEm: quando,
});

const emitido = (id: string, pdf: string | null = 'org/relatorios/x.pdf'): ItemRelatorio =>
  ({
    relatorioId: id,
    tag: 'VP-1',
    codigo: `REL-${id}`,
    nome: `Relatório ${id}`,
    tipo: 'Inspeção Periódica',
    status: 'Aprovado',
    profissional: null,
    emissao: '2026-09-01',
    validade: '2027-09-01',
    execucaoInspecao: null,
    proximaInterna: null,
    proximaExterna: null,
    pdfRef: pdf,
    sha256: null,
    paginas: 12,
    sourceVersion: 1,
    equipamentoAtivo: true,
  }) as unknown as ItemRelatorio;

describe('uma lista só', () => {
  it('rascunhos e emitidos saem na MESMA lista', () => {
    const linhas = unificarLista([rascunho('a')], [emitido('b')]);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.tipo)).toEqual(['rascunho', 'emitido']);
  });

  it('rascunho vem primeiro — é o trabalho em aberto', () => {
    const linhas = unificarLista([rascunho('a')], [emitido('b'), emitido('c')]);
    expect(linhas[0].tipo).toBe('rascunho');
  });

  it('a ordem do servidor não é remexida (a paginação por cursor depende dela)', () => {
    const linhas = unificarLista([], [emitido('b'), emitido('c'), emitido('d')]);
    expect(linhas.map((l) => (l.tipo === 'emitido' ? l.item.relatorioId : ''))).toEqual(['b', 'c', 'd']);
  });

  it('as chaves não colidem entre as duas espécies', () => {
    const linhas = unificarLista([rascunho('x')], [emitido('x')]);
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(2);
  });

  it('lista vazia continua vazia', () => {
    expect(unificarLista([], [])).toEqual([]);
  });
});

describe('a situação que o selo mostra', () => {
  const vazio = new Set<string>();

  it('rascunho é rascunho', () => {
    expect(situacaoDaLinha(unificarLista([rascunho('a')], [])[0], vazio)).toBe('rascunho');
  });

  it('emitido com arquivo é finalizado', () => {
    expect(situacaoDaLinha(unificarLista([], [emitido('b')])[0], vazio)).toBe('finalizado');
  });

  it('emitido SEM arquivo não se chama finalizado', () => {
    expect(situacaoDaLinha(unificarLista([], [emitido('b', null)])[0], vazio)).toBe('sem-arquivo');
  });

  it('arquivado vence o resto — é o que explica a linha estar fora da lista padrão', () => {
    const linha = unificarLista([], [emitido('b')])[0];
    expect(situacaoDaLinha(linha, new Set(['b']))).toBe('arquivado');
  });

  it('todo rótulo é texto, nunca vazio', () => {
    for (const s of ['rascunho', 'arquivado', 'finalizado', 'sem-arquivo'] as const) {
      expect(rotuloSituacao(s).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('a contagem fala da lista que está na tela', () => {
  it('soma rascunhos e emitidos', () => {
    expect(totalNaTela(2, 8)).toBe(10);
  });

  it('sem rascunho, é a contagem do servidor', () => {
    expect(totalNaTela(0, 37)).toBe(37);
  });
});

describe('a tela não tem mais duas listagens (leitura do fonte)', () => {
  const tela = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');

  it('o bloco separado de rascunhos saiu', () => {
    expect(tela).not.toContain('rel-rascunhos');
    expect(tela).not.toContain('Em rascunho (');
  });

  it('existe UMA `rel-tabela-v9` na tela', () => {
    expect(tela.match(/className="rel-tabela-v9"/g) ?? []).toHaveLength(1);
  });

  it('a lista renderizada é a unificada', () => {
    expect(tela).toContain('unificarLista(rascunhosVisiveis, visiveis)');
    expect(tela).toContain('itens={linhas}');
  });

  it('as ações de cada espécie continuam separadas', () => {
    expect(tela).toContain('aoContinuarRascunho?.(r)');
    expect(tela).toContain('setExcluindoRascunho(r)');
    expect(tela).toContain('setArquivando(r)');
    expect(tela).toContain('onClick={() => abrir(r)}');
  });

  it('o ícone vem do sprite do sistema, não de uma imagem solta', () => {
    expect(tela).not.toContain('/icones/pdf.webp');
    expect(tela).toContain('<Icone nome="filetext" tam={15} />');
  });
});

describe('a próxima inspeção da linha (refino de 05/09/2026)', () => {
  it('escolhe a MAIS PRÓXIMA entre interna e externa', () => {
    expect(proximaInspecaoIso({ proximaInterna: '2027-05-10', proximaExterna: '2026-11-02' })).toBe('2026-11-02');
    expect(qualProxima({ proximaInterna: '2027-05-10', proximaExterna: '2026-11-02' })).toBe('externa');
  });

  it('com uma só, é ela', () => {
    expect(proximaInspecaoIso({ proximaInterna: '2027-05-10', proximaExterna: null })).toBe('2027-05-10');
    expect(qualProxima({ proximaInterna: '2027-05-10', proximaExterna: null })).toBe('interna');
  });

  it('sem nenhuma, devolve null — a célula mostra travessão', () => {
    expect(proximaInspecaoIso({ proximaInterna: null, proximaExterna: undefined })).toBeNull();
    expect(qualProxima({})).toBeNull();
  });

  it('a data-sentinela de ordenação não é resposta', () => {
    expect(proximaInspecaoIso({ proximaInterna: '0001-01-01', proximaExterna: '' })).toBeNull();
  });

  it('texto que não é data não vira data', () => {
    expect(proximaInspecaoIso({ proximaInterna: 'a combinar' })).toBeNull();
  });
});

describe('o refino: ações numa linha, hierarquia e densidade', () => {
  const css = readFileSync('src/pages/relatorios.css', 'utf8');
  const tela = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');

  it('a coluna de ações não quebra linha', () => {
    expect(css).toContain('.rel-cel-acoes { flex-wrap: nowrap;');
    expect(css).toContain('.rel-page .rel-cel-acoes { gap: 2px; flex-wrap: nowrap; }');
  });

  it('o nome tem nível próprio, separado do metadado', () => {
    expect(tela).toContain('className="rel-nome-forte"');
    expect(tela).toContain('className="rel-cel-meta"');
    expect(css).toContain('.rel-nome-forte {');
  });

  it('a coluna de próxima inspeção existe na tela', () => {
    expect(tela).toContain('<span role="columnheader">Próxima</span>');
    expect(tela).toContain('proximaInspecao(r)');
  });

  it('a estimativa de altura da linha acompanhou a densidade', () => {
    expect(tela).toContain('const ALT_LINHA = 40;');
  });
});
