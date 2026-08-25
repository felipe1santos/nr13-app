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

/**
 * O CICLO, no relógio — por que a observação em produção marcou ~74 s.
 *
 * Em 25/08/2026 a fila drenou sozinha e a medição registrou "~74 s após a volta
 * da rede". A janela é de 45 s, então o número merecia explicação. Ela é de
 * MEDIÇÃO, não de mecanismo:
 *
 *   · o relógio da retentativa NÃO começa quando a rede volta — ele já estava
 *     correndo. Enquanto a aba esteve offline, cada ciclo tentou drenar, falhou
 *     e reiniciou a janela. Na volta da rede, o tempo restante do ciclo em
 *     andamento era qualquer valor entre 0 e 45 s;
 *   · a decisão só é avaliada no tick do selo, de 4 s em 4 s;
 *   · logo, o teto real entre a volta da rede e a drenagem é JANELA + TICK ≈
 *     49 s — e a leitura de 74 s foi apenas o instante em que alguém OLHOU:
 *     entre a instalação da testemunha (14:54:40) e a conferência (14:55:54)
 *     não houve medição intermediária.
 *
 * Estes testes travam o que importa: o teto não cresce, o ciclo não para, e
 * nenhuma espera aumenta a cada tentativa.
 */
describe('o ciclo de retentativa no relógio', () => {
  const TICK = 4_000;

  /** Roda o laço do selo por `duracao` ms e devolve os instantes de retentativa. */
  function simular(duracao: number, temEvidencia: (t: number) => boolean): number[] {
    const quando: number[] = [];
    let ultima = 0;
    for (let t = 0; t <= duracao; t += TICK) {
      const pendentes = temEvidencia(t) ? [item(deRede)] : [];
      if (deveRetentar({ pendentes, desdeUltima: t - ultima })) {
        quando.push(t);
        ultima = t;
      }
    }
    return quando;
  }

  it('entre duas retentativas nunca passa de JANELA + TICK', () => {
    const quando = simular(10 * 60_000, () => true);
    const intervalos = quando.slice(1).map((t, i) => t - quando[i]);

    expect(intervalos.length).toBeGreaterThan(10);
    for (const dt of intervalos) {
      expect(dt).toBeGreaterThanOrEqual(INTERVALO_RETENTATIVA_MS);
      expect(dt).toBeLessThanOrEqual(INTERVALO_RETENTATIVA_MS + TICK);
    }
  });

  it('a espera NÃO cresce a cada tentativa — não há backoff escondido', () => {
    // Um backoff exponencial faria a fila de campo esperar minutos, depois
    // horas. O primeiro intervalo tem de ser igual ao último.
    const quando = simular(10 * 60_000, () => true);
    const intervalos = quando.slice(1).map((t, i) => t - quando[i]);
    expect(intervalos[intervalos.length - 1]).toBe(intervalos[0]);
  });

  it('o ciclo não para: em 10 minutos de queda, tenta pelo menos 12 vezes', () => {
    // "Nenhuma fila pode ficar parada indefinidamente porque `navigator.onLine`
    // mente" — a garantia é esta: enquanto houver evidência, sempre haverá uma
    // próxima tentativa, e ela chega em menos de um minuto.
    expect(simular(10 * 60_000, () => true).length).toBeGreaterThanOrEqual(12);
  });

  it('a rede volta no meio de um ciclo: drena em no máximo JANELA + TICK', () => {
    // O caso de produção. A evidência aparece em t=0 (a queda), o ciclo corre
    // durante a queda, e a rede volta num instante qualquer.
    const quando = simular(10 * 60_000, () => true);
    for (const voltaDaRede of [0, 10_000, 30_000, 44_999, 60_000, 123_456]) {
      const proxima = quando.find((t) => t >= voltaDaRede);
      expect(proxima).toBeDefined();
      expect((proxima as number) - voltaDaRede).toBeLessThanOrEqual(
        INTERVALO_RETENTATIVA_MS + TICK,
      );
    }
  });

  it('sem evidência de queda, o ciclo não gasta requisição nenhuma', () => {
    expect(simular(10 * 60_000, () => false)).toEqual([]);
  });
});
