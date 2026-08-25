/**
 * Fase 9 · 9D.5 — o painel de vencimentos vindo do AGREGADO do servidor.
 *
 * Três coisas que estes testes travam, e cada uma seria um número errado na
 * tela de entrada do sistema:
 *
 *   · os KPIs vêm dos CONTADORES da organização, nunca da lista devolvida —
 *     ela é truncada, e contar sobre ela mostraria "3 vencidos" numa conta com
 *     300;
 *   · as LINHAS são montadas pela mesma regra do caminho antigo
 *     (`itemDeEquipamento` / `itemDeCalibracao`), sobre fatos crus;
 *   · falha de rede NÃO vira painel zerado: vira erro declarado, para a tela
 *     poder dizer o que houve. Zero é uma resposta, e a errada.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const resposta = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
}));

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: resposta.data, error: resposta.error })) },
}));

const flag = vi.hoisted(() => ({ bootV9: false }));
vi.mock('./flag', () => ({ bootV9Ativo: () => flag.bootV9 }));

const local = vi.hoisted(() => ({ chamou: false }));
vi.mock('./vencimentos', async () => {
  const real = await vi.importActual<typeof import('./vencimentos')>('./vencimentos');
  return {
    ...real,
    listarVencimentos: () => {
      local.chamou = true;
      return [];
    },
  };
});

vi.mock('./storage', () => ({ listarChavesComPrefixo: () => ['nr13_info_A', 'nr13_info_B'] }));

import { carregarPainel, painelDoServidor, textoContador } from './vencimentosServidor';

const HOJE = new Date(2026, 7, 24);

beforeEach(() => {
  resposta.data = null;
  resposta.error = null;
});

describe('painelDoServidor', () => {
  it('monta as linhas com a MESMA regra do caminho antigo', async () => {
    resposta.data = {
      total_equip: 2,
      com_prazo: 2,
      vencidos: 1,
      a_vencer_30: 1,
      truncado: false,
      restantes: 0,
      em: '2026-08-24T12:34:00.000Z',
      itens: [
        {
          tag: 'VP-1',
          origem: 'inspecao',
          descricao: 'Vaso separador',
          tipo: 'vaso',
          relExecucao: '2026-08-01',
          relProxInterna: '2026-08-14',
        },
        {
          tag: 'VP-1',
          origem: 'calibracao',
          pertenceA: 'VP-1',
          nome: 'Manômetro do casco',
          tipo: 'manometro',
          serie: '4417',
          proxCalibracao: '2026-08-30',
        },
      ],
    };

    const painel = await painelDoServidor(HOJE);

    expect(painel.fonte).toBe('servidor');
    expect(painel.itens).toHaveLength(2);
    expect(painel.itens[0]).toMatchObject({ tag: 'VP-1', status: 'crit', dias: -10 });
    expect(painel.itens[1]).toMatchObject({
      tag: 'MANÔMETRO-4417',
      origem: 'calibracao',
      pertenceA: 'VP-1',
      status: 'warn',
    });
  });

  it('os KPIs saem dos CONTADORES, não da lista truncada', async () => {
    resposta.data = {
      total_equip: 300,
      com_prazo: 280,
      vencidos: 47,
      a_vencer_30: 12,
      truncado: true,
      restantes: 250,
      em: '2026-08-24T12:34:00.000Z',
      itens: [{ tag: 'VP-1', origem: 'inspecao', tipo: 'vaso', relProxInterna: '2026-08-14' }],
    };

    const painel = await painelDoServidor(HOJE);

    expect(painel.kpis.total).toBe(300);
    expect(painel.kpis.vencidos).toBe(47);
    expect(painel.kpis.aVencer30).toBe(12);
    // (280 - 47) / 280 = 83,2 %
    expect(painel.kpis.conformidade).toBe(83.2);
    expect(painel.truncado).toBe(true);
    expect(painel.restantes).toBe(250);
  });

  it('guarda a hora do agregado — é o selo "dados de HH:MM" da tela', async () => {
    resposta.data = {
      total_equip: 0, com_prazo: 0, vencidos: 0, a_vencer_30: 0,
      truncado: false, restantes: 0, itens: [], em: '2026-08-24T12:34:00.000Z',
    };

    const painel = await painelDoServidor(HOJE);

    expect(painel.em?.toISOString()).toBe('2026-08-24T12:34:00.000Z');
  });

  it('erro do servidor vira ERRO declarado, não painel zerado', async () => {
    resposta.error = { message: 'sem rede' };

    const painel = await painelDoServidor(HOJE);

    expect(painel.erro).toBe(true);
    expect(painel.itens).toEqual([]);
    // Sem isto a tela mostraria "0 vencidos, 100 % de conformidade" para uma
    // conta que pode ter dezenas vencidos — a mentira mais cara deste painel.
    expect(painel.kpis.conformidade).toBeUndefined();
  });

  it('sem resposta, NENHUM contador vale zero — a tela precisa poder dizer "—"', async () => {
    resposta.error = { message: 'Failed to fetch' };

    const painel = await painelDoServidor(HOJE);

    // Medido em produção em 25/08/2026, com a aba offline: o Dashboard exibia
    // "EQUIPAMENTOS CADASTRADOS: 0" numa organização com 4 equipamentos no
    // cache, o menu lateral marcando 4 e /equipamentos listando 4 de 4.
    //
    // Zero é uma AFIRMAÇÃO — "conferi e não há nenhum" — e é a mesma frase que
    // o sumiço de dados diz. Este projeto existe para que a tela nunca a diga
    // sem ter conferido. Não saber tem representação própria.
    expect(painel.kpis.total).toBeUndefined();
    expect(painel.kpis.aVencer30).toBeUndefined();
    expect(painel.kpis.vencidos).toBeUndefined();
  });

  it('zero VERDADEIRO continua sendo zero — não vira "—"', async () => {
    resposta.data = {
      total_equip: 0, com_prazo: 0, vencidos: 0, a_vencer_30: 0,
      truncado: false, restantes: 0, itens: [], em: '2026-08-25T12:00:00.000Z',
    };

    const painel = await painelDoServidor(HOJE);

    // O oposto do teste acima, e igualmente necessário: organização recém-criada
    // TEM zero equipamentos, e apagar esse zero em nome da prudência esconderia
    // o estado real de quem acabou de entrar.
    expect(painel.kpis.total).toBe(0);
    expect(painel.kpis.vencidos).toBe(0);
    expect(painel.erro).toBeUndefined();
  });

  it('organização sem nenhum equipamento não é erro', async () => {
    resposta.data = {
      total_equip: 0, com_prazo: 0, vencidos: 0, a_vencer_30: 0,
      truncado: false, restantes: 0, itens: [], em: '2026-08-24T12:34:00.000Z',
    };

    const painel = await painelDoServidor(HOJE);

    expect(painel.erro).toBeUndefined();
    expect(painel.kpis.conformidade).toBe(100);
  });

  it('ordena como o caminho antigo: vencidos primeiro, depois por dias', async () => {
    resposta.data = {
      total_equip: 3, com_prazo: 2, vencidos: 1, a_vencer_30: 1,
      truncado: false, restantes: 0, em: '2026-08-24T12:34:00.000Z',
      itens: [
        { tag: 'SEM', origem: 'inspecao', tipo: 'vaso' },
        { tag: 'PERTO', origem: 'inspecao', tipo: 'vaso', relProxInterna: '2026-09-01' },
        { tag: 'VENCIDO', origem: 'inspecao', tipo: 'vaso', relProxInterna: '2026-08-01' },
      ],
    };

    const painel = await painelDoServidor(HOJE);

    expect(painel.itens.map((i) => i.tag)).toEqual(['VENCIDO', 'PERTO', 'SEM']);
  });
});

describe('carregarPainel — quem escolhe a fonte', () => {
  beforeEach(() => {
    flag.bootV9 = false;
    local.chamou = false;
  });

  it('sem boot_v9, o painel vem do cache local — o caminho de sempre', async () => {
    const painel = await carregarPainel(HOJE);

    expect(painel.fonte).toBe('local');
    expect(local.chamou).toBe(true);
    // O total do KPI é a contagem de equipamentos, não a de linhas do painel.
    expect(painel.kpis.total).toBe(2);
  });

  it('com boot_v9, vem do agregado — e o cache local nem é consultado', async () => {
    // Consultar o cache aqui devolveria zero (o boot leve não baixou a
    // organização) e ainda pagaria a varredura. É o pior dos dois mundos.
    flag.bootV9 = true;
    resposta.data = {
      total_equip: 9, com_prazo: 9, vencidos: 0, a_vencer_30: 0,
      truncado: false, restantes: 0, itens: [], em: '2026-08-24T12:00:00.000Z',
    };

    const painel = await carregarPainel(HOJE);

    expect(painel.fonte).toBe('servidor');
    expect(painel.kpis.total).toBe(9);
    expect(local.chamou).toBe(false);
  });
});

describe('textoContador — como o número indefinido chega na tela', () => {
  it('contador conferido vira o número', () => {
    expect(textoContador(0)).toBe('0');
    expect(textoContador(4)).toBe('4');
    expect(textoContador(1200)).toBe('1.200');
  });

  it('contador NÃO conferido vira "—", nunca 0', () => {
    // O React renderiza `undefined` como string vazia: sem esta função o KPI
    // apareceria em branco, que é tão mudo quanto o zero era mentiroso.
    expect(textoContador(undefined)).toBe('—');
  });
});
