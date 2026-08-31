/**
 * Fase 9 · 9F.3 — **O TESTE BLOQUEANTE DESTA ETAPA.**
 *
 * ## O risco que ele existe para impedir
 *
 * O histórico de calibrações abrir VAZIO.
 *
 * Tirar o `lerTudo()` de `/calibracoes` significa que o cache passa a ter
 * apenas o que alguém semeou. E esta tela lê QUATRO famílias de chave por
 * equipamento, nenhuma das quais reclama quando falta:
 *
 *   · `listarCalibracoes`  → `?? []`
 *   · `listarComponentes`  → `?? []`
 *   · `listarLotes`        → `?? []`
 *   · o certificado        → `nr13_calibracao_item_<id>`, por id
 *
 * Sem a semeadura, a tela abre com "nenhuma calibração", sem erro no console,
 * sem teste vermelho, sem nada — e o usuário conclui que a calibração sumiu. É
 * o mesmo defeito silencioso da 9F.2, com um agravante: aqui o dado é o
 * certificado de um instrumento de medição, e a ausência dele muda o que um
 * engenheiro assina.
 *
 * ## O cruzamento
 *
 *   chaves que a tela de calibrações LÊ  (serviços + templates de certificado)
 *                        ×
 *   chaves que `carregarEquipamento(tag)` COLOCA no cache
 *
 * Toda chave do primeiro conjunto precisa estar coberta pelo segundo — ou por
 * uma das rotas declaradas abaixo. Família nova lida pela tela, sem cobertura,
 * QUEBRA este teste.
 *
 * ## E a ordem, que é metade do risco
 *
 * `abrirEquipamentoParaCalibracoes` precisa semear ANTES de ler. Inverter
 * produziria exatamente a mesma tela vazia, com a semeadura funcionando
 * perfeitamente — só que tarde demais. O último bloco trava isso.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'VP-TESTE/9F3';
const RAIZ = join(process.cwd(), 'public');

/**
 * As famílias que a TELA de calibrações lê, com o arquivo onde isso acontece.
 * Escritas à mão, e não deduzidas, porque é a lista que um humano confere
 * quando desconfia que algo sumiu.
 */
const FAMILIAS_DA_TELA: Array<{ prefixo: string; onde: string }> = [
  { prefixo: 'nr13_calibracoes_', onde: 'calibracaoService.listarCalibracoes' },
  { prefixo: 'nr13_componentes_cal_', onde: 'componentesService.listarComponentes' },
  { prefixo: 'nr13_lotes_cal_', onde: 'componentesService.listarLotes' },
  { prefixo: 'nr13_info_', onde: 'equipamentoService.montarResumoDoCache' },
  { prefixo: 'nr13_emp_', onde: 'Calibracoes.tsx: proprietarioDe' },
  { prefixo: 'nr13_cat_', onde: 'montarResumoDoCache: categoria do cartão' },
  { prefixo: 'nr13_calc_', onde: 'montarResumoDoCache: PMTA do cartão' },
];

/** Os dois templates de certificado que o visualizador desta tela abre. */
const TEMPLATES_CERTIFICADO = [
  'arquivos-inspecao/CERTIFICADO-CAL-MANOMETRO.html',
  'arquivos-inspecao/CERTIIFCADO-CAL-PSV.html', // o nome tem o erro de digitação de origem
];

/**
 * Chaves que o PRÓPRIO APP escreve no `localStorage` ao montar o documento, ou
 * que são GLOBAIS da organização — não vêm da semeadura por TAG, e não deviam.
 */
const FORA_DA_SEMEADURA_POR_TAG = new Set([
  'nr13_minha_empresa', // global, essencial do boot
  'nr13_relatorio_meta_atual', // escrita pelo app ao montar o documento
  'nr13_injecao_atual', // idem
  'nr13_rastreabilidade', // prefixo truncado do `nr13_rastreab_`; global por org
]);

