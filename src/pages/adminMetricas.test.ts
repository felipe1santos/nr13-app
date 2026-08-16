import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtBytes, fracaoBase64, fmtPercentual, ordenarPorConsumo, type UsoStats, type StorageStats } from './adminMetricas';

/**
 * O painel só é útil se o número dele for verdade. Estes testes cobrem os dois
 * jeitos de ele mentir:
 *
 * 1. formatação errada (byte virando megabyte na tela);
 * 2. DERIVA entre o `returns table` do SQL e a interface do TS — a coluna
 *    existe no banco com um nome, a tela lê outro, o campo vem `undefined` e
 *    aparece "—" para sempre. Ninguém percebe, porque "—" é exatamente o que a
 *    tela mostra quando o SQL não foi aplicado.
 */

const SQL_USO = readFileSync(new URL('../../supabase/admin_stats.sql', import.meta.url), 'utf8');
const SQL_STORAGE = readFileSync(new URL('../../supabase/admin_storage_stats.sql', import.meta.url), 'utf8');

/** SQL sem os comentários `--`: o que a função EXECUTA, não o que ela explica. */
function corpoSql(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
}

/** Colunas declaradas no primeiro `returns table ( ... )` do arquivo. */
function colunasDeclaradas(sql: string): string[] {
  const corpo = corpoSql(sql);
  const abre = corpo.indexOf('returns table');
  const ini = corpo.indexOf('(', abre);
  let nivel = 0;
  let fim = ini;
  for (let i = ini; i < corpo.length; i++) {
    if (corpo[i] === '(') nivel++;
    if (corpo[i] === ')') {
      nivel--;
      if (nivel === 0) {
        fim = i;
        break;
      }
    }
  }
  return corpo
    .slice(ini + 1, fim)
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
}

const CAMPOS_USO: Array<keyof UsoStats> = [
  'escopo',
  'equip_vaso',
  'equip_caldeira',
  'equip_autoclave',
  'inspecoes',
  'relatorios',
  'pdf_gerados',
  'impressoes',
  'subusuarios',
  'relatorios_legado',
  'bytes_total',
  'bytes_legado',
  'chaves_total',
  'chaves_base64',
  'bytes_base64',
  'ultima_sync',
];

const CAMPOS_STORAGE: Array<keyof StorageStats> = [
  'escopo',
  'arquivos',
  'bytes',
  'bytes_relatorios',
  'bytes_assinaturas',
  'bytes_certificados',
  'bytes_fotos',
  'pdfs',
  'pdf_bytes_medio',
  'fotos',
  'foto_bytes_medio',
];

describe('contrato SQL ↔ TypeScript', () => {
  it('admin_usage_stats devolve exatamente as colunas que a tela lê', () => {
    expect(colunasDeclaradas(SQL_USO)).toEqual(CAMPOS_USO);
  });

  it('admin_storage_stats devolve exatamente as colunas que a tela lê', () => {
    expect(colunasDeclaradas(SQL_STORAGE)).toEqual(CAMPOS_STORAGE);
  });

  it('as colunas da Fase 2 entram no FIM, para o front antigo não quebrar no deploy', () => {
    // Entre aplicar o SQL e redeployar o front existe uma janela em que o Admin
    // em produção lê o resultado novo. Ele lê por nome — acrescentar no fim é
    // inofensivo, reordenar não é.
    const cols = colunasDeclaradas(SQL_USO);
    expect(cols.slice(0, 9)).toEqual([
      'escopo',
      'equip_vaso',
      'equip_caldeira',
      'equip_autoclave',
      'inspecoes',
      'relatorios',
      'pdf_gerados',
      'impressoes',
      'subusuarios',
    ]);
  });
});

describe('guarda de admin', () => {
  it('as DUAS funções recusam quem não é admin, antes de qualquer leitura', () => {
    for (const sql of [SQL_USO, SQL_STORAGE]) {
      const corpo = corpoSql(sql);
      expect(corpo).toContain("pr.role = 'admin'");
      expect(corpo).toContain("raise exception 'acesso negado'");
      // A guarda precisa vir ANTES do primeiro `return query`: uma verificação
      // depois da leitura já teria lido o dado de todas as organizações.
      expect(corpo.indexOf("raise exception 'acesso negado'")).toBeLessThan(corpo.indexOf('return query'));
    }
  });

  it('nenhuma das funções devolve conteúdo de chave ou de arquivo', () => {
    // `valor` e `name` podem ser LIDOS (para filtrar e medir), nunca devolvidos.
    for (const campos of [CAMPOS_USO, CAMPOS_STORAGE]) {
      expect(campos).not.toContain('valor');
      expect(campos).not.toContain('chave');
      expect(campos).not.toContain('name');
      expect(campos).not.toContain('nome');
    }
  });
});

