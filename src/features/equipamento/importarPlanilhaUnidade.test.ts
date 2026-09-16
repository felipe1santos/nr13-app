/**
 * IMPORTAÇÃO DE PLANILHA: TODO EQUIPAMENTO NASCE COM UNIDADE — 16/09/2026.
 *
 * A criação manual grava `nr13_pref_unidade_<TAG>` desde a manhã deste dia. A
 * importação não gravava: o equipamento importado só "era SI" pelo recuo
 * `|| 'SI'` dos leitores — o mesmo de um equipamento LEGADO que nunca escolheu
 * nada. Agora a unidade é do LOTE, escolhida na revisão e gravada em cada
 * equipamento criado.
 *
 * O que este arquivo prova, com a planilha passando pelo parser de verdade:
 *   · lote SI, Técnico e Petrobras gravam a chave oficial em cada equipamento;
 *   · a unidade é gravada ANTES do `nr13_info_` — nunca existe equipamento sem ela;
 *   · unidade inválida não grava NADA;
 *   · linha inválida não cria nada parcialmente;
 *   · repetir não duplica e não troca a unidade;
 *   · equipamento legado sem a chave continua em SI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  dados: new Map<string, unknown>(),
  gravacoes: [] as string[],
  falharEm: null as string | null,
}));

vi.mock('../../services/storage', () => ({
  ler: (chave: string) => (banco.dados.has(chave) ? banco.dados.get(chave) : null),
  lerTudo: async () => ({}),
  salvar: async (chave: string, valor: unknown) => {
    if (banco.falharEm === chave) throw new Error('recusado pelo servidor');
    banco.gravacoes.push(chave);
    banco.dados.set(chave, valor);
  },
}));

vi.mock('../../services/auth', () => ({ isTrial: () => false }));
vi.mock('../../services/trial', () => ({ MSG_BLOQUEIO_IMPORTACAO: 'bloqueado no trial' }));
vi.mock('../../services/eventos', () => ({ emitirAviso: () => {} }));

import { analisarPlanilha, importarLinhas, unidadeDeLoteValida } from './importarPlanilhaService';
import { unidadeValida, type SistemaUnidade } from '../../calc/unidades';

const RAIZ = resolve(__dirname, '../../..');
const semProgresso = () => {};

/** Uma planilha CSV de verdade, lida pelo mesmo parser do produto. */
function planilha(linhas: string[][]): File {
  const cab = ['tag', 'tipo', 'fabricante', 'numero_serie', 'ano', 'cliente'];
  const csv = [cab, ...linhas].map((l) => l.join(',')).join('\n');
  return new File([csv], 'lote.csv', { type: 'text/csv' });
}

const linha = (tag: string, tipo = 'vaso') => [tag, tipo, 'Fab ZZ', 'SN-1', '2020', 'Cliente ZZ'];

beforeEach(() => {
  banco.dados.clear();
  banco.gravacoes = [];
  banco.falharEm = null;
});

describe('o lote grava a unidade oficial em cada equipamento', () => {
  const casos: Array<[SistemaUnidade, string]> = [
    ['SI', 'SI'],
    ['TECNICO', 'TEC'],
    ['PETROBRAS', 'BAR'],
  ];

  for (const [unidade, sufixo] of casos) {
    it(`lote ${unidade}: as duas linhas nascem com ${unidade} gravada`, async () => {
      const analise = await analisarPlanilha(
        planilha([linha(`ZZ-IMP-${sufixo}-1`), linha(`ZZ-IMP-${sufixo}-2`, 'caldeira')]),
      );
      expect(analise.validas).toHaveLength(2);

      const r = await importarLinhas(analise.validas, unidade, semProgresso);

      expect(r.criados).toEqual([`ZZ-IMP-${sufixo}-1`, `ZZ-IMP-${sufixo}-2`]);
      for (const tag of r.criados) {
        expect(banco.dados.get(`nr13_pref_unidade_${tag}`)).toBe(unidade);
        expect(banco.dados.get(`nr13_info_${tag}`)).not.toBeUndefined();
      }
    });
  }

  it('a unidade é gravada ANTES do nr13_info_ — nunca existe equipamento sem ela', async () => {
    const analise = await analisarPlanilha(planilha([linha('ZZ-IMP-ORDEM')]));
    await importarLinhas(analise.validas, 'TECNICO', semProgresso);
    const iUnidade = banco.gravacoes.indexOf('nr13_pref_unidade_ZZ-IMP-ORDEM');
    const iInfo = banco.gravacoes.indexOf('nr13_info_ZZ-IMP-ORDEM');
    expect(iUnidade).toBeGreaterThanOrEqual(0);
    expect(iUnidade).toBeLessThan(iInfo);
  });

  it('a unidade não converte nada: a PMTA da planilha continua em MPa', async () => {
    const csv = 'tag,tipo,fabricante,numero_serie,ano,cliente,pmta\nZZ-IMP-PMTA,vaso,F,S,2020,C,1.05';
    const analise = await analisarPlanilha(new File([csv], 'lote.csv'));
    await importarLinhas(analise.validas, 'PETROBRAS', semProgresso);
    const info = banco.dados.get('nr13_info_ZZ-IMP-PMTA') as { pmtaAdotadaMpa?: string };
    expect(info.pmtaAdotadaMpa).toBe('1.05');
  });
});

