import { describe, expect, it } from 'vitest';
import { alvoLegadoDaUrl, modoRelatorios, urlDoLegado } from './rotaRelatorios';

/**
 * Fase 9 · 9E.5 — a rota de `/relatorios` sob a flag.
 *
 * O defeito que bloqueou o rollout de 25/08/2026 mora aqui: com `busca_v9`
 * ligada, `/relatorios` renderizava a V9 SEMPRE, e um link para a tela legada
 * simplesmente re-renderizava a tela nova. Estas regras são a saída — e são
 * função pura de propósito, porque a tela não tem como ser testada neste
 * ambiente (`environment: 'node'`, sem DOM).
 */
describe('modoRelatorios', () => {
  it('flag desligada = tela legada, como sempre foi', () => {
    expect(modoRelatorios(false, '')).toBe('legado');
    expect(modoRelatorios(false, '?q=vaso')).toBe('legado');
  });

  it('flag ligada = tela nova', () => {
    expect(modoRelatorios(true, '')).toBe('v9');
    expect(modoRelatorios(true, '?q=vaso')).toBe('v9');
  });

  it('`legado=1` na URL abre a tela antiga MESMO com a flag ligada', () => {
    // É a saída de emergência para o relatório sem arquivo arquivado: só a tela
    // antiga sabe remontá-lo. Sem isto, a flag transforma esse documento em
    // inalcançável — que é exatamente o defeito do passo 11.
    expect(modoRelatorios(true, '?legado=1&tag=VASO-01&rel=r-9')).toBe('legado');
  });

  it('só o valor `1` vale — qualquer outro texto não desvia a rota', () => {
    expect(modoRelatorios(true, '?legado=0')).toBe('v9');
    expect(modoRelatorios(true, '?legado=talvez')).toBe('v9');
  });
});

describe('alvoLegadoDaUrl', () => {
  it('devolve a TAG e o relatório pedidos', () => {
    expect(alvoLegadoDaUrl('?legado=1&tag=VASO-01&rel=rel-9')).toEqual({ tag: 'VASO-01', rel: 'rel-9' });
  });

  it('TAG sozinha vale: leva ao histórico daquele equipamento', () => {
    // Chegar no histórico da TAG certa é um destino útil. Exigir os dois
    // parâmetros faria o link cair na lista de equipamentos, que é onde o
    // usuário já estava.
    expect(alvoLegadoDaUrl('?legado=1&tag=VASO-01')).toEqual({ tag: 'VASO-01', rel: null });
  });

  it('sem TAG não há alvo', () => {
    expect(alvoLegadoDaUrl('?legado=1&rel=rel-9')).toBeNull();
    expect(alvoLegadoDaUrl('')).toBeNull();
  });

  it('decodifica a TAG — elas têm espaço e barra', () => {
    expect(alvoLegadoDaUrl('?tag=VASO%20A23&rel=r%2F1')).toEqual({ tag: 'VASO A23', rel: 'r/1' });
  });
});

describe('urlDoLegado', () => {
  it('carrega a marca da rota e os dois parâmetros, escapados', () => {
    expect(urlDoLegado('VASO A23', 'rel/9')).toBe(
      '/relatorios?legado=1&tag=VASO%20A23&rel=rel%2F9',
    );
  });
});