describe('contagem de relatórios — a correção da fase', () => {
  it('conta pelas chaves nr13_rel_, não pela chave legada', () => {
    const corpo = corpoSql(SQL_USO);
    expect(corpo).toContain("b.chave like 'nr13\\_rel\\_%'");
    // O legado ainda é LIDO (para achar o que ainda não migrou), mas não pode
    // mais ser a fonte da contagem via jsonb_array_length.
    expect(corpo).not.toContain('jsonb_array_length(b.valor::jsonb) end), 0)::int as relatorios');
  });

  it('deduplica por id em vez de somar as duas fontes', () => {
    // Somar contaria em dobro todo relatório que já migrou e cujo legado não
    // foi apagado — que é o estado NORMAL do sistema hoje.
    const corpo = corpoSql(SQL_USO);
    expect(corpo).toContain('count(distinct u.id)');
  });

  it('normaliza o id do legado como `idSeguro` faz na chave', () => {
    // `idSeguro()` troca `_` por `-` antes de montar `nr13_rel_<id>_<TAG>`. Sem
    // o mesmo replace aqui, um id antigo com `_` não casaria com a sua própria
    // versão migrada e seria contado duas vezes.
    expect(corpoSql(SQL_USO)).toContain("replace(coalesce(e ->> 'id', ''), '_', '-')");
  });

  it('ignora linhas com soft-delete', () => {
    expect(corpoSql(SQL_USO)).toContain('s.deletado_em is null');
  });
});

describe('fmtBytes', () => {
  it('formata as faixas que aparecem no painel', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(9868)).toBe('9,6 KB');
    expect(fmtBytes(864744)).toBe('844 KB'); // ≥100 na unidade: sem casa decimal
    expect(fmtBytes(63822947)).toBe('60,9 MB');
    expect(fmtBytes(6819842)).toBe('6,5 MB');
  });

  it('acima de 100 na unidade, sem casa decimal', () => {
    expect(fmtBytes(115787240)).toBe('110 MB');
  });

  it('ausência não vira zero — zero significa "medi e deu zero"', () => {
    expect(fmtBytes(null)).toBe('—');
    expect(fmtBytes(undefined)).toBe('—');
    expect(fmtBytes(NaN)).toBe('—');
  });
});

describe('fração de base64', () => {
  it('mede quanto do app_storage ainda é blob', () => {
    expect(fracaoBase64({ bytes_total: 3206109, bytes_base64: 2545797 })).toBeCloseTo(0.794, 2);
    expect(fmtPercentual(fracaoBase64({ bytes_total: 3206109, bytes_base64: 2545797 }))).toBe('79%');
  });

  it('organização vazia devolve null, não 0% — 0/0 não é "resolvido"', () => {
    expect(fracaoBase64({ bytes_total: 0, bytes_base64: 0 })).toBeNull();
    expect(fmtPercentual(null)).toBe('—');
  });
});

describe('ranking de consumo', () => {
  const uso = (escopo: string, bytes: number) => ({ escopo, bytes_total: bytes } as UsoStats);
  const st = (escopo: string, bytes: number) => [escopo, { escopo, bytes } as StorageStats] as const;

  it('soma banco + bucket e ordena pelo total', () => {
    const r = ordenarPorConsumo(
      [uso('a', 1000), uso('b', 10), uso('c', 500)],
      new Map([st('b', 90_000), st('c', 100)]),
    );
    expect(r.map((x) => x.escopo)).toEqual(['b', 'a', 'c']);
    expect(r[0]).toMatchObject({ bytesBanco: 10, bytesBucket: 90_000, total: 90_010 });
  });

  it('organização sem arquivo nenhum entra com bucket zero, não some do ranking', () => {
    const r = ordenarPorConsumo([uso('a', 1000)], new Map());
    expect(r).toHaveLength(1);
    expect(r[0].bytesBucket).toBe(0);
  });
});
