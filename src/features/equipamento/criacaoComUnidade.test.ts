/**
 * TODO EQUIPAMENTO NOVO NASCE COM UNIDADE EXPLÍCITA — 16/09/2026.
 *
 * Fecha a regra nos TRÊS fluxos que criam equipamento:
 *   · cadastro manual   — `criarEquipamento`;
 *   · importação        — `importarLinhas` (provada em `importarPlanilhaUnidade.test.ts`);
 *   · demonstração/trial — `injetarDadosDemo`.
 *
 * Dois defeitos corrigidos aqui:
 *   1. o cadastro manual gravava `nr13_info_` ANTES da unidade — uma falha entre
 *      as duas deixava equipamento criado sem unidade;
 *   2. a demonstração não gravava unidade nenhuma — `DEMO-*` só "era SI" pelo
 *      recuo dos leitores.
 *
 * O recuo SI fica para o LEGADO. Equipamento novo não depende dele.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  dados: new Map<string, unknown>(),
  gravacoes: [] as string[],
  falharEm: new Set<string>(),
}));

vi.mock('../../services/storage', async () => {
  const real = await vi.importActual<typeof import('../../services/storage')>('../../services/storage');
  return {
    ...real,
    ler: (chave: string) => (banco.dados.has(chave) ? banco.dados.get(chave) : null),
    lerTudo: async () => ({}),
    salvar: async (chave: string, valor: unknown) => {
      if (banco.falharEm.has(chave)) throw new Error(`falha artificial em ${chave}`);
      banco.gravacoes.push(chave);
      banco.dados.set(chave, valor);
    },
  };
});

vi.mock('../../services/limiteTrial', () => ({
  podeCriarEquipamentoAgora: vi.fn(async () => ({ permitido: true, motivo: '' })),
}));

import { criarEquipamento } from './equipamentoService';
import { injetarDadosDemo, UNIDADE_DEMO } from '../../services/demoSeed';
import { ehSistemaUnidade, unidadeValida, type SistemaUnidade } from '../../calc/unidades';

const RAIZ = resolve(__dirname, '../../..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

beforeEach(() => {
  banco.dados.clear();
  banco.gravacoes = [];
  banco.falharEm.clear();
});

/* ───────────────────────── CADASTRO MANUAL ───────────────────────── */

describe('C · criação normal grava a unidade escolhida', () => {
  it('a unidade é OBRIGATÓRIA na assinatura — sem default que decida por ninguém', () => {
    expect(fonte('src/features/equipamento/equipamentoService.ts')).not.toContain("unidade: SistemaUnidade = 'SI'");
  });

  const casos: SistemaUnidade[] = ['SI', 'TECNICO', 'PETROBRAS'];
  for (const u of casos) {
    it(`${u}: unidade e equipamento gravados, a unidade PRIMEIRO`, async () => {
      await criarEquipamento(`ZZ-MAN-${u}`, 'vaso', '', u);
      expect(banco.dados.get(`nr13_pref_unidade_ZZ-MAN-${u}`)).toBe(u);
      expect(banco.dados.has(`nr13_info_ZZ-MAN-${u}`)).toBe(true);
      expect(banco.gravacoes).toEqual([`nr13_pref_unidade_ZZ-MAN-${u}`, `nr13_info_ZZ-MAN-${u}`]);
    });
  }

  it.each([['KPA'], [''], ['si'], [undefined], [null]])('unidade %s é recusada antes de gravar', async (u) => {
    await expect(
      criarEquipamento('ZZ-MAN-INV', 'vaso', '', u as unknown as SistemaUnidade),
    ).rejects.toThrow(/unidade de medida/i);
    expect(banco.gravacoes).toEqual([]);
  });
});

describe('A · a unidade falha → nenhum equipamento parcial', () => {
  it('nada de nr13_info_, nada gravado', async () => {
    banco.falharEm.add('nr13_pref_unidade_ZZ-MAN-A');
    await expect(criarEquipamento('ZZ-MAN-A', 'vaso', '', 'TECNICO')).rejects.toThrow(/falha artificial/);
    expect(banco.dados.has('nr13_info_ZZ-MAN-A')).toBe(false);
    expect(banco.gravacoes).toEqual([]);
  });
});

