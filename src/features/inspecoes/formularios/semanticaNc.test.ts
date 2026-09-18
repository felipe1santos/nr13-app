import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PERGUNTA_NC,
  SEMANTICA_NC_ATUAL,
  TOM_NC,
  carimboInicial,
  itensNcSemObservacao,
  precisaConfirmarSemantica,
  resultadoNcDerivado,
} from './semanticaNc';
import { validarParaFinalizar } from '../../relatorios/validacaoFinalizacao';

/**
 * Revisão do engenheiro (18/09/2026) · "FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?"
 *
 * No documento, SIM = não conformidade encontrada. No celular a pergunta não
 * aparecia e o visualizador pintava SIM de verde. Estes testes travam:
 * a pergunta na tela, a cor, a resposta geral DERIVADA (sem booleano próprio),
 * e o registro antigo que não é reinterpretado em silêncio.
 */

describe('a resposta geral é DERIVADA dos itens', () => {
  it('qualquer SIM → SIM, com os números dos itens', () => {
    expect(resultadoNcDerivado(['nao', 'sim', '', 'sim'])).toMatchObject({ resposta: 'SIM', itensNc: [2, 4] });
  });

  it('nenhum SIM e todos respondidos → NÃO', () => {
    expect(resultadoNcDerivado(['nao', 'na', 'nao']).resposta).toBe('NÃO');
  });

  it('todos N.A. → N.A.', () => {
    expect(resultadoNcDerivado(['na', 'na']).resposta).toBe('N.A.');
  });

  it('nenhum SIM mas item em branco → não afirma NÃO', () => {
    expect(resultadoNcDerivado(['nao', '', 'nao']).resposta).toBeNull();
  });

  it('não existe booleano geral gravado nos formulários', () => {
    for (const arq of ['FormularioVisualExterno', 'FormularioVisualInterno']) {
      const src = readFileSync(`src/features/inspecoes/formularios/${arq}.tsx`, 'utf8');
      expect(src).not.toMatch(/\b(naoConformidadeEncontrada|ncGeral|temNaoConformidade)\b/);
    }
  });
});

describe('registro antigo não é reinterpretado em silêncio', () => {
  it('com respostas e sem carimbo → precisa de revisão', () => {
    expect(precisaConfirmarSemantica({ itens: { '1': 'sim' } })).toBe(true);
  });

  it('carimbado → não precisa', () => {
    expect(precisaConfirmarSemantica({ itens: { '1': 'sim' }, semanticaNc: SEMANTICA_NC_ATUAL })).toBe(false);
  });

  it('sem resposta nenhuma → nada a revisar', () => {
    expect(precisaConfirmarSemantica({ itens: {} })).toBe(false);
    expect(precisaConfirmarSemantica(null)).toBe(false);
  });

  it('o formulário abre registro novo/vazio JÁ carimbado, e antigo com respostas SEM carimbo', () => {
    expect(carimboInicial(null)).toBe(SEMANTICA_NC_ATUAL);
    expect(carimboInicial({ itens: { '1': '' } })).toBe(SEMANTICA_NC_ATUAL);
    expect(carimboInicial({ itens: { '1': 'nao' } })).toBeUndefined();
    expect(carimboInicial({ itens: { '1': 'nao' }, semanticaNc: 1 })).toBe(SEMANTICA_NC_ATUAL);
  });

  it('o carimbo só vem de confirmação explícita, nunca do padrão do formulário', () => {
    for (const arq of ['FormularioVisualExterno', 'FormularioVisualInterno']) {
      const src = readFileSync(`src/features/inspecoes/formularios/${arq}.tsx`, 'utf8');
      expect(src).toContain('semanticaNc: carimboInicial(salvo)');
      expect(src).toContain('<AvisoRevisaoNc aoConfirmar={confirmarSemantica} />');
    }
  });
});

describe('item com não conformidade pede observação', () => {
  it('lista os itens SIM sem descrição', () => {
    expect(itensNcSemObservacao({ itens: { '1': 'sim', '2': 'sim', '3': 'nao' }, itemObs: { '2': 'trinca' } }, 3)).toEqual([1]);
  });
});

