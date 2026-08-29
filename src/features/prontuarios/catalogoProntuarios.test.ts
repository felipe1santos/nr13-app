/**
 * Fase 9 · 9F.2.1 + 9F.2.3 — a tela nova de `/prontuarios` não baixa a
 * organização inteira, e o equipamento chega quando é ESCOLHIDO.
 *
 * ## O defeito que isto conserta
 *
 * `Prontuarios.tsx` monta a lista com `listarEquipamentos()`, e essa função
 * começa com `await lerTudo()` — hidratação COMPLETA. Sob `boot_v9` a primeira
 * visita a `/prontuarios` desfaz o boot leve da 9D (20 KB × 354 KB medidos).
 * É o mesmo defeito que a 9F.1 tirou de `/inspecoes`: um só, repetido em quatro
 * telas.
 *
 * ## Por que aqui a ORDEM é mais cara do que foi na 9F.1
 *
 * Em `/inspecoes`, ler antes de semear abriria a lista de containers vazia. Aqui
 * abre um DOCUMENTO: o visualizador materializa o palco a partir do cache, e o
 * palco só enxerga o que `cacheLocal` tem indexado para a TAG. Semear depois —
 * ou não semear — imprime seis folhas de prontuário com "-" nos campos, sem
 * erro nenhum na tela. É o risco bloqueante desta etapa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  ordem: [] as string[],
  dados: {} as Record<string, unknown>,
  falhaSemeadura: null as Error | null,
}));

vi.mock('../../services/storage', () => ({
  ler: <T,>(chave: string): T | null => {
    estado.ordem.push(`ler:${chave}`);
    return (estado.dados[chave] as T) ?? null;
  },
  salvar: async () => {},
  lerTudo: async () => {
    // Tocar este caminho é desfazer o boot leve.
    estado.ordem.push('lerTudo');
    return {};
  },
}));

vi.mock('../equipamento/equipamentoService', async () => {
  const real = await vi.importActual<typeof import('../equipamento/equipamentoService')>(
    '../equipamento/equipamentoService',
  );
  return {
    ...real,
    carregarEquipamento: async (tag: string) => {
      estado.ordem.push(`semear:${tag}`);
      if (estado.falhaSemeadura) throw estado.falhaSemeadura;
    },
  };
});

import { abrirEquipamentoParaProntuario } from './catalogoProntuarios';

beforeEach(() => {
  estado.ordem = [];
  estado.dados = {};
  estado.falhaSemeadura = null;
});

function equipamentoNoCache(tag: string) {
  estado.dados[`nr13_info_${tag}`] = { tag, tipo: 'vaso', subtipo: '' };
  estado.dados[`nr13_cat_${tag}`] = { catFinal: 'III' };
  estado.dados[`nr13_calc_${tag}`] = { pmta: '10.5' };
  estado.dados[`nr13_pref_unidade_${tag}`] = 'SI';
}

describe('abrir um equipamento na tela de prontuários', () => {
  it('SEMEIA a TAG antes de qualquer leitura', async () => {
    equipamentoNoCache('VP-01');

    const aberto = await abrirEquipamentoParaProntuario('VP-01');

    expect(aberto.resumo?.tag).toBe('VP-01');
    // A ordem é o teste inteiro: a primeira entrada precisa ser a semeadura.
    expect(estado.ordem[0]).toBe('semear:VP-01');
    expect(estado.ordem.filter((o) => o.startsWith('ler:')).length).toBeGreaterThan(0);
  });

  it('NÃO chama lerTudo — o boot leve continua leve', async () => {
    equipamentoNoCache('VP-01');
    await abrirEquipamentoParaProntuario('VP-01');
    expect(estado.ordem).not.toContain('lerTudo');
  });

  it('semeia SÓ a TAG escolhida', async () => {
    equipamentoNoCache('VP-01');
    equipamentoNoCache('VP-02');

    await abrirEquipamentoParaProntuario('VP-02');

    expect(estado.ordem.filter((o) => o.startsWith('semear:'))).toEqual(['semear:VP-02']);
  });

  it('devolve o prontuário salvo da TAG, quando existe', async () => {
    equipamentoNoCache('VP-01');
    estado.dados['nr13_prontuario_VP-01'] = { tag: 'VP-01', descricao: 'Vaso de teste' };

    const aberto = await abrirEquipamentoParaProntuario('VP-01');

    expect(aberto.prontuario).toEqual({ tag: 'VP-01', descricao: 'Vaso de teste' });
  });

  it('equipamento sem prontuário devolve `null` — e não quebra a abertura', async () => {
    equipamentoNoCache('VP-09');

    const aberto = await abrirEquipamentoParaProntuario('VP-09');

    expect(aberto.prontuario).toBeNull();
    expect(aberto.resumo?.tag).toBe('VP-09');
  });

  it('falha de rede na semeadura NÃO derruba a abertura', async () => {
    // Offline, o que já está no aparelho continua valendo — a mesma promessa de
    // `carregarEquipamento`. Derrubar a navegação por causa da rede
    // transformaria uma tela degradada numa tela quebrada.
    estado.falhaSemeadura = new Error('sem rede');
    equipamentoNoCache('VP-01');

    const aberto = await abrirEquipamentoParaProntuario('VP-01');

    expect(aberto.resumo?.tag).toBe('VP-01');
  });

  it('TAG que nem no cache nem no servidor existe devolve resumo nulo, sem lançar', async () => {
    await expect(abrirEquipamentoParaProntuario('NAO-EXISTE')).resolves.toEqual({
      resumo: null,
      prontuario: null,
    });
  });
});

describe('quem hidrata a organização', () => {
  it('com a flag DESLIGADA, o caminho antigo segue hidratando (nada muda para quem não migrou)', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoProntuarios');
    expect(deveHidratarListaLegada(false)).toBe(true);
  });

  it('com a flag LIGADA, ninguém chama lerTudo — é o ponto inteiro da etapa', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoProntuarios');
    expect(deveHidratarListaLegada(true)).toBe(false);
  });
});