describe('B · unidade salva e info falha → retry conclui', () => {
  it('a falha deixa só a unidade — nenhum equipamento sem ela', async () => {
    banco.falharEm.add('nr13_info_ZZ-MAN-B');
    await expect(criarEquipamento('ZZ-MAN-B', 'caldeira', 'flamotubular', 'PETROBRAS')).rejects.toThrow();
    expect(banco.dados.has('nr13_info_ZZ-MAN-B')).toBe(false);
    expect(banco.dados.get('nr13_pref_unidade_ZZ-MAN-B')).toBe('PETROBRAS');
  });

  it('repetir a criação conclui, sem duplicar', async () => {
    banco.falharEm.add('nr13_info_ZZ-MAN-B');
    await criarEquipamento('ZZ-MAN-B', 'vaso', '', 'PETROBRAS').catch(() => {});
    banco.falharEm.clear();
    banco.gravacoes = [];

    await criarEquipamento('ZZ-MAN-B', 'vaso', '', 'PETROBRAS');

    expect(banco.dados.get('nr13_pref_unidade_ZZ-MAN-B')).toBe('PETROBRAS');
    expect(banco.dados.has('nr13_info_ZZ-MAN-B')).toBe(true);
    // Uma gravação de cada — o retry não empilha nada.
    expect(banco.gravacoes).toEqual(['nr13_pref_unidade_ZZ-MAN-B', 'nr13_info_ZZ-MAN-B']);
  });

  it('e depois de concluído, repetir de novo é recusado', async () => {
    await criarEquipamento('ZZ-MAN-B2', 'vaso', '', 'SI');
    await expect(criarEquipamento('ZZ-MAN-B2', 'vaso', '', 'SI')).rejects.toThrow(/Já existe/);
  });
});

describe('D · TAG duplicada não troca a unidade', () => {
  it('equipamento existente em Petrobras: criar de novo em SI é recusado sem gravar', async () => {
    await criarEquipamento('ZZ-MAN-D', 'vaso', '', 'PETROBRAS');
    banco.gravacoes = [];

    await expect(criarEquipamento('ZZ-MAN-D', 'vaso', '', 'SI')).rejects.toThrow(/Já existe um equipamento com a TAG "ZZ-MAN-D"/);

    expect(banco.gravacoes).toEqual([]);
    expect(banco.dados.get('nr13_pref_unidade_ZZ-MAN-D')).toBe('PETROBRAS');
  });

  it('também para equipamento LEGADO sem unidade: não ganha uma por acidente', async () => {
    banco.dados.set('nr13_info_ZZ-LEGADO', { tag: 'ZZ-LEGADO', tipo: 'vaso', subtipo: '' });
    await expect(criarEquipamento('ZZ-LEGADO', 'vaso', '', 'TECNICO')).rejects.toThrow(/Já existe/);
    expect(banco.dados.has('nr13_pref_unidade_ZZ-LEGADO')).toBe(false);
    expect(unidadeValida(banco.dados.get('nr13_pref_unidade_ZZ-LEGADO'))).toBe('SI');
  });
});

/* ───────────────────────── DEMONSTRAÇÃO ───────────────────────── */

describe('DEMO · os equipamentos de exemplo nascem com unidade explícita', () => {
  it('SI é comprovadamente o default oficial — o recuo de leitura e os dois formulários', () => {
    expect(UNIDADE_DEMO).toBe('SI');
    expect(ehSistemaUnidade(UNIDADE_DEMO)).toBe(true);
    // O recuo OFICIAL de leitura, para ausente e para lixo.
    expect(unidadeValida(undefined)).toBe(UNIDADE_DEMO);
    expect(unidadeValida('qualquer coisa')).toBe(UNIDADE_DEMO);
    // Os valores iniciais dos dois formulários de criação.
    expect(fonte('src/features/equipamento/ModalCriarEquipamento.tsx')).toContain("useState<SistemaUnidade>('SI')");
    expect(fonte('src/features/equipamento/ModalImportarPlanilha.tsx')).toContain("useState<SistemaUnidade>('SI')");
  });

  it('criar a demonstração grava a unidade dos dois equipamentos, ANTES do info', async () => {
    await injetarDadosDemo('Empresa ZZ');
    for (const tag of ['DEMO-VP-01', 'DEMO-CP-01']) {
      expect(banco.dados.get(`nr13_pref_unidade_${tag}`)).toBe('SI');
      expect(banco.gravacoes.indexOf(`nr13_pref_unidade_${tag}`)).toBeLessThan(
        banco.gravacoes.indexOf(`nr13_info_${tag}`),
      );
    }
  });

  it('falha no info de um equipamento: a próxima entrada conclui, com unidade', async () => {
    banco.falharEm.add('nr13_info_DEMO-CP-01');
    await expect(injetarDadosDemo('Empresa ZZ')).rejects.toThrow();
    expect(banco.dados.has('nr13_demo_seed')).toBe(false); // marcador só no fim
    expect(banco.dados.has('nr13_info_DEMO-CP-01')).toBe(false);

    banco.falharEm.clear();
    await injetarDadosDemo('Empresa ZZ');

    expect(banco.dados.has('nr13_info_DEMO-CP-01')).toBe(true);
    expect(banco.dados.get('nr13_pref_unidade_DEMO-CP-01')).toBe('SI');
    expect(banco.dados.has('nr13_demo_seed')).toBe(true);
  });

  it('segunda entrada não grava nada (marcador)', async () => {
    await injetarDadosDemo('Empresa ZZ');
    banco.gravacoes = [];
    await injetarDadosDemo('Empresa ZZ');
    expect(banco.gravacoes).toEqual([]);
  });
});