describe('a TELA mostra a pergunta e não pinta SIM de verde', () => {
  it('os dois formulários renderizam o cabeçalho com a pergunta', () => {
    for (const arq of ['FormularioVisualExterno', 'FormularioVisualInterno']) {
      const src = readFileSync(`src/features/inspecoes/formularios/${arq}.tsx`, 'utf8');
      expect(src).toContain('<CabecalhoNaoConformidade');
      expect(src).toContain('<ItemNaoConformidade');
    }
    const comp = readFileSync('src/features/inspecoes/formularios/ExameNaoConformidade.tsx', 'utf8');
    expect(comp).toContain('{PERGUNTA_NC}');
    expect(PERGUNTA_NC).toBe('Foi encontrada alguma não conformidade?');
  });

  it('SIM tem tom de perigo e NÃO de conforme — nas cores do design system', () => {
    expect(TOM_NC).toEqual({ sim: 'perigo', nao: 'ok', na: 'neutro' });
    const css = readFileSync('src/features/inspecoes/formularios.css', 'utf8');
    const perigo = css.slice(css.indexOf('.resposta-seg-btn.ativa.tom-perigo'), css.indexOf('.resposta-seg-btn.ativa.tom-ok'));
    expect(perigo).toContain('var(--crit');
    expect(perigo).not.toContain('--ok');
  });

  it('o visualizador desktop usa o badge de NÃO CONFORMIDADE nos exames, e não o do checklist', () => {
    const src = readFileSync('src/features/inspecoes/VisualizadorFormulario.tsx', 'utf8');
    const visual = src.slice(src.indexOf('function ViewVisual('));
    expect(visual).toContain('<BadgeNc val={val} />');
    expect(visual.slice(0, visual.indexOf('// ── ULTRASSOM') > 0 ? visual.indexOf('// ── ULTRASSOM') : 4000)).not.toContain('<BadgeResposta');
    const badge = src.slice(src.indexOf('function BadgeNc('), src.indexOf('function ViewVisual('));
    // SIM → crit, nunca verde
    expect(badge).toMatch(/val === 'sim'\s*\?\s*\{ bg: 'var\(--crit-bg\)'/);
  });

  it('o visualizador não tem mais cópia própria dos itens', () => {
    const src = readFileSync('src/features/inspecoes/VisualizadorFormulario.tsx', 'utf8');
    expect(src).toContain('const ITENS_VE = ITENS_VISUAL_EXTERNO;');
    expect(src).not.toContain("'Juntas, conexões e vedações'");
  });
});

describe('a finalização cobra revisão e descrição', () => {
  const base = {
    meta: { codigo: 'R', emissao: '18/09/2026', tipoInspecao: 'Periódica', phNome: 'ENG' } as never,
    documentos: ['VISUAL-EXTERNO.html', 'VISUAL-INTERNO.html'],
    laudo: null,
  };

  it('exame antigo com respostas e sem carimbo BLOQUEIA', () => {
    const r = validarParaFinalizar({
      ...base,
      dadosContainer: { visual_externo: { itens: { '1': 'sim' }, itemObs: { '1': 'x' } } },
    });
    expect(r.podeFinalizar).toBe(false);
    expect(r.obrigatorios.map((p) => p.campo)).toContain('visual_externo.semanticaNc');
  });

  it('carimbado e com descrição passa', () => {
    const r = validarParaFinalizar({
      ...base,
      dadosContainer: { visual_externo: { semanticaNc: 1, itens: { '1': 'sim' }, itemObs: { '1': 'trinca na solda' } } },
    });
    expect(r.obrigatorios.map((p) => p.campo)).not.toContain('visual_externo.semanticaNc');
    expect(r.obrigatorios.map((p) => p.campo)).not.toContain('visual_externo.ncSemObservacao');
  });

  it('SIM sem descrição BLOQUEIA e diz quais itens', () => {
    const r = validarParaFinalizar({
      ...base,
      dadosContainer: { visual_interno: { semanticaNc: 1, itens: { '2': 'sim', '5': 'sim' }, itemObs: { '5': 'pite' } } },
    });
    const p = r.obrigatorios.find((x) => x.campo === 'visual_interno.ncSemObservacao');
    expect(p?.texto).toContain('item 2');
  });

  it('a descrição escrita NO DOCUMENTO (override) vale', () => {
    const r = validarParaFinalizar({
      ...base,
      dadosContainer: { visual_interno: { semanticaNc: 1, itens: { '2': 'sim' } } },
      overrides: { 'exameInterno.item-2.obs': { modo: 'manual', valor: 'corrosão', auto: '', em: '2026-09-18' } } as never,
    });
    expect(r.obrigatorios.map((x) => x.campo)).not.toContain('visual_interno.ncSemObservacao');
  });

  it('exame fora do relatório não é cobrado', () => {
    const r = validarParaFinalizar({
      ...base,
      documentos: ['CAPA.html'],
      dadosContainer: { visual_externo: { itens: { '1': 'sim' } } },
    });
    expect(r.obrigatorios.map((p) => p.campo)).not.toContain('visual_externo.semanticaNc');
  });
});
