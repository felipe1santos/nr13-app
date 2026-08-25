/**
 * Fase 9 · 9D — a fila precisa retentar sozinha quando NENHUM evento chega.
 *
 * A drenagem automática da v2 escuta `online` e `visibilitychange`. Os dois
 * pressupõem que o navegador PERCEBA a mudança de rede — e em 25/08/2026, na
 * prova offline da 9D, medimos o cenário em que ele não percebe:
 *
 *   · aba em Offline pelo DevTools, `navigator.onLine === true` o tempo todo;
 *   · a rede volta; nenhum evento `online` dispara (nada mudou aos olhos do
 *     navegador);
 *   · a aba já estava visível, então `visibilitychange` também não dispara;
 *   · resultado: a fila ficou parada em 3 pendências com a internet de volta,
 *     e só andou quando alguém clicou no botão da topbar.
 *
 * Em campo não há quem clique: o inspetor fecha o app achando que subiu.
 *
 * A retentativa daqui é a rede de segurança dos dois listeners — e ela só
 * acontece quando há evidência de queda (alguma pendência com `erro.categoria
 * === 'offline'`). Sem isso seria uma requisição periódica eterna, contra a
 * cota de egresso que a Fase 9 existe para proteger.
 */
import { describe, it, expect } from 'vitest';
import { deveRetentar, INTERVALO_RETENTATIVA_MS } from './retentativaRede';
import type { ItemFila } from './sync';

function item(erro?: ItemFila['erro']): ItemFila {
  return {
    mutationId: 'm1',
    op: 'set',
    chave: 'nr13_info_A',
    versaoBase: 1,
    dispositivo: 'd1',
    criadoEm: '2026-08-25T10:00:00.000Z',
    tentativas: 3,
    estado: 'aguardando',
    erro,
  } as ItemFila;
}

const deRede = {
  categoria: 'offline' as const,
  titulo: '',
  explicacao: '',
  acao: null,
  detalhe: {
    codigo: 'TypeError',
    mensagemOriginal: 'Failed to fetch',
    chave: 'nr13_info_A',
    mutationId: 'm1',
    dispositivo: 'd1',
    quando: '',
  },
};

const dePermissao = { ...deRede, categoria: 'permissao' as const };

describe('deveRetentar', () => {
  it('há pendência que falhou por rede e a janela passou: retenta', () => {
    expect(
      deveRetentar({ pendentes: [item(deRede)], desdeUltima: INTERVALO_RETENTATIVA_MS + 1 }),
    ).toBe(true);
  });

  it('dentro da janela, não retenta — retentar a cada tick seria rajada', () => {
    expect(deveRetentar({ pendentes: [item(deRede)], desdeUltima: 1_000 })).toBe(false);
  });

  it('fila vazia nunca retenta: não há o que subir, e requisição custa cota', () => {
    expect(deveRetentar({ pendentes: [], desdeUltima: 10 * 60_000 })).toBe(false);
  });

  it('pendência parada por PERMISSÃO não gera retentativa de rede', () => {
    // Assinatura vencida vai falhar de novo, com ou sem sinal. Retentar em
    // laço é o defeito que a fila já aprendeu a não cometer (`falha_definitiva`).
    expect(deveRetentar({ pendentes: [item(dePermissao)], desdeUltima: 10 * 60_000 })).toBe(false);
  });

  it('pendência ainda NÃO tentada não gera retentativa', () => {
    // Sem `erro` não há evidência de queda; quem acabou de gravar já drenou.
    expect(deveRetentar({ pendentes: [item(undefined)], desdeUltima: 10 * 60_000 })).toBe(false);
  });

  it('a janela é de minutos, não de segundos', () => {
    // Trava do valor: uma janela curta transformaria a rede de segurança numa
    // enxurrada de requisições contra a cota que a Fase 9 protege.
    expect(INTERVALO_RETENTATIVA_MS).toBeGreaterThanOrEqual(30_000);
  });
});
