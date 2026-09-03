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
  // 9G.3 · a flag `busca_v9` saiu da assinatura. A rota agora depende SÓ da URL.
  it('sem parâmetro = tela nova, que virou a entrada única', () => {
    expect(modoRelatorios('')).toBe('v9');
    expect(modoRelatorios('?q=vaso')).toBe('v9');
  });

  it('`legado=1` na URL abre a tela antiga — e essa saída NÃO foi removida', () => {
    // Relatório anterior ao §7-quater não tem PDF arquivado, e remontá-lo é
    // coisa que só a tela antiga sabe fazer. Apagar esta saída junto com a flag
    // transformaria esse documento em inalcançável — o defeito do passo 11, que
    // a remoção da 9G.3 não pode reintroduzir.
    expect(modoRelatorios('?legado=1&tag=VASO-01&rel=r-9')).toBe('legado');
  });

  it('só o valor `1` vale — qualquer outro texto não desvia a rota', () => {
    expect(modoRelatorios('?legado=0')).toBe('v9');
    expect(modoRelatorios('?legado=talvez')).toBe('v9');
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