/* ───────────────────────── REGRA GLOBAL ───────────────────────── */

describe('REGRA GLOBAL · quem cria equipamento, e todos gravam a unidade', () => {
  function arquivos(dir: string, ext: string[]): string[] {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
      const c = join(dir, nome);
      if (statSync(c).isDirectory()) saida.push(...arquivos(c, ext));
      else if (ext.some((e) => nome.endsWith(e)) && !/\.test\.(ts|tsx|mjs)$/.test(nome)) saida.push(c);
    }
    return saida;
  }

  const ESCRITA = /\b(salvar|setItem|sbSalvar|gravarAtomico)\s*\(/;
  const linhasDeArquivo = [
    ...arquivos(resolve(RAIZ, 'src'), ['.ts', '.tsx']),
    ...arquivos(resolve(RAIZ, 'public'), ['.html', '.js']),
  ].map((arq) => ({
    arq: relative(RAIZ, arq).replace(/\\/g, '/'),
    linhas: readFileSync(arq, 'utf8').split(/\r?\n/),
  }));

  /** Toda linha que GRAVA `nr13_info_`, no app e nos templates. */
  const gravamInfo = linhasDeArquivo.flatMap(({ arq, linhas }) =>
    linhas
      .map((l, i) => ({ arq, n: i, l }))
      .filter((x) => x.l.includes('nr13_info_') && ESCRITA.test(x.l)),
  );

  it('só três arquivos gravam nr13_info_ — e são os fluxos conhecidos', () => {
    expect([...new Set(gravamInfo.map((g) => g.arq))].sort()).toEqual([
      'src/features/equipamento/equipamentoService.ts',
      'src/features/equipamento/importarPlanilhaService.ts',
      'src/services/demoSeed.ts',
    ]);
  });

  it('em equipamentoService, a gravação que NÃO é criação é só `salvarInfo` (edição)', () => {
    const s = fonte('src/features/equipamento/equipamentoService.ts');
    const noServico = gravamInfo.filter((g) => g.arq.endsWith('equipamentoService.ts'));
    expect(noServico).toHaveLength(2);
    // Uma está em salvarInfo...
    expect(s).toMatch(/export async function salvarInfo\(info: InfoEquipamento\): Promise<void> \{\s*await salvar\(`nr13_info_\$\{info\.tag\}`, info\);/);
    // ...e salvarInfo só é chamada por telas que EDITAM a ficha de um equipamento aberto.
    const chamadores = linhasDeArquivo
      .filter(({ linhas }) => linhas.some((l) => /\bsalvarInfo\(/.test(l) && !l.includes('export async function')))
      .map((a) => a.arq)
      .sort();
    expect(chamadores).toEqual([
      'src/features/equipamento/DadosEquipamento.tsx',
      'src/features/equipamento/PressoesDocumentacao.tsx',
    ]);
  });

  it('toda gravação de CRIAÇÃO tem a unidade gravada IMEDIATAMENTE antes', () => {
    const criacoes = gravamInfo.filter((g) => !g.l.includes('info.tag'));
    expect(criacoes.length).toBe(4); // manual 1 + importação 1 + demo 2
    for (const c of criacoes) {
      const { linhas } = linhasDeArquivo.find((a) => a.arq === c.arq)!;
      const anterior = linhas[c.n - 1];
      expect(anterior, `${c.arq}:${c.n + 1}`).toMatch(/await salvar\(`nr13_pref_unidade_/);
    }
  });
});
