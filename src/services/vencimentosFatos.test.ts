/**
 * Fase 9 · 9D.5 — a REGRA do vencimento, com duas fontes e uma implementação.
 *
 * O painel passa a poder vir do servidor (agregado sobre a projeção, §15) em
 * vez do cache inteiro. A lição do portão P9.2 foi cara e é esta: quando os
 * dois caminhos montam a MESMA linha cada um por sua conta, eles divergem em
 * silêncio — em 23/08/2026 a cidade do cliente sumiu do cartão exatamente
 * assim.
 *
 * Por isso a regra virou função pura sobre FATOS, e os dois caminhos a chamam.
 * Estes testes travam a regra; a paridade entre as fontes é consequência da
 * construção, não de disciplina.
 */
import { describe, it, expect } from 'vitest';
import { itemDeEquipamento, itemDeCalibracao } from './vencimentos';

const HOJE = new Date(2026, 7, 24); // 24/08/2026

describe('prazo do equipamento', () => {
  it('o RELATÓRIO mais recente manda, com a menor das duas próximas', () => {
    const item = itemDeEquipamento(
      {
        tag: 'VP-1',
        descricao: 'Vaso separador',
        tipo: 'vaso',
        relExecucao: '2026-08-01',
        relProxInterna: '2027-08-01',
        relProxExterna: '2026-09-01',
      },
      HOJE,
    );

    expect(item.vencimento).toEqual(new Date(2026, 8, 1));
    expect(item.ultima).toEqual(new Date(2026, 7, 1));
    expect(item.status).toBe('warn'); // 8 dias
  });

  it('sem relatório, cai na Vida Remanescente', () => {
    const item = itemDeEquipamento(
      { tag: 'VP-2', tipo: 'caldeira', vidaBase: '2026-01-31', vidaProxAnos: 1 },
      HOJE,
    );

    // 31/01/2026 + 12 meses. É `setMonth`, que TRANSBORDA: 31/01 + 1 mês vira
    // 03/03. Com 12 meses o dia existe, então dá 31/01/2027.
    expect(item.vencimento).toEqual(new Date(2027, 0, 31));
    expect(item.tipoEquip).toBe('Caldeira');
  });

  it('a Vida com meia dose de ano é arredondada em MESES, não em dias', () => {
    // 0,5 ano = 6 meses. Se a conta fosse `anos*365` dias, daria 182 dias —
    // 31/07, não 31/08. É a divergência que o SQL do agregado reproduz de
    // propósito (`f9_mais_meses`).
    const item = itemDeEquipamento(
      { tag: 'VP-3', tipo: 'vaso', vidaBase: '2026-02-28', vidaProxAnos: 0.5 },
      HOJE,
    );

    expect(item.vencimento).toEqual(new Date(2026, 7, 28));
  });

  it('relatório mais recente SEM datas não faz procurar num anterior', () => {
    // A regra do sistema olha só o mais recente. Com ele sem prazo, a reserva é
    // a Vida — nunca um relatório antigo.
    const item = itemDeEquipamento(
      {
        tag: 'VP-4',
        tipo: 'vaso',
        relEmissao: '2026-08-01',
        vidaBase: '2026-08-01',
        vidaProxAnos: 1,
      },
      HOJE,
    );

    expect(item.vencimento).toEqual(new Date(2027, 7, 1));
  });

  it('sem nada salvo, o item aparece como semPrazo — nunca some da lista', () => {
    const item = itemDeEquipamento({ tag: 'VP-5', tipo: 'vaso' }, HOJE);

    expect(item.status).toBe('semPrazo');
    expect(item.vencimento).toBeUndefined();
    expect(item.tag).toBe('VP-5');
  });

  it('vencido conta dias negativos', () => {
    const item = itemDeEquipamento(
      { tag: 'VP-6', tipo: 'vaso', relProxInterna: '2026-08-14' },
      HOJE,
    );

    expect(item.status).toBe('crit');
    expect(item.dias).toBe(-10);
  });

  it('o nome cai no rótulo do tipo quando a descrição está vazia', () => {
    expect(itemDeEquipamento({ tag: 'A', tipo: 'autoclave' }, HOJE).nome).toBe('Autoclave');
    expect(itemDeEquipamento({ tag: 'A', tipo: 'vaso', descricao: '  ' }, HOJE).nome).toBe(
      'Vaso de Pressão',
    );
  });
});

describe('prazo do acessório (calibração)', () => {
  it('monta a linha com a TAG do componente e o pai', () => {
    const item = itemDeCalibracao(
      {
        tag: 'VP-1',
        nome: 'Manômetro do casco',
        tipo: 'manometro',
        serie: '4417',
        dataCalibracao: '2026-02-10',
        proxCalibracao: '2026-08-30',
      },
      HOJE,
    );

    expect(item?.origem).toBe('calibracao');
    expect(item?.pertenceA).toBe('VP-1');
    expect(item?.tag).toBe('MANÔMETRO-4417');
    expect(item?.tipoEquip).toBe('Manômetro');
    expect(item?.status).toBe('warn');
  });

  it('psv vira Válvula de Segurança', () => {
    const item = itemDeCalibracao(
      { tag: 'VP-1', tipo: 'psv', proxCalibracao: '2027-01-01' },
      HOJE,
    );

    expect(item?.nome).toBe('Válvula de Segurança');
    expect(item?.tipoEquip).toBe('Válvula de Segurança');
  });

  it('sem próxima calibração NÃO vira linha — igual ao caminho antigo', () => {
    expect(itemDeCalibracao({ tag: 'VP-1', tipo: 'psv' }, HOJE)).toBeNull();
  });
});
