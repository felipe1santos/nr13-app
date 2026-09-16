/**
 * A UNIDADE SE ESCOLHE NA CRIAÇÃO, E SÓ NELA — 16/09/2026.
 *
 * ## A regra
 *
 * A unidade de medida é característica do equipamento: escolhida no cadastro,
 * fixa daí em diante. Ela decide em que unidade a ficha RECEBE pressões e em
 * que unidade o relatório SAI — trocá-la depois reinterpreta o que já foi
 * documentado.
 *
 * ## O que ainda a alterava
 *
 * O cartão perdeu o seletor mais cedo no mesmo dia, mas a FICHA seguia com um
 * `<select>` de "pré-visualização" e um botão "Salvar" que chamava
 * `salvarUnidade(tag, unidade)` e regravava `nr13_pref_unidade_<TAG>`. Era o
 * último caminho de UI capaz de mudar a unidade de um equipamento existente.
 *
 * ## O que este arquivo trava
 *
 *   · a criação grava as três unidades (comportamento, não só texto);
 *   · só os fluxos de CRIAÇÃO gravam a chave — `criarEquipamento` (manual) e
 *     `importarLinhas` (planilha, com a unidade do lote), e nenhum outro;
 *   · a ficha mostra a unidade como TEXTO: sem select, sem select desabilitado,
 *     sem botão;
 *   · o componente do seletor e a função de gravar não existem mais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const gravacoes = vi.hoisted(() => ({ lista: [] as Array<[string, unknown]> }));

vi.mock('../../services/storage', async () => {
  const real = await vi.importActual<typeof import('../../services/storage')>('../../services/storage');
  return {
    ...real,
    salvar: vi.fn(async (chave: string, valor: unknown) => {
      gravacoes.lista.push([chave, valor]);
    }),
  };
});

vi.mock('../../services/limiteTrial', () => ({
  podeCriarEquipamentoAgora: vi.fn(async () => ({ permitido: true, motivo: '' })),
}));

import { criarEquipamento } from './equipamentoService';
import type { SistemaUnidade } from '../../calc/unidades';

const RAIZ = resolve(__dirname, '../../..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

/** Todos os arquivos de código (sem testes) sob uma pasta. */
function arquivos(dir: string, extensoes: string[]): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules') continue;
      saida.push(...arquivos(caminho, extensoes));
    } else if (extensoes.some((e) => nome.endsWith(e)) && !/\.test\.(ts|tsx|mjs)$/.test(nome)) {
      saida.push(caminho);
    }
  }
  return saida;
}

