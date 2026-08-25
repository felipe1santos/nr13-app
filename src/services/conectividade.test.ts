/**
 * Fase 9 · 9D — de onde a UI tira a resposta para "estamos online?".
 *
 * `navigator.onLine` NÃO é essa resposta, e a prova é de produção. Em
 * 25/08/2026, com a aba em Offline pelo DevTools, medimos:
 *
 *   · `navigator.onLine === true`, o tempo todo;
 *   · 50 requisições reais falhando com `TypeError: Failed to fetch` —
 *     incluindo `rpc/aplicar_mutacao_storage`, que é a fila tentando subir;
 *   · nenhum evento `online`/`offline` disparado, então a drenagem automática
 *     (que escuta os dois) nunca acordou;
 *   · o selo da topbar anunciando "Sincronizar (3)" — convite a clicar num
 *     botão que não tinha como funcionar.
 *
 * O padrão do navegador é conhecido: `onLine === false` prova que NÃO há rede,
 * mas `true` só diz que existe uma interface ativa — não que o servidor esteja
 * alcançável. Proxy, captive portal, DNS, firewall e o próprio DevTools ficam
 * todos do lado de fora dessa promessa.
 *
 * A autoridade que este sistema já tinha é o ERRO REAL da última tentativa:
 * `errosSync.classificar` marca `categoria: 'offline'` exatamente quando o
 * fetch falhou por rede. Este módulo só lê o que a fila registrou.
 */
import { describe, it, expect } from 'vitest';
import { estadoConectividade } from './conectividade';
import type { ItemFila } from './sync';

function item(parcial: Partial<ItemFila>): ItemFila {
  return {
    mutationId: 'm1',
    op: 'set',
    chave: 'nr13_info_A',
    versaoBase: 1,
    dispositivo: 'd1',
    criadoEm: '2026-08-25T10:00:00.000Z',
    tentativas: 1,
    estado: 'aguardando',
    ...parcial,
  } as ItemFila;
}

const erroDeRede = {
  categoria: 'offline' as const,
  titulo: 'Sem conexão',
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

const erroDePermissao = { ...erroDeRede, categoria: 'permissao' as const };

describe('estadoConectividade', () => {
  it('navegador diz offline: acreditamos na hora', () => {
    // `onLine === false` é a metade CONFIÁVEL da promessa do navegador: quando
    // ele afirma que não há interface, não há mesmo.
    expect(estadoConectividade({ navegadorOnLine: false, pendentes: [] })).toBe('offline');
  });

  it('navegador diz online e a fila subiu tudo: online', () => {
    expect(estadoConectividade({ navegadorOnLine: true, pendentes: [] })).toBe('online');
  });

  it('navegador MENTE: onLine true, mas a última tentativa falhou por rede', () => {
    // O caso medido em produção. Antes desta função a topbar dizia
    // "Sincronizar (3)" e o clique não tinha como dar certo.
    expect(
      estadoConectividade({
        navegadorOnLine: true,
        pendentes: [item({ erro: erroDeRede })],
      }),
    ).toBe('offline');
  });

  it('pendência que falhou por PERMISSÃO não é falta de rede', () => {
    // Assinatura vencida, RLS, sessão expirada: a rede está ótima e o problema
    // é outro. Chamar isso de "offline" mandaria o usuário procurar sinal de
    // celular por um problema de cadastro.
    expect(
      estadoConectividade({
        navegadorOnLine: true,
        pendentes: [item({ erro: erroDePermissao })],
      }),
    ).toBe('online');
  });

  it('pendência ainda NÃO tentada não acusa queda', () => {
    // Item recém-gravado, sem `erro`: não há evidência de rede ruim. Presumir
    // queda aqui piscaria "offline" a cada digitação salva.
    expect(
      estadoConectividade({
        navegadorOnLine: true,
        pendentes: [item({ estado: 'salvo_local', erro: undefined })],
      }),
    ).toBe('online');
  });

  it('basta UMA pendência com erro de rede entre várias', () => {
    expect(
      estadoConectividade({
        navegadorOnLine: true,
        pendentes: [
          item({ mutationId: 'a', erro: erroDePermissao }),
          item({ mutationId: 'b', erro: undefined }),
          item({ mutationId: 'c', erro: erroDeRede }),
        ],
      }),
    ).toBe('offline');
  });

  it('navegador offline vence mesmo sem pendência nenhuma', () => {
    expect(estadoConectividade({ navegadorOnLine: false, pendentes: [] })).toBe('offline');
  });
});