describe('as chaves que a tela de calibrações lê estão cobertas pela semeadura', () => {
  it('`chavesDoEquipamento` cobre as famílias por TAG que a tela lê', async () => {
    const { chavesDoEquipamento } = await import('../equipamento/equipamentoService');
    const semeadas = new Set(chavesDoEquipamento(TAG));

    const descobertas = FAMILIAS_DA_TELA.filter(
      ({ prefixo }) => !semeadas.has(`${prefixo}${TAG}`),
    );

    expect(
      descobertas,
      `Estas famílias são lidas pela tela e NÃO são semeadas — a tela abriria vazia sem erro:\n` +
        descobertas.map((d) => `  ${d.prefixo}<TAG>  (${d.onde})`).join('\n'),
    ).toEqual([]);
  });

  it('o CERTIFICADO chega pela SEGUNDA passada, e ela depende da lista', async () => {
    // `nr13_calibracao_item_<id>` é por ID, não por TAG: não pode sair de
    // `chavesDoEquipamento`. `carregarEquipamento` a semeia numa segunda
    // passada, montada a partir dos ids que acabou de ler da lista — ou seja, o
    // certificado só chega porque a lista chegou antes. Se alguém trocar a
    // ordem lá dentro, `resolverPdf` devolve nada e o certificado abre em
    // branco, sem erro nenhum.
    const fonte = readFileSync(
      join(process.cwd(), 'src/features/equipamento/equipamentoService.ts'),
      'utf8',
    );
    const corpo = fonte.slice(fonte.indexOf('export async function carregarEquipamento'));
    const fim = corpo.indexOf('\n}');
    const funcao = corpo.slice(0, fim);

    expect(funcao).toContain('nr13_calibracoes_');
    expect(funcao).toContain('nr13_calibracao_item_');
    expect(
      funcao.indexOf('nr13_calibracoes_'),
      'a lista precisa ser lida ANTES de montar as chaves de certificado',
    ).toBeLessThan(funcao.indexOf('nr13_calibracao_item_'));
  });

  it('os templates de certificado não leem nenhuma chave por TAG descoberta', async () => {
    const { chavesDoEquipamento } = await import('../equipamento/equipamentoService');
    const semeadas = new Set(chavesDoEquipamento(TAG));

    const descobertas: string[] = [];
    for (const arquivo of TEMPLATES_CERTIFICADO) {
      const html = readFileSync(join(RAIZ, arquivo), 'utf8');
      for (const token of new Set(html.match(/nr13_[a-z0-9_]+/g) ?? [])) {
        if (FORA_DA_SEMEADURA_POR_TAG.has(token)) continue;
        // Prefixo por ID: coberto pelo bloco anterior.
        if (token === 'nr13_calibracao_item_') continue;
        if (semeadas.has(`${token}${TAG}`) || semeadas.has(token)) continue;
        descobertas.push(`${arquivo}: ${token}`);
      }
    }

    expect(
      descobertas,
      'Chave nova num template de certificado, sem cobertura na semeadura:\n' +
        descobertas.join('\n'),
    ).toEqual([]);
  });
});

describe('a ORDEM: semear antes de ler', () => {
  const ordem: string[] = [];

  beforeEach(() => {
    ordem.length = 0;
    vi.resetModules();
  });

  it('`carregarEquipamento` roda ANTES de qualquer leitura do cache', async () => {
    vi.doMock('../equipamento/equipamentoService', () => ({
      carregarEquipamento: vi.fn(async () => {
        ordem.push('semear');
      }),
      montarResumoDoCache: vi.fn(() => {
        ordem.push('ler:resumo');
        return null;
      }),
    }));
    vi.doMock('./calibracaoService', () => ({
      listarCalibracoes: vi.fn(() => {
        ordem.push('ler:calibracoes');
        return [];
      }),
    }));
    vi.doMock('./componentesService', () => ({
      listarComponentes: vi.fn(() => {
        ordem.push('ler:componentes');
        return [];
      }),
      listarLotes: vi.fn(() => {
        ordem.push('ler:lotes');
        return [];
      }),
    }));

    const { abrirEquipamentoParaCalibracoes } = await import('./catalogoCalibracoes');
    await abrirEquipamentoParaCalibracoes(TAG);

    expect(ordem[0]).toBe('semear');
    expect(ordem).toContain('ler:calibracoes');
    expect(ordem).toContain('ler:componentes');
    expect(ordem).toContain('ler:lotes');
    expect(ordem.indexOf('semear')).toBeLessThan(ordem.indexOf('ler:calibracoes'));
  });

  it('falha de rede na semeadura NÃO derruba a tela — segue com o cache', async () => {
    vi.doMock('../equipamento/equipamentoService', () => ({
      carregarEquipamento: vi.fn(async () => {
        throw new Error('offline');
      }),
      montarResumoDoCache: vi.fn(() => null),
    }));
    vi.doMock('./calibracaoService', () => ({
      listarCalibracoes: vi.fn(() => [{ id: 'c1' }]),
    }));
    vi.doMock('./componentesService', () => ({
      listarComponentes: vi.fn(() => []),
      listarLotes: vi.fn(() => []),
    }));

    const { abrirEquipamentoParaCalibracoes } = await import('./catalogoCalibracoes');
    const aberto = await abrirEquipamentoParaCalibracoes(TAG);

    // Derrubar a navegação por causa da rede transformaria uma tela degradada
    // numa tela quebrada — e o que já está no aparelho continua valendo.
    expect(aberto.calibracoes).toHaveLength(1);
  });
});

describe('deveHidratarListaLegada', () => {
  it('com a flag LIGADA, ninguém hidrata a organização inteira', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoCalibracoes');
    expect(deveHidratarListaLegada(true)).toBe(false);
  });

  it('com a flag DESLIGADA, a tela antiga hidrata como sempre fez', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoCalibracoes');
    expect(deveHidratarListaLegada(false)).toBe(true);
  });
});
