/**
 * Fase 9 · 9G.1 + 9G.3 — **O LOGIN NÃO PODE DESFAZER O BOOT LEVE, E O BOOT LEVE
 * É O ÚNICO CAMINHO.**
 *
 * ## O defeito original (9G.1)
 *
 * `aposEntrar` (`auth.ts`) chamava `await lerTudo()` sem condição nenhuma — o
 * único caminho de hidratação integral que a Fase 9 não cobriu. Com o boot leve
 * ligado, o boot pedia o essencial e o login, segundos antes, já havia baixado a
 * organização inteira. Ninguém percebia porque a tela abria certa: o custo some
 * no gráfico de egress, não na experiência.
 *
 * ## O que a remoção mudou (9G.3)
 *
 * A flag `boot_v9` saiu depois de terminar o rollout em 30/30. **O boot leve não
 * foi removido — virou o único caminho**, e com ele sumiu a resposta `completa`.
 * Sobraram duas, e a ORDEM entre elas continua sendo o que este arquivo trava:
 * o cliente do Portal vem primeiro, porque o `essencial` também lê
 * `app_storage`, e perguntar qualquer outra coisa antes do papel o colocaria de
 * volta num caminho que não é dele (Fase 0-B, achado A-01).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const estado = vi.hoisted(() => ({ cliente: false }));
const chamadas = vi.hoisted(() => ({ lerTudo: 0, essencial: 0 }));

vi.mock('./papelSessao', () => ({ ehCliente: () => estado.cliente }));
vi.mock('./storage', () => ({
  lerTudo: async () => {
    chamadas.lerTudo += 1;
    return {};
  },
  hidratarEssencial: async () => {
    chamadas.essencial += 1;
    return { chaves: 3, bytes: 1024, familias: {} };
  },
}));

import { modoHidratacaoDaSessao, executarHidratacao } from './modoHidratacao';

beforeEach(() => {
  estado.cliente = false;
  chamadas.lerTudo = 0;
  chamadas.essencial = 0;
});

describe('modoHidratacaoDaSessao', () => {
  it('sessão normal: só o ESSENCIAL — o boot leve é o único caminho', () => {
    expect(modoHidratacaoDaSessao()).toBe('essencial');
  });

  it('cliente do Portal: NENHUMA', () => {
    estado.cliente = true;
    expect(modoHidratacaoDaSessao()).toBe('nenhuma');
  });
});

describe('executarHidratacao', () => {
  it('`essencial` chama hidratarEssencial, e NUNCA lerTudo', async () => {
    const { medida } = await executarHidratacao('essencial');
    expect(chamadas).toEqual({ lerTudo: 0, essencial: 1 });
    expect(medida?.chaves).toBe(3); // a medida do teto volta para quem registra
  });

  it('`nenhuma` não toca a rede', async () => {
    const r = await executarHidratacao('nenhuma');
    expect(chamadas).toEqual({ lerTudo: 0, essencial: 0 });
    expect(r.medida).toBeUndefined();
  });

  it('NENHUM modo chama `lerTudo` — a hidratação integral saiu do boot', async () => {
    // A 9G.3 removeu a resposta `completa`. `lerTudo()` continua existindo como
    // função (chave de emergência e importação de planilha), mas deixou de ser
    // o caminho de entrada do sistema. Se voltar aqui, volta para todo mundo.
    await executarHidratacao('essencial');
    await executarHidratacao('nenhuma');
    expect(chamadas.lerTudo).toBe(0);
  });
});