/** Uma linha que GRAVA (e não só lê) — nos dois mundos: app e templates. */
const ESCRITA = /\b(salvar|setItem|sbSalvar|gravarAtomico|aplicarMutacao\w*)\s*\(/;

beforeEach(() => {
  gravacoes.lista = [];
});

describe('a criação é o fluxo que grava a unidade', () => {
  const casos: SistemaUnidade[] = ['SI', 'TECNICO', 'PETROBRAS'];

  for (const u of casos) {
    it(`criar em ${u} grava ${u}`, async () => {
      await criarEquipamento(`ZZ-CRIA-${u}`, 'vaso', '', u);
      expect(gravacoes.lista).toContainEqual([`nr13_pref_unidade_ZZ-CRIA-${u}`, u]);
    });
  }

  it('sem unidade informada a criação é RECUSADA — o recuo SI é só do legado', async () => {
    await expect(
      criarEquipamento('ZZ-CRIA-PADRAO', 'vaso', '', undefined as unknown as SistemaUnidade),
    ).rejects.toThrow(/unidade de medida/i);
    expect(gravacoes.lista).toEqual([]);
  });
});

describe('só a CRIAÇÃO escreve `nr13_pref_unidade_` no sistema inteiro', () => {
  const candidatos = [
    ...arquivos(resolve(RAIZ, 'src'), ['.ts', '.tsx']),
    ...arquivos(resolve(RAIZ, 'public'), ['.html', '.js']),
  ];

  const escritores = candidatos.flatMap((arq) =>
    readFileSync(arq, 'utf8')
      .split(/\r?\n/)
      .map((linha, i) => ({ arq: relative(RAIZ, arq).replace(/\\/g, '/'), linha, n: i + 1 }))
      .filter((l) => l.linha.includes('pref_unidade') && ESCRITA.test(l.linha)),
  );

  it('só os três fluxos de CRIAÇÃO escrevem: manual, importação e demonstração', () => {
    // A importação e a demonstração entraram em 16/09/2026: todo equipamento novo
    // nasce com a unidade gravada, em vez de depender do recuo SI dos leitores.
    expect([...new Set(escritores.map((e) => e.arq))].sort()).toEqual([
      'src/features/equipamento/equipamentoService.ts',
      'src/features/equipamento/importarPlanilhaService.ts',
      'src/services/demoSeed.ts',
    ]);
  });

  it('a gravação da importação está DENTRO de `importarLinhas`, depois da guarda de TAG existente', () => {
    const s = fonte('src/features/equipamento/importarPlanilhaService.ts');
    const ini = s.indexOf('export async function importarLinhas(');
    const corpo = s.slice(ini, s.indexOf('\n}', ini));
    const guarda = corpo.indexOf("if (ler<InfoEquipamento>(`nr13_info_${item.tag}`) !== null)");
    const grava = corpo.indexOf('await salvar(`nr13_pref_unidade_${item.tag}`, unidade);');
    expect(guarda).toBeGreaterThan(0);
    expect(grava).toBeGreaterThan(guarda);
  });

  it('e essa gravação está DENTRO de `criarEquipamento`', () => {
    const s = fonte('src/features/equipamento/equipamentoService.ts');
    const ini = s.indexOf('export async function criarEquipamento(');
    const fim = s.indexOf('\n}', ini);
    const corpo = s.slice(ini, fim);
    expect(corpo).toContain('await salvar(`nr13_pref_unidade_${tag}`, unidade);');
  });

  it('`salvarUnidade` não existe mais em lugar nenhum do código', () => {
    const usos = candidatos.filter((arq) => {
      const codigo = readFileSync(arq, 'utf8')
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      return /\bsalvarUnidade\b/.test(codigo);
    });
    expect(usos).toEqual([]);
  });

  it('o componente do seletor foi removido', () => {
    expect(existsSync(resolve(RAIZ, 'src/features/equipamento/SeletorUnidade.tsx'))).toBe(false);
  });
});

describe('a ficha mostra a unidade, e não deixa trocá-la', () => {
  const ficha = fonte('src/pages/Equipamento.tsx');

  it('sem select — nem habilitado, nem desabilitado', () => {
    expect(ficha).not.toContain('<select');
    expect(ficha).not.toContain('SeletorUnidade');
  });

  it('sem estado de prévia e sem botão de salvar unidade', () => {
    expect(ficha).not.toContain('setUnidade');
    expect(ficha).not.toContain('unidadeSalva');
    expect(ficha).not.toContain('salvarUnidade');
    expect(ficha).not.toContain('Unidade fixada');
  });

  it('a unidade aparece como TEXTO, com o mesmo rótulo do cadastro e do cartão', () => {
    expect(ficha).toContain('unidade-equip-valor');
    expect(ficha).toContain('{rotuloSistemaCompleto(unidade)}');
  });

  it('a unidade é a GRAVADA, lida uma vez', () => {
    expect(ficha).toContain('const unidade: SistemaUnidade = carregarUnidade(tag);');
  });

  it('o CSS do seletor e do botão saiu junto', () => {
    const css = fonte('src/pages/equipamento-page.css');
    expect(css).not.toContain('.seletor-unidade');
    expect(css).not.toContain('.btn-salvar-unidade');
  });
});