describe('importação inválida não cria nada parcialmente', () => {
  it.each([['KPA'], [''], [undefined], ['si']])('unidade %s é recusada antes de gravar', async (u) => {
    const analise = await analisarPlanilha(planilha([linha('ZZ-IMP-INV')]));
    await expect(
      importarLinhas(analise.validas, u as unknown as SistemaUnidade, semProgresso),
    ).rejects.toThrow(/unidade de medida/i);
    expect(banco.gravacoes).toEqual([]);
  });

  it('só as três oficiais passam na validação do lote', () => {
    expect(['SI', 'TECNICO', 'PETROBRAS'].every(unidadeDeLoteValida)).toBe(true);
    expect(['MPa', 'bar', 'toString', '__proto__'].some(unidadeDeLoteValida)).toBe(false);
  });

  it('linha rejeitada na análise não grava chave nenhuma', async () => {
    const analise = await analisarPlanilha(planilha([linha('ZZ-IMP-OK'), linha('ZZ-IMP-RUIM', 'tanque')]));
    expect(analise.rejeitadas.map((r) => r.tag)).toEqual(['ZZ-IMP-RUIM']);

    await importarLinhas(analise.validas, 'SI', semProgresso);

    expect(banco.gravacoes.some((c) => c.endsWith('ZZ-IMP-RUIM'))).toBe(false);
    expect(banco.dados.get('nr13_pref_unidade_ZZ-IMP-OK')).toBe('SI');
  });

  it('falha no meio de uma linha não deixa equipamento sem unidade', async () => {
    const analise = await analisarPlanilha(planilha([linha('ZZ-IMP-A'), linha('ZZ-IMP-B')]));
    banco.falharEm = 'nr13_info_ZZ-IMP-A';

    const r = await importarLinhas(analise.validas, 'TECNICO', semProgresso);

    expect(r.criados).toEqual(['ZZ-IMP-B']);
    expect(r.falhas.map((f) => f.tag)).toEqual(['ZZ-IMP-A']);
    expect(banco.dados.has('nr13_info_ZZ-IMP-A')).toBe(false);
    // Invariante: TODO nr13_info_ gravado tem a unidade ao lado.
    for (const chave of banco.dados.keys()) {
      if (chave.startsWith('nr13_info_')) {
        const tag = chave.slice('nr13_info_'.length);
        expect(banco.dados.get(`nr13_pref_unidade_${tag}`), tag).toBe('TECNICO');
      }
    }
  });
});

describe('repetir não duplica nem troca a unidade', () => {
  it('retry com a MESMA análise e OUTRA unidade: pula tudo, unidade intacta', async () => {
    const analise = await analisarPlanilha(planilha([linha('ZZ-IMP-R1'), linha('ZZ-IMP-R2')]));
    await importarLinhas(analise.validas, 'PETROBRAS', semProgresso);
    const antes = [...banco.gravacoes];

    const segunda = await importarLinhas(analise.validas, 'SI', semProgresso);

    expect(segunda.criados).toEqual([]);
    expect(segunda.falhas.map((f) => f.motivo)).toEqual(['TAG já cadastrada no sistema', 'TAG já cadastrada no sistema']);
    expect(banco.gravacoes).toEqual(antes); // nenhuma gravação nova
    expect(banco.dados.get('nr13_pref_unidade_ZZ-IMP-R1')).toBe('PETROBRAS');
    expect(banco.dados.get('nr13_pref_unidade_ZZ-IMP-R2')).toBe('PETROBRAS');
  });

  it('reenviar a mesma planilha: a análise já marca como TAG cadastrada', async () => {
    const arquivo = () => planilha([linha('ZZ-IMP-S1')]);
    const primeira = await analisarPlanilha(arquivo());
    await importarLinhas(primeira.validas, 'TECNICO', semProgresso);

    const segunda = await analisarPlanilha(arquivo());
    expect(segunda.validas).toHaveLength(0);
    expect(segunda.duplicadas.map((d) => d.motivo)).toEqual(['TAG já cadastrada no sistema']);
  });
});

describe('o parque antigo não é tocado', () => {
  it('equipamento legado sem a chave continua em SI pelo recuo — sem backfill', () => {
    banco.dados.set('nr13_info_ZZ-LEGADO', { tag: 'ZZ-LEGADO', tipo: 'vaso' });
    const gravada = banco.dados.get('nr13_pref_unidade_ZZ-LEGADO') as string | undefined;
    expect(gravada).toBeUndefined();
    expect(unidadeValida(gravada)).toBe('SI');
  });
});

describe('a tela pede a unidade do lote antes de confirmar', () => {
  const modal = readFileSync(resolve(RAIZ, 'src/features/equipamento/ModalImportarPlanilha.tsx'), 'utf8');

  it('campo obrigatório com as três opções oficiais', () => {
    expect(modal).toContain('Unidade de medida dos equipamentos deste lote *');
    expect(modal).toContain('(Object.keys(FATORES_CONVERSAO) as SistemaUnidade[])');
    expect(modal).toContain('rotuloSistemaCompleto(u)');
  });

  it('a unidade escolhida é a que vai para o serviço', () => {
    expect(modal).toContain('importarLinhas(analise.validas, unidadeLote,');
  });

  it('o campo está na etapa de REVISÃO, antes do botão de importar', () => {
    const revisao = modal.indexOf("{fase === 'revisao' && analise && (");
    const campo = modal.indexOf('Unidade de medida dos equipamentos deste lote');
    const importando = modal.indexOf("{fase === 'importando' && (");
    expect(revisao).toBeGreaterThan(0);
    expect(campo).toBeGreaterThan(revisao);
    expect(campo).toBeLessThan(importando);
  });
});
