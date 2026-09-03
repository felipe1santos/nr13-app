/**
 * Fase 9 · 9G.1 — **O LOGIN NÃO PODE DESFAZER O BOOT LEVE.**
 *
 * ## O defeito
 *
 * `aposEntrar` (`auth.ts`) chamava `await lerTudo()` sem condição nenhuma — o
 * único caminho de hidratação integral que a Fase 9 não cobriu. Com `boot_v9`
 * ligada, o boot pedia o essencial e o login, segundos antes, já havia baixado
 * a organização inteira. Ninguém percebia porque a tela abria certa: o custo
 * some no gráfico de egress, não na experiência.
 *
 * ## O que este arquivo trava
 *
 * A decisão é UMA (`modoHidratacaoDaSessao`) e os dois caminhos a consomem, então
 * a paridade é estrutural. O que resta testar é a decisão em si — e a ORDEM das
 * perguntas, que é onde ela erraria em silêncio: uma organização de Portal com
 * `boot_v9` ligada cairia no `essencial`, que também lê `app_storage`, se a flag
 * fosse consultada antes do papel.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const estado = vi.hoisted(() => ({ cliente: false, boot: false }));
const chamadas = vi.hoisted(() => ({ lerTudo: 0, essencial: 0 }));

vi.mock('./flag', () => ({ bootV9Ativo: () => estado.boot }));
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
  estado.boot = false;
  chamadas.lerTudo = 0;
  chamadas.essencial = 0;
});

describe('modoHidratacaoDaSessao', () => {
  it('sem flag e sem Portal: hidratação COMPLETA — o caminho de sempre', () => {
    expect(modoHidratacaoDaSessao()).toBe('completa');
  });

  it('com boot_v9: só o ESSENCIAL', () => {
    estado.boot = true;
    expect(modoHidratacaoDaSessao()).toBe('essencial');
  });

  it('cliente do Portal: NENHUMA', () => {
    estado.cliente = true;
    expect(modoHidratacaoDaSessao()).toBe('nenhuma');
  });

  it('cliente do Portal COM boot_v9 continua NENHUMA — a ordem das perguntas', () => {
    // O `essencial` também lê `app_storage`. Perguntar a flag antes do papel
    // colocaria o cliente do Portal de volta num caminho que não é dele.
    estado.cliente = true;
    estado.boot = true;
    expect(modoHidratacaoDaSessao()).toBe('nenhuma');
  });
});

describe('executarHidratacao', () => {
  it('`completa` chama lerTudo, e só ele', async () => {
    await executarHidratacao('completa');
    expect(chamadas).toEqual({ lerTudo: 1, essencial: 0 });
  });

  it('`essencial` chama hidratarEssencial, e NÃO lerTudo', async () => {
    const { medida } = await executarHidratacao('essencial');
    expect(chamadas).toEqual({ lerTudo: 0, essencial: 1 });
    expect(medida?.chaves).toBe(3); // a medida do teto volta para quem registra
  });

  it('`nenhuma` não toca a rede', async () => {
    const r = await executarHidratacao('nenhuma');
    expect(chamadas).toEqual({ lerTudo: 0, essencial: 0 });
    expect(r.medida).toBeUndefined();
  });
});
