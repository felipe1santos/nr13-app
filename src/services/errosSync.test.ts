import { describe, it, expect } from 'vitest';
import { classificar } from './errosSync';

const CTX = {
  chave: 'nr13_info_ACA 2040',
  mutationId: 'm-1',
  dispositivo: 'd-1',
  quando: '2026-08-04T12:00:00.000Z',
};

describe('classificar — categoria certa para cada falha', () => {
  it('sem rede -> offline, sem ação', () => {
    const e = classificar(new TypeError('Failed to fetch'), CTX);
    expect(e.categoria).toBe('offline');
    expect(e.acao).toBeNull();
  });

  it('NetworkError também é offline', () => {
    expect(classificar({ message: 'NetworkError when attempting to fetch' }, CTX).categoria).toBe(
      'offline',
    );
  });

  it('RLS 42501 -> permissão, com ação Regularizar', () => {
    const e = classificar(
      { code: '42501', message: 'new row violates row-level security policy' },
      CTX,
    );
    expect(e.categoria).toBe('permissao');
    expect(e.acao?.tipo).toBe('regularizar');
  });

  it('nr13_versao_obsoleta -> obsoleto, com ação de comparar', () => {
    const e = classificar({ code: 'P0001', message: 'nr13_versao_obsoleta: chave X' }, CTX);
    expect(e.categoria).toBe('obsoleto');
    expect(e.acao?.tipo).toBe('comparar');
  });

  it('escrita direta bloqueada (v2 ligada) -> permissão, não erro genérico', () => {
    const e = classificar(
      { code: 'P0001', message: 'nr13_escrita_direta_bloqueada: org X usa armazenamento v2' },
      CTX,
    );
    expect(e.categoria).toBe('permissao');
  });

  it('conflito declarado pelo sync -> conflito', () => {
    expect(classificar({ code: 'nr13_conflito', message: 'versão divergente' }, CTX).categoria).toBe(
      'conflito',
    );
  });

  it('401 -> sessão expirada', () => {
    expect(classificar({ status: 401, message: 'JWT expired' }, CTX).categoria).toBe('sessao');
  });

  it('QuotaExceededError -> cota do aparelho', () => {
    const err = new Error('storage cheio');
    err.name = 'QuotaExceededError';
    expect(classificar(err, CTX).categoria).toBe('cota');
  });

  it('erro fora do catálogo -> desconhecido, com ação de tentar de novo', () => {
    const e = classificar({ code: '23505', message: 'duplicate key value' }, CTX);
    expect(e.categoria).toBe('desconhecido');
    expect(e.acao?.tipo).toBe('tentar');
  });
});

describe('classificar — nunca despeja a mensagem crua na tela', () => {
  const CRU = 'duplicate key value violates unique constraint "app_storage_org_chave_uidx"';

  it('título e explicação não contêm o texto interno do Postgres', () => {
    const e = classificar({ code: '23505', message: CRU }, CTX);
    expect(e.titulo).not.toContain('constraint');
    expect(e.titulo).not.toContain('app_storage');
    expect(e.explicacao).not.toContain('constraint');
    expect(e.explicacao).not.toContain('app_storage');
  });

  it('mas PRESERVA a mensagem original inteira no detalhe técnico', () => {
    const e = classificar({ code: '23505', message: CRU }, CTX);
    expect(e.detalhe.mensagemOriginal).toBe(CRU);
    expect(e.detalhe.codigo).toBe('23505');
  });

  it('o detalhe carrega todo o contexto necessário para o suporte', () => {
    const e = classificar({ code: '23505', message: CRU }, CTX);
    expect(e.detalhe).toEqual({
      codigo: '23505',
      mensagemOriginal: CRU,
      chave: 'nr13_info_ACA 2040',
      mutationId: 'm-1',
      dispositivo: 'd-1',
      quando: '2026-08-04T12:00:00.000Z',
    });
  });

  it('erro sem código nem nome não deixa o detalhe vazio', () => {
    const e = classificar('coisa estranha', CTX);
    expect(e.detalhe.codigo).toBe('—');
    expect(e.detalhe.mensagemOriginal).toBe('coisa estranha');
  });

  it('null e undefined não quebram a classificação', () => {
    expect(classificar(null, CTX).categoria).toBe('desconhecido');
    expect(classificar(undefined, CTX).categoria).toBe('desconhecido');
  });

  it('toda categoria tem título e explicação preenchidos', () => {
    const entradas: unknown[] = [
      new TypeError('Failed to fetch'),
      { code: '42501', message: 'rls' },
      { status: 401, message: 'jwt' },
      { code: 'nr13_conflito', message: 'x' },
      { code: 'P0001', message: 'nr13_versao_obsoleta: x' },
      { code: '23505', message: 'x' },
    ];
    for (const entrada of entradas) {
      const e = classificar(entrada, CTX);
      expect(e.titulo.length).toBeGreaterThan(0);
      expect(e.explicacao.length).toBeGreaterThan(0);
    }
  });
});
