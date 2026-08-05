import { describe, it, expect } from 'vitest';
import { interpretarResposta } from './contratoRpc';

describe('interpretarResposta — contrato com aplicar_mutacao_storage', () => {
  it('aplicado devolve a versão nova', () => {
    expect(interpretarResposta({ status: 'aplicado', versao: 5 })).toEqual({
      status: 'aplicado',
      versao: 5,
    });
  });

  it('repetido é SUCESSO: a mutação já tinha sido aplicada antes', () => {
    // Resposta perdida na rede + reenvio. Sem isto, o app reaplicaria.
    expect(interpretarResposta({ status: 'repetido', versao: 5 })).toEqual({
      status: 'repetido',
      versao: 5,
    });
  });

  it('conflito carrega a linha vigente para preservar as DUAS versões', () => {
    expect(
      interpretarResposta({
        status: 'conflito',
        versao: 7,
        valor: '{"origem":"escritorio"}',
        atualizado_em: '2026-08-04T12:00:00.000Z',
        dispositivo: 'desktop-1',
      }),
    ).toEqual({
      status: 'conflito',
      versao: 7,
      valor: '{"origem":"escritorio"}',
      atualizadoEm: '2026-08-04T12:00:00.000Z',
      dispositivo: 'desktop-1',
    });
  });

  it('conflito com linha inexistente no servidor (valor nulo)', () => {
    const r = interpretarResposta({ status: 'conflito', versao: 0, valor: null });
    expect(r).toEqual({
      status: 'conflito',
      versao: 0,
      valor: null,
      atualizadoEm: '',
      dispositivo: null,
    });
  });

  it('recusado carrega o motivo', () => {
    expect(interpretarResposta({ status: 'recusado', motivo: 'versao_obsoleta', versao: 9 })).toEqual({
      status: 'recusado',
      motivo: 'versao_obsoleta',
      versao: 9,
    });
  });

  it('os quatro motivos de recusa do SQL são reconhecidos', () => {
    const motivos = ['versao_obsoleta', 'anterior_ao_corte', 'tombstone_mais_novo', 'sem_permissao'];
    for (const motivo of motivos) {
      expect(interpretarResposta({ status: 'recusado', motivo })).toEqual({
        status: 'recusado',
        motivo,
        versao: 0,
      });
    }
  });

  it('motivo desconhecido vira sem_permissao (nunca é tratado como sucesso)', () => {
    expect(interpretarResposta({ status: 'recusado', motivo: 'motivo_novo' })).toEqual({
      status: 'recusado',
      motivo: 'sem_permissao',
      versao: 0,
    });
  });

  it('resposta desconhecida vira recusa, nunca sucesso silencioso', () => {
    // Servidor mais novo que o cliente, ou payload corrompido: assumir sucesso
    // apagaria a pendência e o dado sumiria — foi exatamente esse o bug original.
    const esperado = { status: 'recusado', motivo: 'sem_permissao', versao: 0 };
    expect(interpretarResposta({ status: 'coisa_nova' })).toEqual(esperado);
    expect(interpretarResposta(null)).toEqual(esperado);
    expect(interpretarResposta(undefined)).toEqual(esperado);
    expect(interpretarResposta('lixo')).toEqual(esperado);
    expect(interpretarResposta({})).toEqual(esperado);
  });

  it('versão ausente ou não-numérica vira 0, não NaN', () => {
    expect(interpretarResposta({ status: 'aplicado' })).toEqual({ status: 'aplicado', versao: 0 });
    expect(interpretarResposta({ status: 'aplicado', versao: 'x' })).toEqual({
      status: 'aplicado',
      versao: 0,
    });
  });
});
